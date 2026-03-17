import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { ArrowLeft, Plus, Trash2, HelpCircle, RefreshCw, Play, Pencil, CheckCircle2, XCircle, Clock, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";

const SYSTEM_FIELDS = [
  { value: "code", label: "code", desc: "Código do cliente (obrigatório)" },
  { value: "name", label: "name", desc: "Razão Social (obrigatório)" },
  { value: "cnpj", label: "cnpj", desc: "CNPJ (obrigatório)" },
  { value: "contact", label: "contact", desc: "Nome do contato" },
  { value: "email", label: "email", desc: "E-mail" },
  { value: "phone", label: "phone", desc: "Telefone" },
  { value: "address", label: "address", desc: "Endereço" },
  { value: "state_registration", label: "state_registration", desc: "Inscrição Estadual" },
];

const DEFAULT_MAPPING = [
  { api_field: "A1_COD", system_field: "code" },
  { api_field: "A1_NOME", system_field: "name" },
  { api_field: "A1_CGC", system_field: "cnpj" },
  { api_field: "A1_CONTATO", system_field: "contact" },
  { api_field: "A1_TEL", system_field: "phone" },
  { api_field: "A1_END", system_field: "address" },
  { api_field: "A1_EST", system_field: "state_registration" },
];

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
};

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
  const [syncLoading, setSyncLoading] = useState(false);

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

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setTestResult(null);
    setDialogOpen(true);
  }

  function openEdit(item: any) {
    const mapping = item.field_mapping as Record<string, string>;
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

    const payload = {
      entity: "clients" as const,
      label: form.label,
      endpoint_url: form.endpoint_url,
      http_method: form.http_method,
      auth_type: form.auth_type,
      auth_value: form.auth_value || null,
      headers: parsedHeaders,
      body_template: form.body_template || null,
      field_mapping: mappingToJson(form.field_mapping),
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
    setSyncLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "vpyniuyqmseusowjreth";
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/sync-api-clients`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ integrationId }),
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Falha na sincronização");
      toast({
        title: "Sincronização concluída!",
        description: `Inseridos: ${result.inserted}, Atualizados: ${result.updated}, Erros: ${result.errors}`,
      });
      queryClient.invalidateQueries({ queryKey: ["api_integrations"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSyncLoading(false);
    }
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
          {isAdmin && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Nova Integração
            </Button>
          )}
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : integrations.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma integração configurada.</p>
        ) : (
          <div className="space-y-2">
            {integrations.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between rounded-md border border-border px-4 py-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.http_method} {item.endpoint_url}</p>
                  {item.last_sync_at && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      {item.last_sync_status === "success" ? (
                        <CheckCircle2 className="h-3 w-3 text-green-600" />
                      ) : item.last_sync_status === "error" ? (
                        <XCircle className="h-3 w-3 text-destructive" />
                      ) : (
                        <Clock className="h-3 w-3" />
                      )}
                      Última sync: {new Date(item.last_sync_at).toLocaleString("pt-BR")}
                      {item.last_sync_message && ` — ${item.last_sync_message}`}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {isAdmin && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => openEdit(item)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" disabled={syncLoading} onClick={() => handleSync(item.id)}>
                        <RefreshCw className={`h-3.5 w-3.5 ${syncLoading ? "animate-spin" : ""}`} />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Config Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar" : "Nova"} Integração de Clientes</DialogTitle>
            <DialogDescription>Configure o endpoint, autenticação e mapeamento de campos</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Label */}
            <div className="space-y-1.5">
              <Label className="text-xs">Nome / Label</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Ex: Clientes Protheus" />
            </div>

            {/* Endpoint + Method */}
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

            {/* Auth */}
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

            {/* Headers */}
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

            {/* Body */}
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

            {/* Field Mapping */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Mapeamento de Campos</Label>
                <div className="flex gap-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <HelpCircle className="h-4 w-4" />
                      </Button>
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
                      <p className="mt-3 text-muted-foreground">
                        Mapeie o nome do campo retornado pela API (ex: <code className="text-primary">A1_COD</code>) para o campo correspondente do sistema (ex: <code className="text-primary">code</code>).
                      </p>
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
                        <Input
                          className="h-8 text-xs font-mono"
                          value={row.api_field}
                          onChange={(e) => updateMapping(idx, "api_field", e.target.value)}
                          placeholder="A1_COD"
                        />
                      </TableCell>
                      <TableCell className="py-1">
                        <Select value={row.system_field} onValueChange={(v) => updateMapping(idx, "system_field", v)}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Selecione..." />
                          </SelectTrigger>
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

            {/* Test result preview */}
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
    </div>
  );
}
