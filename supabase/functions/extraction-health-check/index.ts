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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const workerSecret = Deno.env.get("EXTRACTION_WORKER_SECRET");
    const providedSecret = req.headers.get("X-Worker-Secret");
    const authHeader = req.headers.get("Authorization");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const isAuthorized =
      (workerSecret && providedSecret === workerSecret) ||
      (authHeader === `Bearer ${serviceRoleKey}`);

    if (!isAuthorized) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // 1. Queue stats
    const { data: stats } = await admin
      .from("extraction_jobs")
      .select("status");

    const counts = { queued: 0, running: 0, success: 0, failed: 0, cancelled: 0 };
    for (const j of stats || []) {
      if (j.status in counts) (counts as any)[j.status]++;
    }

    // 2. Stuck jobs (running with old heartbeat)
    const { data: stuck } = await admin
      .from("extraction_jobs")
      .select("id")
      .eq("status", "running")
      .lt("heartbeat_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());

    // 3. Stale queued (queued with available_at > 15 min ago)
    const { data: stale } = await admin
      .from("extraction_jobs")
      .select("id")
      .eq("status", "queued")
      .lt("available_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());

    // 4. Recent failures (last 30 min)
    const { data: recentFails } = await admin
      .from("extraction_jobs")
      .select("id, error_code")
      .eq("status", "failed")
      .gte("finished_at", new Date(Date.now() - 30 * 60 * 1000).toISOString());

    const alerts: string[] = [];

    if ((stuck?.length || 0) > 0) {
      alerts.push(`ALERT: ${stuck!.length} stuck jobs (running with expired heartbeat)`);
    }
    if ((stale?.length || 0) > 0) {
      alerts.push(`ALERT: ${stale!.length} stale queued jobs (waiting > 15 min)`);
    }
    if ((recentFails?.length || 0) >= 3) {
      alerts.push(`ALERT: ${recentFails!.length} failures in last 30 min`);
    }
    if (counts.queued > 20) {
      alerts.push(`ALERT: queue growing (${counts.queued} queued)`);
    }

    const healthy = alerts.length === 0;

    if (!healthy) {
      console.error("EXTRACTION HEALTH ALERTS:", JSON.stringify(alerts));
    }

    return json({
      healthy,
      alerts,
      counts,
      stuck_count: stuck?.length || 0,
      stale_queued_count: stale?.length || 0,
      recent_failures_30m: recentFails?.length || 0,
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Health check error:", err);
    return json({ error: "Internal error" }, 500);
  }
});
