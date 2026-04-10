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

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function base64ToUint8Array(base64: string) {
  const normalized = base64.replace(/\s/g, "");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

type ParsedDownload = {
  base64: string;
  mimeType: string;
  fileName?: string;
};

async function parseTaeDownloadResponse(res: Response): Promise<ParsedDownload | null> {
  const contentType = (res.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/pdf") || contentType.includes("application/octet-stream")) {
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength < 500) return null;

    return {
      base64: arrayBufferToBase64(buffer),
      mimeType: contentType.includes("application/pdf") ? "application/pdf" : "application/octet-stream",
    };
  }

  const text = await res.text();
  if (!text) return null;

  try {
    const payload = JSON.parse(text);
    const data = payload?.data ?? payload;

    if (typeof data?.fileBytes === "string" && data.fileBytes.length > 1000) {
      const bytes = base64ToUint8Array(data.fileBytes);
      if (bytes.byteLength < 500) return null;

      return {
        base64: data.fileBytes.replace(/\s/g, ""),
        mimeType: data?.fileType || "application/pdf",
        fileName: data?.fileName,
      };
    }

    if (typeof data?.signedURL === "string" && data.signedURL.startsWith("http")) {
      console.log("[tae-download] JSON response exposed signedURL, fetching binary file");
      const signedRes = await fetch(data.signedURL);
      if (!signedRes.ok) return null;

      const signedBuffer = await signedRes.arrayBuffer();
      if (signedBuffer.byteLength < 500) return null;

      return {
        base64: arrayBufferToBase64(signedBuffer),
        mimeType: signedRes.headers.get("content-type") || data?.fileType || "application/pdf",
        fileName: data?.fileName,
      };
    }

    console.log("[tae-download] JSON response did not contain fileBytes/signedURL");
    return null;
  } catch {
    const bytes = new TextEncoder().encode(text);
    if (bytes.byteLength > 500 && text.startsWith("%PDF-")) {
      return {
        base64: arrayBufferToBase64(bytes.buffer),
        mimeType: "application/pdf",
      };
    }

    console.log(`[tae-download] Unrecognized response body prefix: ${text.substring(0, 120)}`);
    return null;
  }
}

// P3: Timeout helper for TAE HTTP calls (no retry — download is idempotent, caller can retry)
const TAE_TIMEOUT_MS = 30_000;
function taeFetchWithTimeout(url: string, opts: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TAE_TIMEOUT_MS);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

