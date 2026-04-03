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

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Support both user JWT and service-role key for server-to-server calls (auto-extraction)
    const token = authHeader.replace("Bearer ", "");
    const isServiceRole = token === serviceRoleKey;

    let userId: string;
    let userClient: ReturnType<typeof createClient>;

    if (isServiceRole) {
      // Server-to-server call (e.g. from email-inbox-sync auto-extraction)
      // Use adminClient which bypasses RLS
      userClient = adminClient;
      userId = "system";
    } else {
      userClient = createClient(supabaseUrl, supabaseAnon, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userError } = await userClient.auth.getUser();
      if (userError || !user) {
        return jsonResponse({ error: "Não autorizado" }, 401);
      }
      userId = user.id;
    }

    // --- Parse request ---
    const { software_proposal_id } = await req.json();
    if (!software_proposal_id) {
      return jsonResponse({ error: "software_proposal_id é obrigatório" }, 400);
    }

    // --- Fetch proposal record ---
    const { data: proposal, error: fetchErr } = await userClient
      .from("software_proposals")
      .select("*")
      .eq("id", software_proposal_id)
      .single();

    if (fetchErr || !proposal) {
      return jsonResponse({ error: "Proposta não encontrada ou sem permissão" }, 404);
    }

    // For system calls, use the proposal's uploaded_by as the acting user
    if (isServiceRole && proposal.uploaded_by) {
      userId = proposal.uploaded_by;
    }

    // --- Update status to extracting ---
    await userClient
      .from("software_proposals")
      .update({ status: "extracting", updated_at: new Date().toISOString() })
      .eq("id", software_proposal_id);

    // --- Download PDF from private bucket via signed URL ---
    const filePath = proposal.file_url;
    const { data: signedData, error: signErr } = await adminClient.storage
      .from("software-proposal-pdfs")
      .createSignedUrl(filePath, 300);

    if (signErr || !signedData?.signedUrl) {
      await userClient
        .from("software_proposals")
        .update({ status: "error", updated_at: new Date().toISOString() })
        .eq("id", software_proposal_id);
      console.error("Storage sign error:", signErr);
      return jsonResponse({ error: "Erro ao acessar arquivo PDF" }, 500);
    }

    const pdfResponse = await fetch(signedData.signedUrl);
    if (!pdfResponse.ok) {
      await userClient
        .from("software_proposals")
        .update({ status: "error", updated_at: new Date().toISOString() })
        .eq("id", software_proposal_id);
      return jsonResponse({ error: "Erro ao baixar arquivo PDF" }, 500);
    }

    const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
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
- The HEADER typically contains a "Unidade TOTVS" field, usually below the emission/issue date. Extract this as totvs_unit_name.

SALES TEAM EXTRACTION:
- The document typically contains a section "Conte com o apoio da nossa equipe:" or similar.
- Extract the following sales team members with their names AND codes (e.g., "T25034"):
  - "Gerente de Vendas" → gsn (Gerente de Vendas)
  - "Executivo(a) de Vendas" → esn (Executivo de Vendas)
  - "Arquiteto(a) de Solução" → arquiteto (Arquiteto de Solução)
- Also extract the "Segmento" value (e.g., "SERVICOS", "MANUFATURA", "VAREJO").
- The code typically appears in parentheses like "(T25034)" or after the name like "T30816".

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
- The client_name appears after "Cliente:" or "CLIENTE:" in the header section. It often has a code in parentheses at the end like "EMPRESA LTDA (DBLJZO)" — extract the code separately as client_code.
- The document body (usually the contractual section) contains the full client legal details including CNPJ and address. Extract these as client_cnpj and client_address.
- proposal_number appears after "Proposta N°:" in the header.
- totvs_unit_name appears after "Unidade TOTVS:" or similar label in the header.

CLIENT DATA EXTRACTION:
- client_name: The full legal name WITHOUT the code in parentheses (e.g., "ORLETTI SERVICOS ADMINISTRATIVOS LTDA - EPP").
- client_code: The code in parentheses after the client name in the header (e.g., "DBLJZO"). This is NOT the CNPJ.
- client_cnpj: Found in the contractual body, typically after "CNPJ/MF sob o n.º" or "inscrito no CNPJ" (e.g., "10.221.365/0001-08").
- client_address: The full address found in the contractual body near the client name and CNPJ.

RECURRENCE MAPPING for items:
- "Gratuito" or one-time payment → "one_time"
- "Mensal" → "monthly"  
- "90 DIAS DDL" or quarterly → "quarterly"
- "Anual" → "annual"
- "Sob Consumo" → "usage_based"
- "Medição", "Por medição", measurement-based → "measurement"
- If unclear → "other"

