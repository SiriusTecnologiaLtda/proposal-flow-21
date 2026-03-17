import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { integrationId } = await req.json();
    if (!integrationId) {
      return new Response(JSON.stringify({ error: "integrationId é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load integration config
    const { data: integration, error: intError } = await adminClient
      .from("api_integrations")
      .select("*")
      .eq("id", integrationId)
      .single();

    if (intError || !integration) {
      return new Response(JSON.stringify({ error: "Integração não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build request to external API
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(integration.headers || {}),
    };

    if (integration.auth_type === "bearer" && integration.auth_value) {
      headers["Authorization"] = `Bearer ${integration.auth_value}`;
    } else if (integration.auth_type === "basic" && integration.auth_value) {
      headers["Authorization"] = `Basic ${btoa(integration.auth_value)}`;
    } else if (integration.auth_type === "api_key" && integration.auth_value) {
      headers["x-api-key"] = integration.auth_value;
    }

    const fetchOpts: RequestInit = { method: integration.http_method, headers };
    if (integration.http_method === "POST" && integration.body_template) {
      fetchOpts.body = integration.body_template;
    }

    const apiRes = await fetch(integration.endpoint_url, fetchOpts);
    if (!apiRes.ok) {
      const errorText = await apiRes.text();
      await adminClient.from("api_integrations").update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: "error",
        last_sync_message: `HTTP ${apiRes.status}: ${errorText.substring(0, 200)}`,
      }).eq("id", integrationId);

      return new Response(JSON.stringify({ error: `API retornou HTTP ${apiRes.status}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawData = await apiRes.json();
    const records = Array.isArray(rawData)
      ? rawData
      : rawData.data || rawData.items || rawData.results || [rawData];

    const fieldMapping = integration.field_mapping as Record<string, string>;
    let inserted = 0;
    let updated = 0;
    let errors = 0;

    for (const record of records) {
      try {
        const mapped: Record<string, any> = {};
        for (const [apiField, systemField] of Object.entries(fieldMapping)) {
          if (record[apiField] !== undefined) {
            mapped[systemField] = String(record[apiField] ?? "");
          }
        }

        if (!mapped.code || !mapped.name) {
          errors++;
          continue;
        }
        if (!mapped.cnpj) mapped.cnpj = "";

        // Check if exists by code
        const { data: existing } = await adminClient
          .from("clients")
          .select("id")
          .eq("code", mapped.code)
          .maybeSingle();

        if (existing) {
          await adminClient.from("clients").update(mapped).eq("id", existing.id);
          updated++;
        } else {
          await adminClient.from("clients").insert(mapped);
          inserted++;
        }
      } catch {
        errors++;
      }
    }

    const message = `Inseridos: ${inserted}, Atualizados: ${updated}, Erros: ${errors}`;
    await adminClient.from("api_integrations").update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: "success",
      last_sync_message: message,
    }).eq("id", integrationId);

    return new Response(JSON.stringify({ inserted, updated, errors }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sync-api-clients error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
