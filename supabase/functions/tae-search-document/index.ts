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

    // Try various TOTVS Sign endpoints
    const endpoints = [
      // Pendentes para o usuário de serviço
      { label: "pendentes", method: "GET", url: `${baseUrl}/signintegration/v2/Publicacoes/pendentes` },
      { label: "pendentes-page", method: "GET", url: `${baseUrl}/signintegration/v2/Publicacoes/pendentes?page=1&pageSize=50` },
      // Assinados
      { label: "assinados", method: "GET", url: `${baseUrl}/signintegration/v2/Publicacoes/assinados?page=1&pageSize=50` },
      // Finalizados
      { label: "finalizados", method: "GET", url: `${baseUrl}/signintegration/v2/Publicacoes/finalizados?page=1&pageSize=50` },
      // Todos
      { label: "todos", method: "GET", url: `${baseUrl}/signintegration/v2/Publicacoes/todos?page=1&pageSize=50` },
      // Enviados
      { label: "enviados", method: "GET", url: `${baseUrl}/signintegration/v2/Publicacoes/enviados?page=1&pageSize=50` },
      // By email of signer
      { label: "by-email", method: "GET", url: `${baseUrl}/signintegration/v2/Publicacoes?email=mario@tracomal.com.br` },
      // Documentos endpoint
      { label: "documentos-v2", method: "GET", url: `${baseUrl}/signintegration/v2/Documentos?page=1&pageSize=50` },
    ];

    for (const ep of endpoints) {
      try {
        const res = await fetch(ep.url, { method: ep.method, headers: authHeaders });
        const raw = await res.text();
        let parsed: any;
        try { parsed = JSON.parse(raw); } catch { parsed = null; }

        if (parsed && res.ok) {
          const dataArr = parsed?.data || parsed?.items || parsed?.publicacoes || (Array.isArray(parsed) ? parsed : null);
          if (Array.isArray(dataArr)) {
            const matches = dataArr.filter((item: any) => {
              const str = JSON.stringify(item).toLowerCase();
              return str.includes("507346") || str.includes("tracomal");
            });
            results[ep.label] = {
              status: res.status,
              totalItems: dataArr.length,
              matchCount: matches.length,
              matches: matches.length > 0 ? matches : undefined,
              sampleKeys: dataArr.length > 0 ? Object.keys(dataArr[0]) : [],
            };
          } else {
            results[ep.label] = {
              status: res.status,
              keys: typeof parsed === 'object' ? Object.keys(parsed) : [],
              sample: JSON.stringify(parsed).substring(0, 300),
            };
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
