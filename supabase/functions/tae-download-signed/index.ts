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

async function tryFetchSignedFile(signedUrl: string): Promise<Response | null> {
  if (!signedUrl) return null;

  try {
    const fileRes = await fetch(signedUrl);
    if (fileRes.ok) return fileRes;
    await fileRes.text().catch(() => "");
    return null;
  } catch {
    return null;
  }
}

function extractCandidateIds(payload: any): string[] {
  const values = [
    payload?.idPublicacao,
    payload?.publicacaoId,
    payload?.id,
    payload?.publicacao?.id,
    payload?.publicacoes?.[0]?.id,
    payload?.publicacoes?.[0]?.idPublicacao,
    payload?.idDocumento,
    payload?.documentoId,
    payload?.pendentes?.[0]?.idArquivos,
  ];

  return Array.from(new Set(values.map((v) => String(v || "").trim()).filter(Boolean)));
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

    const { data: sig, error: sigErr } = await supabase
      .from("proposal_signatures")
      .select("tae_document_id, tae_publication_id, proposal_id")
      .eq("id", signatureId)
      .single();

    if (sigErr || !sig) {
      return jsonResponse({ error: "Signature not found" }, 404);
    }

    if (!sig.tae_document_id && !sig.tae_publication_id) {
      return jsonResponse({ error: "No TAE IDs available" }, 400);
    }

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
      return jsonResponse({ error: "TAE token not found in response" }, 502);
    }

    const initialCandidates = [
      String(sig.tae_publication_id || "").trim(),
      String(sig.tae_document_id || "").trim(),
    ].filter(Boolean);

    const candidateIds = new Set<string>(initialCandidates);
    let downloadRes: Response | null = null;

    console.log(`[tae-download] Attempting download. docId=${sig.tae_document_id}, pubId=${sig.tae_publication_id}`);

    if (sig.tae_document_id) {
      try {
        console.log(`[tae-download] Resolving publication for document ${sig.tae_document_id}`);
        const siRes = await fetch(`${taeConfig.base_url}/signintegration/v2/Publicacoes/documentos-empresa`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${taeToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify([Number(sig.tae_document_id)]),
        });

        const siRaw = await siRes.text();
        console.log(`[tae-download] signintegration response (${siRes.status}): ${siRaw.substring(0, 500)}`);

        if (siRes.ok && siRaw) {
          let parsed: any = null;
          try { parsed = JSON.parse(siRaw); } catch { parsed = null; }
          const items = Array.isArray(parsed?.data || parsed) ? (parsed?.data || parsed) : [parsed?.data || parsed];
          for (const item of items) {
            for (const id of extractCandidateIds(item)) candidateIds.add(id);
          }
        }
      } catch (e: any) {
        console.log(`[tae-download] signintegration error: ${e.message}`);
      }
    }

    const orderedCandidateIds = Array.from(candidateIds);

    for (const candidateId of orderedCandidateIds) {
      if (downloadRes) break;

      try {
        const metaUrl = `${taeConfig.base_url}/documents/v1/publicacoes/${encodeURIComponent(candidateId)}`;
        console.log(`[tae-download] Trying metadata: ${metaUrl}`);
        const metaRes = await fetch(metaUrl, {
          headers: { Authorization: `Bearer ${taeToken}` },
        });
        const metaRaw = await metaRes.text();
        if (metaRes.ok && metaRaw) {
          let metaData: any = null;
          try { metaData = JSON.parse(metaRaw); } catch { metaData = null; }
          const payload = metaData?.data || metaData;
          const inlineSignedUrl = String(
            payload?.signedURL || payload?.signedUrl || payload?.url || payload?.downloadUrl || payload?.link || "",
          ).trim();
          if (inlineSignedUrl) {
            console.log(`[tae-download] Trying inline signed URL for ${candidateId}`);
            downloadRes = await tryFetchSignedFile(inlineSignedUrl);
            if (downloadRes) break;
          }
        }
      } catch {
        // continue
      }

      try {
        const signedUrlEndpoint = `${taeConfig.base_url}/documents/v1/publicacoes/download/signed-url?idPublicacao=${encodeURIComponent(candidateId)}`;
        console.log(`[tae-download] Trying signed-url: ${signedUrlEndpoint}`);
        const signedUrlRes = await fetch(signedUrlEndpoint, {
          headers: { Authorization: `Bearer ${taeToken}` },
        });
        const signedUrlRaw = await signedUrlRes.text();
        if (signedUrlRes.ok && signedUrlRaw) {
          let signedUrlData: any = null;
          try { signedUrlData = JSON.parse(signedUrlRaw); } catch { signedUrlData = null; }
          const payload = signedUrlData?.data || signedUrlData;
          const signedUrl = String(
            payload?.signedURL || payload?.signedUrl || payload?.url || payload?.downloadUrl || payload?.link || "",
          ).trim();
          if (signedUrl) {
            console.log(`[tae-download] Trying fetched signed URL for ${candidateId}`);
            downloadRes = await tryFetchSignedFile(signedUrl);
            if (downloadRes) break;
          }
        }
      } catch {
        // continue
      }

      try {
        for (const url of [
          `${taeConfig.base_url}/documents/v1/publicacoes/${encodeURIComponent(candidateId)}/download?tipoDownload=0`,
          `${taeConfig.base_url}/documents/v1/publicacoes/${encodeURIComponent(candidateId)}/download?tipoDownload=1`,
          `${taeConfig.base_url}/documents/v1/publicacoes/${encodeURIComponent(candidateId)}/download`,
          `${taeConfig.base_url}/documents/v1/envelopes/${encodeURIComponent(candidateId)}/download`,
          `${taeConfig.base_url}/documents/v1/documentos/${encodeURIComponent(candidateId)}/download`,
        ]) {
          console.log(`[tae-download] Trying binary endpoint: ${url}`);
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${taeToken}` },
          });
          if (res.ok) {
            downloadRes = res;
            break;
          }
          await res.text().catch(() => "");
        }
        if (downloadRes) break;
      } catch {
        // continue
      }
    }

    if (!downloadRes) {
      return jsonResponse({
        error: "Não foi possível baixar o documento assinado do TAE",
        taeDocumentId: sig.tae_document_id,
        taePublicationId: sig.tae_publication_id,
        candidateIds: orderedCandidateIds,
      }, 502);
    }

    const pdfBuffer = await downloadRes.arrayBuffer();
    const uint8 = new Uint8Array(pdfBuffer);
    let binary = "";
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    const base64 = btoa(binary);

    return jsonResponse({ success: true, base64, mimeType: "application/pdf" });
  } catch (err: any) {
    return jsonResponse({ error: err.message }, 500);
  }
});