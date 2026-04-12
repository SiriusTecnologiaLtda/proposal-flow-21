import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

// ─── Google Auth (same pattern as generate-mit-doc) ─────────────────

async function getAccessTokenServiceAccount(serviceAccountKey: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      iss: serviceAccountKey.client_email,
      scope: "https://www.googleapis.com/auth/drive",
      aud: serviceAccountKey.token_uri,
      exp: now + 3600,
      iat: now,
    })
  );

  const signInput = `${header}.${payload}`;
  const pem = serviceAccountKey.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signInput)
  );
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${header}.${payload}.${sig}`;
  const tokenResp = await fetch(serviceAccountKey.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResp.ok)
    throw new Error(`Failed to get access token: ${await tokenResp.text()}`);
  const tokenData = await tokenResp.json();
  return tokenData.access_token;
}

// ─── HTML to text helper ────────────────────────────────────────────

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Main handler ───────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  let templateId: string | undefined;

  try {
    // ── Auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Não autorizado" }, 401);
    }

    if (!lovableApiKey) {
      return jsonResponse({ error: "LOVABLE_API_KEY não configurada" }, 500);
    }

    const body = await req.json();
    templateId = body.templateId;
    if (!templateId) {
      return jsonResponse({ error: "templateId é obrigatório" }, 400);
    }

    // ── Verify template exists ──
    const { data: template, error: tplErr } = await adminClient
      .from("scope_templates")
      .select("id, name")
      .eq("id", templateId)
      .maybeSingle();
    if (tplErr || !template) {
      return jsonResponse({ error: "Template não encontrado" }, 404);
    }

    // ── Mark as processing ──
    await adminClient.from("scope_template_knowledge").upsert(
      { template_id: templateId, extraction_status: "processing" },
      { onConflict: "template_id" }
    );

    // ── Fetch pending/error sources ──
    const { data: sources } = await adminClient
      .from("scope_template_sources")
      .select("*")
      .eq("template_id", templateId)
      .in("status", ["pending", "error"]);

    if (!sources || sources.length === 0) {
      await adminClient
        .from("scope_template_knowledge")
        .update({ extraction_status: "idle" })
        .eq("template_id", templateId);
      return jsonResponse({ message: "Nenhuma fonte pendente" });
    }

    // ── Fetch config ──
    const { data: knowledgeRow } = await adminClient
      .from("scope_template_knowledge")
      .select("generation_preprompt")
      .eq("template_id", templateId)
      .maybeSingle();

    const generationPreprompt = knowledgeRow?.generation_preprompt || "";

    const { data: xaiConfig } = await adminClient
      .from("xai_config")
      .select("model")
      .limit(1)
      .maybeSingle();
    const model = xaiConfig?.model || "google/gemini-2.5-flash";

    // ── Process each source ──
    const extractedContents: string[] = [];

    for (const source of sources) {
      try {
        // Mark processing
        await adminClient
          .from("scope_template_sources")
          .update({ status: "processing" })
          .eq("id", source.id);

        let content = "";

        if (source.source_type === "url") {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);
          try {
            const resp = await fetch(source.url, { signal: controller.signal });
            clearTimeout(timeout);
            const raw = await resp.text();
            content = htmlToText(raw).slice(0, 8000);
          } catch (fetchErr: any) {
            clearTimeout(timeout);
            throw new Error(`Erro ao acessar URL: ${fetchErr.message}`);
          }
        } else if (source.source_type === "drive_file") {
          // Get google integration
          const { data: gIntegration } = await adminClient
            .from("google_integrations")
            .select("service_account_key")
            .eq("is_default", true)
            .maybeSingle();

          if (!gIntegration?.service_account_key) {
            throw new Error(
              "Integração Google não configurada (service_account_key ausente)"
            );
          }

          const saKey =
            typeof gIntegration.service_account_key === "string"
              ? JSON.parse(gIntegration.service_account_key)
              : gIntegration.service_account_key;

          const accessToken = await getAccessTokenServiceAccount(saKey);
          const fileId = source.drive_file_id;

          // Try export as text first (works for Docs/Sheets)
          let exportResp = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );

          if (!exportResp.ok) {
            // Fallback: direct download
            exportResp = await fetch(
              `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (!exportResp.ok) {
              throw new Error(
                `Erro ao baixar arquivo do Drive: ${exportResp.status}`
              );
            }
          }

          content = (await exportResp.text()).slice(0, 8000);
        }

        if (content) {
          extractedContents.push(
            `=== Fonte: ${source.label} ===\n${content}`
          );
        }

        // Mark done
        await adminClient
          .from("scope_template_sources")
          .update({ status: "done", processed_at: new Date().toISOString() })
          .eq("id", source.id);
      } catch (sourceErr: any) {
        // Mark source as error, continue
        await adminClient
          .from("scope_template_sources")
          .update({
            status: "error",
            error_message: sourceErr.message?.slice(0, 500) || "Erro desconhecido",
          })
          .eq("id", source.id);
      }
    }

    // ── No content extracted? ──
    if (extractedContents.length === 0) {
      await adminClient
        .from("scope_template_knowledge")
        .update({ extraction_status: "error" })
        .eq("template_id", templateId);
      return jsonResponse(
        { error: "Nenhum conteúdo extraído das fontes" },
        422
      );
    }

    // ── Call AI ──
    const userContent = extractedContents.join("\n\n");

    let systemPrompt = `Você é um especialista em comunicação executiva B2B para o mercado de software empresarial TOTVS. Analise o conteúdo fornecido e extraia/construa informações executivas para enriquecer apresentações comerciais.

`;
    if (generationPreprompt.trim()) {
      systemPrompt += `DIRECIONAMENTOS DO ADMINISTRADOR:\n${generationPreprompt.trim()}\n\n`;
    }

    systemPrompt += `Responda APENAS com JSON válido, sem markdown, sem explicações:
{
  "commercial_description": "Parágrafo de 2-4 frases descrevendo em linguagem executiva o que este bloco de trabalho entrega ao cliente. Foco em transformação e resultado, não em tarefas ou tecnologia.",
  "executive_benefits": ["Benefício executivo 1 (máx 15 palavras)", "..."],
  "executive_notes": "Parágrafo curto com observações que enriquecem o discurso de vendas."
}

executive_benefits deve ter entre 3 e 6 itens.
Linguagem: português brasileiro, tom consultivo e executivo.`;

    const aiResp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          max_tokens: 1000,
          temperature: 0.3,
        }),
      }
    );

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      throw new Error(`Erro na API de IA: ${aiResp.status} - ${errText}`);
    }

    const aiData = await aiResp.json();
    const rawContent =
      aiData.choices?.[0]?.message?.content || "";

    // ── Parse JSON (strip markdown fences if present) ──
    const cleaned = rawContent
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    let parsed: {
      commercial_description: string;
      executive_benefits: string[];
      executive_notes: string;
    };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(`Falha ao interpretar resposta da IA: ${cleaned.slice(0, 200)}`);
    }

    // ── Save result ──
    await adminClient.from("scope_template_knowledge").upsert(
      {
        template_id: templateId,
        commercial_description: parsed.commercial_description || "",
        executive_benefits: parsed.executive_benefits || [],
        executive_notes: parsed.executive_notes || "",
        extraction_status: "done",
        extracted_at: new Date().toISOString(),
      },
      { onConflict: "template_id" }
    );

    return jsonResponse({ success: true });
  } catch (err: any) {
    console.error("extract-scope-knowledge error:", err);

    // Ensure status never stuck on 'processing'
    if (templateId) {
      try {
        await adminClient
          .from("scope_template_knowledge")
          .update({ extraction_status: "error" })
          .eq("template_id", templateId);
      } catch {
        // best effort
      }
    }

    return jsonResponse({ error: err.message || "Erro interno" }, 500);
  }
});
