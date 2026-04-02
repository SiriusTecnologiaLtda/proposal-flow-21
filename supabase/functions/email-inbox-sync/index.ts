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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const emailInboxPassword = Deno.env.get("EMAIL_INBOX_PASSWORD") || "";

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

    // --- Load config ---
    const { data: config, error: configErr } = await adminClient
      .from("email_inbox_config")
      .select("*")
      .limit(1)
      .single();

    if (configErr || !config) {
      return jsonResponse({ error: "Configuração de e-mail não encontrada" }, 404);
    }

    if (!config.email_address || !emailInboxPassword) {
      return jsonResponse({
        error: "Endereço de e-mail ou senha não configurados. Configure a senha via segredos do projeto (EMAIL_INBOX_PASSWORD)."
      }, 400);
    }

    // --- IMAP Connection ---
    // Supabase Edge Functions run on Deno Deploy which restricts raw TCP connections.
    // IMAP requires persistent TCP/TLS sockets (Deno.connect / Deno.connectTls).
    // This function uses the ImapFlow library via npm: specifier.
    // If TCP is unavailable, it will fail gracefully with a clear message.

    let ImapFlow: any;
    try {
      const mod = await import("npm:imapflow@1.0.164");
      ImapFlow = mod.ImapFlow;
    } catch (importErr) {
      // If npm:imapflow can't be imported, provide clear feedback
      const errMsg = `Biblioteca IMAP não disponível no ambiente atual. Erro: ${importErr instanceof Error ? importErr.message : String(importErr)}`;
      
      if (action === "test") {
        return jsonResponse({ success: false, error: errMsg });
      }
      
      await adminClient
        .from("email_inbox_config")
        .update({
          last_sync_status: "error",
          last_sync_message: errMsg,
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", config.id);

      return jsonResponse({ error: errMsg }, 500);
    }

    const imapConfig = {
      host: config.imap_host,
      port: config.imap_port,
      secure: config.use_tls,
      auth: {
        user: config.email_address,
        pass: emailInboxPassword,
      },
      logger: false,
    };

    // === TEST CONNECTION ===
    if (action === "test") {
      try {
        const client = new ImapFlow(imapConfig);
        await client.connect();
        
        // List mailboxes for info
        const mbList = await client.list();
        const mailboxes: string[] = mbList.map((mb: any) => mb.path);

        await client.logout();

        return jsonResponse({
          success: true,
          message: `Conexão bem-sucedida com ${config.email_address}`,
          mailboxes,
        });
      } catch (connErr) {
        const errMsg = connErr instanceof Error ? connErr.message : String(connErr);
        return jsonResponse({
          success: false,
          error: `Falha na conexão: ${errMsg}`,
        });
      }
    }

    // === SYNC ===
    const syncStartedAt = new Date().toISOString();
    let emailsFound = 0;
    let pdfsImported = 0;
    let syncErrors: string[] = [];

    try {
      const client = new ImapFlow(imapConfig);
      await client.connect();

      const folder = config.monitored_folder || "INBOX";
      const lock = await client.getMailboxLock(folder);

      try {
        // Build search criteria
        const searchCriteria: any = { seen: false };
        
        // Apply sender filter if configured
        if (config.sender_filter && config.sender_filter.trim()) {
          searchCriteria.from = config.sender_filter.trim();
        }

        // Apply subject filter if configured
        if (config.subject_filter && config.subject_filter.trim()) {
          searchCriteria.subject = config.subject_filter.trim();
        }

        // Search for unread emails
        const messages = await client.search(searchCriteria);
        emailsFound = messages.length;

        if (emailsFound === 0) {
          await client.logout();
          lock.release();

          await adminClient
            .from("email_inbox_config")
            .update({
              last_sync_at: syncStartedAt,
              last_sync_status: "success",
              last_sync_message: "Nenhum e-mail novo encontrado.",
              last_sync_emails_found: 0,
              last_sync_pdfs_imported: 0,
              updated_at: new Date().toISOString(),
            })
            .eq("id", config.id);

          return jsonResponse({
            success: true,
            emails_found: 0,
            pdfs_imported: 0,
            message: "Nenhum e-mail novo encontrado.",
          });
        }

        // Process each message (limit batch to 50)
        const messageIds = messages.slice(0, 50);

        for (const uid of messageIds) {
          try {
            const msg = await client.fetchOne(uid, {
              envelope: true,
              bodyStructure: true,
              uid: true,
            });

            if (!msg?.envelope || !msg?.bodyStructure) continue;

            const sender = msg.envelope.from?.[0]?.address || "unknown";
            const subject = msg.envelope.subject || "(sem assunto)";
            const receivedDate = msg.envelope.date?.toISOString() || new Date().toISOString();
            const messageId = msg.envelope.messageId || `uid-${uid}`;

            // Find PDF attachments in body structure
            const pdfParts = findPdfParts(msg.bodyStructure);

            if (pdfParts.length === 0) {
              // Mark as read and skip
              await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
              continue;
            }

            for (const part of pdfParts) {
              try {
                // Download attachment
                const { content } = await client.download(uid, part.part, { uid: true });
                const chunks: Uint8Array[] = [];
                for await (const chunk of content) {
                  chunks.push(chunk);
                }
                const fullBuffer = concatUint8Arrays(chunks);

                // Compute hash
                const fileHash = await hashBuffer(fullBuffer);

                // Check duplicate
                const { data: existing } = await adminClient
                  .from("software_proposals")
                  .select("id")
                  .eq("file_hash", fileHash)
                  .maybeSingle();

                if (existing) {
                  syncErrors.push(`PDF "${part.filename}" ignorado — já importado (hash duplicado).`);
                  continue;
                }

                // Upload to storage
                const storagePath = `email-imports/${fileHash}/${part.filename}`;
                const { error: uploadErr } = await adminClient.storage
                  .from("software-proposal-pdfs")
                  .upload(storagePath, fullBuffer, {
                    contentType: "application/pdf",
                    upsert: false,
                  });

                if (uploadErr) {
                  syncErrors.push(`Erro ao salvar PDF "${part.filename}": ${uploadErr.message}`);
                  continue;
                }

                // Create software_proposals record
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
                      received_at: receivedDate,
                      message_id: messageId,
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

            // Mark email as read after processing
            await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
          } catch (msgErr) {
            const errMsg = msgErr instanceof Error ? msgErr.message : String(msgErr);
            syncErrors.push(`Erro ao processar e-mail UID ${uid}: ${errMsg}`);
          }
        }

        lock.release();
      } catch (mailboxErr) {
        lock.release();
        throw mailboxErr;
      }

      await client.logout();

      // Update config with sync results
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
        })
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
        })
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

// --- Helpers ---

interface PdfPart {
  part: string;
  filename: string;
}

function findPdfParts(structure: any, prefix = ""): PdfPart[] {
  const results: PdfPart[] = [];

  if (!structure) return results;

  // Check if this part itself is a PDF
  if (
    structure.type === "application/pdf" ||
    (structure.type === "application" && structure.subtype === "pdf") ||
    (structure.disposition === "attachment" &&
      structure.parameters?.name?.toLowerCase().endsWith(".pdf"))
  ) {
    const filename =
      structure.dispositionParameters?.filename ||
      structure.parameters?.name ||
      `attachment-${Date.now()}.pdf`;
    const part = prefix || "1";
    results.push({ part, filename });
  }

  // Recurse into child parts
  if (structure.childNodes && Array.isArray(structure.childNodes)) {
    structure.childNodes.forEach((child: any, idx: number) => {
      const childPrefix = prefix ? `${prefix}.${idx + 1}` : `${idx + 1}`;
      results.push(...findPdfParts(child, childPrefix));
    });
  }

  return results;
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
