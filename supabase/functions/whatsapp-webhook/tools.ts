// WhatsApp AI Tool definitions and executors
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const TOOLS = [
  {
    type: "function",
    function: {
      name: "generate_proposal_number",
      description: "Gera o próximo número sequencial de proposta (OPP). Use sempre antes de criar uma proposta para obter a numeração correta do sistema.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_client",
      description: "Busca um cliente pelo nome, código ou CNPJ. Retorna id, nome, código, unidade, esn e gsn vinculados.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Nome, código ou CNPJ do cliente (parcial)" },
        },
        required: ["search"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_sales_member",
      description: "Busca membro da equipe comercial (ESN, GSN, Arquiteto) por nome ou código.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Nome ou código do membro" },
          role: { type: "string", enum: ["esn", "gsn", "arquiteto"], description: "Papel desejado" },
        },
        required: ["search"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_proposal",
      description: "Cria uma nova oportunidade/proposta no sistema. Retorna o ID e número da proposta criada. IMPORTANTE: sempre use generate_proposal_number antes para obter o número correto, e lookup_client para obter o client_id.",
      parameters: {
        type: "object",
        properties: {
          number: { type: "string", description: "Número da proposta (obrigatório, obtido via generate_proposal_number)" },
          client_id: { type: "string", description: "UUID do cliente (obrigatório, obtido via lookup_client)" },
          product: { type: "string", description: "Nome do produto (ex: SAP Business One, RM, Protheus)" },
          type: { type: "string", enum: ["banco_de_horas", "projeto", "suporte", "consultoria"], description: "Tipo da proposta" },
          esn_id: { type: "string", description: "UUID do ESN (opcional, obtido via lookup_sales_member)" },
          arquiteto_id: { type: "string", description: "UUID do Arquiteto/EV (opcional)" },
          scope_type: { type: "string", enum: ["detalhado", "macro"], description: "Tipo de escopo, default detalhado" },
          hourly_rate: { type: "number", description: "Valor hora (R$), usa padrão se não informado" },
          gp_percentage: { type: "number", description: "% GP, usa padrão se não informado" },
          description: { type: "string", description: "Descrição/observação da oportunidade" },
          negotiation: { type: "string", description: "Observações de negociação" },
          expected_close_date: { type: "string", description: "Data prevista fechamento (YYYY-MM-DD)" },
          num_installments: { type: "number", description: "Número de parcelas de pagamento" },
          first_due_date: { type: "string", description: "Data do primeiro vencimento (YYYY-MM-DD)" },
          total_analyst_hours: { type: "number", description: "Total de horas analista para escopo macro" },
        },
        required: ["number", "client_id", "product", "type"],
      },
    },
  },
];

export async function executeTool(
  toolName: string,
  args: Record<string, any>,
  supabase: ReturnType<typeof createClient>,
  context: { userId?: string | null; salesMemberId?: string | null; userRole?: string | null }
): Promise<string> {
  // Permission checks - mirror web interface rules
  if (!context.userId) {
    return JSON.stringify({ error: "Usuário não identificado. Cadastre seu telefone no perfil do sistema para usar ações via WhatsApp." });
  }

  if (context.userRole === "consulta") {
    return JSON.stringify({ error: "Seu perfil (Consulta) não permite executar ações. Apenas consultas de oportunidades ganhas são permitidas." });
  }

  // Role-based restrictions per tool
  switch (toolName) {
    case "generate_proposal_number":
      return await generateProposalNumber(supabase);
    case "lookup_client":
      return await lookupClient(supabase, args.search, context);
    case "lookup_sales_member":
      return await lookupSalesMember(supabase, args.search, args.role);
    case "create_proposal":
      return await createProposal(supabase, args, context);
    default:
      return JSON.stringify({ error: `Ferramenta desconhecida: ${toolName}` });
  }
}

