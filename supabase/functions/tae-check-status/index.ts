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
        JSON.stringify({
          error: "Publicação/documento TAE não encontrado. O documento pode não ter sido enviado ao TAE.",
          sigRecord,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get TAE config
    const { data: taeConfig } = await supabase.from("tae_config").select("*").maybeSingle();
    if (!taeConfig) {
      return new Response(JSON.stringify({ error: "Configuração TAE não encontrada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const taePassword = Deno.env.get("TAE_SERVICE_USER_PASSWORD");
    if (!taeConfig.service_user_email || !taePassword) {
      return new Response(JSON.stringify({ error: "Credenciais TAE não configuradas" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = taeConfig.base_url;

    // Login to TAE
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
      return new Response(
        JSON.stringify({ error: `Falha no login TAE: ${loginRes.status}`, details: loginBody.substring(0, 300) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const loginData = await loginRes.json();
    const taeToken = loginData.access_token || loginData.token;

    // Get publication status from TAE (fallback to document when publication id is missing)
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
      // No publication ID — try multiple TAE endpoints to find publication info
      console.log(`[tae-check-status] No publication ID, trying to resolve from document ${taeDocumentId}`);

      // Try 1: GET /documents/v1/documentos/{id} (v1 endpoint)
      let resolved = false;
      for (const endpoint of [
        `${baseUrl}/documents/v1/documentos/${taeDocumentId}`,
        `${baseUrl}/documents/v2/documentos/${taeDocumentId}`,
        `${baseUrl}/documents/v1/publicacoes?idDocumento=${taeDocumentId}`,
      ]) {
        if (resolved) break;
        console.log(`[tae-check-status] Trying: ${endpoint}`);
        const res = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${taeToken}` },
        });
        const raw = await res.text();
        console.log(`[tae-check-status] → ${res.status} ${raw.substring(0, 500)}`);
        
        if (res.ok && raw) {
          let parsed: any;
          try { parsed = JSON.parse(raw); } catch { continue; }
          const data = parsed?.data || parsed;
          
          // Could be a single object or array
          const items = Array.isArray(data) ? data : [data];
          const match = items.find((item: any) => 
            String(item?.idDocumento || item?.documentoId || "") === String(taeDocumentId)
          ) || items[0];
          
          if (match) {
            resolvedPublicationId = String(
              match?.idPublicacao || match?.publicacaoId || 
              match?.publicacao?.id || ""
            ).trim() || null;
            
            // If this item has status/signers info, use it as pubData
            if (match?.status !== undefined || match?.assinantes || match?.destinatarios) {
              pubData = match;
              resolved = true;
            } else if (resolvedPublicationId) {
              // Got publication ID, fetch its details
              const pubRes = await fetch(`${baseUrl}/documents/v2/publicacoes/${resolvedPublicationId}`, {
                headers: { Authorization: `Bearer ${taeToken}` },
              });
              if (pubRes.ok) {
                const pubRaw = await pubRes.text();
                try {
                  const pubParsed = JSON.parse(pubRaw);
                  pubData = pubParsed?.data || pubParsed;
                  resolved = true;
                } catch { /* continue */ }
              }
            }
          }
        }
      }

      if (!resolved && !pubData) {
        return new Response(
          JSON.stringify({
            error: "Não foi possível localizar a publicação no TAE. O documento pode ainda não ter sido publicado.",
            taeDocumentId,
            suggestion: "Tente enviar novamente para assinatura.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (resolvedPublicationId) {
        const adminSupabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        await adminSupabase
          .from("proposal_signatures")
          .update({ tae_publication_id: resolvedPublicationId })
          .eq("id", signatureId);
      }
    }

    const pubStatus = pubData?.status;
    const pubStatusLabel = TAE_STATUS_MAP[pubStatus] ?? `Desconhecido (${pubStatus})`;

    // Extract signer details
    const signers = (pubData?.assinantes || pubData?.destinatarios || []).map((s: any) => ({
      email: s.email || s.emailDestinatario,
      name: s.nomeCompleto || s.nome || s.email,
      status: s.statusAssinatura ?? s.status,
      statusLabel: s.assinado ? "Assinado" : (s.rejeitado ? "Rejeitado" : "Pendente"),
      signedAt: s.dataAssinatura || null,
      action: s.acao ?? s.tipoAssinatura,
    }));

    // Sync local signatories based on TAE
    for (const signer of signers) {
      const nextStatus = signer.statusLabel === "Assinado"
        ? "signed"
        : signer.statusLabel === "Rejeitado"
          ? "rejected"
          : "pending";

      await supabase
        .from("proposal_signatories")
        .update({ status: nextStatus, signed_at: signer.signedAt })
        .eq("signature_id", signatureId)
        .ilike("email", signer.email);
    }

    // Update local status based on TAE
    let newLocalStatus = sigRecord.status;
    if (pubStatus === 2) {
      newLocalStatus = "completed";
      await supabase
        .from("proposal_signatures")
        .update({ status: "completed", completed_at: new Date().toISOString(), tae_publication_id: resolvedPublicationId || sigRecord.tae_publication_id })
        .eq("id", signatureId);
      await supabase
        .from("proposals")
        .update({ status: "ganha", expected_close_date: new Date().toISOString().substring(0, 10) })
        .eq("id", sigRecord.proposal_id);
    } else if (pubStatus === 4 || pubStatus === 7) {
      newLocalStatus = "cancelled";
      await supabase
        .from("proposal_signatures")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString(), tae_publication_id: resolvedPublicationId || sigRecord.tae_publication_id })
        .eq("id", signatureId);
      await supabase
        .from("proposals")
        .update({ status: "proposta_gerada" })
        .eq("id", sigRecord.proposal_id);
    } else if (resolvedPublicationId && !sigRecord.tae_publication_id) {
      await supabase
        .from("proposal_signatures")
        .update({ tae_publication_id: resolvedPublicationId })
        .eq("id", signatureId);
    }

    return new Response(
      JSON.stringify({
        taePublicationId: resolvedPublicationId,
        taeDocumentId: sigRecord.tae_document_id,
        status: pubStatus,
        statusLabel: pubStatusLabel,
        localStatus: newLocalStatus,
        signers,
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
