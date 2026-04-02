import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hashBuffer(buffer: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// --- Gmail OAuth helpers ---

async function refreshAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Falha ao renovar token OAuth: ${err}`);
  }

  const data = await resp.json();
  return data.access_token;
}

async function gmailRequest(accessToken: string, path: string): Promise<any> {
  const resp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gmail API error (${resp.status}): ${err}`);
  }

  return resp.json();
}

async function gmailGetAttachment(accessToken: string, messageId: string, attachmentId: string): Promise<Uint8Array> {
  const data = await gmailRequest(accessToken, `messages/${messageId}/attachments/${attachmentId}`);
  const base64 = data.data.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getHeader(headers: any[], name: string): string {
  const h = headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

// --- Main handler ---

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    // --- Auth ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Não autorizado" }, 401);
    }

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "Não autorizado" }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check admin role
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return jsonResponse({ error: "Acesso restrito a administradores" }, 403);
    }

    // --- Parse request ---
    const body = await req.json();
    const action = body.action || "sync"; // "test" | "sync"

    // --- Load email inbox config (filters, refresh token) ---
    const { data: config, error: configErr } = await adminClient
      .from("email_inbox_config")
      .select("*")
      .limit(1)
      .single();

    if (configErr || !config) {
      return jsonResponse({ error: "Configuração de e-mail não encontrada" }, 404);
    }

    // --- Load Google OAuth credentials from google_integrations (default) ---
    const { data: gInt, error: gIntErr } = await adminClient
      .from("google_integrations")
      .select("oauth_client_id, oauth_client_secret")
      .eq("is_default", true)
      .single();

    if (gIntErr || !gInt?.oauth_client_id || !gInt?.oauth_client_secret) {
      return jsonResponse({
        error: "Integração Google OAuth padrão não configurada. Configure em Configurações > Google Drive / Docs primeiro."
      }, 400);
    }

    // Validate refresh token from email config
    if (!config.gmail_refresh_token) {
      return jsonResponse({
        error: "Conta Gmail não autorizada. Clique em 'Autorizar Conta Gmail' na tela de configuração."
      }, 400);
    }

    // --- Get access token ---
    let accessToken: string;
    try {
      accessToken = await refreshAccessToken(
        gInt.oauth_client_id,
        gInt.oauth_client_secret,
        config.gmail_refresh_token
      );
    } catch (tokenErr) {
      const errMsg = tokenErr instanceof Error ? tokenErr.message : String(tokenErr);
      if (action === "test") {
        return jsonResponse({ success: false, error: `Falha na autenticação: ${errMsg}` });
      }
      return jsonResponse({ error: `Falha na autenticação Gmail: ${errMsg}` }, 401);
    }

    // === TEST CONNECTION ===
    if (action === "test") {
      try {
        const profile = await gmailRequest(accessToken, "profile");
        const labelsData = await gmailRequest(accessToken, "labels");
        const labels: string[] = (labelsData.labels || []).map((l: any) => l.name);

        return jsonResponse({
          success: true,
          message: `Conexão Gmail bem-sucedida com ${profile.emailAddress}`,
          mailboxes: labels,
        });
      } catch (connErr) {
        const errMsg = connErr instanceof Error ? connErr.message : String(connErr);
        return jsonResponse({
          success: false,
          error: `Falha na conexão Gmail: ${errMsg}`,
        });
      }
    }

    // === SYNC ===
    const syncStartedAt = new Date().toISOString();
    let emailsFound = 0;
    let pdfsImported = 0;
    const syncErrors: string[] = [];

    try {
      // Build Gmail search query
      const queryParts: string[] = ["has:attachment", "filename:pdf", "is:unread"];

      if (config.sender_filter && config.sender_filter.trim()) {
        queryParts.push(`from:${config.sender_filter.trim()}`);
      }
      if (config.subject_filter && config.subject_filter.trim()) {
        queryParts.push(`subject:${config.subject_filter.trim()}`);
      }

      const folder = config.monitored_folder || "INBOX";
      if (folder.toUpperCase() !== "INBOX") {
        queryParts.push(`label:${folder}`);
      } else {
        queryParts.push("in:inbox");
      }

      const searchQuery = queryParts.join(" ");
      console.log("Gmail search query:", searchQuery);

      const searchResult = await gmailRequest(
        accessToken,
        `messages?q=${encodeURIComponent(searchQuery)}&maxResults=50`
      );

      const messageIds: string[] = (searchResult.messages || []).map((m: any) => m.id);
      emailsFound = messageIds.length;

      if (emailsFound === 0) {
        await adminClient
          .from("email_inbox_config")
          .update({
            last_sync_at: syncStartedAt,
            last_sync_status: "success",
            last_sync_message: "Nenhum e-mail novo encontrado.",
            last_sync_emails_found: 0,
            last_sync_pdfs_imported: 0,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", config.id);

        return jsonResponse({
          success: true,
          emails_found: 0,
          pdfs_imported: 0,
          message: "Nenhum e-mail novo encontrado.",
        });
      }

      // Process each message
      for (const msgId of messageIds) {
        try {
          const msg = await gmailRequest(accessToken, `messages/${msgId}?format=full`);

          const sender = getHeader(msg.payload?.headers, "From");
          const subject = getHeader(msg.payload?.headers, "Subject") || "(sem assunto)";
          const dateStr = getHeader(msg.payload?.headers, "Date");
          const messageIdHeader = getHeader(msg.payload?.headers, "Message-ID") || msgId;

          const pdfParts = findPdfParts(msg.payload);

          if (pdfParts.length === 0) {
            await markAsRead(accessToken, msgId);
            continue;
          }

          for (const part of pdfParts) {
            try {
              if (!part.attachmentId) continue;

              const pdfBuffer = await gmailGetAttachment(accessToken, msgId, part.attachmentId);
              const fileHash = await hashBuffer(pdfBuffer);

              const { data: existing } = await adminClient
                .from("software_proposals")
                .select("id")
                .eq("file_hash", fileHash)
                .maybeSingle();

              if (existing) {
                syncErrors.push(`PDF "${part.filename}" ignorado — já importado (hash duplicado).`);
                continue;
              }

              const storagePath = `email-imports/${fileHash}/${part.filename}`;
              const { error: uploadErr } = await adminClient.storage
                .from("software-proposal-pdfs")
                .upload(storagePath, pdfBuffer, {
                  contentType: "application/pdf",
                  upsert: false,
                });

              if (uploadErr) {
                syncErrors.push(`Erro ao salvar PDF "${part.filename}": ${uploadErr.message}`);
                continue;
              }

              const { error: insertErr } = await adminClient
                .from("software_proposals")
                .insert({
                  file_name: part.filename,
                  file_url: storagePath,
                  file_hash: fileHash,
                  status: "pending_extraction",
                  origin: "email_inbox",
                  origin_detail: JSON.stringify({
                    sender,
                    subject,
                    received_at: dateStr || new Date().toISOString(),
                    message_id: messageIdHeader,
                  }),
                  uploaded_by: user.id,
                  vendor_name: "",
                  total_value: 0,
                });

              if (insertErr) {
                syncErrors.push(`Erro ao criar registro para "${part.filename}": ${insertErr.message}`);
                continue;
              }

              pdfsImported++;
            } catch (partErr) {
              const errMsg = partErr instanceof Error ? partErr.message : String(partErr);
              syncErrors.push(`Erro ao processar anexo "${part.filename}": ${errMsg}`);
            }
          }

          await markAsRead(accessToken, msgId);
        } catch (msgErr) {
          const errMsg = msgErr instanceof Error ? msgErr.message : String(msgErr);
          syncErrors.push(`Erro ao processar e-mail ${msgId}: ${errMsg}`);
        }
      }

      const statusMsg = syncErrors.length > 0
        ? `Sincronização parcial: ${pdfsImported} PDFs importados, ${syncErrors.length} erro(s).`
        : `Sincronização concluída: ${pdfsImported} PDFs importados de ${emailsFound} e-mail(s).`;

      await adminClient
        .from("email_inbox_config")
        .update({
          last_sync_at: syncStartedAt,
          last_sync_status: syncErrors.length > 0 ? "partial" : "success",
          last_sync_message: statusMsg,
          last_sync_emails_found: emailsFound,
          last_sync_pdfs_imported: pdfsImported,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", config.id);

      return jsonResponse({
        success: true,
        emails_found: emailsFound,
        pdfs_imported: pdfsImported,
        errors: syncErrors,
        message: statusMsg,
      });
    } catch (syncErr) {
      const errMsg = syncErr instanceof Error ? syncErr.message : String(syncErr);

      await adminClient
        .from("email_inbox_config")
        .update({
          last_sync_at: syncStartedAt,
          last_sync_status: "error",
          last_sync_message: `Erro na sincronização: ${errMsg}`,
          last_sync_emails_found: emailsFound,
          last_sync_pdfs_imported: pdfsImported,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", config.id);

      return jsonResponse({
        success: false,
        error: `Erro na sincronização: ${errMsg}`,
        emails_found: emailsFound,
        pdfs_imported: pdfsImported,
        partial_errors: syncErrors,
      }, 500);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: `Erro interno: ${errMsg}` }, 500);
  }
});

// --- Gmail helpers ---

async function markAsRead(accessToken: string, messageId: string) {
  await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
  });
}

interface PdfPartInfo {
  filename: string;
  attachmentId: string;
}

function findPdfParts(payload: any): PdfPartInfo[] {
  const results: PdfPartInfo[] = [];
  if (!payload) return results;

  if (payload.filename && payload.filename.toLowerCase().endsWith(".pdf") && payload.body?.attachmentId) {
    results.push({
      filename: payload.filename,
      attachmentId: payload.body.attachmentId,
    });
  }

  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      results.push(...findPdfParts(part));
    }
  }

  return results;
}
