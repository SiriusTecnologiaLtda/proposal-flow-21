import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { TOOLS, executeTool } from "./tools.ts";

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
    const contextResult = await buildProposalContext(supabase, body, fromNumber);
    const { userId, userRole, profile, salesMember } = contextResult;

    // Build system prompt: full prompt from DB + dynamic context
    const toolInstructions = (profile || salesMember) && userRole !== "consulta"
      ? `\n\nAÇÕES DISPONÍVEIS:
Você tem acesso a ferramentas para executar ações reais no sistema. Quando o usuário pedir para CRIAR uma oportunidade/proposta:
1. Use generate_proposal_number para obter o próximo número
2. Use lookup_client para encontrar o cliente pelo nome
3. Use lookup_sales_member se precisar encontrar ESN ou Arquiteto
4. Use create_proposal com os dados coletados
IMPORTANTE: Sempre use as ferramentas para ações reais. NUNCA invente dados, IDs, URLs ou números. Use apenas os retornados pelas ferramentas.
A URL real do sistema é: https://proposal-flow-21.lovable.app`
      : "";

    const systemPrompt = `${config.ai_system_prompt || "Você é um assistente comercial especializado em propostas de consultoria SAP."}

DADOS DO CONTEXTO ATUAL:
${contextResult.text}${toolInstructions}`;

    // Add current message to history
    conversationHistory.push({ role: "user", content: body });

    // Call Lovable AI with tool calling support
    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY não configurada");
    }

    // Identify user context for tool execution (mirrors web permissions)
    const userContext = {
      userId: userId || null,
      salesMemberId: salesMember?.id || null,
      userRole: userRole || null,
    };

    // Tool calling loop: allow up to 5 iterations for multi-step actions
    let messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory,
    ];
    let responseText = "";
    const MAX_TOOL_ITERATIONS = 5;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const aiPayload: any = {
        model: config.ai_model || "google/gemini-3-flash-preview",
        messages,
      };

      // Only include tools if user is identified and not consulta
      const canExecuteActions = (profile || salesMember) && userRole !== "consulta";
      if (canExecuteActions) {
        aiPayload.tools = TOOLS;
      }

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(aiPayload),
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
      const choice = aiData.choices?.[0];
      const assistantMessage = choice?.message;

      if (!assistantMessage) {
        responseText = "Desculpe, não consegui processar sua mensagem.";
        break;
      }

      // Check for tool calls
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        // Add assistant message with tool calls to conversation
        messages.push(assistantMessage);

        // Execute each tool call
        for (const toolCall of assistantMessage.tool_calls) {
          const fnName = toolCall.function.name;
          let fnArgs: Record<string, any> = {};
          try {
            fnArgs = JSON.parse(toolCall.function.arguments || "{}");
          } catch { /* empty args */ }

          console.log(`Executing tool: ${fnName}`, JSON.stringify(fnArgs));
          const toolResult = await executeTool(fnName, fnArgs, supabase, userContext);
          console.log(`Tool result (${fnName}):`, toolResult.substring(0, 500));

          // Add tool result to conversation
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResult,
          } as any);
        }

        // Continue the loop to let AI process tool results
        continue;
      }

      // No tool calls — we have the final text response
      responseText = assistantMessage.content || "Desculpe, não consegui processar sua mensagem.";
      break;
    }

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

interface ContextResult {
  text: string;
  userId: string | null;
  userRole: string | null;
  profile: any;
  salesMember: any;
}

