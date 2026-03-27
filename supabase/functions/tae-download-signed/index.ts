import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { signatureId } = await req.json();
    if (!signatureId) {
      return jsonResponse({ error: "signatureId is required" }, 400);
    }

    // Get signature record
    const { data: sig, error: sigErr } = await supabase
      .from("proposal_signatures")
      .select("tae_document_id, tae_publication_id, proposal_id")
      .eq("id", signatureId)
      .single();

    if (sigErr || !sig) {
      return jsonResponse({ error: "Signature not found" }, 404);
    }

    if (!sig.tae_document_id) {
      return jsonResponse({ error: "No TAE document ID available" }, 400);
    }

    // Get TAE config
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: taeConfig } = await adminClient
      .from("tae_config")
      .select("base_url, service_user_email")
      .limit(1)
      .single();

    if (!taeConfig) {
      return jsonResponse({ error: "TAE not configured" }, 500);
    }

    const taePassword = Deno.env.get("TAE_SERVICE_USER_PASSWORD");
    if (!taePassword || !taeConfig.service_user_email) {
      return jsonResponse({ error: "TAE credentials missing" }, 500);
    }

    // Login to TAE (per diagram: POST /v3/auth/login)
    const loginRes = await fetch(`${taeConfig.base_url}/identityintegration/v3/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName: taeConfig.service_user_email, password: taePassword }),
    });

    if (!loginRes.ok) {
      const loginBody = await loginRes.text().catch(() => "");
      return jsonResponse({ error: `TAE login failed (${loginRes.status})`, details: loginBody.substring(0, 300) }, 502);
    }

    const loginBody = await loginRes.text();
    let loginData: any;
    try { loginData = JSON.parse(loginBody); } catch { loginData = {}; }
    const taeToken = loginData.access_token || loginData.token || loginData.data?.access_token || loginData.data?.token;
    if (!taeToken) {
      return jsonResponse({ error: "TAE token not found in response" }, 502);
    }

    // Per TAE docs diagram: GET /v1/publicacoes/{id}/download
    // The tae_document_id is updated by webhook when document is finalized (it's the signed doc ID)
    const docId = sig.tae_document_id;
    const pubId = sig.tae_publication_id;

    console.log(`[tae-download] Attempting download. docId=${docId}, pubId=${pubId}`);

    let downloadRes: Response | null = null;

    // Strategy 1: Use publication ID if available (primary per TAE docs)
    if (pubId) {
      const url = `${taeConfig.base_url}/documents/v1/publicacoes/${encodeURIComponent(pubId)}/download`;
      console.log(`[tae-download] Trying: ${url}`);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${taeToken}` } });
      if (res.ok) {
        downloadRes = res;
        console.log(`[tae-download] Success via publicacoes/${pubId}/download`);
      } else {
        console.log(`[tae-download] publicacoes/${pubId}/download → ${res.status}`);
        await res.text().catch(() => "");
      }
    }

    // Strategy 2: Use document ID as publication ID (TAE often uses same ID space)
    if (!downloadRes) {
      const url = `${taeConfig.base_url}/documents/v1/publicacoes/${encodeURIComponent(docId)}/download`;
      console.log(`[tae-download] Trying: ${url}`);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${taeToken}` } });
      if (res.ok) {
        downloadRes = res;
        console.log(`[tae-download] Success via publicacoes/${docId}/download`);
      } else {
        console.log(`[tae-download] publicacoes/${docId}/download → ${res.status}`);
        await res.text().catch(() => "");
      }
    }

    // Strategy 3: Resolve publication from document via signintegration API
    if (!downloadRes) {
      try {
        console.log(`[tae-download] Resolving publication for document ${docId}`);
        const siRes = await fetch(
          `${taeConfig.base_url}/signintegration/v2/Publicacoes/documentos-empresa`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${taeToken}`, "Content-Type": "application/json" },
            body: JSON.stringify([Number(docId)]),
          }
        );
        const siRaw = await siRes.text();
        console.log(`[tae-download] signintegration response (${siRes.status}): ${siRaw.substring(0, 500)}`);

        if (siRes.ok && siRaw) {
          let parsed: any = null;
          try { parsed = JSON.parse(siRaw); } catch { parsed = null; }
          const items = Array.isArray(parsed?.data || parsed) ? (parsed?.data || parsed) : [parsed?.data || parsed];

          for (const item of items) {
            const resolvedPubId = String(
              item?.idPublicacao || item?.publicacaoId || item?.id || ""
            ).trim();
            if (resolvedPubId && resolvedPubId !== docId) {
              const url = `${taeConfig.base_url}/documents/v1/publicacoes/${encodeURIComponent(resolvedPubId)}/download`;
              console.log(`[tae-download] Trying resolved pubId: ${url}`);
              const res = await fetch(url, { headers: { Authorization: `Bearer ${taeToken}` } });
              if (res.ok) {
                downloadRes = res;
                console.log(`[tae-download] Success via resolved publicacoes/${resolvedPubId}/download`);
                break;
              }
              await res.text().catch(() => "");
            }
          }
        }
      } catch (e: any) {
        console.log(`[tae-download] signintegration error: ${e.message}`);
      }
    }

    if (!downloadRes) {
      return jsonResponse({
        error: "Não foi possível baixar o documento assinado do TAE",
        taeDocumentId: docId,
        taePublicationId: pubId,
      }, 502);
    }

    // Convert to base64
    const pdfBuffer = await downloadRes.arrayBuffer();
    const uint8 = new Uint8Array(pdfBuffer);
    let binary = "";
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    const base64 = btoa(binary);

    return jsonResponse({ success: true, base64, mimeType: "application/pdf" });
  } catch (err: any) {
    return jsonResponse({ error: err.message }, 500);
  }
});
