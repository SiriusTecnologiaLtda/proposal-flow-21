import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 50;
const SQLSERVER_OFFSET_FETCH_PATTERN = /\s+OFFSET\s+\d+\s+ROWS\s+FETCH\s+NEXT\s+\d+\s+ROWS\s+ONLY\s*;?\s*$/i;
const LIMIT_OFFSET_PATTERN = /\s+LIMIT\s+\d+(\s+OFFSET\s+\d+)?\s*;?\s*$/i;
const ORDER_BY_PATTERN = /\border\s+by\b/i;

function buildPaginatedSqlScript(sql: string, pageSize: number, currentOffset: number) {
  let normalized = sql
    .trim()
    .replace(/;+\s*$/, "")
    .replace(SQLSERVER_OFFSET_FETCH_PATTERN, "")
    .replace(LIMIT_OFFSET_PATTERN, "");

  if (!ORDER_BY_PATTERN.test(normalized)) {
    normalized = `${normalized} ORDER BY 1`;
  }

  return `${normalized} OFFSET ${currentOffset} ROWS FETCH NEXT ${pageSize} ROWS ONLY`;
}

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

    // Build base headers for external API
    const apiHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...(integration.headers || {}),
    };

    if (integration.auth_type === "bearer" && integration.auth_value) {
      apiHeaders["Authorization"] = `Bearer ${integration.auth_value}`;
    } else if (integration.auth_type === "basic" && integration.auth_value) {
      apiHeaders["Authorization"] = `Basic ${btoa(integration.auth_value)}`;
    } else if (integration.auth_type === "api_key" && integration.auth_value) {
      apiHeaders["x-api-key"] = integration.auth_value;
    }

    const fieldMapping = integration.field_mapping as Record<string, string>;
    let inserted = 0;
    let updated = 0;
    let errors = 0;
    let totalRecords = 0;
    const requestLogs: string[] = [];

    const paginationEnabled = integration.pagination_enabled === true;
    const pageSize = integration.pagination_page_size || 200;
    const paramOffset = integration.pagination_param_offset || "offset";
    const paramLimit = integration.pagination_param_limit || "limit";

    // Fetch/process records page by page to avoid timeouts and excessive memory usage
    const processRecordsBatch = async (records: any[]) => {
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

        await adminClient.from("sync_logs").update({
          inserted,
          updated,
          errors,
          total_records: totalRecords,
        }).eq("id", logId);
      }
    };

    if (paginationEnabled) {
      let currentOffset = 0;
      let hasMore = true;
      const MAX_PAGES = 500;
      let pageCount = 0;

      while (hasMore && pageCount < MAX_PAGES) {
        pageCount++;
        let url: string;
        let fetchOpts: RequestInit;

        if (integration.http_method === "POST") {
          url = integration.endpoint_url;
          let bodyObj: Record<string, any> = {};
          if (integration.body_template) {
            try { bodyObj = JSON.parse(integration.body_template); } catch { /* use empty */ }
          }

          if (bodyObj.sqlScript && typeof bodyObj.sqlScript === "string") {
            bodyObj.sqlScript = buildPaginatedSqlScript(bodyObj.sqlScript, pageSize, currentOffset);
          } else {
            bodyObj[paramOffset] = currentOffset;
            bodyObj[paramLimit] = pageSize;
          }

          fetchOpts = {
            method: "POST",
            headers: apiHeaders,
            body: JSON.stringify(bodyObj),
          };
        } else {
          const separator = integration.endpoint_url.includes("?") ? "&" : "?";
          url = `${integration.endpoint_url}${separator}${paramOffset}=${currentOffset}&${paramLimit}=${pageSize}`;
          fetchOpts = { method: "GET", headers: apiHeaders };
        }

        console.log(`Page ${pageCount}: offset=${currentOffset}, limit=${pageSize}`);

        // Build curl log
        const curlParts = [`curl -X ${integration.http_method} '${url}'`];
        for (const [k, v] of Object.entries(apiHeaders)) {
          curlParts.push(`-H '${k}: ${k.toLowerCase().includes("auth") ? "***" : v}'`);
        }
        if (fetchOpts.body) {
          curlParts.push(`-d '${fetchOpts.body}'`);
        }
        const curlCmd = curlParts.join(" \\\n  ");

        const apiRes = await fetch(url, fetchOpts);
        const responseText = await apiRes.text();

        requestLogs.push(`[Page ${pageCount}] ${new Date().toISOString()}\n${curlCmd}\n\nHTTP ${apiRes.status}\nResponse (first 500 chars): ${responseText.substring(0, 500)}\n${"─".repeat(60)}`);

        // Save request_log incrementally
        await adminClient.from("sync_logs").update({ request_log: requestLogs.join("\n\n") }).eq("id", logId);

        if (!apiRes.ok) {
          const errMsg = `HTTP ${apiRes.status} (offset ${currentOffset}): ${responseText.substring(0, 200)}`;
          await adminClient.from("sync_logs").update({
            status: "error",
            finished_at: new Date().toISOString(),
            error_message: errMsg,
            inserted, updated, errors, total_records: totalRecords,
            request_log: requestLogs.join("\n\n"),
          }).eq("id", logId);

          await adminClient.from("api_integrations").update({
            last_sync_at: new Date().toISOString(),
            last_sync_status: "error",
            last_sync_message: errMsg,
          }).eq("id", integrationId);

          return new Response(JSON.stringify({ error: errMsg, logId }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        let rawData;
        try {
          rawData = JSON.parse(responseText);
        } catch {
          const errMsg = `Resposta não é JSON válido (offset ${currentOffset}): ${responseText.substring(0, 200)}`;
          await adminClient.from("sync_logs").update({
            status: "error",
            finished_at: new Date().toISOString(),
            error_message: errMsg,
            request_log: requestLogs.join("\n\n"),
          }).eq("id", logId);
          return new Response(JSON.stringify({ error: errMsg, logId }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const pageRecords = Array.isArray(rawData)
          ? rawData
          : rawData.data || rawData.items || rawData.results || [rawData];

        totalRecords += pageRecords.length;
        await adminClient.from("sync_logs").update({ total_records: totalRecords }).eq("id", logId);
        await processRecordsBatch(pageRecords);

        if (pageRecords.length < pageSize) {
          hasMore = false;
        } else {
          currentOffset += pageSize;
        }
      }
    } else {
      // Single request (no pagination)
      const fetchOpts: RequestInit = { method: integration.http_method, headers: apiHeaders };
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
      const pageRecords = Array.isArray(rawData)
        ? rawData
        : rawData.data || rawData.items || rawData.results || [rawData];
      totalRecords = pageRecords.length;
      await adminClient.from("sync_logs").update({ total_records: totalRecords }).eq("id", logId);
      await processRecordsBatch(pageRecords);
    }

    const message = `Inseridos: ${inserted}, Atualizados: ${updated}, Erros: ${errors}`;
    await adminClient.from("sync_logs").update({
      status: "success",
      finished_at: new Date().toISOString(),
      inserted, updated, errors,
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
