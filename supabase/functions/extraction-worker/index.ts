import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-worker-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Error classification
type ErrorCode =
  | "INSUFFICIENT_CREDITS"
  | "RATE_LIMIT"
  | "TRANSIENT_UPSTREAM"
  | "VALIDATION_ERROR"
  | "PARSE_ERROR"
  | "TIMEOUT"
  | "INTERNAL";

function classifyError(status: number, message: string): { code: ErrorCode; retryable: boolean } {
  if (status === 402 || message.includes("Créditos") || message.includes("créditos")) {
    return { code: "INSUFFICIENT_CREDITS", retryable: false };
  }
  if (status === 429) {
    return { code: "RATE_LIMIT", retryable: true };
  }
  if (status >= 500 || message.includes("timeout") || message.includes("TIMEOUT")) {
    return { code: "TRANSIENT_UPSTREAM", retryable: true };
  }
  if (message.includes("não encontrada") || message.includes("obrigatório")) {
    return { code: "VALIDATION_ERROR", retryable: false };
  }
  if (message.includes("parse") || message.includes("JSON") || message.includes("interpretar")) {
    return { code: "PARSE_ERROR", retryable: false };
  }
  return { code: "INTERNAL", retryable: true };
}

function computeBackoff(attempt: number): number {
  const base = 15_000; // 15 seconds
  const maxDelay = 300_000; // 5 minutes
  const jitter = Math.random() * 5_000;
  return Math.min(base * Math.pow(2, attempt) + jitter, maxDelay);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ─── Security: validate worker secret ───
    const workerSecret = Deno.env.get("EXTRACTION_WORKER_SECRET");
    const providedSecret = req.headers.get("X-Worker-Secret");
    const authHeader = req.headers.get("Authorization");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    // Accept: X-Worker-Secret, service role key, or anon key (for pg_cron via pg_net)
    const isAuthorized =
      (workerSecret && providedSecret === workerSecret) ||
      (authHeader === `Bearer ${serviceRoleKey}`) ||
      (anonKey && authHeader === `Bearer ${anonKey}`);

    if (!isAuthorized) {
      console.error("Worker: unauthorized invocation");
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const startTime = Date.now();
    const MAX_EXECUTION_MS = 140_000; // 140s safety (edge function limit ~150s)

    // ─── Watchdog: fail stuck jobs ───
    const { data: stuckJobs } = await admin
      .from("extraction_jobs")
      .update({
        status: "failed",
        error_code: "TIMEOUT",
        error_message: "Heartbeat expirado — job travado",
        retryable: false,
        finished_at: new Date().toISOString(),
      })
      .eq("status", "running")
      .lt("heartbeat_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .select("id");

    if (stuckJobs && stuckJobs.length > 0) {
      console.log(`Watchdog: marked ${stuckJobs.length} stuck jobs as failed`);
    }

    // ─── Claim jobs ───
    // Use raw SQL via RPC for FOR UPDATE SKIP LOCKED (not available via PostgREST)
    const { data: claimedIds, error: claimErr } = await admin.rpc("claim_extraction_jobs", {
      max_jobs: 10,
    });

    if (claimErr) {
      console.error("Claim error:", claimErr);
      // Fallback: simple select + update without SKIP LOCKED
      const { data: fallbackJobs } = await admin
        .from("extraction_jobs")
        .select("id")
        .eq("status", "queued")
        .lte("available_at", new Date().toISOString())
        .gt("deadline_at", new Date().toISOString())
        .order("priority", { ascending: true })
        .order("available_at", { ascending: true })
        .limit(10);

      if (!fallbackJobs || fallbackJobs.length === 0) {
        return json({ processed: 0, message: "No jobs available" });
      }

      // Mark as running
      for (const j of fallbackJobs) {
        await admin
          .from("extraction_jobs")
          .update({
            status: "running",
            started_at: new Date().toISOString(),
            heartbeat_at: new Date().toISOString(),
            first_attempt_at: new Date().toISOString(),
          })
          .eq("id", j.id)
          .eq("status", "queued"); // optimistic lock
      }

      // Process
      const results = await processJobs(
        fallbackJobs.map((j: any) => j.id),
        admin,
        supabaseUrl,
        serviceRoleKey,
        startTime,
        MAX_EXECUTION_MS
      );

      return json(results);
    }

    if (!claimedIds || claimedIds.length === 0) {
      return json({ processed: 0, message: "No jobs in queue" });
    }

    const results = await processJobs(
      claimedIds.map((r: any) => r.id),
      admin,
      supabaseUrl,
      serviceRoleKey,
      startTime,
      MAX_EXECUTION_MS
    );

    return json(results);
  } catch (err) {
    console.error("extraction-worker error:", err);
    return json({ error: "Internal error", details: String(err) }, 500);
  }
});

