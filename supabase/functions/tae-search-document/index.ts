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

    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      return new Response(JSON.stringify({ error: "TAE login failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any = {};

    // Try signintegration endpoints
    const endpoints = [
      { label: "si-publicacoes-list", method: "GET", url: `${baseUrl}/signintegration/v2/Publicacoes` },
      { label: "si-publicacoes-page1", method: "GET", url: `${baseUrl}/signintegration/v2/Publicacoes?page=1&pageSize=30` },
      { label: "si-publicacoes-status0", method: "GET", url: `${baseUrl}/signintegration/v2/Publicacoes?status=0&pageSize=30` },
      { label: "si-publicacoes-status1", method: "GET", url: `${baseUrl}/signintegration/v2/Publicacoes?status=1&pageSize=30` },
      { label: "si-publicacoes-status2", method: "GET", url: `${baseUrl}/signintegration/v2/Publicacoes?status=2&pageSize=30` },
      { label: "doc-v2-publicacoes-list", method: "GET", url: `${baseUrl}/documents/v2/publicacoes` },
      { label: "doc-v2-publicacoes-page", method: "GET", url: `${baseUrl}/documents/v2/publicacoes?page=1&pageSize=30` },
    ];

    for (const ep of endpoints) {
      try {
        const res = await fetch(ep.url, {
          method: ep.method,
          headers: { Authorization: `Bearer ${taeToken}`, "Content-Type": "application/json" },
        });
        const raw = await res.text();
        let parsed: any;
        try { parsed = JSON.parse(raw); } catch { parsed = raw.substring(0, 800); }
        
        // Search for 507346 or TRACOMAL in results
        const dataArr = parsed?.data || parsed?.items || parsed?.publicacoes || (Array.isArray(parsed) ? parsed : null);
        if (Array.isArray(dataArr)) {
          const matches = dataArr.filter((item: any) => {
            const str = JSON.stringify(item).toLowerCase();
            return str.includes("507346") || str.includes("tracomal");
          });
          results[ep.label] = {
            status: res.status,
            totalItems: dataArr.length,
            matches,
            sampleKeys: dataArr.length > 0 ? Object.keys(dataArr[0]) : [],
            firstItem: dataArr.length > 0 ? dataArr[0] : null,
          };
        } else {
          results[ep.label] = {
            status: res.status,
            type: typeof parsed,
            keys: typeof parsed === 'object' && parsed ? Object.keys(parsed) : [],
            sample: JSON.stringify(parsed).substring(0, 500),
          };
        }
      } catch (e: any) {
        results[ep.label] = { error: e.message };
      }
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
