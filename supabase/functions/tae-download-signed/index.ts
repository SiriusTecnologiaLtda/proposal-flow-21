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

    // Login to TAE
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

    const docId = sig.tae_document_id;
    console.log(`[tae-download] docId=${docId}`);

    // Per TAE docs: GET /v1/publicacoes/{id}/download
    // Download types: 1=Original, 2=Assinado (com manifesto), 3=Assinado Digital, 4=Todos (ZIP)
    // We want type 2 = Signed document with signature manifest

    const downloadTypes = [
      { tipo: 2, label: "Assinado" },
      { tipo: 3, label: "Assinado Digital" },
      { tipo: 1, label: "Original (fallback)" },
    ];

    let downloadRes: Response | null = null;
    let usedLabel = "";

    for (const dt of downloadTypes) {
      // Try with query parameter ?tipo=N
      const url = `${taeConfig.base_url}/documents/v1/publicacoes/${encodeURIComponent(docId)}/download?tipo=${dt.tipo}`;
      console.log(`[tae-download] Trying: ${url}`);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${taeToken}` } });
      if (res.ok) {
        const contentType = res.headers.get("content-type") || "";
        // Verify it's actually a PDF/file and not an error page
        if (contentType.includes("pdf") || contentType.includes("octet-stream") || contentType.includes("zip")) {
          downloadRes = res;
          usedLabel = dt.label;
          console.log(`[tae-download] Success: tipo=${dt.tipo} (${dt.label}), content-type=${contentType}`);
          break;
        }
        // Check if body is large enough to be a real document
        const body = await res.arrayBuffer();
        if (body.byteLength > 1000) {
          downloadRes = new Response(body, { headers: res.headers, status: res.status });
          usedLabel = dt.label;
          console.log(`[tae-download] Success (by size ${body.byteLength}): tipo=${dt.tipo} (${dt.label})`);
          break;
        }
        console.log(`[tae-download] tipo=${dt.tipo} returned small body (${body.byteLength}), skipping`);
      } else {
        console.log(`[tae-download] tipo=${dt.tipo} → ${res.status}`);
        await res.text().catch(() => "");
      }
    }

    // Fallback: try without tipo parameter (default behavior)
    if (!downloadRes) {
      const url = `${taeConfig.base_url}/documents/v1/publicacoes/${encodeURIComponent(docId)}/download`;
      console.log(`[tae-download] Trying without tipo param: ${url}`);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${taeToken}` } });
      if (res.ok) {
        downloadRes = res;
        usedLabel = "Default (sem tipo)";
        console.log(`[tae-download] Success via default download`);
      } else {
        console.log(`[tae-download] Default download → ${res.status}`);
        await res.text().catch(() => "");
      }
    }

    if (!downloadRes) {
      return jsonResponse({
        error: "Não foi possível baixar o documento assinado do TAE",
        taeDocumentId: docId,
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

    return jsonResponse({ success: true, base64, mimeType: "application/pdf", downloadType: usedLabel });
  } catch (err: any) {
    return jsonResponse({ error: err.message }, 500);
  }
});
