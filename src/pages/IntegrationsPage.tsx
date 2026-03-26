import React, { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { ArrowLeft, Plus, Trash2, HelpCircle, RefreshCw, Play, Pencil, CheckCircle2, XCircle, Clock, Users, FileText, Settings2, Loader2, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";

const SYSTEM_FIELDS = [
  { value: "code", label: "code", desc: "Código do cliente (obrigatório)" },
  { value: "name", label: "name", desc: "Razão Social (obrigatório)" },
  { value: "cnpj", label: "cnpj", desc: "CNPJ (obrigatório)" },
  { value: "store_code", label: "store_code", desc: "Código da Loja (Protheus A1_LOJA)" },
  { value: "contact", label: "contact", desc: "Nome do contato" },
  { value: "email", label: "email", desc: "E-mail" },
  { value: "phone", label: "phone", desc: "Telefone" },
  { value: "address", label: "address", desc: "Endereço" },
  { value: "state_registration", label: "state_registration", desc: "Inscrição Estadual" },
];

const DEFAULT_MAPPING = [
  { api_field: "A1_COD", system_field: "code" },
  { api_field: "A1_LOJA", system_field: "store_code" },
  { api_field: "A1_NOME", system_field: "name" },
  { api_field: "A1_CGC", system_field: "cnpj" },
  { api_field: "A1_CONTATO", system_field: "contact" },
  { api_field: "A1_TEL", system_field: "phone" },
  { api_field: "A1_END", system_field: "address" },
  { api_field: "A1_EST", system_field: "state_registration" },
];

const WEEKDAYS = [
  { value: "mon", label: "Seg" },
  { value: "tue", label: "Ter" },
  { value: "wed", label: "Qua" },
  { value: "thu", label: "Qui" },
  { value: "fri", label: "Sex" },
  { value: "sat", label: "Sáb" },
  { value: "sun", label: "Dom" },
];

const HEARTBEAT_STALE_MS = 5 * 60 * 1000;

interface MappingRow { api_field: string; system_field: string; }

interface IntegrationForm {
  label: string;
  endpoint_url: string;
  http_method: string;
  auth_type: string;
  auth_value: string;
  headers: string;
  body_template: string;
  field_mapping: MappingRow[];
  schedule_enabled: boolean;
  schedule_days: string[];
  schedule_time: string;
  pagination_enabled: boolean;
  pagination_page_size: number;
  pagination_param_offset: string;
  pagination_param_limit: string;
  pagination_order_by: string;
}

const emptyForm: IntegrationForm = {
  label: "Clientes Protheus",
  endpoint_url: "",
  http_method: "GET",
  auth_type: "none",
  auth_value: "",
  headers: "",
  body_template: "",
  field_mapping: [...DEFAULT_MAPPING],
  schedule_enabled: false,
  schedule_days: [],
  schedule_time: "06:00",
  pagination_enabled: false,
  pagination_page_size: 100,
  pagination_param_offset: "offset",
  pagination_param_limit: "limit",
  pagination_order_by: "",
};

function getEffectiveStatus(log: any): string {
  if (log.status !== "running") return log.status;
  const heartbeat = log.heartbeat_at ? new Date(log.heartbeat_at).getTime() : new Date(log.started_at).getTime();
  if (Date.now() - heartbeat > HEARTBEAT_STALE_MS) return "timeout";
  return "running";
}

function statusLabel(status: string): string {
  switch (status) {
    case "running": return "Em andamento...";
    case "success": return "Concluída!";
    case "error": return "Erro";
    case "timeout": return "Interrompida (Timeout)";
    default: return status;
  }
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "success": return <Badge className="bg-success/10 text-success text-[10px]">Sucesso</Badge>;
    case "error": return <Badge variant="destructive" className="text-[10px]">Erro</Badge>;
    case "timeout": return <Badge className="bg-warning/10 text-warning text-[10px]">Timeout</Badge>;
    case "running": return <Badge variant="secondary" className="text-[10px]">Executando</Badge>;
    default: return <Badge variant="secondary" className="text-[10px]">{status}</Badge>;
  }
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "running": return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    case "success": return <CheckCircle2 className="h-4 w-4 text-success" />;
    case "timeout": return <AlertTriangle className="h-4 w-4 text-warning" />;
    default: return <XCircle className="h-4 w-4 text-destructive" />;
  }
}

