// Mock data for the proposal management system

export interface Client {
  id: string;
  code: string;
  name: string;
  cnpj: string;
  contact: string;
  email: string;
  phone: string;
  address: string;
  stateRegistration: string;
}

export interface SalesTeamMember {
  id: string;
  code: string;
  name: string;
  email: string;
  role: "esn" | "gsn" | "arquiteto";
  linkedGsnId?: string; // ESN linked to a GSN
}

export interface ScopeItem {
  id: string;
  description: string;
  included: boolean;
  hours: number;
  phase: number;
  notes: string;
}

export interface ScopeTemplate {
  id: string;
  name: string;
  product: string; // RM, Protheus, Fluig, etc.
  category: string; // Fiscal, Compras, etc.
  items: ScopeItem[];
}

export interface PaymentCondition {
  installment: number;
  dueDate: string;
  amount: number;
}

export interface Proposal {
  id: string;
  number: string;
  type: "projeto" | "banco_de_horas";
  product: string;
  status: "rascunho" | "em_revisao" | "aprovada" | "enviada";
  clientId: string;
  clientName: string;
  esnId: string;
  gsnId: string;
  arquitetoId: string;
  dateCreated: string;
  dateValidity: string;
  hourlyRate: number;
  totalHours: number;
  totalValue: number;
  selectedTemplates: string[];
  scopeItems: Record<string, ScopeItem[]>;
  paymentConditions: PaymentCondition[];
  macroScope: { phase: number; scope: string; analystHours: number; gpHours: number; description: string }[];
  gpPercentage: number;
  accompAnalyst: number;
  accompGP: number;
  travelLocalHours: number;
  travelTripHours: number;
  travelHourlyRate: number;
  numCompanies: number;
  additionalAnalystRate: number;
  additionalGPRate: number;
  scopeType: "detalhado" | "macro";
  negotiation: string;
}

export const mockClients: Client[] = [
  { id: "c1", code: "10234", name: "Indústrias ABC Ltda", cnpj: "12.345.678/0001-90", contact: "João Silva", email: "joao@abc.com.br", phone: "(11) 3456-7890", address: "Rua das Indústrias, 100 - São Paulo/SP", stateRegistration: "123.456.789.000" },
  { id: "c2", code: "10567", name: "Comércio XYZ S.A.", cnpj: "98.765.432/0001-10", contact: "Maria Santos", email: "maria@xyz.com.br", phone: "(21) 2345-6789", address: "Av. Comercial, 500 - Rio de Janeiro/RJ", stateRegistration: "987.654.321.000" },
  { id: "c3", code: "10890", name: "Transportes Delta Ltda", cnpj: "45.678.901/0001-23", contact: "Carlos Pereira", email: "carlos@delta.com.br", phone: "(31) 3456-1234", address: "Rod. BR-040, km 52 - Belo Horizonte/MG", stateRegistration: "456.789.012.000" },
  { id: "c4", code: "11023", name: "Hospital São Lucas", cnpj: "67.890.123/0001-45", contact: "Ana Oliveira", email: "ana@saolucas.com.br", phone: "(41) 3567-8901", address: "Rua da Saúde, 200 - Curitiba/PR", stateRegistration: "678.901.234.000" },
  { id: "c5", code: "11245", name: "Construtora Omega Engenharia", cnpj: "23.456.789/0001-67", contact: "Pedro Costa", email: "pedro@omega.com.br", phone: "(51) 3234-5678", address: "Av. dos Engenheiros, 800 - Porto Alegre/RS", stateRegistration: "234.567.890.000" },
];

export const mockSalesTeam: SalesTeamMember[] = [
  { id: "s1", code: "ESN001", name: "Ricardo Mendes", email: "ricardo.mendes@totvsleste.com.br", role: "esn", linkedGsnId: "s3" },
  { id: "s2", code: "ESN002", name: "Fernanda Lima", email: "fernanda.lima@totvsleste.com.br", role: "esn", linkedGsnId: "s3" },
  { id: "s3", code: "GSN001", name: "Marcos Albuquerque", email: "marcos.albuquerque@totvsleste.com.br", role: "gsn" },
  { id: "s4", code: "GSN002", name: "Patrícia Rocha", email: "patricia.rocha@totvsleste.com.br", role: "gsn" },
  { id: "s5", code: "ARQ001", name: "André Nascimento", email: "andre.nascimento@totvsleste.com.br", role: "arquiteto" },
  { id: "s6", code: "ARQ002", name: "Camila Torres", email: "camila.torres@totvsleste.com.br", role: "arquiteto" },
];

