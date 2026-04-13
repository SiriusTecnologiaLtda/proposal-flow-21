import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface EnrichFields {
  company: string;
  segment: string;
  opportunityTypeLabel: string;
  mainPain: string;
  currentScenario: string;
  whyActNow: string;
  solutionSummary: string;
  solutionHow: string;
  objectives: string[];
  scopeGroups: { title: string; totalHours: number }[];
  investmentTotal: number;
  benefits: { title: string }[];
  differentiators: { title: string }[];
  nextStep: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fields } = (await req.json()) as { proposalId: string; fields: EnrichFields };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check which fields are empty
    const emptyNarrative =
      !fields.mainPain &&
      !fields.currentScenario &&
      !fields.whyActNow &&
      !fields.solutionSummary &&
      !fields.solutionHow &&
      !fields.objectives.length &&
      !fields.benefits.length &&
      !fields.differentiators.length &&
      !fields.nextStep;

    const hasAnyEmpty =
      !fields.mainPain ||
      !fields.currentScenario ||
      !fields.whyActNow ||
      !fields.solutionSummary ||
      !fields.solutionHow ||
      !fields.objectives.length ||
      !fields.benefits.length ||
      !fields.differentiators.length ||
      !fields.nextStep;

    // If ALL narrative fields are filled, skip AI
    if (!hasAnyEmpty) {
      return new Response(
        JSON.stringify({ enriched: false, data: fields }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `Você é um especialista em vendas consultivas B2B da TOTVS, maior empresa de ERP do Brasil. Sua função é enriquecer apresentações executivas com linguagem profissional, persuasiva e baseada em padrões reais de mercado do setor de tecnologia empresarial.

REGRAS CRÍTICAS:
- Retorne APENAS JSON válido, sem markdown, sem explicações
- Nunca invente: valores financeiros específicos, datas, nomes de pessoas, módulos técnicos específicos que não foram mencionados
- Use linguagem executiva, direta, orientada a resultado de negócio
- Contextualize sempre para o segmento e tipo de solução informados
- Máximo 2 frases por campo narrativo
- benefits: array de objetos {title, description, icon} onde icon é um dos: "TrendingDown","Eye","ShieldCheck","Rocket","Heart","Award","Brain","Shield"
- differentiators: array de objetos {title, description}
- objectives: array de strings, máximo 4 itens
- nextStep: string com CTA executivo para reunião/alinhamento`;

    // Build dynamic parts for the prompt
    const filledParts: string[] = [];
    if (fields.mainPain) filledParts.push(`mainPain: "${fields.mainPain}"`);
    if (fields.currentScenario) filledParts.push(`currentScenario: "${fields.currentScenario}"`);
    if (fields.whyActNow) filledParts.push(`whyActNow: "${fields.whyActNow}"`);
    if (fields.solutionSummary) filledParts.push(`solutionSummary: "${fields.solutionSummary}"`);
    if (fields.solutionHow) filledParts.push(`solutionHow: "${fields.solutionHow}"`);

    const emptyFieldsJson: string[] = [];
    if (!fields.mainPain) emptyFieldsJson.push('"mainPain": "string"');
    if (!fields.currentScenario) emptyFieldsJson.push('"currentScenario": "string"');
    if (!fields.whyActNow) emptyFieldsJson.push('"whyActNow": "string"');
    if (!fields.solutionSummary) emptyFieldsJson.push('"solutionSummary": "string"');
    if (!fields.solutionHow) emptyFieldsJson.push('"solutionHow": "string"');
    if (!fields.objectives.length) emptyFieldsJson.push('"objectives": []');
    if (!fields.benefits.length) emptyFieldsJson.push('"benefits": []');
    if (!fields.differentiators.length) emptyFieldsJson.push('"differentiators": []');
    if (!fields.nextStep) emptyFieldsJson.push('"nextStep": "string"');

    const userPrompt = `Empresa: ${fields.company}
Segmento: ${fields.segment || "Não informado"}
Tipo de solução: ${fields.opportunityTypeLabel}
Grupos de escopo: ${fields.scopeGroups.map((g) => g.title).join(", ") || "Não informado"}
Investimento total: R$ ${fields.investmentTotal.toLocaleString("pt-BR")}

Campos já preenchidos (NÃO reescreva estes):
${filledParts.join("\n")}

Gere APENAS os campos vazios abaixo como JSON:
{
  ${emptyFieldsJson.join(",\n  ")}
}`;

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
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Muitas requisições. Aguarde e tente novamente." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA insuficientes." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.error("AI gateway error:", response.status, await response.text());
      return new Response(
        JSON.stringify({ enriched: false, data: fields }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify({ enriched: false, data: fields }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    try {
      // Strip markdown fences if present
      const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const aiGenerated = JSON.parse(cleaned);
      const merged = { ...fields, ...aiGenerated };

      return new Response(
        JSON.stringify({ enriched: true, data: merged }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch {
      console.error("Failed to parse AI response:", content);
      return new Response(
        JSON.stringify({ enriched: false, data: fields }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (e) {
    console.error("enrich-presentation error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
