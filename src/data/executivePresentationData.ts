// Executive Presentation — Data models, mock data & shared store
// No hardcoded type unions — all types come from the central store.

// ── Shared scalar types (open strings, not unions) ──────────────────
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

// ── Reference Attachment (DOC/PDF attached to a type) ───────────────
export interface ReferenceAttachment {
  id: string;
  fileName: string;
  fileType: "pdf" | "doc" | "docx";
  description: string;
  uploadedAt: string;
  url?: string;
}

// ── OpportunityType (content-base per type) ─────────────────────────
export interface OpportunityType {
  id: string;
  name: string;
  slug: string;
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
  createdAt: string;
  updatedAt: string;
}

/** @deprecated use OpportunityType instead */
export type OpportunityTypeReference = OpportunityType;

// ── Opportunity Data ────────────────────────────────────────────────
export interface OpportunityData {
  id: string;
  company: string;
  contact: string;
  contactRole: string;
  segment: string;
  /** slug referencing an OpportunityType */
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
}

// ── Presentation Config ─────────────────────────────────────────────
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
  /** Composed data snapshot (type defaults + opportunity data) */
  composedData: OpportunityData;
  /** User overrides applied in preview editor */
  overrides: Record<string, string>;
  shareSlug: string;
  createdAt: string;
  updatedAt: string;
}

// ── Composition helper ──────────────────────────────────────────────
export function composePresentation(
  opportunity: OpportunityData,
  typeRef: OpportunityType,
): OpportunityData {
  return {
    ...opportunity,
    solutionSummary: opportunity.solutionSummary || typeRef.solutionApproach,
    solutionHow: opportunity.solutionHow || typeRef.positioningText,
    currentScenario: opportunity.currentScenario || typeRef.problemStatement,
    scopeBlocks: opportunity.scopeBlocks.length > 0 ? opportunity.scopeBlocks : typeRef.defaultScopeBlocks,
    benefits: opportunity.benefits.length > 0 ? opportunity.benefits : typeRef.defaultBenefits,
    timeline: opportunity.timeline.length > 0 ? opportunity.timeline : typeRef.defaultTimeline,
    differentiators: opportunity.differentiators.length > 0 ? opportunity.differentiators : typeRef.differentiators,
    nextStep: opportunity.nextStep || typeRef.defaultCta,
    nextStepCta: opportunity.nextStepCta || typeRef.defaultCta,
  };
}

// ── Option lists (template, audience, detail, pricing) ──────────────
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

// =====================================================================
//  MOCK DATA — Opportunity Types
// =====================================================================
const initialOpportunityTypes: OpportunityType[] = [
  {
    id: "type-saas",
    name: "SaaS / Assinatura",
    slug: "saas",
    executiveSummary: "Soluções em nuvem com modelo de assinatura recorrente, entrega contínua de valor e escalabilidade imediata.",
    positioningText: "Transforme sua operação com tecnologia de ponta em modelo SaaS — sem investimento em infraestrutura, com atualizações contínuas e suporte dedicado.",
    problemStatement: "Empresas que dependem de sistemas legados enfrentam custos crescentes de manutenção, lentidão na inovação e riscos de segurança que comprometem a competitividade.",
    solutionApproach: "Nossa plataforma SaaS oferece módulos especializados com onboarding assistido, integrações nativas e evolução contínua orientada pelo cliente.",
    defaultBenefits: [
      { id: "db-1", title: "Redução de custos operacionais", description: "Economia de até 25% com automação e eliminação de infraestrutura própria.", icon: "TrendingDown" },
      { id: "db-2", title: "Decisões baseadas em dados", description: "Dashboards em tempo real com KPIs estratégicos e operacionais.", icon: "Eye" },
      { id: "db-3", title: "Escalabilidade imediata", description: "Plataforma cloud-native que cresce com a operação sem investimento adicional.", icon: "Rocket" },
      { id: "db-4", title: "Atualizações contínuas", description: "Novas funcionalidades entregues automaticamente sem paradas ou custos extras.", icon: "ShieldCheck" },
    ],
    defaultScopeBlocks: [
      { id: "ds-1", title: "Módulo Core", description: "Funcionalidades essenciais da plataforma com configuração personalizada.", icon: "Settings", items: ["Setup inicial", "Configuração de regras de negócio", "Migração de dados", "Integrações base"] },
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
    pricingDisplayMode: "recorrencia",
    differentiators: [
      { id: "dd-1", title: "Tecnologia própria", description: "Plataforma desenvolvida internamente com roadmap orientado pelo cliente." },
      { id: "dd-2", title: "Time dedicado", description: "Customer Success focado no resultado desde o dia 1." },
      { id: "dd-3", title: "Especialização setorial", description: "Experiência comprovada no setor com cases de sucesso." },
    ],
    defaultCta: "Agendar reunião de alinhamento técnico",
    preferredTemplate: "modern",
    references: [
      { id: "ref-1", fileName: "Template_Proposta_SaaS_v3.docx", fileType: "docx", description: "Template padrão de proposta SaaS", uploadedAt: "2026-02-15" },
      { id: "ref-2", fileName: "Modelo_Comercial_SaaS.pdf", fileType: "pdf", description: "Modelo de precificação SaaS", uploadedAt: "2026-01-20" },
    ],
    createdAt: "2025-11-01",
    updatedAt: "2026-03-10",
  },
  {
    id: "type-consultoria",
    name: "Consultoria / Serviços",
    slug: "consultoria",
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
    createdAt: "2025-11-01",
    updatedAt: "2026-03-10",
  },
  {
    id: "type-projeto",
    name: "Projeto Sob Medida",
    slug: "projeto_sob_medida",
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
      { id: "ref-5", fileName: "Cronograma_Padrao_Projeto.pdf", fileType: "pdf", description: "Modelo de cronograma para projetos", uploadedAt: "2026-01-15" },
    ],
    createdAt: "2025-11-01",
    updatedAt: "2026-03-10",
  },
];

