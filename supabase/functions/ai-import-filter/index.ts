import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AVAILABLE_FIELDS = [
  { key: "code", label: "Código do Cliente" },
  { key: "name", label: "Nome / Razão Social" },
  { key: "cnpj", label: "CNPJ" },
  { key: "store_code", label: "Loja" },
  { key: "state_registration", label: "Inscrição Estadual" },
  { key: "contact", label: "Contato" },
  { key: "email", label: "E-mail" },
  { key: "phone", label: "Telefone" },
  { key: "address", label: "Endereço" },
  { key: "unit_code", label: "Unidade (código/nome)" },
  { key: "esn_code", label: "ESN (código/nome)" },
  { key: "gsn_code", label: "GSN (código/nome)" },
];

const AVAILABLE_OPERATORS = [
  { key: "equals", label: "igual a", description: "Valor exato" },
  { key: "not_equals", label: "diferente de", description: "Não é igual" },
  { key: "contains", label: "contém", description: "Contém o texto" },
  { key: "not_contains", label: "não contém", description: "Não contém o texto" },
  { key: "starts_with", label: "começa com", description: "Inicia com" },
  { key: "ends_with", label: "termina com", description: "Termina com" },
  { key: "is_empty", label: "está vazio", description: "Campo vazio ou nulo" },
  { key: "is_not_empty", label: "não está vazio", description: "Campo preenchido" },
  { key: "exists_in_system", label: "existe no cadastro", description: "Valor existe na tabela de referência (Unidade, ESN, GSN)" },
  { key: "not_exists_in_system", label: "não existe no cadastro", description: "Valor não encontrado na tabela de referência" },
  { key: "greater_than", label: "maior que", description: "Valor numérico maior" },
  { key: "less_than", label: "menor que", description: "Valor numérico menor" },
  { key: "regex", label: "regex", description: "Expressão regular" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, existingRules } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return new Response(
        JSON.stringify({ error: "Prompt é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `Você é um assistente que converte instruções em linguagem natural em regras de filtro estruturadas para importação de dados de clientes.

Campos disponíveis na planilha:
${AVAILABLE_FIELDS.map(f => `- ${f.key}: ${f.label}`).join("\n")}

Operadores disponíveis:
${AVAILABLE_OPERATORS.map(o => `- ${o.key}: ${o.label} (${o.description})`).join("\n")}

IMPORTANTE:
- Para campos como unit_code, esn_code, gsn_code: use "exists_in_system" para verificar se existe no cadastro do sistema.
- O operador "exists_in_system" só funciona para unit_code, esn_code e gsn_code.
- Retorne as regras como um array JSON.
- Cada regra deve ter: field, operator, value (opcional), description (texto legível da regra).
- Se o usuário pedir para remover ou alterar regras existentes, retorne o array atualizado.
- Gere APENAS o JSON, sem explicações.

${existingRules?.length > 0 ? `\nRegras existentes:\n${JSON.stringify(existingRules, null, 2)}` : ""}`;

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
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "set_filter_rules",
              description: "Define as regras de filtro para importação de clientes",
              parameters: {
                type: "object",
                properties: {
                  rules: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        field: { type: "string", description: "Campo da planilha" },
                        operator: { type: "string", description: "Operador de comparação" },
                        value: { type: "string", description: "Valor para comparação (opcional para is_empty/is_not_empty/exists_in_system)" },
                        description: { type: "string", description: "Descrição legível da regra em português" },
                      },
                      required: ["field", "operator", "description"],
                    },
                  },
                },
                required: ["rules"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "set_filter_rules" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido, tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes para IA." }),
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

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      return new Response(
        JSON.stringify({ error: "Resposta inesperada da IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(
      JSON.stringify({ rules: parsed.rules || [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("ai-import-filter error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
