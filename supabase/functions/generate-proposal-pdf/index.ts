import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { proposalId } = await req.json();

    if (!proposalId) {
      return new Response(JSON.stringify({ error: "proposalId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch proposal with related data
    const { data: proposal, error: propError } = await supabase
      .from("proposals")
      .select(`
        *,
        clients(*),
        esn:sales_team!proposals_esn_id_fkey(*),
        gsn:sales_team!proposals_gsn_id_fkey(*),
        arquiteto:sales_team!proposals_arquiteto_id_fkey(*),
        proposal_scope_items(*),
        payment_conditions(*)
      `)
      .eq("id", proposalId)
      .single();

    if (propError || !proposal) {
      return new Response(JSON.stringify({ error: "Proposal not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch unit info
    const { data: unitInfo } = await supabase.from("unit_info").select("*").maybeSingle();

    // Calculate totals
    const scopeItems = proposal.proposal_scope_items || [];
    const includedItems = scopeItems.filter((i: any) => i.included);
    const totalHours = includedItems.reduce((s: number, i: any) => s + Number(i.hours), 0);
    const gpHours = Math.ceil(totalHours * (Number(proposal.gp_percentage) / 100));
    const totalValue = (totalHours + gpHours) * Number(proposal.hourly_rate);

    // Group scope items by template
    const templateIds = [...new Set(includedItems.map((i: any) => i.template_id).filter(Boolean))];
    let templateNames: Record<string, string> = {};
    if (templateIds.length > 0) {
      const { data: templates } = await supabase
        .from("scope_templates")
        .select("id, name")
        .in("id", templateIds);
      templateNames = (templates || []).reduce((acc: any, t: any) => ({ ...acc, [t.id]: t.name }), {});
    }

    // Generate HTML for PDF
    const html = generateProposalHTML({
      proposal,
      unitInfo,
      includedItems,
      totalHours,
      gpHours,
      totalValue,
      templateNames,
    });

    return new Response(JSON.stringify({ html, proposal: { number: proposal.number, totalValue, totalHours: totalHours + gpHours } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function generateProposalHTML(data: any) {
  const { proposal, unitInfo, includedItems, totalHours, gpHours, totalValue, templateNames } = data;
  const client = proposal.clients;
  const esn = proposal.esn;
  const gsn = proposal.gsn;
  const payments = proposal.payment_conditions || [];

  const typeLabel = proposal.type === "projeto" ? "Projeto" : "Banco de Horas";
  const date = new Date(proposal.created_at).toLocaleDateString("pt-BR");

  // Group items by template
  const groupedItems: Record<string, any[]> = {};
  for (const item of includedItems) {
    const templateName = item.template_id ? (templateNames[item.template_id] || "Outros") : "Outros";
    (groupedItems[templateName] = groupedItems[templateName] || []).push(item);
  }

  const scopeHTML = Object.entries(groupedItems).map(([name, items]) => `
    <h3 style="color:#1a1a2e;margin:16px 0 8px;">${name}</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f0f0f5;">
          <th style="padding:6px 10px;text-align:left;border:1px solid #ddd;">Item</th>
          <th style="padding:6px 10px;text-align:center;border:1px solid #ddd;width:80px;">Horas</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((i: any) => `
          <tr>
            <td style="padding:6px 10px;border:1px solid #ddd;">${i.description}</td>
            <td style="padding:6px 10px;text-align:center;border:1px solid #ddd;">${i.hours}h</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `).join("");

  const paymentsHTML = payments.length > 0 ? `
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;">
      <thead>
        <tr style="background:#f0f0f5;">
          <th style="padding:6px 10px;text-align:center;border:1px solid #ddd;">Parcela</th>
          <th style="padding:6px 10px;text-align:center;border:1px solid #ddd;">Vencimento</th>
          <th style="padding:6px 10px;text-align:right;border:1px solid #ddd;">Valor</th>
        </tr>
      </thead>
      <tbody>
        ${payments.map((p: any) => `
          <tr>
            <td style="padding:6px 10px;text-align:center;border:1px solid #ddd;">${p.installment}ª</td>
            <td style="padding:6px 10px;text-align:center;border:1px solid #ddd;">${p.due_date ? new Date(p.due_date).toLocaleDateString("pt-BR") : "—"}</td>
            <td style="padding:6px 10px;text-align:right;border:1px solid #ddd;">R$ ${Number(p.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  ` : "<p>Condições de pagamento a definir.</p>";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>Proposta ${proposal.number}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; max-width: 800px; margin: 0 auto; padding: 40px; }
  .header { border-bottom: 3px solid #1a1a2e; padding-bottom: 20px; margin-bottom: 30px; }
  .header h1 { color: #1a1a2e; margin: 0; font-size: 24px; }
  .header p { color: #666; margin: 4px 0 0; }
  .section { margin-bottom: 24px; }
  .section h2 { color: #1a1a2e; font-size: 16px; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 14px; }
  .info-grid .label { color: #666; }
  .info-grid .value { font-weight: 600; }
  .total-box { background: #f0f0f5; border-radius: 8px; padding: 16px; text-align: center; margin-top: 16px; }
  .total-box .amount { font-size: 28px; font-weight: 700; color: #1a1a2e; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
  <div class="header">
    <h1>PROPOSTA COMERCIAL</h1>
    <p>${proposal.number} · ${typeLabel} · ${proposal.product}</p>
    <p style="font-size:12px;color:#999;">Emitido em ${date} · ${unitInfo?.name || "TOTVS Leste"}</p>
  </div>

  <div class="section">
    <h2>Cliente</h2>
    <div class="info-grid">
      <div><span class="label">Razão Social:</span> <span class="value">${client?.name || "—"}</span></div>
      <div><span class="label">CNPJ:</span> <span class="value">${client?.cnpj || "—"}</span></div>
      <div><span class="label">Contato:</span> <span class="value">${client?.contact || "—"}</span></div>
      <div><span class="label">E-mail:</span> <span class="value">${client?.email || "—"}</span></div>
    </div>
  </div>

  <div class="section">
    <h2>Equipe Comercial</h2>
    <div class="info-grid">
      <div><span class="label">Executivo (ESN):</span> <span class="value">${esn?.name || "—"}</span></div>
      <div><span class="label">Gerente (GSN):</span> <span class="value">${gsn?.name || "—"}</span></div>
    </div>
  </div>

  <div class="section">
    <h2>Escopo do Projeto</h2>
    ${scopeHTML || "<p>Sem itens de escopo definidos.</p>"}
  </div>

  <div class="section">
    <h2>Resumo Financeiro</h2>
    <div class="info-grid">
      <div><span class="label">Horas Analista:</span> <span class="value">${totalHours}h</span></div>
      <div><span class="label">Horas GP (${proposal.gp_percentage}%):</span> <span class="value">${gpHours}h</span></div>
      <div><span class="label">Total de Horas:</span> <span class="value">${totalHours + gpHours}h</span></div>
      <div><span class="label">Valor Hora:</span> <span class="value">R$ ${Number(proposal.hourly_rate).toFixed(2)}</span></div>
    </div>
    <div class="total-box">
      <p style="margin:0;color:#666;font-size:12px;">VALOR TOTAL DA PROPOSTA</p>
      <p class="amount">R$ ${totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
    </div>
  </div>

  <div class="section">
    <h2>Condições de Pagamento</h2>
    ${paymentsHTML}
  </div>

  ${proposal.negotiation ? `<div class="section"><h2>Condições Especiais</h2><p>${proposal.negotiation}</p></div>` : ""}

  <div style="margin-top:40px;padding-top:20px;border-top:1px solid #ddd;font-size:12px;color:#999;text-align:center;">
    <p>${unitInfo?.name || "TOTVS Leste"} · ${unitInfo?.cnpj || ""} · ${unitInfo?.phone || ""}</p>
    <p>${unitInfo?.address || ""} · ${unitInfo?.city || ""}</p>
  </div>
</body>
</html>`;
}