async function taeLogin(baseUrl: string, email: string, password: string): Promise<string | null> {
  const t0 = Date.now();
  const res = await taeFetchWithTimeout(`${baseUrl}/identityintegration/v3/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userName: email, password }),
  });
  console.log(`[tae-download] LOGIN elapsed=${Date.now() - t0}ms status=${res.status}`);
  if (!res.ok) return null;
  const body = await res.text();
  let data: any;
  try { data = JSON.parse(body); } catch { return null; }
  return data.access_token || data.token || data.data?.access_token || data.data?.token || null;
}

// Resolve publication ID from document ID using signintegration
async function resolvePublicationId(baseUrl: string, token: string, docId: string): Promise<string | null> {
  try {
    const res = await taeFetchWithTimeout(`${baseUrl}/signintegration/v2/Publicacoes/documentos-empresa`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([Number(docId)]),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const items = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [data?.data || data];
    for (const item of items) {
      const pubId = String(item?.idPublicacao || item?.publicacaoId || "").trim();
      if (pubId && pubId !== "0" && pubId !== "null" && pubId !== "undefined") return pubId;
    }
  } catch (e: any) {
    console.log(`[tae-download] resolvePublicationId error: ${e.message}`);
  }
  return null;
}

// Try to get publication info via v2 endpoint
async function getPublicationInfo(baseUrl: string, token: string, id: string): Promise<any | null> {
  try {
    const res = await taeFetchWithTimeout(`${baseUrl}/documents/v2/publicacoes/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.log(`[tae-download] v2/publicacoes/${id} → ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e: any) {
    console.log(`[tae-download] getPublicationInfo error: ${e.message}`);
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

    const { data: sig, error: sigErr } = await supabase
      .from("proposal_signatures")
      .select("tae_document_id, tae_publication_id, proposal_id")
      .eq("id", signatureId)
      .single();

    if (sigErr || !sig) return jsonResponse({ error: "Signature not found" }, 404);
    if (!sig.tae_document_id) return jsonResponse({ error: "No TAE document ID available" }, 400);

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: taeConfig } = await adminClient
      .from("tae_config")
      .select("base_url, service_user_email")
      .limit(1)
      .single();

    if (!taeConfig) return jsonResponse({ error: "TAE not configured" }, 500);

    const taePassword = Deno.env.get("TAE_SERVICE_USER_PASSWORD");
    if (!taePassword || !taeConfig.service_user_email) {
      return jsonResponse({ error: "TAE credentials missing" }, 500);
    }

    const taeToken = await taeLogin(taeConfig.base_url, taeConfig.service_user_email, taePassword);
    if (!taeToken) return jsonResponse({ error: "TAE login failed" }, 502);

    const docId = sig.tae_document_id;
    const pubId = sig.tae_publication_id;
    console.log(`[tae-download] docId=${docId}, pubId=${pubId}`);

    // Collect candidate IDs to try for download (publication IDs)
    const candidateIds: string[] = [];
    if (pubId) candidateIds.push(pubId);
    candidateIds.push(docId); // document ID might also work as publication ID

    // Try to resolve publication ID if we only have document ID
    if (!pubId) {
      const resolvedPubId = await resolvePublicationId(taeConfig.base_url, taeToken, docId);
      if (resolvedPubId && !candidateIds.includes(resolvedPubId)) {
        candidateIds.splice(1, 0, resolvedPubId); // insert after pubId but before docId
        console.log(`[tae-download] Resolved publication ID: ${resolvedPubId}`);
      }
    }

    // Get publication info to find the correct ID
    for (const cid of [...candidateIds]) {
      const info = await getPublicationInfo(taeConfig.base_url, taeToken, cid);
      if (info) {
        console.log(`[tae-download] v2 publication info for ${cid}:`, JSON.stringify(info).substring(0, 500));
        // Extract any additional IDs from the publication info
        const infoData = info?.data || info;
        const extraId = String(infoData?.id || infoData?.idPublicacao || "").trim();
        if (extraId && !candidateIds.includes(extraId)) {
          candidateIds.push(extraId);
        }
      }
    }

    console.log(`[tae-download] Candidate IDs to try: ${candidateIds.join(", ")}`);

    // Per TAE Swagger: GET /v1/publicacoes/{id}/download?tipoDownload=N
    // tipoDownload: 1=Original, 2=Assinado (com manifesto), 3=Assinado Digital, 4=Todos (ZIP)
    // Priority: try signed (2) first, then digital signed (3)
    const downloadTypes = [2, 3];

    let parsedDownload: ParsedDownload | null = null;
    let usedLabel = "";

    for (const cid of candidateIds) {
      for (const tipo of downloadTypes) {
        const url = `${taeConfig.base_url}/documents/v1/publicacoes/${encodeURIComponent(cid)}/download?tipoDownload=${tipo}`;
        console.log(`[tae-download] Trying: ${url}`);
        try {
          const res = await taeFetchWithTimeout(url, { headers: { Authorization: `Bearer ${taeToken}` } });
          if (res.ok) {
            const ct = res.headers.get("content-type") || "";
            const parsed = await parseTaeDownloadResponse(res);
            console.log(`[tae-download] Response: status=${res.status}, content-type=${ct}, parsed=${parsed ? "yes" : "no"}`);
            if (parsed) {
              parsedDownload = parsed;
              usedLabel = `tipoDownload=${tipo} (id=${cid})`;
              console.log(`[tae-download] ✓ Success: ${usedLabel}`);
              break;
            }
          } else {
            const errBody = await res.text().catch(() => "");
            console.log(`[tae-download] ${url} → ${res.status}: ${errBody.substring(0, 200)}`);
          }
        } catch (e: any) {
          console.log(`[tae-download] fetch error: ${e.message}`);
        }
      }
      if (parsedDownload) break;
    }

    // Fallback: try without tipoDownload parameter
    if (!parsedDownload) {
      for (const cid of candidateIds) {
        const url = `${taeConfig.base_url}/documents/v1/publicacoes/${encodeURIComponent(cid)}/download`;
        console.log(`[tae-download] Fallback (no tipoDownload): ${url}`);
        try {
          const res = await taeFetchWithTimeout(url, { headers: { Authorization: `Bearer ${taeToken}` } });
          if (res.ok) {
            const parsed = await parseTaeDownloadResponse(res);
            if (parsed) {
              parsedDownload = parsed;
              usedLabel = `default (id=${cid})`;
              console.log(`[tae-download] ✓ Fallback success: ${usedLabel}`);
              break;
            }
          } else {
            console.log(`[tae-download] fallback ${cid} → ${res.status}`);
            await res.text().catch(() => "");
          }
        } catch (e: any) {
          console.log(`[tae-download] fallback fetch error: ${e.message}`);
        }
      }
    }

    if (!parsedDownload) {
      return jsonResponse({
        error: "Não foi possível baixar o documento assinado do TAE",
        taeDocumentId: docId,
        taePublicationId: pubId,
        triedIds: candidateIds,
      }, 502);
    }

    return jsonResponse({
      success: true,
      base64: parsedDownload.base64,
      mimeType: parsedDownload.mimeType,
      fileName: parsedDownload.fileName,
      downloadType: usedLabel,
    });
  } catch (err: any) {
    console.error(`[tae-download] Error: ${err.message}`);
    return jsonResponse({ error: err.message }, 500);
  }
});
