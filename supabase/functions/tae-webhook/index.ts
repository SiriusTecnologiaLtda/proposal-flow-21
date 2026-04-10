import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// TAE status codes → labels
const TAE_STATUS_MAP: Record<number, string> = {
  0: "Pendente",
  1: "Assinado parcialmente",
  2: "Finalizado",
  4: "Rejeitado",
  5: "Rascunho",
  6: "Pendente comigo",
  7: "Cancelado",
};

// ════════════════════════════════════════════════════════════════════
// P2.4 — Centralized state machine for signature and signatory status
// ════════════════════════════════════════════════════════════════════

// Signatory terminal states — once set, immutable (P1 preserved)
const SIGNATORY_TERMINAL = new Set(["signed", "rejected"]);

// Valid signatory transitions: only pending → signed|rejected
function canTransitionSignatory(current: string, next: string): boolean {
  if (current === next) return false;
  if (SIGNATORY_TERMINAL.has(current)) return false;
  if (!SIGNATORY_TERMINAL.has(next) && next !== "pending") return false;
  return true;
}

// Signature (envelope) valid transitions
const SIGNATURE_VALID_TRANSITIONS: Record<string, Set<string>> = {
  pending: new Set(["sent", "completed", "cancelled"]),
  sent: new Set(["completed", "cancelled"]),
  completed: new Set([]), // terminal
  cancelled: new Set([]), // terminal
};

function canTransitionSignature(current: string, next: string): boolean {
  if (current === next) return false;
  return SIGNATURE_VALID_TRANSITIONS[current]?.has(next) ?? false;
}

// Proposal status after cancel/reject: real TAE send → pendente; local only → proposta_gerada
function proposalStatusAfterCancelOrReject(hadRealTaeSend: boolean): string {
  return hadRealTaeSend ? "pendente" : "proposta_gerada";
}

// ════════════════════════════════════════════════════════════════════
// P1.1 (preserved) — Individual signer status mapping
// ════════════════════════════════════════════════════════════════════
function mapIndividualSignerStatus(input: {
  assinado?: boolean | null;
  rejeitado?: boolean | null;
  pendente?: boolean | null;
  statusAssinatura?: number | null;
  taeStatus?: number | null;
}): "pending" | "signed" | "rejected" {
  if (input.rejeitado === true || input.statusAssinatura === 3) return "rejected";
  if (input.assinado === true || input.statusAssinatura === 0 || input.pendente === false) return "signed";
  if (input.taeStatus === 4 || input.taeStatus === 7) return "rejected";
  return "pending";
}

