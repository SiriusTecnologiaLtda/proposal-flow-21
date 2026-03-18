import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Twilio gateway URL
const TWILIO_GATEWAY = "https://connector-gateway.lovable.dev/twilio";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  const twilioApiKey = Deno.env.get("TWILIO_API_KEY");

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Twilio sends webhooks as form-urlencoded
    const contentType = req.headers.get("content-type") || "";
    let fromNumber = "";
    let body = "";
    let messageSid = "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      fromNumber = formData.get("From")?.toString() || "";
      body = formData.get("Body")?.toString() || "";
      messageSid = formData.get("MessageSid")?.toString() || "";
    } else {
      // JSON payload (for testing or direct calls)
      const json = await req.json();
      fromNumber = json.From || json.from || "";
      body = json.Body || json.body || json.message || "";
      messageSid = json.MessageSid || "";
    }

    if (!body || !fromNumber) {
      return new Response("<Response><Message>Mensagem vazia</Message></Response>", {
        headers: { ...corsHeaders, "Content-Type": "text/xml" },
      });
    }

    console.log(`Incoming WhatsApp from ${fromNumber}: ${body}`);

    // Load WhatsApp config
    const { data: config } = await supabase
      .from("whatsapp_config")
      .select("*")
      .limit(1)
      .single();

    if (!config?.enabled) {
      return new Response("<Response><Message>Serviço indisponível no momento.</Message></Response>", {
        headers: { ...corsHeaders, "Content-Type": "text/xml" },
      });
    }

    // Save inbound message
    await supabase.from("whatsapp_messages").insert({
      phone_number: fromNumber,
      direction: "inbound",
      message_text: body,
      twilio_sid: messageSid,
    });

    // Load conversation context (recent messages from this number)
    const { data: recentMessages } = await supabase
      .from("whatsapp_messages")
      .select("direction, message_text, ai_response, created_at")
      .eq("phone_number", fromNumber)
      .order("created_at", { ascending: false })
      .limit(config.max_context_messages || 20);

    // Build conversation history for AI
    const conversationHistory = (recentMessages || [])
      .reverse()
      .flatMap((msg: any) => {
        const msgs: any[] = [];
        if (msg.direction === "inbound") {
          msgs.push({ role: "user", content: msg.message_text });
        }
        if (msg.ai_response) {
          msgs.push({ role: "assistant", content: msg.ai_response });
        }
        return msgs;
      });

    // Query proposal data for context
    const proposalContext = await buildProposalContext(supabase, body, fromNumber);

    // Build system prompt with proposal context
    const systemPrompt = `${config.ai_system_prompt || "Você é um assistente comercial."}

CONTEXTO DE DADOS DO SISTEMA:
${proposalContext}

INSTRUÇÕES:
- Responda de forma concisa e direta, adequada para WhatsApp (mensagens curtas).
- Use emojis moderadamente para tornar a conversa amigável.
- Formate valores monetários em R$ com separador de milhares.
- Quando o usuário pedir para criar uma proposta, colete: cliente, produto, tipo de escopo e horas estimadas.
- Se não tiver informação suficiente, pergunte de forma objetiva.
- Nunca invente dados. Se não encontrar, informe ao usuário.`;

    // Add current message to history
    conversationHistory.push({ role: "user", content: body });

    // Call Lovable AI
    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY não configurada");
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.ai_model || "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationHistory,
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        throw new Error("Rate limit atingido. Tente novamente em alguns segundos.");
      }
      if (aiResponse.status === 402) {
        throw new Error("Créditos de IA esgotados.");
      }
      throw new Error(`AI error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const responseText = aiData.choices?.[0]?.message?.content || "Desculpe, não consegui processar sua mensagem.";

    // Save outbound message with AI response
    await supabase.from("whatsapp_messages").insert({
      phone_number: fromNumber,
      direction: "outbound",
      message_text: body,
      ai_response: responseText,
    });

    // If Twilio is connected, send response via gateway
    if (twilioApiKey && config.twilio_phone_number) {
      try {
        const sendResp = await fetch(`${TWILIO_GATEWAY}/Messages.json`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "X-Connection-Api-Key": twilioApiKey,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: fromNumber,
            From: `whatsapp:${config.twilio_phone_number}`,
            Body: responseText,
          }),
        });
        if (!sendResp.ok) {
          const err = await sendResp.text();
          console.error("Twilio send error:", err);
        }
      } catch (e) {
        console.error("Twilio send failed:", e);
      }
    }

    // Return TwiML response (Twilio expects this)
    return new Response(
      `<Response><Message>${escapeXml(responseText)}</Message></Response>`,
      { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
    );
  } catch (error) {
    console.error("Webhook error:", error);
    const msg = error instanceof Error ? error.message : "Erro interno";
    return new Response(
      `<Response><Message>Erro: ${escapeXml(msg)}</Message></Response>`,
      { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
    );
  }
});

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function buildProposalContext(supabase: any, userMessage: string, phone: string): Promise<string> {
  const lowerMsg = userMessage.toLowerCase();
  const parts: string[] = [];

  // Try to find user by phone
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, display_name, email, sales_team_member_id")
    .or(`phone.eq.${phone},phone.eq.${phone.replace("whatsapp:", "")}`)
    .maybeSingle();

  if (profile) {
    parts.push(`Usuário identificado: ${profile.display_name} (${profile.email})`);
  }

  // If asking about proposals, fetch relevant data
  if (lowerMsg.includes("proposta") || lowerMsg.includes("valor") || lowerMsg.includes("histórico") || lowerMsg.includes("status")) {
    const { data: proposals } = await supabase
      .from("proposals")
      .select("number, status, product, type, hourly_rate, created_at, client_id, clients(name)")
      .order("created_at", { ascending: false })
      .limit(10);

    if (proposals && proposals.length > 0) {
      parts.push("PROPOSTAS RECENTES:");
      for (const p of proposals) {
        parts.push(`- ${p.number}: ${p.clients?.name || "?"} | ${p.product} | Status: ${p.status} | Tipo: ${p.type} | Valor/h: R$${p.hourly_rate}`);
      }
    }
  }

  // If asking about clients
  if (lowerMsg.includes("cliente")) {
    const { data: clients } = await supabase
      .from("clients")
      .select("name, code, cnpj, email")
      .order("name")
      .limit(15);

    if (clients && clients.length > 0) {
      parts.push("CLIENTES CADASTRADOS:");
      for (const c of clients) {
        parts.push(`- ${c.code}: ${c.name} (CNPJ: ${c.cnpj})`);
      }
    }
  }

  // If asking to create a proposal, provide available products and templates
  if (lowerMsg.includes("criar") || lowerMsg.includes("gerar") || lowerMsg.includes("nova proposta")) {
    const { data: products } = await supabase.from("products").select("name");
    const { data: templates } = await supabase.from("scope_templates").select("name, product, category");
    const { data: defaults } = await supabase.from("proposal_defaults").select("*").limit(1).single();

    if (products) {
      parts.push("PRODUTOS DISPONÍVEIS: " + products.map((p: any) => p.name).join(", "));
    }
    if (templates) {
      parts.push("TEMPLATES DE ESCOPO: " + templates.map((t: any) => `${t.name} (${t.product}/${t.category})`).join(", "));
    }
    if (defaults) {
      parts.push(`PARÂMETROS PADRÃO: Hora R$${defaults.hourly_rate}, GP ${defaults.gp_percentage}%, Traslado Local ${defaults.travel_local_hours}h, Viagem ${defaults.travel_trip_hours}h`);
    }
  }

  return parts.length > 0 ? parts.join("\n") : "Nenhum contexto específico carregado. O usuário pode perguntar sobre propostas, clientes, valores ou solicitar a geração de uma nova proposta.";
}