async function generateProposalNumber(supabase: ReturnType<typeof createClient>): Promise<string> {
  // Get all proposal numbers, find the max numeric suffix
  const { data: proposals, error } = await supabase
    .from("proposals")
    .select("number")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return JSON.stringify({ error: error.message });

  let maxNum = 0;
  for (const p of proposals || []) {
    // Extract numeric part from number like "502104", "OPP-2025-001", etc.
    const nums = p.number.replace(/\D/g, "");
    const parsed = parseInt(nums, 10);
    if (!isNaN(parsed) && parsed > maxNum) maxNum = parsed;
  }

  const nextNumber = (maxNum + 1).toString();
  return JSON.stringify({ number: nextNumber, message: `Próximo número disponível: ${nextNumber}` });
}

async function lookupClient(supabase: ReturnType<typeof createClient>, search: string): Promise<string> {
  const searchLower = search.toLowerCase();
  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, name, code, cnpj, unit_id, unit_info(name), esn_id, gsn_id, sales_team!clients_esn_id_fkey(name, code), gsn:sales_team!clients_gsn_id_fkey(name, code)")
    .or(`name.ilike.%${searchLower}%,code.ilike.%${searchLower}%,cnpj.ilike.%${searchLower}%`)
    .limit(5);

  if (error) return JSON.stringify({ error: error.message });
  if (!clients || clients.length === 0) return JSON.stringify({ error: "Nenhum cliente encontrado", search });

  const results = clients.map((c: any) => ({
    id: c.id,
    name: c.name,
    code: c.code,
    cnpj: c.cnpj,
    unit: c.unit_info?.name || "N/A",
    esn: c.sales_team?.name || null,
    esn_id: c.esn_id,
    gsn: c.gsn?.name || null,
    gsn_id: c.gsn_id,
  }));

  return JSON.stringify({ clients: results, count: results.length });
}

async function lookupSalesMember(supabase: ReturnType<typeof createClient>, search: string, role?: string): Promise<string> {
  let query = supabase
    .from("sales_team")
    .select("id, name, code, role, email, unit_id, unit_info(name)")
    .or(`name.ilike.%${search}%,code.ilike.%${search}%`)
    .limit(5);

  if (role) query = query.eq("role", role);

  const { data, error } = await query;
  if (error) return JSON.stringify({ error: error.message });
  if (!data || data.length === 0) return JSON.stringify({ error: "Nenhum membro encontrado", search });

  return JSON.stringify({
    members: data.map((m: any) => ({
      id: m.id,
      name: m.name,
      code: m.code,
      role: m.role,
      unit: m.unit_info?.name || "N/A",
    })),
  });
}