async function buildProposalContext(supabase: any, userMessage: string, phone: string): Promise<ContextResult> {
  const lowerMsg = userMessage.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const parts: string[] = [];

  // 1. Identify user by phone – check profiles.phone AND sales_team.phone
  const cleanPhone = phone.replace("whatsapp:", "");
  // Normalize: try with and without country code prefix variations
  const phoneVariants = [phone, cleanPhone];
  // If starts with +55, also try without +55
  if (cleanPhone.startsWith("+55")) phoneVariants.push(cleanPhone.slice(3));
  if (cleanPhone.startsWith("55") && cleanPhone.length > 11) phoneVariants.push(cleanPhone.slice(2));
  // Build OR filter
  const phoneFilter = phoneVariants.map(p => `phone.eq.${p}`).join(",");

  let profile: any = null;
  let salesMember: any = null;
  let userRole: string | null = null;
  let userId: string | null = null;
  let memberUnitId: string | null = null;

  // Try to find via profiles table
  const { data: profileMatch } = await supabase
    .from("profiles")
    .select("user_id, display_name, email, sales_team_member_id, phone, is_cra")
    .or(phoneFilter)
    .maybeSingle();

  if (profileMatch) {
    profile = profileMatch;
    userId = profileMatch.user_id;
  }

  // Also try to find via sales_team table phone
  if (!profile) {
    const { data: stMatch } = await supabase
      .from("sales_team")
      .select("id, name, code, role, email, phone, unit_id, unit_info(name)")
      .or(phoneFilter)
      .maybeSingle();

    if (stMatch) {
      salesMember = stMatch;
      memberUnitId = stMatch.unit_id;
      // Try to find the associated profile by email
      if (stMatch.email) {
        const { data: pByEmail } = await supabase
          .from("profiles")
          .select("user_id, display_name, email, sales_team_member_id, is_cra")
          .eq("email", stMatch.email)
          .maybeSingle();
        if (pByEmail) {
          profile = pByEmail;
          userId = pByEmail.user_id;
        }
      }
    }
  }

  // If profile found, get sales member info
  if (profile?.sales_team_member_id && !salesMember) {
    const { data: member } = await supabase
      .from("sales_team")
      .select("id, name, code, role, unit_id, unit_info(name), email, phone")
      .eq("id", profile.sales_team_member_id)
      .maybeSingle();
    if (member) {
      salesMember = member;
      memberUnitId = member.unit_id;
    }
  }

  // Get user role
  if (userId) {
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (roleData) userRole = roleData.role;
  }

  if (profile) {
    parts.push(`👤 USUÁRIO IDENTIFICADO: ${profile.display_name} (${profile.email})`);
    if (userRole) parts.push(`   Perfil de acesso: ${userRole.toUpperCase()}`);
    if (profile.is_cra) parts.push(`   🏷️ CRA: Sim`);
  }
  if (salesMember) {
    parts.push(`   Perfil comercial: ${salesMember.code} - ${salesMember.name} (${salesMember.role?.toUpperCase()}) | Unidade: ${salesMember.unit_info?.name || "N/A"}`);
  }

  if (!profile && !salesMember) {
    parts.push(`⚠️ USUÁRIO NÃO IDENTIFICADO pelo telefone ${cleanPhone}. Dados serão limitados.`);
  }

  // Determine data access level based on role
  const isAdmin = userRole === "admin";
  const isConsulta = userRole === "consulta";
  const isVendedor = userRole === "vendedor";
  const isGsn = userRole === "gsn" || salesMember?.role === "gsn";
  const isArquiteto = userRole === "arquiteto" || salesMember?.role === "arquiteto";
  const isEsn = salesMember?.role === "esn";

  // For consulta users, get allowed unit IDs
  let consultaUnitIds: string[] = [];
  if (isConsulta && userId) {
    const { data: unitAccess } = await supabase
      .from("user_unit_access")
      .select("unit_id")
      .eq("user_id", userId);
    consultaUnitIds = (unitAccess || []).map((u: any) => u.unit_id);
  }

  // 2. Always load proposal defaults
  const { data: defaults } = await supabase.from("proposal_defaults").select("*").limit(1).single();
  if (defaults && !isConsulta) {
    parts.push(`\n⚙️ PARÂMETROS PADRÃO: Hora técnica R$${fmt(defaults.hourly_rate)} | GP ${defaults.gp_percentage}% | Acomp. Analista ${defaults.accomp_analyst_percentage}% | Acomp. GP ${defaults.accomp_gp_percentage}% | Traslado local ${defaults.travel_local_hours}h | Viagem ${defaults.travel_trip_hours}h | Hora traslado R$${fmt(defaults.travel_hourly_rate)}`);
  }

  // 3. Load proposals with role-based filtering
  let proposalQuery = supabase
    .from("proposals")
    .select("id, number, status, product, type, scope_type, hourly_rate, gp_percentage, accomp_analyst, accomp_gp, additional_analyst_rate, additional_gp_rate, travel_hourly_rate, travel_local_hours, travel_trip_hours, num_companies, created_at, updated_at, date_validity, expected_close_date, negotiation, description, client_id, esn_id, gsn_id, arquiteto_id, clients(name, code, cnpj, unit_id, unit_info(name, tax_factor)), sales_team!proposals_esn_id_fkey(name, code, unit_id), proposal_scope_items(hours, included, parent_id, description), payment_conditions(installment, amount, due_date)")
    .order("created_at", { ascending: false })
    .limit(20);

  // Apply role-based filters
  if (isConsulta) {
    proposalQuery = proposalQuery.eq("status", "ganha");
  } else if (isEsn && salesMember) {
    proposalQuery = proposalQuery.eq("esn_id", salesMember.id);
  } else if (isGsn && salesMember) {
    proposalQuery = proposalQuery.eq("gsn_id", salesMember.id);
  } else if (isArquiteto && salesMember) {
    proposalQuery = proposalQuery.eq("arquiteto_id", salesMember.id);
  }
  // admin and vendedor see all (vendedor through RLS)

  const { data: proposals } = await proposalQuery;

  if (proposals && proposals.length > 0) {
    // For consulta, further filter by unit
    let filteredProposals = proposals;
    if (isConsulta && consultaUnitIds.length > 0) {
      filteredProposals = proposals.filter((p: any) => {
        const esnUnitId = p.sales_team?.unit_id;
        return esnUnitId && consultaUnitIds.includes(esnUnitId);
      });
    }

    parts.push(`\n📋 PROPOSTAS ${isConsulta ? "GANHAS" : "RECENTES"} (${filteredProposals.length}):`);
    for (const p of filteredProposals) {
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
      if (!isConsulta) {
        parts.push(`     ESN: ${p.sales_team?.name || "N/A"}`);
        parts.push(`     Valor/hora: R$${fmt(p.hourly_rate)} | GP: ${p.gp_percentage}%`);
        parts.push(`     Horas Analista: ${totalAnalystHours}h | Horas GP: ${gpHours.toFixed(1)}h | Total: ${totalHours.toFixed(1)}h`);
      }
      parts.push(`     💰 Valor Líquido: R$${fmt(netTotal)} | Bruto: R$${fmt(grossTotal)} (tax_factor: ${taxFactor})`);
      parts.push(`     Pagamento: ${paymentInfo}`);
      if (p.negotiation && !isConsulta) parts.push(`     Negociação: ${p.negotiation}`);
      if (p.expected_close_date && !isConsulta) parts.push(`     Previsão fechamento: ${p.expected_close_date}`);
      parts.push(`     Criada em: ${new Date(p.created_at).toLocaleDateString("pt-BR")}`);
    }
  }

  // 4. Load client list (not for consulta users)
  if (!isConsulta) {
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
  }

  // 5. Load products and templates when creating (not for consulta)
  if (!isConsulta) {
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
  }

  // 6. Units
  if (!isConsulta) {
    const { data: units } = await supabase.from("unit_info").select("name, code, tax_factor, city").order("name");
    if (units && units.length > 0) {
      parts.push(`\n🏛️ UNIDADES: ${units.map((u: any) => `${u.name} (tax: ${u.tax_factor})`).join(" | ")}`);
    }
  }

  // 7. Proposal types (not for consulta)
  if (!isConsulta) {
    const { data: proposalTypes } = await supabase.from("proposal_types").select("name, slug, analyst_label, gp_label, rounding_factor");
    if (proposalTypes && proposalTypes.length > 0) {
      parts.push(`\n📐 TIPOS DE PROPOSTA:`);
      for (const pt of proposalTypes) {
        parts.push(`  - ${pt.name} (${pt.slug}): Analista="${pt.analyst_label}" | GP="${pt.gp_label}" | Arredondamento: ${pt.rounding_factor}h`);
      }
    }
  }

  // Access restriction note for AI
  if (isConsulta) {
    parts.push(`\n⚠️ REGRA DE ACESSO: Este usuário tem perfil CONSULTA. Só pode ver propostas GANHAS das unidades autorizadas. NÃO forneça dados de propostas pendentes, clientes ou parâmetros comerciais.`);
  } else if (!profile && !salesMember) {
    parts.push(`\n⚠️ REGRA DE ACESSO: Usuário não identificado. Forneça apenas informações genéricas. Peça para o usuário se identificar ou entrar em contato com o administrador.`);
  }

  return { text: parts.join("\n"), userId, userRole, profile, salesMember };
}

function fmt(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
