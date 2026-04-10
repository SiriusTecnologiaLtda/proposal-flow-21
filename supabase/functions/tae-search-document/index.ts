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

    // Wider search: sample every 1000 IDs to find where documents exist
    // Known: 13996386 exists (April 1). Target: April 10. 
    // Try ranges: 14000000-14200000 with step of 500, batch of 500
    const results: any = { probes: [], allFound: [] };

    // Probe with 500-ID batches at strategic points
    const probeStarts = [
      14000000, 14010000, 14020000, 14030000, 14040000, 14050000,
      14060000, 14070000, 14080000, 14090000, 14100000,
      14150000, 14200000, 14250000, 14300000,
    ];

    for (const start of probeStarts) {
      const ids = [];
      for (let i = 0; i < 500; i++) {
        ids.push(start + i);
      }
      
      const res = await fetch(`${baseUrl}/signintegration/v2/Publicacoes/documentos-empresa`, {
        method: "POST", headers: h,
        body: JSON.stringify(ids),
      });
      const raw = await res.text();
      let parsed: any;
      try { parsed = JSON.parse(raw); } catch { parsed = null; }
      
      const data = parsed?.data || parsed;
      const items = Array.isArray(data) ? data : data ? [data] : [];
      const found = items.filter((i: any) => i && typeof i === 'object');
      
      results.probes.push({ start, found: found.length });
      
      for (const item of found) {
        const info = {
          idDocumento: item?.idDocumento || item?.id,
          nome: item?.nome || item?.nomeDocumento,
          status: item?.status,
          idPublicacao: item?.idPublicacao,
          raw: JSON.stringify(item).substring(0, 300),
        };
        results.allFound.push(info);
        
        const str = JSON.stringify(item).toLowerCase();
        if (str.includes("507346") || str.includes("tracomal")) {
          results.match = item;
        }
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