export default function IntegrationsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<IntegrationForm>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<any[] | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  // Sync progress
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [activeSyncLogId, setActiveSyncLogId] = useState<string | null>(null);
  const [syncLog, setSyncLog] = useState<any>(null);
  const [syncIntegrationId, setSyncIntegrationId] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Logs viewer
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);
  const [logsIntegrationId, setLogsIntegrationId] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [logEvents, setLogEvents] = useState<any[]>([]);

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ["api_integrations", "clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_integrations")
        .select("*")
        .eq("entity", "clients")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const clientsIntegration = integrations.length > 0 ? integrations[0] : null;

  const { data: logs = [], refetch: refetchLogs } = useQuery({
    queryKey: ["sync_logs", logsIntegrationId],
    enabled: !!logsIntegrationId && logsDialogOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_logs")
        .select("*")
        .eq("integration_id", logsIntegrationId!)
        .order("started_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  // Polling for sync progress
  useEffect(() => {
    const integrationId = syncIntegrationId;
    if (!integrationId || !syncDialogOpen) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    let stopped = false;
    const poll = async () => {
      let data: any = null;
      if (activeSyncLogId) {
        const res = await supabase.from("sync_logs").select("*").eq("id", activeSyncLogId).single();
        data = res.data;
      } else {
        const res = await supabase
          .from("sync_logs")
          .select("*")
          .eq("integration_id", integrationId)
          .order("started_at", { ascending: false })
          .limit(1)
          .single();
        data = res.data;
        if (data) setActiveSyncLogId(data.id);
      }
      if (data) {
        setSyncLog(data);
        const effectiveStatus = getEffectiveStatus(data);
        if (effectiveStatus !== "running" && !stopped) {
          stopped = true;
          if (pollingRef.current) clearInterval(pollingRef.current);
          queryClient.invalidateQueries({ queryKey: ["api_integrations"] });
          queryClient.invalidateQueries({ queryKey: ["clients"] });
          queryClient.invalidateQueries({ queryKey: ["sync_logs"] });
        }
      }
    };

    const timeout = setTimeout(() => {
      poll();
      pollingRef.current = setInterval(poll, 2000);
    }, 1000);
    return () => {
      clearTimeout(timeout);
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [syncIntegrationId, syncDialogOpen, activeSyncLogId]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setTestResult(null);
    setDialogOpen(true);
  }

  function openEdit(item: any) {
    const mapping = item.field_mapping as Record<string, string>;
    const days = Array.isArray(item.schedule_days) ? item.schedule_days : [];
    setEditingId(item.id);
    setForm({
      label: item.label,
      endpoint_url: item.endpoint_url,
      http_method: item.http_method,
      auth_type: item.auth_type,
      auth_value: item.auth_value || "",
      headers: item.headers ? JSON.stringify(item.headers, null, 2) : "",
      body_template: item.body_template || "",
      field_mapping: Object.entries(mapping).map(([api_field, system_field]) => ({
        api_field,
        system_field: system_field as string,
      })),
      schedule_enabled: item.schedule_enabled || false,
      schedule_days: days as string[],
      schedule_time: item.schedule_time || "06:00",
      pagination_enabled: item.pagination_enabled || false,
      pagination_page_size: item.pagination_page_size || 100,
      pagination_param_offset: item.pagination_param_offset || "offset",
      pagination_param_limit: item.pagination_param_limit || "limit",
      pagination_order_by: item.pagination_order_by || "",
    });
    setTestResult(null);
    setDialogOpen(true);
  }

  function mappingToJson(rows: MappingRow[]): Record<string, string> {
    const obj: Record<string, string> = {};
    rows.forEach((r) => { if (r.api_field && r.system_field) obj[r.api_field] = r.system_field; });
    return obj;
  }

  async function handleSave() {
    if (!form.endpoint_url || !form.label) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    setSaving(true);
    let parsedHeaders = {};
    if (form.headers.trim()) {
      try { parsedHeaders = JSON.parse(form.headers); } catch {
        toast({ title: "Headers inválidos", description: "O JSON dos headers está malformado.", variant: "destructive" });
        setSaving(false);
        return;
      }
    }

    const payload: any = {
      entity: "clients",
      label: form.label,
      endpoint_url: form.endpoint_url,
      http_method: form.http_method,
      auth_type: form.auth_type,
      auth_value: form.auth_value || null,
      headers: parsedHeaders,
      body_template: form.body_template || null,
      field_mapping: mappingToJson(form.field_mapping),
      schedule_enabled: form.schedule_enabled,
      schedule_days: form.schedule_days,
      schedule_time: form.schedule_time || null,
      pagination_enabled: form.pagination_enabled,
      pagination_page_size: form.pagination_page_size,
      pagination_param_offset: form.pagination_param_offset,
      pagination_param_limit: form.pagination_param_limit,
      pagination_order_by: form.pagination_order_by || "",
    };

    const { error } = editingId
      ? await supabase.from("api_integrations").update(payload).eq("id", editingId)
      : await supabase.from("api_integrations").insert(payload);

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editingId ? "Atualizado!" : "Criado!" });
      queryClient.invalidateQueries({ queryKey: ["api_integrations"] });
      setDialogOpen(false);
    }
  }

  async function handleTest() {
    if (!form.endpoint_url) {
      toast({ title: "Informe o endpoint", variant: "destructive" });
      return;
    }
    setTestLoading(true);
    setTestResult(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (form.headers.trim()) {
        try { Object.assign(headers, JSON.parse(form.headers)); } catch { /* ignore */ }
      }
      if (form.auth_type === "bearer" && form.auth_value) {
        headers["Authorization"] = `Bearer ${form.auth_value}`;
      } else if (form.auth_type === "basic" && form.auth_value) {
        headers["Authorization"] = `Basic ${btoa(form.auth_value)}`;
      } else if (form.auth_type === "api_key" && form.auth_value) {
        headers["x-api-key"] = form.auth_value;
      }

      const opts: RequestInit = { method: form.http_method, headers };
      if (form.http_method === "POST" && form.body_template) {
        opts.body = form.body_template;
      }

      const res = await fetch(form.endpoint_url, opts);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const arr = Array.isArray(data) ? data : data.data || data.items || data.results || [data];
      setTestResult(arr.slice(0, 5));
      toast({ title: `${arr.length} registros encontrados (mostrando até 5)` });
    } catch (err: any) {
      toast({ title: "Erro no teste", description: err.message, variant: "destructive" });
    } finally {
      setTestLoading(false);
    }
  }

  async function handleSync(integrationId: string) {
    setSyncLog(null);
    setActiveSyncLogId(null);
    setSyncIntegrationId(integrationId);
    setSyncDialogOpen(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "vpyniuyqmseusowjreth";
      fetch(
        `https://${projectId}.supabase.co/functions/v1/sync-api-clients`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ integrationId, triggerType: "manual" }),
        }
      ).catch(() => {});
    } catch (err: any) {
      setSyncLog({ status: "error", error_message: err.message });
    }
  }

  async function reconcileStaleStatuses() {
    if (!logsIntegrationId) return;
    const staleThreshold = new Date(Date.now() - HEARTBEAT_STALE_MS).toISOString();
    // We can't update via client RLS, so just refetch and show effective statuses
    await refetchLogs();
    toast({ title: "Status atualizado", description: "Execuções expiradas agora mostram como Timeout." });
  }

  function openLogs(integrationId: string) {
    setLogsIntegrationId(integrationId);
    setExpandedLogId(null);
    setLogEvents([]);
    setLogsDialogOpen(true);
  }

  async function loadLogEvents(logId: string) {
    if (expandedLogId === logId) {
      setExpandedLogId(null);
      setLogEvents([]);
      return;
    }
    setExpandedLogId(logId);
    const { data } = await supabase
      .from("sync_log_events")
      .select("*")
      .eq("sync_log_id", logId)
      .order("page_number", { ascending: true });
    setLogEvents(data || []);
  }

  function addMappingRow() {
    setForm((f) => ({ ...f, field_mapping: [...f.field_mapping, { api_field: "", system_field: "" }] }));
  }
  function removeMappingRow(idx: number) {
    setForm((f) => ({ ...f, field_mapping: f.field_mapping.filter((_, i) => i !== idx) }));
  }
  function updateMapping(idx: number, key: keyof MappingRow, val: string) {
    setForm((f) => {
      const rows = [...f.field_mapping];
      rows[idx] = { ...rows[idx], [key]: val };
      return { ...f, field_mapping: rows };
    });
  }

  function toggleDay(day: string) {
    setForm((f) => {
      const days = f.schedule_days.includes(day)
        ? f.schedule_days.filter((d) => d !== day)
        : [...f.schedule_days, day];
      return { ...f, schedule_days: days };
    });
  }

  const effectiveSyncStatus = syncLog ? getEffectiveStatus(syncLog) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/configuracoes")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Integrações / APIs</h1>
          <p className="text-sm text-muted-foreground">Configure APIs externas para sincronizar dados</p>
        </div>
      </div>

      {/* Entity: Clients */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-muted-foreground">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Clientes</p>
              <p className="text-xs text-muted-foreground">Sincronize clientes de uma API externa (ex: Protheus)</p>
            </div>
          </div>
          {isAdmin && !clientsIntegration && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Nova Integração
            </Button>
          )}
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : !clientsIntegration ? (
          <p className="text-sm text-muted-foreground">Nenhuma integração configurada.</p>
        ) : (
          <div className="flex items-center justify-between rounded-md border border-border px-4 py-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">{clientsIntegration.label}</p>
              <p className="text-xs text-muted-foreground">{clientsIntegration.http_method} {clientsIntegration.endpoint_url}</p>
              {clientsIntegration.schedule_enabled && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Agendado: {(clientsIntegration.schedule_days as string[] || []).map((d: string) => WEEKDAYS.find(w => w.value === d)?.label).filter(Boolean).join(", ")} às {clientsIntegration.schedule_time || "—"}
                </p>
              )}
              {clientsIntegration.last_sync_at && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {clientsIntegration.last_sync_status === "success" ? (
                    <CheckCircle2 className="h-3 w-3 text-success" />
                  ) : clientsIntegration.last_sync_status === "error" ? (
                    <XCircle className="h-3 w-3 text-destructive" />
                  ) : (
                    <Clock className="h-3 w-3" />
                  )}
                  Última sync: {new Date(clientsIntegration.last_sync_at).toLocaleString("pt-BR")}
                  {clientsIntegration.last_sync_message && ` — ${clientsIntegration.last_sync_message}`}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {isAdmin && (
                <>
                  <Button size="sm" variant="outline" onClick={() => openLogs(clientsIntegration.id)} title="Ver Logs">
                    <FileText className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(clientsIntegration)} title="Configurar">
                    <Settings2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleSync(clientsIntegration.id)} title="Sincronizar">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Config Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Configurar" : "Nova"} Integração de Clientes</DialogTitle>
            <DialogDescription>Configure o endpoint, autenticação, agendamento e mapeamento de campos</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome / Label</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Ex: Clientes Protheus" />
            </div>

            <div className="grid grid-cols-[1fr_120px] gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Endpoint URL</Label>
                <Input value={form.endpoint_url} onChange={(e) => setForm({ ...form, endpoint_url: e.target.value })} placeholder="https://api.exemplo.com/clientes" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Método</Label>
                <Select value={form.http_method} onValueChange={(v) => setForm({ ...form, http_method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-[180px_1fr] gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Autenticação</Label>
                <Select value={form.auth_type} onValueChange={(v) => setForm({ ...form, auth_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    <SelectItem value="bearer">Bearer Token</SelectItem>
                    <SelectItem value="basic">Basic Auth</SelectItem>
                    <SelectItem value="api_key">API Key</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.auth_type !== "none" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    {form.auth_type === "bearer" ? "Token" : form.auth_type === "basic" ? "user:password" : "API Key"}
                  </Label>
                  <Input
                    type="password"
                    value={form.auth_value}
                    onChange={(e) => setForm({ ...form, auth_value: e.target.value })}
                    placeholder={form.auth_type === "basic" ? "usuario:senha" : "Token ou chave"}
                  />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Headers adicionais (JSON)</Label>
              <Textarea
                value={form.headers}
                onChange={(e) => setForm({ ...form, headers: e.target.value })}
                placeholder='{"X-Custom-Header": "valor"}'
                className="font-mono text-xs"
                rows={2}
              />
            </div>

            {form.http_method === "POST" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Body (JSON)</Label>
                <Textarea
                  value={form.body_template}
                  onChange={(e) => setForm({ ...form, body_template: e.target.value })}
                  placeholder='{"filtro": "ativo"}'
                  className="font-mono text-xs"
                  rows={3}
                />
              </div>
            )}

            {/* Schedule */}
            <div className="rounded-md border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Agendamento automático</Label>
                <Switch checked={form.schedule_enabled} onCheckedChange={(v) => setForm({ ...form, schedule_enabled: v })} />
              </div>
              {form.schedule_enabled && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Dias da semana</Label>
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAYS.map((day) => (
                        <label key={day.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
                          <Checkbox checked={form.schedule_days.includes(day.value)} onCheckedChange={() => toggleDay(day.value)} />
                          {day.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Horário</Label>
                    <Input type="time" className="w-32" value={form.schedule_time} onChange={(e) => setForm({ ...form, schedule_time: e.target.value })} />
                  </div>
                </div>
              )}
            </div>

            {/* Pagination */}
            <div className="rounded-md border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Paginação (offset + limit)</Label>
                <Switch checked={form.pagination_enabled} onCheckedChange={(v) => setForm({ ...form, pagination_enabled: v })} />
              </div>
              {form.pagination_enabled && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Tamanho da página</Label>
                      <Input type="number" className="h-8 text-xs" value={form.pagination_page_size} onChange={(e) => setForm({ ...form, pagination_page_size: parseInt(e.target.value) || 100 })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Param offset</Label>
                      <Input className="h-8 text-xs font-mono" value={form.pagination_param_offset} onChange={(e) => setForm({ ...form, pagination_param_offset: e.target.value })} placeholder="offset" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Param limit</Label>
                      <Input className="h-8 text-xs font-mono" value={form.pagination_param_limit} onChange={(e) => setForm({ ...form, pagination_param_limit: e.target.value })} placeholder="limit" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">ORDER BY (para SQL Server)</Label>
                    <Input className="h-8 text-xs font-mono" value={form.pagination_order_by} onChange={(e) => setForm({ ...form, pagination_order_by: e.target.value })} placeholder="A1_COD, A1_LOJA (deixe vazio para ORDER BY 1)" />
                  </div>
                </div>
              )}
            </div>

            {/* Field Mapping */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Mapeamento de Campos</Label>
                <div className="flex gap-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7"><HelpCircle className="h-4 w-4" /></Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-96 text-xs" side="left">
                      <p className="font-medium mb-2">Campos esperados no retorno JSON (array de objetos):</p>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-1 pr-3 font-medium">Campo Sistema</th>
                            <th className="text-left py-1 font-medium">Descrição</th>
                          </tr>
                        </thead>
                        <tbody>
                          {SYSTEM_FIELDS.map((f) => (
                            <tr key={f.value} className="border-b border-border/50">
                              <td className="py-1 pr-3 font-mono text-primary">{f.value}</td>
                              <td className="py-1 text-muted-foreground">{f.desc}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </PopoverContent>
                  </Popover>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={addMappingRow}>
                    <Plus className="h-3 w-3 mr-1" /> Adicionar
                  </Button>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Campo da API</TableHead>
                    <TableHead className="text-xs">Campo do Sistema</TableHead>
                    <TableHead className="text-xs w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {form.field_mapping.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="py-1">
                        <Input className="h-8 text-xs font-mono" value={row.api_field} onChange={(e) => updateMapping(idx, "api_field", e.target.value)} placeholder="A1_COD" />
                      </TableCell>
                      <TableCell className="py-1">
                        <Select value={row.system_field} onValueChange={(v) => updateMapping(idx, "system_field", v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            {SYSTEM_FIELDS.map((f) => (
                              <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="py-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeMappingRow(idx)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {testResult && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Preview (primeiros registros)</Label>
                <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto max-h-48">
                  {JSON.stringify(testResult, null, 2)}
                </pre>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={handleTest} disabled={testLoading}>
              <Play className="h-3.5 w-3.5 mr-1" />
              {testLoading ? "Testando..." : "Testar Conexão"}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sync Progress Dialog */}
      <Dialog open={syncDialogOpen} onOpenChange={(open) => {
        if (!open && pollingRef.current) clearInterval(pollingRef.current);
        setSyncDialogOpen(open);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sincronização</DialogTitle>
            <DialogDescription>Acompanhe o progresso da importação</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!syncLog ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Iniciando sincronização...
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <StatusIcon status={effectiveSyncStatus || "running"} />
                  <span className="text-sm font-medium">{statusLabel(effectiveSyncStatus || "running")}</span>
                </div>

                {/* Indeterminate progress when running, no fake percentage */}
                {effectiveSyncStatus === "running" && (
                  <div className="space-y-1">
                    <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                      <div className="h-full w-1/3 rounded-full bg-primary animate-pulse" style={{ animation: "pulse 1.5s ease-in-out infinite" }} />
                    </div>
                    <p className="text-xs text-muted-foreground text-right">Processando...</p>
                  </div>
                )}

                <div className="rounded-md bg-muted p-3 font-mono text-xs space-y-1">
                  <p>Página atual: {syncLog.pages_processed || 0}</p>
                  <p>Offset: {syncLog.current_offset || 0}</p>
                  <p>Registros lidos: {syncLog.records_fetched || syncLog.total_records || 0}</p>
                  <p className="text-green-600">Inseridos: {syncLog.inserted}</p>
                  <p className="text-primary">Atualizados: {syncLog.updated}</p>
                  {syncLog.errors > 0 && <p className="text-destructive">Erros: {syncLog.errors}</p>}
                  {syncLog.heartbeat_at && (
                    <p className="text-muted-foreground mt-1">Última atividade: {new Date(syncLog.heartbeat_at).toLocaleTimeString("pt-BR")}</p>
                  )}
                  {syncLog.error_message && <p className="text-destructive mt-2">{syncLog.error_message}</p>}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Logs Viewer Dialog */}
      <Dialog open={logsDialogOpen} onOpenChange={setLogsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>Histórico de Sincronizações</DialogTitle>
                <DialogDescription>Últimas 50 execuções — clique na linha para ver detalhes</DialogDescription>
              </div>
              <Button variant="outline" size="sm" onClick={reconcileStaleStatuses} title="Atualizar status de execuções expiradas">
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Atualizar Status
              </Button>
            </div>
          </DialogHeader>

          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nenhuma sincronização registrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Data/Hora</TableHead>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-right">Páginas</TableHead>
                  <TableHead className="text-xs text-right">Lidos</TableHead>
                  <TableHead className="text-xs text-right">Inseridos</TableHead>
                  <TableHead className="text-xs text-right">Atualizados</TableHead>
                  <TableHead className="text-xs text-right">Erros</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log: any) => {
                  const effStatus = getEffectiveStatus(log);
                  const isExpanded = expandedLogId === log.id;
                  return (
                    <React.Fragment key={log.id}>
                      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => loadLogEvents(log.id)}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {new Date(log.started_at).toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline" className="text-[10px]">
                            {log.trigger_type === "manual" ? "Manual" : "Agendado"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs"><StatusBadge status={effStatus} /></TableCell>
                        <TableCell className="text-xs text-right">{log.pages_processed || 0}</TableCell>
                        <TableCell className="text-xs text-right">{log.records_fetched || log.total_records || 0}</TableCell>
                        <TableCell className="text-xs text-right">{log.inserted}</TableCell>
                        <TableCell className="text-xs text-right">{log.updated}</TableCell>
                        <TableCell className="text-xs text-right">{log.errors}</TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={8} className="p-3 bg-muted/30">
                            <div className="space-y-3">
                              {/* Summary */}
                              <div className="grid grid-cols-4 gap-2 text-xs">
                                <div><span className="text-muted-foreground">Início:</span> {new Date(log.started_at).toLocaleString("pt-BR")}</div>
                                <div><span className="text-muted-foreground">Fim:</span> {log.finished_at ? new Date(log.finished_at).toLocaleString("pt-BR") : "—"}</div>
                                <div><span className="text-muted-foreground">Heartbeat:</span> {log.heartbeat_at ? new Date(log.heartbeat_at).toLocaleTimeString("pt-BR") : "—"}</div>
                                <div><span className="text-muted-foreground">Offset:</span> {log.current_offset || 0}</div>
                              </div>

                              {log.error_message && (
                                <div className="rounded bg-destructive/10 p-2 text-xs text-destructive font-mono whitespace-pre-wrap">
                                  <strong>Erro:</strong> {log.error_message}
                                </div>
                              )}

                              {/* Per-page events */}
                              {logEvents.length > 0 ? (
                                <div className="space-y-1">
                                  <p className="text-xs font-medium">Detalhes por página ({logEvents.length} páginas)</p>
                                  <div className="max-h-60 overflow-y-auto space-y-2">
                                    {logEvents.map((evt: any) => (
                                      <details key={evt.id} className="rounded border border-border bg-background p-2">
                                        <summary className="text-xs font-mono cursor-pointer">
                                          Página {evt.page_number} — offset {evt.page_offset} — HTTP {evt.http_status || "?"} — {evt.records_in_page} registros — {evt.duration_ms}ms
                                          {evt.error_message && <span className="text-destructive ml-2">❌ {evt.error_message.substring(0, 80)}</span>}
                                        </summary>
                                        <div className="mt-2 space-y-1">
                                          {evt.curl_command && (
                                            <div>
                                              <p className="text-[10px] font-medium text-muted-foreground">curl:</p>
                                              <pre className="rounded bg-muted p-1.5 text-[10px] font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">{evt.curl_command}</pre>
                                            </div>
                                          )}
                                          {evt.response_preview && (
                                            <div>
                                              <p className="text-[10px] font-medium text-muted-foreground">Resposta (preview):</p>
                                              <pre className="rounded bg-muted p-1.5 text-[10px] font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">{evt.response_preview}</pre>
                                            </div>
                                          )}
                                          {evt.error_message && (
                                            <div>
                                              <p className="text-[10px] font-medium text-destructive">Erro:</p>
                                              <pre className="rounded bg-destructive/10 p-1.5 text-[10px] font-mono whitespace-pre-wrap">{evt.error_message}</pre>
                                            </div>
                                          )}
                                        </div>
                                      </details>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">Nenhum evento de página registrado.</p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
