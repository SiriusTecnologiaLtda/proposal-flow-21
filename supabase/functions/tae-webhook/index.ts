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

// ─── P1.1: Helper to map individual signer status from payload fields ───
// Uses signer-level fields as primary source of truth.
// Falls back to envelope-level taeStatus only when signer payload is ambiguous.
// Never marks "signed" without positive evidence.
function mapIndividualSignerStatus(input: {
  assinado?: boolean | null;
  rejeitado?: boolean | null;
  pendente?: boolean | null;
  statusAssinatura?: number | null;
  taeStatus?: number | null;
}): "pending" | "signed" | "rejected" {
  // Explicit rejection from signer fields
  if (input.rejeitado === true || input.statusAssinatura === 3) {
    return "rejected";
  }

  // Explicit signature confirmation from signer fields
  if (
    input.assinado === true ||
    input.statusAssinatura === 0 ||
    input.pendente === false
  ) {
    return "signed";
  }

  // Envelope-level fallback: rejection/cancellation
  if (input.taeStatus === 4 || input.taeStatus === 7) {
    return "rejected";
  }

  // No positive evidence → keep pending
  return "pending";
}

// Status precedence: signed/rejected are terminal — never regress to pending
const STATUS_RANK: Record<string, number> = { pending: 0, signed: 1, rejected: 1 };

