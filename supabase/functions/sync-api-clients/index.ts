import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SQLSERVER_OFFSET_FETCH_PATTERN = /\s+OFFSET\s+\d+\s+ROWS\s+FETCH\s+NEXT\s+\d+\s+ROWS\s+ONLY\s*;?\s*$/i;
const LIMIT_OFFSET_PATTERN = /\s+LIMIT\s+\d+(\s+OFFSET\s+\d+)?\s*;?\s*$/i;
const ORDER_BY_PATTERN = /\border\s+by\b/i;
const HEARTBEAT_STALE_MINUTES = 5;

function buildPaginatedSqlScript(sql: string, pageSize: number, currentOffset: number, orderBy?: string) {
  let normalized = sql
    .trim()
    .replace(/;+\s*$/, "")
    .replace(SQLSERVER_OFFSET_FETCH_PATTERN, "")
    .replace(LIMIT_OFFSET_PATTERN, "");

  if (!ORDER_BY_PATTERN.test(normalized)) {
    normalized = `${normalized} ORDER BY ${orderBy || "1"}`;
  }

  return `${normalized} OFFSET ${currentOffset} ROWS FETCH NEXT ${pageSize} ROWS ONLY`;
}

function buildCurlLog(method: string, url: string, headers: Record<string, string>, body?: string): string {
  const parts = [`curl -X ${method} '${url}'`];
  for (const [k, v] of Object.entries(headers)) {
    parts.push(`-H '${k}: ${k.toLowerCase().includes("auth") ? "***" : v}'`);
  }
  if (body) parts.push(`-d '${body}'`);
  return parts.join(" \\\n  ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const authHeader = req.headers.get("Authorization");
    const { integrationId, triggerType, syncLogId, _serviceChain } = await req.json();

    // For service-chained calls, skip user auth (we use service role)
    if (!_serviceChain) {
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(supabaseUrl, supabaseAnon, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userError } = await userClient.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!integrationId) {
      return new Response(JSON.stringify({ error: "integrationId é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load integration
    const { data: integration, error: intError } = await admin
      .from("api_integrations").select("*").eq("id", integrationId).single();
    if (intError || !integration) {
      return new Response(JSON.stringify({ error: "Integração não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reconcile stale running syncs
    await admin.from("sync_logs")
      .update({ status: "timeout", finished_at: new Date().toISOString(), error_message: "Execução interrompida (timeout/heartbeat expirado)" })
      .eq("integration_id", integrationId)
      .eq("status", "running")
      .lt("heartbeat_at", new Date(Date.now() - HEARTBEAT_STALE_MINUTES * 60 * 1000).toISOString());

    // Concurrency check
    if (!syncLogId) {
      const { data: activeSync } = await admin.from("sync_logs")
        .select("id")
        .eq("integration_id", integrationId)
        .eq("status", "running")
        .gte("heartbeat_at", new Date(Date.now() - HEARTBEAT_STALE_MINUTES * 60 * 1000).toISOString())
        .limit(1)
        .maybeSingle();
      if (activeSync) {
        return new Response(JSON.stringify({ error: "Já existe uma sincronização em andamento", logId: activeSync.id }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Get or create sync log
    let logId = syncLogId;
    if (!logId) {
      const { data: logEntry, error: logError } = await admin.from("sync_logs")
        .insert({
          integration_id: integrationId,
          status: "running",
          trigger_type: triggerType || "manual",
          heartbeat_at: new Date().toISOString(),
          current_offset: 0,
          page_size: integration.pagination_page_size || 100,
          pages_processed: 0,
          records_fetched: 0,
        })
        .select("id")
        .single();
      if (logError || !logEntry) {
        return new Response(JSON.stringify({ error: "Falha ao criar log" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      logId = logEntry.id;
    }

    // Return immediately, process in background
    // @ts-ignore - EdgeRuntime.waitUntil is a Deno Deploy / Supabase Edge Runtime API
    EdgeRuntime.waitUntil(processSync(admin, integration, logId, integrationId, supabaseUrl, supabaseServiceKey));

    return new Response(JSON.stringify({ status: "started", logId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("sync-api-clients error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─── Lookup cache helper ────────────────────────────────────────
async function loadLookupMaps(admin: any) {
  const { data: units } = await admin.from("unit_info").select("id, code, name");

  const unitMap = new Map<string, string>();
  for (const u of units || []) {
    if (u.code) unitMap.set(u.code.trim().toLowerCase(), u.id);
    unitMap.set(u.name.trim().toLowerCase(), u.id);
  }

  const esnMap = new Map<string, string>();
  const gsnMap = new Map<string, string>();
  for (const s of salesTeam || []) {
    const code = s.code.trim().toLowerCase();
    if (s.role === "esn") esnMap.set(code, s.id);
    else if (s.role === "gsn") gsnMap.set(code, s.id);
  }

  return { unitMap, esnMap, gsnMap };
}

async function processSync(
  admin: any,
  integration: any,
  logId: string,
  integrationId: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
) {
  // Load current state
  const { data: existingLog } = await admin.from("sync_logs").select("*").eq("id", logId).single();
  let currentOffset = existingLog?.current_offset || 0;
  let pagesProcessed = existingLog?.pages_processed || 0;
  let recordsFetched = existingLog?.records_fetched || 0;
  let inserted = existingLog?.inserted || 0;
  let updated = existingLog?.updated || 0;
  let errors = existingLog?.errors || 0;

  const fieldMapping = integration.field_mapping as Record<string, string>;
  const paginationEnabled = integration.pagination_enabled === true;
  const pageSize = integration.pagination_page_size || 100;
  const paramOffset = integration.pagination_param_offset || "offset";
  const paramLimit = integration.pagination_param_limit || "limit";
  const orderBy = integration.pagination_order_by || "";

  // Build API headers
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

  // Load lookup maps for @-prefixed fields
  const { unitMap, esnMap, gsnMap } = await loadLookupMaps(admin);

  const updateProgress = async () => {
    await admin.from("sync_logs").update({
      heartbeat_at: new Date().toISOString(),
      current_offset: currentOffset,
      pages_processed: pagesProcessed,
      records_fetched: recordsFetched,
      inserted, updated, errors,
      total_records: recordsFetched,
    }).eq("id", logId);
  };

  // Resolve @lookup fields to actual IDs
  const resolveLookups = (row: Record<string, any>) => {
    if (row["@unit_code"]) {
      const code = String(row["@unit_code"]).trim().toLowerCase();
      row["unit_id"] = unitMap.get(code) || null;
      delete row["@unit_code"];
    }
    if (row["@esn_code"]) {
      const code = String(row["@esn_code"]).trim().toLowerCase();
      row["esn_id"] = esnMap.get(code) || null;
      delete row["@esn_code"];
    }
    if (row["@gsn_code"]) {
      const code = String(row["@gsn_code"]).trim().toLowerCase();
      row["gsn_id"] = gsnMap.get(code) || null;
      delete row["@gsn_code"];
    }
  };

  // Process records in batch
  const processRecords = async (records: any[]) => {
    const mapped: any[] = [];
    for (const record of records) {
      const row: Record<string, any> = {};
      for (const [apiField, systemField] of Object.entries(fieldMapping)) {
        if (record[apiField] !== undefined) {
          row[systemField] = String(record[apiField] ?? "");
        }
      }
      if (!row.code || !row.name) { errors++; continue; }
      if (!row.cnpj) row.cnpj = "";
      if (!row.store_code) row.store_code = "";

      // Resolve lookup fields (@unit_code, @esn_code, @gsn_code → IDs)
      resolveLookups(row);

      mapped.push(row);
    }

    if (mapped.length === 0) return;

    // Batch: get all existing codes in one query
    const codes = mapped.map(r => r.code);
    const { data: existingClients } = await admin.from("clients")
      .select("id, code, store_code")
      .in("code", codes);

    const existingMap = new Map<string, string>();
    if (existingClients) {
      for (const c of existingClients) {
        existingMap.set(`${c.code}|${c.store_code || ""}`, c.id);
      }
    }

    const toInsert: any[] = [];
    const toUpdate: { id: string; row: any }[] = [];

    for (const row of mapped) {
      const key = `${row.code}|${row.store_code || ""}`;
      const existingId = existingMap.get(key);
      if (existingId) {
        toUpdate.push({ id: existingId, row });
      } else {
        toInsert.push(row);
      }
    }

    // Batch insert
    if (toInsert.length > 0) {
      const { error: insErr, data: insData } = await admin.from("clients").insert(toInsert).select("id");
      if (insErr) {
        console.error("Batch insert error:", insErr.message);
        for (const row of toInsert) {
          try {
            await admin.from("clients").insert(row);
            inserted++;
          } catch { errors++; }
        }
      } else {
        inserted += insData?.length || toInsert.length;
      }
    }

    // Batch update (must be one by one due to different where clauses)
    for (const { id, row } of toUpdate) {
      try {
        await admin.from("clients").update(row).eq("id", id);
        updated++;
      } catch { errors++; }
    }
  };

  // Fetch one page
  const fetchPage = async (): Promise<{ records: any[]; curlCmd: string; httpStatus: number; responsePreview: string; duration: number }> => {
    let url: string;
    let fetchOpts: RequestInit;
    const startTime = Date.now();

    if (paginationEnabled && integration.http_method === "POST") {
      url = integration.endpoint_url;
      let bodyObj: Record<string, any> = {};
      if (integration.body_template) {
        try { bodyObj = JSON.parse(integration.body_template); } catch { /* empty */ }
      }

      if (bodyObj.sqlScript && typeof bodyObj.sqlScript === "string") {
        bodyObj.sqlScript = buildPaginatedSqlScript(bodyObj.sqlScript, pageSize, currentOffset, orderBy || undefined);
      } else if (paginationEnabled) {
        bodyObj[paramOffset] = currentOffset;
        bodyObj[paramLimit] = pageSize;
      }

      fetchOpts = { method: "POST", headers: apiHeaders, body: JSON.stringify(bodyObj) };
    } else if (paginationEnabled) {
      const sep = integration.endpoint_url.includes("?") ? "&" : "?";
      url = `${integration.endpoint_url}${sep}${paramOffset}=${currentOffset}&${paramLimit}=${pageSize}`;
      fetchOpts = { method: "GET", headers: apiHeaders };
    } else {
      url = integration.endpoint_url;
      fetchOpts = { method: integration.http_method, headers: apiHeaders };
      if (integration.http_method === "POST" && integration.body_template) {
        fetchOpts.body = integration.body_template;
      }
    }

    const curlCmd = buildCurlLog(fetchOpts.method || "GET", url, apiHeaders, fetchOpts.body as string | undefined);
    console.log(`Page ${pagesProcessed + 1}: offset=${currentOffset}, limit=${pageSize}`);

    const apiRes = await fetch(url, fetchOpts);
    const responseText = await apiRes.text();
    const duration = Date.now() - startTime;

    if (!apiRes.ok) {
      throw new Error(`HTTP ${apiRes.status}: ${responseText.substring(0, 300)}`);
    }

    let rawData;
    try { rawData = JSON.parse(responseText); } catch {
      throw new Error(`Resposta não é JSON válido: ${responseText.substring(0, 200)}`);
    }

    const records = Array.isArray(rawData)
      ? rawData
      : rawData.data || rawData.items || rawData.results || [rawData];

    return { records, curlCmd, httpStatus: apiRes.status, responsePreview: responseText.substring(0, 500), duration };
  };

  // Main loop - process pages until done or time budget exceeded
  const MAX_EXECUTION_MS = 120_000;
  const startExecution = Date.now();
  let hasMore = true;

  try {
    while (hasMore) {
      if (Date.now() - startExecution > MAX_EXECUTION_MS) {
        await updateProgress();
        const nextBody = JSON.stringify({ integrationId, syncLogId: logId, _serviceChain: true });
        fetch(`${supabaseUrl}/functions/v1/sync-api-clients`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: nextBody,
        }).catch((e) => console.error("Self-chain error:", e));
        console.log(`Time budget exceeded, self-chaining. Pages: ${pagesProcessed}, Offset: ${currentOffset}`);
        return;
      }

      let result;
      try {
        result = await fetchPage();
      } catch (err: any) {
        await admin.from("sync_log_events").insert({
          sync_log_id: logId,
          page_number: pagesProcessed + 1,
          page_offset: currentOffset,
          http_status: 0,
          error_message: err.message,
          curl_command: "",
        });

        await admin.from("sync_logs").update({
          status: "error",
          finished_at: new Date().toISOString(),
          error_message: err.message,
          heartbeat_at: new Date().toISOString(),
          current_offset: currentOffset,
          pages_processed: pagesProcessed,
          records_fetched: recordsFetched,
          inserted, updated, errors,
          total_records: recordsFetched,
        }).eq("id", logId);

        await admin.from("api_integrations").update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: "error",
          last_sync_message: err.message.substring(0, 200),
        }).eq("id", integrationId);

        return;
      }

      const { records, curlCmd, httpStatus, responsePreview, duration } = result;

      pagesProcessed++;
      recordsFetched += records.length;

      await admin.from("sync_log_events").insert({
        sync_log_id: logId,
        page_number: pagesProcessed,
        page_offset: currentOffset,
        http_status: httpStatus,
        records_in_page: records.length,
        curl_command: curlCmd,
        response_preview: responsePreview,
        duration_ms: duration,
      });

      await processRecords(records);
      await updateProgress();

      if (!paginationEnabled || records.length < pageSize) {
        hasMore = false;
      } else {
        currentOffset += pageSize;
      }
    }

    const message = `Inseridos: ${inserted}, Atualizados: ${updated}, Erros: ${errors}`;
    await admin.from("sync_logs").update({
      status: "success",
      finished_at: new Date().toISOString(),
      heartbeat_at: new Date().toISOString(),
      inserted, updated, errors,
      total_records: recordsFetched,
      records_fetched: recordsFetched,
      pages_processed: pagesProcessed,
      current_offset: currentOffset,
    }).eq("id", logId);

    await admin.from("api_integrations").update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: "success",
      last_sync_message: message,
    }).eq("id", integrationId);

    console.log(`Sync complete: ${message}`);

  } catch (err: any) {
    console.error("processSync error:", err);
    await admin.from("sync_logs").update({
      status: "error",
      finished_at: new Date().toISOString(),
      error_message: err.message,
      heartbeat_at: new Date().toISOString(),
      inserted, updated, errors,
      total_records: recordsFetched,
    }).eq("id", logId);
  }
}
