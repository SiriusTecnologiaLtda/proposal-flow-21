import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Mail, RefreshCw, Wifi, WifiOff, Save, Play, Clock, AlertCircle, CheckCircle2, Info, ArrowLeft, LogIn, Loader2, ChevronDown, FileWarning, RotateCcw, CheckCheck, Timer,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

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
  last_sync_at: string | null;
  last_sync_status: string;
  last_sync_message: string;
  last_sync_emails_found: number;
  last_sync_pdfs_imported: number;
  last_sync_errors: SyncErrorDetail[];
  updated_at: string;
}

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";
const OAUTH_CALLBACK_PATH = "/oauth/google/callback";

const resolveOAuthBaseOrigin = () => {
  const currentHost = window.location.hostname;
  if (currentHost.includes("lovableproject.com") && document.referrer) {
    try {
      const referrerUrl = new URL(document.referrer);
      if (referrerUrl.hostname.includes("lovable.app")) return referrerUrl.origin;
    } catch { /* ignore */ }
  }
  return window.location.origin;
};

const getRedirectUri = () => `${resolveOAuthBaseOrigin()}${OAUTH_CALLBACK_PATH}`;

export default function EmailInboxConfigPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; mailboxes?: string[] } | null>(null);

  // Load default google integration for client_id (needed to build OAuth URL)
  const { data: googleIntegration } = useQuery({
    queryKey: ["google-integration-default"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("google_integrations")
        .select("id, oauth_client_id, sender_email")
        .eq("is_default", true)
        .single();
      if (error) return null;
      return data;
    },
  });

  const { data: config, isLoading } = useQuery({
    queryKey: ["email-inbox-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_inbox_config" as any)
        .select("*")
        .limit(1)
        .single();
      if (error) throw error;
      return data as unknown as EmailConfig;
    },
  });

  const [form, setForm] = useState<Partial<EmailConfig>>({});
  const mergedForm = { ...config, ...form } as EmailConfig;

  const saveMutation = useMutation({
    mutationFn: async (updates: Partial<EmailConfig>) => {
      if (!config?.id) throw new Error("Config não encontrada");
      const { error } = await supabase
        .from("email_inbox_config" as any)
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
          ...(user?.id ? { updated_by: user.id } : {}),
        } as any)
        .eq("id", config.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-inbox-config"] });
      setForm({});
      toast({ title: "Configurações salvas com sucesso" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    const updates: any = {};
    if (form.monitored_folder !== undefined) updates.monitored_folder = form.monitored_folder;
    if (form.sender_filter !== undefined) updates.sender_filter = form.sender_filter;
    if (form.subject_filter !== undefined) updates.subject_filter = form.subject_filter;
    if (form.polling_interval_minutes !== undefined) updates.polling_interval_minutes = form.polling_interval_minutes;
    if (form.enabled !== undefined) updates.enabled = form.enabled;
    updates.provider = "gmail";

    if (Object.keys(updates).length <= 1) {
      toast({ title: "Nenhuma alteração para salvar" });
      return;
    }
    saveMutation.mutate(updates);
  };

  // --- OAuth authorize flow ---
  const handleAuthorize = () => {
    if (!googleIntegration?.oauth_client_id) {
      toast({
        title: "Integração Google não configurada",
        description: "Configure as credenciais OAuth em Configurações > Google Drive / Docs primeiro.",
        variant: "destructive",
      });
      return;
    }

    setAuthorizing(true);

    const state = btoa(JSON.stringify({
      flow: "email-inbox",
      openerOrigin: resolveOAuthBaseOrigin(),
    }));

    const params = new URLSearchParams({
      client_id: googleIntegration.oauth_client_id,
      redirect_uri: getRedirectUri(),
      response_type: "code",
      scope: GMAIL_SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
    });

    const popup = window.open(
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      "gmail-oauth",
      "width=600,height=700,left=200,top=100"
    );

    if (!popup) {
      setAuthorizing(false);
      toast({ title: "Popup bloqueado", description: "Permita popups para este site.", variant: "destructive" });
    }
  };

  // Listen for OAuth callback
  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      if (event.data?.type !== "google-oauth-callback" || event.data?.flow !== "email-inbox") return;

      const { code, error: oauthError } = event.data;

      if (oauthError || !code) {
        setAuthorizing(false);
        toast({ title: "Autorização cancelada", description: oauthError || "Nenhum código recebido.", variant: "destructive" });
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke("email-inbox-oauth-exchange", {
          body: { code, redirectUri: getRedirectUri() },
        });

        if (error) throw error;

        if (data?.success) {
          toast({ title: "Conta Gmail autorizada", description: data.message });
          queryClient.invalidateQueries({ queryKey: ["email-inbox-config"] });
        } else {
          toast({ title: "Erro na autorização", description: data?.error || "Erro desconhecido", variant: "destructive" });
        }
      } catch (err: any) {
        toast({ title: "Erro na autorização", description: err.message, variant: "destructive" });
      } finally {
        setAuthorizing(false);
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [toast, queryClient]);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("email-inbox-sync", {
        body: { action: "test" },
      });
      if (error) throw error;
      setTestResult({
        success: data.success,
        message: data.success ? data.message : data.error,
        mailboxes: data.mailboxes,
      });
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || "Erro ao testar conexão" });
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("email-inbox-sync", {
        body: { action: "sync" },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["email-inbox-config"] });
      if (data.success) {
        toast({
          title: "Sincronização concluída",
          description: `${data.pdfs_imported || 0} PDF(s) importado(s) de ${data.emails_found || 0} e-mail(s).`,
        });
      } else {
        toast({ title: "Erro na sincronização", description: data.error || "Erro desconhecido", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Erro na sincronização", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const setField = (key: keyof EmailConfig, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const hasGmailAuthorized = !!config?.gmail_refresh_token;
  const hasGoogleIntegration = !!googleIntegration?.oauth_client_id;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/configuracoes")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Caixa de E-mail — Importação via Gmail</h1>
          <p className="text-sm text-muted-foreground">
            Leitura automática de e-mails via Gmail API usando as credenciais Google já configuradas.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: Config */}
        <div className="lg:col-span-2 space-y-6">
          {/* Gmail Authorization */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="h-4 w-4" /> Conta Gmail
              </CardTitle>
              <CardDescription>
                Autorize a conta Gmail que será monitorada. As credenciais OAuth (Client ID / Secret) são obtidas automaticamente da integração Google Drive / Docs já configurada.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!hasGoogleIntegration && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">Integração Google não configurada</p>
                    <p className="text-xs mt-1">
                      Configure as credenciais OAuth em{" "}
                      <button className="underline font-medium" onClick={() => navigate("/configuracoes/google")}>
                        Configurações &gt; Google Drive / Docs
                      </button>{" "}
                      antes de autorizar o acesso Gmail.
                    </p>
                  </div>
                </div>
              )}

              {hasGmailAuthorized ? (
                <div className="flex items-center justify-between rounded-lg border border-green-500/30 bg-green-50 p-3 dark:bg-green-900/20">
                  <div className="flex items-center gap-2 text-sm text-green-800 dark:text-green-300">
                    <CheckCircle2 className="h-4 w-4" />
                    <div>
                      <p className="font-medium">Conta autorizada</p>
                      {config?.email_address && (
                        <p className="text-xs opacity-80">{config.email_address}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAuthorize}
                    disabled={authorizing || !hasGoogleIntegration}
                  >
                    {authorizing ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <LogIn className="mr-2 h-3 w-3" />}
                    Reautorizar
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={handleAuthorize}
                  disabled={authorizing || !hasGoogleIntegration}
                  className="w-full"
                >
                  {authorizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
                  {authorizing ? "Aguardando autorização..." : "Autorizar Conta Gmail"}
                </Button>
              )}

              <div className="flex gap-2 rounded-lg bg-accent/50 p-3 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  <p>O fluxo de autorização abrirá uma janela do Google para que você autorize o acesso à caixa de entrada da conta selecionada.</p>
                  <p><strong>Escopo solicitado:</strong> <code className="bg-muted px-1 rounded">gmail.modify</code> (leitura de e-mails e marcar como lido)</p>
                  <p><strong>Importante:</strong> Adicione o escopo <code className="bg-muted px-1 rounded">gmail.modify</code> na Tela de Consentimento OAuth do Google Cloud Console antes de autorizar.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Filtros e Pasta</CardTitle>
              <CardDescription>
                Configure quais e-mails serão processados. O sistema buscará apenas e-mails não lidos com anexos PDF.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Pasta / Label</Label>
                  <Input
                    placeholder="INBOX"
                    value={mergedForm.monitored_folder || ""}
                    onChange={(e) => setField("monitored_folder", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Label do Gmail a monitorar (padrão: INBOX).</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Intervalo de Polling (min)</Label>
                  <Input
                    type="number"
                    min={5}
                    placeholder="15"
                    value={mergedForm.polling_interval_minutes || 15}
                    onChange={(e) => setField("polling_interval_minutes", parseInt(e.target.value) || 15)}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Filtro por Remetente</Label>
                  <Input
                    placeholder="Ex: propostas@totvs.com"
                    value={mergedForm.sender_filter || ""}
                    onChange={(e) => setField("sender_filter", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Filtro por Assunto</Label>
                  <Input
                    placeholder="Ex: Proposta Comercial"
                    value={mergedForm.subject_filter || ""}
                    onChange={(e) => setField("subject_filter", e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Enable + Save */}
          <Card>
            <CardContent className="flex items-center justify-between pt-6">
              <div className="flex items-center gap-3">
                <Switch
                  checked={mergedForm.enabled ?? false}
                  onCheckedChange={(v) => setField("enabled", v)}
                />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {mergedForm.enabled ? "Monitoramento Ativo" : "Monitoramento Desativado"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {mergedForm.enabled
                      ? "O sistema buscará e-mails via Gmail API."
                      : "Nenhum e-mail será processado automaticamente."}
                  </p>
                </div>
              </div>
              <Button onClick={handleSave} disabled={saveMutation.isPending}>
                <Save className="mr-2 h-4 w-4" />
                {saveMutation.isPending ? "Salvando..." : "Salvar Configurações"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right column: Actions & Status */}
        <div className="space-y-6">
          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={handleTest}
                disabled={testing || !hasGmailAuthorized}
              >
                {testing ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Wifi className="mr-2 h-4 w-4" />}
                {testing ? "Testando..." : "Testar Conexão"}
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={handleSync}
                disabled={syncing || !hasGmailAuthorized}
              >
                {syncing ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                {syncing ? "Sincronizando..." : "Executar Sincronização Agora"}
              </Button>

              {testResult && (
                <div
                  className={`rounded-lg border p-3 text-sm ${
                    testResult.success
                      ? "border-green-500/30 bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300"
                      : "border-destructive/30 bg-destructive/10 text-destructive"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {testResult.success ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />}
                    <div>
                      <p className="font-medium">{testResult.message}</p>
                      {testResult.mailboxes && (
                        <p className="mt-1 text-xs opacity-80">
                          Labels: {testResult.mailboxes.slice(0, 10).join(", ")}
                          {testResult.mailboxes.length > 10 ? ` (+${testResult.mailboxes.length - 10})` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Last sync status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4" /> Última Sincronização
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {config?.last_sync_at ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Data/Hora</span>
                    <span className="font-medium">{new Date(config.last_sync_at).toLocaleString("pt-BR")}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge
                      variant={
                        config.last_sync_status === "success" ? "default"
                        : config.last_sync_status === "partial" ? "secondary"
                        : "destructive"
                      }
                    >
                      {config.last_sync_status === "success" ? "Sucesso"
                        : config.last_sync_status === "partial" ? "Parcial"
                        : config.last_sync_status === "error" ? "Erro"
                        : config.last_sync_status || "—"}
                    </Badge>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">E-mails</span>
                    <span>{config.last_sync_emails_found ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">PDFs importados</span>
                    <span>{config.last_sync_pdfs_imported ?? 0}</span>
                  </div>
                  {config.last_sync_message && (
                    <>
                      <Separator />
                      <p className="text-xs text-muted-foreground">{config.last_sync_message}</p>
                    </>
                  )}

                  {/* Detailed errors section */}
                  {config.last_sync_errors && config.last_sync_errors.length > 0 && (
                    <>
                      <Separator />
                      <Collapsible>
                        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md p-2 text-sm font-medium hover:bg-accent">
                          <span className="flex items-center gap-2">
                            <FileWarning className="h-4 w-4 text-destructive" />
                            Detalhes ({config.last_sync_errors.filter((e: SyncErrorDetail) => !e.auto_resolved).length} erro(s),{" "}
                            {config.last_sync_errors.filter((e: SyncErrorDetail) => e.auto_resolved).length} resolvido(s) automaticamente)
                          </span>
                          <ChevronDown className="h-4 w-4 transition-transform" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2 pt-2">
                          {config.last_sync_errors.map((err: SyncErrorDetail, idx: number) => (
                            <div
                              key={idx}
                              className={`rounded-md border p-3 text-xs space-y-1.5 ${
                                err.auto_resolved
                                  ? "border-muted bg-muted/30"
                                  : "border-destructive/30 bg-destructive/5"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-1.5 font-medium">
                                  {err.auto_resolved ? (
                                    <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />
                                  ) : (
                                    <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                                  )}
                                  <span className="truncate max-w-[180px]" title={err.filename}>{err.filename}</span>
                                </div>
                                <Badge variant={err.auto_resolved ? "outline" : "destructive"} className="text-[10px] shrink-0">
                                  {err.error_type === "duplicate" ? "Duplicado"
                                    : err.error_type === "download_failed" ? "Download"
                                    : err.error_type === "upload_failed" ? "Upload"
                                    : err.error_type === "config_failed" ? "Configuração"
                                    : err.error_type === "insert_failed" ? "Registro"
                                    : "Outro"}
                                </Badge>
                              </div>
                              <p className="text-muted-foreground leading-relaxed">{err.error_message}</p>
                              {!err.auto_resolved && (
                                <p className="text-[11px] font-medium text-muted-foreground">
                                  {err.error_class === "structural" ? "Falha estrutural" : "Falha temporária"}
                                </p>
                              )}
                              {err.subject && (
                                <p className="text-muted-foreground"><strong>Assunto:</strong> {err.subject}</p>
                              )}
                              {err.requires_action && !err.auto_resolved && (
                                <div className="flex items-start gap-1.5 rounded bg-accent/50 p-2 mt-1">
                                  <RotateCcw className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                  <span>{err.requires_action}</span>
                                </div>
                              )}
                            </div>
                          ))}

                          {config.last_sync_errors.some((e: SyncErrorDetail) => !e.auto_resolved) && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full mt-2"
                              onClick={handleSync}
                              disabled={syncing}
                            >
                              <RotateCcw className="mr-2 h-3.5 w-3.5" />
                              Tentar Sincronizar Novamente
                            </Button>
                          )}
                        </CollapsibleContent>
                      </Collapsible>
                    </>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Info className="h-4 w-4" />
                  <span>Nenhuma sincronização realizada ainda.</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sincronização Automática */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Timer className="h-4 w-4" /> Sincronização Automática
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Ativar polling automático</span>
                <Switch
                  checked={mergedForm.enabled ?? false}
                  onCheckedChange={(v) => setField("enabled", v)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Intervalo (minutos)</Label>
                <Select
                  value={String(mergedForm.polling_interval_minutes || 15)}
                  onValueChange={(v) => setField("polling_interval_minutes", parseInt(v))}
                >
                  <SelectTrigger>
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
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Info className="h-4 w-4" /> Como Funciona
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-3">
              <div className="space-y-2">
                <ol className="list-decimal pl-4 space-y-1.5">
                  <li>As credenciais OAuth (Client ID / Secret) são reutilizadas da integração <strong>Google Drive / Docs</strong></li>
                  <li>Clique em <strong>"Autorizar Conta Gmail"</strong> para conectar a conta de e-mail</li>
                  <li>Configure os filtros de remetente, assunto e pasta</li>
                  <li>Use <strong>"Testar Conexão"</strong> para validar o acesso</li>
                  <li>Use <strong>"Executar Sincronização"</strong> para importar PDFs dos e-mails</li>
                </ol>
              </div>

              <Separator />

              <div className="flex gap-2 rounded-lg bg-accent/50 p-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  <p>
                    <strong>Pré-requisito:</strong> O escopo <code className="bg-muted px-1 rounded">gmail.modify</code> deve estar configurado na Tela de Consentimento OAuth do Google Cloud Console.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
