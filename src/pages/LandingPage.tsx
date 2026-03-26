import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Link } from "react-router-dom";
import {
  FileText, LayoutTemplate, PenTool, BarChart3, Shield,
  Clock, AlertTriangle, CheckCircle2, ArrowRight, Star,
  Zap, Users, TrendingUp, ChevronRight, Rocket, MessageCircle,
  Smartphone, Bot, Lock, Database, RefreshCw, Settings,
  Building2, UserCheck, Layers, Target, Send, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/* ── Scroll-animated wrapper ─────────────────────────────── */
function FadeIn({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20, filter: "blur(4px)" }}
      animate={inView ? { opacity: 1, y: 0, filter: "blur(0px)" } : {}}
      transition={{ duration: 0.65, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ── Browser frame wrapper ───────────────────────────────── */
function BrowserFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-card shadow-xl overflow-hidden ${className}`}>
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/60 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
        <span className="ml-2 text-[10px] text-muted-foreground">ProposalFlow</span>
      </div>
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

/* ── Testimonial data ────────────────────────────────────── */
const testimonials = [
  { name: "Marcos Oliveira", role: "Executivo de Negócios (ESN)", quote: "Reduzi em 70% o tempo que gastava montando propostas. Com os templates de escopo e cálculos automáticos, foco no que importa: vender.", avatar: "MO" },
  { name: "Carla Mendes", role: "Gerente de Negócios (GSN)", quote: "A visão consolidada do dashboard me dá controle total sobre o pipeline. Acompanho metas, conversão e ticket médio da minha equipe em tempo real.", avatar: "CM" },
  { name: "Rafael Souza", role: "Engenheiro de Valor", quote: "Os templates padronizaram nossas entregas. Consigo revisar escopos detalhados e me comunicar com o ESN diretamente nos itens da proposta.", avatar: "RS" },
];

const impactNumbers = [
  { value: "70%", label: "Menos tempo na criação de propostas" },
  { value: "5 min", label: "Para gerar proposta completa" },
  { value: "100%", label: "Digital, rastreável e auditável" },
  { value: "24/7", label: "Consultas via WhatsApp com IA" },
];

/* ══════════════════════════════════════════════════════════ */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      {/* ── Sticky nav ────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <span className="text-lg font-bold tracking-tight text-primary">ProposalFlow</span>
          <div className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
            <a href="#funcionalidades" className="transition-colors hover:text-foreground">Funcionalidades</a>
            <a href="#ciclo" className="transition-colors hover:text-foreground">Ciclo de Vida</a>
            <a href="#seguranca" className="transition-colors hover:text-foreground">Segurança</a>
            <a href="#resultados" className="transition-colors hover:text-foreground">Resultados</a>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild><Link to="/login">Entrar</Link></Button>
            <Button size="sm" asChild><a href="#cta-final">Agendar Demo</a></Button>
          </div>
        </div>
      </header>

      {/* ══ HERO ══════════════════════════════════════════ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/3" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 py-24 md:grid-cols-2 md:py-32">
          <FadeIn>
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-semibold text-primary">
              <Rocket className="h-3.5 w-3.5" /> Plataforma TOTVS Leste
            </span>
            <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight text-foreground md:text-5xl lg:text-[3.5rem]">
              Propostas comerciais TOTVS geradas com{" "}
              <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">inteligência e velocidade</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
              Do escopo à assinatura digital — automatize todo o ciclo de propostas de serviços e consultoria. 
              Gerencie pipeline, comissões e metas com dashboards inteligentes. Atenda seu cliente até pelo WhatsApp.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button size="lg" className="h-12 px-8 text-base shadow-sm" asChild>
                <a href="#cta-final">
                  Agendar Demonstração <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
              <Button variant="outline" size="lg" className="h-12 px-8 text-base" asChild>
                <a href="#funcionalidades">Ver Funcionalidades</a>
              </Button>
            </div>
          </FadeIn>

          <FadeIn delay={0.2} className="relative">
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-primary/10 via-transparent to-primary/5 blur-2xl" />
            <BrowserFrame className="relative">
              <div className="bg-background p-5">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  {[
                    { icon: TrendingUp, label: "Propostas Ganhas", val: "42", sub: "+18% mês" },
                    { icon: Target, label: "Realizado vs Meta", val: "87%", sub: "R$ 1.2M / R$ 1.4M" },
                    { icon: Clock, label: "Ticket Médio", val: "R$ 28.5k", sub: "Últimos 90 dias" },
                    { icon: Users, label: "Taxa Conversão", val: "34%", sub: "12 de 35 propostas" },
                  ].map((k, i) => (
                    <div key={i} className="rounded-lg border border-border bg-card p-3 shadow-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <k.icon className="h-3.5 w-3.5 text-primary" />
                        <span className="text-[10px] font-medium">{k.label}</span>
                      </div>
                      <p className="mt-1 text-lg font-bold text-foreground">{k.val}</p>
                      <p className="text-[9px] text-muted-foreground">{k.sub}</p>
                    </div>
                  ))}
                </div>
                {/* Mini chart bars */}
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-[10px] font-medium text-muted-foreground mb-2">Meta × Realizado × Previsto</p>
                  <div className="flex items-end gap-1 h-12">
                    {[
                      { meta: 100, real: 60, prev: 80 },
                      { meta: 100, real: 75, prev: 90 },
                      { meta: 100, real: 90, prev: 95 },
                      { meta: 100, real: 45, prev: 70 },
                      { meta: 100, real: 85, prev: 88 },
                      { meta: 100, real: 70, prev: 82 },
                    ].map((m, i) => (
                      <div key={i} className="flex-1 relative">
                        <div className="absolute inset-x-0 bottom-0 rounded-t bg-muted" style={{ height: `${m.meta * 0.48}px` }} />
                        <div className="absolute inset-x-0 bottom-0 rounded-t bg-primary/60" style={{ height: `${m.real * 0.48}px` }} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </BrowserFrame>
          </FadeIn>
        </div>
      </section>

      {/* ══ PROBLEMA vs SOLUÇÃO ═══════════════════════════ */}
      <section className="border-y border-border/50 bg-muted/30 py-24">
        <div className="mx-auto max-w-7xl px-6">
          <FadeIn className="mb-16 text-center">
            <h2 className="text-3xl font-bold text-foreground md:text-4xl">Antes e depois do ProposalFlow</h2>
            <p className="mt-3 text-muted-foreground">Veja como sua operação comercial vai evoluir</p>
          </FadeIn>

          <div className="grid gap-8 md:grid-cols-2">
            <FadeIn>
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">Como é hoje</h3>
                </div>
                <ul className="space-y-4">
                  {[
                    "Propostas montadas em planilhas com cálculos manuais de horas e valores",
                    "Sem padronização de escopo — cada vendedor monta do zero",
                    "Pipeline comercial invisível — GSN sem controle de equipe",
                    "Assinaturas por e-mail sem rastreamento de status",
                    "Impossível consultar proposta fora do escritório",
                    "Sem registro de comissões ou acompanhamento de metas",
                  ].map((t, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-[10px] font-bold text-destructive">✗</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeIn>

            <FadeIn delay={0.15}>
              <div className="rounded-2xl border border-success/20 bg-success/5 p-8">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10">
                    <CheckCircle2 className="h-5 w-5 text-success" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">Com o ProposalFlow</h3>
                </div>
                <ul className="space-y-4">
                  {[
                    "Propostas geradas em PDF/Google Docs com cálculos automáticos (horas, GP, impostos)",
                    "Templates de escopo por produto e categoria — monte em minutos",
                    "Dashboard com 3 abas: Pipeline, Performance e Análise de Resultado vs Meta",
                    "Assinatura digital integrada via TOTVS Assinatura Eletrônica (TAE)",
                    "Consulta e interação via WhatsApp com IA — identifica o vendedor pelo celular",
                    "Projeção de comissões e metas de vendas por ESN com acompanhamento mensal",
                  ].map((t, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/10 text-[10px] font-bold text-success">✓</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ══ FUNCIONALIDADES (6 cards) ═════════════════════ */}
      <section id="funcionalidades" className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <FadeIn className="mb-16 text-center">
            <span className="mb-3 inline-block text-sm font-semibold uppercase tracking-widest text-primary">Funcionalidades</span>
            <h2 className="text-3xl font-bold text-foreground md:text-4xl">Tudo que sua equipe comercial precisa</h2>
            <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">Do cadastro de clientes à assinatura digital, passando por cálculos financeiros, gestão de metas e atendimento via WhatsApp com IA.</p>
          </FadeIn>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: FileText,
                title: "Geração de Propostas",
                desc: "Wizard em 4 etapas (Dados Gerais → Escopo → Financeiro → Revisão). Cálculos automáticos com arredondamento configurável, fator tributário por unidade e condições de pagamento parceladas.",
                details: ["Escopo detalhado ou macro", "Projeto ou Banco de Horas", "Duplicação de propostas", "MIT automático"],
              },
              {
                icon: LayoutTemplate,
                title: "Templates de Escopo",
                desc: "Biblioteca de escopos por Produto e Categoria com estrutura hierárquica (Processos → Sub-itens). Horas pré-configuradas que podem ser ajustadas na proposta.",
                details: ["Hierarquia pai/filho", "Horas-padrão editáveis", "Inclusão seletiva de itens", "Notas internas por item"],
              },
              {
                icon: BarChart3,
                title: "Dashboard Inteligente",
                desc: "Três abas analíticas: Pipeline de propostas, Indicadores de Performance (Ticket Médio, Conversão, Penetração) e Análise de Resultado vs Meta com gráfico composto.",
                details: ["Filtro por período e vendedor", "Top 10 oportunidades", "Projeção de comissões", "KPIs em tempo real"],
              },
              {
                icon: PenTool,
                title: "Assinatura Digital (TAE)",
                desc: "Envio de propostas para assinatura eletrônica via TOTVS Assinatura Eletrônica. Acompanhamento de signatários com status individual e webhook de conclusão.",
                details: ["Múltiplos signatários", "Status em tempo real", "Validade jurídica", "Conclusão automática"],
              },
              {
                icon: MessageCircle,
                title: "WhatsApp com IA",
                desc: "Assistente inteligente que identifica o vendedor pelo celular cadastrado e aplica as mesmas regras de acesso do sistema. Consulte propostas, clientes e pipeline direto do celular.",
                details: ["Identifica por telefone", "Respeita perfil de acesso", "Contexto conversacional", "Múltiplos modelos de IA"],
              },
              {
                icon: Settings,
                title: "Gestão Completa",
                desc: "Cadastros de Clientes, Unidades, Time de Vendas, Produtos e Categorias. Importação via planilha, sincronização via API com ERP e controle granular de permissões.",
                details: ["5 perfis de acesso", "Integração com ERP", "Import/Sync automático", "Logs de auditoria"],
              },
            ].map((feat, i) => (
              <FadeIn key={i} delay={i * 0.08}>
                <div className="group flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-lg h-full">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <feat.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground">{feat.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground flex-1">{feat.desc}</p>
                  <div className="mt-4 grid grid-cols-2 gap-1.5">
                    {feat.details.map((d, j) => (
                      <span key={j} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <CheckCircle2 className="h-3 w-3 text-primary/60 shrink-0" />{d}
                      </span>
                    ))}
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ══ CICLO DE VIDA DA PROPOSTA ════════════════════ */}
      <section id="ciclo" className="border-y border-border/50 bg-muted/30 py-24">
        <div className="mx-auto max-w-7xl px-6">
          <FadeIn className="mb-16 text-center">
            <span className="mb-3 inline-block text-sm font-semibold uppercase tracking-widest text-primary">Ciclo de vida</span>
            <h2 className="text-3xl font-bold text-foreground md:text-4xl">Da criação ao fechamento</h2>
            <p className="mt-3 text-muted-foreground">Cada proposta segue um fluxo claro com rastreabilidade total</p>
          </FadeIn>

          <div className="grid gap-4 md:grid-cols-5">
            {[
              { step: "1", label: "Pendente", desc: "Proposta criada com dados gerais, escopo e financeiro definidos", icon: FileText, color: "bg-muted text-muted-foreground" },
              { step: "2", label: "Proposta Gerada", desc: "PDF e documento Google Docs gerados automaticamente", icon: Zap, color: "bg-primary/15 text-primary" },
              { step: "3", label: "Em Assinatura", desc: "Enviada para assinatura digital via TAE com signatários", icon: Send, color: "bg-warning/15 text-warning" },
              { step: "4", label: "Ganha", desc: "Assinaturas concluídas, comissões projetadas automaticamente", icon: CheckCircle2, color: "bg-success/15 text-success" },
              { step: "5", label: "Encerrada", desc: "Proposta perdida ou cancelada com registro histórico", icon: AlertTriangle, color: "bg-destructive/15 text-destructive" },
            ].map((s, i) => (
              <FadeIn key={i} delay={i * 0.1}>
                <div className="relative rounded-xl border border-border bg-card p-5 text-center shadow-sm h-full">
                  <div className={`mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${s.color}`}>
                    <s.icon className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-bold text-foreground">{s.label}</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{s.desc}</p>
                  {i < 4 && (
                    <ChevronRight className="absolute -right-3 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-border md:block" />
                  )}
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ══ SEGURANÇA E PERFIS ═══════════════════════════ */}
      <section id="seguranca" className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-12 md:grid-cols-2 items-center">
            <FadeIn>
              <span className="mb-3 inline-block text-sm font-semibold uppercase tracking-widest text-primary">Segurança & Controle</span>
              <h2 className="text-3xl font-bold text-foreground md:text-4xl">Cada perfil vê apenas o que deve ver</h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                Controle granular de acesso com 5 perfis, cada um com visibilidade restrita por Role-Level Security. 
                Autenticação corporativa via Google OAuth restrita ao domínio @totvs.com.br.
              </p>
              <div className="mt-8 space-y-4">
                {[
                  { icon: Shield, title: "Admin", desc: "Acesso total: cadastros, configurações, metas, permissões e todos os dados" },
                  { icon: UserCheck, title: "Vendedor (ESN)", desc: "Vê apenas seus clientes e propostas. Cria e gerencia seu pipeline" },
                  { icon: Users, title: "GSN", desc: "Supervisiona a equipe vinculada. Vê propostas onde é gestor atribuído" },
                  { icon: Layers, title: "Eng. Valor", desc: "Revisa escopos técnicos das propostas onde está vinculado" },
                  { icon: Eye, title: "Consulta CRA", desc: "Leitura apenas de propostas ganhas nas unidades autorizadas" },
                ].map((p, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <p.icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{p.title}</p>
                      <p className="text-xs text-muted-foreground">{p.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </FadeIn>

            <FadeIn delay={0.15}>
              <BrowserFrame>
                <div className="bg-background p-5 space-y-3">
                  <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-xs font-semibold text-foreground mb-3">🔐 Matriz de Permissões</p>
                    <div className="space-y-2">
                      {[
                        { resource: "Dashboard", roles: [true, true, true, true, false] },
                        { resource: "Propostas", roles: [true, true, true, true, true] },
                        { resource: "Clientes", roles: [true, true, false, false, false] },
                        { resource: "Time de Vendas", roles: [true, false, false, false, false] },
                        { resource: "Metas", roles: [true, false, false, false, false] },
                        { resource: "Configurações", roles: [true, false, false, false, false] },
                      ].map((r, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground w-24 shrink-0">{r.resource}</span>
                          <div className="flex gap-1.5">
                            {["A", "V", "G", "Q", "C"].map((role, j) => (
                              <span key={j} className={`h-4 w-4 rounded text-[8px] font-bold flex items-center justify-center ${r.roles[j] ? "bg-success/20 text-success" : "bg-muted text-muted-foreground/40"}`}>
                                {r.roles[j] ? "✓" : "–"}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-3">
                      {[
                        { l: "A", n: "Admin" }, { l: "V", n: "Vendedor" }, { l: "G", n: "GSN" }, { l: "E", n: "Eng. Valor" }, { l: "C", n: "Consulta" },
                      ].map((r, i) => (
                        <span key={i} className="text-[8px] text-muted-foreground">{r.l}={r.n}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
                    <Lock className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[10px] font-medium text-primary">Autenticação Google OAuth @totvs.com.br</span>
                  </div>
                </div>
              </BrowserFrame>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ══ WHATSAPP COM IA (destaque) ═══════════════════ */}
      <section className="border-y border-border/50 bg-muted/30 py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-12 md:grid-cols-2 items-center">
            <FadeIn delay={0.1} className="order-2 md:order-1">
              <BrowserFrame>
                <div className="bg-background p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/20">
                      <Bot className="h-3 w-3 text-success" />
                    </div>
                    <div className="rounded-lg rounded-tl-none bg-muted/80 px-3 py-2 max-w-[80%]">
                      <p className="text-[10px] text-foreground">Olá Marcos! Te identifiquei como ESN. Como posso ajudar?</p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="rounded-lg rounded-tr-none bg-primary/10 px-3 py-2 max-w-[80%]">
                      <p className="text-[10px] text-foreground">Qual o status da proposta 876500?</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/20">
                      <Bot className="h-3 w-3 text-success" />
                    </div>
                    <div className="rounded-lg rounded-tl-none bg-muted/80 px-3 py-2 max-w-[80%]">
                      <p className="text-[10px] text-foreground">
                        📋 Proposta *876500*<br/>
                        Cliente: *ABC Indústria*<br/>
                        Status: ✅ Ganha<br/>
                        💰 Líquido: R$ 48.000,00<br/>
                        💰 Bruto: R$ 56.160,00<br/>
                        📄 3x de R$ 18.720,00
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="rounded-lg rounded-tr-none bg-primary/10 px-3 py-2 max-w-[80%]">
                      <p className="text-[10px] text-foreground">Quantas propostas tenho em aberto?</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-success/5 border border-success/20 px-3 py-2 mt-1">
                    <Smartphone className="h-3.5 w-3.5 text-success" />
                    <span className="text-[10px] font-medium text-success">Identificação automática pelo celular cadastrado</span>
                  </div>
                </div>
              </BrowserFrame>
            </FadeIn>

            <FadeIn className="order-1 md:order-2">
              <span className="mb-3 inline-block text-sm font-semibold uppercase tracking-widest text-success">Novidade</span>
              <h2 className="text-3xl font-bold text-foreground md:text-4xl">Seu pipeline no bolso via WhatsApp</h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                O assistente de IA identifica o vendedor automaticamente pelo número de celular cadastrado 
                e aplica as mesmas regras de segurança do sistema web. Consulte propostas, clientes, valores 
                e status sem abrir o computador.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Identifica ESN, GSN, Eng. Valor ou Consulta pelo telefone",
                  "Aplica filtros de acesso idênticos ao sistema (RLS)",
                  "Contexto conversacional com histórico de mensagens",
                  "Múltiplos modelos de IA configuráveis (Gemini, GPT)",
                  "Notificação de CRA com e-mail automático",
                ].map((t, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0" />{t}
                  </li>
                ))}
              </ul>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ══ INTEGRAÇÕES ══════════════════════════════════ */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <FadeIn className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-foreground md:text-4xl">Integrado ao ecossistema TOTVS</h2>
            <p className="mt-3 text-muted-foreground">Conecte-se às ferramentas que sua equipe já utiliza</p>
          </FadeIn>
          <div className="grid gap-6 md:grid-cols-4">
            {[
              { icon: Database, title: "ERP Protheus", desc: "Sincronização automática de clientes via API com paginação e mapeamento de campos" },
              { icon: FileText, title: "Google Docs", desc: "Templates de proposta e MIT gerados automaticamente com preenchimento de placeholders" },
              { icon: PenTool, title: "TOTVS Assinatura", desc: "Envio e rastreamento de assinaturas digitais com validade jurídica via TAE" },
              { icon: MessageCircle, title: "WhatsApp (Twilio)", desc: "Webhook para recebimento de mensagens com processamento por IA e resposta automática" },
            ].map((int, i) => (
              <FadeIn key={i} delay={i * 0.1}>
                <div className="rounded-xl border border-border bg-card p-5 text-center shadow-sm h-full">
                  <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <int.icon className="h-5 w-5 text-primary" />
                  </div>
                  <p className="text-sm font-bold text-foreground">{int.title}</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{int.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ══ PROVA SOCIAL / RESULTADOS ════════════════════ */}
      <section id="resultados" className="border-t border-border/50 py-24">
        <div className="mx-auto max-w-7xl px-6">
          <FadeIn className="mb-20">
            <div className="rounded-2xl border border-primary/10 bg-gradient-to-r from-primary/5 to-primary/10 p-10">
              <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
                {impactNumbers.map((n, i) => (
                  <div key={i} className="text-center">
                    <p className="text-4xl font-extrabold text-primary md:text-5xl">{n.value}</p>
                    <p className="mt-2 text-sm font-medium text-muted-foreground">{n.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>

          <FadeIn className="mb-4 text-center">
            <h2 className="text-3xl font-bold text-foreground md:text-4xl">O que nossos usuários dizem</h2>
          </FadeIn>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {testimonials.map((t, i) => (
              <FadeIn key={i} delay={i * 0.1}>
                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm h-full flex flex-col">
                  <div className="mb-4 flex gap-1">
                    {[...Array(5)].map((_, j) => (
                      <Star key={j} className="h-4 w-4 fill-warning text-warning" />
                    ))}
                  </div>
                  <p className="text-sm italic leading-relaxed text-muted-foreground flex-1">"{t.quote}"</p>
                  <div className="mt-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {t.avatar}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.role}</p>
                    </div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ══ CTA FINAL ════════════════════════════════════ */}
      <section id="cta-final" className="relative overflow-hidden bg-primary py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.08),transparent_60%)]" />
        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <FadeIn>
            <h2 className="text-3xl font-extrabold text-primary-foreground md:text-4xl">
              Pronto para transformar sua operação comercial?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-primary-foreground/80">
              Automatize propostas, controle metas, acompanhe comissões e atenda seus clientes pelo WhatsApp — tudo em uma plataforma.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Button size="lg" variant="secondary" className="h-12 px-8 text-base font-semibold shadow-lg">
                Agendar Demonstração <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" className="h-12 border-primary-foreground/30 px-8 text-base text-primary-foreground hover:bg-primary-foreground/10" asChild>
                <Link to="/login">Acessar o Sistema</Link>
              </Button>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────── */}
      <footer className="border-t border-border bg-card py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted-foreground md:flex-row">
          <span className="font-semibold text-foreground">ProposalFlow</span>
          <p>© {new Date().getFullYear()} TOTVS Leste. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
