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

    const h = { Authorization: `Bearer ${taeToken}`, "Content-Type": "application/json" };

    // Search in batches from 13996386 upwards (increments of 200)
    const startId = 13996387;
    const results: any = { batches: [], allFound: [] };

    for (let batch = 0; batch < 10; batch++) {
      const ids = [];
      const batchStart = startId + (batch * 200);
      for (let i = 0; i < 200; i++) {
        ids.push(batchStart + i);
      }
      
      const res = await fetch(`${baseUrl}/signintegration/v2/Publicacoes/documentos-empresa`, {
        method: "POST", headers: h,
        body: JSON.stringify(ids),
      });
      const raw = await res.text();
      let parsed: any;
      try { parsed = JSON.parse(raw); } catch { parsed = null; }
      
      if (parsed && res.ok) {
        const data = parsed?.data || parsed;
        const items = Array.isArray(data) ? data : data ? [data] : [];
        
        if (items.length > 0) {
          for (const item of items) {
            const info = {
              idDocumento: item?.idDocumento || item?.id,
              nome: item?.nome || item?.nomeDocumento,
              status: item?.status,
              idPublicacao: item?.idPublicacao || item?.publicacaoId,
              raw: JSON.stringify(item).substring(0, 500),
            };
            results.allFound.push(info);
            
            const str = JSON.stringify(item).toLowerCase();
            if (str.includes("507346") || str.includes("tracomal")) {
              results.match = item;
            }
          }
        }
        
        results.batches.push({ 
          range: `${batchStart}-${batchStart + 199}`, 
          status: res.status, 
          found: items.length 
        });
      } else {
        results.batches.push({ 
          range: `${batchStart}-${batchStart + 199}`, 
          status: res.status,
          body: (raw || "").substring(0, 200)
        });
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
