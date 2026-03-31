import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, userRole, allowedResources } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    let contextData = "";

    if (authHeader) {
      const supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: authHeader } },
      });

      try {
        if (allowedResources?.includes("propostas") || userRole === "admin") {
          // Fetch detailed proposals with client names for rich context
          const { data: proposals, count } = await supabase
            .from("proposals")
            .select(`
              id, number, status, product, type, hourly_rate, 
              num_companies, created_at, updated_at, expected_close_date,
              description, negotiation,
              clients!proposals_client_id_fkey ( name, cnpj, code ),
              esn:sales_team!proposals_esn_id_fkey ( name, code ),
              gsn:sales_team!proposals_gsn_id_fkey ( name )
            `, { count: "exact" })
            .order("created_at", { ascending: false })
            .limit(100);

          contextData += `\n\nTotal de oportunidades acessíveis: ${count || 0}.`;

          if (proposals?.length) {
            const statusCounts: Record<string, number> = {};
            proposals.forEach((p: any) => {
              statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
            });
            contextData += `\nDistribuição por status: ${Object.entries(statusCounts).map(([s, c]) => `${s}: ${c}`).join(", ")}.`;

            // Provide detailed list of recent proposals
            contextData += `\n\nLista das oportunidades (mais recentes primeiro):`;
            for (const p of proposals) {
              const clientName = (p as any).clients?.name || "Cliente não informado";
              const esnName = (p as any).esn?.name || "";
              const line = `\n- Nº ${p.number} | Status: ${p.status} | Produto: ${p.product} | Cliente: ${clientName}` +
                (esnName ? ` | ESN: ${esnName}` : "") +
                (p.expected_close_date ? ` | Previsão: ${p.expected_close_date}` : "") +
                ` | Criada em: ${p.created_at?.substring(0, 10)}`;
              contextData += line;
            }

            // Also fetch service items totals for won proposals
            const wonProposals = proposals.filter((p: any) => p.status === "ganha");
            if (wonProposals.length) {
              const wonIds = wonProposals.map((p: any) => p.id);
              const { data: serviceItems } = await supabase
                .from("proposal_service_items")
                .select("proposal_id, calculated_hours, hourly_rate")
                .in("proposal_id", wonIds.slice(0, 20));

              if (serviceItems?.length) {
                const totalsByProposal: Record<string, number> = {};
                serviceItems.forEach((si: any) => {
                  const val = Number(si.calculated_hours) * Number(si.hourly_rate);
                  totalsByProposal[si.proposal_id] = (totalsByProposal[si.proposal_id] || 0) + val;
                });
                contextData += `\n\nValores das oportunidades ganhas:`;
                for (const wp of wonProposals.slice(0, 20)) {
                  const total = totalsByProposal[(wp as any).id];
                  if (total !== undefined) {
                    contextData += `\n- Nº ${(wp as any).number}: R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
                  }
                }
              }
            }
          }
        }

        if (allowedResources?.includes("projetos") || userRole === "admin") {
          const { data: projects, count } = await supabase
            .from("projects")
            .select(`
              id, status, product, proposal_number, created_at,
              clients!projects_client_id_fkey ( name )
            `, { count: "exact" })
            .order("created_at", { ascending: false })
            .limit(30);
          contextData += `\n\nTotal de projetos: ${count || 0}.`;
          if (projects?.length) {
            contextData += `\nProjetos recentes:`;
            for (const pj of projects) {
              contextData += `\n- Proposta ${(pj as any).proposal_number || "?"} | Status: ${pj.status} | Cliente: ${(pj as any).clients?.name || "?"} | Produto: ${pj.product}`;
            }
          }
        }

        if (allowedResources?.includes("cadastros/clientes") || userRole === "admin") {
          const { count } = await supabase
            .from("clients")
            .select("id", { count: "exact", head: true });
          contextData += `\n\n${count || 0} clientes cadastrados no sistema.`;
        }

        if (allowedResources?.includes("cadastros/time") || userRole === "admin") {
          const { data: team } = await supabase
            .from("sales_team")
            .select("name, code, role, email")
            .order("name")
            .limit(50);
          if (team?.length) {
            contextData += `\n\nTime de vendas:`;
            for (const t of team) {
              contextData += `\n- ${t.name} (${t.code}) - ${t.role}${t.email ? ` - ${t.email}` : ""}`;
            }
          }
        }
      } catch (e) {
        console.error("Context fetch error:", e);
      }
    }

    const systemPrompt = `Você é a xAI, a assistente digital inteligente do sistema TOTVS Leste. Seu perfil é descontraído, amigável e prestativo.

IDIOMA E INTERPRETAÇÃO:
- Você DEVE interpretar português brasileiro coloquial, informal e com erros de digitação.
- Corrija mentalmente erros ortográficos: "proposta ganha" = status "ganha", "ganver" não existe.
- "ultima" = "última", "oportundiade" = "oportunidade", "recem" = "recém", etc.
- Abreviações comuns: "op" = oportunidade, "prop" = proposta/oportunidade, "ult" = última.
- O sistema usa "oportunidade" e "proposta" como sinônimos — ambos se referem à mesma entidade.
- Status possíveis das oportunidades: "pendente", "ganha", "perdida", "cancelada", "em_negociacao".
- Quando o usuário perguntar sobre "proposta ganha" ou "oportunidade ganha", busque nos dados pelo status "ganha".
- Responda SEMPRE em português brasileiro claro e correto.

PERSONALIDADE:
- Fale de forma amigável e descontraída, mas profissional
- Use emojis com moderação para tornar a conversa agradável 🎯
- Seja proativa em oferecer ajuda adicional
- Quando fornecer dados, formate de forma clara e legível

SOBRE O SISTEMA:
O sistema é uma plataforma de gestão comercial da TOTVS Leste que inclui:
- Oportunidades (propostas comerciais) com fluxo: Dados Gerais → Escopo → Financeiro → Revisão
- Projetos de implantação vinculados a oportunidades ganhas
- Cadastros de Clientes, Unidades, Time de Vendas (ESN/GSN), Produtos, Categorias
- Templates de Escopo para padronizar escopos de projetos
- Tipos de Oportunidade com Itens de Serviço configuráveis
- Dashboard com métricas de vendas e pipeline
- Geração de documentos (propostas e MIT) via Google Docs
- Assinatura digital via TAE
- Integração WhatsApp para consultas

PAPÉIS DO SISTEMA:
- Admin: acesso total
- Vendedor (ESN): gerencia suas oportunidades e clientes
- GSN: supervisiona vendedores vinculados
- Eng. Valor (Arquiteto): apoio técnico em propostas
- Consulta: apenas visualização de oportunidades

PERMISSÕES DO USUÁRIO ATUAL:
- Papel: ${userRole || "não identificado"}
- Recursos permitidos: ${allowedResources?.join(", ") || "básicos"}

DADOS REAIS DO SISTEMA (use estes dados para responder consultas):
${contextData || "\nNenhum dado disponível no momento."}

REGRAS IMPORTANTES:
- Use os DADOS REAIS acima para responder perguntas sobre oportunidades, projetos, clientes, etc.
- Quando o usuário perguntar "qual a última proposta ganha", filtre da lista acima pelo status "ganha" e retorne a mais recente.
- Quando perguntar "quantas propostas tenho", use a contagem real dos dados.
- NÃO invente dados que não estejam no contexto acima.
- Se não encontrar o dado solicitado nos dados fornecidos, diga claramente que não há registros correspondentes.
- Se o usuário perguntar algo fora do escopo do sistema, redirecione educadamente.
- Formate valores monetários como R$ X.XXX,XX.
- Formate datas como DD/MM/AAAA.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Muitas requisições. Aguarde alguns segundos e tente novamente. 😅" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA insuficientes." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "Erro no serviço de IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("xai-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
