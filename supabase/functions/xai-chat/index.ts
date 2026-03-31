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

    // Get auth token to query DB on behalf of user
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    let contextData = "";

    if (authHeader) {
      const supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: authHeader } },
      });

      // Fetch summary data based on user permissions
      try {
        if (allowedResources?.includes("propostas") || userRole === "admin") {
          const { data: proposals, count } = await supabase
            .from("proposals")
            .select("id, number, status, product, created_at", { count: "exact" })
            .order("created_at", { ascending: false })
            .limit(50);
          contextData += `\n\nO usuário tem acesso a ${count || 0} oportunidades no sistema.`;
          if (proposals?.length) {
            const statusCounts: Record<string, number> = {};
            proposals.forEach((p: any) => {
              statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
            });
            contextData += ` Distribuição por status: ${Object.entries(statusCounts).map(([s, c]) => `${s}: ${c}`).join(", ")}.`;
          }
        }

        if (allowedResources?.includes("projetos") || userRole === "admin") {
          const { count } = await supabase
            .from("projects")
            .select("id", { count: "exact", head: true });
          contextData += `\n${count || 0} projetos de implantação no sistema.`;
        }

        if (allowedResources?.includes("cadastros/clientes") || userRole === "admin") {
          const { count } = await supabase
            .from("clients")
            .select("id", { count: "exact", head: true });
          contextData += `\n${count || 0} clientes cadastrados.`;
        }
      } catch (e) {
        console.error("Context fetch error:", e);
      }
    }

    const systemPrompt = `Você é a xAI, a assistente digital inteligente do sistema TOTVS Leste. Seu perfil é descontraído, amigável e prestativo.

PERSONALIDADE:
- Fale de forma amigável e descontraída, mas profissional
- Use emojis com moderação para tornar a conversa agradável
- Seja proativa em oferecer ajuda adicional
- Responda sempre em português brasileiro

SOBRE O SISTEMA:
O sistema é uma plataforma de gestão comercial da TOTVS Leste que inclui:
- Oportunidades (propostas comerciais) com fluxo de criação em etapas: Dados Gerais → Escopo → Financeiro → Revisão
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

DADOS DO CONTEXTO ATUAL:${contextData || "\nNenhum dado contextual disponível."}

REGRAS:
- Responda APENAS sobre funcionalidades do sistema e dados que o usuário tem permissão de acessar
- NÃO invente dados, se não souber diga que pode verificar
- Se o usuário perguntar algo fora do escopo do sistema, redirecione educadamente
- Para consultas específicas de dados (valores, detalhes de oportunidades), informe os dados disponíveis no contexto
- Se precisar de mais detalhes, sugira onde o usuário pode encontrar no sistema`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
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
