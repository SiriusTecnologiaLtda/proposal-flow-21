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
import { Plus, Pencil, Trash2, ArrowLeft, Play, Star, Copy, ExternalLink, LogIn, CheckCircle2, Loader2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

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
};

const GOOGLE_SCOPES = "https://www.googleapis.com/auth/drive";
const OAUTH_CALLBACK_PATH = "/oauth/google/callback";
const getRedirectUri = () => {
  const loc = window.location;
  return `${loc.protocol}//${loc.host}${OAUTH_CALLBACK_PATH}`;
};
const getPageUrl = () => {
  const loc = window.location;
  return `${loc.protocol}//${loc.host}/configuracoes/google`;
};

export default function GoogleIntegrationPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

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

  const [authorizingId, setAuthorizingId] = useState<string | null>(null);
  const [exchangingCode, setExchangingCode] = useState(false);

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

  // Handle OAuth callback via postMessage from popup
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "google-oauth-callback") return;

      const { code, state, error } = event.data;
      if (error) {
        toast({ title: "Erro na autorização", description: error, variant: "destructive" });
        return;
      }
      if (!code || !state) return;

      setExchangingCode(true);
      (async () => {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData?.session?.access_token;
          const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "vpyniuyqmseusowjreth";

          const res = await fetch(
            `https://${projectId}.supabase.co/functions/v1/google-oauth-exchange`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                code,
                integrationId: state,
                redirectUri: getRedirectUri(),
              }),
            }
          );

          const result = await res.json();
          if (result.success) {
            toast({ title: "Autorizado!", description: result.message });
            queryClient.invalidateQueries({ queryKey: ["google_integrations"] });
          } else {
            toast({ title: "Erro na autorização", description: result.error, variant: "destructive" });
          }
        } catch (err: any) {
          toast({ title: "Erro", description: err.message, variant: "destructive" });
        } finally {
          setExchangingCode(false);
        }
      })();
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [toast, queryClient]);

  // Also handle direct URL params (fallback if popup didn't work)
  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (!code || !state || exchangingCode) return;

    setExchangingCode(true);
    setSearchParams({}, { replace: true });

    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "vpyniuyqmseusowjreth";

        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/google-oauth-exchange`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              code,
              integrationId: state,
              redirectUri: getRedirectUri(),
            }),
          }
        );

        const result = await res.json();
        if (result.success) {
          toast({ title: "Autorizado!", description: result.message });
          queryClient.invalidateQueries({ queryKey: ["google_integrations"] });
        } else {
          toast({ title: "Erro na autorização", description: result.error, variant: "destructive" });
        }
      } catch (err: any) {
        toast({ title: "Erro", description: err.message, variant: "destructive" });
      } finally {
        setExchangingCode(false);
      }
    })();
  }, [searchParams]);

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

  async function setAsDefault(id: string) {
    try {
      await supabase.from("google_integrations").update({ is_default: false } as any).neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("google_integrations").update({ is_default: true } as any).eq("id", id);
      queryClient.invalidateQueries({ queryKey: ["google_integrations"] });
      toast({ title: "Padrão definido", description: "Conexão definida como padrão." });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  }

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
      if (!form.oauth_client_id.trim() || !form.oauth_client_secret.trim()) {
        toast({ title: "Campos obrigatórios", description: "Preencha Client ID e Client Secret.", variant: "destructive" });
        return;
      }
    }

    saveMutation.mutate({ ...form, id: editingId ?? undefined });
  }

  function startGoogleAuth(integrationId: string, clientId: string) {
    const redirectUri = REDIRECT_URI_BASE();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GOOGLE_SCOPES,
      access_type: "offline",
      prompt: "consent",
      state: integrationId,
    });
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    
    // Open in popup to avoid iframe restrictions
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      authUrl,
      "google-oauth",
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
    );

    if (!popup) {
      // Fallback: navigate directly if popup blocked
      window.open(authUrl, "_blank");
      toast({ title: "Popup bloqueado", description: "A janela de autorização foi aberta em nova aba. Após autorizar, volte a esta página.", variant: "default" });
    }
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

  const redirectUrl = `https://vpyniuyqmseusowjreth.supabase.co/auth/v1/callback`;

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

      {/* OAuth Config URLs Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Google OAuth 2.0 — URLs de Configuração</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Use esses valores ao configurar credenciais OAuth no Google Cloud Console</p>
          {[
            { label: "Domínio autorizado", value: "lovable.app" },
            { label: "URL de redirecionamento (OAuth Drive)", value: REDIRECT_URI_BASE() },
            { label: "URL de redirecionamento (Login Google)", value: redirectUrl },
          ].map((item) => (
            <div key={item.label} className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-muted px-3 py-1.5 text-xs text-foreground break-all">{item.value}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText(item.value);
                    toast({ title: "Copiado!", description: `${item.label} copiado para a área de transferência.` });
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Connections */}
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
          {exchangingCode && (
            <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm text-foreground">Processando autorização do Google...</span>
            </div>
          )}
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
                  <TableHead>Status</TableHead>
                  <TableHead>Pasta Templates</TableHead>
                  <TableHead>Pasta Documentos</TableHead>
                  {isAdmin && <TableHead className="w-40">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {integrations.map((item) => {
                  const isOAuth = item.auth_type === "oauth2";
                  const hasRefreshToken = !!item.oauth_refresh_token;
                  return (
                    <TableRow key={item.id} className={item.is_default ? "bg-primary/5" : ""}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {item.label}
                          {item.is_default && (
                            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                              Padrão
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          isOAuth
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                        }`}>
                          {authLabel(item.auth_type)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {isOAuth ? (
                          hasRefreshToken ? (
                            <Badge className="bg-green-600/10 text-green-600 text-[10px]">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Autorizado
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[10px]">Não autorizado</Badge>
                          )
                        ) : (
                          <Badge className="bg-green-600/10 text-green-600 text-[10px]">Configurado</Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{item.drive_folder_id}</TableCell>
                      <TableCell className="font-mono text-xs">{item.output_folder_id || item.drive_folder_id}</TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex gap-1">
                            {isOAuth && !hasRefreshToken && item.oauth_client_id && (
                              <Button variant="ghost" size="icon" title="Autorizar com Google" onClick={() => startGoogleAuth(item.id, item.oauth_client_id!)}>
                                <LogIn className="h-4 w-4 text-blue-600" />
                              </Button>
                            )}
                            {isOAuth && hasRefreshToken && (
                              <Button variant="ghost" size="icon" title="Re-autorizar" onClick={() => startGoogleAuth(item.id, item.oauth_client_id!)}>
                                <LogIn className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" title={item.is_default ? "Conexão padrão" : "Definir como padrão"} onClick={() => setAsDefault(item.id)}>
                              <Star className={`h-4 w-4 ${item.is_default ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                            </Button>
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
                  Use OAuth2 para autenticar com sua conta pessoal do Google. Após salvar, clique em "Autorizar" na tabela para conectar sua conta.
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
                <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 p-3 text-xs text-blue-700 dark:text-blue-300 space-y-1">
                  <p className="font-medium">Como funciona:</p>
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>Preencha Client ID e Client Secret do Google Cloud Console</li>
                    <li>Salve a conexão</li>
                    <li>Clique no botão <LogIn className="inline h-3 w-3" /> na tabela para autorizar com o Google</li>
                    <li>O refresh token será obtido automaticamente</li>
                  </ol>
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
