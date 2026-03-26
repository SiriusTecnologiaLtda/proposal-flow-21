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

function flattenGoogleDocTabs(tabs: any[] = []): any[] {
  const result: any[] = [];

  for (const tab of tabs) {
    result.push(tab);
    if (Array.isArray(tab?.childTabs) && tab.childTabs.length > 0) {
      result.push(...flattenGoogleDocTabs(tab.childTabs));
    }
  }

  return result;
}

function isGenericTabTitle(title?: string | null): boolean {
  if (!title) return false;
  const normalized = title.trim().toLowerCase();
  return /^guia\s+\d+$/.test(normalized) || /^tab\s+\d+$/.test(normalized);
}

async function getPreferredGoogleDocTab(
  accessToken: string,
  docId: string,
): Promise<{ tabId: string; title: string | null } | null> {
  const resp = await fetch(`https://docs.googleapis.com/v1/documents/${docId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    throw new Error(`Falha ao consultar guias do Google Docs: ${await resp.text()}`);
  }

  const doc = await resp.json();
  const allTabs = flattenGoogleDocTabs(doc?.tabs || []);

  if (allTabs.length === 0) {
    return null;
  }

  const leafTabs = allTabs.filter((tab) => !Array.isArray(tab?.childTabs) || tab.childTabs.length === 0);
  const candidates = leafTabs.length > 0 ? leafTabs : allTabs;
  const preferred = candidates.find((tab) => !isGenericTabTitle(tab?.tabProperties?.title)) || candidates[0];
  const tabId = preferred?.tabProperties?.tabId;

  if (!tabId) {
    return null;
  }

  return {
    tabId,
    title: preferred?.tabProperties?.title || null,
  };
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
    const { signatureId, attachmentIds, emailSubject, emailBody } = await req.json();
    if (!signatureId) {
      log(logs, "Validação", "error", "signatureId é obrigatório");
      return respondWithLogs(logs, {}, 400);
    }
    const selectedAttachmentIds: string[] = Array.isArray(attachmentIds) ? attachmentIds : [];
    const customSubject: string | null = typeof emailSubject === "string" && emailSubject.trim() ? emailSubject.trim() : null;
    const customBody: string | null = typeof emailBody === "string" && emailBody.trim() ? emailBody.trim() : null;

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
    // Export a specific Google Docs tab when available to avoid the
    // auto-generated "Guia 1 / Tab 1" separator page in tabbed documents.
    let exportUrl = `https://docs.google.com/document/d/${officialDoc.doc_id}/export?format=pdf`;
    try {
      const preferredTab = await getPreferredGoogleDocTab(googleToken, officialDoc.doc_id);
      if (preferredTab?.tabId) {
        exportUrl += `&tab=${encodeURIComponent(preferredTab.tabId)}`;
        log(
          logs,
          "Google Docs",
          "ok",
          `Exportando guia específica do documento${preferredTab.title ? `: ${preferredTab.title}` : ""}`,
        );
      } else {
        log(logs, "Google Docs", "info", "Documento sem guias detectáveis — exportação padrão será usada");
      }
    } catch (tabError: any) {
      log(
        logs,
        "Google Docs",
        "info",
        `Não foi possível identificar a guia correta; seguindo com exportação padrão (${tabError.message})`,
      );
    }

    const pdfRes = await fetch(exportUrl, {
      headers: { Authorization: `Bearer ${googleToken}` },
      redirect: "follow",
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

    // 9. Fetch project attachment files from Drive (if any selected)
    const attachmentBlobs: { name: string; blob: Blob }[] = [];
    if (selectedAttachmentIds.length > 0) {
      log(logs, "Anexos", "info", `Buscando ${selectedAttachmentIds.length} anexo(s) do projeto...`);

      // Load attachment records from DB
      const { data: attachmentRecords } = await supabase
        .from("project_attachments")
        .select("id, file_name, file_url, mime_type")
        .in("id", selectedAttachmentIds);

      if (attachmentRecords?.length) {
        for (const att of attachmentRecords) {
          try {
            if (!att.file_url) {
              log(logs, "Anexos", "info", `Anexo "${att.file_name}" sem URL — ignorado`);
              continue;
            }

            // Extract Drive file ID from the URL
            let driveFileId: string | null = null;
            let match = att.file_url.match(/\/d\/([a-zA-Z0-9_-]+)/);
            if (match) driveFileId = match[1];
            if (!driveFileId) {
              match = att.file_url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
              if (match) driveFileId = match[1];
            }

            if (!driveFileId) {
              log(logs, "Anexos", "info", `Não foi possível extrair ID do Drive para "${att.file_name}" — ignorado`);
              continue;
            }

            // Determine if we need to export (Google Docs) or download (binary file)
            const mimeType = (att.mime_type || "").toLowerCase();
            const isGoogleDoc = att.file_url.includes("docs.google.com/document");
            const isGoogleSheet = att.file_url.includes("docs.google.com/spreadsheets");
            const isGoogleSlide = att.file_url.includes("docs.google.com/presentation");

            let fileRes: Response;
            let outputFileName = att.file_name;

            if (isGoogleDoc) {
              // Export Google Docs as PDF
              fileRes = await fetch(
                `https://docs.google.com/document/d/${driveFileId}/export?format=pdf`,
                { headers: { Authorization: `Bearer ${googleToken}` }, redirect: "follow" }
              );
              if (!outputFileName.toLowerCase().endsWith(".pdf")) outputFileName += ".pdf";
            } else if (isGoogleSheet) {
              fileRes = await fetch(
                `https://docs.google.com/spreadsheets/d/${driveFileId}/export?format=pdf`,
                { headers: { Authorization: `Bearer ${googleToken}` }, redirect: "follow" }
              );
              if (!outputFileName.toLowerCase().endsWith(".pdf")) outputFileName += ".pdf";
            } else if (isGoogleSlide) {
              fileRes = await fetch(
                `https://docs.google.com/presentation/d/${driveFileId}/export?format=pdf`,
                { headers: { Authorization: `Bearer ${googleToken}` }, redirect: "follow" }
              );
              if (!outputFileName.toLowerCase().endsWith(".pdf")) outputFileName += ".pdf";
            } else {
              // Regular Drive file — download binary content
              fileRes = await fetch(
                `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`,
                { headers: { Authorization: `Bearer ${googleToken}` } }
              );
            }

            if (!fileRes.ok) {
              const errText = await fileRes.text();
              log(logs, "Anexos", "info", `Falha ao baixar "${att.file_name}" (${fileRes.status}): ${errText.substring(0, 150)}`);
              continue;
            }

            const attBlob = await fileRes.blob();
            attachmentBlobs.push({ name: outputFileName, blob: attBlob });
            log(logs, "Anexos", "ok", `Anexo "${att.file_name}" baixado (${(attBlob.size / 1024).toFixed(1)} KB)`);
          } catch (attErr: any) {
            log(logs, "Anexos", "info", `Erro ao processar anexo "${att.file_name}": ${attErr.message}`);
          }
        }
      }
      log(logs, "Anexos", "ok", `${attachmentBlobs.length} anexo(s) pronto(s) para envio`);
    }

    // 10. Upload all documents to TAE (proposal + attachments in same envelope)
    log(logs, "TAE Upload", "info", `Fazendo upload de ${1 + attachmentBlobs.length} documento(s) no TAE...`);
    const formData = new FormData();
    const fileName = `${officialDoc.file_name || "proposta"}.pdf`;
    formData.append("Envelope", new File([pdfBlob], fileName, { type: "application/pdf" }));

    // Append attachment files to the same envelope
    for (const att of attachmentBlobs) {
      const attMime = att.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream";
      formData.append("Envelope", new File([att.blob], att.name, { type: attMime }));
    }

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
    log(logs, "TAE Upload", "ok", `Envelope enviado — ID TAE: ${taeDocumentId} (${1 + attachmentBlobs.length} arquivo(s))`);

    // 11. Publish with signatories
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

    // Sanitize: remove characters not accepted by TAE (only allow: _@.,()!?:+-%$ and alphanumeric)
    const sanitize = (str: string) => str.replace(/[—–""'']/g, "-").replace(/[^\w\s@.,()!?:+\-%$]/g, "");

    // Load proposal to get number for email subject fallback
    const { data: proposal } = await supabase
      .from("proposals")
      .select("number, clients(name)")
      .eq("id", sigRecord.proposal_id)
      .single();

    const subjectRaw = customSubject
      || (proposal ? `Proposta ${proposal.number} - ${(proposal as any).clients?.name || ""}` : "Documento para assinatura");
    const subject = sanitize(subjectRaw).substring(0, 60);

    const bodyRaw = customBody
      || sanitize(`Prezado(a), segue documento para sua assinatura: ${subjectRaw}`);
    const body = sanitize(bodyRaw);

    const publishBody = {
      idDocumento: taeDocumentId,
      destinatarios,
      observadores,
      utilizaWorkflow: false,
      publicacaoOpcoes: {
        assuntoMensagem: subject,
        corpoMensagem: body,
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
    console.log("[tae-send-signature] Publish response:", JSON.stringify(publishData).substring(0, 500));
    const taePublicationId =
      publishData?.data?.id ||
      publishData?.data?.idPublicacao ||
      publishData?.idPublicacao ||
      publishData?.id ||
      (typeof publishData?.data === "number" || typeof publishData?.data === "string" ? String(publishData.data) : null) ||
      publishData?.data?.[0]?.id ||
      publishData?.data?.[0]?.idPublicacao;

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
