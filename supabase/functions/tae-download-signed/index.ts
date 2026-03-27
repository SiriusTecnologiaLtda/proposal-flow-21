import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { signatureId } = await req.json();
    if (!signatureId) {
      return new Response(JSON.stringify({ error: "signatureId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get signature record
    const { data: sig, error: sigErr } = await supabase
      .from("proposal_signatures")
      .select("tae_document_id, tae_publication_id, proposal_id")
      .eq("id", signatureId)
      .single();

    if (sigErr || !sig) {
      return new Response(JSON.stringify({ error: "Signature not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!sig.tae_document_id) {
      return new Response(JSON.stringify({ error: "No TAE document ID available" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      return new Response(JSON.stringify({ error: "TAE not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const taePassword = Deno.env.get("TAE_SERVICE_USER_PASSWORD");
    if (!taePassword || !taeConfig.service_user_email) {
      return new Response(JSON.stringify({ error: "TAE credentials missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Login to TAE
    const loginRes = await fetch(`${taeConfig.base_url}/identityintegration/v3/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName: taeConfig.service_user_email, password: taePassword }),
    });

    if (!loginRes.ok) {
      const loginBody = await loginRes.text().catch(() => "");
      return new Response(JSON.stringify({ error: `TAE login failed (${loginRes.status})`, details: loginBody.substring(0, 300) }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const loginBody = await loginRes.text();
    let loginData: any;
    try { loginData = JSON.parse(loginBody); } catch { loginData = {}; }
    const taeToken = loginData.access_token || loginData.token || loginData.data?.access_token || loginData.data?.token;
    if (!taeToken) {
      return new Response(JSON.stringify({ error: "TAE token not found in response", details: loginBody.substring(0, 300) }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download the signed document
    const downloadRes = await fetch(
      `${taeConfig.base_url}/api/v1/documents/${sig.tae_document_id}/download`,
      {
        headers: { Authorization: `Bearer ${taeToken}` },
      }
    );

    if (!downloadRes.ok) {
      const errText = await downloadRes.text().catch(() => "");
      return new Response(JSON.stringify({ error: `TAE download failed (${downloadRes.status}): ${errText}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Convert to base64
    const pdfBuffer = await downloadRes.arrayBuffer();
    const uint8 = new Uint8Array(pdfBuffer);
    let binary = "";
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    const base64 = btoa(binary);

    return new Response(JSON.stringify({ success: true, base64, mimeType: "application/pdf" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
