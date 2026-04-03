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

// ───── Types ─────

interface SyncErrorDetail {
  email_id: string;
  subject: string;
  sender: string;
  filename: string;
  error_type: string;
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

  const { data: emailConfig, isLoading } = useQuery({
    queryKey: ["email-inbox-config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("email_inbox_config" as any).select("*").limit(1).single();
      if (error) return null;
      return data as unknown as EmailConfig;
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

  if (isLoading) {
    return <div className="flex items-center justify-center p-8"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const config = emailConfig;

  return (
    <div className="space-y-6">
      {/* Connection status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" /> Status da Conexão Gmail
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasGmailAuthorized ? (
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
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                <div>
                  <p className="font-medium">Conta conectada</p>
                  {config?.email_address && <p className="text-xs opacity-80">{config.email_address}</p>}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate("/configuracoes/email-inbox")}>
                <Settings className="mr-2 h-3.5 w-3.5" /> Configurações
              </Button>
            </div>
          )}

          {hasGmailAuthorized && config && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-muted-foreground">
              {config.monitored_folder && (
                <div><span className="font-medium text-foreground">Pasta:</span> {config.monitored_folder}</div>
              )}
              {config.sender_filter && (
                <div><span className="font-medium text-foreground">Remetente:</span> {config.sender_filter}</div>
              )}
              {config.subject_filter && (
                <div><span className="font-medium text-foreground">Assunto:</span> {config.subject_filter}</div>
              )}
              <div>
                <span className="font-medium text-foreground">Status:</span>{" "}
                <Badge variant={config.enabled ? "default" : "secondary"} className="text-[10px] ml-1">
                  {config.enabled ? "Ativo" : "Inativo"}
                </Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync action + auto-sync + last status */}
      <div className="grid gap-6 lg:grid-cols-3">
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
              <Timer className="h-4 w-4" /> Sincronização Automática
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="auto-sync-toggle" className="text-sm">Ativar polling automático</Label>
              <Switch
                id="auto-sync-toggle"
                checked={config?.auto_sync_enabled ?? false}
                disabled={!hasGmailAuthorized}
                onCheckedChange={async (checked) => {
                  const { error } = await supabase
                    .from("email_inbox_config")
                    .update({ auto_sync_enabled: checked, updated_at: new Date().toISOString() } as any)
                    .eq("id", config!.id);
                  if (error) {
                    toast.error("Erro ao atualizar configuração");
                  } else {
                    toast.success(checked ? "Sincronização automática ativada" : "Sincronização automática desativada");
                    queryClient.invalidateQueries({ queryKey: ["email-inbox-config"] });
                  }
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Intervalo (minutos)</Label>
              <Select
                value={String(config?.sync_interval_minutes ?? 10)}
                disabled={!hasGmailAuthorized}
                onValueChange={async (val) => {
                  const { error } = await supabase
                    .from("email_inbox_config")
                    .update({ sync_interval_minutes: parseInt(val), updated_at: new Date().toISOString() } as any)
                    .eq("id", config!.id);
                  if (error) {
                    toast.error("Erro ao atualizar intervalo");
                  } else {
                    toast.success(`Intervalo atualizado para ${val} minutos`);
                    queryClient.invalidateQueries({ queryKey: ["email-inbox-config"] });
                  }
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 min</SelectItem>
                  <SelectItem value="10">10 min</SelectItem>
                  <SelectItem value="15">15 min</SelectItem>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="60">60 min</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {config?.auto_sync_enabled && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-500" />
                Verificando novos e-mails a cada {config.sync_interval_minutes} min
              </p>
            )}
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

      {/* Pending / Failed Attempts */}
      {pendingAttempts && pendingAttempts.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <MailWarning className="h-4 w-4 text-destructive" />
                Pendências de Importação
                <Badge variant="destructive" className="ml-2">{pendingAttempts.length}</Badge>
              </CardTitle>
              <Button variant="outline" size="sm" onClick={handleRetryAll} disabled={syncing}>
                <RotateCcw className="mr-2 h-3.5 w-3.5" /> Reprocessar Todos
              </Button>
            </div>
            <CardDescription>E-mails que não foram importados com sucesso. Reprocesse individualmente ou todos de uma vez.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Assunto do E-mail</TableHead>
                    <TableHead>Remetente</TableHead>
                    <TableHead>Erro</TableHead>
                    <TableHead className="text-center">Tentativas</TableHead>
                    <TableHead>Última Tentativa</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingAttempts.map((attempt) => (
                    <TableRow key={attempt.id}>
                      <TableCell className="text-sm font-medium max-w-[150px] truncate" title={attempt.attachment_filename || ""}>
                        {attempt.attachment_filename || "—"}
                      </TableCell>
                      <TableCell className="text-sm max-w-[180px] truncate" title={attempt.subject || ""}>
                        {attempt.subject || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate" title={attempt.sender || ""}>
                        {attempt.sender || "—"}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge variant="destructive" className="text-[10px]">
                            {attempt.error_type === "download_failed" ? "Download" : attempt.error_type === "upload_failed" ? "Upload" : attempt.error_type === "insert_failed" ? "Registro" : "Outro"}
                          </Badge>
                          <p className="text-[11px] text-muted-foreground line-clamp-2">{attempt.error_message}</p>
                          {attempt.requires_action && (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                              <Info className="h-3 w-3 shrink-0" />
                              {attempt.requires_action}
                            </p>
                          )}
                        </div>
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ───── Email History Tab ─────

function EmailHistoryTab() {
  const { data: allAttempts, isLoading } = useQuery({
    queryKey: ["email-import-attempts-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_import_attempts" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) return [];
      return (data || []) as unknown as EmailImportAttempt[];
    },
  });

  const navigate = useNavigate();

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
    return <div className="flex items-center justify-center p-8"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!allAttempts || allAttempts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Inbox className="h-10 w-10 mb-3 opacity-40" />
          <p className="text-sm font-medium">Nenhuma tentativa de importação registrada</p>
          <p className="text-xs mt-1">As tentativas de importação de e-mails aparecerão aqui após a sincronização.</p>
        </CardContent>
      </Card>
    );
  }

  const successCount = allAttempts.filter(a => a.status === "success").length;
  const failedCount = allAttempts.filter(a => a.status === "failed" || a.status === "pending").length;
  const dupCount = allAttempts.filter(a => a.status === "duplicate").length;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="text-lg font-bold">{allAttempts.length}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-emerald-600">Importados</div>
          <div className="text-lg font-bold text-emerald-600">{successCount}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-destructive">Falhas</div>
          <div className="text-lg font-bold text-destructive">{failedCount}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Duplicados</div>
          <div className="text-lg font-bold">{dupCount}</div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Inbox className="h-4 w-4" /> Histórico de Importação por E-mail
          </CardTitle>
          <CardDescription>Todas as tentativas de importação, com rastreabilidade completa.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
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
                {allAttempts.map((attempt) => (
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
        </CardContent>
      </Card>
    </div>
  );
}

// ───── Main Page ─────

export default function SoftwareProposalUploadPage() {
  const navigate = useNavigate();

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

      <Tabs defaultValue="manual" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="manual" className="gap-2">
            <Upload className="h-4 w-4" /> Upload Manual
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-2">
            <Mail className="h-4 w-4" /> Importação por E-mail
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <Inbox className="h-4 w-4" /> Histórico de E-mails
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="mt-6">
          <ManualUploadTab />
        </TabsContent>
        <TabsContent value="email" className="mt-6">
          <EmailSyncTab />
        </TabsContent>
        <TabsContent value="history" className="mt-6">
          <EmailHistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
