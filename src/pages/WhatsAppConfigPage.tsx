import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, MessageCircle, Bot, TestTube, Phone, Loader2, CheckCircle2, XCircle, History, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const AI_MODELS = [
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (Rápido)", desc: "Balanceado: velocidade e qualidade" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", desc: "Bom custo-benefício" },
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", desc: "Mais rápido e econômico" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", desc: "Máxima qualidade, mais lento" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini", desc: "Boa qualidade, custo moderado" },
  { value: "openai/gpt-5-nano", label: "GPT-5 Nano", desc: "Rápido, ideal para alto volume" },
  { value: "openai/gpt-5", label: "GPT-5", desc: "Máxima qualidade OpenAI" },
];

export default function WhatsAppConfigPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [enabled, setEnabled] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [aiModel, setAiModel] = useState("google/gemini-3-flash-preview");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [maxContext, setMaxContext] = useState(20);
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const { data: config, isLoading } = useQuery({
    queryKey: ["whatsapp_config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_config" as any)
        .select("*")
        .limit(1)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: messageStats } = useQuery({
    queryKey: ["whatsapp_stats"],
    queryFn: async () => {
      const { count: total } = await supabase
        .from("whatsapp_messages" as any)
        .select("*", { count: "exact", head: true });
      const { count: today } = await supabase
        .from("whatsapp_messages" as any)
        .select("*", { count: "exact", head: true })
        .gte("created_at", new Date().toISOString().split("T")[0]);
      return { total: total || 0, today: today || 0 };
    },
  });

  useEffect(() => {
    if (config) {
      setEnabled(config.enabled ?? false);
      setPhoneNumber(config.twilio_phone_number ?? "");
      setAiModel(config.ai_model ?? "google/gemini-3-flash-preview");
      setSystemPrompt(config.ai_system_prompt ?? "");
      setWelcomeMessage(config.welcome_message ?? "");
      setMaxContext(config.max_context_messages ?? 20);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("whatsapp_config" as any)
        .update({
          enabled,
          twilio_phone_number: phoneNumber,
          ai_model: aiModel,
          ai_system_prompt: systemPrompt,
          welcome_message: welcomeMessage,
          max_context_messages: maxContext,
        } as any)
        .eq("id", config?.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp_config"] });
      toast({ title: "Configurações salvas!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    },
  });

  const handleTest = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-webhook", {
        body: { From: testPhone || "whatsapp:+5511999999999", Body: "Olá, quais propostas temos em andamento?", MessageSid: "test-" + Date.now() },
      });
      if (error) throw error;
      toast({ title: "Teste enviado!", description: "Verifique os logs para a resposta da IA." });
    } catch (err: any) {
      toast({ title: "Erro no teste", description: err.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/configuracoes")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <MessageCircle className="h-6 w-6 text-green-600" />
            WhatsApp + IA
          </h1>
          <p className="text-sm text-muted-foreground">Configure a integração com WhatsApp via Twilio e o modelo de IA para respostas inteligentes</p>
        </div>
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || isLoading}>
          <Save className="mr-1 h-4 w-4" /> Salvar
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <div className="space-y-6">
          {/* Status Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge variant={enabled ? "default" : "secondary"}>{enabled ? "Ativo" : "Inativo"}</Badge>
              </div>
              <div className="mt-2 flex items-center gap-2">
                {enabled ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-muted-foreground" />}
                <span className="text-lg font-semibold">{enabled ? "Online" : "Offline"}</span>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <span className="text-sm text-muted-foreground">Mensagens Hoje</span>
              <p className="mt-2 text-lg font-semibold">{messageStats?.today ?? 0}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <span className="text-sm text-muted-foreground">Total de Mensagens</span>
              <p className="mt-2 text-lg font-semibold">{messageStats?.total ?? 0}</p>
            </div>
          </div>

          {/* General Config */}
          <div className="rounded-lg border border-border bg-card p-4 md:p-6 space-y-4">
            <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Phone className="h-4 w-4" /> Configuração Geral
            </h2>

            <div className="flex items-center gap-3">
              <Switch checked={enabled} onCheckedChange={setEnabled} />
              <Label>Ativar integração WhatsApp</Label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Número WhatsApp (Twilio)</Label>
                <Input placeholder="+5511999999999" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
                <p className="text-xs text-muted-foreground">Número do Twilio WhatsApp Sandbox ou número verificado</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">URL do Webhook (para configurar no Twilio)</Label>
                <div className="flex gap-2">
                  <Input readOnly value={webhookUrl} className="text-xs font-mono" />
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(webhookUrl); toast({ title: "URL copiada!" }); }}>
                    Copiar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Cole esta URL no campo "When a message comes in" do Twilio WhatsApp Sandbox</p>
              </div>
            </div>
          </div>

          {/* AI Config */}
          <div className="rounded-lg border border-border bg-card p-4 md:p-6 space-y-4">
            <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Bot className="h-4 w-4" /> Configuração da IA
            </h2>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Modelo de IA</Label>
                <Select value={aiModel} onValueChange={setAiModel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_MODELS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        <div>
                          <span className="font-medium">{m.label}</span>
                          <span className="ml-2 text-xs text-muted-foreground">— {m.desc}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Máximo de Mensagens no Contexto</Label>
                <Input type="number" value={maxContext} onChange={(e) => setMaxContext(Number(e.target.value))} min={5} max={50} />
                <p className="text-xs text-muted-foreground">Quantidade de mensagens anteriores enviadas à IA para manter contexto</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Prompt do Sistema (Personalidade da IA)</Label>
              <Textarea rows={5} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="Você é um assistente comercial..." />
              <p className="text-xs text-muted-foreground">Define como a IA se comporta. Inclua instruções sobre tom, formato e limites.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Mensagem de Boas-Vindas</Label>
              <Textarea rows={3} value={welcomeMessage} onChange={(e) => setWelcomeMessage(e.target.value)} placeholder="Olá! Como posso ajudar?" />
            </div>
          </div>

          {/* Test Section */}
          <div className="rounded-lg border border-border bg-card p-4 md:p-6 space-y-4">
            <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
              <TestTube className="h-4 w-4" /> Testar Integração
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Telefone de Teste (opcional)</Label>
                <Input placeholder="whatsapp:+5511999999999" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
              </div>
              <div className="flex items-end">
                <Button onClick={handleTest} disabled={testing} variant="outline">
                  {testing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <TestTube className="mr-1 h-4 w-4" />}
                  Enviar Mensagem de Teste
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Simula uma mensagem recebida e mostra a resposta da IA nos logs. Útil para validar prompt e modelo.</p>
          </div>

          {/* Setup Instructions */}
          <div className="rounded-lg border border-border bg-card p-4 md:p-6 space-y-3">
            <h2 className="text-sm font-medium text-foreground">📋 Como Configurar</h2>
            <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Crie uma conta no <a href="https://www.twilio.com" target="_blank" rel="noopener" className="text-primary underline">Twilio</a> e ative o WhatsApp Sandbox</li>
              <li>No console Twilio, vá em <strong>Messaging → Try it out → Send a WhatsApp message</strong></li>
              <li>No campo <strong>"When a message comes in"</strong>, cole a URL do webhook acima</li>
              <li>Conecte o Twilio na seção de Integrações do Lovable (conector Twilio)</li>
              <li>Configure o número e modelo de IA desejado nesta página</li>
              <li>Ative a integração e envie uma mensagem de teste!</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
