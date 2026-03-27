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

    // Find the matching proposal_signatures record
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

    // Fallback: if document ID didn't match (TAE sends NEW doc ID on finalization),
    // try to find the most recent "sent" signature
    if (!sigRecord && (documentId || taeStatus !== undefined || singleSignerEmail)) {
      console.log("[tae-webhook] No exact ID match, searching for most recent sent signature...");
      const { data } = await supabase
        .from("proposal_signatures")
        .select("*")
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        sigRecord = data;
        console.log(`[tae-webhook] Matched to most recent sent signature: ${sigRecord.id} (doc: ${sigRecord.tae_document_id})`);
      }
    }

    if (!sigRecord) {
      console.log("[tae-webhook] No matching signature record found, ignoring.");
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!sigRecord) {
      console.log("[tae-webhook] No matching signature record found, ignoring.");
      return new Response(JSON.stringify({ ok: true, ignored: true, reason: "no matching record" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[tae-webhook] Found signature record: ${sigRecord.id}, current status: ${sigRecord.status}`);

    // Update only publication ID here.
    // IMPORTANT: keep the original tae_document_id from publication time,
    // because that's the ID that the Documents API authorizes for download.
    const sigUpdates: Record<string, string> = {};
    if (publicationId && publicationId !== sigRecord.tae_publication_id) {
      sigUpdates.tae_publication_id = publicationId;
    }
    if (documentId && documentId !== sigRecord.tae_document_id) {
      console.log(`[tae-webhook] Received different finalized document ID from TAE: ${sigRecord.tae_document_id} → ${documentId}. Keeping original document ID for download compatibility.`);
    }
    if (Object.keys(sigUpdates).length > 0) {
      await supabase
        .from("proposal_signatures")
        .update(sigUpdates)
        .eq("id", sigRecord.id);
    }

    // Handle single signer (from "assinar" event with body param assinante → [ASSINANTE])
    if (singleSignerEmail && typeof singleSignerEmail === "string") {
      const cleanEmail = singleSignerEmail.trim();
      if (cleanEmail) {
        const nextStatus = taeStatus === 4 || taeStatus === 7 ? "rejected" : "signed";
        console.log(`[tae-webhook] Single signer event: ${cleanEmail} → ${nextStatus}`);
        const { data: updated, error: updateErr } = await supabase
          .from("proposal_signatories")
          .update({ status: nextStatus, signed_at: new Date().toISOString() })
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

    // Update proposal/signature status based on TAE status
    if (taeStatus === 2) {
      // Finalizado → completed / ganha
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
      console.log(`[tae-webhook] Signature ${sigRecord.id} → completed, proposal → ganha`);
    } else if (taeStatus === 4) {
      // Rejeitado → cancelled / proposta_gerada
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
        .update({ status: "proposta_gerada" })
        .eq("id", sigRecord.proposal_id);

      const rejectorEmail = singleSignerEmail || "Signatário não identificado";
      await logEvent("rejected", "Assinatura rejeitada", `A assinatura foi rejeitada por ${rejectorEmail}. Status da oportunidade revertido para Proposta Gerada.`);
      console.log(`[tae-webhook] Signature ${sigRecord.id} → rejected, proposal → proposta_gerada`);
    } else if (taeStatus === 7) {
      // Cancelado → cancelled / proposta_gerada
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
        .update({ status: "proposta_gerada" })
        .eq("id", sigRecord.proposal_id);

      await logEvent("cancelled", "Assinatura cancelada", "O processo de assinatura foi cancelado. Status da oportunidade revertido para Proposta Gerada.");
      console.log(`[tae-webhook] Signature ${sigRecord.id} → cancelled, proposal → proposta_gerada`);
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
