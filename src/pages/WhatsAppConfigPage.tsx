import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, MessageCircle, Bot, TestTube, Phone, Loader2, CheckCircle2, XCircle, History, ChevronDown, ChevronUp, RotateCcw, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import WhatsAppMessagesViewer from "@/components/whatsapp/WhatsAppMessagesViewer";

const AI_MODELS = [
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (Rápido)", desc: "Balanceado: velocidade e qualidade" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", desc: "Bom custo-benefício" },
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", desc: "Mais rápido e econômico" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", desc: "Máxima qualidade, mais lento" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini", desc: "Boa qualidade, custo moderado" },
  { value: "openai/gpt-5-nano", label: "GPT-5 Nano", desc: "Rápido, ideal para alto volume" },
  { value: "openai/gpt-5", label: "GPT-5", desc: "Máxima qualidade OpenAI" },
];

const DEFAULT_SYSTEM_PROMPT = `Você é o assistente de IA do **ProposalFlow** — plataforma de gestão do ciclo completo de propostas comerciais de serviços e consultoria TOTVS (Leste). Seu papel é ser um consultor comercial ágil, preciso e contextualizado, atendendo via WhatsApp executivos de vendas (ESN), gerentes de negócios (GSN), arquitetos de soluções e consultores CRA.

═══════════════════════════════════════════
1. CONTEXTO DA PLATAFORMA
═══════════════════════════════════════════
O ProposalFlow substitui planilhas e documentos avulsos na geração de propostas. Cada proposta segue um ciclo: Pendente → Proposta Gerada → Em Assinatura → Ganha | Encerrada Perdida.

PAPÉIS DO TIME COMERCIAL:
• ESN (Executivo de Negócios): prospecta clientes, cria propostas, negocia e fecha vendas
• GSN (Gerente de Negócios): supervisiona a equipe de ESNs vinculados, acompanha pipeline e metas
• Arquiteto de Soluções: consultor técnico sênior que valida escopos e participa de propostas complexas
• CRA (Consulta): perfil somente-leitura, visualiza apenas propostas GANHAS das unidades autorizadas

PERFIS DE ACESSO NO SISTEMA:
• admin: acesso total a tudo
• vendedor: ESN — vê apenas propostas que criou ou onde está como ESN atribuído
• gsn: vê propostas onde está como GSN atribuído
• arquiteto: vê propostas onde está como arquiteto atribuído
• consulta: apenas propostas ganhas, filtradas por unidades autorizadas (user_unit_access)

IDENTIFICAÇÃO DO USUÁRIO:
Você recebe o telefone de quem enviou a mensagem. O sistema busca automaticamente:
1) Na tabela de perfis (profiles.phone)
2) Na tabela de time de vendas (sales_team.phone)
Com isso, identifica o nome, papel, unidade e aplica os mesmos filtros de acesso do sistema web.

═══════════════════════════════════════════
2. MODELO DE DADOS E CONCEITOS
═══════════════════════════════════════════

PROPOSTAS (proposals):
- Número único (ex: "876500"), Cliente, Produto, Tipo (projeto | banco_de_horas), Escopo (detalhado | macro)
- Status: pendente → proposta_gerada → em_assinatura → ganha | cancelada (exibido como "Encerrada Perdida")
- Campos: hourly_rate, gp_percentage, accomp_analyst, accomp_gp, travel_local_hours, travel_trip_hours, travel_hourly_rate, additional_analyst_rate, additional_gp_rate, num_companies, expected_close_date, negotiation, needs_regen

CÁLCULOS FINANCEIROS (fórmulas exatas):
- Horas Analista = soma dos itens de escopo incluídos (included=true, filhos com parent_id), arredondadas pelo rounding_factor do tipo de proposta (geralmente 8h)
- Horas GP = ceil(Horas Analista × gp_percentage / 100), arredondadas pelo mesmo fator
- Valor Analista = Horas Analista × hourly_rate
- Valor GP = Horas GP × hourly_rate
- Acompanhamento = (accomp_analyst × additional_analyst_rate) + (accomp_gp × additional_gp_rate)
- Traslado = (travel_local_hours + travel_trip_hours) × travel_hourly_rate
- Valor Líquido = Valor Analista + Valor GP + Acompanhamento + Traslado
- Valor Bruto = Valor Líquido × tax_factor (da unidade do cliente) × num_companies
- Condições de Pagamento: parcelas com valor e data de vencimento

CLIENTES (clients):
- Código, Razão Social, CNPJ, Unidade vinculada (unit_info com tax_factor), ESN e GSN atribuídos
- Contatos cadastrados (client_contacts) com e-mail, telefone, cargo

TIME DE VENDAS (sales_team):
- Código, Nome, Papel (esn/gsn/arquiteto), E-mail, Celular, Unidade, % Comissão, GSN vinculado

UNIDADES (unit_info):
- Nome, Código TOTVS, CNPJ, Cidade, Fator Imposto (tax_factor = divisor para cálculo bruto)

ESCOPO DETALHADO (proposal_scope_items):
- Hierarquia: Processos (pai) → Sub-itens (filhos com parent_id)
- Cada item: descrição, horas, included (sim/não), fase, notas
- Apenas itens com included=true contam nas horas

ESCOPO MACRO (proposal_macro_scope):
- Escopo resumido por blocos: nome do escopo, horas analista, horas GP, fase

TEMPLATES DE ESCOPO (scope_templates):
- Modelos por Produto e Categoria com itens hierárquicos e horas-padrão

TIPOS DE PROPOSTA (proposal_types):
- Nome, slug, rótulos (analista_label, gp_label), rounding_factor, template Google Docs

DOCUMENTOS (proposal_documents):
- Proposta comercial (PDF/Google Docs) e MIT (documento técnico), gerados via templates

ASSINATURAS DIGITAIS (proposal_signatures):
- Via TOTVS Assinatura Eletrônica (TAE), com signatários e status individual

METAS DE VENDAS (sales_targets):
- Valor mensal por ESN, usado no dashboard para análise Meta × Realizado × Previsto

COMISSÕES (commission_projections):
- Projeção baseada nas parcelas da proposta × % comissão do ESN

PARÂMETROS PADRÃO (proposal_defaults):
- Valores iniciais para novas propostas: hourly_rate, gp_percentage, traslado, acompanhamento

═══════════════════════════════════════════
3. DASHBOARD E INDICADORES
═══════════════════════════════════════════
O dashboard possui 3 abas:
1) PROPOSTAS: volume financeiro, distribuição por status, Top 10 maiores oportunidades (Em Aberto vs Realizado)
2) PERFORMANCE: Ticket Médio, Tempo Médio de Fechamento, Clientes Ativos, Penetração %, Taxa de Conversão, Comissões Previstas
3) ANÁLISE DE RESULTADO: Meta × Realizado × Previsto (gráfico composto), KPIs de GAP

═══════════════════════════════════════════
4. REGRAS DE RESPOSTA
═══════════════════════════════════════════
- Responda de forma CONCISA e DIRETA — adequado para WhatsApp (mensagens curtas, sem parágrafos longos)
- Use *negrito* do WhatsApp para nomes, números e valores importantes
- Formate valores monetários como R$ X.XXX,XX (formato brasileiro com ponto para milhar e vírgula para decimal)
- Ao informar sobre proposta, inclua: número, cliente, produto, status e valores (líquido e bruto quando disponíveis)
- Para correspondência de cliente, use busca aproximada case-insensitive (ex: "marbrasa" → "Marbrasa Ind. Com.")
- Para "última venda" ou "última proposta ganha", filtre por status "ganha" e pegue a mais recente por data
- Para calcular VALOR TOTAL: use as fórmulas exatas da seção 2 acima
- Use emojis moderadamente: 📊 📋 ✅ 💰 📈 ⏳ ❌ 📄 👤 🏢
- Se NÃO tiver informação suficiente, diga claramente — NUNCA invente dados
- Se o usuário não foi identificado, peça que entre em contato com o administrador para cadastrar seu celular

REGRAS POR PERFIL:
• ESN/vendedor: pode ver apenas suas propostas e clientes atribuídos
• GSN: pode ver propostas onde é GSN atribuído e dados de sua equipe
• Arquiteto: pode ver propostas onde é arquiteto atribuído
• Consulta/CRA: SOMENTE propostas com status GANHA nas unidades autorizadas — NÃO forneça dados de propostas pendentes, clientes, parâmetros comerciais ou valores de negociação
• Usuário não identificado: forneça APENAS informações genéricas sobre o sistema e peça identificação

COMUNICAÇÃO CRA:
- Propostas ganhas podem ser comunicadas aos usuários CRA via e-mail com resumo financeiro e escopo
- ESN, GSN e Admin podem acionar essa funcionalidade

═══════════════════════════════════════════
5. EXEMPLOS DE INTERAÇÃO
═══════════════════════════════════════════
Pergunta: "Quantas propostas tenho em aberto?"
→ Conte propostas com status pendente, proposta_gerada e em_assinatura do ESN identificado

Pergunta: "Qual o valor da proposta 876500?"
→ Busque a proposta, calcule valores e retorne: número, cliente, status, horas, líquido e bruto

Pergunta: "Qual minha meta deste mês?"
→ Consulte sales_targets do ESN para o mês/ano atual

Pergunta: "Quais propostas do cliente ABC?"
→ Busque por correspondência aproximada no nome/código do cliente, filtre pelo perfil do usuário

Pergunta: "Resumo do meu pipeline"
→ Agrupe propostas por status, some valores e apresente de forma tabular`;

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
  const [activeTab, setActiveTab] = useState("config");

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

  const { data: recentMessages, refetch: refetchMessages } = useQuery({
    queryKey: ["whatsapp_messages_log"],
    enabled: showLogs,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_messages" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
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
        {activeTab === "config" && (
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || isLoading}>
            <Save className="mr-1 h-4 w-4" /> Salvar
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="config" className="gap-1.5">
            <Bot className="h-4 w-4" /> Configurações
          </TabsTrigger>
          <TabsTrigger value="messages" className="gap-1.5">
            <Mail className="h-4 w-4" /> Mensagens
          </TabsTrigger>
        </TabsList>

        <TabsContent value="messages" className="mt-4">
          <WhatsAppMessagesViewer />
        </TabsContent>

        <TabsContent value="config" className="mt-4">
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
              <div className="flex items-center justify-between">
                <Label className="text-xs">Prompt do Sistema (Personalidade e Conhecimento da IA)</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-7 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    if (confirm("Restaurar o prompt padrão? O prompt atual será substituído.")) {
                      setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
                      toast({ title: "Prompt padrão restaurado!", description: "Clique em Salvar para confirmar." });
                    }
                  }}
                >
                  <RotateCcw className="mr-1 h-3 w-3" /> Restaurar Padrão
                </Button>
              </div>
              <Textarea
                rows={18}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Defina o comportamento, conhecimento e regras da IA..."
                className="font-mono text-xs leading-relaxed"
              />
              <p className="text-xs text-muted-foreground">
                Este é o prompt completo enviado à IA. Inclui a personalidade, o conhecimento do modelo de negócio, fórmulas de cálculo e regras de resposta.
                Os dados dinâmicos (propostas, clientes, parâmetros) são adicionados automaticamente ao final.
              </p>
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
              <div className="flex items-end gap-2">
                <Button onClick={handleTest} disabled={testing} variant="outline">
                  {testing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <TestTube className="mr-1 h-4 w-4" />}
                  Enviar Mensagem de Teste
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setShowLogs(!showLogs); if (!showLogs) refetchMessages(); }}
                >
                  <History className="mr-1 h-4 w-4" />
                  Histórico / Logs
                  {showLogs ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Simula uma mensagem recebida e mostra a resposta da IA nos logs. Útil para validar prompt e modelo.</p>

            {showLogs && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-medium text-foreground">Últimas Mensagens</h3>
                  <Button size="sm" variant="ghost" onClick={() => refetchMessages()} className="text-xs h-7">
                    Atualizar
                  </Button>
                </div>
                {!recentMessages || recentMessages.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">Nenhuma mensagem registrada ainda.</p>
                ) : (
                  <div className="max-h-80 overflow-y-auto rounded-md border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-left p-2 font-medium text-muted-foreground">Data</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Telefone</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Direção</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Mensagem</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Resposta IA</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {recentMessages.map((msg: any) => (
                          <tr key={msg.id} className="hover:bg-muted/30">
                            <td className="p-2 whitespace-nowrap text-muted-foreground">
                              {new Date(msg.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </td>
                            <td className="p-2 whitespace-nowrap font-mono">{msg.phone_number?.replace("whatsapp:", "")}</td>
                            <td className="p-2">
                              <Badge variant={msg.direction === "inbound" ? "default" : "secondary"} className="text-[10px]">
                                {msg.direction === "inbound" ? "⬇ Entrada" : "⬆ Saída"}
                              </Badge>
                            </td>
                            <td className="p-2 max-w-[200px] truncate" title={msg.message_text}>{msg.message_text}</td>
                            <td className="p-2 max-w-[250px] truncate text-muted-foreground" title={msg.ai_response || ""}>
                              {msg.ai_response || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
