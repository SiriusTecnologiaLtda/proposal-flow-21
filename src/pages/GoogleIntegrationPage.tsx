import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, ArrowLeft, Play } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface GoogleIntegration {
  id: string;
  label: string;
  auth_type: string;
  service_account_key: string;
  drive_folder_id: string;
  output_folder_id: string | null;
  oauth_client_id: string | null;
  oauth_client_secret: string | null;
  oauth_refresh_token: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

interface LogEntry {
  step: string;
  status: "ok" | "error" | "info";
  message: string;
  timestamp: string;
}

const emptyForm = {
  label: "",
  auth_type: "oauth2" as "service_account" | "oauth2",
  service_account_key: "",
  drive_folder_id: "",
  output_folder_id: "",
  oauth_client_id: "",
  oauth_client_secret: "",
  oauth_refresh_token: "",
};

export default function GoogleIntegrationPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [jsonError, setJsonError] = useState("");

  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testLogs, setTestLogs] = useState<LogEntry[]>([]);
  const [testRunning, setTestRunning] = useState(false);
  const [testLabel, setTestLabel] = useState("");
  const consoleEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [testLogs]);

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ["google_integrations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("google_integrations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as GoogleIntegration[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: typeof emptyForm & { id?: string }) => {
      const payload: any = {
        label: values.label,
        auth_type: values.auth_type,
        drive_folder_id: values.drive_folder_id,
        output_folder_id: values.output_folder_id || values.drive_folder_id,
      };

      if (values.auth_type === "service_account") {
        payload.service_account_key = values.service_account_key;
        payload.oauth_client_id = null;
        payload.oauth_client_secret = null;
        payload.oauth_refresh_token = null;
      } else {
        payload.oauth_client_id = values.oauth_client_id;
        payload.oauth_client_secret = values.oauth_client_secret;
        payload.oauth_refresh_token = values.oauth_refresh_token;
        payload.service_account_key = "";
      }

      if (values.id) {
        const { error } = await supabase
          .from("google_integrations")
          .update(payload)
          .eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("google_integrations")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google_integrations"] });
      toast({ title: "Salvo", description: "Integração Google salva com sucesso." });
      closeDialog();
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("google_integrations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google_integrations"] });
      toast({ title: "Excluído", description: "Integração removida." });
      setDeleteId(null);
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setJsonError("");
  }

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setJsonError("");
    setDialogOpen(true);
  }

  function openEdit(item: GoogleIntegration) {
    setForm({
      label: item.label,
      auth_type: (item.auth_type as "service_account" | "oauth2") || "service_account",
      service_account_key: item.service_account_key || "",
      drive_folder_id: item.drive_folder_id,
      output_folder_id: item.output_folder_id || "",
      oauth_client_id: item.oauth_client_id || "",
      oauth_client_secret: item.oauth_client_secret || "",
      oauth_refresh_token: item.oauth_refresh_token || "",
    });
    setEditingId(item.id);
    setJsonError("");
    setDialogOpen(true);
  }

  function handleSave() {
    if (!form.label.trim() || !form.drive_folder_id.trim()) {
      toast({ title: "Campos obrigatórios", description: "Preencha Nome e ID da Pasta.", variant: "destructive" });
      return;
    }

    if (form.auth_type === "service_account") {
      if (!form.service_account_key.trim()) {
        toast({ title: "Campo obrigatório", description: "Preencha o JSON da Service Account.", variant: "destructive" });
        return;
      }
      try {
        JSON.parse(form.service_account_key);
        setJsonError("");
      } catch {
        setJsonError("JSON inválido. Cole o conteúdo completo do arquivo .json da Service Account.");
        return;
      }
    } else {
      if (!form.oauth_client_id.trim() || !form.oauth_client_secret.trim() || !form.oauth_refresh_token.trim()) {
        toast({ title: "Campos obrigatórios", description: "Preencha Client ID, Client Secret e Refresh Token.", variant: "destructive" });
        return;
      }
    }

    saveMutation.mutate({ ...form, id: editingId ?? undefined });
  }

  async function runTest(item: GoogleIntegration) {
    setTestLabel(item.label);
    setTestLogs([]);
    setTestRunning(true);
    setTestDialogOpen(true);

    const startLog: LogEntry = { step: "start", status: "info", message: `Iniciando teste da conexão "${item.label}"...`, timestamp: new Date().toISOString() };
    setTestLogs([startLog]);

    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/test-google-connection`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session?.access_token || anonKey}`,
            "apikey": anonKey,
          },
          body: JSON.stringify({ integrationId: item.id }),
        }
      );

      const result = await res.json();
      const logs: LogEntry[] = result.logs || [];
      setTestLogs((prev) => [...prev, ...logs]);
    } catch (e: any) {
      setTestLogs((prev) => [
        ...prev,
        { step: "network", status: "error", message: `Erro de rede: ${e.message}`, timestamp: new Date().toISOString() },
      ]);
    } finally {
      setTestRunning(false);
    }
  }

  function statusIcon(status: LogEntry["status"]) {
    if (status === "ok") return <span className="text-green-400">✓</span>;
    if (status === "error") return <span className="text-red-400">✗</span>;
    return <span className="text-blue-400">›</span>;
  }

  function authLabel(authType: string) {
    return authType === "oauth2" ? "OAuth2" : "Service Account";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/configuracoes")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Google Drive / Docs</h1>
          <p className="text-sm text-muted-foreground">Gerencie as credenciais de acesso ao Google para geração de propostas</p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Conexões configuradas</CardTitle>
          {isAdmin && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" /> Nova conexão
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : integrations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma conexão configurada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo Auth</TableHead>
                  <TableHead>Pasta Templates</TableHead>
                  <TableHead>Pasta Documentos</TableHead>
                  <TableHead>Conta</TableHead>
                  {isAdmin && <TableHead className="w-32">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {integrations.map((item) => {
                  let account = "—";
                  if (item.auth_type === "oauth2") {
                    account = item.oauth_client_id ? `${item.oauth_client_id.substring(0, 20)}...` : "—";
                  } else {
                    try { account = JSON.parse(item.service_account_key).client_email || "—"; } catch { /* ignore */ }
                  }
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.label}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          item.auth_type === "oauth2"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                        }`}>
                          {authLabel(item.auth_type)}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{item.drive_folder_id}</TableCell>
                      <TableCell className="font-mono text-xs">{item.output_folder_id || item.drive_folder_id}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{account}</TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" title="Testar conexão" onClick={() => runTest(item)}>
                              <Play className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteId(item.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar conexão" : "Nova conexão Google"}</DialogTitle>
            <DialogDescription>Configure as credenciais de acesso ao Google Drive.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome / Label</Label>
              <Input placeholder="Ex: Unidade Leste" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </div>
            <div>
              <Label>Pasta de Templates (Google Drive ID)</Label>
              <Input placeholder="Ex: 1JBh1YFS86MMe-M91kWeBchfh8xwQrFwB" value={form.drive_folder_id} onChange={(e) => setForm({ ...form, drive_folder_id: e.target.value })} />
              <p className="text-xs text-muted-foreground mt-1">Pasta onde estão os modelos de documento</p>
            </div>
            <div>
              <Label>Pasta de Documentos Gerados (Google Drive ID)</Label>
              <Input placeholder="Mesmo ID ou pasta diferente" value={form.output_folder_id} onChange={(e) => setForm({ ...form, output_folder_id: e.target.value })} />
              <p className="text-xs text-muted-foreground mt-1">Pasta onde os documentos gerados serão salvos. Se vazio, usa a pasta de templates.</p>
            </div>

            <Tabs value={form.auth_type} onValueChange={(v) => setForm({ ...form, auth_type: v as "service_account" | "oauth2" })}>
              <Label>Tipo de Autenticação</Label>
              <TabsList className="w-full mt-1">
                <TabsTrigger value="oauth2" className="flex-1">OAuth2 (Pessoal)</TabsTrigger>
                <TabsTrigger value="service_account" className="flex-1">Service Account</TabsTrigger>
              </TabsList>

              <TabsContent value="oauth2" className="space-y-3 mt-3">
                <p className="text-xs text-muted-foreground">
                  Use OAuth2 para autenticar com sua conta pessoal do Google e utilizar seus 15GB gratuitos do Drive.
                </p>
                <div>
                  <Label>Client ID</Label>
                  <Input
                    placeholder="Ex: 123456789.apps.googleusercontent.com"
                    value={form.oauth_client_id}
                    onChange={(e) => setForm({ ...form, oauth_client_id: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Client Secret</Label>
                  <Input
                    type="password"
                    placeholder="Client Secret do OAuth2"
                    value={form.oauth_client_secret}
                    onChange={(e) => setForm({ ...form, oauth_client_secret: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Refresh Token</Label>
                  <Input
                    type="password"
                    placeholder="Refresh Token obtido via OAuth Playground"
                    value={form.oauth_refresh_token}
                    onChange={(e) => setForm({ ...form, oauth_refresh_token: e.target.value })}
                  />
                </div>
              </TabsContent>

              <TabsContent value="service_account" className="space-y-3 mt-3">
                <p className="text-xs text-muted-foreground">
                  Use Service Account para Shared Drives organizacionais. A conta de serviço precisa de acesso à pasta.
                </p>
                <div>
                  <Label>JSON da Service Account</Label>
                  <Textarea
                    placeholder='Cole aqui o conteúdo completo do arquivo .json da Service Account'
                    className="min-h-[200px] font-mono text-xs"
                    value={form.service_account_key}
                    onChange={(e) => { setForm({ ...form, service_account_key: e.target.value }); setJsonError(""); }}
                  />
                  {jsonError && <p className="mt-1 text-xs text-destructive">{jsonError}</p>}
                </div>
              </TabsContent>
            </Tabs>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Console Dialog */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>Console — Teste de Conexão</DialogTitle>
            <DialogDescription>Conexão: {testLabel}</DialogDescription>
          </DialogHeader>
          <div className="bg-gray-950 mx-4 mb-4 rounded-lg border border-gray-800">
            <ScrollArea className="h-[350px] p-4">
              <div className="space-y-1 font-mono text-xs">
                {testLogs.map((entry, i) => (
                  <div key={i} className="flex gap-2 leading-relaxed">
                    <span className="shrink-0 text-gray-500 select-none">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="shrink-0">{statusIcon(entry.status)}</span>
                    <span className={
                      entry.status === "ok" ? "text-green-300" :
                      entry.status === "error" ? "text-red-300" :
                      "text-gray-300"
                    }>
                      {entry.message}
                    </span>
                  </div>
                ))}
                {testRunning && (
                  <div className="flex gap-2 text-gray-400 animate-pulse">
                    <span>⏳</span>
                    <span>Executando...</span>
                  </div>
                )}
                <div ref={consoleEndRef} />
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conexão?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. A conexão será removida permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