async function createProposal(
  supabase: ReturnType<typeof createClient>,
  args: Record<string, any>,
  context: { userId?: string | null; salesMemberId?: string | null }
): Promise<string> {
  // Load defaults
  const { data: defaults } = await supabase.from("proposal_defaults").select("*").limit(1).single();

  const hourlyRate = args.hourly_rate || defaults?.hourly_rate || 250;
  const gpPercentage = args.gp_percentage || defaults?.gp_percentage || 20;
  const accompAnalystPct = defaults?.accomp_analyst_percentage || 15;
  const accompGpPct = defaults?.accomp_gp_percentage || 10;

  // Get client info for GSN auto-link
  const { data: clientData } = await supabase
    .from("clients")
    .select("id, name, code, gsn_id, esn_id, unit_id")
    .eq("id", args.client_id)
    .single();

  if (!clientData) return JSON.stringify({ error: "Cliente não encontrado com o ID fornecido" });

  const esnId = args.esn_id || clientData.esn_id || null;
  const gsnId = clientData.gsn_id || null;

  // Determine created_by: use identified user or fall back to a system context
  // For WhatsApp, we need a valid user_id. Use the profiles table to find one.
  let createdBy = context.userId;
  if (!createdBy) {
    // Fallback: get first admin user
    const { data: adminRole } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")
      .limit(1)
      .single();
    createdBy = adminRole?.user_id || null;
  }

  if (!createdBy) {
    return JSON.stringify({ error: "Não foi possível identificar o usuário para criar a proposta. Informe ao administrador." });
  }

  const proposalId = crypto.randomUUID();

  const proposalData: Record<string, any> = {
    id: proposalId,
    number: args.number,
    type: args.type || "banco_de_horas",
    product: args.product,
    status: "pendente",
    scope_type: args.scope_type || "detalhado",
    client_id: args.client_id,
    esn_id: esnId,
    gsn_id: gsnId,
    arquiteto_id: args.arquiteto_id || null,
    hourly_rate: hourlyRate,
    gp_percentage: gpPercentage,
    accomp_analyst: accompAnalystPct,
    accomp_gp: accompGpPct,
    travel_local_hours: defaults?.travel_local_hours || 1,
    travel_trip_hours: defaults?.travel_trip_hours || 4,
    travel_hourly_rate: defaults?.travel_hourly_rate || 250,
    additional_analyst_rate: defaults?.additional_analyst_rate || 280,
    additional_gp_rate: defaults?.additional_gp_rate || 300,
    negotiation: args.negotiation || null,
    description: args.description || null,
    expected_close_date: args.expected_close_date || null,
    created_by: createdBy,
    num_companies: 1,
  };

  const { error: insertError } = await supabase.from("proposals").insert(proposalData);
  if (insertError) {
    console.error("Proposal insert error:", insertError);
    return JSON.stringify({ error: `Erro ao criar proposta: ${insertError.message}` });
  }

  // Create payment conditions if specified
  if (args.num_installments && args.num_installments > 0) {
    const totalHours = args.total_analyst_hours || 0;
    const gpHours = totalHours * gpPercentage / 100;
    const totalValue = (totalHours + gpHours) * hourlyRate;

    if (totalValue > 0) {
      const perInstallment = Math.round((totalValue / args.num_installments) * 100) / 100;
      const remainder = Math.round((totalValue - perInstallment * (args.num_installments - 1)) * 100) / 100;

      const firstDate = args.first_due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      const paymentRows = Array.from({ length: args.num_installments }, (_, i) => {
        const dueDate = new Date(`${firstDate}T00:00:00`);
        dueDate.setMonth(dueDate.getMonth() + i);
        return {
          proposal_id: proposalId,
          installment: i + 1,
          amount: i === args.num_installments - 1 ? remainder : perInstallment,
          due_date: dueDate.toISOString().split("T")[0],
        };
      });

      await supabase.from("payment_conditions").insert(paymentRows);
    }
  }

  // Create macro scope item if hours provided
  if (args.total_analyst_hours && args.total_analyst_hours > 0) {
    const gpHours = args.total_analyst_hours * gpPercentage / 100;
    await supabase.from("proposal_scope_items").insert({
      proposal_id: proposalId,
      description: args.description || `Escopo - ${args.product}`,
      hours: args.total_analyst_hours,
      included: true,
      phase: 1,
      sort_order: 0,
    });
  }

  // Build the real URL for the proposal
  const appUrl = `https://proposal-flow-21.lovable.app/proposals/${proposalId}`;

  // Calculate values for response
  const totalAnalystHours = args.total_analyst_hours || 0;
  const gpHours = totalAnalystHours * gpPercentage / 100;
  const totalHours = totalAnalystHours + gpHours;
  const netValue = totalHours * hourlyRate;

  // Get unit tax_factor
  let taxFactor = 1;
  if (clientData.unit_id) {
    const { data: unitData } = await supabase.from("unit_info").select("tax_factor, name").eq("id", clientData.unit_id).single();
    if (unitData) taxFactor = unitData.tax_factor || 1;
  }
  const grossValue = netValue * taxFactor;

  return JSON.stringify({
    success: true,
    proposal_id: proposalId,
    number: args.number,
    client: clientData.name,
    client_code: clientData.code,
    product: args.product,
    type: args.type,
    status: "pendente",
    hourly_rate: hourlyRate,
    gp_percentage: gpPercentage,
    total_analyst_hours: totalAnalystHours,
    gp_hours: gpHours,
    total_hours: totalHours,
    net_value: netValue,
    gross_value: grossValue,
    tax_factor: taxFactor,
    url: appUrl,
    message: `Proposta ${args.number} criada com sucesso para ${clientData.name}!`,
  });
}
