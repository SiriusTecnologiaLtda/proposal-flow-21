import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { integrationId, triggerType } = await req.json();
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

    // Create sync log entry
    const { data: logEntry, error: logError } = await adminClient
      .from("sync_logs")
      .insert({
        integration_id: integrationId,
        status: "running",
        trigger_type: triggerType || "manual",
      })
      .select("id")
      .single();

    if (logError || !logEntry) {
      return new Response(JSON.stringify({ error: "Falha ao criar log" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const logId = logEntry.id;

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
      const errMsg = `HTTP ${apiRes.status}: ${errorText.substring(0, 200)}`;
      await adminClient.from("sync_logs").update({
        status: "error",
        finished_at: new Date().toISOString(),
        error_message: errMsg,
      }).eq("id", logId);

      await adminClient.from("api_integrations").update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: "error",
        last_sync_message: errMsg,
      }).eq("id", integrationId);

      return new Response(JSON.stringify({ error: `API retornou HTTP ${apiRes.status}`, logId }), {
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
    const totalRecords = records.length;

    // Update log with total
    await adminClient.from("sync_logs").update({
      total_records: totalRecords,
    }).eq("id", logId);

    // Process in batches
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);

      for (const record of batch) {
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

      // Update log progress after each batch
      await adminClient.from("sync_logs").update({
        inserted,
        updated,
        errors,
      }).eq("id", logId);
    }

    // Finalize log
    const message = `Inseridos: ${inserted}, Atualizados: ${updated}, Erros: ${errors}`;
    await adminClient.from("sync_logs").update({
      status: "success",
      finished_at: new Date().toISOString(),
      inserted,
      updated,
      errors,
      total_records: totalRecords,
    }).eq("id", logId);

    await adminClient.from("api_integrations").update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: "success",
      last_sync_message: message,
    }).eq("id", integrationId);

    return new Response(JSON.stringify({ inserted, updated, errors, logId }), {
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
