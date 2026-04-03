import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  ArrowLeft, Upload, FileUp, FileText, X, Loader2, CheckCircle2, AlertCircle, Ban,
  Mail, RefreshCw, Play, Clock, Info, Settings, Inbox, MailWarning,
  FileWarning, RotateCcw, CheckCheck, ChevronDown, ExternalLink, Timer,
} from "lucide-react";
import { Search, SlidersHorizontal, CalendarRange, ChevronUp } from "lucide-react";
import { startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear, isWithinInterval, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

// ───── Types ─────

interface SyncErrorDetail {
  email_id: string;
  subject: string;
  sender: string;
  filename: string;
  error_type: string;
  error_class?: "temporary" | "structural" | "resolved" | string;
  error_message: string;
  auto_resolved: boolean;
  requires_action: string | null;
  timestamp: string;
}

interface EmailConfig {
  id: string;
  email_address: string;
  provider: string;
  gmail_refresh_token: string | null;
  monitored_folder: string;
  sender_filter: string;
  subject_filter: string;
  polling_interval_minutes: number;
  enabled: boolean;
  auto_sync_enabled: boolean;
  sync_interval_minutes: number;
  last_sync_at: string | null;
  last_sync_status: string;
  last_sync_message: string;
  last_sync_emails_found: number;
  last_sync_pdfs_imported: number;
  last_sync_errors: SyncErrorDetail[];
  updated_at: string;
}

const ORIGIN_OPTIONS = [
  { value: "client", label: "Cliente" },
  { value: "vendor", label: "Fornecedor" },
  { value: "partner", label: "Parceiro" },
  { value: "internal", label: "Interno" },
  { value: "historical", label: "Histórico" },
  { value: "email_inbox", label: "E-mail" },
  { value: "other", label: "Outro" },
];

type FileEntry = {
  file: File;
  id: string;
  status: "pending" | "uploading" | "success" | "duplicate" | "error";
  message?: string;
};

async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ───── Manual Upload Tab ─────

function ManualUploadTab() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<FileEntry[]>([]);
  const [origin, setOrigin] = useState("other");
  const [notes, setNotes] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    const valid: FileEntry[] = [];
    for (const file of arr) {
      if (file.type !== "application/pdf") {
        toast.error(`"${file.name}" não é um PDF e foi ignorado.`);
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`"${file.name}" excede 20 MB e foi ignorado.`);
        continue;
      }
      valid.push({ file, id: crypto.randomUUID(), status: "pending" });
    }
    if (valid.length > 0) {
      setFiles((prev) => [...prev, ...valid]);
      setShowSummary(false);
    }
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const updateFileStatus = (id: string, status: FileEntry["status"], message?: string) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, status, message } : f)));
  };

  const uploadAll = async () => {
    if (!user) return;
    setIsUploading(true);
    const pendingFiles = files.filter((f) => f.status === "pending");
    for (const entry of pendingFiles) {
      updateFileStatus(entry.id, "uploading");
      try {
        const fileHash = await computeFileHash(entry.file);
        const { data: existing } = await supabase
          .from("software_proposals").select("id, file_name").eq("file_hash", fileHash).maybeSingle();
        if (existing) { updateFileStatus(entry.id, "duplicate", `Duplicado de "${existing.file_name}"`); continue; }
        const filePath = `${user.id}/${fileHash}.pdf`;
        const { error: storageError } = await supabase.storage
          .from("software-proposal-pdfs").upload(filePath, entry.file, { upsert: false });
        if (storageError && !storageError.message?.includes("already exists")) throw new Error(storageError.message);
        const { error: insertError } = await supabase.from("software_proposals").insert({
          file_name: entry.file.name, file_url: filePath, file_hash: fileHash,
          origin, notes: notes.trim() || null, uploaded_by: user.id, status: "pending_extraction",
        });
        if (insertError) {
          await supabase.storage.from("software-proposal-pdfs").remove([filePath]);
          throw new Error(insertError.message);
        }
        updateFileStatus(entry.id, "success", "Importado com sucesso");
      } catch (err: any) {
        updateFileStatus(entry.id, "error", err.message || "Erro desconhecido");
      }
    }
    queryClient.invalidateQueries({ queryKey: ["software-proposals"] });
    setIsUploading(false);
    setShowSummary(true);
  };

  const counts = {
    total: files.length,
    pending: files.filter((f) => f.status === "pending").length,
    success: files.filter((f) => f.status === "success").length,
    duplicate: files.filter((f) => f.status === "duplicate").length,
    error: files.filter((f) => f.status === "error").length,
  };

  const statusIcon = (status: FileEntry["status"]) => {
    switch (status) {
      case "success": return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />;
      case "duplicate": return <Ban className="h-4 w-4 text-amber-500 shrink-0" />;
      case "error": return <AlertCircle className="h-4 w-4 text-destructive shrink-0" />;
      case "uploading": return <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />;
      default: return <FileText className="h-4 w-4 text-muted-foreground shrink-0" />;
    }
  };

  const statusLabel = (status: FileEntry["status"]) => {
    switch (status) {
      case "success": return <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50">Importado</Badge>;
      case "duplicate": return <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">Duplicado</Badge>;
      case "error": return <Badge variant="destructive">Erro</Badge>;
      case "uploading": return <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5">Enviando...</Badge>;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <FileUp className="h-4 w-4 text-primary" /> Arquivos PDF
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
            }`}
          >
            <Upload className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm font-medium text-foreground mb-1">Arraste e solte os PDFs aqui</p>
            <p className="text-xs text-muted-foreground">ou clique para selecionar — máximo 20 MB por arquivo</p>
            <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" multiple className="hidden"
              onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }} />
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">
                  {files.length} arquivo{files.length !== 1 ? "s" : ""} selecionado{files.length !== 1 ? "s" : ""}
                </p>
                {!isUploading && !showSummary && (
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setFiles([])}>Limpar tudo</Button>
                )}
              </div>
              <div className="divide-y divide-border rounded-lg border border-border">
                {files.map((entry) => (
                  <div key={entry.id} className="flex items-center gap-3 px-3 py-2.5">
                    {statusIcon(entry.status)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{entry.file.name}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{formatFileSize(entry.file.size)}</span>
                        {entry.message && <span className="text-xs text-muted-foreground truncate">— {entry.message}</span>}
                      </div>
                    </div>
                    {statusLabel(entry.status)}
                    {entry.status === "pending" && !isUploading && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeFile(entry.id)}><X className="h-3.5 w-3.5" /></Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Origin + Notes */}
      <Card>
        <CardHeader><CardTitle className="text-base font-medium">Informações adicionais</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Origem da proposta</Label>
            <Select value={origin} onValueChange={setOrigin}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ORIGIN_OPTIONS.map((opt) => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Observações (opcional)</Label>
            <Textarea placeholder="Informações adicionais..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      {showSummary && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <h3 className="text-sm font-semibold text-foreground mb-3">Resumo da importação</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">Total:</span><span className="font-medium">{counts.total}</span>
              <span className="text-muted-foreground">Importados:</span><span className="font-medium text-emerald-600">{counts.success}</span>
              {counts.duplicate > 0 && (<><span className="text-muted-foreground">Duplicados:</span><span className="font-medium text-amber-600">{counts.duplicate}</span></>)}
              {counts.error > 0 && (<><span className="text-muted-foreground">Falhas:</span><span className="font-medium text-destructive">{counts.error}</span></>)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3">
        {showSummary ? (
          <Button onClick={() => { setFiles([]); setShowSummary(false); setNotes(""); }} variant="outline">Nova importação</Button>
        ) : (
          <Button onClick={uploadAll} disabled={counts.pending === 0 || isUploading} className="gap-2">
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {isUploading ? "Importando..." : `Importar ${counts.pending} arquivo${counts.pending !== 1 ? "s" : ""}`}
          </Button>
        )}
      </div>
    </div>
  );
}

// ───── Email Sync Tab ─────

interface EmailImportAttempt {
  id: string;
  gmail_message_id: string;
  subject: string | null;
  sender: string | null;
  received_at: string | null;
  status: string;
  error_type: string | null;
  error_message: string | null;
  requires_action: string | null;
  retry_count: number;
  last_attempt_at: string | null;
  resolved_at: string | null;
  attachment_filename: string | null;
  attachment_count: number;
  software_proposal_id: string | null;
  created_at: string;
}

function EmailSyncTab() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);

  // Pending list filters
  const [pendingSearch, setPendingSearch] = useState("");
  const [pendingStatusFilter, setPendingStatusFilter] = useState<string[]>([]);
  const [pendingPeriod, setPendingPeriod] = useState<string>("");
  const [pendingCustomStart, setPendingCustomStart] = useState("");
  const [pendingCustomEnd, setPendingCustomEnd] = useState("");
  const [pendingFiltersOpen, setPendingFiltersOpen] = useState(false);

  const { data: emailConfig, isLoading } = useQuery({
    queryKey: ["email-inbox-config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("email_inbox_config" as any).select("*").limit(1).single();
      if (error) return null;
      return data as unknown as EmailConfig;
    },
    refetchInterval: (query) => {
      const cfg = query.state.data as EmailConfig | null;
      return cfg?.auto_sync_enabled ? 60_000 : false;
    },
  });

  const { data: pendingAttempts } = useQuery({
    queryKey: ["email-import-attempts-pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_import_attempts" as any)
        .select("*")
        .in("status", ["failed", "pending"])
        .order("last_attempt_at", { ascending: false });
      if (error) return [];
      return (data || []) as unknown as EmailImportAttempt[];
    },
    refetchInterval: emailConfig?.auto_sync_enabled ? 60_000 : false,
  });

  const hasGmailAuthorized = !!emailConfig?.gmail_refresh_token;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["email-inbox-config"] });
    queryClient.invalidateQueries({ queryKey: ["software-proposals"] });
    queryClient.invalidateQueries({ queryKey: ["email-import-history"] });
    queryClient.invalidateQueries({ queryKey: ["email-import-attempts-pending"] });
    queryClient.invalidateQueries({ queryKey: ["email-import-attempts-all"] });
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("email-inbox-sync", { body: { action: "sync" } });
      if (error) throw error;
      invalidateAll();
      if (data.success) {
        toast.success(`${data.pdfs_imported || 0} PDF(s) importado(s) de ${data.emails_found || 0} e-mail(s).`);
      } else {
        toast.error(data.error || "Erro na sincronização");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro na sincronização");
    } finally {
      setSyncing(false);
    }
  };

  const handleRetry = async (attemptId: string) => {
    setRetrying(attemptId);
    try {
      const { data, error } = await supabase.functions.invoke("email-inbox-sync", {
        body: { action: "retry", attempt_ids: [attemptId] },
      });
      if (error) throw error;
      invalidateAll();
      if (data.pdfs_imported > 0) {
        toast.success(`${data.pdfs_imported} PDF(s) importado(s) com sucesso!`);
      } else {
        toast.warning(data.message || "Reprocessamento concluído sem novos PDFs.");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro no reprocessamento");
    } finally {
      setRetrying(null);
    }
  };

  const handleRetryAll = async () => {
    if (!pendingAttempts || pendingAttempts.length === 0) return;
    setSyncing(true);
    try {
      const ids = pendingAttempts.map(a => a.id);
      const { data, error } = await supabase.functions.invoke("email-inbox-sync", {
        body: { action: "retry", attempt_ids: ids },
      });
      if (error) throw error;
      invalidateAll();
      toast.success(data.message || "Reprocessamento concluído.");
    } catch (err: any) {
      toast.error(err.message || "Erro no reprocessamento");
    } finally {
      setSyncing(false);
    }
  };

  // Pending list filtering logic
  const PENDING_ERROR_TYPE_OPTIONS = [
    { value: "download_failed", label: "Download" },
    { value: "upload_failed", label: "Upload" },
    { value: "insert_failed", label: "Registro" },
    { value: "config_failed", label: "Configuração" },
  ];

  const pendingPeriodRange = useMemo(() => {
    const now = new Date();
    switch (pendingPeriod) {
      case "este_mes": return { start: startOfMonth(now), end: endOfMonth(now) };
      case "ultimo_mes": { const prev = subMonths(now, 1); return { start: startOfMonth(prev), end: endOfMonth(prev) }; }
      case "este_trimestre": return { start: startOfQuarter(now), end: endOfQuarter(now) };
      case "este_ano": return { start: startOfYear(now), end: endOfYear(now) };
      case "personalizado": {
        if (pendingCustomStart && pendingCustomEnd) return { start: parseISO(pendingCustomStart), end: parseISO(pendingCustomEnd) };
        return null;
      }
      default: return null;
    }
  }, [pendingPeriod, pendingCustomStart, pendingCustomEnd]);

  const filteredPending = useMemo(() => {
    if (!pendingAttempts) return [];
    return pendingAttempts.filter((a) => {
      if (pendingStatusFilter.length > 0 && !pendingStatusFilter.includes(a.error_type || "")) return false;
      if (pendingSearch.trim()) {
        const term = pendingSearch.toLowerCase();
        const matches =
          (a.attachment_filename || "").toLowerCase().includes(term) ||
          (a.subject || "").toLowerCase().includes(term) ||
          (a.sender || "").toLowerCase().includes(term) ||
          (a.error_message || "").toLowerCase().includes(term);
        if (!matches) return false;
      }
      if (pendingPeriodRange) {
        try {
          const d = parseISO(a.created_at);
          if (!isWithinInterval(d, { start: pendingPeriodRange.start, end: pendingPeriodRange.end })) return false;
        } catch { return false; }
      }
      return true;
    });
  }, [pendingAttempts, pendingStatusFilter, pendingSearch, pendingPeriodRange]);

  const pendingActiveFilterCount =
    (pendingStatusFilter.length > 0 ? 1 : 0) +
    (pendingPeriod ? 1 : 0);

  if (isLoading) {
    return <div className="flex items-center justify-center p-8"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const config = emailConfig;

  const errorTypeLabel = (type: string | null) => {
    switch (type) {
      case "download_failed": return "Download";
      case "upload_failed": return "Upload";
      case "config_failed": return "Configuração";
      case "insert_failed": return "Registro";
      default: return "Outro";
    }
  };

  return (
    <div className="space-y-6">
      {/* Gmail not authorized inline warning */}
      {!hasGmailAuthorized && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-50 p-4 dark:bg-amber-900/20">
          <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600 shrink-0" />
          <div className="space-y-2">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Conta Gmail não autorizada</p>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Configure e autorize a conta Gmail nas configurações de e-mail para habilitar a importação automática.
            </p>
            <Button variant="outline" size="sm" onClick={() => navigate("/configuracoes/email-inbox")} className="mt-1">
              <Settings className="mr-2 h-3.5 w-3.5" /> Ir para Configurações
            </Button>
          </div>
        </div>
      )}

      {/* Sync health alert when last sync had errors */}
      {config?.last_sync_status === "error" && config?.auto_sync_enabled && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-50 p-4 dark:bg-amber-900/20">
          <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600 shrink-0" />
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              Última sincronização automática falhou
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {config.last_sync_message || "Verifique a conexão Gmail e tente sincronizar manualmente."}
            </p>
            {config.last_sync_at && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                Última tentativa: {new Date(config.last_sync_at).toLocaleString("pt-BR")}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Sync action + last status */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Sincronizar Agora</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Busca e-mails não lidos com PDFs anexados e importa como propostas de software.
            </p>
            <Button onClick={handleSync} disabled={syncing || !hasGmailAuthorized} className="w-full gap-2">
              {syncing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {syncing ? "Sincronizando..." : "Executar Sincronização"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" /> Última Sincronização
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {config?.last_sync_at ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Data/Hora</span>
                  <span className="font-medium">{new Date(config.last_sync_at).toLocaleString("pt-BR")}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={config.last_sync_status === "success" ? "default" : config.last_sync_status === "partial" ? "secondary" : "destructive"}>
                    {config.last_sync_status === "success" ? "Sucesso" : config.last_sync_status === "partial" ? "Parcial" : config.last_sync_status === "error" ? "Erro" : config.last_sync_status || "—"}
                  </Badge>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">E-mails lidos</span>
                  <span>{config.last_sync_emails_found ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">PDFs importados</span>
                  <span>{config.last_sync_pdfs_imported ?? 0}</span>
                </div>
                {config.last_sync_message && (
                  <p className="text-xs text-muted-foreground pt-1">{config.last_sync_message}</p>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Info className="h-4 w-4" />
                <span>Nenhuma sincronização realizada.</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pending / Failed Attempts — Standardized */}
      {pendingAttempts && pendingAttempts.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MailWarning className="h-5 w-5 text-destructive" />
              <h2 className="text-lg font-semibold text-foreground">Pendências de Importação</h2>
              <Badge variant="destructive">{pendingAttempts.length}</Badge>
            </div>
            <Button variant="outline" size="sm" onClick={handleRetryAll} disabled={syncing}>
              <RotateCcw className="mr-2 h-3.5 w-3.5" /> Reprocessar Todos
            </Button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">Total</p>
              <p className="text-2xl font-bold">{filteredPending.length}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">Download</p>
              <p className="text-2xl font-bold text-destructive">{filteredPending.filter(a => a.error_type === "download_failed").length}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">Registro</p>
              <p className="text-2xl font-bold text-destructive">{filteredPending.filter(a => a.error_type === "insert_failed").length}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">Outros</p>
              <p className="text-2xl font-bold text-muted-foreground">{filteredPending.filter(a => !["download_failed", "insert_failed"].includes(a.error_type || "")).length}</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por arquivo, assunto, remetente ou erro..."
              value={pendingSearch}
              onChange={(e) => setPendingSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Collapsible Filter Bar */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <button
              onClick={() => setPendingFiltersOpen(!pendingFiltersOpen)}
              className="flex w-full items-center gap-3 bg-accent/30 px-4 py-2.5 transition-colors hover:bg-accent/50"
            >
              <div className="flex items-center gap-2 text-muted-foreground">
                <SlidersHorizontal className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Filtros</span>
              </div>
              {pendingActiveFilterCount > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {pendingActiveFilterCount}
                </span>
              )}
              <div className="flex-1" />
              {pendingActiveFilterCount > 0 && (
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingStatusFilter([]);
                    setPendingPeriod("");
                    setPendingCustomStart("");
                    setPendingCustomEnd("");
                  }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="h-3 w-3" />
                  Limpar tudo
                </span>
              )}
              {pendingFiltersOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {pendingFiltersOpen && (
              <div className="flex flex-col gap-4 p-4 sm:flex-row sm:flex-wrap sm:items-start">
                {/* Period */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <CalendarRange className="h-3.5 w-3.5" />
                    <span className="text-[11px] font-medium uppercase tracking-wider">Período</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {([
                      { key: "este_mes", label: "Este mês" },
                      { key: "ultimo_mes", label: "Último mês" },
                      { key: "este_trimestre", label: "Este trimestre" },
                      { key: "este_ano", label: "Este ano" },
                      { key: "personalizado", label: "Personalizado" },
                    ] as const).map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setPendingPeriod(pendingPeriod === key ? "" : key)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                          pendingPeriod === key
                            ? "border-primary bg-primary text-primary-foreground shadow-sm"
                            : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {pendingPeriod === "personalizado" && (
                    <div className="flex items-center gap-2 pt-1">
                      <Input type="date" value={pendingCustomStart} onChange={(e) => setPendingCustomStart(e.target.value)} className="h-8 w-36 text-xs" />
                      <span className="text-xs text-muted-foreground">até</span>
                      <Input type="date" value={pendingCustomEnd} onChange={(e) => setPendingCustomEnd(e.target.value)} className="h-8 w-36 text-xs" />
                    </div>
                  )}
                </div>

                <div className="hidden h-16 w-px self-center bg-border sm:block" />

                {/* Error type */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <FileWarning className="h-3.5 w-3.5" />
                    <span className="text-[11px] font-medium uppercase tracking-wider">Tipo de Erro</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PENDING_ERROR_TYPE_OPTIONS.map(({ value, label }) => {
                      const active = pendingStatusFilter.includes(value);
                      return (
                        <button
                          key={value}
                          onClick={() =>
                            setPendingStatusFilter((prev) =>
                              active ? prev.filter((s) => s !== value) : [...prev, value]
                            )
                          }
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                            active
                              ? "border-primary bg-primary text-primary-foreground shadow-sm"
                              : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Table */}
          {filteredPending.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Search className="h-8 w-8 mb-3 opacity-40" />
              <p className="text-sm font-medium">Nenhuma pendência corresponde aos filtros</p>
              <p className="text-xs mt-1">Ajuste os filtros ou limpe a busca para ver mais resultados.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Arquivo</TableHead>
                      <TableHead>Assunto</TableHead>
                      <TableHead>Remetente</TableHead>
                      <TableHead>Tipo de Erro</TableHead>
                      <TableHead>Detalhe</TableHead>
                      <TableHead className="text-center">Tentativas</TableHead>
                      <TableHead>Última Tentativa</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPending.map((attempt) => (
                      <TableRow key={attempt.id}>
                        <TableCell className="text-sm font-medium max-w-[150px] truncate" title={attempt.attachment_filename || ""}>
                          {attempt.attachment_filename || "—"}
                        </TableCell>
                        <TableCell className="text-sm max-w-[180px] truncate" title={attempt.subject || ""}>
                          {attempt.subject || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[130px] truncate" title={attempt.sender || ""}>
                          {attempt.sender || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="destructive" className="text-[10px]">
                            {errorTypeLabel(attempt.error_type)}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <p className="text-[11px] text-muted-foreground line-clamp-2">{attempt.error_message || "—"}</p>
                          {attempt.requires_action && (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                              <Info className="h-3 w-3 shrink-0" />
                              {attempt.requires_action}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-sm">{attempt.retry_count + 1}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {attempt.last_attempt_at ? new Date(attempt.last_attempt_at).toLocaleString("pt-BR") : "—"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            disabled={retrying === attempt.id || syncing}
                            onClick={() => handleRetry(attempt.id)}
                          >
                            {retrying === attempt.id ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" />
                            )}
                            Tentar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ───── Email History Tab ─────

function EmailHistoryTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [periodFilter, setPeriodFilter] = useState<string>("este_ano");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { data: allAttempts, isLoading } = useQuery({
    queryKey: ["email-import-attempts-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_import_attempts" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return [];
      return (data || []) as unknown as EmailImportAttempt[];
    },
  });

  const navigate = useNavigate();

  const HISTORY_STATUS_OPTIONS = [
    { value: "success", label: "Importados" },
    { value: "failed", label: "Falhas" },
    { value: "duplicate", label: "Duplicados" },
    { value: "skipped", label: "Sem PDF" },
    { value: "pending", label: "Pendentes" },
  ];

  const periodRange = useMemo(() => {
    const now = new Date();
    switch (periodFilter) {
      case "este_mes": return { start: startOfMonth(now), end: endOfMonth(now) };
      case "ultimo_mes": { const prev = subMonths(now, 1); return { start: startOfMonth(prev), end: endOfMonth(prev) }; }
      case "este_trimestre": return { start: startOfQuarter(now), end: endOfQuarter(now) };
      case "este_ano": return { start: startOfYear(now), end: endOfYear(now) };
      case "personalizado": {
        if (customStart && customEnd) return { start: parseISO(customStart), end: parseISO(customEnd) };
        return null;
      }
      default: return null;
    }
  }, [periodFilter, customStart, customEnd]);

  const filteredAttempts = useMemo(() => {
    if (!allAttempts) return [];
    return allAttempts.filter((a) => {
      if (statusFilter.length > 0 && !statusFilter.includes(a.status)) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matches =
          (a.attachment_filename || "").toLowerCase().includes(term) ||
          (a.subject || "").toLowerCase().includes(term) ||
          (a.sender || "").toLowerCase().includes(term) ||
          (a.error_message || "").toLowerCase().includes(term);
        if (!matches) return false;
      }
      if (periodRange) {
        try {
          const d = parseISO(a.created_at);
          if (!isWithinInterval(d, { start: periodRange.start, end: periodRange.end })) return false;
        } catch { return false; }
      }
      return true;
    });
  }, [allAttempts, statusFilter, searchTerm, periodRange]);

  const statusLabel = (status: string) => {
    switch (status) {
      case "success": return <Badge className="bg-emerald-600 text-[10px]">Importado</Badge>;
      case "failed": return <Badge variant="destructive" className="text-[10px]">Falha</Badge>;
      case "duplicate": return <Badge variant="outline" className="text-[10px]">Duplicado</Badge>;
      case "skipped": return <Badge variant="secondary" className="text-[10px]">Sem PDF</Badge>;
      case "pending": return <Badge variant="secondary" className="text-[10px]">Pendente</Badge>;
      default: return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!allAttempts || allAttempts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Inbox className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm font-medium">Nenhuma tentativa de importação registrada</p>
        <p className="text-xs mt-1">As tentativas de importação de e-mails aparecerão aqui após a sincronização.</p>
      </div>
    );
  }

  const successCount = filteredAttempts.filter(a => a.status === "success").length;
  const failedCount = filteredAttempts.filter(a => a.status === "failed" || a.status === "pending").length;
  const dupCount = filteredAttempts.filter(a => a.status === "duplicate").length;

  const activeFilterCount =
    (statusFilter.length > 0 ? 1 : 0) +
    (periodFilter && periodFilter !== "este_ano" ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Total</p>
          <p className="text-2xl font-bold">{filteredAttempts.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Importados</p>
          <p className="text-2xl font-bold text-success">{successCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Falhas</p>
          <p className="text-2xl font-bold text-destructive">{failedCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Duplicados</p>
          <p className="text-2xl font-bold text-muted-foreground">{dupCount}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por arquivo, assunto, remetente ou erro..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Collapsible Filter Bar */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="flex w-full items-center gap-3 bg-accent/30 px-4 py-2.5 transition-colors hover:bg-accent/50"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <SlidersHorizontal className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Filtros</span>
          </div>
          {activeFilterCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
          <div className="flex-1" />
          {activeFilterCount > 0 && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                setStatusFilter([]);
                setPeriodFilter("este_ano");
                setCustomStart("");
                setCustomEnd("");
              }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <X className="h-3 w-3" />
              Limpar tudo
            </span>
          )}
          {filtersOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {filtersOpen && (
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:flex-wrap sm:items-start">
            {/* Period */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <CalendarRange className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium uppercase tracking-wider">Período</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {([
                  { key: "este_mes", label: "Este mês" },
                  { key: "ultimo_mes", label: "Último mês" },
                  { key: "este_trimestre", label: "Este trimestre" },
                  { key: "este_ano", label: "Este ano" },
                  { key: "personalizado", label: "Personalizado" },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setPeriodFilter(periodFilter === key && key !== "este_ano" ? "" : key)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      periodFilter === key
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {periodFilter === "personalizado" && (
                <div className="flex items-center gap-2 pt-1">
                  <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-8 w-36 text-xs" />
                  <span className="text-xs text-muted-foreground">até</span>
                  <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-8 w-36 text-xs" />
                </div>
              )}
            </div>

            <div className="hidden h-16 w-px self-center bg-border sm:block" />

            {/* Status */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium uppercase tracking-wider">Status</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {HISTORY_STATUS_OPTIONS.map(({ value, label }) => {
                  const active = statusFilter.includes(value);
                  return (
                    <button
                      key={value}
                      onClick={() =>
                        setStatusFilter((prev) =>
                          active ? prev.filter((s) => s !== value) : [...prev, value]
                        )
                      }
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                        active
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      {filteredAttempts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Search className="h-8 w-8 mb-3 opacity-40" />
          <p className="text-sm font-medium">Nenhuma tentativa corresponde aos filtros</p>
          <p className="text-xs mt-1">Ajuste os filtros ou limpe a busca para ver mais resultados.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Assunto</TableHead>
                  <TableHead>Remetente</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Tentativas</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Detalhe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAttempts.map((attempt) => (
                  <TableRow
                    key={attempt.id}
                    className={attempt.software_proposal_id ? "cursor-pointer hover:bg-muted/50" : ""}
                    onClick={() => attempt.software_proposal_id && navigate(`/propostas-software/${attempt.software_proposal_id}`)}
                  >
                    <TableCell className="text-sm font-medium max-w-[150px] truncate" title={attempt.attachment_filename || ""}>
                      {attempt.attachment_filename || "—"}
                    </TableCell>
                    <TableCell className="text-sm max-w-[180px] truncate" title={attempt.subject || ""}>
                      {attempt.subject || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[130px] truncate" title={attempt.sender || ""}>
                      {attempt.sender || "—"}
                    </TableCell>
                    <TableCell>{statusLabel(attempt.status)}</TableCell>
                    <TableCell className="text-center text-sm">{attempt.retry_count + 1}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(attempt.created_at).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate" title={attempt.error_message || ""}>
                      {attempt.error_message || (attempt.status === "success" ? "OK" : "—")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

// ───── Main Page ─────

export default function SoftwareProposalUploadPage() {
  const navigate = useNavigate();

  const { data: pendingCount } = useQuery({
    queryKey: ["email-import-pending-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("email_import_attempts" as any)
        .select("id", { count: "exact", head: true })
        .in("status", ["failed", "pending"]);
      if (error) return 0;
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/propostas-software")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Central de Importação</h1>
            <p className="text-sm text-muted-foreground">
              Importe propostas de software via upload manual ou leitura automática de e-mails
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="history" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="history" className="gap-2">
            <Inbox className="h-4 w-4" /> Histórico de E-mails
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-2 relative">
            <Mail className="h-4 w-4" /> Importar por E-mail
            {(pendingCount ?? 0) > 0 && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-medium text-destructive-foreground">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="manual" className="gap-2">
            <Upload className="h-4 w-4" /> Upload Manual
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-6">
          <EmailHistoryTab />
        </TabsContent>
        <TabsContent value="email" className="mt-6">
          <EmailSyncTab />
        </TabsContent>
        <TabsContent value="manual" className="mt-6">
          <ManualUploadTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
