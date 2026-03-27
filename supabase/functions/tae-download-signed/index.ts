import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function tryFetchSignedFile(
  signedUrl: string,
): Promise<Response | null> {
  if (!signedUrl) return null;

  try {
    const fileRes = await fetch(signedUrl);
    if (fileRes.ok) {
      return fileRes;
    }
    await fileRes.text().catch(() => "");
    return null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { signatureId } = await req.json();
    if (!signatureId) {
      return jsonResponse({ error: "signatureId is required" }, 400);
    }

    // Get signature record
    const { data: sig, error: sigErr } = await supabase
      .from("proposal_signatures")
      .select("tae_document_id, tae_publication_id, proposal_id")
      .eq("id", signatureId)
      .single();

    if (sigErr || !sig) {
      return jsonResponse({ error: "Signature not found" }, 404);
    }

    if (!sig.tae_document_id) {
      return jsonResponse({ error: "No TAE document ID available" }, 400);
    }

    // Get TAE config
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: taeConfig } = await adminClient
      .from("tae_config")
      .select("base_url, service_user_email")
      .limit(1)
      .single();

    if (!taeConfig) {
      return jsonResponse({ error: "TAE not configured" }, 500);
    }

    const taePassword = Deno.env.get("TAE_SERVICE_USER_PASSWORD");
    if (!taePassword || !taeConfig.service_user_email) {
      return jsonResponse({ error: "TAE credentials missing" }, 500);
    }

    // Login to TAE
    const loginRes = await fetch(`${taeConfig.base_url}/identityintegration/v3/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName: taeConfig.service_user_email, password: taePassword }),
    });

    if (!loginRes.ok) {
      const loginBody = await loginRes.text().catch(() => "");
      return jsonResponse({ error: `TAE login failed (${loginRes.status})`, details: loginBody.substring(0, 300) }, 502);
    }

    const loginBody = await loginRes.text();
    let loginData: any;
    try { loginData = JSON.parse(loginBody); } catch { loginData = {}; }
    const taeToken = loginData.access_token || loginData.token || loginData.data?.access_token || loginData.data?.token;
    if (!taeToken) {
      return jsonResponse({ error: "TAE token not found in response", details: loginBody.substring(0, 300) }, 502);
    }

    // Resolve candidate publication IDs first, then download through signedURL/official endpoints
    let resolvedPublicationId = String(sig.tae_publication_id || "").trim() || null;
    const publicationIdCandidates = new Set<string>();
    if (resolvedPublicationId) publicationIdCandidates.add(resolvedPublicationId);
    if (sig.tae_document_id) publicationIdCandidates.add(String(sig.tae_document_id).trim());

    if (!resolvedPublicationId && sig.tae_document_id) {
      try {
        const siRes = await fetch(
          `${taeConfig.base_url}/signintegration/v2/Publicacoes/documentos-empresa`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${taeToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify([Number(sig.tae_document_id)]),
          }
        );

        const siRaw = await siRes.text();
        if (siRes.ok && siRaw) {
          let siParsed: any = null;
          try { siParsed = JSON.parse(siRaw); } catch { siParsed = null; }
          const siData = siParsed?.data || siParsed;
          const items = Array.isArray(siData) ? siData : [siData];
          const match = items.find((item: any) =>
            String(item?.idDocumento || item?.documentoId || item?.id || "") === String(sig.tae_document_id)
          ) || items[0];

          const candidatePublicationId = String(
            match?.idPublicacao ||
            match?.publicacaoId ||
            match?.id ||
            match?.publicacao?.id ||
            match?.publicacoes?.[0]?.id ||
            match?.publicacoes?.[0]?.idPublicacao ||
            ""
          ).trim();

          if (candidatePublicationId) {
            resolvedPublicationId = candidatePublicationId;
            publicationIdCandidates.add(candidatePublicationId);
          }
        }
      } catch {
        // ignore and continue with direct download fallbacks
      }
    }

    let downloadRes: Response | null = null;

    const orderedPublicationIds = [
      ...(resolvedPublicationId ? [resolvedPublicationId] : []),
      ...Array.from(publicationIdCandidates).filter((id) => id !== resolvedPublicationId),
    ];

    for (const publicationId of orderedPublicationIds) {
      if (downloadRes) break;

      try {
        const publicationMetaRes = await fetch(
          `${taeConfig.base_url}/documents/v1/publicacoes/${encodeURIComponent(publicationId)}`,
          {
            headers: { Authorization: `Bearer ${taeToken}` },
          },
        );
        const publicationMetaRaw = await publicationMetaRes.text();

        if (publicationMetaRes.ok && publicationMetaRaw) {
          let publicationMetaData: any = null;
          try { publicationMetaData = JSON.parse(publicationMetaRaw); } catch { publicationMetaData = null; }
          const payload = publicationMetaData?.data || publicationMetaData;
          const inlineSignedUrl = String(
            payload?.signedURL || payload?.signedUrl || payload?.url || payload?.downloadUrl || payload?.link || "",
          ).trim();

          if (inlineSignedUrl) {
            downloadRes = await tryFetchSignedFile(inlineSignedUrl);
            if (downloadRes) {
              resolvedPublicationId = publicationId;
              break;
            }
          }
        }
      } catch {
        // ignore and continue with next strategy
      }

      try {
        const signedUrlRes = await fetch(
          `${taeConfig.base_url}/documents/v1/publicacoes/download/signed-url?idPublicacao=${encodeURIComponent(publicationId)}`,
          {
            headers: { Authorization: `Bearer ${taeToken}` },
          },
        );
        const signedUrlRaw = await signedUrlRes.text();

        if (signedUrlRes.ok && signedUrlRaw) {
          let signedUrlData: any = null;
          try { signedUrlData = JSON.parse(signedUrlRaw); } catch { signedUrlData = null; }
          const payload = signedUrlData?.data || signedUrlData;
          const signedUrl = String(
            payload?.signedURL || payload?.signedUrl || payload?.url || payload?.downloadUrl || payload?.link || "",
          ).trim();

          downloadRes = await tryFetchSignedFile(signedUrl);
          if (downloadRes) {
            resolvedPublicationId = publicationId;
            break;
          }
        }
      } catch {
        // ignore and continue with next strategy
      }

      try {
        const directDownloadEndpoints = [
          `${taeConfig.base_url}/documents/v1/publicacoes/${encodeURIComponent(publicationId)}/download?tipoDownload=0`,
          `${taeConfig.base_url}/documents/v1/publicacoes/${encodeURIComponent(publicationId)}/download?tipoDownload=1`,
        ];

        for (const url of directDownloadEndpoints) {
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${taeToken}` },
          });
          if (res.ok) {
            downloadRes = res;
            resolvedPublicationId = publicationId;
            break;
          }
          await res.text().catch(() => "");
        }
      } catch {
        // ignore and continue with next strategy
      }
    }

    if (!downloadRes) {
      const downloadEndpoints = [
        `${taeConfig.base_url}/documents/v1/envelopes/${sig.tae_document_id}/download`,
        `${taeConfig.base_url}/documents/v1/documentos/${sig.tae_document_id}/download`,
      ];

      for (const url of downloadEndpoints) {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${taeToken}` },
        });
        if (res.ok) {
          downloadRes = res;
          break;
        }
        await res.text().catch(() => "");
      }
    }

    if (!downloadRes) {
      return jsonResponse({
        error: "TAE download failed: no endpoint returned the document",
        taeDocumentId: String(sig.tae_document_id),
        taePublicationId: resolvedPublicationId,
        publicationCandidates: orderedPublicationIds,
      }, 502);
    }

    // Convert to base64
    const pdfBuffer = await downloadRes.arrayBuffer();
    const uint8 = new Uint8Array(pdfBuffer);
    let binary = "";
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    const base64 = btoa(binary);

    return jsonResponse({ success: true, base64, mimeType: "application/pdf", taePublicationId: resolvedPublicationId });
  } catch (err: any) {
    return jsonResponse({ error: err.message }, 500);
  }
});
