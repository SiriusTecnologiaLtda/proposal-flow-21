import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error_code: "UNAUTHORIZED", message: "Não autorizado", retryable: false }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return json({ error_code: "UNAUTHORIZED", message: "Não autorizado", retryable: false }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();
    const { action } = body;

    // ─── ENQUEUE (single) ───
    if (action === "enqueue") {
      const { proposal_id } = body;
      if (!proposal_id) {
        return json({ error_code: "VALIDATION_ERROR", message: "proposal_id obrigatório", retryable: false }, 400);
      }

      // Verify proposal exists and user has access
      const { data: proposal, error: pErr } = await userClient
        .from("software_proposals")
        .select("id")
        .eq("id", proposal_id)
        .maybeSingle();

      if (pErr || !proposal) {
        return json({ error_code: "VALIDATION_ERROR", message: "Proposta não encontrada ou sem permissão", retryable: false }, 404);
      }

      // Transactional idempotency: check for active job then insert
      const { data: existing } = await adminClient
        .from("extraction_jobs")
        .select("id, status")
        .eq("proposal_id", proposal_id)
        .in("status", ["queued", "running"])
        .maybeSingle();

      if (existing) {
        return json({ job_id: existing.id, status: existing.status, is_existing: true });
      }

      const { data: newJob, error: insertErr } = await adminClient
        .from("extraction_jobs")
        .insert({
          proposal_id,
          requested_by: user.id,
          source: body.source || "manual",
          priority: 10,
        })
        .select("id, status")
        .single();

      if (insertErr) {
        // Exclusion constraint violation → job already exists (race condition)
        if (insertErr.code === "23P01") {
          const { data: raceJob } = await adminClient
            .from("extraction_jobs")
            .select("id, status")
            .eq("proposal_id", proposal_id)
            .in("status", ["queued", "running"])
            .maybeSingle();
          return json({ job_id: raceJob?.id, status: raceJob?.status, is_existing: true });
        }
        console.error("Insert error:", insertErr);
        return json({ error_code: "INTERNAL", message: "Erro ao enfileirar", retryable: true }, 500);
      }

      return json({ job_id: newJob.id, status: newJob.status, is_existing: false });
    }

    // ─── ENQUEUE BULK ───
    if (action === "enqueue_bulk") {
      const { proposal_ids } = body;
      if (!Array.isArray(proposal_ids) || proposal_ids.length === 0) {
        return json({ error_code: "VALIDATION_ERROR", message: "proposal_ids obrigatório", retryable: false }, 400);
      }

      const batchId = crypto.randomUUID();
      let created = 0;
      let skipped = 0;

      for (const pid of proposal_ids) {
        // P1: Validate user has access to this proposal before enqueuing
        const { data: accessCheck, error: accessErr } = await userClient
          .from("software_proposals")
          .select("id")
          .eq("id", pid)
          .maybeSingle();

        if (accessErr || !accessCheck) {
          skipped++;
          continue;
        }

        // Check for existing active job
        const { data: existing } = await adminClient
          .from("extraction_jobs")
          .select("id")
          .eq("proposal_id", pid)
          .in("status", ["queued", "running"])
          .maybeSingle();

        if (existing) {
          skipped++;
          continue;
        }

        const { error: insertErr } = await adminClient
          .from("extraction_jobs")
          .insert({
            proposal_id: pid,
            batch_id: batchId,
            requested_by: user.id,
            source: body.source || "manual",
            priority: 100,
          });

        if (insertErr) {
          if (insertErr.code === "23P01") {
            skipped++;
          } else {
            console.error("Bulk insert error for", pid, insertErr);
            skipped++;
          }
        } else {
          created++;
        }
      }

      return json({ batch_id: batchId, jobs_created: created, jobs_skipped: skipped });
    }

    // ─── STATUS (single job) ───
    if (action === "status") {
      const { job_id } = body;
      if (!job_id) {
        return json({ error_code: "VALIDATION_ERROR", message: "job_id obrigatório", retryable: false }, 400);
      }

      const { data: job, error: jErr } = await userClient
        .from("extraction_jobs")
        .select("*")
        .eq("id", job_id)
        .maybeSingle();

      if (jErr || !job) {
        return json({ error_code: "NOT_FOUND", message: "Job não encontrado", retryable: false }, 404);
      }

      return json(job);
    }

    // ─── BATCH STATUS ───
    if (action === "batch_status") {
      const { batch_id } = body;
      if (!batch_id) {
        return json({ error_code: "VALIDATION_ERROR", message: "batch_id obrigatório", retryable: false }, 400);
      }

      const { data: jobs, error: bErr } = await userClient
        .from("extraction_jobs")
        .select("status")
        .eq("batch_id", batch_id);

      if (bErr) {
        return json({ error_code: "INTERNAL", message: "Erro ao consultar batch", retryable: true }, 500);
      }

      const counts = { total: 0, queued: 0, running: 0, success: 0, failed: 0, cancelled: 0 };
      for (const j of jobs || []) {
        counts.total++;
        if (j.status in counts) (counts as any)[j.status]++;
      }

      return json(counts);
    }

    // ─── CANCEL BATCH ───
    if (action === "cancel_batch") {
      const { batch_id, reason } = body;
      if (!batch_id) {
        return json({ error_code: "VALIDATION_ERROR", message: "batch_id obrigatório", retryable: false }, 400);
      }

      const { data: cancelled, error: cErr } = await adminClient
        .from("extraction_jobs")
        .update({
          status: "cancelled",
          cancel_requested_at: new Date().toISOString(),
          cancel_reason: reason || "Cancelado pelo usuário",
          finished_at: new Date().toISOString(),
        })
        .eq("batch_id", batch_id)
        .eq("status", "queued")
        .eq("requested_by", user.id)
        .select("id");

      if (cErr) {
        return json({ error_code: "INTERNAL", message: "Erro ao cancelar", retryable: true }, 500);
      }

      return json({ cancelled_count: cancelled?.length || 0 });
    }

    return json({ error_code: "VALIDATION_ERROR", message: `Ação desconhecida: ${action}`, retryable: false }, 400);
  } catch (err) {
    console.error("extraction-jobs error:", err);
    return json({ error_code: "INTERNAL", message: "Erro interno", retryable: true }, 500);
  }
});
