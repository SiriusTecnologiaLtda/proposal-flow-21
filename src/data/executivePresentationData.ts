// Executive Presentation — Data models, mock data & shared store
// Presentation content is keyed by proposal_types.slug (the real DB entity).
// No standalone "type" entity — we extend the existing proposal_types.

// ── Shared scalar types ─────────────────────────────────────────────
export type TemplateStyle = "modern" | "corporate" | "minimal";
export type AudienceLevel = "c_level" | "gerencia" | "operacional";
export type DetailLevel = "resumido" | "detalhado";
export type PricingDisplayMode = "recorrencia" | "setup_unico" | "faseado" | "sob_consulta";

// ── Reusable sub-entities ───────────────────────────────────────────
export interface ScopeBlock {
  id: string;
  title: string;
  description: string;
  icon: string;
  items: string[];
  /** Executive-level objective of this work stream */
  executiveObjective?: string;
  /** Expected business impact */
  expectedImpact?: string;
  /** Volume summary (e.g. "160h estimadas") */
  volumeSummary?: string;
}

export interface TimelinePhase {
  id: string;
  phase: number;
  title: string;
  duration: string;
  description: string;
}

export interface Benefit {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export interface Differentiator {
  id: string;
  title: string;
  description: string;
}

export interface ReferenceAttachment {
  id: string;
  fileName: string;
  fileType: "pdf" | "doc" | "docx";
  description: string;
  uploadedAt: string;
  url?: string;
}

// ── Linked Project (scope source) ───────────────────────────────────
// Represents the project linked to an opportunity — primary source
// for deliverable scope in the executive presentation.
//
// IMPORTANT: executiveObjective, expectedImpact, and executiveSummary
// are explicit fields that should be filled by the user or system.
// When present, they take priority over any heuristic inference.
// This is the path to eliminating regex-based guessing.
export interface ProjectScopeGroup {
  id: string;
  title: string;
  /** e.g. "template" or "manual" */
  source: string;
  itemCount: number;
  totalHours: number;
  items: { id: string; description: string; hours: number; included: boolean }[];
  /** Explicit executive objective — takes priority over heuristic */
  executiveObjective?: string;
  /** Explicit expected impact — takes priority over heuristic */
  expectedImpact?: string;
  /** Short executive summary of this group */
  executiveSummary?: string;
}

export interface LinkedProject {
  id: string;
  description: string;
  status: string;
  scopeGroups: ProjectScopeGroup[];
  totalHours: number;
  totalItems: number;
}

// ── Proposal Template Context ───────────────────────────────────────
export interface ProposalTemplateContext {
  templateDocId?: string;
  mitTemplateDocId?: string;
  placeholders: string[];
  premises: string[];
  outOfScope: string[];
  methodology?: string;
}

// ── Presentation Config (per proposal_types.slug) ────────────────────
export interface PresentationTypeConfig {
  executiveSummary: string;
  positioningText: string;
  problemStatement: string;
  solutionApproach: string;
  defaultBenefits: Benefit[];
  defaultScopeBlocks: ScopeBlock[];
  defaultTimeline: TimelinePhase[];
  pricingDisplayMode: PricingDisplayMode;
  differentiators: Differentiator[];
  defaultCta: string;
  preferredTemplate: TemplateStyle;
  references: ReferenceAttachment[];
}

// ── Opportunity Data ────────────────────────────────────────────────
export interface OpportunityData {
  id: string;
  company: string;
  contact: string;
  contactRole: string;
  segment: string;
  /** slug referencing a proposal_type */
  opportunityTypeSlug: string;
  opportunityTypeLabel: string;
  stage: string;
  mainPain: string;
  objectives: string[];
  currentScenario: string;
  whyActNow: string;
  solutionSummary: string;
  solutionHow: string;
  scopeBlocks: ScopeBlock[];
  benefits: Benefit[];
  timeline: TimelinePhase[];
  investmentTotal: number;
  investmentSetup?: number;
  investmentRecurring?: number;
  investmentRecurringLabel?: string;
  differentiators: Differentiator[];
  nextStep: string;
  nextStepCta: string;
  createdAt: string;
  expectedCloseDate: string;
  linkedProject?: LinkedProject;
  templateContext?: ProposalTemplateContext;
}

// ── Generation Config ───────────────────────────────────────────────
export interface PresentationConfig {
  opportunityTypeSlug: string;
  templateStyle: TemplateStyle;
  audience: AudienceLevel;
  detailLevel: DetailLevel;
  showInvestment: boolean;
  showTimeline: boolean;
}

// ── Executive Presentation (generated entity) ───────────────────────
export interface ExecutivePresentation {
  id: string;
  opportunityId: string;
  opportunityTypeSlug: string;
  config: PresentationConfig;
  composedData: OpportunityData;
  overrides: Record<string, string>;
  dataSources: {
    opportunity: boolean;
    proposalType: boolean;
    linkedProject: boolean;
    proposalTemplate: boolean;
  };
  shareSlug: string;
  createdAt: string;
  updatedAt: string;
}

// ── Executive scope icons by keyword heuristic ─────────────────────
// Used as FALLBACK when explicit data is not available.
const scopeIconHeuristic: [RegExp, string][] = [
  [/financ|fatura|concilia|dre|receita/i, "DollarSign"],
  [/dashboard|bi|kpi|relat[oó]rio|indicador/i, "BarChart3"],
  [/treina|onboard|capacita|suporte/i, "GraduationCap"],
  [/integra[çc]/i, "Link"],
  [/contab|cont[aá]bil|fiscal|tribut/i, "Layers"],
  [/rh|folha|ponto|pessoal|trabalh/i, "Heart"],
  [/migra[çc]/i, "Route"],
  [/seguran[çc]|complian/i, "ShieldCheck"],
  [/opera|workflow|processo|automa/i, "Settings"],
  [/vendas|comercial|crm/i, "Rocket"],
  [/diagn[oó]stic/i, "Search"],
  [/redesenho|melhoria|otimiz/i, "PenTool"],
  [/governan[çc]|qualidade/i, "Award"],
];

function inferIcon(title: string, index: number): string {
  for (const [re, icon] of scopeIconHeuristic) {
    if (re.test(title)) return icon;
  }
  const fallbacks = ["Layers", "Settings", "Route", "Brain", "Rocket", "Shield"];
  return fallbacks[index % fallbacks.length];
}

// ── Executive narrative heuristics (FALLBACK only) ──────────────────
// These are used ONLY when ProjectScopeGroup does not have explicit fields.
const objectiveHeuristic: [RegExp, string][] = [
  [/contab|cont[aá]bil/i, "Estruturar a gestão contábil com automação de lançamentos, conciliações e fechamentos."],
  [/fiscal|tribut/i, "Garantir conformidade fiscal com apuração automatizada de impostos e obrigações acessórias."],
  [/rh|folha|ponto|pessoal/i, "Modernizar a gestão de pessoas com folha automatizada, controle de ponto e conformidade trabalhista."],
  [/financ|fatura|concilia|dre/i, "Garantir controle financeiro integrado com visibilidade em tempo real sobre receitas e custos."],
  [/dashboard|bi|kpi|indicador/i, "Fornecer visibilidade executiva por meio de indicadores estratégicos e relatórios personalizados."],
  [/treina|onboard|suporte|capacita/i, "Assegurar a adoção efetiva pela equipe por meio de capacitação estruturada e suporte dedicado."],
  [/integra[çc]/i, "Conectar sistemas e eliminar silos de informação, garantindo fluxo de dados consistente."],
  [/operacion|workflow|processo/i, "Automatizar e otimizar processos operacionais, eliminando controles manuais e reduzindo erros."],
  [/migra[çc]/i, "Migrar dados com segurança e integridade, garantindo continuidade operacional."],
  [/diagn[oó]stic/i, "Mapear processos e identificar oportunidades de melhoria com análise detalhada."],
  [/redesenho|melhoria/i, "Redesenhar processos para alcançar eficiência e padronização operacional."],
  [/governan[çc]|qualidade/i, "Estabelecer governança e indicadores de qualidade para sustentação dos resultados."],
];

const impactHeuristic: [RegExp, string][] = [
  [/contab|cont[aá]bil/i, "Fechamentos mais ágeis e redução de riscos em obrigações legais."],
  [/fiscal|tribut/i, "Conformidade garantida com redução de riscos fiscais e multas."],
  [/rh|folha|ponto|pessoal/i, "Conformidade trabalhista e eficiência na gestão do capital humano."],
  [/financ|fatura|concilia|dre/i, "Maior previsibilidade financeira e redução de perdas por inconsistências."],
  [/dashboard|bi|kpi|indicador/i, "Decisões mais rápidas e fundamentadas com dados atualizados em tempo real."],
  [/treina|onboard|suporte/i, "Equipe preparada para operar com autonomia e extrair o máximo da solução."],
  [/integra[çc]/i, "Eliminação de digitação duplicada e ganho de confiabilidade nos dados."],
  [/operacion|workflow|processo/i, "Redução de retrabalho e ganho de produtividade na operação diária."],
  [/diagn[oó]stic/i, "Clareza sobre gaps e prioridades, direcionando investimentos com assertividade."],
  [/redesenho|melhoria/i, "Processos mais enxutos com ganho mensurável de eficiência."],
  [/governan[çc]|qualidade/i, "Cultura de melhoria contínua sustentada por indicadores confiáveis."],
];

/**
 * Resolves the executive objective for a scope group.
 * Priority: explicit field > heuristic > generic fallback
 */
function resolveExecutiveObjective(group: ProjectScopeGroup): string {
  if (group.executiveObjective) return group.executiveObjective;
  for (const [re, text] of objectiveHeuristic) {
    if (re.test(group.title)) return text;
  }
  const count = group.items.filter((i) => i.included).length;
  return `Frente de trabalho com ${count} entregáveis planejados para esta etapa do projeto.`;
}

/**
 * Resolves the expected impact for a scope group.
 * Priority: explicit field > heuristic > generic fallback
 */
function resolveExpectedImpact(group: ProjectScopeGroup): string {
  if (group.expectedImpact) return group.expectedImpact;
  for (const [re, text] of impactHeuristic) {
    if (re.test(group.title)) return text;
  }
  if (group.totalHours >= 200) return "Impacto estratégico na operação — frente com volume significativo de entregáveis.";
  if (group.totalHours >= 100) return "Contribuição relevante para a eficiência e a qualidade operacional.";
  return "Fortalece o resultado global da iniciativa com entregáveis complementares.";
}

// ── Composition helper ──────────────────────────────────────────────
export function composePresentation(
  opportunity: OpportunityData,
  typeConfig: PresentationTypeConfig | undefined,
): OpportunityData {
  // Transform project groups into executive scope blocks
  const projectScopeBlocks: ScopeBlock[] = opportunity.linkedProject
    ? opportunity.linkedProject.scopeGroups.map((g, i) => {
        const objective = resolveExecutiveObjective(g);
        const impact = resolveExpectedImpact(g);
        return {
          id: `proj-scope-${g.id}`,
          title: g.title,
          description: g.executiveSummary || objective,
          icon: inferIcon(g.title, i),
          items: g.items.filter((it) => it.included).slice(0, 5).map((it) => it.description),
          executiveObjective: objective,
          expectedImpact: impact,
          volumeSummary: `${g.totalHours}h estimadas`,
        };
      })
    : [];

  const fallbackType = typeConfig ?? ({} as Partial<PresentationTypeConfig>);
  const tmpl = opportunity.templateContext;

  // Narrative: opportunity > template methodology > type defaults
  const solutionSummary =
    opportunity.solutionSummary ||
    fallbackType.solutionApproach ||
    "Solução personalizada para os desafios identificados.";

  const solutionHow =
    opportunity.solutionHow ||
    (tmpl?.methodology ? `${fallbackType.positioningText || ""} ${tmpl.methodology}`.trim() : "") ||
    fallbackType.positioningText ||
    "Abordagem estruturada com foco em resultados mensuráveis.";

  const currentScenario =
    opportunity.currentScenario ||
    fallbackType.problemStatement ||
    "Cenário atual com oportunidades de melhoria identificadas.";

  return {
    ...opportunity,
    solutionSummary,
    solutionHow,
    currentScenario,
    // Scope: project > opportunity > type defaults
    scopeBlocks:
      projectScopeBlocks.length > 0
        ? projectScopeBlocks
        : opportunity.scopeBlocks.length > 0
          ? opportunity.scopeBlocks
          : fallbackType.defaultScopeBlocks || [],
    // Benefits: opportunity > type defaults
    benefits: opportunity.benefits.length > 0 ? opportunity.benefits : fallbackType.defaultBenefits || [],
    // Timeline: opportunity > type defaults
    timeline: opportunity.timeline.length > 0 ? opportunity.timeline : fallbackType.defaultTimeline || [],
    // Differentiators: opportunity > type defaults
    differentiators: opportunity.differentiators.length > 0 ? opportunity.differentiators : fallbackType.differentiators || [],
    // CTA: opportunity > type defaults
    nextStep: opportunity.nextStep || fallbackType.defaultCta || "Entrar em contato para próximos passos.",
    nextStepCta: opportunity.nextStepCta || fallbackType.defaultCta || "Avançar",
  };
}

// ── Option lists ────────────────────────────────────────────────────
export const templateStyleOptions: { value: TemplateStyle; label: string; description: string }[] = [
  { value: "modern", label: "Moderno", description: "Visual arrojado com gradientes e cards dinâmicos" },
  { value: "corporate", label: "Corporativo", description: "Sóbrio e profissional, ideal para C-Level" },
  { value: "minimal", label: "Minimal", description: "Limpo e direto, foco total no conteúdo" },
];

export const audienceOptions: { value: AudienceLevel; label: string }[] = [
  { value: "c_level", label: "C-Level / Diretoria" },
  { value: "gerencia", label: "Gerência / Coordenação" },
  { value: "operacional", label: "Operacional / Técnico" },
];

export const detailOptions: { value: DetailLevel; label: string }[] = [
  { value: "resumido", label: "Resumido" },
  { value: "detalhado", label: "Detalhado" },
];

export const pricingDisplayModeOptions: { value: PricingDisplayMode; label: string }[] = [
  { value: "recorrencia", label: "Recorrência (mensal/anual)" },
  { value: "setup_unico", label: "Setup único" },
  { value: "faseado", label: "Faseado por etapa" },
  { value: "sob_consulta", label: "Sob consulta" },
];

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export const defaultPresentationConfig: PresentationConfig = {
  opportunityTypeSlug: "",
  templateStyle: "modern",
  audience: "c_level",
  detailLevel: "resumido",
  showInvestment: true,
  showTimeline: true,
};

// =====================================================================
//  MOCK — Presentation configs keyed by proposal_types.slug
// =====================================================================
const initialPresentationConfigs: Record<string, PresentationTypeConfig> = {
  projeto: {
    executiveSummary: "Desenvolvimento de soluções tecnológicas sob medida com metodologia ágil, entregas incrementais e propriedade intelectual do cliente.",
    positioningText: "Construímos soluções tecnológicas exclusivas que se tornam vantagem competitiva — com entregas incrementais, validação contínua e propriedade intelectual 100% do cliente.",
    problemStatement: "Soluções de mercado não atendem regras de negócio específicas. Adaptações em ferramentas genéricas geram custo crescente, dívida técnica e dependência de fornecedor.",
    solutionApproach: "Construção iterativa em sprints de 2 semanas, com validação contínua da equipe operacional e releases incrementais em produção.",
    defaultBenefits: [
      { id: "db-9", title: "Solução sob medida", description: "Sistema projetado para as regras de negócio específicas da operação.", icon: "Shield" },
      { id: "db-10", title: "Escalabilidade operacional", description: "Crescimento sem aumento proporcional de equipe.", icon: "Rocket" },
      { id: "db-11", title: "Propriedade intelectual", description: "Sistema proprietário que se torna vantagem competitiva exclusiva.", icon: "Award" },
      { id: "db-12", title: "Visibilidade em tempo real", description: "Dashboards e alertas para gestão com visibilidade total.", icon: "Eye" },
    ],
    defaultScopeBlocks: [
      { id: "ds-9", title: "Fase 1 — Fundação", description: "Arquitetura, modelagem de dados e infraestrutura.", icon: "Layers", items: ["Arquitetura do sistema", "Modelagem de dados", "Setup cloud", "MVP base"] },
      { id: "ds-10", title: "Fase 2 — Core", description: "Desenvolvimento das funcionalidades principais.", icon: "Route", items: ["Regras de negócio", "Algoritmos core", "Validação operacional", "Testes integrados"] },
      { id: "ds-11", title: "Fase 3 — Integração", description: "Conexão com sistemas existentes.", icon: "Link", items: ["APIs de integração", "Sincronização de dados", "Automação de fluxos", "Monitoramento"] },
      { id: "ds-12", title: "Fase 4 — Inteligência", description: "Camada analítica e otimização contínua.", icon: "Brain", items: ["Analytics avançado", "Otimização contínua", "Análise de performance", "Recomendações"] },
    ],
    defaultTimeline: [
      { id: "dt-9", phase: 1, title: "Fundação", duration: "6 semanas", description: "Arquitetura, infraestrutura e base." },
      { id: "dt-10", phase: 2, title: "Desenvolvimento Core", duration: "10 semanas", description: "Funcionalidades principais com validação contínua." },
      { id: "dt-11", phase: 3, title: "Integração", duration: "6 semanas", description: "Conexão com sistemas e testes integrados." },
      { id: "dt-12", phase: 4, title: "Go-Live", duration: "8 semanas", description: "Otimização e entrada em produção." },
    ],
    pricingDisplayMode: "setup_unico",
    differentiators: [
      { id: "dd-7", title: "Experiência comprovada", description: "Mais de 50 projetos de tecnologia sob medida entregues." },
      { id: "dd-8", title: "Metodologia ágil", description: "Entregas incrementais a cada 2 semanas com validação contínua." },
      { id: "dd-9", title: "Suporte pós-entrega", description: "12 meses de suporte evolutivo inclusos para estabilização." },
    ],
    defaultCta: "Confirmar início do projeto e agendar discovery",
    preferredTemplate: "minimal",
    references: [
      { id: "ref-4", fileName: "Escopo_Tecnico_Template.docx", fileType: "docx", description: "Template de escopo técnico detalhado", uploadedAt: "2026-02-01" },
    ],
  },
  implantacao: {
    executiveSummary: "Soluções de implantação com modelo de projeto e acompanhamento dedicado, foco em aderência operacional e transferência de conhecimento.",
    positioningText: "Transforme sua operação com tecnologia de ponta — implantação assistida, com atualizações contínuas e suporte dedicado.",
    problemStatement: "Empresas que dependem de sistemas legados enfrentam custos crescentes de manutenção, lentidão na inovação e riscos de segurança que comprometem a competitividade.",
    solutionApproach: "Nossa plataforma oferece módulos especializados com onboarding assistido, integrações nativas e evolução contínua orientada pelo cliente.",
    defaultBenefits: [
      { id: "db-1", title: "Redução de custos operacionais", description: "Economia de até 25% com automação e eliminação de infraestrutura própria.", icon: "TrendingDown" },
      { id: "db-2", title: "Decisões baseadas em dados", description: "Dashboards em tempo real com KPIs estratégicos e operacionais.", icon: "Eye" },
      { id: "db-3", title: "Escalabilidade imediata", description: "Plataforma cloud-native que cresce com a operação sem investimento adicional.", icon: "Rocket" },
      { id: "db-4", title: "Atualizações contínuas", description: "Novas funcionalidades entregues automaticamente sem paradas ou custos extras.", icon: "ShieldCheck" },
    ],
    defaultScopeBlocks: [
      { id: "ds-1", title: "Módulo Core", description: "Funcionalidades essenciais com configuração personalizada.", icon: "Settings", items: ["Setup inicial", "Configuração de regras de negócio", "Migração de dados", "Integrações base"] },
      { id: "ds-2", title: "Módulo Financeiro", description: "Automação financeira com conciliação e relatórios integrados.", icon: "DollarSign", items: ["Faturamento automático", "Conciliação", "DRE operacional", "Previsão de receita"] },
      { id: "ds-3", title: "Dashboards & BI", description: "Visibilidade executiva com indicadores customizáveis.", icon: "BarChart3", items: ["KPIs em tempo real", "Relatórios customizáveis", "Alertas de desvio", "Exportação"] },
      { id: "ds-4", title: "Onboarding & Suporte", description: "Implantação assistida com treinamento e suporte dedicado.", icon: "GraduationCap", items: ["Migração de dados", "Treinamento", "Suporte premium", "Customer Success"] },
    ],
    defaultTimeline: [
      { id: "dt-1", phase: 1, title: "Kickoff & Discovery", duration: "2 semanas", description: "Alinhamento e planejamento da implantação." },
      { id: "dt-2", phase: 2, title: "Configuração & Migração", duration: "4 semanas", description: "Setup da plataforma e migração de dados." },
      { id: "dt-3", phase: 3, title: "Treinamento & Homologação", duration: "2 semanas", description: "Capacitação e validação." },
      { id: "dt-4", phase: 4, title: "Go-Live & Estabilização", duration: "2 semanas", description: "Entrada em produção com acompanhamento." },
    ],
    pricingDisplayMode: "faseado",
    differentiators: [
      { id: "dd-1", title: "Tecnologia própria", description: "Plataforma desenvolvida internamente com roadmap orientado pelo cliente." },
      { id: "dd-2", title: "Time dedicado", description: "Customer Success focado no resultado desde o dia 1." },
      { id: "dd-3", title: "Especialização setorial", description: "Experiência comprovada no setor com cases de sucesso." },
    ],
    defaultCta: "Agendar reunião de alinhamento técnico",
    preferredTemplate: "modern",
    references: [
      { id: "ref-1", fileName: "Template_Proposta_Implantacao_v3.docx", fileType: "docx", description: "Template padrão de proposta de implantação", uploadedAt: "2026-02-15" },
    ],
  },
  consultoria: {
    executiveSummary: "Consultoria especializada com metodologia proprietária, foco em resultados mensuráveis e transferência de conhecimento.",
    positioningText: "Transformamos desafios complexos em resultados tangíveis com nossa metodologia de consultoria — diagnóstico profundo, redesenho de processos e implantação assistida.",
    problemStatement: "Organizações com processos fragmentados enfrentam ineficiências operacionais, falta de padronização e dificuldade em escalar com qualidade.",
    solutionApproach: "Nossa abordagem combina diagnóstico in-loco, benchmark setorial e desenho participativo de processos, garantindo aderência e adoção pela equipe.",
    defaultBenefits: [
      { id: "db-5", title: "Padronização de processos", description: "Processos padronizados garantem qualidade consistente em todas as unidades.", icon: "Heart" },
      { id: "db-6", title: "Redução de custos", description: "Eliminação de desperdícios com economia estimada de 18% nos custos operacionais.", icon: "TrendingDown" },
      { id: "db-7", title: "Preparação para certificações", description: "Processos alinhados a padrões de certificação desde a concepção.", icon: "Award" },
      { id: "db-8", title: "Cultura de dados", description: "Decisões baseadas em indicadores confiáveis e atualizados.", icon: "Brain" },
    ],
    defaultScopeBlocks: [
      { id: "ds-5", title: "Diagnóstico", description: "Mapeamento completo dos processos com identificação de gaps e oportunidades.", icon: "Search", items: ["Entrevistas com lideranças", "Mapeamento AS-IS", "Análise de indicadores", "Benchmark setorial"] },
      { id: "ds-6", title: "Redesenho de Processos", description: "Definição do modelo TO-BE com padronização.", icon: "PenTool", items: ["Processos TO-BE", "Protocolos padronizados", "Fluxos de escalação", "Matriz RACI"] },
      { id: "ds-7", title: "Implantação", description: "Execução assistida do plano de mudança.", icon: "CheckCircle", items: ["Plano de mudança", "Treinamento presencial", "Mentoria de lideranças", "Suporte à transição"] },
      { id: "ds-8", title: "Indicadores & Governança", description: "Framework de indicadores e governança para sustentação.", icon: "BarChart3", items: ["Dashboard de qualidade", "Comitês de governança", "Melhoria contínua", "Relatório executivo"] },
    ],
    defaultTimeline: [
      { id: "dt-5", phase: 1, title: "Diagnóstico", duration: "4 semanas", description: "Imersão, entrevistas e mapeamento completo." },
      { id: "dt-6", phase: 2, title: "Redesenho", duration: "6 semanas", description: "Workshops e validação com stakeholders." },
      { id: "dt-7", phase: 3, title: "Implantação Piloto", duration: "8 semanas", description: "Implantação piloto com acompanhamento intensivo." },
      { id: "dt-8", phase: 4, title: "Rollout", duration: "12 semanas", description: "Expansão com suporte e monitoramento." },
    ],
    pricingDisplayMode: "faseado",
    differentiators: [
      { id: "dd-4", title: "Metodologia validada", description: "Framework proprietário testado em mais de 40 organizações." },
      { id: "dd-5", title: "Equipe multidisciplinar", description: "Consultores com formação em gestão, engenharia de processos e tecnologia." },
      { id: "dd-6", title: "Resultados mensuráveis", description: "Compromisso contratual com metas de resultado." },
    ],
    defaultCta: "Agendar visita técnica para início do diagnóstico",
    preferredTemplate: "corporate",
    references: [
      { id: "ref-3", fileName: "Metodologia_Consultoria_v2.pdf", fileType: "pdf", description: "Documento metodológico da consultoria", uploadedAt: "2026-01-10" },
    ],
  },
};

// =====================================================================
//  MOCK — Opportunities (referencing real proposal_types slugs)
//  Now includes linkedProject and templateContext for composite generation
//  Mock scope groups use EXPLICIT executive fields where available,
//  demonstrating the path away from regex heuristics.
// =====================================================================
const initialOpportunities: OpportunityData[] = [
  {
    id: "opp-1",
    company: "Grupo Nova Energia S.A.",
    contact: "Marcelo Andrade",
    contactRole: "Diretor de Tecnologia",
    segment: "Energia & Utilities",
    opportunityTypeSlug: "implantacao",
    opportunityTypeLabel: "Implantação",
    stage: "Proposta",
    mainPain: "Falta de visibilidade operacional em tempo real e processos manuais de controle de consumo, causando perdas financeiras e operacionais recorrentes.",
    objectives: [
      "Centralizar gestão operacional em uma única plataforma",
      "Automatizar controle de consumo e faturamento",
      "Obter dashboards executivos em tempo real",
      "Reduzir custo operacional em pelo menos 20%",
    ],
    currentScenario: "Hoje a operação é gerida com planilhas manuais e sistemas legados desconectados, resultando em retrabalho, inconsistência de dados e decisões baseadas em informações desatualizadas.",
    whyActNow: "A regulação do setor energético exige conformidade até Q1/2026. Empresas que não digitalizarem suas operações enfrentarão multas e perda de competitividade.",
    solutionSummary: "Plataforma de Gestão Operacional Inteligente, com módulos de controle, faturamento, dashboards e integrações nativas.",
    solutionHow: "A solução atende cada dor identificada através de módulos especializados que se integram ao ecossistema existente, com onboarding assistido e suporte contínuo.",
    scopeBlocks: [],
    benefits: [
      { id: "b-1", title: "Redução de custos operacionais", description: "Economia de até 25% com automação de processos manuais e eliminação de retrabalho.", icon: "TrendingDown" },
      { id: "b-2", title: "Decisões baseadas em dados", description: "Dashboards em tempo real para gestão executiva com visibilidade total da operação.", icon: "Eye" },
      { id: "b-3", title: "Conformidade regulatória", description: "Adequação automática às exigências regulatórias do setor energético.", icon: "ShieldCheck" },
      { id: "b-4", title: "Escalabilidade", description: "Plataforma cloud-native que cresce com a operação sem necessidade de infraestrutura adicional.", icon: "Rocket" },
    ],
    timeline: [
      { id: "t-1", phase: 1, title: "Kickoff & Discovery", duration: "2 semanas", description: "Alinhamento, levantamento de requisitos e planejamento da implantação." },
      { id: "t-2", phase: 2, title: "Configuração & Migração", duration: "4 semanas", description: "Configuração da plataforma, migração de dados e integrações." },
      { id: "t-3", phase: 3, title: "Treinamento & Homologação", duration: "2 semanas", description: "Capacitação da equipe e validação em ambiente controlado." },
      { id: "t-4", phase: 4, title: "Go-Live & Estabilização", duration: "2 semanas", description: "Entrada em produção com acompanhamento dedicado." },
    ],
    investmentTotal: 186000,
    investmentSetup: 42000,
    investmentRecurring: 12000,
    investmentRecurringLabel: "/mês",
    differentiators: [
      { id: "d-1", title: "Especialização no setor", description: "Mais de 15 anos de experiência em projetos de transformação digital no setor de energia." },
      { id: "d-2", title: "Tecnologia própria", description: "Plataforma desenvolvida internamente, com roadmap orientado pelo cliente." },
      { id: "d-3", title: "Time dedicado", description: "Equipe de Customer Success focada no resultado do cliente desde o dia 1." },
    ],
    nextStep: "Agendar reunião de alinhamento técnico com as áreas de TI e Operações para validação da arquitetura proposta.",
    nextStepCta: "Agendar reunião de alinhamento",
    createdAt: "2026-03-15",
    expectedCloseDate: "2026-05-10",
    // Linked project — scope groups with EXPLICIT executive fields
    linkedProject: {
      id: "proj-nova-energia",
      description: "Implantação Plataforma Gestão Operacional — Nova Energia",
      status: "Em Revisão",
      totalHours: 480,
      totalItems: 32,
      scopeGroups: [
        {
          id: "sg-1",
          title: "Módulo Operacional",
          source: "template",
          itemCount: 12,
          totalHours: 160,
          executiveObjective: "Centralizar e automatizar a gestão operacional, eliminando controles manuais e garantindo rastreabilidade completa.",
          expectedImpact: "Redução de 40% no tempo de resposta operacional e eliminação de controles em planilha.",
          executiveSummary: "Frente responsável pela automação dos processos operacionais críticos, incluindo monitoramento em tempo real e alertas inteligentes.",
          items: [
            { id: "si-1", description: "Workflow automatizado de operação", hours: 24, included: true },
            { id: "si-2", description: "Regras de negócio configuráveis", hours: 32, included: true },
            { id: "si-3", description: "Integração com sensores IoT", hours: 40, included: true },
            { id: "si-4", description: "Alertas inteligentes por parâmetro", hours: 16, included: true },
            { id: "si-5", description: "Painel de monitoramento em tempo real", hours: 24, included: true },
            { id: "si-6", description: "Gestão de ordens de serviço", hours: 24, included: true },
          ],
        },
        {
          id: "sg-2",
          title: "Módulo Financeiro",
          source: "template",
          itemCount: 8,
          totalHours: 120,
          executiveObjective: "Garantir controle financeiro integrado com faturamento automatizado e visibilidade sobre receitas e custos.",
          expectedImpact: "Maior previsibilidade financeira e redução de perdas por inconsistências de faturamento.",
          items: [
            { id: "si-7", description: "Faturamento automático", hours: 32, included: true },
            { id: "si-8", description: "Conciliação bancária", hours: 24, included: true },
            { id: "si-9", description: "DRE operacional", hours: 32, included: true },
            { id: "si-10", description: "Previsão de receita", hours: 32, included: true },
          ],
        },
        {
          id: "sg-3",
          title: "Dashboards & BI",
          source: "template",
          itemCount: 6,
          totalHours: 96,
          executiveObjective: "Fornecer visibilidade executiva com indicadores em tempo real para suportar decisões estratégicas.",
          expectedImpact: "Decisões mais rápidas e fundamentadas, com dados atualizados e confiáveis.",
          items: [
            { id: "si-11", description: "KPIs em tempo real", hours: 24, included: true },
            { id: "si-12", description: "Relatórios customizáveis", hours: 32, included: true },
            { id: "si-13", description: "Alertas de desvio", hours: 16, included: true },
            { id: "si-14", description: "Exportação automatizada", hours: 24, included: true },
          ],
        },
        {
          id: "sg-4",
          title: "Onboarding & Suporte",
          source: "manual",
          itemCount: 6,
          totalHours: 104,
          executiveObjective: "Assegurar a adoção efetiva pela equipe por meio de capacitação estruturada e acompanhamento dedicado.",
          expectedImpact: "Equipe preparada para operar com autonomia, maximizando o retorno do investimento desde o primeiro mês.",
          items: [
            { id: "si-15", description: "Migração de dados legados", hours: 40, included: true },
            { id: "si-16", description: "Treinamento de equipe", hours: 24, included: true },
            { id: "si-17", description: "Suporte premium 24/7", hours: 16, included: true },
            { id: "si-18", description: "Gestor de sucesso dedicado", hours: 24, included: true },
          ],
        },
      ],
    },
    templateContext: {
      templateDocId: "1abc_template_implantacao",
      mitTemplateDocId: "1abc_mit_implantacao",
      placeholders: ["{{RAZAO_SOCIAL}}", "{{CNPJ}}", "{{TABELA_RECURSOS}}", "{{VALOR_TOTAL}}", "{{PRAZO_IMPLANTACAO}}"],
      premises: [
        "Acesso remoto ao ambiente de produção do cliente",
        "Disponibilidade de pelo menos 2 interlocutores técnicos",
        "Infraestrutura de rede compatível com os requisitos mínimos",
      ],
      outOfScope: [
        "Desenvolvimento de customizações fora do escopo contratado",
        "Suporte a versões de sistema operacional descontinuadas",
        "Treinamento presencial fora da sede do cliente",
      ],
      methodology: "Implantação em ondas com validação ao final de cada ciclo, utilizando metodologia de gestão de mudança ADKAR.",
    },
  },
  {
    id: "opp-2",
    company: "Rede Hospitalar Vida Plena",
    contact: "Dra. Carla Figueiredo",
    contactRole: "Superintendente de Operações",
    segment: "Saúde",
    opportunityTypeSlug: "consultoria",
    opportunityTypeLabel: "Consultoria",
    stage: "Qualificação",
    mainPain: "Processos assistenciais fragmentados entre unidades, com impacto direto na qualidade do atendimento e nos custos operacionais.",
    objectives: [
      "Padronizar processos assistenciais entre 12 unidades",
      "Reduzir tempo médio de atendimento em 30%",
      "Implementar indicadores de qualidade assistencial",
      "Preparar a rede para acreditação ONA nível 3",
    ],
    currentScenario: "Cada unidade opera com processos próprios, sem padronização. A falta de indicadores unificados dificulta a tomada de decisão e a gestão da qualidade assistencial.",
    whyActNow: "O mercado de saúde está em consolidação acelerada. Redes que não padronizarem seus processos perderão competitividade e poder de negociação com operadoras.",
    solutionSummary: "Consultoria especializada em redesenho de processos assistenciais com metodologia proprietária e implantação de indicadores de qualidade.",
    solutionHow: "Nossa abordagem combina diagnóstico in-loco, benchmark setorial e desenho participativo de processos, garantindo aderência e adoção pela equipe.",
    scopeBlocks: [],
    benefits: [
      { id: "b-5", title: "Padronização assistencial", description: "Todos os pacientes recebem o mesmo nível de atendimento, independente da unidade.", icon: "Heart" },
      { id: "b-6", title: "Redução de custos", description: "Eliminação de desperdícios e retrabalho, com economia estimada de 18% nos custos operacionais.", icon: "TrendingDown" },
      { id: "b-7", title: "Preparação para acreditação", description: "Processos alinhados aos critérios ONA nível 3 desde a concepção.", icon: "Award" },
      { id: "b-8", title: "Cultura de dados", description: "Decisões baseadas em indicadores confiáveis e atualizados em tempo real.", icon: "Brain" },
    ],
    timeline: [
      { id: "t-5", phase: 1, title: "Diagnóstico", duration: "4 semanas", description: "Imersão nas unidades, entrevistas e mapeamento completo." },
      { id: "t-6", phase: 2, title: "Redesenho", duration: "6 semanas", description: "Workshops de redesenho e validação com stakeholders." },
      { id: "t-7", phase: 3, title: "Implantação piloto", duration: "8 semanas", description: "Implantação em 2 unidades piloto com acompanhamento intensivo." },
      { id: "t-8", phase: 4, title: "Rollout", duration: "12 semanas", description: "Expansão para as demais unidades com suporte e monitoramento." },
    ],
    investmentTotal: 480000,
    differentiators: [
      { id: "d-4", title: "Metodologia validada", description: "Framework proprietário testado em mais de 40 redes hospitalares no Brasil." },
      { id: "d-5", title: "Equipe multidisciplinar", description: "Consultores com formação em gestão hospitalar, engenharia de processos e tecnologia." },
      { id: "d-6", title: "Resultados mensuráveis", description: "Compromisso contratual com metas de resultado desde o diagnóstico." },
    ],
    nextStep: "Agendar visita técnica à unidade sede para início do diagnóstico e alinhamento com a equipe de qualidade.",
    nextStepCta: "Agendar visita técnica",
    createdAt: "2026-03-20",
    expectedCloseDate: "2026-06-30",
    // No linked project — scope falls back to type defaults (consultoria)
    linkedProject: undefined,
    templateContext: {
      templateDocId: "1abc_template_consultoria",
      placeholders: ["{{RAZAO_SOCIAL}}", "{{CNPJ}}", "{{NUMERO_UNIDADES}}", "{{PRAZO_DIAGNOSTICO}}"],
      premises: [
        "Acesso presencial às unidades durante fase de diagnóstico",
        "Participação de lideranças locais nos workshops",
        "Designação de ponto focal por unidade",
      ],
      outOfScope: [
        "Implantação de sistemas de TI",
        "Contratação de pessoal para o cliente",
        "Auditoria regulatória formal",
      ],
      methodology: "Metodologia proprietária de consultoria operacional com ciclos de diagnóstico, redesenho, implantação piloto e rollout.",
    },
  },
  {
    id: "opp-3",
    company: "LogTech Transportes Inteligentes",
    contact: "Roberto Almeida",
    contactRole: "CEO",
    segment: "Logística & Transportes",
    opportunityTypeSlug: "projeto",
    opportunityTypeLabel: "Projeto",
    stage: "Negociação",
    mainPain: "Necessidade de um sistema de roteirização proprietário integrado ao ERP, pois as soluções de mercado não atendem às regras de negócio específicas da operação.",
    objectives: [
      "Desenvolver sistema de roteirização sob medida",
      "Integrar com o ERP Protheus existente",
      "Reduzir custo de frete em 15%",
      "Automatizar alocação de veículos e motoristas",
    ],
    currentScenario: "A roteirização é feita manualmente por 3 analistas, com alto índice de erro e ineficiência.",
    whyActNow: "A empresa está expandindo a operação para 3 novos estados. Sem automação, será necessário triplicar a equipe de roteirização, inviabilizando a expansão.",
    solutionSummary: "Desenvolvimento de plataforma de roteirização inteligente sob medida, com motor de regras proprietário e integração nativa ao Protheus.",
    solutionHow: "Construção iterativa em sprints de 2 semanas, com validação contínua da equipe operacional e releases incrementais em produção.",
    scopeBlocks: [],
    benefits: [
      { id: "b-9", title: "Redução de custo de frete", description: "Otimização inteligente de rotas com economia estimada de 15-20% no custo de frete.", icon: "TrendingDown" },
      { id: "b-10", title: "Escalabilidade operacional", description: "Expansão para novos estados sem aumento proporcional de equipe operacional.", icon: "Rocket" },
      { id: "b-11", title: "Propriedade intelectual", description: "Sistema proprietário que se torna vantagem competitiva exclusiva da empresa.", icon: "Shield" },
      { id: "b-12", title: "Decisões em tempo real", description: "Dashboards e alertas para gestão operacional com visibilidade total das entregas.", icon: "Eye" },
    ],
    timeline: [
      { id: "t-9", phase: 1, title: "Fundação", duration: "6 semanas", description: "Arquitetura, infraestrutura e motor de regras base." },
      { id: "t-10", phase: 2, title: "Roteirização Core", duration: "10 semanas", description: "Algoritmo principal com validação operacional contínua." },
      { id: "t-11", phase: 3, title: "Integração ERP", duration: "6 semanas", description: "Conexão bidirecional com Protheus e testes integrados." },
      { id: "t-12", phase: 4, title: "Inteligência & Go-Live", duration: "8 semanas", description: "ML, otimização e entrada em produção completa." },
    ],
    investmentTotal: 720000,
    investmentSetup: 720000,
    differentiators: [
      { id: "d-7", title: "Experiência em logística", description: "Mais de 50 projetos de tecnologia para o setor de transportes e logística." },
      { id: "d-8", title: "Metodologia ágil validada", description: "Entregas incrementais a cada 2 semanas com validação contínua do cliente." },
      { id: "d-9", title: "Suporte pós-entrega", description: "12 meses de suporte evolutivo inclusos para garantir a estabilização." },
    ],
    nextStep: "Definir equipe de produto do lado do cliente para início dos workshops de discovery na próxima semana.",
    nextStepCta: "Confirmar início do projeto",
    createdAt: "2026-02-28",
    expectedCloseDate: "2026-04-20",
    // Linked project — scope groups with EXPLICIT executive fields
    linkedProject: {
      id: "proj-logtech",
      description: "Projeto Sigma Cenário 2 BO no Mídia + Contábil/Fiscal e DP/Ponto no Protheus",
      status: "Em Revisão",
      totalHours: 912,
      totalItems: 78,
      scopeGroups: [
        {
          id: "sg-lt-1",
          title: "Integração Mídia+",
          source: "manual",
          itemCount: 9,
          totalHours: 160,
          executiveObjective: "Conectar o sistema Mídia+ ao ERP, eliminando silos de informação e garantindo fluxo de dados de vendas em tempo real.",
          expectedImpact: "Eliminação de digitação duplicada e ganho de confiabilidade nos dados comerciais.",
          executiveSummary: "Frente de integração entre Mídia+ e ERP para unificação de dados de vendas e operação.",
          items: [
            { id: "lt-1", description: "Configuração de integração com Mídia+", hours: 24, included: true },
            { id: "lt-2", description: "Migração de dados de vendas", hours: 32, included: true },
            { id: "lt-3", description: "Setup de regras de negócio", hours: 40, included: true },
            { id: "lt-4", description: "Validação de fluxos operacionais", hours: 24, included: true },
            { id: "lt-5", description: "Testes integrados end-to-end", hours: 40, included: true },
          ],
        },
        {
          id: "sg-lt-2",
          title: "TT - Contabilidade",
          source: "template",
          itemCount: 21,
          totalHours: 272,
          executiveObjective: "Estruturar a gestão contábil com automação de lançamentos, conciliações e fechamentos mensais.",
          expectedImpact: "Fechamentos mais ágeis e redução de riscos em obrigações legais e demonstrações financeiras.",
          items: [
            { id: "lt-6", description: "Plano de contas parametrizado", hours: 16, included: true },
            { id: "lt-7", description: "Lançamentos contábeis automatizados", hours: 40, included: true },
            { id: "lt-8", description: "Conciliação contábil", hours: 32, included: true },
            { id: "lt-9", description: "Relatórios contábeis legais", hours: 24, included: true },
            { id: "lt-10", description: "Integração com módulo fiscal", hours: 32, included: true },
            { id: "lt-11", description: "Fechamento contábil mensal", hours: 24, included: true },
          ],
        },
        {
          id: "sg-lt-3",
          title: "TT - Fiscal",
          source: "template",
          itemCount: 7,
          totalHours: 132,
          executiveObjective: "Garantir conformidade fiscal com apuração automatizada de impostos e geração de obrigações acessórias.",
          expectedImpact: "Conformidade garantida com redução de riscos fiscais, multas e retrabalho tributário.",
          items: [
            { id: "lt-12", description: "Configuração tributária por UF", hours: 32, included: true },
            { id: "lt-13", description: "Apuração de impostos", hours: 24, included: true },
            { id: "lt-14", description: "Obrigações acessórias (SPED, EFD)", hours: 40, included: true },
            { id: "lt-15", description: "Notas fiscais eletrônicas", hours: 36, included: true },
          ],
        },
        {
          id: "sg-lt-4",
          title: "TT - RH",
          source: "template",
          itemCount: 41,
          totalHours: 348,
          executiveObjective: "Modernizar a gestão de pessoas com folha automatizada, controle de ponto e conformidade com eSocial.",
          expectedImpact: "Conformidade trabalhista plena e eficiência na gestão do capital humano, reduzindo riscos legais.",
          items: [
            { id: "lt-16", description: "Cadastro de colaboradores", hours: 16, included: true },
            { id: "lt-17", description: "Folha de pagamento", hours: 48, included: true },
            { id: "lt-18", description: "Controle de ponto eletrônico", hours: 40, included: true },
            { id: "lt-19", description: "Gestão de férias e afastamentos", hours: 32, included: true },
            { id: "lt-20", description: "Benefícios e descontos", hours: 24, included: true },
            { id: "lt-21", description: "Obrigações trabalhistas (eSocial)", hours: 40, included: true },
          ],
        },
      ],
    },
    templateContext: {
      templateDocId: "1abc_template_projeto",
      placeholders: ["{{RAZAO_SOCIAL}}", "{{CNPJ}}", "{{TABELA_RECURSOS}}", "{{VALOR_TOTAL}}", "{{PRAZO_PROJETO}}"],
      premises: [
        "Equipe de produto do cliente disponível para validações semanais",
        "Ambiente de homologação fornecido pelo cliente",
        "Acesso VPN ao ERP Protheus para integrações",
      ],
      outOfScope: [
        "Manutenção evolutiva após período de garantia",
        "Treinamento para equipes não previstas no escopo",
        "Integrações com sistemas de terceiros não listados",
      ],
      methodology: "Desenvolvimento ágil em sprints de 2 semanas com entregas incrementais e validação contínua.",
    },
  },
];

// =====================================================================
//  SHARED STORE
// =====================================================================
let _presentationConfigs = { ...initialPresentationConfigs };
let _opportunities = [...initialOpportunities];
let _presentations: ExecutivePresentation[] = [];
let _listeners: Array<() => void> = [];

function notify() {
  _listeners.forEach((fn) => fn());
}

/**
 * Validates that all opportunity slugs have a matching config.
 * Returns list of unmatched slugs — useful for debugging & future DB sync.
 */
export function validateSlugAlignment(): { matched: string[]; unmatched: string[] } {
  const slugsInUse = [...new Set(_opportunities.map((o) => o.opportunityTypeSlug))];
  const matched = slugsInUse.filter((s) => s in _presentationConfigs);
  const unmatched = slugsInUse.filter((s) => !(s in _presentationConfigs));
  return { matched, unmatched };
}

/**
 * Ensures a config entry exists for a given slug.
 * If not, creates a minimal placeholder config.
 * Call this when syncing with real proposal_types from DB.
 */
export function ensureConfigForSlug(slug: string, name: string): PresentationTypeConfig {
  if (_presentationConfigs[slug]) return _presentationConfigs[slug];
  const placeholder: PresentationTypeConfig = {
    executiveSummary: `Apresentação executiva para oportunidades do tipo ${name}.`,
    positioningText: "",
    problemStatement: "",
    solutionApproach: "",
    defaultBenefits: [],
    defaultScopeBlocks: [],
    defaultTimeline: [],
    pricingDisplayMode: "setup_unico",
    differentiators: [],
    defaultCta: "Entrar em contato para próximos passos",
    preferredTemplate: "modern",
    references: [],
  };
  _presentationConfigs[slug] = placeholder;
  notify();
  return placeholder;
}

export const executivePresentationStore = {
  subscribe(fn: () => void) {
    _listeners.push(fn);
    return () => { _listeners = _listeners.filter((l) => l !== fn); };
  },

  // ── Presentation Type Configs (keyed by proposal_types.slug) ────
  getConfigForSlug: (slug: string): PresentationTypeConfig | undefined =>
    _presentationConfigs[slug],

  getAllConfigs: () => _presentationConfigs,

  upsertConfig(slug: string, config: PresentationTypeConfig) {
    _presentationConfigs[slug] = config;
    notify();
  },

  deleteConfig(slug: string) {
    delete _presentationConfigs[slug];
    notify();
  },

  hasConfig: (slug: string) => slug in _presentationConfigs,

  // ── Opportunities ───────────────────────────────────────────────
  getOpportunities: () => _opportunities,
  getOpportunity: (id: string) => _opportunities.find((o) => o.id === id),

  // ── Presentations ───────────────────────────────────────────────
  getPresentations: () => _presentations,
  getPresentation: (id: string) => _presentations.find((p) => p.id === id),
  getPresentationByShare: (slug: string) => _presentations.find((p) => p.shareSlug === slug),

  createPresentation(
    opportunity: OpportunityData,
    config: PresentationConfig,
  ): ExecutivePresentation {
    const typeConfig = executivePresentationStore.getConfigForSlug(config.opportunityTypeSlug);
    const composedData = composePresentation(opportunity, typeConfig);

    const now = new Date().toISOString();
    const id = `pres-${Date.now()}`;
    const pres: ExecutivePresentation = {
      id,
      opportunityId: opportunity.id,
      opportunityTypeSlug: config.opportunityTypeSlug,
      config,
      composedData,
      overrides: {},
      dataSources: {
        opportunity: true,
        proposalType: !!typeConfig,
        linkedProject: !!opportunity.linkedProject,
        proposalTemplate: !!opportunity.templateContext,
      },
      shareSlug: id,
      createdAt: now,
      updatedAt: now,
    };
    _presentations.push(pres);
    notify();
    return pres;
  },

  updateOverrides(id: string, overrides: Record<string, string>) {
    const pres = _presentations.find((p) => p.id === id);
    if (pres) {
      pres.overrides = overrides;
      pres.updatedAt = new Date().toISOString();
      notify();
    }
  },

  duplicatePresentation(id: string): ExecutivePresentation | undefined {
    const source = _presentations.find((p) => p.id === id);
    if (!source) return undefined;
    const now = new Date().toISOString();
    const newId = `pres-${Date.now()}`;
    const dup: ExecutivePresentation = {
      ...structuredClone(source),
      id: newId,
      shareSlug: newId,
      createdAt: now,
      updatedAt: now,
    };
    _presentations.push(dup);
    notify();
    return dup;
  },
};
