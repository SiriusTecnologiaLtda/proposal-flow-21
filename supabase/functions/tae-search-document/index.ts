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

    const results: any = { allFound: [], probes: [] };

    // Dense search: every 1000 from 13996000 to 14100000
    const probeStarts: number[] = [];
    for (let s = 13996000; s <= 14100000; s += 1000) {
      probeStarts.push(s);
    }

    for (const start of probeStarts) {
      const ids = [];
      for (let i = 0; i < 1000; i++) {
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
      const items = Array.isArray(data) ? data.filter((i: any) => i && typeof i === 'object') : [];
      
      if (items.length > 0) {
        results.probes.push({ start, found: items.length });
        for (const item of items) {
          const str = JSON.stringify(item).toLowerCase();
          const isMatch = str.includes("507346") || str.includes("tracomal");
          results.allFound.push({
            id: item?.id || item?.idDocumento,
            status: item?.status,
            pendentes: item?.pendentes?.map((p: any) => ({ email: p.email, pendente: p.pendente })),
            isMatch,
          });
          if (isMatch) results.match = item;
        }
      }
    }

    results.totalFound = results.allFound.length;

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