const createScopeItems = (items: string[]): ScopeItem[] =>
  items.map((desc, i) => ({
    id: `si-${Math.random().toString(36).substring(7)}`,
    description: desc,
    included: false,
    hours: 0,
    phase: 1,
    notes: "",
  }));

export const mockScopeTemplates: ScopeTemplate[] = [
  {
    id: "t1", name: "RM Fiscal", product: "RM", category: "Fiscal",
    items: createScopeItems([
      "Parametrização de Filiais e Empresas",
      "Configuração de Naturezas de Operação",
      "Configuração de CFOP e CST",
      "Emissão de NF-e / NFS-e",
      "Escrituração Fiscal (Entradas e Saídas)",
      "Apuração de ICMS / IPI / PIS / COFINS",
      "SPED Fiscal (EFD ICMS/IPI)",
      "SPED Contribuições (EFD PIS/COFINS)",
      "Reinf / DCTF-Web",
      "Integração com Módulo Contábil",
    ]),
  },
  {
    id: "t2", name: "RM Compras", product: "RM", category: "Compras",
    items: createScopeItems([
      "Cadastro de Fornecedores",
      "Solicitação de Compra",
      "Cotação de Preços",
      "Pedido de Compra",
      "Recebimento de Materiais",
      "Devolução a Fornecedores",
      "Aprovação de Compras (Workflow)",
      "Relatórios de Compras",
    ]),
  },
  {
    id: "t3", name: "RM Estoque", product: "RM", category: "Estoque",
    items: createScopeItems([
      "Cadastro de Produtos e Serviços",
      "Movimentação de Estoque",
      "Inventário",
      "Requisição de Materiais",
      "Controle de Lotes e Validade",
      "Custo Médio / FIFO / LIFO",
      "Centro de Custo por Produto",
      "Relatórios de Posição de Estoque",
    ]),
  },
  {
    id: "t4", name: "RM Financeiro", product: "RM", category: "Financeiro",
    items: createScopeItems([
      "Contas a Pagar",
      "Contas a Receber",
      "Fluxo de Caixa",
      "Conciliação Bancária",
      "Boletos (CNAB 240/400)",
      "Cobrança Bancária",
      "Provisões e Baixas",
      "Relatórios Financeiros",
      "DRE Gerencial",
    ]),
  },
  {
    id: "t5", name: "RM Contábil", product: "RM", category: "Contábil",
    items: createScopeItems([
      "Plano de Contas",
      "Lançamentos Contábeis",
      "Conciliação Contábil",
      "Balancete / DRE / Balanço",
      "SPED Contábil (ECD)",
      "ECF (Escrituração Contábil Fiscal)",
      "Centro de Custos e Rateios",
      "Fechamento Contábil",
    ]),
  },
  {
    id: "t6", name: "RM RH / Folha", product: "RM", category: "RH",
    items: createScopeItems([
      "Cadastro de Funcionários",
      "Admissão Digital (eSocial)",
      "Folha de Pagamento",
      "Férias e 13º Salário",
      "Rescisão Contratual",
      "Benefícios",
      "eSocial - Eventos Periódicos",
      "eSocial - Eventos Não Periódicos",
      "RAIS / DIRF / CAGED",
      "Ponto Eletrônico",
    ]),
  },
  {
    id: "t7", name: "Protheus Faturamento", product: "Protheus", category: "Faturamento",
    items: createScopeItems([
      "Cadastro de Clientes",
      "Pedido de Venda",
      "Liberação de Pedido",
      "Documento de Saída (NF-e)",
      "Nota de Serviço (NFS-e)",
      "Tabela de Preços",
      "Comissões",
      "Relatórios de Faturamento",
    ]),
  },
  {
    id: "t8", name: "Protheus Compras", product: "Protheus", category: "Compras",
    items: createScopeItems([
      "Cadastro de Fornecedores",
      "Solicitação de Compras",
      "Pedido de Compras",
      "Cotação",
      "Autorização de Entrega",
      "Documento de Entrada",
      "Contrato de Parceria",
      "Aprovação via Workflow",
    ]),
  },
  {
    id: "t9", name: "TT Gestão de Projetos", product: "TOTVS", category: "Gestão",
    items: createScopeItems([
      "Configuração de Projetos",
      "Estrutura Analítica (EAP/WBS)",
      "Cronograma de Atividades",
      "Alocação de Recursos",
      "Apontamento de Horas",
      "Acompanhamento de Custos",
      "Dashboard de Projetos",
      "Relatórios Gerenciais",
    ]),
  },
  {
    id: "t10", name: "TT Business Intelligence", product: "TOTVS", category: "BI",
    items: createScopeItems([
      "Configuração do Ambiente GoodData/Smart Analytics",
      "Carga de Dados Inicial",
      "Dashboards Padrão",
      "KPIs Operacionais",
      "KPIs Financeiros",
      "Treinamento de Usuários",
      "Customização de Relatórios",
    ]),
  },
];