async function processJobs(
  jobIds: string[],
  admin: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  startTime: number,
  maxMs: number
) {
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let creditExhausted = false;

  // Process in parallel blocks of 3
  for (let i = 0; i < jobIds.length; i += 3) {
    // Time check
    if (Date.now() - startTime > maxMs) {
      console.log("Worker: time limit approaching, stopping");
      // Re-queue remaining jobs
      for (let j = i; j < jobIds.length; j++) {
        await admin
          .from("extraction_jobs")
          .update({ status: "queued", heartbeat_at: null, started_at: null })
          .eq("id", jobIds[j])
          .eq("status", "running");
      }
      break;
    }

    if (creditExhausted) {
      // Mark remaining as failed with INSUFFICIENT_CREDITS
      for (let j = i; j < jobIds.length; j++) {
        await admin
          .from("extraction_jobs")
          .update({
            status: "failed",
            error_code: "INSUFFICIENT_CREDITS",
            error_message: "Créditos de IA insuficientes",
            retryable: false,
            finished_at: new Date().toISOString(),
          })
          .eq("id", jobIds[j]);
      }
      failed += jobIds.length - i;
      break;
    }

    const batch = jobIds.slice(i, i + 3);
    const results = await Promise.allSettled(
      batch.map((jobId) => processOneJob(jobId, admin, supabaseUrl, serviceRoleKey))
    );

    for (const r of results) {
      processed++;
      if (r.status === "fulfilled") {
        if (r.value.success) {
          succeeded++;
        } else {
          failed++;
          if (r.value.errorCode === "INSUFFICIENT_CREDITS") {
            creditExhausted = true;
          }
        }
      } else {
        failed++;
      }
    }
  }

  return { processed, succeeded, failed, credit_exhausted: creditExhausted };
}

async function processOneJob(
  jobId: string,
  admin: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<{ success: boolean; errorCode?: string }> {
  // Fetch job details
  const { data: job, error: jErr } = await admin
    .from("extraction_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (jErr || !job) {
    console.error(`Job ${jobId}: not found`);
    return { success: false, errorCode: "INTERNAL" };
  }

  // Check cancellation
  if (job.cancel_requested_at) {
    await admin
      .from("extraction_jobs")
      .update({
        status: "cancelled",
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    return { success: false, errorCode: "CANCELLED" };
  }

  // Update attempt counter and heartbeat
  await admin
    .from("extraction_jobs")
    .update({
      status: "running",
      attempt: (job.attempt || 0) + 1,
      started_at: job.started_at || new Date().toISOString(),
      heartbeat_at: new Date().toISOString(),
      first_attempt_at: job.first_attempt_at || new Date().toISOString(),
    })
    .eq("id", jobId);

  // Setup heartbeat interval (every 30s)
  const heartbeatInterval = setInterval(async () => {
    try {
      await admin
        .from("extraction_jobs")
        .update({ heartbeat_at: new Date().toISOString() })
        .eq("id", jobId)
        .eq("status", "running");
    } catch (e) {
      console.error(`Heartbeat failed for job ${jobId}:`, e);
    }
  }, 30_000);

  try {
    // Call the existing extract-software-proposal function
    const extractUrl = `${supabaseUrl}/functions/v1/extract-software-proposal`;
    const response = await fetch(extractUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ software_proposal_id: job.proposal_id }),
    });

    const data = await response.json();

    clearInterval(heartbeatInterval);

    if (!response.ok || data?.error) {
      const errMsg = data?.error || data?.message || "Extraction failed";
      const { code, retryable } = classifyError(response.status, errMsg);

      // Should retry?
      const newAttempt = (job.attempt || 0) + 1;
      const canRetry =
        retryable &&
        newAttempt < (job.max_attempts || 3) &&
        new Date(job.deadline_at) > new Date();

      if (canRetry) {
        const backoffMs = computeBackoff(newAttempt);
        const nextAvailable = new Date(Date.now() + backoffMs).toISOString();
        await admin
          .from("extraction_jobs")
          .update({
            status: "queued",
            error_code: code,
            error_message: errMsg.substring(0, 500),
            retryable: true,
            available_at: nextAvailable,
            heartbeat_at: null,
          })
          .eq("id", jobId);
        console.log(`Job ${jobId}: retry scheduled (attempt ${newAttempt}, next at ${nextAvailable})`);
        return { success: false, errorCode: code };
      }

      // Permanent failure
      await admin
        .from("extraction_jobs")
        .update({
          status: "failed",
          error_code: code,
          error_message: errMsg.substring(0, 500),
          retryable: false,
          finished_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      console.log(`Job ${jobId}: permanently failed with ${code}`);
      return { success: false, errorCode: code };
    }

    // Success
    await admin
      .from("extraction_jobs")
      .update({
        status: "success",
        items_extracted: data.items_extracted || 0,
        issues_created: data.issues_created || 0,
        finished_at: new Date().toISOString(),
        error_code: null,
        error_message: null,
      })
      .eq("id", jobId);

    console.log(`Job ${jobId}: success (${data.items_extracted} items, ${data.issues_created} issues)`);
    return { success: true };
  } catch (err) {
    clearInterval(heartbeatInterval);

    const errMsg = String(err);
    const { code, retryable } = classifyError(0, errMsg);

    const newAttempt = (job.attempt || 0) + 1;
    const canRetry =
      retryable &&
      newAttempt < (job.max_attempts || 3) &&
      new Date(job.deadline_at) > new Date();

    if (canRetry) {
      const backoffMs = computeBackoff(newAttempt);
      await admin
        .from("extraction_jobs")
        .update({
          status: "queued",
          error_code: code,
          error_message: errMsg.substring(0, 500),
          retryable: true,
          available_at: new Date(Date.now() + backoffMs).toISOString(),
          heartbeat_at: null,
        })
        .eq("id", jobId);
    } else {
      await admin
        .from("extraction_jobs")
        .update({
          status: "failed",
          error_code: code,
          error_message: errMsg.substring(0, 500),
          retryable: false,
          finished_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    }

    console.error(`Job ${jobId}: exception`, err);
    return { success: false, errorCode: code };
  }
}