// =====================================================================
//  MOCK DATA — Opportunities
// =====================================================================
const initialOpportunities: OpportunityData[] = [
  {
    id: "opp-1",
    company: "Grupo Nova Energia S.A.",
    contact: "Marcelo Andrade",
    contactRole: "Diretor de Tecnologia",
    segment: "Energia & Utilities",
    opportunityTypeSlug: "saas",
    opportunityTypeLabel: "SaaS / Assinatura",
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
    solutionSummary: "Plataforma SaaS de Gestão Operacional Inteligente, com módulos de controle, faturamento, dashboards e integrações nativas.",
    solutionHow: "A solução atende cada dor identificada através de módulos especializados que se integram ao ecossistema existente, com onboarding assistido e suporte contínuo.",
    scopeBlocks: [
      { id: "sb-1", title: "Módulo Operacional", description: "Gestão completa da operação com automação de processos e controle em tempo real.", icon: "Settings", items: ["Workflow automatizado", "Regras de negócio configuráveis", "Integração com sensores IoT", "Alertas inteligentes"] },
      { id: "sb-2", title: "Módulo Financeiro", description: "Faturamento automatizado com conciliação e relatórios financeiros integrados.", icon: "DollarSign", items: ["Faturamento automático", "Conciliação bancária", "DRE operacional", "Previsão de receita"] },
      { id: "sb-3", title: "Dashboards & BI", description: "Visibilidade executiva em tempo real com indicadores estratégicos e operacionais.", icon: "BarChart3", items: ["KPIs em tempo real", "Relatórios customizáveis", "Alertas de desvio", "Exportação automatizada"] },
      { id: "sb-4", title: "Onboarding & Suporte", description: "Implantação assistida com treinamento, migração de dados e suporte dedicado.", icon: "GraduationCap", items: ["Migração de dados", "Treinamento de equipe", "Suporte premium 24/7", "Gestor de sucesso dedicado"] },
    ],
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
  },
  {
    id: "opp-2",
    company: "Rede Hospitalar Vida Plena",
    contact: "Dra. Carla Figueiredo",
    contactRole: "Superintendente de Operações",
    segment: "Saúde",
    opportunityTypeSlug: "consultoria",
    opportunityTypeLabel: "Consultoria / Serviços",
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
    scopeBlocks: [
      { id: "sb-5", title: "Diagnóstico", description: "Mapeamento completo dos processos atuais em todas as unidades com identificação de gaps e oportunidades.", icon: "Search", items: ["Entrevistas com lideranças", "Mapeamento AS-IS", "Análise de indicadores", "Benchmark setorial"] },
      { id: "sb-6", title: "Redesenho de Processos", description: "Definição do modelo TO-BE com padronização assistencial e operacional.", icon: "PenTool", items: ["Processos TO-BE padronizados", "Protocolos assistenciais", "Fluxos de escalação", "Matriz de responsabilidades"] },
      { id: "sb-7", title: "Implantação", description: "Execução assistida do plano de mudança com acompanhamento em cada unidade.", icon: "CheckCircle", items: ["Plano de mudança por unidade", "Treinamento presencial", "Mentoria de lideranças", "Suporte à transição"] },
      { id: "sb-8", title: "Indicadores & Governança", description: "Framework de indicadores de qualidade e governança para sustentação dos resultados.", icon: "BarChart3", items: ["Dashboard de qualidade", "Comitês de governança", "Ciclos de melhoria contínua", "Relatório executivo mensal"] },
    ],
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
  },
  {
    id: "opp-3",
    company: "LogTech Transportes Inteligentes",
    contact: "Roberto Almeida",
    contactRole: "CEO",
    segment: "Logística & Transportes",
    opportunityTypeSlug: "projeto_sob_medida",
    opportunityTypeLabel: "Projeto Sob Medida",
    stage: "Negociação",
    mainPain: "Necessidade de um sistema de roteirização proprietário integrado ao ERP, pois as soluções de mercado não atendem às regras de negócio específicas da operação.",
    objectives: [
      "Desenvolver sistema de roteirização sob medida",
      "Integrar com o ERP Protheus existente",
      "Reduzir custo de frete em 15%",
      "Automatizar alocação de veículos e motoristas",
    ],
    currentScenario: "A roteirização é feita manualmente por 3 analistas, com alto índice de erro e ineficiência. As tentativas com ferramentas de mercado falharam por não suportarem as regras de negócio específicas.",
    whyActNow: "A empresa está expandindo a operação para 3 novos estados. Sem automação, será necessário triplicar a equipe de roteirização, inviabilizando a expansão.",
    solutionSummary: "Desenvolvimento de plataforma de roteirização inteligente sob medida, com motor de regras proprietário e integração nativa ao Protheus.",
    solutionHow: "Construção iterativa em sprints de 2 semanas, com validação contínua da equipe operacional e releases incrementais em produção.",
    scopeBlocks: [
      { id: "sb-9", title: "Fase 1 — Fundação", description: "Arquitetura, modelagem de dados, setup de infraestrutura e motor de regras base.", icon: "Layers", items: ["Arquitetura do sistema", "Modelagem de dados", "Motor de regras v1", "Infraestrutura cloud"] },
      { id: "sb-10", title: "Fase 2 — Roteirização Core", description: "Algoritmo de roteirização com restrições operacionais e otimização de rotas.", icon: "Route", items: ["Algoritmo de otimização", "Restrições de janela", "Capacidade de veículo", "Priorização de entregas"] },
      { id: "sb-11", title: "Fase 3 — Integração ERP", description: "Integração bidirecional com Protheus para pedidos, frota e faturamento.", icon: "Link", items: ["API de pedidos", "Sincronização de frota", "Faturamento automático", "Painel de monitoramento"] },
      { id: "sb-12", title: "Fase 4 — Inteligência", description: "Machine learning para previsão de demanda e otimização contínua de rotas.", icon: "Brain", items: ["Previsão de demanda", "Otimização contínua", "Análise de performance", "Recomendações automáticas"] },
    ],
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
  },
];

