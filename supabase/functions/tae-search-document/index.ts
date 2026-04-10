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
    const h = { Authorization: `Bearer ${taeToken}`, "Content-Type": "application/json" };

    // Try /documents/v1/publicacoes (the actual endpoint used by tae-send-signature)
    const listEndpoints = [
      `${baseUrl}/documents/v1/publicacoes`,
      `${baseUrl}/documents/v1/publicacoes?page=1&pageSize=50`,
      // Try with POST to see if there's a search endpoint
    ];
    
    for (let i = 0; i < listEndpoints.length; i++) {
      const res = await fetch(listEndpoints[i], { headers: h });
      const raw = await res.text();
      results[`list_${i}`] = { url: listEndpoints[i], status: res.status, body: raw.substring(0, 1000) };
    }

    // Try POST search to publicacoes
    try {
      const res = await fetch(`${baseUrl}/documents/v1/publicacoes/search`, {
        method: "POST", headers: h,
        body: JSON.stringify({ nome: "507346" }),
      });
      results["search_publicacoes"] = { status: res.status, body: (await res.text()).substring(0, 500) };
    } catch (e: any) { results["search_publicacoes"] = { error: e.message }; }

    // Try /documents/v1/documentos/search
    try {
      const res = await fetch(`${baseUrl}/documents/v1/documentos/search`, {
        method: "POST", headers: h,
        body: JSON.stringify({ nome: "507346" }),
      });
      results["search_documentos"] = { status: res.status, body: (await res.text()).substring(0, 500) };
    } catch (e: any) { results["search_documentos"] = { error: e.message }; }

    // Try direct ID guesses (sequential IDs near recent ones from other signatures)
    // First check what other signature records have TAE IDs
    const { data: otherSigs } = await admin
      .from("proposal_signatures")
      .select("id, tae_document_id, tae_publication_id, created_at")
      .not("tae_document_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(5);
    
    results["other_signatures"] = otherSigs;

    // If we have other document IDs, try nearby IDs
    if (otherSigs && otherSigs.length > 0) {
      const knownDocId = parseInt(otherSigs[0].tae_document_id || "0");
      if (knownDocId > 0) {
        // Try a range of IDs around the known one
        const tryIds = [];
        for (let offset = -20; offset <= 20; offset++) {
          tryIds.push(knownDocId + offset);
        }
        
        // Use the signintegration batch endpoint
        const batchRes = await fetch(`${baseUrl}/signintegration/v2/Publicacoes/documentos-empresa`, {
          method: "POST", headers: h,
          body: JSON.stringify(tryIds),
        });
        const batchRaw = await batchRes.text();
        let batchParsed: any;
        try { batchParsed = JSON.parse(batchRaw); } catch { batchParsed = null; }
        
        if (batchParsed) {
          const data = batchParsed?.data || batchParsed;
          const items = Array.isArray(data) ? data : [data];
          const matches = items.filter((item: any) => {
            const str = JSON.stringify(item).toLowerCase();
            return str.includes("507346") || str.includes("tracomal");
          });
          results["batch_search"] = {
            status: batchRes.status,
            knownDocId,
            totalReturned: items.length,
            matchCount: matches.length,
            matches: matches.length > 0 ? matches : undefined,
            allItems: items.map((item: any) => ({
              id: item?.id || item?.idDocumento || item?.documentoId,
              nome: item?.nome || item?.nomeDocumento,
              status: item?.status,
              pubId: item?.idPublicacao || item?.publicacaoId,
            })),
          };
        } else {
          results["batch_search"] = { status: batchRes.status, raw: batchRaw.substring(0, 500) };
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
