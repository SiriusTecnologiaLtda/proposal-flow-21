import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Link } from "react-router-dom";
import {
  FileText, LayoutTemplate, PenTool, BarChart3, Shield,
  Clock, AlertTriangle, CheckCircle2, ArrowRight, Star,
  Zap, Users, TrendingUp, ChevronRight, Rocket, MessageCircle, Mic, Smartphone, Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/* ── Scroll-animated wrapper ─────────────────────────────── */
function FadeIn({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
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
  { name: "Marcos Oliveira", role: "Executivo de Negócios", quote: "Reduzi em 70% o tempo que gastava montando propostas. Agora consigo focar no que importa: vender.", avatar: "MO" },
  { name: "Carla Mendes", role: "Gerente de Negócios", quote: "A visão consolidada do dashboard me dá controle total sobre o pipeline da minha equipe.", avatar: "CM" },
  { name: "Rafael Souza", role: "Arquiteto de Soluções", quote: "Os templates de escopo padronizaram nossas entregas. Zero retrabalho na montagem técnica.", avatar: "RS" },
];

const impactNumbers = [
  { value: "70%", label: "Menos tempo montando propostas" },
  { value: "10h", label: "Economizadas por semana" },
  { value: "3x", label: "Mais propostas geradas" },
  { value: "100%", label: "Digital e rastreável" },
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
            <a href="#como-funciona" className="transition-colors hover:text-foreground">Como Funciona</a>
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
            <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-foreground md:text-5xl lg:text-6xl">
              Automatize suas propostas comerciais em{" "}
              <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">minutos</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
              Chega de planilhas, documentos soltos e horas perdidas. Crie, acompanhe e feche propostas com inteligência, velocidade e controle total do pipeline.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button size="lg" className="h-12 px-8 text-base shadow-lg shadow-primary/20" asChild>
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
              <img
                src="/placeholder.svg"
                alt="Dashboard do ProposalFlow"
                className="w-full"
                style={{ aspectRatio: "16/10", objectFit: "cover", background: "hsl(var(--muted))" }}
              />
              {/* Overlay KPI cards to mimic the real dashboard */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6">
                <div className="grid w-full grid-cols-2 gap-3">
                  {[
                    { icon: TrendingUp, label: "Propostas Ganhas", val: "42" },
                    { icon: BarChart3, label: "Valor Total", val: "R$ 1.2M" },
                    { icon: Clock, label: "Tempo Médio", val: "3 dias" },
                    { icon: Users, label: "Clientes Ativos", val: "128" },
                  ].map((k, i) => (
                    <div key={i} className="rounded-lg border border-border bg-card p-3 shadow-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <k.icon className="h-3.5 w-3.5 text-primary" />
                        <span className="text-[10px] font-medium">{k.label}</span>
                      </div>
                      <p className="mt-1 text-lg font-bold text-foreground">{k.val}</p>
                    </div>
                  ))}
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
            <p className="mt-3 text-muted-foreground">Veja como sua equipe comercial vai evoluir</p>
          </FadeIn>

          <div className="grid gap-8 md:grid-cols-2">
            {/* Antes */}
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
                    "Propostas montadas em planilhas e documentos avulsos",
                    "Horas perdidas copiando dados e formatando documentos",
                    "Sem visibilidade do pipeline comercial",
                    "Assinaturas por e-mail sem rastreamento",
                    "Retrabalho constante em escopos repetitivos",
                  ].map((t, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-[10px] font-bold text-destructive">✗</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeIn>

            {/* Depois */}
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
                    "Propostas geradas automaticamente em PDF profissional",
                    "Templates de escopo prontos — monte em minutos",
                    "Dashboard em tempo real com KPIs e filtros",
                    "Assinatura digital integrada com TOTVS Assinatura Eletrônica",
                    "IT de transição gerada automaticamente",
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

      {/* ══ FUNCIONALIDADES ═══════════════════════════════ */}
      <section id="funcionalidades" className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <FadeIn className="mb-16 text-center">
            <span className="mb-3 inline-block text-sm font-semibold uppercase tracking-widest text-primary">Funcionalidades</span>
            <h2 className="text-3xl font-bold text-foreground md:text-4xl">Tudo que sua equipe precisa, em um só lugar</h2>
          </FadeIn>

          <div className="grid gap-8 md:grid-cols-2">
            {[
              {
                icon: FileText,
                title: "Geração Automática de Propostas",
                desc: "Crie propostas completas em PDF com cálculos automáticos de horas, valores e condições de pagamento. Tudo padronizado e profissional.",
                mockup: (
                  <div className="space-y-2 p-4">
                    <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                      <div>
                        <p className="text-xs font-semibold text-foreground">Proposta #2025-042</p>
                        <p className="text-[10px] text-muted-foreground">Cliente ABC Ltda</p>
                      </div>
                      <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">Gerada</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                      <div>
                        <p className="text-xs font-semibold text-foreground">Proposta #2025-041</p>
                        <p className="text-[10px] text-muted-foreground">Indústria XYZ</p>
                      </div>
                      <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">Pendente</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                      <div>
                        <p className="text-xs font-semibold text-foreground">Proposta #2025-040</p>
                        <p className="text-[10px] text-muted-foreground">Tech Solutions</p>
                      </div>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Em Assinatura</span>
                    </div>
                  </div>
                ),
              },
              {
                icon: LayoutTemplate,
                title: "Templates de Escopo Inteligentes",
                desc: "Biblioteca de templates prontos por produto e categoria. Adicione, remova ou personalize itens de escopo com horas pré-configuradas.",
                mockup: (
                  <div className="space-y-2 p-4">
                    <div className="rounded-lg border border-border bg-card p-3">
                      <div className="flex items-center gap-2">
                        <LayoutTemplate className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-semibold text-foreground">Implantação RM</span>
                      </div>
                      <div className="mt-2 space-y-1">
                        {["Levantamento de Requisitos", "Configuração do Sistema", "Treinamento"].map((item, i) => (
                          <div key={i} className="flex items-center justify-between text-[10px]">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <CheckCircle2 className="h-3 w-3 text-success" />{item}
                            </span>
                            <span className="font-medium text-foreground">{[40, 80, 24][i]}h</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                icon: PenTool,
                title: "Assinatura Digital Integrada",
                desc: "Envie propostas para assinatura eletrônica via TOTVS Assinatura Eletrônica (TAE) direto do sistema. Acompanhe o status em tempo real.",
                mockup: (
                  <div className="space-y-3 p-4">
                    <div className="rounded-lg border border-border bg-card p-3">
                      <p className="text-xs font-semibold text-foreground">Status da Assinatura</p>
                      <div className="mt-2 space-y-2">
                        {[
                          { name: "João Silva", status: "Assinado", color: "text-success" },
                          { name: "Maria Santos", status: "Pendente", color: "text-warning" },
                        ].map((s, i) => (
                          <div key={i} className="flex items-center justify-between text-[10px]">
                            <span className="text-muted-foreground">{s.name}</span>
                            <span className={`font-medium ${s.color}`}>{s.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2">
                      <Shield className="h-3.5 w-3.5 text-primary" />
                      <span className="text-[10px] font-medium text-primary">Validade jurídica garantida</span>
                    </div>
                  </div>
                ),
              },
              {
                icon: BarChart3,
                title: "Dashboard de Performance",
                desc: "Visão completa do pipeline: propostas ganhas, perdidas, valor total, ticket médio e ciclo de venda. Filtre por período e vendedor.",
                mockup: (
                  <div className="space-y-3 p-4">
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "Ganhas", val: "42", color: "text-success" },
                        { label: "Valor", val: "R$ 1.2M", color: "text-primary" },
                      ].map((k, i) => (
                        <div key={i} className="rounded-lg border border-border bg-card p-2 text-center">
                          <p className="text-[9px] text-muted-foreground">{k.label}</p>
                          <p className={`text-sm font-bold ${k.color}`}>{k.val}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-end gap-1 px-2">
                      {[30, 50, 40, 70, 60, 80, 55, 90, 75, 65, 85, 95].map((h, i) => (
                        <div key={i} className="flex-1 rounded-t bg-primary/20" style={{ height: `${h * 0.4}px` }}>
                          <div className="h-full w-full rounded-t bg-primary/60" style={{ height: `${h * 0.6}%` }} />
                        </div>
                      ))}
                    </div>
                  </div>
                ),
              },
            ].map((feat, i) => (
              <FadeIn key={i} delay={i * 0.1}>
                <div className="group rounded-2xl border border-border bg-card p-1 shadow-sm transition-shadow hover:shadow-lg">
                  <div className="p-6 pb-4">
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <feat.icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground">{feat.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feat.desc}</p>
                  </div>
                  <BrowserFrame className="mx-1 mb-1 border-border/50">
                    <div className="min-h-[160px] bg-background">{feat.mockup}</div>
                  </BrowserFrame>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ══ COMO FUNCIONA ════════════════════════════════ */}
      <section id="como-funciona" className="border-y border-border/50 bg-muted/30 py-24">
        <div className="mx-auto max-w-7xl px-6">
          <FadeIn className="mb-16 text-center">
            <span className="mb-3 inline-block text-sm font-semibold uppercase tracking-widest text-primary">Passo a passo</span>
            <h2 className="text-3xl font-bold text-foreground md:text-4xl">Simples de começar, poderoso de usar</h2>
          </FadeIn>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              { step: "1", icon: Users, title: "Cadastre sua equipe", desc: "Importe ou cadastre clientes, vendedores, arquitetos e unidades. Integre via API com seu ERP." },
              { step: "2", icon: FileText, title: "Monte a proposta", desc: "Selecione o cliente, adicione templates de escopo, ajuste horas e defina condições financeiras." },
              { step: "3", icon: Zap, title: "Gere e envie", desc: "Gere o PDF com um clique, envie para assinatura digital e acompanhe o status em tempo real." },
            ].map((s, i) => (
              <FadeIn key={i} delay={i * 0.15}>
                <div className="relative rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
                  <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-extrabold text-primary-foreground shadow-lg shadow-primary/20">
                    {s.step}
                  </div>
                  <h3 className="text-lg font-bold text-foreground">{s.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
                  {i < 2 && (
                    <ChevronRight className="absolute -right-5 top-1/2 hidden h-6 w-6 -translate-y-1/2 text-border md:block" />
                  )}
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ══ PROVA SOCIAL / RESULTADOS ════════════════════ */}
      <section id="resultados" className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          {/* Números de impacto */}
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

          {/* Depoimentos */}
          <FadeIn className="mb-4 text-center">
            <h2 className="text-3xl font-bold text-foreground md:text-4xl">O que nossos usuários dizem</h2>
          </FadeIn>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {testimonials.map((t, i) => (
              <FadeIn key={i} delay={i * 0.1}>
                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                  <div className="mb-4 flex gap-1">
                    {[...Array(5)].map((_, j) => (
                      <Star key={j} className="h-4 w-4 fill-warning text-warning" />
                    ))}
                  </div>
                  <p className="text-sm italic leading-relaxed text-muted-foreground">"{t.quote}"</p>
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
              Pronto para transformar suas propostas comerciais?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-primary-foreground/80">
              Junte-se às equipes que já automatizaram seu processo comercial e estão fechando mais negócios.
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