// =====================================================================
//  SHARED STORE — in-memory singleton (survives across components)
// =====================================================================
let _opportunityTypes = [...initialOpportunityTypes];
let _opportunities = [...initialOpportunities];
let _presentations: ExecutivePresentation[] = [];
let _listeners: Array<() => void> = [];

function notify() {
  _listeners.forEach((fn) => fn());
}

export const executivePresentationStore = {
  subscribe(fn: () => void) {
    _listeners.push(fn);
    return () => {
      _listeners = _listeners.filter((l) => l !== fn);
    };
  },

  // ── Opportunity Types ───────────────────────────────────────────
  getTypes: () => _opportunityTypes,
  getTypeBySlug: (slug: string) => _opportunityTypes.find((t) => t.slug === slug),
  getTypeById: (id: string) => _opportunityTypes.find((t) => t.id === id),

  setTypes(types: OpportunityType[]) {
    _opportunityTypes = types;
    notify();
  },
  upsertType(type: OpportunityType) {
    const idx = _opportunityTypes.findIndex((t) => t.id === type.id);
    if (idx >= 0) _opportunityTypes[idx] = type;
    else _opportunityTypes.push(type);
    notify();
  },
  deleteType(id: string) {
    _opportunityTypes = _opportunityTypes.filter((t) => t.id !== id);
    notify();
  },

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
    const typeRef = executivePresentationStore.getTypeBySlug(config.opportunityTypeSlug);
    const composedData = typeRef
      ? composePresentation(opportunity, typeRef)
      : opportunity;

    const now = new Date().toISOString();
    const id = `pres-${Date.now()}`;
    const pres: ExecutivePresentation = {
      id,
      opportunityId: opportunity.id,
      opportunityTypeSlug: config.opportunityTypeSlug,
      config,
      composedData,
      overrides: {},
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

// ── Legacy aliases (backward compat) ────────────────────────────────
/** @deprecated use executivePresentationStore.getTypes() */
export const mockOpportunityTypes = _opportunityTypes;
/** @deprecated use executivePresentationStore.getOpportunities() */
export const mockOpportunities = _opportunities;

export function getTypeForOpportunity(opp: OpportunityData): OpportunityType | undefined {
  return executivePresentationStore.getTypeBySlug(opp.opportunityTypeSlug);
}

export const defaultPresentationConfig: PresentationConfig = {
  opportunityTypeSlug: "saas",
  templateStyle: "modern",
  audience: "c_level",
  detailLevel: "resumido",
  showInvestment: true,
  showTimeline: true,
};
