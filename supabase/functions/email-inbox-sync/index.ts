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

// --- Retry helper ---
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2, delayMs = 1000): Promise<T> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        console.log(`Retry ${attempt + 1}/${maxRetries} after error: ${lastErr.message}`);
        await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
      }
    }
  }
  throw lastErr!;
}

// --- Error classification ---
interface SyncErrorDetail {
  email_id: string;
  subject: string;
  sender: string;
  filename: string;
  error_type: "download_failed" | "upload_failed" | "insert_failed" | "duplicate" | "no_attachment" | "unknown";
  error_message: string;
  auto_resolved: boolean;
  requires_action: string | null;
  timestamp: string;
}

function classifyError(errMsg: string): { type: SyncErrorDetail["error_type"]; requires_action: string | null } {
  const lower = errMsg.toLowerCase();
  if (lower.includes("duplicate") || lower.includes("já importado") || lower.includes("hash")) {
    return { type: "duplicate", requires_action: null };
  }
  if (lower.includes("gmail api") || lower.includes("attachment")) {
    return { type: "download_failed", requires_action: "Verifique se o e-mail ainda existe na caixa de entrada e tente sincronizar novamente." };
  }
  if (lower.includes("storage") || lower.includes("upload") || lower.includes("salvar")) {
    return { type: "upload_failed", requires_action: "Erro temporário de armazenamento. Tente sincronizar novamente." };
  }
  if (lower.includes("insert") || lower.includes("registro")) {
    return { type: "insert_failed", requires_action: "Erro ao criar registro. Tente sincronizar novamente." };
  }
  return { type: "unknown", requires_action: "Erro inesperado. Se persistir, verifique os logs ou entre em contato com o suporte." };
}

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

