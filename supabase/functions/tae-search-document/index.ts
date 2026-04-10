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
    const { data: { user } } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: taeConfig } = await admin.from("tae_config").select("*").maybeSingle();
    const taePassword = Deno.env.get("TAE_SERVICE_USER_PASSWORD");
    const baseUrl = taeConfig!.base_url;

    const loginRes = await fetch(`${baseUrl}/identityintegration/v3/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName: taeConfig!.service_user_email, password: taePassword }),
    });
    const loginData = await loginRes.json();
    const taeToken = loginData.access_token || loginData.token || loginData.data?.access_token || loginData.data?.token;

    const results: any = {};
    const authHeaders = { Authorization: `Bearer ${taeToken}`, "Content-Type": "application/json" };

    // Get full error from pendentes
    const fullErrorEndpoints = [
      { label: "pendentes-full", url: `${baseUrl}/signintegration/v2/Publicacoes/pendentes` },
      { label: "todos-full", url: `${baseUrl}/signintegration/v2/Publicacoes/todos` },
    ];

    for (const ep of fullErrorEndpoints) {
      const res = await fetch(ep.url, { headers: authHeaders });
      results[ep.label] = { status: res.status, body: await res.text() };
    }

    // Try POST with email filter to documentos-empresa
    // This endpoint accepts array of document IDs. But we need to find the ID.
    // Let me try searching via the TOTVS Sign web API (documentos endpoint)
    const searchEndpoints = [
      { label: "api-v1-documentos", url: `${baseUrl}/api/v1/documentos?pageSize=50` },
      { label: "api-v1-envelopes", url: `${baseUrl}/api/v1/envelopes?pageSize=50` },
      { label: "api-v2-documentos", url: `${baseUrl}/api/v2/documentos?pageSize=50` },
      { label: "api-documentos", url: `${baseUrl}/documentos?pageSize=50` },
      // TOTVS Sign uses /sign/v1/ pattern sometimes
      { label: "sign-v1-documentos", url: `${baseUrl}/sign/v1/documentos?pageSize=50` },
      // Try the /documents/ base
      { label: "documents-v1-documentos-list", url: `${baseUrl}/documents/v1/documentos` },
      { label: "documents-v2-documentos-list", url: `${baseUrl}/documents/v2/documentos` },
      { label: "documents-v1-envelopes-list", url: `${baseUrl}/documents/v1/envelopes` },
      { label: "documents-v2-envelopes", url: `${baseUrl}/documents/v2/envelopes` },
      { label: "documents-v2-envelopes-page", url: `${baseUrl}/documents/v2/envelopes?page=1&pageSize=50` },
    ];

    for (const ep of searchEndpoints) {
      try {
        const res = await fetch(ep.url, { headers: authHeaders });
        const raw = await res.text();
        let parsed: any;
        try { parsed = JSON.parse(raw); } catch { parsed = null; }
        
        if (res.ok && parsed) {
          const dataArr = parsed?.data || parsed?.items || (Array.isArray(parsed) ? parsed : null);
          if (Array.isArray(dataArr) && dataArr.length > 0) {
            const matches = dataArr.filter((item: any) => {
              const str = JSON.stringify(item).toLowerCase();
              return str.includes("507346") || str.includes("tracomal");
            });
            results[ep.label] = {
              status: res.status, totalItems: dataArr.length,
              matchCount: matches.length, matches,
              sampleKeys: Object.keys(dataArr[0]),
            };
          } else {
            results[ep.label] = { status: res.status, keys: parsed ? Object.keys(parsed) : [], sample: JSON.stringify(parsed).substring(0, 300) };
          }
        } else {
          results[ep.label] = { status: res.status, body: (raw || "").substring(0, 200) };
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
