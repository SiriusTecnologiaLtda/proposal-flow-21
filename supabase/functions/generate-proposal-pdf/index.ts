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
        proposal_macro_scope(*),
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

    // Fetch unit info for the client
    let unitInfo = null;
    if (proposal.clients?.unit_id) {
      const { data } = await supabase.from("unit_info").select("*").eq("id", proposal.clients.unit_id).single();
      unitInfo = data;
    }
    if (!unitInfo) {
      const { data } = await supabase.from("unit_info").select("*").limit(1).maybeSingle();
      unitInfo = data;
    }

    // Fetch scope template names
    const scopeItems = proposal.proposal_scope_items || [];
    const includedItems = scopeItems.filter((i: any) => i.included);
    const parentItems = includedItems.filter((i: any) => !i.parent_id);
    const childItems = includedItems.filter((i: any) => i.parent_id);

    const templateIds = [...new Set(includedItems.map((i: any) => i.template_id).filter(Boolean))];
    let templateNames: Record<string, string> = {};
    if (templateIds.length > 0) {
      const { data: templates } = await supabase
        .from("scope_templates")
        .select("id, name")
        .in("id", templateIds);
      templateNames = (templates || []).reduce((acc: any, t: any) => ({ ...acc, [t.id]: t.name }), {});
    }

    // Calculate financials
    const totalAnalystHours = parentItems.reduce((s: number, i: any) => s + Number(i.hours), 0);
    const gpPercentage = Number(proposal.gp_percentage);
    const gpHours = Math.ceil(totalAnalystHours * (gpPercentage / 100));
    const hourlyRate = Number(proposal.hourly_rate);
    const totalHours = totalAnalystHours + gpHours;
    const totalValueNet = totalHours * hourlyRate;
    const taxFactor = unitInfo?.tax_factor || 0;
    const totalValueGross = totalValueNet * (1 + taxFactor / 100);
    const accompAnalyst = Number(proposal.accomp_analyst) || 0;
    const accompGP = Number(proposal.accomp_gp) || 0;
    const accompAnalystHours = Math.ceil(totalAnalystHours * (accompAnalyst / 100));
    const accompGPHours = Math.ceil(gpHours * (accompGP / 100));

    // Build macro scope list (template names of included items)
    const macroScopeNames = templateIds.map((id: string) => templateNames[id] || "Outros");
    // Add non-template groups
    const hasAvulsos = includedItems.some((i: any) => !i.template_id);

    // Build detailed scope grouped by template
    const detailedScope = buildDetailedScope(parentItems, childItems, templateNames);

    const isProjeto = proposal.type === "projeto";

    const html = isProjeto
      ? generateProjetoHTML({ proposal, unitInfo, macroScopeNames, detailedScope, totalAnalystHours, gpHours, totalHours, hourlyRate, totalValueNet, totalValueGross, taxFactor, accompAnalystHours, accompGPHours, templateNames, hasAvulsos })
      : generateBancoDeHorasHTML({ proposal, unitInfo, macroScopeNames, detailedScope, totalAnalystHours, gpHours, totalHours, hourlyRate, totalValueNet, totalValueGross, taxFactor, accompAnalystHours, accompGPHours, templateNames, hasAvulsos });

    return new Response(JSON.stringify({ html, proposal: { number: proposal.number, totalValue: totalValueNet, totalHours } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildDetailedScope(parentItems: any[], childItems: any[], templateNames: Record<string, string>) {
  // Group parents by template
  const groups: Record<string, { templateName: string; processes: { description: string; children: { description: string; hours: number }[] }[] }> = {};

  for (const parent of parentItems) {
    const tid = parent.template_id || "_avulso";
    const tname = parent.template_id ? (templateNames[parent.template_id] || "Outros") : "Itens Avulsos";
    if (!groups[tid]) groups[tid] = { templateName: tname, processes: [] };

    const children = childItems
      .filter((c: any) => c.parent_id === parent.id)
      .sort((a: any, b: any) => a.sort_order - b.sort_order);

    groups[tid].processes.push({
      description: parent.description,
      children: children.map((c: any) => ({ description: c.description, hours: Number(c.hours) })),
    });
  }

  return Object.values(groups);
}

function fmt(val: number) {
  return val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("pt-BR");
}

function baseStyles() {
  return `
    @page { size: A4; margin: 25mm 20mm; }
    body { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; color: #333; font-size: 12px; line-height: 1.6; margin: 0; padding: 0; }
    .page { page-break-before: always; padding: 40px; max-width: 800px; margin: 0 auto; }
    .page:first-child { page-break-before: auto; }
    h1 { color: #00a8e8; font-size: 22px; margin: 24px 0 12px; border-bottom: 2px solid #00a8e8; padding-bottom: 6px; }
    h2 { color: #00a8e8; font-size: 16px; margin: 20px 0 8px; }
    h3 { color: #333; font-size: 14px; margin: 16px 0 6px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 12px; }
    th { background: #00a8e8; color: white; padding: 8px 10px; text-align: left; font-weight: 600; }
    td { padding: 6px 10px; border: 1px solid #ddd; }
    tr:nth-child(even) td { background: #f9f9f9; }
    .info-table td { border: none; padding: 4px 10px; }
    .info-table td:first-child { color: #666; width: 200px; }
    .info-table td:last-child { font-weight: 600; }
    .total-box { background: #f0f8ff; border: 2px solid #00a8e8; border-radius: 8px; padding: 16px; text-align: center; margin: 16px 0; }
    .total-box .amount { font-size: 24px; font-weight: 700; color: #00a8e8; }
    .footer { font-size: 10px; color: #999; text-align: center; border-top: 1px solid #ddd; padding-top: 8px; margin-top: 30px; }
    .footer p { margin: 2px 0; }
    ul { padding-left: 20px; }
    ul li { margin-bottom: 4px; }
    .scope-table th { text-align: left; }
    .signature-table { margin-top: 40px; }
    .signature-table td { border: none; padding: 20px; vertical-align: top; width: 50%; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .page { padding: 0; } }
    @media screen { .page { border: 1px solid #eee; margin: 20px auto; box-shadow: 0 2px 8px rgba(0,0,0,0.1); } }
  `;
}

function footerHTML(unitInfo: any) {
  return `<div class="footer">
    <p>Este documento é propriedade da TOTVS. Todos os direitos reservados. ©</p>
    <p>${unitInfo?.name || "TOTVS Leste"} · ${unitInfo?.cnpj || ""} · ${unitInfo?.phone || ""}</p>
  </div>`;
}

function infoPage(data: any) {
  const { proposal, unitInfo } = data;
  const client = proposal.clients;
  const esn = proposal.esn;
  const gsn = proposal.gsn;
  const arq = proposal.arquiteto;
  const isProjeto = proposal.type === "projeto";
  const title = isProjeto ? "Proposta de Implantação" : "Proposta de Banco de Horas";

  return `<div class="page">
    <h1>${title}</h1>
    <h2>Informações Gerais</h2>
    <table class="info-table">
      <tr><td>Proposta número:</td><td>${proposal.number}</td></tr>
      <tr><td>Linha de Produto:</td><td>${proposal.product}</td></tr>
      <tr><td>Cliente:</td><td>${client?.code || ""} - ${client?.name || "—"}</td></tr>
      <tr><td>Data de Validade:</td><td>${fmtDate(proposal.date_validity)}</td></tr>
      <tr><td>Data de emissão:</td><td>${fmtDate(proposal.created_at)}</td></tr>
      <tr><td>Unidade TOTVS:</td><td>${unitInfo?.name || "—"}</td></tr>
    </table>
    <h2>Nossa Equipe</h2>
    <table class="info-table">
      <tr><td>Gerente de vendas:</td><td>${gsn?.code || ""} - ${gsn?.name || "—"}</td></tr>
      <tr><td>Executivo de vendas:</td><td>${esn?.code || ""} - ${esn?.name || "—"}</td></tr>
      <tr><td>Arquiteto de solução:</td><td>${arq?.code || ""} - ${arq?.name || "—"}</td></tr>
    </table>
    ${footerHTML(unitInfo)}
  </div>`;
}

function contractIntro(data: any) {
  const { proposal, unitInfo } = data;
  const client = proposal.clients;
  const isProjeto = proposal.type === "projeto";
  const title = isProjeto ? "Proposta Projeto Implantação" : "Proposta Banco de Horas";

  return `<div class="page">
    <h1>${title}</h1>
    <p>De um lado, <strong>EDUCO SERVIÇOS LTDA</strong> com sede na ${unitInfo?.address || "—"}, inscrita no CNPJ/MF sob o n° ${unitInfo?.cnpj || "—"}, Inscrição Estadual: Isento, neste ato representada de acordo com seu estatuto/contrato social, doravante denominada "TOTVS LESTE", e, de outro lado, CLIENTE <strong>${client?.name || "—"}</strong>, com sede na ${client?.address || "—"}, inscrito no CNPJ/MF sob n.° ${client?.cnpj || "—"}, Inscrição Estadual n.° ${client?.state_registration || "—"}, Telefone ${client?.phone || "—"}, Contato ${client?.contact || "—"}, email: ${client?.email || "—"}, neste ato representada de acordo com seu contrato social, doravante denominada "Cliente".</p>

    <h2>Introdução</h2>
    ${isProjeto
      ? `<p>A TOTVS oferece nesta proposta o serviço de implantação, conforme descrito no tópico "Escopo de Serviços" abaixo com o objetivo de tornar operacional a solução TOTVS descrita no tópico Escopo da Solução. Colocamo-nos à disposição para esclarecer qualquer dúvida decorrente a sua interpretação e para avaliar possíveis alterações que sejam essenciais ao seu negócio.</p>`
      : `<p>A TOTVS apresenta nesta proposta a prestação de serviços na modalidade de Banco de Horas (Time & Materials), com o objetivo de apoiar o Cliente em suas demandas sistêmicas e operacionais, conforme as diretrizes e necessidades definidas exclusivamente por ele. Colocamo-nos à disposição para esclarecer qualquer dúvida sobre este modelo de atendimento.</p>`
    }
    ${footerHTML(unitInfo)}
  </div>`;
}

function scopePage(data: any) {
  const { proposal, unitInfo, macroScopeNames } = data;
  const isProjeto = proposal.type === "projeto";

  let macroTable = `<table class="scope-table"><thead><tr><th>Macro Escopo</th></tr></thead><tbody>`;
  for (const name of macroScopeNames) {
    macroTable += `<tr><td>${name}</td></tr>`;
  }
  macroTable += `</tbody></table>`;

  const outOfScope = isProjeto ? `
    <h2>1.2 Itens Fora de Escopo</h2>
    <ul>
      <li>Modelagem, reengenharia ou revisão de processos de negócio (Business Process Reengineering).</li>
      <li>Saneamento, limpeza, correção, filtro ou otimização dos dados dos sistemas atuais (legados).</li>
      <li>Migração de dados de movimentação histórica (apenas saldos e cadastros previstos no escopo serão migrados).</li>
      <li>Apoio, capacitação ou instalação de sistema operacional, banco de dados, configuração de servidores, rede e infraestrutura.</li>
      <li>Manutenção, administração e atualizações do ambiente (tuning, dimensionamento), bem como rotinas de backup.</li>
      <li>Desenvolvimento de quaisquer interfaces, rotinas específicas ou customizações ao escopo contratado.</li>
      <li>Desenvolvimento de relatórios ou consultas customizadas.</li>
    </ul>` : "";

  return `<div class="page">
    <h1>1. Definições</h1>
    <p>A TOTVS tem o objetivo de tornar operacional o "Escopo da Solução" conforme está descrito na "Metodologia de Implantação". Estamos à disposição para esclarecer qualquer dúvida decorrente de sua interpretação e para avaliar possíveis alterações que sejam essenciais ao seu negócio.</p>
    <h2>1.1 Escopo da Solução</h2>
    ${macroTable}
    ${outOfScope}
    ${footerHTML(unitInfo)}
  </div>`;
}

function investmentPage(data: any) {
  const { proposal, unitInfo, totalAnalystHours, gpHours, totalHours, hourlyRate, totalValueNet, totalValueGross, taxFactor, accompAnalystHours, accompGPHours } = data;
  const isProjeto = proposal.type === "projeto";
  const payments = proposal.payment_conditions || [];
  const desc = proposal.description || (isProjeto ? "Projeto de Implantação" : "Banco de Horas");

  const paymentRows = payments.sort((a: any, b: any) => a.installment - b.installment).map((p: any) =>
    `<tr><td style="text-align:center">${p.installment}ª</td><td style="text-align:center">${fmtDate(p.due_date)}</td><td style="text-align:right">R$ ${fmt(Number(p.amount))}</td></tr>`
  ).join("");

  const accompSection = isProjeto ? `
    <h2>4.3. Operação Assistida (Acompanhamento após Go-Live)</h2>
    <p>O período de Operação Assistida (Hypercare) é estritamente limitado ao saldo de horas contratado e tem como objetivo o apoio direto aos usuários na transição para o ambiente produtivo real.</p>
    <table>
      <thead><tr><th>Serviço Contratado</th><th>Quantidade de Horas</th></tr></thead>
      <tbody>
        <tr><td>Analista de Implantação</td><td style="text-align:center">${accompAnalystHours}h</td></tr>
        <tr><td>Coordenador de Projeto</td><td style="text-align:center">${accompGPHours}h</td></tr>
      </tbody>
    </table>` : "";

  const additionalSection = `
    <h2>${isProjeto ? "4.4" : "4.3"}. Valor Hora Adicional</h2>
    <p>Caso sejam necessárias atividades adicionais não contempladas no escopo contratado, os seguintes valores serão aplicados:</p>
    <table>
      <thead><tr><th>Serviço Contratado</th><th>Valor Hora (Líquido)</th></tr></thead>
      <tbody>
        <tr><td>Analista de Implantação</td><td style="text-align:right">R$ ${fmt(Number(proposal.additional_analyst_rate))}</td></tr>
        <tr><td>Coordenador de Projeto</td><td style="text-align:right">R$ ${fmt(Number(proposal.additional_gp_rate))}</td></tr>
      </tbody>
    </table>`;

  const negotiationSection = proposal.negotiation ? `
    <h2>Negociação Específica</h2>
    <p>${proposal.negotiation}</p>` : "";

  return `<div class="page">
    <h1>4. Investimento</h1>
    <h2>${isProjeto ? "4.1. Projeto Contratado" : "4.1. Recursos Contratados"}</h2>
    <table>
      <thead><tr><th>Descrição</th>${!isProjeto ? '<th>Quantidade de Horas</th>' : ''}<th>Valor total (Líquido)</th></tr></thead>
      <tbody>
        ${isProjeto
          ? `<tr><td>${desc}</td><td style="text-align:right">R$ ${fmt(totalValueNet)}</td></tr>`
          : `<tr><td>Analista de Implantação</td><td style="text-align:center">${totalAnalystHours}h</td><td style="text-align:right">R$ ${fmt(totalAnalystHours * hourlyRate)}</td></tr>
             <tr><td>Coordenador de Projeto</td><td style="text-align:center">${gpHours}h</td><td style="text-align:right">R$ ${fmt(gpHours * hourlyRate)}</td></tr>`
        }
      </tbody>
      ${!isProjeto ? `<tfoot><tr><th>Total</th><th style="text-align:center">${totalHours}h</th><th style="text-align:right">R$ ${fmt(totalValueNet)}</th></tr></tfoot>` : ''}
    </table>

    <h2>4.2. Condições de Pagamento</h2>
    ${payments.length > 0 ? `
    <table>
      <thead><tr><th>Parcela</th><th>Vencimento</th><th>Valor (Líquido)</th></tr></thead>
      <tbody>${paymentRows}</tbody>
    </table>` : "<p>Condições de pagamento a definir.</p>"}

    ${accompSection}
    ${additionalSection}
    ${negotiationSection}
    ${footerHTML(unitInfo)}
  </div>`;
}

function expensesPage(data: any) {
  const { proposal, unitInfo } = data;
  const isProjeto = proposal.type === "projeto";

  return `<div class="page">
    <h1>${isProjeto ? "5" : "5"}. Despesas Acessórias</h1>
    <p>Fica estabelecido que, para a execução de serviços nas dependências do Cliente, este deverá arcar com as despesas e logísticas descritas a seguir:</p>
    <ul>
      <li><strong>ALIMENTAÇÃO:</strong> Será cobrado o valor diário de R$ 70,00 por profissional alocado, faturado posteriormente via Nota de Débito.</li>
      <li><strong>HOSPEDAGEM:</strong> A reserva e o custeio integral das despesas de hospedagem são de responsabilidade do Cliente. Acomodação individual em hotel de boa qualidade.</li>
      <li><strong>ESTACIONAMENTO:</strong> Quando houver necessidade, os custos ficarão sob responsabilidade do Cliente.</li>
      <li><strong>LOGÍSTICA E DESLOCAMENTO (TRASLADO):</strong>
        <ul>
          <li>Traslado Viagem: ${proposal.travel_trip_hours || 4} horas (ida e volta), da cidade de origem (${unitInfo?.city || "—"}) até o Cliente.</li>
          <li>Traslado Local: ${proposal.travel_local_hours || 1} horas (ida e volta), entre hotel/base e sede do Cliente.</li>
          <li>Valor-Hora de Traslado: R$ ${fmt(Number(proposal.travel_hourly_rate || 250))}</li>
        </ul>
      </li>
    </ul>
    ${footerHTML(unitInfo)}
  </div>`;
}

function legalPage(data: any) {
  const { proposal, unitInfo } = data;

  return `<div class="page">
    <h1>6. Condições Comerciais e Legais</h1>
    <p>Os valores descritos na proposta são líquidos e deverão ser acrescidos de todos os encargos fiscais e tributários incidentes, que serão arcados pelo Cliente.</p>
    <ul>
      <li><strong>Reequilíbrio Econômico:</strong> Caso os custos se elevem em razão de mudanças relevantes no mercado, as Partes concordam na revisão dos valores.</li>
      <li><strong>Atualização Monetária:</strong> Os preços serão reajustados anualmente pela variação positiva do IPCA/IBGE.</li>
      <li><strong>Pagamentos em Atraso:</strong> Atrasos implicarão multa de mora de 2%, juros de 1% ao mês e correção pelo IPCA/IBGE.</li>
    </ul>

    <h1>7. Termo de Aceite ao Contrato</h1>
    <p>Documentos aplicáveis e ciência prévia: O Cliente declara ter lido e estar de acordo com as disposições de todos os documentos que integrarão essa Proposta.</p>
    <p>Condições Específicas de Serviços: <a href="https://info.totvs.com/hubfs/AnexoContratoServicos.v2020.pdf">info.totvs.com/hubfs/AnexoContratoServicos.v2020.pdf</a></p>
    <p style="margin-top:16px;">${fmtDate(proposal.created_at)}</p>

    <h2>ASSINATURAS DOS REPRESENTANTES LEGAIS</h2>
    <table class="signature-table">
      <tr>
        <td>
          <strong>${proposal.clients?.name || "CLIENTE"}</strong><br/>
          Ass.:____________________________<br/>
          Nome:___________________________<br/>
          Cargo:___________________________<br/>
          RG:_____________________________
        </td>
        <td>
          <strong>EDUCO SERVIÇOS LTDA</strong><br/>
          Ass.:____________________________<br/>
          Nome:___________________________<br/>
          Cargo:___________________________<br/>
          RG:_____________________________
        </td>
      </tr>
    </table>
    ${footerHTML(unitInfo)}
  </div>`;
}

function summaryPage(data: any) {
  const { proposal, unitInfo, totalHours, totalValueNet } = data;
  const payments = proposal.payment_conditions || [];
  const firstPayment = payments.sort((a: any, b: any) => a.installment - b.installment)[0];

  return `<div class="page">
    <h1>FOLHA RESUMO</h1>
    <h2>EMPRESAS / FILIAIS</h2>
    <table class="info-table">
      <tr><td>Quantidade de empresas que fazem parte do escopo</td><td>${proposal.num_companies || 1}</td></tr>
    </table>

    <h2>DESPESAS DE ATENDIMENTO</h2>
    <table class="info-table">
      <tr><td>ALIMENTAÇÃO:</td><td>R$ 80,00</td></tr>
      <tr><td>HOSPEDAGEM:</td><td>Por conta do cliente</td></tr>
      <tr><td>ESTACIONAMENTO:</td><td>Por conta do cliente</td></tr>
      <tr><td>TRASLADO VIAGEM:</td><td>${proposal.travel_trip_hours || 4} HORAS</td></tr>
      <tr><td>VALOR HORA TRASLADO:</td><td>R$ ${fmt(Number(proposal.travel_hourly_rate || 250))}</td></tr>
    </table>

    <h2>VALORES</h2>
    <table class="info-table">
      <tr><td>CONDIÇÃO DE PAGAMENTO:</td><td>${payments.length} Parcelas</td></tr>
      <tr><td>PRIMEIRO VENCIMENTO:</td><td>${firstPayment ? fmtDate(firstPayment.due_date) : "—"}</td></tr>
      <tr><td>TOTAL SEM IMPOSTOS:</td><td>R$ ${fmt(totalValueNet)}</td></tr>
    </table>

    <h2>DE ACORDO DO CLIENTE</h2>
    <table class="signature-table">
      <tr>
        <td>Assinatura:____________________________</td>
        <td>Nome:_______________________________</td>
      </tr>
      <tr>
        <td>Cargo:______________________________</td>
        <td>RG:________________________________</td>
      </tr>
    </table>
    ${footerHTML(unitInfo)}
  </div>`;
}

function detailedScopeAnnex(data: any) {
  const { unitInfo, detailedScope } = data;

  let html = `<div class="page">
    <h1 style="color:#00a8e8;">Anexo - Escopo Detalhado</h1>`;

  for (const group of detailedScope) {
    html += `<h2>${group.templateName}</h2>`;
    html += `<table class="scope-table">
      <thead><tr><th>Processo</th><th style="width:60%">Resumo</th><th style="width:60px;text-align:center">Escopo</th></tr></thead>
      <tbody>`;

    for (const proc of group.processes) {
      // Parent row
      html += `<tr style="background:#f0f8ff;font-weight:600"><td>${proc.description}</td><td></td><td style="text-align:center">Sim</td></tr>`;
      // Children
      for (const child of proc.children) {
        html += `<tr><td style="padding-left:24px">${child.description}</td><td></td><td style="text-align:center">Sim</td></tr>`;
      }
    }

    html += `</tbody></table>`;
  }

  html += footerHTML(unitInfo);
  html += `</div>`;
  return html;
}

function metodologiaPage(unitInfo: any) {
  return `<div class="page">
    <h1>2. Metodologia e Governança do Projeto</h1>
    <h2>2.1 MIT - Metodologia de Implantação TOTVS</h2>
    <p>A metodologia de Projetos TOTVS compreende os grupos de tarefas relacionadas ao Gerenciamento do Projeto, organizadas por Fases, definindo assim um fluxo natural da condução do projeto de forma estruturada e padronizada.</p>
    <h3>Fase 1 - Preparação:</h3>
    <p>É o alinhamento mais aprofundado das necessidades e expectativas, com definição do time do projeto e partes interessadas, revisão e confirmação do escopo, dos prazos e da estratégia em geral.</p>
    <h3>Fase 2 - Refinamento:</h3>
    <p>É o desenho efetivo da solução a ser entregue, sendo revisto os requisitos sobre a análise dos processos "TO BE" e eliminação de gaps do escopo e/ou processo.</p>
    <h3>Fase 3 - Realização:</h3>
    <p>É a construção de fato sobre o desenho detalhado aprovado na fase anterior. A construção e testes são baseadas em Sprints com base no backlog.</p>
    <h3>Fase 4 - Operação:</h3>
    <p>É a execução das atividades para entrada em produção e o período de Acompanhamento ou Operação Assistida do sistema logo após o GO LIVE!</p>

    <h2>2.2 Aderência ao Padrão (Fit-to-Standard)</h2>
    <p>Todos os módulos, rotinas e processos listados no "Escopo da Solução" desta proposta serão atendidos e parametrizados de acordo com o funcionamento nativo e padrão (Standard) do sistema TOTVS.</p>
    ${footerHTML(unitInfo)}
  </div>`;
}

function premissasPage(unitInfo: any) {
  return `<div class="page">
    <h1>3. Premissas e Regras Operacionais</h1>
    <h2>3.1 Responsabilidades do Cliente</h2>
    <ul>
      <li><strong>Saneamento e Carga de Dados:</strong> Todo o trabalho de saneamento, de-para e validação de dados dos sistemas legados é de exclusiva responsabilidade do Cliente.</li>
      <li><strong>Disponibilidade da Equipe:</strong> O Cliente compromete-se a disponibilizar Usuários-Chave com autonomia para tomada de decisão e validação de processos.</li>
      <li><strong>Infraestrutura:</strong> O Cliente deverá garantir a infraestrutura e acessos sistêmicos necessários.</li>
    </ul>
    <h2>3.2 Regras Operacionais</h2>
    <ul>
      <li><strong>Horário de Atendimento:</strong> De segunda a sexta-feira, das 09h00 às 18h00. Fora deste horário: acréscimo de 50%. Sábados/domingos/feriados: acréscimo de 100%.</li>
      <li><strong>Cancelamento/Remanejamento de Agenda:</strong> Notificação mínima de 48 horas úteis.</li>
      <li><strong>Aprovação de Horas (OS-e):</strong> O Cliente terá prazo de 48 horas para aprovar ou contestar. Após este prazo: aceite tácito.</li>
    </ul>
    ${footerHTML(unitInfo)}
  </div>`;
}

function bancoDeHorasNaturezaPage(data: any) {
  const { unitInfo, macroScopeNames } = data;
  let macroTable = `<table class="scope-table"><thead><tr><th>CONSIDERAÇÕES / PROCESSOS</th></tr></thead><tbody>`;
  for (const name of macroScopeNames) {
    macroTable += `<tr><td>${name}</td></tr>`;
  }
  macroTable += `</tbody></table>`;

  return `<div class="page">
    <h1>1. Natureza dos Serviços e Direcionamento de Escopo</h1>
    <h2>1.1. Modelo de Contratação (Banco de Horas)</h2>
    <p>Esta proposta tem por objetivo disponibilizar ao Cliente um Banco de Horas de profissionais especializados, a serem consumidas sob demanda. Por se tratar de uma modalidade por tempo incorrido (Time & Materials), o compromisso contratual refere-se à disponibilidade e alocação do esforço técnico (horas), e não à entrega de um escopo fechado.</p>
    <h2>1.2. Expectativa de Atuação (Estimativa)</h2>
    <p>O volume de horas provisionado nesta proposta foi dimensionado como uma estimativa inicial para apoiar as seguintes frentes macro de trabalho:</p>
    ${macroTable}
    ${footerHTML(unitInfo)}
  </div>`;
}

function bancoRegrasPage(unitInfo: any) {
  return `<div class="page">
    <h1>2. Papéis e Responsabilidades</h1>
    <h2>2.1. Responsabilidades do Cliente</h2>
    <p>O Cliente atua como o gestor direto das atividades. É de exclusiva responsabilidade do Cliente a definição, priorização, planejamento, validação de entregas e gestão das atividades.</p>
    <h2>2.2. Responsabilidades da Equipe TOTVS LESTE</h2>
    <ul>
      <li><strong>Analista de Implantação / Consultor:</strong> Profissional técnico responsável pela execução sistêmica das atividades solicitadas pelo Cliente.</li>
      <li><strong>Analista de Alocação e Recursos:</strong> Facilitador operacional (Backoffice).</li>
      <li><strong>Isenção de Gestão (PMO):</strong> A TOTVS LESTE não assume o papel de Gerenciamento de Projetos neste contrato.</li>
    </ul>
    <h1>3. Regras Operacionais e Acompanhamento</h1>
    <h2>3.1. Agendamento e Execução</h2>
    <ul>
      <li>Solicitação de agendas: antecedência mínima de 48 horas úteis.</li>
      <li>Cancelamentos fora do prazo: faturamento integral das horas reservadas.</li>
      <li>Horário de atendimento: dias úteis, 09h00 às 18h00. Fora do horário: acréscimo de 50%. Fins de semana/feriados: 100%.</li>
    </ul>
    <h2>3.2. Aprovação de Horas (OS-e)</h2>
    <p>O Cliente terá prazo máximo de 48 horas para aprovar ou contestar a OS-e. Decorrido o prazo: aceite tácito.</p>
    ${footerHTML(unitInfo)}
  </div>`;
}

function generateProjetoHTML(data: any) {
  const { proposal } = data;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Proposta ${proposal.number}</title><style>${baseStyles()}</style></head><body>
    ${infoPage(data)}
    ${contractIntro(data)}
    ${scopePage(data)}
    ${metodologiaPage(data.unitInfo)}
    ${premissasPage(data.unitInfo)}
    ${investmentPage(data)}
    ${expensesPage(data)}
    ${legalPage(data)}
    ${summaryPage(data)}
    ${detailedScopeAnnex(data)}
  </body></html>`;
}

function generateBancoDeHorasHTML(data: any) {
  const { proposal } = data;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Proposta ${proposal.number}</title><style>${baseStyles()}</style></head><body>
    ${infoPage(data)}
    ${contractIntro(data)}
    ${bancoDeHorasNaturezaPage(data)}
    ${bancoRegrasPage(data.unitInfo)}
    ${investmentPage(data)}
    ${expensesPage(data)}
    ${legalPage(data)}
  </body></html>`;
}
