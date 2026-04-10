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

const TAE_SIGNER_STATUS_MAP: Record<number, string> = {
  0: "Eletronicamente",
  1: "Com Certificado",
  3: "Rejeitado",
  4: "Testemunha",
};

// ════════════════════════════════════════════════════════════════════
// P2.3 — Email normalization
// ════════════════════════════════════════════════════════════════════
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ════════════════════════════════════════════════════════════════════
// P2.4 — Centralized state machine (shared logic with webhook)
// ════════════════════════════════════════════════════════════════════
const SIGNATORY_TERMINAL = new Set(["signed", "rejected"]);

function canTransitionSignatory(current: string, next: string): boolean {
  if (current === next) return false;
  if (SIGNATORY_TERMINAL.has(current)) return false;
  if (!SIGNATORY_TERMINAL.has(next) && next !== "pending") return false;
  return true;
}

// ════════════════════════════════════════════════════════════════════
// P1.1 — Individual signer status mapping (same as webhook)
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { signatureId } = await req.json();
    if (!signatureId) {
      return new Response(JSON.stringify({ error: "signatureId obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load signature record
    const { data: sigRecord, error: sigErr } = await supabase
      .from("proposal_signatures")
      .select("*")
      .eq("id", signatureId)
      .single();
    if (sigErr || !sigRecord) {
      return new Response(JSON.stringify({ error: "Registro não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const taePublicationId = sigRecord.tae_publication_id;
    const taeDocumentId = sigRecord.tae_document_id;
    if (!taePublicationId && !taeDocumentId) {
      return new Response(
        JSON.stringify({ error: "Publicação/documento TAE não encontrado.", sigRecord }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get TAE config — use service role to bypass RLS on tae_config
    const adminSupabaseForConfig = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: taeConfig } = await adminSupabaseForConfig.from("tae_config").select("*").maybeSingle();
    if (!taeConfig) {
      return new Response(JSON.stringify({ error: "Configuração TAE não encontrada" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const taePassword = Deno.env.get("TAE_SERVICE_USER_PASSWORD");
    if (!taeConfig.service_user_email || !taePassword) {
      return new Response(JSON.stringify({ error: "Credenciais TAE não configuradas" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = taeConfig.base_url;

    // Login to TAE
    const loginRes = await fetch(`${baseUrl}/identityintegration/v3/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName: taeConfig.service_user_email, password: taePassword }),
    });
    if (!loginRes.ok) {
      const loginBody = await loginRes.text();
      return new Response(
        JSON.stringify({ error: `Falha no login TAE: ${loginRes.status}`, details: loginBody.substring(0, 300) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const loginBody = await loginRes.text();
    let loginData: any;
    try { loginData = JSON.parse(loginBody); } catch { loginData = {}; }
    const taeToken = loginData.access_token || loginData.token || loginData.data?.access_token || loginData.data?.token;
    if (!taeToken) {
      return new Response(
        JSON.stringify({ error: "Token TAE não retornado", details: loginBody.substring(0, 300) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.log(`[tae-check-status] TAE login OK`);

    // Get publication status from TAE
    let resolvedPublicationId = taePublicationId;
    let pubData: any = null;

    if (resolvedPublicationId) {
      const statusRes = await fetch(`${baseUrl}/documents/v2/publicacoes/${resolvedPublicationId}`, {
        headers: { Authorization: `Bearer ${taeToken}` },
      });
      const statusRaw = await statusRes.text();
      if (!statusRes.ok) {
        return new Response(
          JSON.stringify({ error: `Falha ao consultar TAE: ${statusRes.status}`, details: statusRaw.substring(0, 500) }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      let statusData: any;
      try { statusData = JSON.parse(statusRaw); } catch { statusData = null; }
      pubData = statusData?.data || statusData;
    } else {
      // Resolve from document ID
      console.log(`[tae-check-status] No publication ID, resolving from document ${taeDocumentId}`);
      let resolved = false;

      try {
        const siEndpoint = `${baseUrl}/signintegration/v2/Publicacoes/documentos-empresa`;
        const siRes = await fetch(siEndpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${taeToken}`, "Content-Type": "application/json" },
          body: JSON.stringify([Number(taeDocumentId)]),
        });
        const siRaw = await siRes.text();
        if (siRes.ok && siRaw) {
          let siParsed: any;
          try { siParsed = JSON.parse(siRaw); } catch { /* ignore */ }
          const siData = siParsed?.data || siParsed;
          const items = Array.isArray(siData) ? siData : [siData];
          const match = items.find((item: any) =>
            String(item?.idDocumento || item?.documentoId || item?.id || "") === String(taeDocumentId)
          ) || (items.length > 0 ? items[0] : null);

          if (match) {
            resolvedPublicationId = String(
              match?.idPublicacao || match?.publicacaoId ||
              match?.publicacao?.id || match?.publicacoes?.[0]?.id ||
              match?.publicacoes?.[0]?.idPublicacao || ""
            ).trim() || null;

            if (match?.status !== undefined || match?.assinantes || match?.destinatarios || match?.pendentes) {
              pubData = match;
              resolved = true;
            } else if (resolvedPublicationId) {
              const pubRes = await fetch(`${baseUrl}/documents/v2/publicacoes/${resolvedPublicationId}`, {
                headers: { Authorization: `Bearer ${taeToken}` },
              });
              if (pubRes.ok) {
                const pubRaw = await pubRes.text();
                try { pubData = JSON.parse(pubRaw)?.data || JSON.parse(pubRaw); resolved = true; } catch { /* */ }
              }
            }
          }
        }
      } catch (e: any) {
        console.log(`[tae-check-status] signintegration error: ${e.message}`);
      }

      if (!resolved) {
        for (const endpoint of [
          `${baseUrl}/documents/v1/envelopes/${taeDocumentId}`,
          `${baseUrl}/documents/v1/envelopes/${taeDocumentId}/publicacoes`,
          `${baseUrl}/documents/v1/documentos/${taeDocumentId}`,
        ]) {
          if (resolved) break;
          const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${taeToken}` } });
          const raw = await res.text();
          if (res.ok && raw) {
            let parsed: any;
            try { parsed = JSON.parse(raw); } catch { continue; }
            const data = parsed?.data || parsed;
            const items = Array.isArray(data) ? data : [data];
            const match = items.find((item: any) =>
              String(item?.idDocumento || item?.documentoId || item?.id || "") === String(taeDocumentId)
            ) || items[0];
            if (match) {
              resolvedPublicationId = String(
                match?.idPublicacao || match?.publicacaoId ||
                match?.publicacao?.id || match?.publicacoes?.[0]?.id ||
                match?.publicacoes?.[0]?.idPublicacao || ""
              ).trim() || null;
              if (match?.status !== undefined || match?.assinantes || match?.destinatarios) {
                pubData = match;
                resolved = true;
              } else if (resolvedPublicationId) {
                const pubRes = await fetch(`${baseUrl}/documents/v2/publicacoes/${resolvedPublicationId}`, {
                  headers: { Authorization: `Bearer ${taeToken}` },
                });
                if (pubRes.ok) {
                  const pubRaw = await pubRes.text();
                  try { pubData = JSON.parse(pubRaw)?.data || JSON.parse(pubRaw); resolved = true; } catch { /* */ }
                }
              }
            }
          }
        }
      }

      if (!resolved && !pubData) {
        return new Response(
          JSON.stringify({ error: "Não foi possível localizar a publicação no TAE.", taeDocumentId, suggestion: "Tente enviar novamente." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (resolvedPublicationId) {
        const adminSupabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        await adminSupabase.from("proposal_signatures").update({ tae_publication_id: resolvedPublicationId }).eq("id", signatureId);
      }
    }

    const pubStatus = pubData?.status;
    const pubStatusLabel = TAE_STATUS_MAP[pubStatus] ?? `Desconhecido (${pubStatus})`;

    // Extract signer details
    const rawSigners = pubData?.assinantes || pubData?.destinatarios || pubData?.pendentes || [];
    const signers = rawSigners.map((s: any) => {
      const mappedStatus = mapIndividualSignerStatus({
        assinado: s.assinado ?? null,
        rejeitado: s.rejeitado ?? null,
        pendente: s.pendente ?? null,
        statusAssinatura: typeof s.statusAssinatura === "number" ? s.statusAssinatura : null,
        taeStatus: pubStatus ?? null,
      });
      return {
        email: s.email || s.emailDestinatario,
        name: s.nomeCompleto || s.nome || s.email,
        status: s.statusAssinatura ?? s.status,
        statusLabel: mappedStatus === "signed" ? "Assinado" : mappedStatus === "rejected" ? "Rejeitado" : "Pendente",
        mappedStatus,
        signedAt: s.dataAssinatura || null,
        action: s.acao ?? s.tipoAssinatura,
      };
    });

    // P2.3 + P2.4: Sync local signatories using unified mapIndividualSignerStatus
    for (const signer of signers) {
      const nextStatus = signer.mappedStatus;

      const normalized = normalizeEmail(signer.email || "");
      if (!normalized) continue;

      // Fetch current status for state machine check
      const { data: currentSig } = await supabase
        .from("proposal_signatories")
        .select("status")
        .eq("signature_id", signatureId)
        .ilike("email", normalized)
        .maybeSingle();

      const curStatus = currentSig?.status || "pending";
      if (!canTransitionSignatory(curStatus, nextStatus)) {
        console.log(`[tae-check-status] Signatory ${normalized}: ${curStatus} → ${nextStatus} blocked`);
        continue;
      }

      const updatePayload: Record<string, any> = { status: nextStatus };
      if (nextStatus === "signed" && signer.signedAt) updatePayload.signed_at = signer.signedAt;
      else if (nextStatus === "signed") updatePayload.signed_at = new Date().toISOString();

      await supabase
        .from("proposal_signatories")
        .update(updatePayload)
        .eq("signature_id", signatureId)
        .ilike("email", normalized);
    }

    // Use admin client for status updates to bypass RLS
    const adminSupabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let newLocalStatus = sigRecord.status;
    let syncWarning: string | null = null;

    if (pubStatus === 2) {
      // Re-read signatories AFTER sync
      const { data: allSignatories } = await adminSupabase
        .from("proposal_signatories")
        .select("email, status")
        .eq("signature_id", signatureId);

      const pendingSigners = (allSignatories || []).filter((s: any) => s.status !== "signed");

      if (pendingSigners.length === 0 && canTransitionSignature(sigRecord.status, "completed")) {
        newLocalStatus = "completed";
        await adminSupabase.from("proposal_signatures")
          .update({ status: "completed", completed_at: new Date().toISOString(), tae_publication_id: resolvedPublicationId || sigRecord.tae_publication_id })
          .eq("id", signatureId);
        await adminSupabase.from("proposals")
          .update({ status: "ganha", expected_close_date: new Date().toISOString().substring(0, 10) })
          .eq("id", sigRecord.proposal_id);
      } else if (pendingSigners.length > 0) {
        syncWarning = `TAE finalizado mas ${pendingSigners.length} signatário(s) pendente(s): ${pendingSigners.map((s: any) => s.email).join(", ")}`;
        console.log(`[tae-check-status] ${syncWarning}`);
        if (resolvedPublicationId && resolvedPublicationId !== sigRecord.tae_publication_id) {
          await adminSupabase.from("proposal_signatures").update({ tae_publication_id: resolvedPublicationId }).eq("id", signatureId);
        }
      }
    } else if ((pubStatus === 4 || pubStatus === 7) && canTransitionSignature(sigRecord.status, "cancelled")) {
      newLocalStatus = "cancelled";
      await adminSupabase.from("proposal_signatures")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString(), tae_publication_id: resolvedPublicationId || sigRecord.tae_publication_id })
        .eq("id", signatureId);
      // P1.3 preserved: real TAE send → pendente
      await adminSupabase.from("proposals").update({ status: "pendente" }).eq("id", sigRecord.proposal_id);
    } else if (resolvedPublicationId && !sigRecord.tae_publication_id) {
      await adminSupabase.from("proposal_signatures").update({ tae_publication_id: resolvedPublicationId }).eq("id", signatureId);
    }

    return new Response(
      JSON.stringify({
        taePublicationId: resolvedPublicationId,
        taeDocumentId: sigRecord.tae_document_id,
        status: pubStatus,
        statusLabel: pubStatusLabel,
        localStatus: newLocalStatus,
        signers,
        ...(syncWarning ? { syncWarning } : {}),
        rawData: pubData,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: `Erro inesperado: ${err.message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