// ════════════════════════════════════════════════════════════════════
// P2.3 — Email normalization helper
// ════════════════════════════════════════════════════════════════════
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ════════════════════════════════════════════════════════════════════
// P2.2 + P3.3 — Idempotency: compute a stable hash from the payload
// ════════════════════════════════════════════════════════════════════
async function computePayloadHash(payload: unknown): Promise<string> {
  const raw = JSON.stringify(payload);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ════════════════════════════════════════════════════════════════════
// P3.2 — Extract best completion date from TAE payload
// ════════════════════════════════════════════════════════════════════
function extractCompletionDate(flatPayload: Record<string, any>, flatData: Record<string, any>): string {
  const candidates = [
    flatPayload["datafinalizacao"], flatData["datafinalizacao"],
    flatPayload["dataconclusao"], flatData["dataconclusao"],
    flatPayload["datafinalizado"], flatData["datafinalizado"],
  ];
  for (const c of candidates) {
    if (c && typeof c === "string" && !isNaN(Date.parse(c))) return new Date(c).toISOString();
  }
  return new Date().toISOString();
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ─── P2.1: Webhook authentication via shared secret (fail-closed) ──
    const webhookSecret = Deno.env.get("TAE_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("[tae-webhook] FATAL: TAE_WEBHOOK_SECRET not configured. Rejecting all requests.");
      return new Response(JSON.stringify({ ok: false, error: "Webhook not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const url = new URL(req.url);
    const tokenParam = url.searchParams.get("token");
    const tokenHeader = req.headers.get("x-webhook-secret");
    if (tokenParam !== webhookSecret && tokenHeader !== webhookSecret) {
      console.log("[tae-webhook] AUTH_REJECTED", JSON.stringify({ hasParam: !!tokenParam, hasHeader: !!tokenHeader }));
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // TAE sends webhook payload as JSON
    const payload = await req.json();
    console.log("[tae-webhook] PAYLOAD_RECEIVED", JSON.stringify(payload));

    // ─── P3.3 fix: Atomic idempotency — check before sigRecord resolution ──
    const payloadHash = await computePayloadHash(payload);
    const { data: existingEvent } = await supabase
      .from("signature_events")
      .select("id")
      .eq("payload_hash", payloadHash)
      .limit(1)
      .maybeSingle();

    if (existingEvent) {
      console.log(`[tae-webhook] IDEMPOTENT hash=${payloadHash} event=${existingEvent.id} elapsed=${Date.now() - t0}ms`);
      return new Response(JSON.stringify({ ok: true, idempotent: true, hash: payloadHash }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize: TAE sends fields in varying cases
    const flatPayload: Record<string, any> = {};
    for (const [k, v] of Object.entries(payload || {})) {
      flatPayload[k.toLowerCase()] = v;
    }
    const flatData: Record<string, any> = {};
    if (payload?.data && typeof payload.data === "object") {
      for (const [k, v] of Object.entries(payload.data)) {
        flatData[k.toLowerCase()] = v;
      }
    }

    const publicationId = String(
      flatPayload["idpublicacao"] || flatPayload["publicacaoid"] ||
      flatData["idpublicacao"] || flatData["publicacaoid"] || ""
    ).trim();

    const documentId = String(
      flatPayload["iddocumento"] || flatPayload["documentoid"] ||
      flatData["iddocumento"] || flatData["documentoid"] || ""
    ).trim();

    const taeStatus: number | undefined = flatPayload["status"] ?? flatData["status"];

    const singleSignerEmail = flatPayload["assinante"] || flatData["assinante"] ||
      payload?.assinante || payload?.data?.assinante;

    const logCtxBase = { publicationId, documentId, taeStatus, assinante: singleSignerEmail || null };
    console.log(`[tae-webhook] CONTEXT`, JSON.stringify(logCtxBase));

    // ─── Match the signature record ONLY by exact ID ────────────
    let sigRecord: any = null;
    if (publicationId) {
      const { data } = await supabase
        .from("proposal_signatures")
        .select("*")
        .eq("tae_publication_id", publicationId)
        .maybeSingle();
      sigRecord = data;
    }
    if (!sigRecord && documentId) {
      const { data } = await supabase
        .from("proposal_signatures")
        .select("*")
        .eq("tae_document_id", documentId)
        .maybeSingle();
      sigRecord = data;
    }

    if (!sigRecord) {
      console.log("[tae-webhook] NO_MATCH", JSON.stringify(logCtxBase));
      return new Response(JSON.stringify({ ok: true, ignored: true, reason: "no matching record by exact ID" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const logCtx = {
      signature_id: sigRecord.id,
      proposal_id: sigRecord.proposal_id,
      tae_document_id: sigRecord.tae_document_id,
      tae_publication_id: sigRecord.tae_publication_id,
    };
    console.log(`[tae-webhook] MATCHED`, JSON.stringify(logCtx));

    // Update publication/document IDs if changed
    const sigUpdates: Record<string, string> = {};
    if (publicationId && publicationId !== sigRecord.tae_publication_id) {
      sigUpdates.tae_publication_id = publicationId;
    }
    if (documentId && documentId !== sigRecord.tae_document_id) {
      sigUpdates.tae_document_id = documentId;
    }
    if (Object.keys(sigUpdates).length > 0) {
      await supabase.from("proposal_signatures").update(sigUpdates).eq("id", sigRecord.id);
    }

    // ─── Helper: update a single signatory with state machine guard ──
    let signatoryUpdates = 0;
    let signatoryBlocked = 0;
    async function updateSignatory(email: string, input: Parameters<typeof mapIndividualSignerStatus>[0], signedAt?: string | null) {
      const normalized = normalizeEmail(email);
      if (!normalized) return;

      const nextStatus = mapIndividualSignerStatus(input);

      // Fetch current status
      const { data: current } = await supabase
        .from("proposal_signatories")
        .select("status")
        .eq("signature_id", sigRecord.id)
        .ilike("email", normalized)
        .maybeSingle();

      const curStatus = current?.status || "pending";
      if (!canTransitionSignatory(curStatus, nextStatus)) {
        signatoryBlocked++;
        console.log(`[tae-webhook] SIGNATORY_BLOCKED ${normalized}: ${curStatus} → ${nextStatus}`, JSON.stringify(logCtx));
        return;
      }

      const updatePayload: Record<string, any> = { status: nextStatus };
      if (nextStatus === "signed") {
        updatePayload.signed_at = signedAt || new Date().toISOString();
      }

      await supabase
        .from("proposal_signatories")
        .update(updatePayload)
        .eq("signature_id", sigRecord.id)
        .ilike("email", normalized);

      signatoryUpdates++;
      console.log(`[tae-webhook] SIGNATORY_UPDATED ${normalized}: ${curStatus} → ${nextStatus}`, JSON.stringify(logCtx));
    }

    // Handle single signer
    if (singleSignerEmail && typeof singleSignerEmail === "string") {
      await updateSignatory(singleSignerEmail, {
        assinado: flatPayload["assinado"] ?? flatData["assinado"] ?? null,
        rejeitado: flatPayload["rejeitado"] ?? flatData["rejeitado"] ?? null,
        pendente: flatPayload["pendente"] ?? flatData["pendente"] ?? null,
        statusAssinatura: (() => {
          const v = flatPayload["statusassinatura"] ?? flatData["statusassinatura"];
          return typeof v === "number" ? v : null;
        })(),
        taeStatus: taeStatus ?? null,
      });
    }

    // Handle array of signers
    const signers = payload?.assinantes || payload?.destinatarios ||
      payload?.data?.assinantes || payload?.data?.destinatarios ||
      flatPayload["assinantes"] || flatPayload["destinatarios"] ||
      flatData["assinantes"] || flatData["destinatarios"] || [];

    for (const signer of signers) {
      const email = signer.email || signer.emailDestinatario;
      if (!email) continue;
      await updateSignatory(email, {
        assinado: signer.assinado ?? null,
        rejeitado: signer.rejeitado ?? null,
        pendente: signer.pendente ?? null,
        statusAssinatura: typeof signer.statusAssinatura === "number" ? signer.statusAssinatura : null,
        taeStatus: taeStatus ?? null,
      }, signer.dataAssinatura || null);
    }

    // ─── Log event (with dedicated payload_hash column) ─────────
    async function logEvent(eventType: string, title: string, description: string) {
      await supabase.from("signature_events").insert({
        signature_id: sigRecord.id,
        proposal_id: sigRecord.proposal_id,
        event_type: eventType,
        title,
        description,
        payload_hash: payloadHash,
      });
    }

    // ─── Verification gate before finalization ──────────────────
    async function allSignatoriesConfirmed(): Promise<{ confirmed: boolean; pending: string[] }> {
      const { data: allSignatories } = await supabase
        .from("proposal_signatories")
        .select("email, status")
        .eq("signature_id", sigRecord.id);

      if (!allSignatories || allSignatories.length === 0) {
        return { confirmed: false, pending: ["(no signatories found)"] };
      }
      const pending = allSignatories
        .filter((s: any) => s.status !== "signed")
        .map((s: any) => s.email);
      return { confirmed: pending.length === 0, pending };
    }

    // ─── P2.4: Update envelope/proposal status via state machine ──
    const hadRealTaeSend = !!(sigRecord.tae_document_id || sigRecord.tae_publication_id);
    let envelopeAction = "none";

    if (taeStatus === 2) {
      const completionDate = extractCompletionDate(flatPayload, flatData);
      const { confirmed, pending } = await allSignatoriesConfirmed();
      if (confirmed) {
        if (canTransitionSignature(sigRecord.status, "completed")) {
          await supabase.from("proposal_signatures")
            .update({ status: "completed", completed_at: completionDate, tae_publication_id: publicationId || sigRecord.tae_publication_id })
            .eq("id", sigRecord.id);
          await supabase.from("proposals")
            .update({ status: "ganha", expected_close_date: completionDate.substring(0, 10) })
            .eq("id", sigRecord.proposal_id);
          await logEvent("success", "Assinatura finalizada", "Todos os signatários assinaram. Oportunidade marcada como Ganha.");
          envelopeAction = "completed";
          console.log(`[tae-webhook] ENVELOPE_COMPLETED date=${completionDate}`, JSON.stringify(logCtx));
        } else {
          envelopeAction = "transition_blocked";
          console.log(`[tae-webhook] TRANSITION_BLOCKED ${sigRecord.status} → completed`, JSON.stringify(logCtx));
        }
      } else {
        await logEvent("warning", "Finalização recebida mas pendente de verificação",
          `Pendentes: ${pending.join(", ")}. Use "Sincronizar TAE" para atualizar.`);
        envelopeAction = "pending_verification";
        console.log(`[tae-webhook] PENDING_VERIFICATION count=${pending.length}`, JSON.stringify(logCtx));
      }
    } else if (taeStatus === 4 || taeStatus === 7) {
      const eventType = taeStatus === 4 ? "rejected" : "cancelled";
      if (canTransitionSignature(sigRecord.status, "cancelled")) {
        await supabase.from("proposal_signatures")
          .update({ status: "cancelled", cancelled_at: new Date().toISOString(), tae_publication_id: publicationId || sigRecord.tae_publication_id })
          .eq("id", sigRecord.id);
        const newProposalStatus = proposalStatusAfterCancelOrReject(hadRealTaeSend);
        await supabase.from("proposals")
          .update({ status: newProposalStatus })
          .eq("id", sigRecord.proposal_id);
        const label = taeStatus === 4 ? "Assinatura rejeitada" : "Assinatura cancelada";
        const desc = taeStatus === 4
          ? `Rejeitada por ${singleSignerEmail || "signatário"}. Status → ${newProposalStatus}.`
          : `Cancelada. Status → ${newProposalStatus}.`;
        await logEvent(eventType, label, desc);
        envelopeAction = eventType;
        console.log(`[tae-webhook] ENVELOPE_${eventType.toUpperCase()} proposal→${newProposalStatus}`, JSON.stringify(logCtx));
      } else {
        envelopeAction = "transition_blocked";
        console.log(`[tae-webhook] TRANSITION_BLOCKED ${sigRecord.status} → cancelled`, JSON.stringify(logCtx));
      }
    } else if (taeStatus === 1) {
      await logEvent("info", "Assinatura parcial", `${singleSignerEmail || "Um signatário"} assinou. Aguardando demais.`);
      envelopeAction = "partial";
    } else if (taeStatus === 0 || taeStatus === 6) {
      await logEvent("info", "Pendente de assinatura", "Aguardando ação dos signatários.");
      envelopeAction = "pending";
    }

    const elapsed = Date.now() - t0;
    console.log(`[tae-webhook] DONE action=${envelopeAction} signatoryUpdates=${signatoryUpdates} signatoryBlocked=${signatoryBlocked} elapsed=${elapsed}ms`, JSON.stringify(logCtx));

    return new Response(
      JSON.stringify({ ok: true, signatureId: sigRecord.id, taeStatus, statusLabel: TAE_STATUS_MAP[taeStatus!] ?? "Desconhecido", hash: payloadHash, elapsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error(`[tae-webhook] ERROR: ${err.message}`, err.stack);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
