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

// ════════════════════════════════════════════════════════════════════
// P2.4 — State machine (shared logic)
// ════════════════════════════════════════════════════════════════════
const SIGNATURE_VALID_TRANSITIONS: Record<string, Set<string>> = {
  pending: new Set(["sent", "completed", "cancelled"]),
  sent: new Set(["completed", "cancelled"]),
  completed: new Set([]),
  cancelled: new Set([]),
};

function canTransitionSignature(current: string, next: string): boolean {
  if (current === next) return false;
  return SIGNATURE_VALID_TRANSITIONS[current]?.has(next) ?? false;
}

// ════════════════════════════════════════════════════════════════════
// P3.1 — Robust TAE HTTP client with timeout and retry
// ════════════════════════════════════════════════════════════════════
const TAE_TIMEOUT_MS = 15000;
const TAE_MAX_RETRIES = 2;

async function taeFetch(url: string, options: RequestInit = {}, label = ""): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= TAE_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
      await new Promise(r => setTimeout(r, delay));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TAE_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if ((res.status === 429 || (res.status >= 500 && res.status !== 501)) && attempt < TAE_MAX_RETRIES) {
        await res.text();
        lastError = new Error(`TAE ${res.status}`);
        continue;
      }
      return res;
    } catch (err: any) {
      clearTimeout(timer);
      lastError = err;
      if (attempt >= TAE_MAX_RETRIES) break;
    }
  }
  throw lastError || new Error(`taeFetch failed: ${label}`);
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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminSupabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const anonSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await anonSupabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log(logs, "Autenticação", "ok", `Usuário: ${user.email}`);

    // 2. Parse body
    const { proposalId } = await req.json();
    if (!proposalId) {
      log(logs, "Validação", "error", "proposalId é obrigatório");
      return respondWithLogs(logs, {}, 400);
    }

    // 3. Find active signature record
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
      log(logs, "Dados", "error", "Nenhum registro ativo encontrado (status pending/sent)");
      return respondWithLogs(logs, {}, 400);
    }

    // P2.4: Check if cancellation transition is valid
    if (!canTransitionSignature(sigRecord.status, "cancelled")) {
      log(logs, "Validação", "error", `Transição ${sigRecord.status} → cancelled não permitida pela máquina de estados`);
      return respondWithLogs(logs, {}, 400);
    }

    log(logs, "Dados", "ok", `Registro: ${sigRecord.id} (status: ${sigRecord.status})`);

    const taeDocumentId = sigRecord.tae_document_id;
    let taePublicationId = sigRecord.tae_publication_id;
    const hadRealTaeSend = !!(taeDocumentId || taePublicationId);

    if (!hadRealTaeSend) {
      log(logs, "TAE", "info", "Sem ID de documento TAE — cancelamento apenas local");
      await adminSupabase.from("proposal_signatures")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", sigRecord.id);
      // P1.3: No real TAE send → proposta_gerada
      await adminSupabase.from("proposals").update({ status: "proposta_gerada" }).eq("id", proposalId);
      log(logs, "Finalização", "ok", "Cancelamento local concluído. Status: proposta_gerada");
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
      log(logs, "TAE Config", "error", "Credenciais TAE não configuradas");
      return respondWithLogs(logs, {}, 500);
    }

    const baseUrl = taeConfig.base_url;
    log(logs, "TAE Config", "ok", `Ambiente: ${taeConfig.environment}`);

    // 5. Login to TAE
    log(logs, "TAE Login", "info", "Autenticando no TAE...");
    const loginRes = await fetch(`${baseUrl}/identityintegration/v3/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName: taeConfig.service_user_email, password: taePassword }),
    });
    if (!loginRes.ok) {
      const loginBody = await loginRes.text();
      log(logs, "TAE Login", "error", `Falha (${loginRes.status}): ${loginBody.substring(0, 300)}`);
      return respondWithLogs(logs, {}, 500);
    }
    const loginBody = await loginRes.text();
    let loginData: any;
    try { loginData = JSON.parse(loginBody); } catch { loginData = {}; }
    const taeToken = loginData.access_token || loginData.token || loginData.data?.access_token || loginData.data?.token;
    if (!taeToken) {
      log(logs, "TAE Login", "error", "Token não retornado");
      return respondWithLogs(logs, {}, 500);
    }
    log(logs, "TAE Login", "ok", "Login realizado");

    // 6. P1.2: Resolve publication ID if missing
    if (!taePublicationId && taeDocumentId) {
      log(logs, "TAE Resolução", "info", `Resolvendo publication ID do document ${taeDocumentId}...`);
      try {
        const siRes = await fetch(`${baseUrl}/signintegration/v2/Publicacoes/documentos-empresa`, {
          method: "POST",
          headers: { Authorization: `Bearer ${taeToken}`, "Content-Type": "application/json" },
          body: JSON.stringify([Number(taeDocumentId)]),
        });
        if (siRes.ok) {
          const siRaw = await siRes.text();
          let siParsed: any;
          try { siParsed = JSON.parse(siRaw); } catch { /* */ }
          const siData = siParsed?.data || siParsed;
          const items = Array.isArray(siData) ? siData : [siData];
          const match = items.find((item: any) =>
            String(item?.idDocumento || item?.documentoId || item?.id || "") === String(taeDocumentId)
          ) || (items.length > 0 ? items[0] : null);

          if (match) {
            const resolved = String(
              match?.idPublicacao || match?.publicacaoId ||
              match?.publicacao?.id || match?.publicacoes?.[0]?.id ||
              match?.publicacoes?.[0]?.idPublicacao || ""
            ).trim() || null;
            if (resolved) {
              taePublicationId = resolved;
              log(logs, "TAE Resolução", "ok", `Publication ID resolvido: ${taePublicationId}`);
              // Persist resolved ID
              await adminSupabase.from("proposal_signatures")
                .update({ tae_publication_id: taePublicationId })
                .eq("id", sigRecord.id);
            }
          }
        }
      } catch (e: any) {
        log(logs, "TAE Resolução", "info", `Falha: ${e.message}`);
      }
    }

    // 7. Cancel publication in TAE
    let cancelRes: Response | null = null;
    let cancelRaw = "";

    if (taePublicationId) {
      log(logs, "TAE Cancelamento", "info", `Cancelando publicação ${taePublicationId}...`);
      cancelRes = await fetch(`${baseUrl}/documents/v1/publicacoes/${taePublicationId}/cancelar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${taeToken}`, Accept: "application/json", "Content-Type": "application/json" },
      });
      cancelRaw = await cancelRes.text();

      if (cancelRes.ok) {
        log(logs, "TAE Cancelamento", "ok", "Cancelado no TAE");
      } else if (cancelRes.status === 400) {
        log(logs, "TAE Cancelamento", "info", `TAE 400: ${cancelRaw.substring(0, 300)}. Pode já estar finalizado/cancelado.`);
      } else {
        log(logs, "TAE Cancelamento", "info", `TAE ${cancelRes.status}: ${cancelRaw.substring(0, 300)}.`);
      }
    } else {
      log(logs, "TAE Cancelamento", "info", `Publication ID não resolvido (doc: ${taeDocumentId}). Apenas cancelamento local.`);
    }

    // 8. Update local records
    await adminSupabase.from("proposal_signatures")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", sigRecord.id);

    // P1.3: Real TAE send → pendente
    await adminSupabase.from("proposals").update({ status: "pendente" }).eq("id", proposalId);

    log(logs, "Finalização", "ok", "Cancelado. Status → Pendente.");

    const cancelSuccess = cancelRes?.ok ?? false;
    await adminSupabase.from("signature_events").insert({
      signature_id: sigRecord.id,
      proposal_id: proposalId,
      event_type: "cancelled",
      title: "Assinatura cancelada pelo usuário",
      description: cancelSuccess
        ? "Cancelado no TAE e localmente. Status → Pendente."
        : taePublicationId
          ? "Cancelamento local. TAE pode requerer cancelamento manual."
          : "Cancelamento local. Publication ID não resolvido.",
    });

    return respondWithLogs(logs, { cancelled: true, taeStatus: cancelSuccess ? "cancelled_in_tae" : "local_only" });
  } catch (err: any) {
    log(logs, "Erro inesperado", "error", err.message);
    return respondWithLogs(logs, {}, 500);
  }
});
