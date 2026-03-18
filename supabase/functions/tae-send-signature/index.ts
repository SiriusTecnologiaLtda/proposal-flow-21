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

// ─── Google Auth (service account) ──────────────────────────────────
async function getGoogleAccessToken(serviceAccountKey: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      iss: serviceAccountKey.client_email,
      scope: "https://www.googleapis.com/auth/drive",
      aud: serviceAccountKey.token_uri,
      exp: now + 3600,
      iat: now,
    })
  );

  const signInput = `${header}.${payload}`;
  const pem = serviceAccountKey.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signInput)
  );

  const b64sig = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${header}.${payload}.${b64sig}`;
  const tokenRes = await fetch(serviceAccountKey.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("Failed to get Google access token");
  return tokenData.access_token;
}

// ─── Role mapping ───────────────────────────────────────────────────
// AcaoDoUsuario: 0=Assinar, 1=Testemunhar, 2=Aprovar, 3=Reconhecer, 4=Acusar recebimento
function roleToAcao(role: string): number {
  switch (role) {
    case "Testemunha": return 1;
    case "Aprovador": return 2;
    default: return 0; // Signatário
  }
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

    log(logs, "Autenticação", "ok", `Usuário: ${user.email}`);

    // 2. Parse body
    const { signatureId } = await req.json();
    if (!signatureId) {
      log(logs, "Validação", "error", "signatureId é obrigatório");
      return respondWithLogs(logs, {}, 400);
    }

    // 3. Load signature record with signatories
    const { data: sigRecord, error: sigErr } = await supabase
      .from("proposal_signatures")
      .select("*, proposal_signatories(*)")
      .eq("id", signatureId)
      .single();
    if (sigErr || !sigRecord) {
      log(logs, "Dados", "error", `Registro de assinatura não encontrado: ${sigErr?.message}`);
      return respondWithLogs(logs, {}, 400);
    }

    log(logs, "Dados", "ok", `Assinatura carregada — ${sigRecord.proposal_signatories?.length || 0} signatário(s)`);

    // 4. Get official document (fallback to latest "proposta" if none marked official)
    let { data: officialDoc } = await supabase
      .from("proposal_documents")
      .select("*")
      .eq("proposal_id", sigRecord.proposal_id)
      .eq("doc_type", "proposta")
      .eq("is_official", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!officialDoc) {
      const { data: latestDoc } = await supabase
        .from("proposal_documents")
        .select("*")
        .eq("proposal_id", sigRecord.proposal_id)
        .eq("doc_type", "proposta")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      officialDoc = latestDoc;
    }

    if (!officialDoc) {
      log(logs, "Documento", "error", "Nenhum documento de proposta encontrado. Gere o documento primeiro.");
      return respondWithLogs(logs, {}, 400);
    }

    log(logs, "Documento", "ok", `Documento: ${officialDoc.file_name} (v${officialDoc.version}, oficial: ${officialDoc.is_official})`);

    // 5. Get Google credentials from google_integrations table
    const { data: gIntegration } = await supabase
      .from("google_integrations")
      .select("*")
      .eq("is_default", true)
      .limit(1)
      .maybeSingle();

    if (!gIntegration) {
      // fallback: any integration
      const { data: anyInt } = await supabase
        .from("google_integrations")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (!anyInt) {
        log(logs, "Google", "error", "Nenhuma integração Google configurada");
        return respondWithLogs(logs, {}, 500);
      }
      Object.assign(gIntegration || {}, anyInt);
    }

    let saKey: any = null;
    const gInt = gIntegration!;
    if (gInt.auth_type === "oauth2") {
      // Use OAuth2 refresh token to get access token
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: gInt.oauth_client_id || "",
          client_secret: gInt.oauth_client_secret || "",
          refresh_token: gInt.oauth_refresh_token || "",
          grant_type: "refresh_token",
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) {
        log(logs, "Google", "error", `Falha ao obter token OAuth2: ${JSON.stringify(tokenData)}`);
        return respondWithLogs(logs, {}, 500);
      }
      // Store token for later use
      (globalThis as any).__googleOAuthToken = tokenData.access_token;
      log(logs, "Google", "ok", "Token OAuth2 obtido");
    } else {
      try {
        saKey = JSON.parse(gInt.service_account_key || "{}");
        if (!saKey.private_key) throw new Error("private_key ausente");
        log(logs, "Google", "ok", `Service Account: ${saKey.client_email}`);
      } catch (e: any) {
        log(logs, "Google", "error", `Falha ao parsear chave SA: ${e.message}`);
        return respondWithLogs(logs, {}, 500);
      }
    }

    // 6. Export PDF from Google Drive
    log(logs, "Google Drive", "info", "Exportando documento como PDF...");
    let googleToken: string;
    if ((globalThis as any).__googleOAuthToken) {
      googleToken = (globalThis as any).__googleOAuthToken;
    } else {
      googleToken = await getGoogleAccessToken(saKey);
    }
    const exportUrl = `https://www.googleapis.com/drive/v3/files/${officialDoc.doc_id}/export?mimeType=application/pdf`;
    const pdfRes = await fetch(exportUrl, {
      headers: { Authorization: `Bearer ${googleToken}` },
    });
    if (!pdfRes.ok) {
      const errText = await pdfRes.text();
      log(logs, "Google Drive", "error", `Falha ao exportar PDF: ${pdfRes.status} - ${errText.substring(0, 200)}`);
      return respondWithLogs(logs, {}, 500);
    }
    const pdfBlob = await pdfRes.blob();
    log(logs, "Google Drive", "ok", `PDF exportado (${(pdfBlob.size / 1024).toFixed(1)} KB)`);

    // 7. Get TAE config
    const { data: taeConfig, error: taeConfigErr } = await supabase
      .from("tae_config")
      .select("*")
      .maybeSingle();
    if (taeConfigErr || !taeConfig) {
      log(logs, "TAE Config", "error", "Configuração TAE não encontrada");
      return respondWithLogs(logs, {}, 500);
    }

    const taePassword = Deno.env.get("TAE_SERVICE_USER_PASSWORD");
    if (!taeConfig.service_user_email || !taePassword) {
      log(logs, "TAE Config", "error", "Credenciais do usuário de serviço TAE não configuradas");
      return respondWithLogs(logs, {}, 500);
    }

    const baseUrl = taeConfig.base_url;
    log(logs, "TAE Config", "ok", `Ambiente: ${taeConfig.environment} | Usuário: ${taeConfig.service_user_email}`);

    // 8. Login to TAE
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
      log(logs, "TAE Login", "error", `Token não retornado pelo TAE. Resposta: ${loginBody.substring(0, 500)}`);
      return respondWithLogs(logs, {}, 500);
    }
    log(logs, "TAE Login", "ok", "Login TAE realizado com sucesso");

    // 9. Upload document to TAE
    log(logs, "TAE Upload", "info", "Fazendo upload do PDF no TAE...");
    const formData = new FormData();
    const fileName = `${officialDoc.file_name || "proposta"}.pdf`;
    formData.append("Envelope", new File([pdfBlob], fileName, { type: "application/pdf" }));
    formData.append("NomeEnvelope", fileName);

    const uploadRes = await fetch(`${baseUrl}/documents/v1/envelopes/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${taeToken}`,
      },
      body: formData,
    });
    const uploadBody = await uploadRes.text();
    if (!uploadRes.ok) {
      log(logs, "TAE Upload", "error", `Falha no upload (${uploadRes.status}): ${uploadBody.substring(0, 300)}`);
      return respondWithLogs(logs, {}, 500);
    }

    let uploadData: any;
    try { uploadData = JSON.parse(uploadBody); } catch { uploadData = { raw: uploadBody }; }
    const taeDocumentId = uploadData?.data?.id || uploadData?.id || (typeof uploadData?.data === "number" || typeof uploadData?.data === "string" ? String(uploadData.data) : null) || uploadData?.data?.[0]?.id;
    if (!taeDocumentId) {
      log(logs, "TAE Upload", "error", `ID do documento não retornado: ${uploadBody.substring(0, 300)}`);
      return respondWithLogs(logs, {}, 500);
    }
    log(logs, "TAE Upload", "ok", `Documento enviado — ID TAE: ${taeDocumentId}`);

    // 10. Publish with signatories
    log(logs, "TAE Publicação", "info", "Publicando documento com signatários...");
    const signatories = sigRecord.proposal_signatories || [];

    const destinatarios = signatories
      .filter((s: any) => s.role !== "Observador")
      .map((s: any) => ({
        email: s.email,
        acao: roleToAcao(s.role || "Signatário"),
        nomeCompleto: s.name,
        tipoAutenticacao: 1,
        notificaEnvio: true,
        tipoEnvioDocumento: 1,
      }));

    const observadores = signatories
      .filter((s: any) => s.role === "Observador")
      .map((s: any) => ({
        email: s.email,
        tipoEnvioDocumento: 1,
      }));

    // Load proposal to get number for email subject
    const { data: proposal } = await supabase
      .from("proposals")
      .select("number, clients(name)")
      .eq("id", sigRecord.proposal_id)
      .single();

    // Sanitize: remove characters not accepted by TAE (only allow: _@.,()!?:+-%$ and alphanumeric)
    const sanitize = (str: string) => str.replace(/[—–""'']/g, "-").replace(/[^\w\s@.,()!?:+\-%$]/g, "");

    const subjectRaw = proposal
      ? `Proposta ${proposal.number} - ${(proposal as any).clients?.name || ""}`
      : "Documento para assinatura";
    const subject = sanitize(subjectRaw);

    const publishBody = {
      idDocumento: taeDocumentId,
      destinatarios,
      observadores,
      utilizaWorkflow: false,
      publicacaoOpcoes: {
        assuntoMensagem: subject,
        corpoMensagem: sanitize(`Prezado(a), segue documento para sua assinatura: ${subjectRaw}`),
        permiteRejeitarDocumento: true,
        intervaloLembrete: 3,
      },
    };

    const publishRes = await fetch(`${baseUrl}/documents/v1/publicacoes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${taeToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(publishBody),
    });
    const publishRaw = await publishRes.text();
    if (!publishRes.ok) {
      log(logs, "TAE Publicação", "error", `Falha na publicação (${publishRes.status}): ${publishRaw.substring(0, 500)}`);
      return respondWithLogs(logs, {}, 500);
    }

    let publishData: any;
    try { publishData = JSON.parse(publishRaw); } catch { publishData = { raw: publishRaw }; }
    const taePublicationId =
      publishData?.data?.id ||
      publishData?.id ||
      (typeof publishData?.data === "number" || typeof publishData?.data === "string" ? String(publishData.data) : null) ||
      publishData?.data?.[0]?.id;

    log(logs, "TAE Publicação", "ok", `Publicação criada — ID: ${taePublicationId || "OK"}`);
    // 11. Update proposal_signatures with TAE IDs
    const updatePayload: any = {
      tae_document_id: String(taeDocumentId),
      status: "sent",
    };
    if (taePublicationId) {
      updatePayload.tae_publication_id = String(taePublicationId);
    }
    await supabase
      .from("proposal_signatures")
      .update(updatePayload)
      .eq("id", signatureId);

    log(logs, "Finalização", "ok", "Processo concluído! Documento publicado no TAE com sucesso.");

    return respondWithLogs(logs, {
      taeDocumentId: String(taeDocumentId),
      taePublicationId: taePublicationId ? String(taePublicationId) : null,
    });
  } catch (err: any) {
    log(logs, "Erro inesperado", "error", err.message);
    return respondWithLogs(logs, {}, 500);
  }
});
