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

    const { searchName } = await req.json();

    // Get TAE config
    const { data: taeConfig } = await supabase.from("tae_config").select("*").maybeSingle();
    if (!taeConfig) {
      return new Response(JSON.stringify({ error: "TAE config not found" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const taePassword = Deno.env.get("TAE_SERVICE_USER_PASSWORD");
    const baseUrl = taeConfig.base_url;

    // Login
    const loginRes = await fetch(`${baseUrl}/identityintegration/v3/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName: taeConfig.service_user_email, password: taePassword }),
    });
    const loginData = await loginRes.json();
    const taeToken = loginData.access_token || loginData.token || loginData.data?.access_token || loginData.data?.token;
    if (!taeToken) {
      return new Response(JSON.stringify({ error: "TAE login failed", loginData }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any = {};

    // Try multiple search endpoints
    const endpoints = [
      { label: "envelopes-search", url: `${baseUrl}/documents/v1/envelopes?nome=${encodeURIComponent(searchName)}&pageSize=5` },
      { label: "envelopes-search2", url: `${baseUrl}/documents/v1/envelopes?filter=${encodeURIComponent(searchName)}&pageSize=5` },
      { label: "documentos-search", url: `${baseUrl}/documents/v1/documentos?nome=${encodeURIComponent(searchName)}&pageSize=5` },
      { label: "documentos-search2", url: `${baseUrl}/documents/v1/documentos?filter=${encodeURIComponent(searchName)}&pageSize=5` },
      { label: "publicacoes-search", url: `${baseUrl}/documents/v2/publicacoes?nome=${encodeURIComponent(searchName)}&pageSize=5` },
      { label: "signint-docs-empresa", url: `${baseUrl}/signintegration/v2/Publicacoes/documentos-empresa` },
    ];

    for (const ep of endpoints) {
      try {
        let res: Response;
        if (ep.label === "signint-docs-empresa") {
          // Skip this one - needs doc IDs
          continue;
        }
        res = await fetch(ep.url, {
          headers: { Authorization: `Bearer ${taeToken}` },
        });
        const raw = await res.text();
        let parsed: any;
        try { parsed = JSON.parse(raw); } catch { parsed = raw.substring(0, 500); }
        results[ep.label] = { status: res.status, data: parsed };
      } catch (e: any) {
        results[ep.label] = { error: e.message };
      }
    }

    // Also try searching with "507346" as keyword
    try {
      const searchRes = await fetch(`${baseUrl}/documents/v1/envelopes?nome=507346&pageSize=10`, {
        headers: { Authorization: `Bearer ${taeToken}` },
      });
      const raw = await searchRes.text();
      let parsed: any;
      try { parsed = JSON.parse(raw); } catch { parsed = raw.substring(0, 500); }
      results["envelopes-507346"] = { status: searchRes.status, data: parsed };
    } catch (e: any) {
      results["envelopes-507346"] = { error: e.message };
    }

    // Try listing recent documents
    try {
      const recentRes = await fetch(`${baseUrl}/documents/v1/envelopes?pageSize=20&orderBy=dataCriacao desc`, {
        headers: { Authorization: `Bearer ${taeToken}` },
      });
      const raw = await recentRes.text();
      let parsed: any;
      try { parsed = JSON.parse(raw); } catch { parsed = raw.substring(0, 1000); }
      results["recent-envelopes"] = { status: recentRes.status, data: parsed };
    } catch (e: any) {
      results["recent-envelopes"] = { error: e.message };
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
