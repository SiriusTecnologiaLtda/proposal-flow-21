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
  {
    type: "function",
    function: {
      name: "generate_proposal_document",
      description: "Gera o documento da proposta (Google Docs) no sistema. Retorna o link do documento gerado. A proposta precisa ter escopo preenchido.",
      parameters: {
        type: "object",
        properties: {
          proposal_id: { type: "string", description: "UUID da proposta (obtido via lookup ou contexto)" },
        },
        required: ["proposal_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_scope_templates",
      description: "Lista os templates de escopo disponíveis no sistema, filtrados por produto. Retorna id, nome, produto, categoria e quantidade de itens.",
      parameters: {
        type: "object",
        properties: {
          product: { type: "string", description: "Filtrar por produto (ex: RM, SAP Business One, Protheus). Opcional." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_scope_template",
      description: "Aplica um template de escopo a uma proposta, copiando todos os itens do template para o escopo da proposta. A proposta não pode ter projeto vinculado.",
      parameters: {
        type: "object",
        properties: {
          proposal_id: { type: "string", description: "UUID da proposta" },
          template_id: { type: "string", description: "UUID do template de escopo (obtido via list_scope_templates)" },
        },
        required: ["proposal_id", "template_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_sales_summary",
      description: "Consulta agregada de vendas/oportunidades com filtros de status, período (mês/ano), produto, ESN, unidade. Retorna totais, contagem e lista detalhada. USE SEMPRE esta ferramenta quando o usuário perguntar sobre totais de vendas, faturamento, resultado comercial ou quiser filtrar oportunidades por critérios específicos.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pendente", "proposta_gerada", "em_analise_ev", "analise_ev_concluida", "em_assinatura", "ganha", "cancelada"], description: "Filtrar por status da oportunidade" },
          month: { type: "number", description: "Mês (1-12) para filtrar por previsão de fechamento" },
          year: { type: "number", description: "Ano (ex: 2026) para filtrar por previsão de fechamento" },
          product: { type: "string", description: "Filtrar por produto (ex: RM, SAP Business One)" },
          esn_name: { type: "string", description: "Filtrar por nome do ESN (parcial)" },
          unit_name: { type: "string", description: "Filtrar por nome da unidade (parcial)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_proposal",
      description: "Busca uma proposta pelo número ou nome do cliente. Retorna id, número, status, cliente, produto e link.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Número da proposta ou nome do cliente (parcial)" },
        },
        required: ["search"],
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
    case "generate_proposal_document":
      return await generateProposalDocument(supabase, args.proposal_id, context);
    case "list_scope_templates":
      return await listScopeTemplates(supabase, args.product);
    case "apply_scope_template":
      return await applyScopeTemplate(supabase, args.proposal_id, args.template_id, context);
    case "lookup_proposal":
      return await lookupProposal(supabase, args.search, context);
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

async function lookupClient(supabase: ReturnType<typeof createClient>, search: string, context?: { userId?: string | null; salesMemberId?: string | null; userRole?: string | null }): Promise<string> {
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

// ─── Generate Proposal Document ─────────────────────────────────────

async function generateProposalDocument(
  supabase: ReturnType<typeof createClient>,
  proposalId: string,
  context: { userId?: string | null }
): Promise<string> {
  const { data: proposal, error } = await supabase
    .from("proposals")
    .select("id, number, status, client_id, clients(name)")
    .eq("id", proposalId)
    .single();

  if (error || !proposal) return JSON.stringify({ error: "Proposta não encontrada com o ID fornecido" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/generate-proposal-pdf`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ proposalId, userId: context.userId, docType: "proposta" }),
    });

    const result = await resp.json();
    if (!resp.ok || result.logs?.some((l: any) => l.status === "error")) {
      const errorMsg = result.logs?.filter((l: any) => l.status === "error").map((l: any) => l.message).join("; ") || "Erro desconhecido";
      return JSON.stringify({ error: `Erro ao gerar documento: ${errorMsg}` });
    }

    const docUrl = result.doc_url || result.docUrl;
    return JSON.stringify({
      success: true,
      proposal_number: proposal.number,
      client: (proposal as any).clients?.name,
      doc_url: docUrl || null,
      message: docUrl
        ? `Documento da proposta ${proposal.number} gerado com sucesso!`
        : `Documento da proposta ${proposal.number} gerado. Acesse a proposta para visualizar.`,
      proposal_url: `https://proposal-flow-21.lovable.app/proposals/${proposalId}`,
    });
  } catch (e: any) {
    return JSON.stringify({ error: `Falha ao gerar documento: ${e.message}` });
  }
}

// ─── List Scope Templates ───────────────────────────────────────────

async function listScopeTemplates(
  supabase: ReturnType<typeof createClient>,
  product?: string
): Promise<string> {
  let query = supabase
    .from("scope_templates")
    .select("id, name, product, category, status, scope_template_items(id)")
    .eq("status", "aprovado")
    .order("name");

  if (product) query = query.ilike("product", `%${product}%`);

  const { data, error } = await query;
  if (error) return JSON.stringify({ error: error.message });
  if (!data || data.length === 0) return JSON.stringify({ error: "Nenhum template aprovado encontrado", product });

  return JSON.stringify({
    templates: data.map((t: any) => ({
      id: t.id,
      name: t.name,
      product: t.product,
      category: t.category,
      item_count: (t.scope_template_items || []).length,
    })),
    count: data.length,
  });
}

// ─── Apply Scope Template ───────────────────────────────────────────

async function applyScopeTemplate(
  supabase: ReturnType<typeof createClient>,
  proposalId: string,
  templateId: string,
  context: { userId?: string | null }
): Promise<string> {
  const { data: proposal, error: pErr } = await supabase
    .from("proposals")
    .select("id, number, status, client_id, group_notes, clients(name)")
    .eq("id", proposalId)
    .single();

  if (pErr || !proposal) return JSON.stringify({ error: "Proposta não encontrada" });

  // Check if proposal has linked project (scope is locked)
  const { data: linkedProjects } = await supabase
    .from("projects")
    .select("id")
    .eq("proposal_id", proposalId)
    .limit(1);

  if (linkedProjects && linkedProjects.length > 0) {
    return JSON.stringify({ error: "Esta proposta possui um projeto vinculado. O escopo está bloqueado para edição." });
  }

  const { data: template, error: tErr } = await supabase
    .from("scope_templates")
    .select("id, name, product, scope_template_items(id, description, default_hours, sort_order, parent_id)")
    .eq("id", templateId)
    .single();

  if (tErr || !template) return JSON.stringify({ error: "Template não encontrado" });

  const allItems = (template as any).scope_template_items || [];
  if (allItems.length === 0) return JSON.stringify({ error: "Template sem itens" });

  const parents = allItems.filter((i: any) => !i.parent_id).sort((a: any, b: any) => a.sort_order - b.sort_order);
  const childrenMap = new Map<string, any[]>();
  allItems.filter((i: any) => i.parent_id).forEach((i: any) => {
    if (!childrenMap.has(i.parent_id)) childrenMap.set(i.parent_id, []);
    childrenMap.get(i.parent_id)!.push(i);
  });

  const { data: existingItems } = await supabase
    .from("proposal_scope_items")
    .select("sort_order")
    .eq("proposal_id", proposalId)
    .order("sort_order", { ascending: false })
    .limit(1);

  let sortOrder = (existingItems?.[0]?.sort_order || 0) + 1;
  let insertedCount = 0;

  for (const parent of parents) {
    const { data: parentRow, error: parentErr } = await supabase
      .from("proposal_scope_items")
      .insert({
        proposal_id: proposalId,
        description: parent.description,
        hours: parent.default_hours || 0,
        included: true,
        phase: 1,
        sort_order: sortOrder++,
        template_id: templateId,
      })
      .select("id")
      .single();

    if (parentErr) { console.error("Parent insert error:", parentErr); continue; }
    insertedCount++;

    const kids = (childrenMap.get(parent.id) || []).sort((a: any, b: any) => a.sort_order - b.sort_order);
    for (const kid of kids) {
      const { error: kidErr } = await supabase
        .from("proposal_scope_items")
        .insert({
          proposal_id: proposalId,
          description: kid.description,
          hours: kid.default_hours || 0,
          included: true,
          phase: 1,
          sort_order: sortOrder++,
          parent_id: parentRow.id,
          template_id: templateId,
        });
      if (!kidErr) insertedCount++;
    }
  }

  // Update group_notes
  const groupNotes = (proposal.group_notes as any) || {};
  const groupOrder = groupNotes._group_order || [];
  if (!groupOrder.includes(templateId)) {
    groupNotes._group_order = [...groupOrder, templateId];
    await supabase.from("proposals").update({ group_notes: groupNotes }).eq("id", proposalId);
  }

  return JSON.stringify({
    success: true,
    proposal_number: proposal.number,
    template_name: (template as any).name,
    items_added: insertedCount,
    message: `Template "${(template as any).name}" aplicado à proposta ${proposal.number} com ${insertedCount} itens.`,
    proposal_url: `https://proposal-flow-21.lovable.app/proposals/${proposalId}`,
  });
}

// ─── Lookup Proposal ────────────────────────────────────────────────

async function lookupProposal(
  supabase: ReturnType<typeof createClient>,
  search: string,
  context: { userId?: string | null; salesMemberId?: string | null; userRole?: string | null }
): Promise<string> {
  const { data: proposals, error } = await supabase
    .from("proposals")
    .select("id, number, status, product, type, client_id, clients(name, code)")
    .or(`number.ilike.%${search}%`)
    .order("created_at", { ascending: false })
    .limit(10);

  const { data: byClient } = await supabase
    .from("proposals")
    .select("id, number, status, product, type, client_id, clients(name, code)")
    .filter("clients.name", "ilike", `%${search}%`)
    .order("created_at", { ascending: false })
    .limit(10);

  const allResults = [...(proposals || [])];
  for (const p of (byClient || [])) {
    if (!allResults.find((r: any) => r.id === p.id)) allResults.push(p);
  }

  if (allResults.length === 0) return JSON.stringify({ error: "Nenhuma proposta encontrada", search });

  return JSON.stringify({
    proposals: allResults.slice(0, 10).map((p: any) => ({
      id: p.id,
      number: p.number,
      status: p.status,
      product: p.product,
      type: p.type,
      client: p.clients?.name || "N/A",
      client_code: p.clients?.code || "N/A",
      url: `https://proposal-flow-21.lovable.app/proposals/${p.id}`,
    })),
    count: allResults.length,
  });
}
