import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface LogEntry {
  step: string;
  status: "ok" | "error" | "info";
  message: string;
  timestamp: string;
}

function log(logs: LogEntry[], step: string, status: LogEntry["status"], message: string) {
  logs.push({ step, status, message, timestamp: new Date().toISOString() });
}

function respondWithLogs(logs: LogEntry[], extra: Record<string, any> = {}, status = 200) {
  return new Response(JSON.stringify({ logs, ...extra }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const logs: LogEntry[] = [];

  try {
    // 1. Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate user via anon client
    const anonSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await anonSupabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log(logs, "Autenticação", "ok", `Usuário: ${user.email}`);

    // 2. Parse body
    const { proposalId } = await req.json();
    if (!proposalId) {
      log(logs, "Validação", "error", "proposalId é obrigatório");
      return respondWithLogs(logs, {}, 400);
    }

    // 3. Find active signature record using admin client (bypasses RLS)
    const { data: sigRecord, error: sigErr } = await adminSupabase
      .from("proposal_signatures")
      .select("*")
      .eq("proposal_id", proposalId)
      .in("status", ["pending", "sent"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sigErr) {
      log(logs, "Dados", "error", `Erro ao buscar assinatura: ${sigErr.message}`);
      return respondWithLogs(logs, {}, 500);
    }

    if (!sigRecord) {
      log(logs, "Dados", "error", `Nenhum registro de assinatura ativo encontrado (status pending/sent) para esta proposta`);
      return respondWithLogs(logs, {}, 400);
    }

    log(logs, "Dados", "ok", `Registro de assinatura encontrado: ${sigRecord.id} (status: ${sigRecord.status})`);

    const taeDocumentId = sigRecord.tae_document_id;

    if (!taeDocumentId) {
      log(logs, "TAE", "info", "Sem ID de documento TAE — cancelamento apenas local");
      await adminSupabase
        .from("proposal_signatures")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", sigRecord.id);
      await adminSupabase
        .from("proposals")
        .update({ status: "proposta_gerada" })
        .eq("id", proposalId);

      log(logs, "Finalização", "ok", "Cancelamento local concluído (sem registro no TAE)");
      return respondWithLogs(logs, { cancelled: true, taeStatus: "local_only" });
    }

    // 4. Get TAE config
    const { data: taeConfig } = await adminSupabase.from("tae_config").select("*").maybeSingle();
    if (!taeConfig) {
      log(logs, "TAE Config", "error", "Configuração TAE não encontrada");
      return respondWithLogs(logs, {}, 500);
    }

    const taePassword = Deno.env.get("TAE_SERVICE_USER_PASSWORD");
    if (!taeConfig.service_user_email || !taePassword) {
      log(logs, "TAE Config", "error", "Credenciais do usuário de serviço TAE não configuradas");
      return respondWithLogs(logs, {}, 500);
    }

    const baseUrl = taeConfig.base_url;
    log(logs, "TAE Config", "ok", `Ambiente: ${taeConfig.environment}`);

    // 5. Login to TAE
    log(logs, "TAE Login", "info", "Autenticando no TAE...");
    const loginRes = await fetch(`${baseUrl}/identityintegration/v3/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userName: taeConfig.service_user_email,
        password: taePassword,
      }),
    });
    if (!loginRes.ok) {
      const loginBody = await loginRes.text();
      log(logs, "TAE Login", "error", `Falha no login TAE (${loginRes.status}): ${loginBody.substring(0, 300)}`);
      return respondWithLogs(logs, {}, 500);
    }
    const loginBody = await loginRes.text();
    let loginData: any;
    try { loginData = JSON.parse(loginBody); } catch { loginData = {}; }
    const taeToken = loginData.access_token || loginData.token || loginData.data?.access_token || loginData.data?.token;
    if (!taeToken) {
      log(logs, "TAE Login", "error", `Token não retornado pelo TAE`);
      return respondWithLogs(logs, {}, 500);
    }
    log(logs, "TAE Login", "ok", "Login TAE realizado com sucesso");

    // 6. Cancel publication in TAE using POST /v1/publicacoes/{id}/cancelar
    // This is the correct endpoint for cancelling published documents (not DELETE which is for drafts only)
    log(logs, "TAE Cancelamento", "info", `Cancelando documento ${taeDocumentId} no TAE via POST /v1/publicacoes/{id}/cancelar...`);

    const cancelRes = await fetch(`${baseUrl}/documents/v1/publicacoes/${taeDocumentId}/cancelar`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${taeToken}`,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    });

    const cancelRaw = await cancelRes.text();

    if (cancelRes.ok) {
      log(logs, "TAE Cancelamento", "ok", `Documento cancelado no TAE com sucesso`);
    } else if (cancelRes.status === 400) {
      log(logs, "TAE Cancelamento", "info", `TAE retornou 400: ${cancelRaw.substring(0, 300)}. O documento pode já estar finalizado/cancelado. Prosseguindo com cancelamento local.`);
    } else if (cancelRes.status === 403 || cancelRes.status === 401) {
      log(logs, "TAE Cancelamento", "info", `TAE retornou ${cancelRes.status}: sem permissão para cancelar. Prosseguindo com cancelamento local.`);
    } else {
      log(logs, "TAE Cancelamento", "info", `TAE retornou ${cancelRes.status}: ${cancelRaw.substring(0, 300)}. Prosseguindo com cancelamento local.`);
    }

    // 7. Update local records regardless of TAE result
    await adminSupabase
      .from("proposal_signatures")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", sigRecord.id);

    await adminSupabase
      .from("proposals")
      .update({ status: "proposta_gerada" })
      .eq("id", proposalId);

    log(logs, "Finalização", "ok", "Processo de assinatura cancelado. Status voltou para Proposta Gerada.");

    // Log signature event
    await adminSupabase.from("signature_events").insert({
      signature_id: sigRecord.id,
      proposal_id: proposalId,
      event_type: "cancelled",
      title: "Assinatura cancelada pelo usuário",
      description: cancelRes.ok
        ? "O processo foi cancelado no TAE e localmente. Status revertido para Proposta Gerada."
        : "Cancelamento local realizado. O TAE pode requerer cancelamento manual.",
    });

    return respondWithLogs(logs, {
      cancelled: true,
      taeStatus: cancelRes.ok ? "cancelled_in_tae" : "local_only",
    });
  } catch (err: any) {
    log(logs, "Erro inesperado", "error", err.message);
    return respondWithLogs(logs, {}, 500);
  }
});
