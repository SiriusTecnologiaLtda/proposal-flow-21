import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Não autorizado" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      return jsonResponse({ error: "LOVABLE_API_KEY não configurada" }, 500);
    }

    // User-scoped client for auth validation
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return jsonResponse({ error: "Não autorizado" }, 401);
    }
    const userId = claimsData.claims.sub as string;

    // Service role client for storage signed URLs and admin ops
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // --- Parse request ---
    const { software_proposal_id } = await req.json();
    if (!software_proposal_id) {
      return jsonResponse({ error: "software_proposal_id é obrigatório" }, 400);
    }

    // --- Fetch proposal record (user-scoped so RLS applies) ---
    const { data: proposal, error: fetchErr } = await userClient
      .from("software_proposals")
      .select("*")
      .eq("id", software_proposal_id)
      .single();

    if (fetchErr || !proposal) {
      return jsonResponse({ error: "Proposta não encontrada ou sem permissão" }, 404);
    }

    // --- Update status to extracting ---
    await userClient
      .from("software_proposals")
      .update({ status: "extracting", updated_at: new Date().toISOString() })
      .eq("id", software_proposal_id);

    // --- Download PDF from private bucket via signed URL ---
    const filePath = proposal.file_url; // stored as internal path
    const { data: signedData, error: signErr } = await adminClient.storage
      .from("software-proposal-pdfs")
      .createSignedUrl(filePath, 300); // 5 min

    if (signErr || !signedData?.signedUrl) {
      await userClient
        .from("software_proposals")
        .update({ status: "error", updated_at: new Date().toISOString() })
        .eq("id", software_proposal_id);
      console.error("Storage sign error:", signErr);
      return jsonResponse({ error: "Erro ao acessar arquivo PDF" }, 500);
    }

    // Download PDF bytes
    const pdfResponse = await fetch(signedData.signedUrl);
    if (!pdfResponse.ok) {
      await userClient
        .from("software_proposals")
        .update({ status: "error", updated_at: new Date().toISOString() })
        .eq("id", software_proposal_id);
      return jsonResponse({ error: "Erro ao baixar arquivo PDF" }, 500);
    }

    const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
    // Chunk-based base64 encoding to avoid stack overflow on large PDFs
    let pdfBase64 = "";
    const chunkSize = 8192;
    for (let i = 0; i < pdfBytes.length; i += chunkSize) {
      const chunk = pdfBytes.subarray(i, Math.min(i + chunkSize, pdfBytes.length));
      pdfBase64 += String.fromCharCode(...chunk);
    }
    pdfBase64 = btoa(pdfBase64);

    // --- Load extraction config ---
    const { data: config } = await adminClient
      .from("software_proposal_config")
      .select("*")
      .limit(1)
      .maybeSingle();

    const extractionModel = config?.extraction_model || "google/gemini-2.5-flash";
    const confidenceThreshold = config?.confidence_threshold ?? 0.7;
    const autoCreateIssuesBelow = config?.auto_create_issues_below ?? 0.5;

    // --- Call AI for extraction ---
    const extractionPrompt = `You are a structured data extraction engine specialized in commercial software proposals (PDFs), commonly from vendors like TOTVS, Oracle, SAP, Microsoft, and similar enterprise software companies.

Analyze this PDF document and extract ALL available commercial information into a strict JSON structure.

DOCUMENT STRUCTURE GUIDANCE:
- These proposals typically have a HEADER section with proposal number, client, dates, and sales team info.
- They contain one or more PAYMENT TABLES, often split into:
  - "Adesão ou soluções de pagamento não recorrentes" (one-time items like CDU, setup fees)
  - "Soluções de pagamento recorrentes" (recurring items like SMS, cloud subscriptions, licenses)
- There may be a DISCOUNT section ("Desconto com vigência") with explicit discount amounts and duration.
- The last pages are often SIGNATURE PROTOCOL pages — IGNORE these entirely for data extraction.
- Legal/contractual boilerplate sections should be ignored for line item extraction.

IMPORTANT RULES:
- Extract EXACTLY what is in the document. Do not invent or assume data.
- For each header field, assign a confidence score between 0.0 and 1.0.
- If a field cannot be found, set its value to null and confidence to 0.0.
- For line items, extract every distinct product/service/license line from ALL payment tables.
- Items listed as "Gratuito" with value 0.00 should still be extracted (they represent free tier or included items).
- Monetary values must be numbers (not formatted strings). Use Brazilian decimal format awareness: "2.640,30" means 2640.30.
- Dates in the document are typically in DD/MM/YYYY format. Convert to ISO 8601 (YYYY-MM-DD).
- The validity date is often found as text like "válida para assinatura até DD/MM/YYYY" near the end of the commercial content (before signature pages).
- Currency is almost always BRL for Brazilian proposals. Look for "R$" or "Moeda" column.
- For total_value: sum ALL recurring item totals (this represents the monthly/periodic commitment). If there are both one-time and recurring tables, report the recurring total as total_value and mention one-time totals in notes.
- For payment_type: map "Mensal" → "monthly", "90 DIAS DDL" → "quarterly", "Gratuito" → "free", "Sob Consumo" → "usage_based".
- The vendor_name is the company issuing the proposal (e.g., "TOTVS S.A."), NOT the client.
- The client_name appears after "Cliente:" or "CLIENTE:" in the header section.
- proposal_number appears after "Proposta N°:" in the header.

RECURRENCE MAPPING for items:
- "Gratuito" or one-time payment → "one_time"
- "Mensal" → "monthly"  
- "90 DIAS DDL" or quarterly → "quarterly"
- "Anual" → "annual"
- "Sob Consumo" → "usage_based"
- If unclear → "other"

COST CLASSIFICATION:
- CDU (Cessão de Direito de Uso), Adesão, Setup → "capex"
- SMS (Serviço de Manutenção), Cloud subscriptions, recurring licenses → "opex"
- Mixed or unclear → "mixed"

ITEM TYPE:
- CDU, License, Licenciamento → "license"
- Cloud, Infrastructure, hosting → "infrastructure"  
- SMS, Manutenção, Support → "support"
- Setup, Implantação, services → "service"
- If unclear → "other"

Return ONLY valid JSON with this exact structure:
{
  "extraction_confidence": <number 0-1, overall confidence>,
  "proposal_number": <string|null>,
  "header": {
    "vendor_name": { "value": <string|null>, "confidence": <number> },
    "client_name": { "value": <string|null>, "confidence": <number> },
    "proposal_date": { "value": <string|null in YYYY-MM-DD>, "confidence": <number> },
    "validity_date": { "value": <string|null in YYYY-MM-DD>, "confidence": <number> },
    "total_value": { "value": <number|null>, "confidence": <number> },
    "currency": { "value": <string|null>, "confidence": <number> },
    "payment_type": { "value": <string|null>, "confidence": <number> },
    "first_due_date": { "value": <string|null in YYYY-MM-DD>, "confidence": <number> },
    "installment_count": { "value": <number|null>, "confidence": <number> },
    "discount_amount": { "value": <number|null>, "confidence": <number> },
    "discount_duration_months": { "value": <number|null>, "confidence": <number> },
    "discount_notes": { "value": <string|null>, "confidence": <number> },
    "notes": { "value": <string|null>, "confidence": <number> }
  },
  "items": [
    {
      "description": <string>,
      "quantity": <number>,
      "unit_price": <number>,
      "total_price": <number>,
      "recurrence": <"one_time"|"monthly"|"quarterly"|"annual"|"usage_based"|"other">,
      "cost_classification": <"capex"|"opex"|"mixed">,
      "item_type": <"license"|"service"|"support"|"infrastructure"|"other">,
      "confidence_score": <number 0-1>,
      "notes": <string|null>
    }
  ],
  "issues": [
    {
      "field_name": <string>,
      "issue_type": <"low_confidence"|"missing_required"|"ambiguous_value"|"format_error">,
      "extracted_value": <string|null>
    }
  ]
}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: extractionModel,
        messages: [
          { role: "system", content: extractionPrompt },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:application/pdf;base64,${pdfBase64}` },
              },
              {
                type: "text",
                text: `Extract all structured data from this software proposal PDF. File: ${proposal.file_name}. Focus on commercial data (items, values, dates, payment conditions) and ignore signature protocol pages.`,
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 12000,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI extraction error:", aiResponse.status, errText);
      await userClient
        .from("software_proposals")
        .update({ status: "error", updated_at: new Date().toISOString() })
        .eq("id", software_proposal_id);

      if (aiResponse.status === 429) {
        return jsonResponse({ error: "Limite de requisições IA excedido. Tente novamente em alguns segundos." }, 429);
      }
      if (aiResponse.status === 402) {
        return jsonResponse({ error: "Créditos de IA insuficientes." }, 402);
      }
      return jsonResponse({ error: "Erro no serviço de extração IA" }, 500);
    }

    const aiResult = await aiResponse.json();
    const rawContent = aiResult.choices?.[0]?.message?.content || "";

    // Parse JSON from AI response (may be wrapped in markdown code block)
    let extracted: any;
    try {
      const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawContent.trim();
      extracted = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", rawContent.substring(0, 500));
      await userClient
        .from("software_proposals")
        .update({
          status: "error",
          raw_extracted_json: { raw_response: rawContent },
          updated_at: new Date().toISOString(),
        })
        .eq("id", software_proposal_id);
      return jsonResponse({ error: "Falha ao interpretar resposta da IA" }, 500);
    }

    const header = extracted.header || {};
    const items = extracted.items || [];
    const aiIssues = extracted.issues || [];
    const overallConfidence = extracted.extraction_confidence ?? 0;

    // --- Helper to safely get value ---
    const val = (field: any) => field?.value ?? null;

    // --- Update proposal record with extracted data ---
    await userClient
      .from("software_proposals")
      .update({
        status: "extracted",
        vendor_name: val(header.vendor_name),
        client_name: val(header.client_name),
        proposal_date: val(header.proposal_date),
        validity_date: val(header.validity_date),
        total_value: val(header.total_value) ?? 0,
        currency: val(header.currency) || "BRL",
        payment_type: val(header.payment_type),
        first_due_date: val(header.first_due_date),
        installment_count: val(header.installment_count),
        discount_amount: val(header.discount_amount) ?? 0,
        discount_duration_months: val(header.discount_duration_months),
        discount_notes: val(header.discount_notes),
        notes: val(header.notes),
        extraction_confidence: overallConfidence,
        extraction_provider: "lovable_ai",
        extraction_model: extractionModel,
        extracted_at: new Date().toISOString(),
        raw_extracted_json: extracted,
        updated_at: new Date().toISOString(),
      })
      .eq("id", software_proposal_id);

    // --- Clear previous items and issues for re-extraction ---
    // Use admin client to bypass RLS for bulk cleanup
    await adminClient
      .from("software_proposal_items")
      .delete()
      .eq("software_proposal_id", software_proposal_id);

    await adminClient
      .from("extraction_issues")
      .delete()
      .eq("software_proposal_id", software_proposal_id);

    // --- Insert extracted items ---
    if (items.length > 0) {
      const itemRows = items.map((item: any, idx: number) => ({
        software_proposal_id,
        description: item.description || "Item sem descrição",
        quantity: item.quantity ?? 1,
        unit_price: item.unit_price ?? 0,
        total_price: item.total_price ?? 0,
        recurrence: item.recurrence || "one_time",
        cost_classification: item.cost_classification || "opex",
        item_type: item.item_type || "other",
        confidence_score: item.confidence_score ?? 0,
        sort_order: idx,
        notes: item.notes || null,
      }));

      const { error: itemsErr } = await adminClient
        .from("software_proposal_items")
        .insert(itemRows);

      if (itemsErr) {
        console.error("Error inserting items:", itemsErr);
      }
    }

    // --- Create extraction issues ---
    const issuesToInsert: any[] = [];

    // Issues reported by AI
    for (const issue of aiIssues) {
      issuesToInsert.push({
        software_proposal_id,
        field_name: issue.field_name,
        issue_type: issue.issue_type || "low_confidence",
        extracted_value: issue.extracted_value || null,
        status: "open",
      });
    }

    // Auto-create issues for low-confidence header fields
    for (const [fieldName, fieldData] of Object.entries(header)) {
      const fd = fieldData as any;
      if (fd?.confidence !== undefined && fd.confidence < confidenceThreshold && fd.confidence > 0) {
        issuesToInsert.push({
          software_proposal_id,
          field_name: fieldName,
          issue_type: fd.confidence < autoCreateIssuesBelow ? "low_confidence" : "ambiguous_value",
          extracted_value: fd.value != null ? String(fd.value) : null,
          status: "open",
        });
      }
    }

    // Auto-create issues for low-confidence items
    for (const item of items) {
      if (item.confidence_score !== undefined && item.confidence_score < confidenceThreshold) {
        issuesToInsert.push({
          software_proposal_id,
          field_name: `item: ${(item.description || "").substring(0, 80)}`,
          issue_type: item.confidence_score < autoCreateIssuesBelow ? "low_confidence" : "ambiguous_value",
          extracted_value: item.description || null,
          status: "open",
        });
      }
    }

    // Check for missing required fields
    const requiredFields = ["vendor_name", "total_value"];
    for (const rf of requiredFields) {
      const fd = header[rf] as any;
      if (!fd || fd.value == null || fd.value === "") {
        // Avoid duplicate if AI already flagged it
        const alreadyFlagged = issuesToInsert.some(
          (i) => i.field_name === rf && i.issue_type === "missing_required"
        );
        if (!alreadyFlagged) {
          issuesToInsert.push({
            software_proposal_id,
            field_name: rf,
            issue_type: "missing_required",
            extracted_value: null,
            status: "open",
          });
        }
      }
    }

    if (issuesToInsert.length > 0) {
      const { error: issuesErr } = await adminClient
        .from("extraction_issues")
        .insert(issuesToInsert);

      if (issuesErr) {
        console.error("Error inserting issues:", issuesErr);
      }
    }

    return jsonResponse({
      success: true,
      extraction_confidence: overallConfidence,
      items_extracted: items.length,
      issues_created: issuesToInsert.length,
    });
  } catch (e) {
    console.error("extract-software-proposal error:", e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Erro interno" },
      500
    );
  }
});