function shouldUpdateSignerStatus(currentStatus: string, newStatus: string): boolean {
  // Never regress from signed/rejected to pending
  const currentRank = STATUS_RANK[currentStatus] ?? 0;
  const newRank = STATUS_RANK[newStatus] ?? 0;
  if (newRank < currentRank) return false;
  // Don't update if status is unchanged
  if (currentStatus === newStatus) return false;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // TAE sends webhook payload as JSON
    const payload = await req.json();
    console.log("[tae-webhook] Received FULL payload:", JSON.stringify(payload));

    // Normalize: TAE sends fields in varying cases (idDocumento, iddocumento, IdDocumento, etc.)
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
      flatData["idpublicacao"] || flatData["publicacaoid"] ||
      ""
    ).trim();

    const documentId = String(
      flatPayload["iddocumento"] || flatPayload["documentoid"] ||
      flatData["iddocumento"] || flatData["documentoid"] ||
      ""
    ).trim();

    const taeStatus: number | undefined =
      flatPayload["status"] ?? flatData["status"];

    // Extract signer info from payload (TAE body param: assinante → [ASSINANTE])
    const singleSignerEmail = flatPayload["assinante"] || flatData["assinante"] ||
      payload?.assinante || payload?.data?.assinante;

    console.log(`[tae-webhook] publicationId=${publicationId}, documentId=${documentId}, status=${taeStatus}, assinante=${singleSignerEmail || "(none)"}`);

    // ─── Match the signature record ONLY by exact ID ────────────────
    // CRITICAL: Never fallback to "most recent sent" — this caused
    // cross-proposal contamination where events from one envelope
    // were applied to a completely different proposal.
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
      console.log("[tae-webhook] No matching signature record found by exact ID. Ignoring webhook to prevent cross-proposal contamination.", JSON.stringify({ publicationId, documentId, taeStatus }));
      return new Response(JSON.stringify({ ok: true, ignored: true, reason: "no matching record by exact ID" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[tae-webhook] Found signature record: ${sigRecord.id}, proposal_id: ${sigRecord.proposal_id}, current status: ${sigRecord.status}`);

    // Update publication ID and document ID if changed (TAE sends new IDs on finalization)
    const sigUpdates: Record<string, string> = {};
    if (publicationId && publicationId !== sigRecord.tae_publication_id) {
      sigUpdates.tae_publication_id = publicationId;
    }
    if (documentId && documentId !== sigRecord.tae_document_id) {
      sigUpdates.tae_document_id = documentId;
      console.log(`[tae-webhook] Document ID changed: ${sigRecord.tae_document_id} → ${documentId}`);
    }
    if (Object.keys(sigUpdates).length > 0) {
      await supabase
        .from("proposal_signatures")
        .update(sigUpdates)
        .eq("id", sigRecord.id);
    }

    // Handle single signer (from "assinar" event with body param assinante → [ASSINANTE])
    // P1.1: Use signer-level fields as primary source; never assume signed from absence of error.
    if (singleSignerEmail && typeof singleSignerEmail === "string") {
      const cleanEmail = singleSignerEmail.trim();
      if (cleanEmail) {
        // Extract signer-level detail fields from payload
        const signerAssinado = flatPayload["assinado"] ?? flatData["assinado"] ?? null;
        const signerRejeitado = flatPayload["rejeitado"] ?? flatData["rejeitado"] ?? null;
        const signerPendente = flatPayload["pendente"] ?? flatData["pendente"] ?? null;
        const signerStatusAssinatura = flatPayload["statusassinatura"] ?? flatData["statusassinatura"] ?? null;

        const nextStatus = mapIndividualSignerStatus({
          assinado: signerAssinado,
          rejeitado: signerRejeitado,
          pendente: signerPendente,
          statusAssinatura: typeof signerStatusAssinatura === "number" ? signerStatusAssinatura : null,
          taeStatus: taeStatus ?? null,
        });

        console.log(`[tae-webhook] Single signer event: ${cleanEmail} → ${nextStatus} (assinado=${signerAssinado}, rejeitado=${signerRejeitado}, pendente=${signerPendente}, statusAssinatura=${signerStatusAssinatura}, taeStatus=${taeStatus})`);
        
        const updatePayload: Record<string, any> = { status: nextStatus };
        if (nextStatus === "signed") {
          updatePayload.signed_at = new Date().toISOString();
        }

        const { data: updated, error: updateErr } = await supabase
          .from("proposal_signatories")
          .update(updatePayload)
          .eq("signature_id", sigRecord.id)
          .ilike("email", cleanEmail)
          .select();
        if (updateErr) {
          console.log(`[tae-webhook] Error updating signatory: ${updateErr.message}`);
        } else {
          console.log(`[tae-webhook] Updated ${updated?.length || 0} signatory(ies) for ${cleanEmail}`);
        }
      }
    }

    // Handle array of signers (from finalizar event or detailed payload)
    const signers = payload?.assinantes || payload?.destinatarios ||
      payload?.data?.assinantes || payload?.data?.destinatarios ||
      flatPayload["assinantes"] || flatPayload["destinatarios"] ||
      flatData["assinantes"] || flatData["destinatarios"] || [];

    for (const signer of signers) {
      const email = signer.email || signer.emailDestinatario;
      if (!email) continue;

      const signedAt = signer.dataAssinatura || null;
      let nextStatus = "pending";
      if (signer.assinado || signer.statusAssinatura === 0) {
        nextStatus = "signed";
      } else if (signer.rejeitado || signer.statusAssinatura === 3) {
        nextStatus = "rejected";
      }

      await supabase
        .from("proposal_signatories")
        .update({ status: nextStatus, signed_at: signedAt })
        .eq("signature_id", sigRecord.id)
        .ilike("email", email);
    }

    // Helper to log signature events
    async function logEvent(eventType: string, title: string, description: string) {
      await supabase.from("signature_events").insert({
        signature_id: sigRecord.id,
        proposal_id: sigRecord.proposal_id,
        event_type: eventType,
        title,
        description,
      });
    }

    // ─── Verification gate before finalization ──────────────────────
    // Before marking as completed/ganha, verify ALL signatories are
    // actually signed in our database. This prevents false positives
    // when the webhook status doesn't reflect the real envelope state.
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

    // Update proposal/signature status based on TAE status
    if (taeStatus === 2) {
      // Finalizado → verify before completing
      const { confirmed, pending } = await allSignatoriesConfirmed();

      if (confirmed) {
        await supabase
          .from("proposal_signatures")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            tae_publication_id: publicationId || sigRecord.tae_publication_id,
          })
          .eq("id", sigRecord.id);

        await supabase
          .from("proposals")
          .update({ status: "ganha", expected_close_date: new Date().toISOString().substring(0, 10) })
          .eq("id", sigRecord.proposal_id);

        await logEvent("success", "Assinatura finalizada", "Todos os signatários assinaram. Oportunidade marcada como Ganha.");
        console.log(`[tae-webhook] Signature ${sigRecord.id} → completed, proposal → ganha (all ${pending.length === 0 ? "signatories confirmed" : ""})`);
      } else {
        // TAE says finalized but our records show pending signatories.
        // Do NOT finalize — log warning and let manual sync resolve.
        await logEvent("warning", "Finalização recebida mas pendente de verificação",
          `O TAE reportou finalização, porém os seguintes signatários ainda não constam como assinados internamente: ${pending.join(", ")}. Use "Sincronizar TAE" para atualizar.`);
        console.log(`[tae-webhook] TAE status=2 but ${pending.length} signatory(ies) still pending locally: ${pending.join(", ")}. Skipping finalization.`);
      }
    } else if (taeStatus === 4) {
      // Rejeitado → cancelled / pendente
      await supabase
        .from("proposal_signatures")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          tae_publication_id: publicationId || sigRecord.tae_publication_id,
        })
        .eq("id", sigRecord.id);

      await supabase
        .from("proposals")
        .update({ status: "pendente" })
        .eq("id", sigRecord.proposal_id);

      const rejectorEmail = singleSignerEmail || "Signatário não identificado";
      await logEvent("rejected", "Assinatura rejeitada", `A assinatura foi rejeitada por ${rejectorEmail}. Status da oportunidade revertido para Pendente.`);
      console.log(`[tae-webhook] Signature ${sigRecord.id} → rejected, proposal → pendente`);
    } else if (taeStatus === 7) {
      // Cancelado → cancelled / pendente
      await supabase
        .from("proposal_signatures")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          tae_publication_id: publicationId || sigRecord.tae_publication_id,
        })
        .eq("id", sigRecord.id);

      await supabase
        .from("proposals")
        .update({ status: "pendente" })
        .eq("id", sigRecord.proposal_id);

      await logEvent("cancelled", "Assinatura cancelada", "O processo de assinatura foi cancelado. Status da oportunidade revertido para Pendente.");
      console.log(`[tae-webhook] Signature ${sigRecord.id} → cancelled, proposal → pendente`);
    } else if (taeStatus === 1) {
      // Assinado parcialmente
      await logEvent("info", "Assinatura parcial", `${singleSignerEmail || "Um signatário"} assinou. Aguardando demais signatários.`);
      console.log(`[tae-webhook] Signature ${sigRecord.id} → partially signed`);
    } else if (taeStatus === 0 || taeStatus === 6) {
      // Pendente
      await logEvent("info", "Pendente de assinatura", "Aguardando ação dos signatários.");
    }

    return new Response(
      JSON.stringify({
        ok: true,
        signatureId: sigRecord.id,
        taeStatus,
        statusLabel: TAE_STATUS_MAP[taeStatus!] ?? "Desconhecido",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[tae-webhook] Error:", err.message);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