function sanitizeFilename(name: string): string {
  // Remove path separators and problematic characters
  let safe = name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[\/\\:*?"<>|#%&{}$!'@`+^~\[\]]/g, "_") // replace invalid chars
    .replace(/\s+/g, "_") // spaces to underscores
    .replace(/_+/g, "_") // collapse multiple underscores
    .replace(/^_|_$/g, ""); // trim leading/trailing underscores
  
  // Ensure it ends with .pdf
  if (!safe.toLowerCase().endsWith(".pdf")) {
    safe += ".pdf";
  }
  
  // Fallback if empty
  if (safe === ".pdf" || safe.length < 5) {
    safe = `attachment_${Date.now()}.pdf`;
  }
  
  // Limit length
  if (safe.length > 200) {
    safe = safe.substring(0, 196) + ".pdf";
  }
  
  return safe;
}

// --- Upsert attempt record ---
async function upsertAttempt(
  adminClient: any,
  data: {
    gmail_message_id: string;
    subject?: string;
    sender?: string;
    received_at?: string;
    message_id_header?: string;
    status: string;
    error_type?: string;
    error_message?: string;
    requires_action?: string;
    attachment_filename?: string;
    attachment_count?: number;
    software_proposal_id?: string;
  }
) {
  // Check if attempt already exists for this gmail_message_id + attachment
  const { data: existing } = await adminClient
    .from("email_import_attempts")
    .select("id, retry_count")
    .eq("gmail_message_id", data.gmail_message_id)
    .eq("attachment_filename", data.attachment_filename || "")
    .maybeSingle();

  if (existing) {
    await adminClient
      .from("email_import_attempts")
      .update({
        status: data.status,
        error_type: data.error_type || null,
        error_message: data.error_message || null,
        requires_action: data.requires_action || null,
        retry_count: (existing.retry_count || 0) + 1,
        last_attempt_at: new Date().toISOString(),
        software_proposal_id: data.software_proposal_id || null,
        resolved_at: data.status === "success" || data.status === "duplicate" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await adminClient
      .from("email_import_attempts")
      .insert({
        gmail_message_id: data.gmail_message_id,
        subject: data.subject || null,
        sender: data.sender || null,
        received_at: data.received_at ? new Date(data.received_at).toISOString() : null,
        message_id_header: data.message_id_header || null,
        status: data.status,
        error_type: data.error_type || null,
        error_message: data.error_message || null,
        requires_action: data.requires_action || null,
        attachment_filename: data.attachment_filename || null,
        attachment_count: data.attachment_count || 0,
        software_proposal_id: data.software_proposal_id || null,
        resolved_at: data.status === "success" || data.status === "duplicate" ? new Date().toISOString() : null,
      });
  }
}

// --- Process a single message ---
async function processMessage(
  accessToken: string,
  adminClient: any,
  userId: string,
  msgId: string,
  syncErrors: SyncErrorDetail[]
): Promise<number> {
  let pdfsImported = 0;
  let msgSubject = "(desconhecido)";
  let msgSender = "";

  try {
    const msg = await gmailRequest(accessToken, `messages/${msgId}?format=full`);

    msgSender = getHeader(msg.payload?.headers, "From");
    msgSubject = getHeader(msg.payload?.headers, "Subject") || "(sem assunto)";
    const dateStr = getHeader(msg.payload?.headers, "Date");
    const messageIdHeader = getHeader(msg.payload?.headers, "Message-ID") || msgId;

    const pdfParts = findPdfParts(msg.payload);

    if (pdfParts.length === 0) {
      await upsertAttempt(adminClient, {
        gmail_message_id: msgId,
        subject: msgSubject,
        sender: msgSender,
        received_at: dateStr,
        message_id_header: messageIdHeader,
        status: "skipped",
        error_type: "no_attachment",
        error_message: "E-mail não contém anexos PDF.",
        attachment_filename: "(sem PDF)",
        attachment_count: 0,
      });
      await markAsRead(accessToken, msgId);
      return 0;
    }

    let allPartsSucceeded = true;

    for (const part of pdfParts) {
      try {
        if (!part.attachmentId) continue;

        const pdfBuffer = await withRetry(() =>
          gmailGetAttachment(accessToken, msgId, part.attachmentId)
        );

        const fileHash = await hashBuffer(pdfBuffer);

        // Check for duplicate
        const { data: existing } = await adminClient
          .from("software_proposals")
          .select("id")
          .eq("file_hash", fileHash)
          .maybeSingle();

        if (existing) {
          syncErrors.push({
            email_id: msgId,
            subject: msgSubject,
            sender: msgSender,
            filename: part.filename,
            error_type: "duplicate",
            error_message: `PDF "${part.filename}" já importado anteriormente (hash duplicado).`,
            auto_resolved: true,
            requires_action: null,
            timestamp: new Date().toISOString(),
          });
          await upsertAttempt(adminClient, {
            gmail_message_id: msgId,
            subject: msgSubject,
            sender: msgSender,
            received_at: dateStr,
            message_id_header: messageIdHeader,
            status: "duplicate",
            error_type: "duplicate",
            error_message: `PDF "${part.filename}" já importado (hash duplicado).`,
            attachment_filename: part.filename,
            attachment_count: pdfParts.length,
            software_proposal_id: existing.id,
          });
          continue;
        }

        // Upload to storage — sanitize filename to avoid invalid storage keys
        const safeFilename = sanitizeFilename(part.filename);
        const storagePath = `email-imports/${fileHash}/${safeFilename}`;
        console.log(`[email-sync] Original filename: "${part.filename}" → sanitized: "${safeFilename}" → path: "${storagePath}"`);
        await withRetry(async () => {
          const { error: uploadErr } = await adminClient.storage
            .from("software-proposal-pdfs")
            .upload(storagePath, pdfBuffer, {
              contentType: "application/pdf",
              upsert: true,
            });

          if (uploadErr && !uploadErr.message.includes("already exists")) {
            throw new Error(`Erro ao salvar PDF: ${uploadErr.message}`);
          }
        });

        // Insert record
        let insertedId: string | null = null;
        await withRetry(async () => {
          const { data: inserted, error: insertErr } = await adminClient
            .from("software_proposals")
            .insert({
              file_name: part.filename,
              file_url: storagePath,
              file_hash: fileHash,
              status: "pending_extraction",
              origin: "email_inbox",
              origin_detail: JSON.stringify({
                sender: msgSender,
                subject: msgSubject,
                received_at: dateStr || new Date().toISOString(),
                message_id: messageIdHeader,
              }),
              uploaded_by: userId,
              vendor_name: "",
              total_value: 0,
            })
            .select("id")
            .single();

          if (insertErr) {
            if (insertErr.message.includes("file_hash") || insertErr.message.includes("duplicate")) {
              console.log(`Duplicate hash detected for ${part.filename}, skipping.`);
              return;
            }
            throw new Error(`Erro ao criar registro: ${insertErr.message}`);
          }
          if (inserted) insertedId = inserted.id;
        });

        pdfsImported++;

        // Record success
        await upsertAttempt(adminClient, {
          gmail_message_id: msgId,
          subject: msgSubject,
          sender: msgSender,
          received_at: dateStr,
          message_id_header: messageIdHeader,
          status: "success",
          attachment_filename: part.filename,
          attachment_count: pdfParts.length,
          software_proposal_id: insertedId || undefined,
        });
      } catch (partErr) {
        allPartsSucceeded = false;
        const errMsg = partErr instanceof Error ? partErr.message : String(partErr);
        const classified = classifyError(errMsg);
        syncErrors.push({
          email_id: msgId,
          subject: msgSubject,
          sender: msgSender,
          filename: part.filename,
          error_type: classified.type,
          error_message: errMsg,
          auto_resolved: false,
          requires_action: classified.requires_action,
          timestamp: new Date().toISOString(),
        });

        // Record failure
        await upsertAttempt(adminClient, {
          gmail_message_id: msgId,
          subject: msgSubject,
          sender: msgSender,
          received_at: dateStr,
          message_id_header: messageIdHeader,
          status: "failed",
          error_type: classified.type,
          error_message: errMsg,
          requires_action: classified.requires_action,
          attachment_filename: part.filename,
          attachment_count: pdfParts.length,
        });
      }
    }

    // Only mark as read if all parts processed successfully
    if (allPartsSucceeded) {
      await markAsRead(accessToken, msgId);
    }
  } catch (msgErr) {
    const errMsg = msgErr instanceof Error ? msgErr.message : String(msgErr);
    const classified = classifyError(errMsg);
    syncErrors.push({
      email_id: msgId,
      subject: msgSubject,
      sender: msgSender,
      filename: "(mensagem inteira)",
      error_type: classified.type,
      error_message: errMsg,
      auto_resolved: false,
      requires_action: classified.requires_action,
      timestamp: new Date().toISOString(),
    });

    await upsertAttempt(adminClient, {
      gmail_message_id: msgId,
      subject: msgSubject,
      sender: msgSender,
      status: "failed",
      error_type: classified.type,
      error_message: errMsg,
      requires_action: classified.requires_action,
      attachment_filename: "(mensagem inteira)",
    });
  }

  return pdfsImported;
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
    const action = body.action || "sync"; // "test" | "sync" | "retry"

    // --- Load email inbox config ---
    const { data: config, error: configErr } = await adminClient
      .from("email_inbox_config")
      .select("*")
      .limit(1)
      .single();

    if (configErr || !config) {
      return jsonResponse({ error: "Configuração de e-mail não encontrada" }, 404);
    }

    // --- Load Google OAuth credentials ---
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

    if (!config.gmail_refresh_token) {
      return jsonResponse({
        error: "Conta Gmail não autorizada. Clique em 'Autorizar Conta Gmail' na tela de configuração."
      }, 400);
    }

    // --- Get access token ---
    let accessToken: string;
    try {
      accessToken = await withRetry(() =>
        refreshAccessToken(gInt.oauth_client_id, gInt.oauth_client_secret, config.gmail_refresh_token)
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
        return jsonResponse({ success: false, error: `Falha na conexão Gmail: ${errMsg}` });
      }
    }

    // === RETRY specific failed messages ===
    if (action === "retry") {
      const retryAttemptIds: string[] = body.attempt_ids || [];
      if (retryAttemptIds.length === 0) {
        return jsonResponse({ error: "Nenhum ID de tentativa informado." }, 400);
      }

      // Get the failed attempts
      const { data: attempts } = await adminClient
        .from("email_import_attempts")
        .select("*")
        .in("id", retryAttemptIds)
        .in("status", ["failed", "pending"]);

      if (!attempts || attempts.length === 0) {
        return jsonResponse({ success: true, message: "Nenhuma tentativa pendente encontrada.", pdfs_imported: 0, errors: [] });
      }

      const syncErrors: SyncErrorDetail[] = [];
      let pdfsImported = 0;

      // Retry each unique gmail message
      const uniqueMessageIds = [...new Set(attempts.map((a: any) => a.gmail_message_id))];

      for (const gmailMsgId of uniqueMessageIds) {
        try {
          const imported = await processMessage(accessToken, adminClient, user.id, gmailMsgId, syncErrors);
          pdfsImported += imported;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`Retry failed for ${gmailMsgId}: ${errMsg}`);
        }
      }

      return jsonResponse({
        success: true,
        pdfs_imported: pdfsImported,
        retried: uniqueMessageIds.length,
        errors: syncErrors,
        message: `Reprocessamento: ${pdfsImported} PDF(s) importado(s) de ${uniqueMessageIds.length} e-mail(s).`,
      });
    }

    // === SYNC (normal flow) ===
    const syncStartedAt = new Date().toISOString();
    let emailsFound = 0;
    let pdfsImported = 0;
    const syncErrors: SyncErrorDetail[] = [];

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
            last_sync_errors: [],
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", config.id);

        return jsonResponse({
          success: true,
          emails_found: 0,
          pdfs_imported: 0,
          errors: [],
          message: "Nenhum e-mail novo encontrado.",
        });
      }

      // Process each message
      for (const msgId of messageIds) {
        const imported = await processMessage(accessToken, adminClient, user.id, msgId, syncErrors);
        pdfsImported += imported;
      }

      // Filter out auto-resolved (duplicates) from error count
      const realErrors = syncErrors.filter(e => !e.auto_resolved);
      const duplicates = syncErrors.filter(e => e.auto_resolved);

      let statusMsg: string;
      if (realErrors.length > 0) {
        statusMsg = `Sincronização parcial: ${pdfsImported} PDF(s) importado(s), ${realErrors.length} erro(s)${duplicates.length > 0 ? `, ${duplicates.length} duplicado(s) ignorado(s)` : ""}.`;
      } else if (duplicates.length > 0) {
        statusMsg = `Sincronização concluída: ${pdfsImported} PDF(s) importado(s), ${duplicates.length} duplicado(s) ignorado(s).`;
      } else {
        statusMsg = `Sincronização concluída: ${pdfsImported} PDF(s) importado(s) de ${emailsFound} e-mail(s).`;
      }

      await adminClient
        .from("email_inbox_config")
        .update({
          last_sync_at: syncStartedAt,
          last_sync_status: realErrors.length > 0 ? "partial" : "success",
          last_sync_message: statusMsg,
          last_sync_emails_found: emailsFound,
          last_sync_pdfs_imported: pdfsImported,
          last_sync_errors: syncErrors,
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
          last_sync_errors: syncErrors,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", config.id);

      return jsonResponse({
        success: false,
        error: `Erro na sincronização: ${errMsg}`,
        emails_found: emailsFound,
        pdfs_imported: pdfsImported,
        errors: syncErrors,
      }, 500);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: `Erro interno: ${errMsg}` }, 500);
  }
});