export const mockProposals: Proposal[] = [
  {
    id: "p1", number: "OPP-2025-001", type: "projeto", product: "RM", status: "rascunho",
    clientId: "c1", clientName: "Indústrias ABC Ltda", esnId: "s1", gsnId: "s3", arquitetoId: "s5",
    dateCreated: "2025-03-10", dateValidity: "2025-04-10", hourlyRate: 250, totalHours: 480, totalValue: 120000,
    selectedTemplates: ["t1", "t4", "t5"], scopeItems: {}, paymentConditions: [
      { installment: 1, dueDate: "2025-04-10", amount: 40000 },
      { installment: 2, dueDate: "2025-05-10", amount: 40000 },
      { installment: 3, dueDate: "2025-06-10", amount: 40000 },
    ],
    macroScope: [], gpPercentage: 20, accompAnalyst: 15, accompGP: 10,
    travelLocalHours: 1, travelTripHours: 4, travelHourlyRate: 250, numCompanies: 1,
    additionalAnalystRate: 280, additionalGPRate: 300, scopeType: "detalhado", negotiation: "",
  },
  {
    id: "p2", number: "OPP-2025-002", type: "banco_de_horas", product: "Protheus", status: "aprovada",
    clientId: "c2", clientName: "Comércio XYZ S.A.", esnId: "s2", gsnId: "s3", arquitetoId: "s6",
    dateCreated: "2025-02-20", dateValidity: "2025-03-20", hourlyRate: 250, totalHours: 200, totalValue: 50000,
    selectedTemplates: ["t7", "t8"], scopeItems: {}, paymentConditions: [
      { installment: 1, dueDate: "2025-03-20", amount: 25000 },
      { installment: 2, dueDate: "2025-04-20", amount: 25000 },
    ],
    macroScope: [], gpPercentage: 20, accompAnalyst: 15, accompGP: 10,
    travelLocalHours: 1, travelTripHours: 4, travelHourlyRate: 250, numCompanies: 1,
    additionalAnalystRate: 280, additionalGPRate: 300, scopeType: "macro", negotiation: "",
  },
  {
    id: "p3", number: "OPP-2025-003", type: "projeto", product: "RM", status: "em_revisao",
    clientId: "c4", clientName: "Hospital São Lucas", esnId: "s1", gsnId: "s3", arquitetoId: "s5",
    dateCreated: "2025-03-01", dateValidity: "2025-04-01", hourlyRate: 280, totalHours: 640, totalValue: 179200,
    selectedTemplates: ["t1", "t2", "t3", "t4", "t6"], scopeItems: {}, paymentConditions: [],
    macroScope: [], gpPercentage: 20, accompAnalyst: 15, accompGP: 10,
    travelLocalHours: 1, travelTripHours: 4, travelHourlyRate: 250, numCompanies: 2,
    additionalAnalystRate: 310, additionalGPRate: 330, scopeType: "detalhado", negotiation: "",
  },
];

export const unitInfo = {
  name: "TOTVS Leste",
  cnpj: "XX.XXX.XXX/0001-XX",
  contact: "Operações TOTVS Leste",
  email: "operacoes@totvsleste.com.br",
  phone: "(XX) XXXX-XXXX",
  address: "Endereço da Unidade",
  city: "São Paulo",
};

export const products = ["RM", "Protheus", "Fluig", "TOTVS Saúde", "TOTVS Educacional", "TOTVS Construção"];
