import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, ExternalLink, Zap, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export default function TaeConfigPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; error?: string; latency_ms?: number } | null>(null);

  const { data: config, refetch } = useQuery({
    queryKey: ["tae_config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tae_config").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({
    environment: "staging",
    base_url: "https://totvssign.staging.totvs.app",
    application_id: "",
    company_cnpj: "",
    service_user_email: "",
    notes: "",
  });

  useEffect(() => {
    if (config) {
      setForm({
        environment: config.environment || "staging",
        base_url: config.base_url || "https://totvssign.staging.totvs.app",
        application_id: config.application_id || "",
        company_cnpj: config.company_cnpj || "",
        service_user_email: config.service_user_email || "",
        notes: config.notes || "",
      });
    }
  }, [config]);

  function handleEnvironmentChange(env: string) {
    const baseUrl = env === "production"
      ? "https://totvssign.totvs.app"
      : "https://totvssign.staging.totvs.app";
    setForm((f) => ({ ...f, environment: env, base_url: baseUrl }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (config?.id) {
        const { error } = await supabase.from("tae_config").update({
          ...form,
          updated_at: new Date().toISOString(),
        } as any).eq("id", config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tae_config").insert(form as any);
        if (error) throw error;
      }
      toast({ title: "Configuração salva!" });
      refetch();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/configuracoes")} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">TOTVS Assinatura Eletrônica</h1>
          <p className="text-sm text-muted-foreground">Configure a integração com o TAE para envio de propostas para assinatura</p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 space-y-6">
        <div>
          <h2 className="text-base font-semibold text-foreground mb-1">Parâmetros de Conexão</h2>
          <p className="text-xs text-muted-foreground">
            A autenticação no TAE é feita individualmente por cada usuário via Google Identity (conta corporativa).
            Não é necessário configurar credenciais de API — cada usuário autentica com seu próprio login.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Ambiente</Label>
            <Select value={form.environment} onValueChange={handleEnvironmentChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="staging">Homologação (Staging)</SelectItem>
                <SelectItem value="production">Produção</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">URL Base</Label>
            <Input value={form.base_url} readOnly className="bg-muted" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Application ID</Label>
            <Input
              placeholder="ID gerado pelo TAE para assinatura sem cadastro"
              value={form.application_id}
              onChange={(e) => setForm((f) => ({ ...f, application_id: e.target.value }))}
            />
            <p className="text-[10px] text-muted-foreground">
              Necessário apenas para assinaturas sem cadastro. Solicitar via e-mail ao TAE.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">CNPJ da Empresa (sem pontuação)</Label>
            <Input
              placeholder="00000000000000"
              value={form.company_cnpj}
              onChange={(e) => setForm((f) => ({ ...f, company_cnpj: e.target.value }))}
            />
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <h2 className="text-base font-semibold text-foreground mb-1">Usuário de Serviço</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Conta utilizada pela edge function para autenticar no TAE via Google Identity. A senha é armazenada como secret seguro.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">E-mail do Usuário de Serviço</Label>
              <Input
                placeholder="servico@empresa.com.br"
                value={form.service_user_email}
                onChange={(e) => setForm((f) => ({ ...f, service_user_email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Senha do Usuário de Serviço</Label>
              <div className="flex items-center gap-2 h-10">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  ● Configurada como secret seguro
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Gerenciada via Secrets do projeto (TAE_SERVICE_USER_PASSWORD).
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Observações</Label>
          <Textarea
            placeholder="Anotações sobre a integração..."
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={3}
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Salvando..." : "Salvar Configuração"}
          </Button>
          <Button variant="outline" onClick={handleTest} disabled={testing}>
            {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
            {testing ? "Testando..." : "Testar Conexão"}
          </Button>
          {testResult && (
            <div className={`flex items-center gap-1.5 text-xs font-medium ${testResult.success ? "text-primary" : "text-destructive"}`}>
              {testResult.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              <span>{testResult.success ? testResult.message : testResult.error}</span>
              {testResult.latency_ms != null && (
                <span className="text-muted-foreground">({testResult.latency_ms}ms)</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold text-foreground">Fluxo de Integração</h2>
        <div className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">1</span>
            <p>Autenticação via Google Identity do usuário logado (POST /v3/auth/login) → Token JWE</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">2</span>
            <p>Upload do documento da proposta (POST /v1/envelopes/upload)</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">3</span>
            <p>Criação da publicação com signatários (POST /v1/publicacoes)</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">4</span>
            <p>Monitoramento do status de assinatura (GET /v2/publicacoes/{"{id}"})</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => window.open("https://totvs-sign.readme.io/reference/", "_blank")}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Documentação API
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open("https://totvssign.staging.totvs.app/identityintegration/swagger/index.html", "_blank")}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Swagger Identity
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open("https://totvssign.staging.totvs.app/documents/swagger/index.html", "_blank")}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Swagger Documents
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open("https://totvssign.staging.totvs.app/signintegration/swagger/index.html?urls.primaryName=V2", "_blank")}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Swagger Sign
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 space-y-3">
        <h2 className="text-base font-semibold text-foreground">Rotas Principais da API</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 text-xs font-medium text-muted-foreground">API</th>
                <th className="text-left py-2 text-xs font-medium text-muted-foreground">Rota</th>
                <th className="text-left py-2 text-xs font-medium text-muted-foreground">Descrição</th>
              </tr>
            </thead>
            <tbody className="text-foreground">
              <tr className="border-b border-border/50">
                <td className="py-2 font-mono text-xs">Identity</td>
                <td className="py-2 font-mono text-xs">POST /v3/auth/login</td>
                <td className="py-2 text-xs text-muted-foreground">Login / gerar token JWE</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 font-mono text-xs">Documents</td>
                <td className="py-2 font-mono text-xs">POST /v1/envelopes/upload</td>
                <td className="py-2 text-xs text-muted-foreground">Upload de documentos (.pdf, .docx)</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 font-mono text-xs">Documents</td>
                <td className="py-2 font-mono text-xs">POST /v1/publicacoes</td>
                <td className="py-2 text-xs text-muted-foreground">Publicar documento com signatários</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 font-mono text-xs">Documents</td>
                <td className="py-2 font-mono text-xs">GET /v2/publicacoes/{"{id}"}</td>
                <td className="py-2 text-xs text-muted-foreground">Consultar status da publicação</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 font-mono text-xs">Sign</td>
                <td className="py-2 font-mono text-xs">POST /v2/assinaturas</td>
                <td className="py-2 text-xs text-muted-foreground">Assinar eletronicamente</td>
              </tr>
              <tr>
                <td className="py-2 font-mono text-xs">Sign</td>
                <td className="py-2 font-mono text-xs">POST /v2/assinaturas/rejeitar</td>
                <td className="py-2 text-xs text-muted-foreground">Rejeitar documento</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}