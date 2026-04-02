import { useState, useCallback } from "react";
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
import {
  Mail, RefreshCw, Wifi, WifiOff, Save, Play, Clock, AlertCircle, CheckCircle2, Info, ArrowLeft, ExternalLink, ShieldCheck,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

interface EmailConfig {
  id: string;
  email_address: string;
  provider: string;
  gmail_client_id: string | null;
  gmail_client_secret: string | null;
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
  updated_at: string;
}

export default function EmailInboxConfigPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; mailboxes?: string[] } | null>(null);
  const [showSecret, setShowSecret] = useState(false);

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
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
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
    if (form.email_address !== undefined) updates.email_address = form.email_address;
    if (form.gmail_client_id !== undefined) updates.gmail_client_id = form.gmail_client_id;
    if (form.gmail_client_secret !== undefined) updates.gmail_client_secret = form.gmail_client_secret;
    if (form.gmail_refresh_token !== undefined) updates.gmail_refresh_token = form.gmail_refresh_token;
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
      setTestResult({
        success: false,
        message: err.message || "Erro ao testar conexão",
      });
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
        toast({
          title: "Erro na sincronização",
          description: data.error || "Erro desconhecido",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro na sincronização",
        description: err.message || "Erro ao executar sincronização",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const setField = (key: keyof EmailConfig, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const hasGmailCredentials = !!(mergedForm.gmail_client_id && mergedForm.gmail_client_secret && mergedForm.gmail_refresh_token);

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
            Configure a leitura de e-mails via Gmail API para importação automática de propostas de software.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: Config */}
        <div className="lg:col-span-2 space-y-6">
          {/* Gmail OAuth credentials */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4" /> Credenciais Google OAuth
              </CardTitle>
              <CardDescription>
                Configure o Client ID e Client Secret do projeto Google Cloud Console, e o Refresh Token obtido na autorização.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Endereço de E-mail Gmail</Label>
                <Input
                  placeholder="propostas@empresa.com.br"
                  value={mergedForm.email_address || ""}
                  onChange={(e) => setField("email_address", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Endereço da conta Gmail que será monitorada.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Client ID</Label>
                <Input
                  placeholder="xxxx.apps.googleusercontent.com"
                  value={mergedForm.gmail_client_id || ""}
                  onChange={(e) => setField("gmail_client_id", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Client Secret</Label>
                <div className="relative">
                  <Input
                    type={showSecret ? "text" : "password"}
                    placeholder="GOCSPX-xxxx"
                    value={mergedForm.gmail_client_secret || ""}
                    onChange={(e) => setField("gmail_client_secret", e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setShowSecret(!showSecret)}
                  >
                    {showSecret ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Refresh Token</Label>
                <Input
                  type="password"
                  placeholder="1//0xxxx..."
                  value={mergedForm.gmail_refresh_token || ""}
                  onChange={(e) => setField("gmail_refresh_token", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Obtido no fluxo OAuth com consent screen. Veja o passo a passo na seção de instruções.
                </p>
              </div>

              {hasGmailCredentials && (
                <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-50 p-2 text-xs text-green-800 dark:bg-green-900/20 dark:text-green-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Credenciais configuradas. Use "Testar Conexão" para validar.
                </div>
              )}
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
                  <p className="text-xs text-muted-foreground">
                    Label do Gmail a monitorar (padrão: INBOX).
                  </p>
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
                disabled={testing || !hasGmailCredentials}
              >
                {testing ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Wifi className="mr-2 h-4 w-4" />
                )}
                {testing ? "Testando..." : "Testar Conexão"}
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={handleSync}
                disabled={syncing || !hasGmailCredentials}
              >
                {syncing ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
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
                    {testResult.success ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                      <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
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
                    <span className="font-medium">
                      {new Date(config.last_sync_at).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge
                      variant={
                        config.last_sync_status === "success"
                          ? "default"
                          : config.last_sync_status === "partial"
                          ? "secondary"
                          : "destructive"
                      }
                    >
                      {config.last_sync_status === "success"
                        ? "Sucesso"
                        : config.last_sync_status === "partial"
                        ? "Parcial"
                        : config.last_sync_status === "error"
                        ? "Erro"
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
                </>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Info className="h-4 w-4" />
                  <span>Nenhuma sincronização realizada ainda.</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Info className="h-4 w-4" /> Como Configurar
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-3">
              <div className="space-y-2">
                <p className="font-medium text-foreground text-sm">Passo a passo:</p>
                <ol className="list-decimal pl-4 space-y-1.5">
                  <li>Acesse o <strong>Google Cloud Console</strong></li>
                  <li>Crie ou selecione um projeto</li>
                  <li>Ative a <strong>Gmail API</strong></li>
                  <li>Configure a <strong>Tela de Consentimento OAuth</strong></li>
                  <li>Crie credenciais <strong>OAuth 2.0 (Web)</strong></li>
                  <li>Copie o <strong>Client ID</strong> e <strong>Client Secret</strong></li>
                  <li>Gere o <strong>Refresh Token</strong> via OAuth Playground</li>
                  <li>Cole os valores nos campos acima e salve</li>
                </ol>
              </div>

              <div className="pt-2">
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                >
                  <ExternalLink className="h-3 w-3" />
                  Abrir Google Cloud Console
                </a>
              </div>

              <Separator />

              <div className="flex gap-2 rounded-lg bg-accent/50 p-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  <p>
                    <strong>Importante:</strong> O Refresh Token é gerado uma única vez durante a autorização.
                    Use o Google OAuth Playground com seu Client ID/Secret para obtê-lo.
                  </p>
                  <p>
                    <strong>Escopo necessário:</strong> <code className="bg-muted px-1 rounded">https://www.googleapis.com/auth/gmail.modify</code>
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
