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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate user
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use admin client for tae_config
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: taeConfig } = await admin.from("tae_config").select("*").maybeSingle();
    if (!taeConfig) {
      return new Response(JSON.stringify({ error: "TAE config not found" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any = {};

    // Search by name in various endpoints
    const searchEndpoints = [
      `${baseUrl}/documents/v1/envelopes?nome=507346&pageSize=10`,
      `${baseUrl}/documents/v1/envelopes?filter=507346&pageSize=10`,
      `${baseUrl}/documents/v2/publicacoes?nome=507346&pageSize=10`,
      `${baseUrl}/documents/v1/documentos?nome=507346&pageSize=10`,
    ];

    for (let i = 0; i < searchEndpoints.length; i++) {
      const url = searchEndpoints[i];
      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${taeToken}` } });
        const raw = await res.text();
        let parsed: any;
        try { parsed = JSON.parse(raw); } catch { parsed = raw.substring(0, 800); }
        results[`endpoint_${i}`] = { url, status: res.status, data: parsed };
      } catch (e: any) {
        results[`endpoint_${i}`] = { url, error: e.message };
      }
    }

    // Also try listing recent envelopes
    try {
      const res = await fetch(`${baseUrl}/documents/v1/envelopes?pageSize=30`, {
        headers: { Authorization: `Bearer ${taeToken}` },
      });
      const raw = await res.text();
      let parsed: any;
      try { parsed = JSON.parse(raw); } catch { parsed = raw.substring(0, 2000); }
      // Filter items containing "507346" or "TRACOMAL"
      const data = parsed?.data || parsed;
      if (Array.isArray(data)) {
        const matches = data.filter((item: any) => {
          const str = JSON.stringify(item);
          return str.includes("507346") || str.includes("TRACOMAL") || str.includes("tracomal");
        });
        results["recent_matches"] = { total: data.length, matches, firstKeys: data.length > 0 ? Object.keys(data[0]) : [] };
      } else {
        results["recent_raw"] = { keys: typeof data === 'object' ? Object.keys(data || {}) : typeof data, sample: JSON.stringify(data).substring(0, 1000) };
      }
    } catch (e: any) {
      results["recent"] = { error: e.message };
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
