import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Link } from "react-router-dom";
import {
  FileText, LayoutTemplate, PenTool, BarChart3, Shield,
  Clock, CheckCircle2, ArrowRight,
  Zap, Users, TrendingUp, ChevronRight, Rocket, MessageCircle,
  Smartphone, Bot, Lock, Database, Settings,
  UserCheck, Layers, Eye, Briefcase, Sparkles,
  FolderKanban, Calculator, ClipboardList, Send, Target,
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

const impactNumbers = [
  { value: "4 Etapas", label: "Wizard guiado de ponta a ponta" },
  { value: "5 Perfis", label: "Controle granular de acesso" },
  { value: "100%", label: "Digital, rastreável e auditável" },
  { value: "IA", label: "Assistente xAI + WhatsApp integrados" },
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
            <a href="#ia" className="transition-colors hover:text-foreground">Assistente IA</a>
          </div>
          <Button size="sm" asChild><Link to="/login">Acessar o Sistema <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link></Button>
        </div>
      </header>

      {/* ══ HERO ══════════════════════════════════════════ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/3" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 py-24 md:grid-cols-2 md:py-32">
          <FadeIn>
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-semibold text-primary">
              <Rocket className="h-3.5 w-3.5" /> Ferramenta Interna — Equipe Comercial
            </span>
            <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight text-foreground md:text-5xl lg:text-[3.5rem]">
              Sua central de{" "}
              <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">oportunidades e propostas</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
              Crie oportunidades, gere propostas, envie para assinatura digital e acompanhe metas — 
              tudo em um único lugar com assistente de IA integrada.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button size="lg" className="h-12 px-8 text-base shadow-sm" asChild>
                <Link to="/login">
                  Começar Agora <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" className="h-12 px-8 text-base" asChild>
                <a href="#funcionalidades">Conhecer Funcionalidades</a>
              </Button>
            </div>
          </FadeIn>

          <FadeIn delay={0.2} className="relative">
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-primary/10 via-transparent to-primary/5 blur-2xl" />
            <BrowserFrame className="relative">
              <div className="bg-background p-5">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  {[
                    { icon: TrendingUp, label: "Oportunidades Ganhas", val: "42", sub: "+18% mês" },
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
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-[10px] font-medium text-muted-foreground mb-2">Meta × Realizado × Previsto</p>
                  <div className="flex items-end gap-1 h-12">
                    {[
                      { meta: 100, real: 60 },
                      { meta: 100, real: 75 },
                      { meta: 100, real: 90 },
                      { meta: 100, real: 45 },
                      { meta: 100, real: 85 },
                      { meta: 100, real: 70 },
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

      {/* ══ NÚMEROS DE IMPACTO ════════════════════════════ */}
      <section className="border-y border-border/50 bg-muted/30 py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="rounded-2xl border border-primary/10 bg-gradient-to-r from-primary/5 to-primary/10 p-10">
            <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
              {impactNumbers.map((n, i) => (
                <FadeIn key={i} delay={i * 0.08}>
                  <div className="text-center">
                    <p className="text-3xl font-extrabold text-primary md:text-4xl">{n.value}</p>
                    <p className="mt-2 text-sm font-medium text-muted-foreground">{n.label}</p>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ FUNCIONALIDADES (8 cards) ═════════════════════ */}
      <section id="funcionalidades" className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <FadeIn className="mb-16 text-center">
            <span className="mb-3 inline-block text-sm font-semibold uppercase tracking-widest text-primary">Funcionalidades</span>
            <h2 className="text-3xl font-bold text-foreground md:text-4xl">Tudo que você precisa no dia a dia</h2>
            <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">Da criação da oportunidade à assinatura digital, passando por cálculos financeiros automáticos, gestão de projetos, metas e IA.</p>
          </FadeIn>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: FileText,
                title: "Oportunidades",
                desc: "Wizard em 4 etapas: Dados Gerais → Escopo → Financeiro → Revisão. Cálculos automáticos com Tipo de Oportunidade e Itens de Serviço configuráveis.",
                details: ["Escopo detalhado ou macro", "Projeto ou Banco de Horas", "Duplicação de oportunidades", "Validação de ESN obrigatório"],
              },
              {
                icon: LayoutTemplate,
                title: "Templates de Escopo",
                desc: "Biblioteca de escopos por Produto e Categoria com hierarquia (Processos → Sub-itens). Horas e notas pré-configuradas herdadas ao usar.",
                details: ["Hierarquia pai/filho", "Horas-padrão editáveis", "Notas internas por item", "Herança ao projeto"],
              },
              {
                icon: Calculator,
                title: "Tipos de Oportunidade",
                desc: "Cadastro de tipos com Itens de Serviço configuráveis (label, valor/hora, % go-live, % adicional, arredondamento). Herdados automaticamente.",
                details: ["Itens de serviço dinâmicos", "% Go-Live por item", "Arredondamento configurável", "Template de documento"],
              },
              {
                icon: FolderKanban,
                title: "Projetos",
                desc: "Gerados automaticamente a partir de oportunidades ganhas. Escopo editável, anexos, resumo financeiro e controle de status.",
                details: ["Geração automática", "Escopo editável", "Resumo financeiro", "Status: em andamento/concluído"],
              },
              {
                icon: BarChart3,
                title: "Dashboard",
                desc: "3 abas analíticas: Pipeline, Performance (Ticket Médio, Conversão, Penetração) e Resultado vs Meta com Top 10 e projeção de comissões.",
                details: ["Filtro por período/vendedor", "Top 10 oportunidades", "Projeção de comissões", "KPIs em tempo real"],
              },
              {
                icon: PenTool,
                title: "Assinatura Digital",
                desc: "Envio para assinatura eletrônica via TOTVS Assinatura Eletrônica (TAE). Acompanhamento de signatários com status individual e webhook.",
                details: ["Múltiplos signatários", "Status em tempo real", "Validade jurídica", "Conclusão automática"],
              },
              {
                icon: Sparkles,
                title: "Assistente xAI",
                desc: "Assistente digital integrada ao sistema com IA. Consulta propostas, projetos e clientes respeitando seu perfil de acesso. Disponível em qualquer tela.",
                details: ["Acesso contextual", "Respeita permissões", "Múltiplos modelos IA", "Histórico de conversa"],
              },
              {
                icon: Settings,
                title: "Gestão & Integrações",
                desc: "Cadastros de Clientes, Unidades, Equipe Comercial, Produtos. Importação por planilha, sync via API com ERP, Grupos de Usuários e permissões.",
                details: ["5 perfis de acesso", "Integração ERP Protheus", "Grupos de usuários", "Logs de auditoria"],
              },
            ].map((feat, i) => (
              <FadeIn key={i} delay={i * 0.06}>
                <div className="group flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-lg h-full">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <feat.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-bold text-foreground">{feat.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground flex-1">{feat.desc}</p>
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

      {/* ══ CICLO DE VIDA DA OPORTUNIDADE ═════════════════ */}
      <section id="ciclo" className="border-y border-border/50 bg-muted/30 py-24">
        <div className="mx-auto max-w-7xl px-6">
          <FadeIn className="mb-16 text-center">
            <span className="mb-3 inline-block text-sm font-semibold uppercase tracking-widest text-primary">Ciclo de vida</span>
            <h2 className="text-3xl font-bold text-foreground md:text-4xl">Da criação ao fechamento</h2>
            <p className="mt-3 text-muted-foreground">Cada oportunidade segue um fluxo claro com rastreabilidade total</p>
          </FadeIn>

          <div className="grid gap-4 md:grid-cols-6">
            {[
              { step: "1", label: "Pendente", desc: "Oportunidade criada com dados gerais, escopo e financeiro", icon: ClipboardList, color: "bg-muted text-muted-foreground" },
              { step: "2", label: "Proposta Gerada", desc: "PDF e Google Docs gerados com placeholders automáticos", icon: Zap, color: "bg-primary/15 text-primary" },
              { step: "3", label: "Análise EV", desc: "Engenheiro de Valor revisa escopo técnico", icon: Eye, color: "bg-accent text-accent-foreground" },
              { step: "4", label: "Em Assinatura", desc: "Enviada para assinatura digital via TAE", icon: Send, color: "bg-warning/15 text-warning" },
              { step: "5", label: "Ganha", desc: "Assinaturas concluídas, projeto gerado e comissões projetadas", icon: CheckCircle2, color: "bg-success/15 text-success" },
              { step: "6", label: "Cancelada", desc: "Oportunidade perdida com registro histórico completo", icon: Briefcase, color: "bg-destructive/15 text-destructive" },
            ].map((s, i) => (
              <FadeIn key={i} delay={i * 0.08}>
                <div className="relative rounded-xl border border-border bg-card p-4 text-center shadow-sm h-full">
                  <div className={`mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${s.color}`}>
                    <s.icon className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-bold text-foreground">{s.label}</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{s.desc}</p>
                  {i < 5 && (
                    <ChevronRight className="absolute -right-3 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-border md:block" />
                  )}
                </div>
              </FadeIn>
            ))}
          </div>

          {/* Fluxo do Projeto */}
          <FadeIn className="mt-12">
            <div className="rounded-2xl border border-border bg-card p-6">
              <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <FolderKanban className="h-5 w-5 text-primary" /> Ciclo do Projeto (pós oportunidade ganha)
              </h3>
              <div className="grid gap-3 md:grid-cols-4">
                {[
                  { label: "Em Andamento", desc: "Projeto gerado automaticamente com escopo herdado", color: "bg-primary/10 text-primary" },
                  { label: "Em Revisão", desc: "Escopo pode ser ajustado pela equipe", color: "bg-warning/10 text-warning" },
                  { label: "Concluído", desc: "Finalizado quando oportunidade é ganha definitivamente", color: "bg-success/10 text-success" },
                  { label: "Cancelado", desc: "Encerrado com registro histórico", color: "bg-destructive/10 text-destructive" },
                ].map((p, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg border border-border p-3">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${p.color}`}>
                      <FolderKanban className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">{p.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{p.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
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
                Controle granular de acesso com 5 perfis e Grupos de Usuários por Unidade. 
                Autenticação corporativa via Google OAuth restrita ao domínio da empresa.
              </p>
              <div className="mt-8 space-y-4">
                {[
                  { icon: Shield, title: "Admin", desc: "Acesso total: cadastros, configurações, metas, permissões e todos os dados" },
                  { icon: UserCheck, title: "Vendedor (ESN)", desc: "Vê apenas seus clientes e oportunidades. Cria e gerencia seu pipeline" },
                  { icon: Users, title: "GSN", desc: "Supervisiona a equipe vinculada. Vê oportunidades onde é gestor atribuído" },
                  { icon: Layers, title: "Eng. Valor (Arquiteto)", desc: "Revisa escopos técnicos das oportunidades onde está vinculado como EV" },
                  { icon: Eye, title: "Consulta CRA", desc: "Leitura apenas de oportunidades ganhas nas unidades autorizadas" },
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
                        { resource: "Oportunidades", roles: [true, true, true, true, true] },
                        { resource: "Projetos", roles: [true, true, true, true, true] },
                        { resource: "Clientes", roles: [true, true, false, false, false] },
                        { resource: "Time Comercial", roles: [true, false, false, false, false] },
                        { resource: "Metas", roles: [true, false, false, false, false] },
                        { resource: "Configurações", roles: [true, false, false, false, false] },
                        { resource: "Assistente xAI", roles: [true, true, true, true, true] },
                      ].map((r, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground w-28 shrink-0">{r.resource}</span>
                          <div className="flex gap-1.5">
                            {["A", "V", "G", "E", "C"].map((role, j) => (
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
                    <span className="text-[10px] font-medium text-primary">Autenticação Google OAuth — domínio corporativo</span>
                  </div>
                </div>
              </BrowserFrame>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ══ ASSISTENTE IA (xAI + WhatsApp) ═══════════════ */}
      <section id="ia" className="border-y border-border/50 bg-muted/30 py-24">
        <div className="mx-auto max-w-7xl px-6">
          <FadeIn className="mb-16 text-center">
            <span className="mb-3 inline-block text-sm font-semibold uppercase tracking-widest text-primary">Inteligência Artificial</span>
            <h2 className="text-3xl font-bold text-foreground md:text-4xl">Assistentes de IA sempre à mão</h2>
            <p className="mt-3 text-muted-foreground">Duas formas de consultar dados e tirar dúvidas com IA, respeitando seu perfil de acesso</p>
          </FadeIn>

          <div className="grid gap-8 md:grid-cols-2">
            {/* xAI */}
            <FadeIn>
              <div className="rounded-2xl border border-border bg-card p-6 h-full">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">xAI — Assistente do Sistema</h3>
                    <p className="text-xs text-muted-foreground">Disponível em qualquer tela do sistema</p>
                  </div>
                </div>
                <BrowserFrame>
                  <div className="bg-background p-4 space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20">
                        <Sparkles className="h-3 w-3 text-primary" />
                      </div>
                      <div className="rounded-lg rounded-tl-none bg-muted/80 px-3 py-2 max-w-[80%]">
                        <p className="text-[10px] text-foreground">Olá! Sou a xAI, sua assistente. Posso consultar oportunidades, projetos, clientes e mais. Como posso ajudar?</p>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <div className="rounded-lg rounded-tr-none bg-primary/10 px-3 py-2 max-w-[80%]">
                        <p className="text-[10px] text-foreground">Qual a última oportunidade ganha?</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20">
                        <Sparkles className="h-3 w-3 text-primary" />
                      </div>
                      <div className="rounded-lg rounded-tl-none bg-muted/80 px-3 py-2 max-w-[80%]">
                        <p className="text-[10px] text-foreground">
                          ✅ Oportunidade <strong>876500</strong><br/>
                          Cliente: <strong>ABC Indústria</strong><br/>
                          Valor: R$ 48.000,00 · 3 parcelas
                        </p>
                      </div>
                    </div>
                  </div>
                </BrowserFrame>
                <ul className="mt-4 space-y-2">
                  {["Consulta dados reais do banco", "Respeita seu perfil de acesso", "Múltiplos modelos de IA configuráveis", "Modelo configurável nas configurações"].map((t, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />{t}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeIn>

            {/* WhatsApp */}
            <FadeIn delay={0.1}>
              <div className="rounded-2xl border border-border bg-card p-6 h-full">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10">
                    <MessageCircle className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">WhatsApp com IA</h3>
                    <p className="text-xs text-muted-foreground">Consulte do celular, a qualquer momento</p>
                  </div>
                </div>
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
                        <p className="text-[10px] text-foreground">Quantas oportunidades tenho em aberto?</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/20">
                        <Bot className="h-3 w-3 text-success" />
                      </div>
                      <div className="rounded-lg rounded-tl-none bg-muted/80 px-3 py-2 max-w-[80%]">
                        <p className="text-[10px] text-foreground">
                          📊 Você tem <strong>8 oportunidades</strong> em aberto, totalizando <strong>R$ 234.000</strong> em pipeline.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg bg-success/5 border border-success/20 px-3 py-2 mt-1">
                      <Smartphone className="h-3.5 w-3.5 text-success" />
                      <span className="text-[10px] font-medium text-success">Identificação automática pelo celular cadastrado</span>
                    </div>
                  </div>
                </BrowserFrame>
                <ul className="mt-4 space-y-2">
                  {["Identifica ESN/GSN pelo telefone", "Mesmas regras de acesso do sistema", "Contexto conversacional", "Notificação por e-mail automática"].map((t, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />{t}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ══ INTEGRAÇÕES ══════════════════════════════════ */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <FadeIn className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-foreground md:text-4xl">Integrações</h2>
            <p className="mt-3 text-muted-foreground">Conectado ao ecossistema que a equipe já utiliza</p>
          </FadeIn>
          <div className="grid gap-6 md:grid-cols-4">
            {[
              { icon: Database, title: "ERP Protheus", desc: "Sincronização automática de clientes via API com paginação e mapeamento de campos" },
              { icon: FileText, title: "Google Docs", desc: "Templates de proposta e MIT gerados com preenchimento automático de placeholders" },
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

      {/* ══ CTA FINAL ════════════════════════════════════ */}
      <section className="relative overflow-hidden bg-primary py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.08),transparent_60%)]" />
        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <FadeIn>
            <h2 className="text-3xl font-extrabold text-primary-foreground md:text-4xl">
              Comece a usar agora
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-primary-foreground/80">
              Acesse o ProposalFlow com sua conta corporativa e tenha tudo o que precisa para gerenciar suas oportunidades.
            </p>
            <div className="mt-10">
              <Button size="lg" variant="secondary" className="h-12 px-10 text-base font-semibold shadow-lg" asChild>
                <Link to="/login">Acessar o Sistema <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────── */}
      <footer className="border-t border-border bg-card py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted-foreground md:flex-row">
          <span className="font-semibold text-foreground">ProposalFlow</span>
          <p>© {new Date().getFullYear()} — Ferramenta interna para a equipe comercial.</p>
        </div>
      </footer>
    </div>
  );
}
