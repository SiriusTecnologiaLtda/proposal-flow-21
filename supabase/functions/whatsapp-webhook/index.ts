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

    // Build system prompt: full prompt from DB + dynamic context
    const systemPrompt = `${config.ai_system_prompt || "Você é um assistente comercial especializado em propostas de consultoria SAP."}

DADOS DO CONTEXTO ATUAL:
${proposalContext}`;

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
  const lowerMsg = userMessage.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const parts: string[] = [];

  // 1. Identify user by phone
  const cleanPhone = phone.replace("whatsapp:", "");
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, display_name, email, sales_team_member_id, phone")
    .or(`phone.eq.${phone},phone.eq.${cleanPhone}`)
    .maybeSingle();

  if (profile) {
    parts.push(`👤 USUÁRIO: ${profile.display_name} (${profile.email})`);
    if (profile.sales_team_member_id) {
      const { data: member } = await supabase
        .from("sales_team")
        .select("name, code, role, unit_id, unit_info(name)")
        .eq("id", profile.sales_team_member_id)
        .maybeSingle();
      if (member) {
        parts.push(`   Perfil comercial: ${member.code} - ${member.name} (${member.role?.toUpperCase()}) | Unidade: ${member.unit_info?.name || "N/A"}`);
      }
    }
  }

  // 2. Always load proposal defaults
  const { data: defaults } = await supabase.from("proposal_defaults").select("*").limit(1).single();
  if (defaults) {
    parts.push(`\n⚙️ PARÂMETROS PADRÃO: Hora técnica R$${fmt(defaults.hourly_rate)} | GP ${defaults.gp_percentage}% | Acomp. Analista ${defaults.accomp_analyst_percentage}% | Acomp. GP ${defaults.accomp_gp_percentage}% | Traslado local ${defaults.travel_local_hours}h | Viagem ${defaults.travel_trip_hours}h | Hora traslado R$${fmt(defaults.travel_hourly_rate)}`);
  }

  // 3. Always load recent proposals with full financial data
  const { data: proposals } = await supabase
    .from("proposals")
    .select("id, number, status, product, type, scope_type, hourly_rate, gp_percentage, accomp_analyst, accomp_gp, additional_analyst_rate, additional_gp_rate, travel_hourly_rate, travel_local_hours, travel_trip_hours, num_companies, created_at, updated_at, date_validity, expected_close_date, negotiation, description, client_id, esn_id, gsn_id, clients(name, code, cnpj, unit_id, unit_info(name, tax_factor)), sales_team!proposals_esn_id_fkey(name, code), proposal_scope_items(hours, included, parent_id, description), payment_conditions(installment, amount, due_date)")
    .order("created_at", { ascending: false })
    .limit(20);

  if (proposals && proposals.length > 0) {
    parts.push("\n📋 PROPOSTAS RECENTES (últimas 20):");
    for (const p of proposals) {
      const includedItems = (p.proposal_scope_items || []).filter((i: any) => i.included);
      const totalAnalystHours = includedItems.reduce((sum: number, i: any) => sum + (i.hours || 0), 0);
      const gpHours = totalAnalystHours * (p.gp_percentage || 0) / 100;
      const totalHours = totalAnalystHours + gpHours;
      const analystValue = totalAnalystHours * (p.hourly_rate || 0);
      const gpValue = gpHours * (p.hourly_rate || 0);
      const accompValue = (p.accomp_analyst || 0) * (p.additional_analyst_rate || 0) + (p.accomp_gp || 0) * (p.additional_gp_rate || 0);
      const travelHours = (p.travel_local_hours || 0) + (p.travel_trip_hours || 0);
      const travelValue = travelHours * (p.travel_hourly_rate || 0);
      const netTotal = analystValue + gpValue + accompValue + travelValue;
      const taxFactor = p.clients?.unit_info?.tax_factor || 1;
      const grossTotal = netTotal * taxFactor * (p.num_companies || 1);

      const payments = (p.payment_conditions || []).sort((a: any, b: any) => a.installment - b.installment);
      const paymentInfo = payments.length > 0
        ? `${payments.length}x (${payments.map((pm: any) => `R$${fmt(pm.amount)}`).join(" + ")})`
        : "sem parcelas";

      const statusLabel: Record<string, string> = {
        pendente: "⏳ Pendente",
        proposta_gerada: "📄 Proposta Gerada",
        em_assinatura: "✍️ Em Assinatura",
        ganha: "✅ Ganha",
        cancelada: "❌ Cancelada",
      };

      parts.push(`\n  📌 Proposta *${p.number}*:`);
      parts.push(`     Cliente: *${p.clients?.name || "?"}* (${p.clients?.code || "?"}) | Unidade: ${p.clients?.unit_info?.name || "?"}`);
      parts.push(`     Produto: ${p.product} | Tipo: ${p.type} | Escopo: ${p.scope_type}`);
      parts.push(`     Status: ${statusLabel[p.status] || p.status}`);
      parts.push(`     ESN: ${p.sales_team?.name || "N/A"}`);
      parts.push(`     Valor/hora: R$${fmt(p.hourly_rate)} | GP: ${p.gp_percentage}%`);
      parts.push(`     Horas Analista: ${totalAnalystHours}h | Horas GP: ${gpHours.toFixed(1)}h | Total: ${totalHours.toFixed(1)}h`);
      parts.push(`     💰 Valor Líquido: R$${fmt(netTotal)} | Bruto: R$${fmt(grossTotal)} (tax_factor: ${taxFactor})`);
      parts.push(`     Pagamento: ${paymentInfo}`);
      if (p.negotiation) parts.push(`     Negociação: ${p.negotiation}`);
      if (p.expected_close_date) parts.push(`     Previsão fechamento: ${p.expected_close_date}`);
      parts.push(`     Criada em: ${new Date(p.created_at).toLocaleDateString("pt-BR")}`);
    }
  }

  // 4. Always load client list
  const { data: clients } = await supabase
    .from("clients")
    .select("name, code, cnpj, email, contact, unit_id, unit_info(name), esn:sales_team!clients_esn_id_fkey(name, code), gsn:sales_team!clients_gsn_id_fkey(name, code)")
    .order("name")
    .limit(50);

  if (clients && clients.length > 0) {
    parts.push(`\n🏢 CLIENTES CADASTRADOS (${clients.length}):`);
    for (const c of clients) {
      parts.push(`  - ${c.code}: *${c.name}* | CNPJ: ${c.cnpj} | Unidade: ${c.unit_info?.name || "N/A"} | ESN: ${c.esn?.name || "-"} | GSN: ${c.gsn?.name || "-"}`);
    }
  }

  // 5. Load products and templates when creating
  const needsCreation = lowerMsg.includes("criar") || lowerMsg.includes("gerar") || lowerMsg.includes("nova proposta") || lowerMsg.includes("novo orcamento");
  if (needsCreation) {
    const { data: products } = await supabase.from("products").select("name");
    const { data: templates } = await supabase.from("scope_templates").select("name, product, category").order("product");

    if (products) {
      parts.push("\n📦 PRODUTOS: " + products.map((p: any) => p.name).join(", "));
    }
    if (templates) {
      parts.push("📝 TEMPLATES DE ESCOPO:");
      for (const t of templates) {
        parts.push(`  - ${t.name} (${t.product} / ${t.category})`);
      }
    }
  }

  // 6. Units
  const { data: units } = await supabase.from("unit_info").select("name, code, tax_factor, city").order("name");
  if (units && units.length > 0) {
    parts.push(`\n🏛️ UNIDADES: ${units.map((u: any) => `${u.name} (tax: ${u.tax_factor})`).join(" | ")}`);
  }

  // 7. Proposal types
  const { data: proposalTypes } = await supabase.from("proposal_types").select("name, slug, analyst_label, gp_label, rounding_factor");
  if (proposalTypes && proposalTypes.length > 0) {
    parts.push(`\n📐 TIPOS DE PROPOSTA:`);
    for (const pt of proposalTypes) {
      parts.push(`  - ${pt.name} (${pt.slug}): Analista="${pt.analyst_label}" | GP="${pt.gp_label}" | Arredondamento: ${pt.rounding_factor}h`);
    }
  }

  return parts.join("\n");
}

function fmt(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