COST CLASSIFICATION:
- CDU (Cessão de Direito de Uso), Adesão, Setup → "capex"
- SMS (Serviço de Manutenção), Cloud subscriptions, recurring licenses → "opex"
- Mixed or unclear → "mixed"
- Other / not classifiable → "other"

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
    "client_name": { "value": <string|null, full legal name without code>, "confidence": <number> },
    "client_code": { "value": <string|null, code from parentheses e.g. "DBLJZO">, "confidence": <number> },
    "client_cnpj": { "value": <string|null, CNPJ from contractual body e.g. "10.221.365/0001-08">, "confidence": <number> },
    "client_address": { "value": <string|null, full address from contractual body>, "confidence": <number> },
    "totvs_unit_name": { "value": <string|null>, "confidence": <number> },
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
  "sales_team": {
    "gsn_name": { "value": <string|null, full name>, "confidence": <number> },
    "gsn_code": { "value": <string|null, e.g. "T25034">, "confidence": <number> },
    "esn_name": { "value": <string|null, full name>, "confidence": <number> },
    "esn_code": { "value": <string|null, e.g. "T29183">, "confidence": <number> },
    "arquiteto_name": { "value": <string|null, full name>, "confidence": <number> },
    "arquiteto_code": { "value": <string|null, e.g. "T30816">, "confidence": <number> },
    "segment": { "value": <string|null>, "confidence": <number> }
  },
  "items": [
    {
      "description": <string>,
      "quantity": <number>,
      "unit_price": <number>,
      "total_price": <number>,
      "recurrence": <"one_time"|"monthly"|"quarterly"|"annual"|"usage_based"|"measurement"|"other">,
      "cost_classification": <"capex"|"opex"|"mixed"|"other">,
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
                text: `Extract all structured data from this software proposal PDF. File: ${proposal.file_name}. Focus on commercial data (items, values, dates, payment conditions) and ignore signature protocol pages. Also extract the TOTVS unit name from the header.`,
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

    const VALID_ISSUE_TYPES = ["low_confidence", "missing_required", "ambiguous_value", "format_error"];
    const normalizeIssueType = (t: string) => VALID_ISSUE_TYPES.includes(t) ? t : "ambiguous_value";
    const ISSUE_STATUS_OPEN = "open";
    const val = (field: any) => field?.value ?? null;

    const issuesToInsert: any[] = [];

    // ===== LOAD PREVIOUS CORRECTIONS FOR LEARNING =====
    // Query extraction_corrections_log joined with software_proposals to learn from past manual corrections
    const { data: previousCorrections } = await adminClient
      .from("extraction_corrections_log")
      .select("field_path, original_value, corrected_value, software_proposal_id, item_id")
      .not("corrected_value", "is", null)
      .order("corrected_at", { ascending: false });

    // Build header-level correction map: field_path → Map<raw_value_from_proposal, corrected_uuid>
    // For header fields (unit_id, client_id, esn_id, gsn_id, arquiteto_id, segment_id),
    // we need to correlate the raw_* name from the proposal where the correction was made
    const headerCorrectionFields = ["unit_id", "client_id", "esn_id", "gsn_id", "arquiteto_id", "segment_id"];
    const headerCorrections = (previousCorrections || []).filter(
      (c) => headerCorrectionFields.includes(c.field_path) && c.corrected_value && !c.item_id
    );

    // Fetch the raw names from the proposals that had corrections, to match by similarity
    let correctionProposalRawData: Map<string, any> = new Map();
    if (headerCorrections.length > 0) {
      const correctionProposalIds = [...new Set(headerCorrections.map((c) => c.software_proposal_id))];
      // Fetch in batches of 50
      for (let i = 0; i < correctionProposalIds.length; i += 50) {
        const batch = correctionProposalIds.slice(i, i + 50);
        const { data: corrProposals } = await adminClient
          .from("software_proposals")
          .select("id, raw_unit_name, raw_client_name, raw_gsn_name, raw_esn_name, raw_arquiteto_name, raw_segment_name")
          .in("id", batch);
        for (const cp of corrProposals || []) {
          correctionProposalRawData.set(cp.id, cp);
        }
      }
    }

    // Helper: normalize text for similarity comparison
    const normText = (s: string | null) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

    // Build a lookup: for each correctable header field, map raw_name → corrected_value (UUID)
    // The key insight: if proposal X had raw_unit_name="TOTVS ABC" and someone corrected unit_id to "uuid-123",
    // then for a new proposal with the same raw_unit_name, we can auto-apply unit_id="uuid-123"
    const fieldToRawColumn: Record<string, string> = {
      unit_id: "raw_unit_name",
      client_id: "raw_client_name",
      gsn_id: "raw_gsn_name",
      esn_id: "raw_esn_name",
      arquiteto_id: "raw_arquiteto_name",
      segment_id: "raw_segment_name",
    };

    const learnedCorrections: Map<string, Map<string, string>> = new Map();
    for (const field of headerCorrectionFields) {
      learnedCorrections.set(field, new Map());
    }

    for (const corr of headerCorrections) {
      const rawCol = fieldToRawColumn[corr.field_path];
      if (!rawCol) continue;
      const proposalData = correctionProposalRawData.get(corr.software_proposal_id);
      if (!proposalData) continue;
      const rawValue = normText(proposalData[rawCol]);
      if (rawValue && corr.corrected_value) {
        const fieldMap = learnedCorrections.get(corr.field_path)!;
        // First correction wins (most recent, since ordered desc)
        if (!fieldMap.has(rawValue)) {
          fieldMap.set(rawValue, corr.corrected_value);
        }
      }
    }

    // Build item-level correction map: normalized description → { field_path: corrected_value }
    const itemCorrections = (previousCorrections || []).filter((c) => c.item_id);
    const itemCorrectionItemIds = [...new Set(itemCorrections.map((c) => c.item_id).filter(Boolean))];
    const itemDescriptionMap: Map<string, string> = new Map(); // item_id → description

    if (itemCorrectionItemIds.length > 0) {
      for (let i = 0; i < itemCorrectionItemIds.length; i += 50) {
        const batch = itemCorrectionItemIds.slice(i, i + 50);
        const { data: corrItems } = await adminClient
          .from("software_proposal_items")
          .select("id, description")
          .in("id", batch);
        for (const ci of corrItems || []) {
          itemDescriptionMap.set(ci.id, ci.description);
        }
      }
    }

    // Build: normalized_description → { field: corrected_value }
    const learnedItemCorrections: Map<string, Record<string, string>> = new Map();
    for (const corr of itemCorrections) {
      if (!corr.item_id || !corr.corrected_value) continue;
      const desc = itemDescriptionMap.get(corr.item_id);
      if (!desc) continue;
      const normDesc = normText(desc);
      if (!learnedItemCorrections.has(normDesc)) {
        learnedItemCorrections.set(normDesc, {});
      }
      const existing = learnedItemCorrections.get(normDesc)!;
      if (!existing[corr.field_path]) {
        existing[corr.field_path] = corr.corrected_value;
      }
    }

    // Helper: find learned correction for a header field
    function findLearnedHeaderCorrection(fieldPath: string, currentRawValue: string | null): string | null {
      if (!currentRawValue) return null;
      const fieldMap = learnedCorrections.get(fieldPath);
      if (!fieldMap || fieldMap.size === 0) return null;
      const normalized = normText(currentRawValue);
      // Exact match first
      if (fieldMap.has(normalized)) return fieldMap.get(normalized)!;
      // Fuzzy: check if any key contains or is contained in the current value
      for (const [key, value] of fieldMap) {
        if (key.length > 3 && normalized.length > 3) {
          if (normalized.includes(key) || key.includes(normalized)) return value;
        }
      }
      return null;
    }

    // Helper: find learned corrections for an item by description
    function findLearnedItemCorrections(description: string): Record<string, string> | null {
      const normalized = normText(description);
      // Exact match
      if (learnedItemCorrections.has(normalized)) return learnedItemCorrections.get(normalized)!;
      // Fuzzy: contains match
      for (const [key, value] of learnedItemCorrections) {
        if (key.length > 5 && normalized.length > 5) {
          if (normalized.includes(key) || key.includes(normalized)) return value;
        }
      }
      return null;
    }

    let learnedCorrectionsApplied = 0;

    console.log(`Loaded ${headerCorrections.length} header corrections and ${itemCorrections.length} item corrections for learning`);

    // ===== MASTER DATA MATCHING =====

    // --- Match client ---
    const rawClientName = val(header.client_name);
    const rawClientCode = val(header.client_code);
    const rawClientCnpj = val(header.client_cnpj);
    const rawClientAddress = val(header.client_address);
    let matchedClientId: string | null = null;
    let matchedClientName: string | null = null;
    let clientAutoCreated = false;

    if (rawClientName || rawClientCode || rawClientCnpj) {
      // Build search clauses
      const orClauses: string[] = [];
      if (rawClientName) orClauses.push(`name.ilike.%${rawClientName}%`);
      if (rawClientCnpj) orClauses.push(`cnpj.ilike.%${rawClientCnpj}%`);
      if (rawClientCode) orClauses.push(`code.ilike.%${rawClientCode}%`);

      const { data: clientMatches } = await adminClient
        .from("clients")
        .select("id, name, code, cnpj")
        .or(orClauses.join(","))
        .limit(10);

      if (clientMatches && clientMatches.length > 0) {
        // Priority 1: exact CNPJ match (most reliable)
        const cnpjMatch = rawClientCnpj
          ? clientMatches.find((c) => c.cnpj && c.cnpj.replace(/\D/g, "") === rawClientCnpj.replace(/\D/g, ""))
          : null;
        // Priority 2: exact code match
        const codeMatch = !cnpjMatch && rawClientCode
          ? clientMatches.find((c) => c.code && c.code.toLowerCase() === rawClientCode.toLowerCase())
          : null;
        // Priority 3: exact name match
        const nameMatch = !cnpjMatch && !codeMatch && rawClientName
          ? clientMatches.find((c) => c.name.toLowerCase() === rawClientName.toLowerCase())
          : null;

        const bestMatch = cnpjMatch || codeMatch || nameMatch;
        if (bestMatch) {
          matchedClientId = bestMatch.id;
          matchedClientName = bestMatch.name;
        } else if (clientMatches.length === 1) {
          matchedClientId = clientMatches[0].id;
          matchedClientName = clientMatches[0].name;
        } else {
          // Multiple ambiguous matches — try learned correction
          const learnedClient = findLearnedHeaderCorrection("client_id", rawClientName);
          if (learnedClient) {
            matchedClientId = learnedClient;
            learnedCorrectionsApplied++;
            console.log(`[LEARNING] Client resolved via previous correction: ${rawClientName} → ${learnedClient}`);
          } else {
            issuesToInsert.push({
              software_proposal_id,
              field_name: "client_name",
              issue_type: "ambiguous_value",
              extracted_value: rawClientName,
              status: ISSUE_STATUS_OPEN,
            });
          }
        }
      }
      // No match found → auto-create client if we have minimum data (name + code or CNPJ)
      if (!matchedClientId && !issuesToInsert.some((i) => i.field_name === "client_name" && i.issue_type === "ambiguous_value")) {
        const clientCode = rawClientCode || (rawClientCnpj ? rawClientCnpj.replace(/\D/g, "").substring(0, 10) : `AUTO_${Date.now()}`);
        const clientCnpj = rawClientCnpj || `00.000.000/0000-00`;
        const clientName = rawClientName || "Cliente não identificado";

        console.log(`Auto-creating client: ${clientName} (${clientCode})`);

        const { data: newClient, error: createClientErr } = await adminClient
          .from("clients")
          .insert({
            name: clientName,
            code: clientCode,
            cnpj: clientCnpj,
            address: rawClientAddress || null,
            // unit_id, esn_id, gsn_id will be set after matching below
          })
          .select("id, name")
          .single();

        if (!createClientErr && newClient) {
          matchedClientId = newClient.id;
          matchedClientName = newClient.name;
          clientAutoCreated = true;
          console.log(`Client auto-created: ${newClient.id}`);
        } else {
          console.error("Error auto-creating client:", createClientErr);
          issuesToInsert.push({
            software_proposal_id,
            field_name: "client_name",
            issue_type: "missing_required",
            extracted_value: `Falha ao criar cliente: ${clientName} — ${createClientErr?.message || "erro desconhecido"}`,
            status: ISSUE_STATUS_OPEN,
          });
        }
      }
    }

    // --- Match TOTVS unit ---
    const rawUnitName = val(header.totvs_unit_name);
    let matchedUnitId: string | null = null;
    let matchedUnitName: string | null = null;

    if (rawUnitName) {
      // Helper: remove accents for comparison
      const removeAccents = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const norm = (s: string) => removeAccents(s.trim().toLowerCase());

      // Parse embedded code from patterns like "TOTVS ESPIRITO SANTO (TSE341)"
      const codeMatch = rawUnitName.match(/\(([A-Z]{2,5}\d{2,5})\)/i);
      const embeddedCode = codeMatch ? codeMatch[1].trim() : null;
      // Text part without the code in parentheses
      const textPart = rawUnitName.replace(/\s*\([A-Z]{2,5}\d{2,5}\)\s*/i, "").trim();

      const normalizedText = norm(textPart);
      const normalizedFull = norm(rawUnitName);

      // Build OR filter with multiple search terms
      const searchTerms: string[] = [];
      const addTerm = (t: string) => {
        searchTerms.push(`name.ilike.%${t}%`);
        searchTerms.push(`code.ilike.%${t}%`);
        searchTerms.push(`city.ilike.%${t}%`);
        searchTerms.push(`descricao_complementar.ilike.%${t}%`);
      };
      addTerm(textPart);
      if (embeddedCode) {
        addTerm(embeddedCode);
      }

      const { data: unitMatches } = await adminClient
        .from("unit_info")
        .select("id, name, code, city, descricao_complementar")
        .or(searchTerms.join(","))
        .limit(10);

      if (unitMatches && unitMatches.length > 0) {
        // Priority 1: exact code match (most reliable, e.g. TSE341)
        const exactCode = embeddedCode
          ? unitMatches.find((u) => u.code && norm(u.code) === norm(embeddedCode))
          : null;
        // Priority 2: exact name match (accent-insensitive)
        const exactName = !exactCode && unitMatches.find(
          (u) => norm(u.name) === normalizedText || norm(u.name) === normalizedFull
        );
        // Priority 3: exact descricao_complementar match (accent-insensitive)
        const descMatch = !exactCode && !exactName && unitMatches.find(
          (u) => u.descricao_complementar && (norm(u.descricao_complementar) === normalizedText || norm(u.descricao_complementar) === normalizedFull)
        );
        // Priority 4: code contains match (partial)
        const codePartial = !exactCode && !exactName && !descMatch && embeddedCode
          ? unitMatches.find((u) => u.code && u.code.toLowerCase().includes(embeddedCode.toLowerCase()))
          : null;

        const bestMatch = exactCode || exactName || descMatch || codePartial;

        if (bestMatch) {
          matchedUnitId = bestMatch.id;
          matchedUnitName = bestMatch.name;
        } else if (unitMatches.length === 1) {
          matchedUnitId = unitMatches[0].id;
          matchedUnitName = unitMatches[0].name;
        } else {
          // Try learned correction before creating issue
          const learnedUnit = findLearnedHeaderCorrection("unit_id", rawUnitName);
          if (learnedUnit) {
            matchedUnitId = learnedUnit;
            learnedCorrectionsApplied++;
            console.log(`[LEARNING] Unit resolved via previous correction: ${rawUnitName} → ${learnedUnit}`);
          } else {
            issuesToInsert.push({
              software_proposal_id,
              field_name: "totvs_unit_name",
              issue_type: "ambiguous_value",
              extracted_value: rawUnitName,
              status: ISSUE_STATUS_OPEN,
            });
          }
        }
      } else {
        // No DB matches at all — try learned correction
        const learnedUnit = findLearnedHeaderCorrection("unit_id", rawUnitName);
        if (learnedUnit) {
          matchedUnitId = learnedUnit;
          learnedCorrectionsApplied++;
          console.log(`[LEARNING] Unit resolved via previous correction (no DB match): ${rawUnitName} → ${learnedUnit}`);
        } else {
          issuesToInsert.push({
            software_proposal_id,
            field_name: "totvs_unit_name",
            issue_type: "missing_required",
            extracted_value: `Unidade não encontrada: ${rawUnitName}`,
            status: ISSUE_STATUS_OPEN,
          });
        }
      }
    }

    // --- Match Sales Team members ---
    const salesTeam = extracted.sales_team || {};

    // Helper: match a sales_team member by name and/or code, with learned correction fallback
    const matchSalesTeamMember = async (
      rawName: string | null,
      rawCode: string | null,
      fieldLabel: string,
      learnedFieldId: string,
      rawFullName: string | null,
      roleFilter?: string[],
    ): Promise<string | null> => {
      if (!rawName && !rawCode) return null;

      const orClauses: string[] = [];
      if (rawName) orClauses.push(`name.ilike.%${rawName}%`);
      if (rawCode) orClauses.push(`code.ilike.%${rawCode}%`);

      let query = adminClient.from("sales_team").select("id, name, code, role");
      if (orClauses.length > 0) query = query.or(orClauses.join(","));
      const { data: matches } = await query.limit(10);

      if (!matches || matches.length === 0) {
        // Try learned correction before creating issue
        const learned = findLearnedHeaderCorrection(learnedFieldId, rawFullName || rawName);
        if (learned) {
          learnedCorrectionsApplied++;
          console.log(`[LEARNING] ${fieldLabel} resolved via previous correction: ${rawFullName || rawName} → ${learned}`);
          return learned;
        }
        issuesToInsert.push({
          software_proposal_id,
          field_name: fieldLabel,
          issue_type: "missing_required",
          extracted_value: `${rawName || ""}${rawCode ? ` (${rawCode})` : ""} — não encontrado`,
          status: ISSUE_STATUS_OPEN,
        });
        return null;
      }

      // Try exact code match first
      if (rawCode) {
        const codeMatch = matches.find((m) => m.code.toLowerCase() === rawCode.toLowerCase());
        if (codeMatch) return codeMatch.id;
      }

      // Try exact name match
      if (rawName) {
        const nameMatch = matches.find((m) => m.name.toLowerCase() === rawName.toLowerCase());
        if (nameMatch) return nameMatch.id;
      }

      // If only one result, use it
      if (matches.length === 1) return matches[0].id;

      // Ambiguous — try learned correction
      const learned = findLearnedHeaderCorrection(learnedFieldId, rawFullName || rawName);
      if (learned) {
        learnedCorrectionsApplied++;
        console.log(`[LEARNING] ${fieldLabel} resolved via previous correction (ambiguous): ${rawFullName || rawName} → ${learned}`);
        return learned;
      }

      issuesToInsert.push({
        software_proposal_id,
        field_name: fieldLabel,
        issue_type: "ambiguous_value",
        extracted_value: `${rawName || ""}${rawCode ? ` (${rawCode})` : ""} — múltiplos resultados`,
        status: ISSUE_STATUS_OPEN,
      });
      return null;
    };

    const rawGsnName = val(salesTeam.gsn_name);
    const rawGsnCode = val(salesTeam.gsn_code);
    const rawEsnName = val(salesTeam.esn_name);
    const rawEsnCode = val(salesTeam.esn_code);
    const rawArquitetoName = val(salesTeam.arquiteto_name);
    const rawArquitetoCode = val(salesTeam.arquiteto_code);
    const rawSegmentName = val(salesTeam.segment);

    const rawGsnFull = rawGsnName ? `${rawGsnName}${rawGsnCode ? ` (${rawGsnCode})` : ""}` : null;
    const rawEsnFull = rawEsnName ? `${rawEsnName}${rawEsnCode ? ` (${rawEsnCode})` : ""}` : null;
    const rawArquitetoFull = rawArquitetoName ? `${rawArquitetoName}${rawArquitetoCode ? ` (${rawArquitetoCode})` : ""}` : null;

    const matchedGsnId = await matchSalesTeamMember(rawGsnName, rawGsnCode, "gsn", "gsn_id", rawGsnFull);
    const matchedEsnId = await matchSalesTeamMember(rawEsnName, rawEsnCode, "esn", "esn_id", rawEsnFull);
    const matchedArquitetoId = await matchSalesTeamMember(rawArquitetoName, rawArquitetoCode, "arquiteto", "arquiteto_id", rawArquitetoFull);

    // --- Match/auto-create Segment ---
    let matchedSegmentId: string | null = null;
    if (rawSegmentName) {
      const normalizedSegment = rawSegmentName.trim().toUpperCase();
      // Try to find existing segment
      const { data: segmentMatches } = await adminClient
        .from("software_segments")
        .select("id, name")
        .ilike("name", normalizedSegment)
        .limit(1);

      if (segmentMatches && segmentMatches.length > 0) {
        matchedSegmentId = segmentMatches[0].id;
      } else {
        // Auto-create segment (like catalog items)
        const { data: newSegment } = await adminClient
          .from("software_segments")
          .insert({ name: normalizedSegment, is_active: true })
          .select("id")
          .single();
        if (newSegment) {
          matchedSegmentId = newSegment.id;
        }
      }
    }

    // --- Update auto-created client with matched unit/esn/gsn ---
    if (clientAutoCreated && matchedClientId) {
      const clientUpdate: Record<string, any> = {};
      if (matchedUnitId) clientUpdate.unit_id = matchedUnitId;
      if (matchedEsnId) clientUpdate.esn_id = matchedEsnId;
      if (matchedGsnId) clientUpdate.gsn_id = matchedGsnId;
      if (Object.keys(clientUpdate).length > 0) {
        await adminClient
          .from("clients")
          .update(clientUpdate)
          .eq("id", matchedClientId);
        console.log(`Auto-created client ${matchedClientId} updated with:`, clientUpdate);
      }
    }

    // --- Update proposal record with extracted data + master data links ---
    await userClient
      .from("software_proposals")
      .update({
        status: "extracted",
        proposal_number: extracted.proposal_number || null,
        vendor_name: val(header.vendor_name),
        client_name: val(header.client_name),
        raw_client_name: rawClientName,
        raw_unit_name: rawUnitName,
        client_id: matchedClientId,
        unit_id: matchedUnitId,
        gsn_id: matchedGsnId,
        esn_id: matchedEsnId,
        arquiteto_id: matchedArquitetoId,
        segment_id: matchedSegmentId,
        raw_gsn_name: rawGsnName ? `${rawGsnName}${rawGsnCode ? ` (${rawGsnCode})` : ""}` : null,
        raw_esn_name: rawEsnName ? `${rawEsnName}${rawEsnCode ? ` (${rawEsnCode})` : ""}` : null,
        raw_arquiteto_name: rawArquitetoName ? `${rawArquitetoName}${rawArquitetoCode ? ` (${rawArquitetoCode})` : ""}` : null,
        raw_segment_name: rawSegmentName,
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
    await adminClient
      .from("software_proposal_items")
      .delete()
      .eq("software_proposal_id", software_proposal_id);

    await adminClient
      .from("extraction_issues")
      .delete()
      .eq("software_proposal_id", software_proposal_id);

    // --- Load extraction rules ---
    const { data: extractionRules } = await adminClient
      .from("extraction_rules")
      .select("*")
      .eq("is_active", true)
      .order("priority", { ascending: true });

    const activeRules = extractionRules || [];
    const ruleApplications: Array<{
      rule_id: string;
      software_proposal_id: string;
      item_id: string | null;
      field_name: string;
      original_value: string | null;
      applied_value: string;
    }> = [];

    // Rule condition matcher
    function matchesCondition(text: string, condType: string, condValue: string): boolean {
      const t = (text || "").toLowerCase();
      const v = (condValue || "").toLowerCase();
      switch (condType) {
        case "contains": return t.includes(v);
        case "not_contains": return !t.includes(v);
        case "equals": return t === v;
        case "starts_with": return t.startsWith(v);
        case "ends_with": return t.endsWith(v);
        case "regex": try { return new RegExp(condValue, "i").test(text || ""); } catch { return false; }
        case "greater_than": return parseFloat(text) > parseFloat(condValue);
        case "less_than": return parseFloat(text) < parseFloat(condValue);
        default: return false;
      }
    }

    // Apply rules to an item row (mutates in place, returns applied rule IDs)
    function applyItemRules(itemRow: any, desc: string): void {
      for (const rule of activeRules) {
        if (rule.scope !== "item") continue;
        if (!matchesCondition(desc, rule.condition_type, rule.condition_value)) continue;
        const targetField = rule.target_field;
        const originalValue = itemRow[targetField] != null ? String(itemRow[targetField]) : null;
        switch (rule.action_type) {
          case "set_value":
            itemRow[targetField] = rule.action_value;
            break;
          case "append":
            itemRow[targetField] = (itemRow[targetField] || "") + rule.action_value;
            break;
          case "replace":
            if (typeof itemRow[targetField] === "string") {
              itemRow[targetField] = itemRow[targetField].replace(
                new RegExp(rule.condition_value, "gi"),
                rule.action_value
              );
            }
            break;
          case "flag_issue":
            issuesToInsert.push({
              software_proposal_id,
              field_name: `rule:${rule.name} → ${targetField}`,
              issue_type: "low_confidence",
              extracted_value: rule.action_value,
              status: ISSUE_STATUS_OPEN,
            });
            break;
        }
        ruleApplications.push({
          rule_id: rule.id,
          software_proposal_id,
          item_id: null, // will be set after insert
          field_name: targetField,
          original_value: originalValue,
          applied_value: String(itemRow[targetField] ?? rule.action_value),
        });
      }
    }

    // --- Load catalog items + aliases for matching ---
    const { data: catalogItems } = await adminClient
      .from("software_catalog_items")
      .select("id, name, vendor_name, is_active")
      .eq("is_active", true);

    const { data: catalogAliases } = await adminClient
      .from("software_catalog_aliases")
      .select("id, catalog_item_id, alias");

    // Build lookup maps for item matching
    const catalogLookup: Array<{ id: string; name: string; nameLower: string }> = (catalogItems || []).map((c) => ({
      id: c.id,
      name: c.name,
      nameLower: c.name.toLowerCase().trim(),
    }));
    const aliasLookup: Map<string, string> = new Map();
    for (const a of catalogAliases || []) {
      aliasLookup.set(a.alias.toLowerCase().trim(), a.catalog_item_id);
    }

    // --- Insert extracted items with catalog matching ---
    const validRecurrences = ["one_time", "monthly", "quarterly", "annual", "usage_based", "measurement", "other"];
    const validClassifications = ["capex", "opex", "mixed", "other"];
    const validItemTypes = ["license", "service", "support", "infrastructure", "other"];

    if (items.length > 0) {
      const itemRows = [];
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const desc = (item.description || "Item sem descrição").trim();
        const descLower = desc.toLowerCase();

        // Try to match catalog item
        let catalogItemId: string | null = null;

        // 1. Check alias exact match
        if (aliasLookup.has(descLower)) {
          catalogItemId = aliasLookup.get(descLower)!;
        }

        // 2. Check catalog name exact match
        if (!catalogItemId) {
          const exactMatch = catalogLookup.find((c) => c.nameLower === descLower);
          if (exactMatch) {
            catalogItemId = exactMatch.id;
          }
        }

        // 3. Check catalog name contains / is contained
        if (!catalogItemId) {
          const partialMatch = catalogLookup.find(
            (c) => descLower.includes(c.nameLower) || c.nameLower.includes(descLower)
          );
          if (partialMatch) {
            catalogItemId = partialMatch.id;
          }
        }

        // 4. If no match, auto-create catalog item and link
        if (!catalogItemId) {
          const { data: newCatalogItem, error: createErr } = await adminClient
            .from("software_catalog_items")
            .insert({
              name: desc,
              vendor_name: val(header.vendor_name),
              category: "other",
              default_recurrence: (() => { const r = validRecurrences.includes(item.recurrence) ? item.recurrence : "other"; return r === "usage_based" ? "monthly" : r; })(),
              default_cost_classification: validClassifications.includes(item.cost_classification) ? item.cost_classification : "opex",
              is_active: true,
              created_by: userId,
            })
            .select("id")
            .single();

          if (!createErr && newCatalogItem) {
            catalogItemId = newCatalogItem.id;
            // Also create alias for future matching
            await adminClient.from("software_catalog_aliases").insert({
              catalog_item_id: newCatalogItem.id,
              alias: descLower,
              source: "auto_extraction",
            });
          }
        }

        const itemRow = {
          software_proposal_id,
          description: desc,
          quantity: item.quantity ?? 1,
          unit_price: item.unit_price ?? 0,
          total_price: item.total_price ?? 0,
          recurrence: validRecurrences.includes(item.recurrence) ? item.recurrence : "other",
          cost_classification: validClassifications.includes(item.cost_classification) ? item.cost_classification : "opex",
          item_type: validItemTypes.includes(item.item_type) ? item.item_type : "other",
          confidence_score: item.confidence_score ?? 0,
          sort_order: idx,
          notes: item.notes || null,
          catalog_item_id: catalogItemId,
        };

        // Apply extraction rules to item
        applyItemRules(itemRow, desc);

        // Apply learned item corrections (from previous manual edits on similar items)
        const learnedItemCorr = findLearnedItemCorrections(desc);
        if (learnedItemCorr) {
          const applyableFields = ["recurrence", "cost_classification", "item_type"];
          for (const field of applyableFields) {
            if (learnedItemCorr[field]) {
              const oldVal = itemRow[field as keyof typeof itemRow];
              (itemRow as any)[field] = learnedItemCorr[field];
              learnedCorrectionsApplied++;
              console.log(`[LEARNING] Item "${desc.substring(0, 50)}" field ${field}: ${oldVal} → ${learnedItemCorr[field]}`);
            }
          }
        }

        itemRows.push(itemRow);
      }

      const { error: itemsErr } = await adminClient
        .from("software_proposal_items")
        .insert(itemRows);

      if (itemsErr) {
        console.error("Error inserting items:", itemsErr);
      }
    }

    // --- Log rule applications ---
    if (ruleApplications.length > 0) {
      // Clear previous rule applications for re-extraction
      await adminClient
        .from("extraction_rule_applications")
        .delete()
        .eq("software_proposal_id", software_proposal_id);

      const { error: ruleAppErr } = await adminClient
        .from("extraction_rule_applications")
        .insert(ruleApplications);

      if (ruleAppErr) {
        console.error("Error inserting rule applications:", ruleAppErr);
      }
    }

    // --- Create extraction issues ---
    // Issues reported by AI
    for (const issue of aiIssues) {
      issuesToInsert.push({
        software_proposal_id,
        field_name: issue.field_name,
        issue_type: normalizeIssueType(issue.issue_type || "low_confidence"),
        extracted_value: issue.extracted_value || null,
        status: ISSUE_STATUS_OPEN,
      });
    }

    // Auto-create issues for low-confidence header fields
    for (const [fieldName, fieldData] of Object.entries(header)) {
      if (fieldName === "totvs_unit_name") continue; // handled separately above
      const fd = fieldData as any;
      if (fd?.confidence !== undefined && fd.confidence < confidenceThreshold && fd.confidence > 0) {
        issuesToInsert.push({
          software_proposal_id,
          field_name: fieldName,
          issue_type: fd.confidence < autoCreateIssuesBelow ? "low_confidence" : "ambiguous_value",
          extracted_value: fd.value != null ? String(fd.value) : null,
          status: ISSUE_STATUS_OPEN,
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
          status: ISSUE_STATUS_OPEN,
        });
      }
    }

    // Check for missing required fields
    const requiredFields = ["vendor_name", "client_name", "total_value"];
    for (const rf of requiredFields) {
      const fd = header[rf] as any;
      if (!fd || fd.value == null || fd.value === "") {
        const alreadyFlagged = issuesToInsert.some(
          (i) => i.field_name === rf && (i.issue_type === "missing_required" || i.issue_type === "ambiguous_value")
        );
        if (!alreadyFlagged) {
          issuesToInsert.push({
            software_proposal_id,
            field_name: rf,
            issue_type: "missing_required",
            extracted_value: null,
            status: ISSUE_STATUS_OPEN,
          });
        }
      }
    }

    // Flag if total_value is 0 but items exist
    const totalVal = val(header.total_value);
    if (totalVal === 0 && items.length > 0) {
      const hasNonZeroItems = items.some((i: any) => (i.total_price ?? 0) > 0);
      if (hasNonZeroItems) {
        issuesToInsert.push({
          software_proposal_id,
          field_name: "total_value",
          issue_type: "ambiguous_value",
          extracted_value: "0",
          status: ISSUE_STATUS_OPEN,
        });
      }
    }

    // Flag items with zero price that are not explicitly free/gratuito
    for (const item of items) {
      if ((item.total_price ?? 0) === 0 && item.recurrence !== "one_time") {
        const desc = (item.description || "").toLowerCase();
        if (!desc.includes("gratuito") && !desc.includes("setup") && !desc.includes("excedente")) {
          issuesToInsert.push({
            software_proposal_id,
            field_name: `item: ${(item.description || "").substring(0, 80)}`,
            issue_type: "ambiguous_value",
            extracted_value: `total_price=0, recurrence=${item.recurrence}`,
            status: ISSUE_STATUS_OPEN,
          });
        }
      }
    }

    // Deduplicate issues by field_name + issue_type
    const uniqueIssues: any[] = [];
    const issueKeys = new Set<string>();
    for (const issue of issuesToInsert) {
      const key = `${issue.field_name}::${issue.issue_type}`;
      if (!issueKeys.has(key)) {
        issueKeys.add(key);
        uniqueIssues.push(issue);
      }
    }

    if (uniqueIssues.length > 0) {
      const { error: issuesErr } = await adminClient
        .from("extraction_issues")
        .insert(uniqueIssues);

      if (issuesErr) {
        console.error("Error inserting issues:", issuesErr);
      }
    }

    // --- Final proposal status transition ---
    const finalStatus = uniqueIssues.length > 0 ? "in_review" : "extracted";
    if (finalStatus !== "extracted") {
      await userClient
        .from("software_proposals")
        .update({ status: finalStatus, updated_at: new Date().toISOString() })
        .eq("id", software_proposal_id);
    }

    console.log(`Extraction complete: ${items.length} items, ${uniqueIssues.length} issues, ${learnedCorrectionsApplied} learned corrections applied`);

    return jsonResponse({
      success: true,
      status: finalStatus,
      extraction_confidence: overallConfidence,
      items_extracted: items.length,
      issues_created: uniqueIssues.length,
      learned_corrections_applied: learnedCorrectionsApplied,
      client_matched: !!matchedClientId,
      client_auto_created: clientAutoCreated,
      unit_matched: !!matchedUnitId,
      gsn_matched: !!matchedGsnId,
      esn_matched: !!matchedEsnId,
      arquiteto_matched: !!matchedArquitetoId,
      segment_matched: !!matchedSegmentId,
    });
  } catch (e) {
    console.error("extract-software-proposal error:", e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Erro interno" },
      500
    );
  }
});
