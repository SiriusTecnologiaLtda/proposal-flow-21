import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Logging ────────────────────────────────────────────────────────

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

// ─── Google Auth ────────────────────────────────────────────────────

async function getAccessTokenServiceAccount(serviceAccountKey: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({
    iss: serviceAccountKey.client_email,
    scope: "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents",
    aud: serviceAccountKey.token_uri,
    exp: now + 3600,
    iat: now,
  }));

  const signInput = `${header}.${payload}`;
  const pem = serviceAccountKey.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signInput)
  );

  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${header}.${payload}.${sig}`;

  const tokenResp = await fetch(serviceAccountKey.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResp.ok) {
    const err = await tokenResp.text();
    throw new Error(`Failed to get access token: ${err}`);
  }

  const tokenData = await tokenResp.json();
  return tokenData.access_token;
}

async function getAccessTokenOAuth2(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`OAuth2 token refresh failed (${tokenRes.status}): ${errText}`);
  }
  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

// ─── Google Drive helpers ───────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + " " + units[i];
}

async function getDriveQuota(accessToken: string): Promise<{ limit: string; usage: string; usageInDrive: string; usageInTrash: string; free: string; raw: any }> {
  const resp = await fetch(
    "https://www.googleapis.com/drive/v3/about?fields=storageQuota,user&supportsAllDrives=true",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await resp.json();
  if (!resp.ok) return { limit: "?", usage: "?", usageInDrive: "?", usageInTrash: "?", free: "?", raw: data };
  const q = data.storageQuota || {};
  const limit = Number(q.limit || 0);
  const usage = Number(q.usage || 0);
  return {
    limit: fmtBytes(limit),
    usage: fmtBytes(usage),
    usageInDrive: fmtBytes(Number(q.usageInDrive || 0)),
    usageInTrash: fmtBytes(Number(q.usageInDriveTrash || 0)),
    free: fmtBytes(limit - usage),
    raw: { storageQuota: q, user: data.user?.emailAddress || data.user?.displayName || "?" },
  };
}

async function getFileInfo(accessToken: string, fileId: string): Promise<{ size: string; name: string; mimeType: string; rawSize: number }> {
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,size,mimeType,quotaBytesUsed&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await resp.json();
  const size = Number(data.quotaBytesUsed || data.size || 0);
  return { size: fmtBytes(size), name: data.name || "", mimeType: data.mimeType || "", rawSize: size };
}

async function getFolderDriveInfo(accessToken: string, folderId: string, logs: LogEntry[]): Promise<{ driveId: string | null; isSharedDrive: boolean }> {
  const url = `https://www.googleapis.com/drive/v3/files/${folderId}?fields=driveId,name,owners,capabilities&supportsAllDrives=true`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await resp.json();
  
  if (!resp.ok) {
    log(logs, "Info da pasta", "error", `Falha ao obter info da pasta: ${JSON.stringify(data)}`);
    return { driveId: null, isSharedDrive: false };
  }
  
  const driveId = data.driveId || null;
  const isSharedDrive = !!driveId;
  log(logs, "Info da pasta", isSharedDrive ? "ok" : "info",
    `Pasta: ${data.name || folderId}\nTipo: ${isSharedDrive ? "Shared Drive (driveId: " + driveId + ")" : "Pasta pessoal compartilhada"}\n${!isSharedDrive ? "⚠️ Service Accounts não podem criar arquivos em pastas pessoais. Use um Shared Drive." : "✓ Shared Drive detectado — quota do drive será usada."}`
  );
  
  return { driveId, isSharedDrive };
}

async function copyFile(accessToken: string, fileId: string, name: string, parentFolderId: string, driveId: string | null, logs: LogEntry[]): Promise<string> {
  // For Shared Drives: copy WITH parents so file is owned by the Shared Drive (not the SA)
  // For personal folders: also try with parents (will fail if SA has no quota)
  const copyUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/copy?supportsAllDrives=true`;
  const copyBodyObj: any = { name, parents: [parentFolderId] };
  const copyBody = JSON.stringify(copyBodyObj);

  log(logs, "CURL - Copiar arquivo", "info",
    `curl -X POST '${copyUrl}' \\\n  -H 'Authorization: Bearer <TOKEN>' \\\n  -H 'Content-Type: application/json' \\\n  -d '${copyBody}'`
  );

  const copyResp = await fetch(copyUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: copyBody,
  });

  const copyText = await copyResp.text();
  log(logs, "Resposta Copy", copyResp.ok ? "ok" : "error",
    `Status: ${copyResp.status} ${copyResp.statusText}\nBody: ${copyText}`
  );

  if (!copyResp.ok) {
    if (copyResp.status === 403 && copyText.includes("storageQuotaExceeded")) {
      if (!driveId) {
        throw new Error(
          `A pasta de destino NÃO é um Shared Drive. Service Accounts não possuem quota de armazenamento e não podem criar/copiar arquivos em pastas pessoais.\n\n` +
          `SOLUÇÃO: Crie um "Drive compartilhado" (Shared Drive) no Google Workspace, mova os templates para lá, e atualize o ID da pasta na configuração da integração.\n\n` +
          `Passo a passo:\n` +
          `1. Acesse drive.google.com → "Drives compartilhados" (menu esquerdo)\n` +
          `2. Crie um novo Drive compartilhado\n` +
          `3. Adicione a Service Account (${copyBodyObj.name ? '' : ''}proposta-bot@...) como membro com permissão de "Colaborador" ou superior\n` +
          `4. Mova os templates para este Shared Drive\n` +
          `5. Atualize o ID da pasta na configuração`
        );
      }
      throw new Error(`Drive copy failed (403) mesmo com Shared Drive. Verifique se a Service Account tem permissão de "Colaborador" no Shared Drive.\n\nResposta: ${copyText}`);
    }
    throw new Error(`Drive copy failed (${copyResp.status}): ${copyText}`);
  }

  const copyData = JSON.parse(copyText);
  return copyData.id;
}

async function listTemplates(accessToken: string, folderId: string): Promise<any[]> {
  const query = `'${folderId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`;
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!resp.ok) throw new Error(`Drive list failed: ${await resp.text()}`);
  const data = await resp.json();
  return data.files || [];
}

async function listFilesInFolder(accessToken: string, folderId: string, namePrefix: string): Promise<any[]> {
  const query = `'${folderId}' in parents and name contains '${namePrefix.replace(/'/g, "\\'")}' and trashed=false`;
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!resp.ok) return [];
  const data = await resp.json();
  return data.files || [];
}

// ─── Google Docs helpers ────────────────────────────────────────────

async function batchReplace(accessToken: string, docId: string, replacements: Record<string, string>) {
  const requests = Object.entries(replacements).map(([placeholder, value]) => ({
    replaceAllText: {
      containsText: { text: placeholder, matchCase: true },
      replaceText: value ?? "",
    },
  }));

  if (requests.length === 0) return;

  const resp = await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requests }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Docs batchUpdate failed: ${err}`);
  }
}

// ─── Scope table helper ─────────────────────────────────────────────

async function replaceScopePlaceholderWithRows(
  accessToken: string, docId: string, scopeNames: string[], logs: LogEntry[]
) {
  // Step 1: Find {{ESCOPO1}} in the document
  const doc = await getDocumentStructure(accessToken, docId);
  const body = doc.body?.content || [];

  let targetTableStartIndex: number | null = null;
  let targetRowIndex = -1;
  let targetCellStartIndex = -1;
  let targetCellEndIndex = -1;
  let targetTableElement: any = null;

  for (const el of body) {
    if (!el.table) continue;
    const rows = el.table.tableRows || [];
    for (let ri = 0; ri < rows.length; ri++) {
      const cells = rows[ri].tableCells || [];
      for (const cell of cells) {
        const cellText = (cell.content || [])
          .map((c: any) => (c.paragraph?.elements || []).map((e: any) => e.textRun?.content || "").join(""))
          .join("");
        if (cellText.includes("{{ESCOPO1}}")) {
          targetTableStartIndex = el.startIndex;
          targetTableElement = el;
          targetRowIndex = ri;
          const para = cell.content?.[0]?.paragraph;
          if (para?.elements?.[0]) {
            targetCellStartIndex = para.elements[0].startIndex;
            targetCellEndIndex = para.elements[para.elements.length - 1].endIndex;
          }
        }
      }
    }
  }

  if (targetTableStartIndex === null || targetRowIndex < 0) {
    // Fallback: just do a simple text replace
    log(logs, "Escopo macro", "info", "Tabela com {{ESCOPO1}} não encontrada, usando substituição simples");
    await batchReplace(accessToken, docId, { "{{ESCOPO1}}": scopeNames.join("\n") });
    return;
  }

  // Step 2: Clear the placeholder text and insert first scope name
  const clearAndInsertRequests: any[] = [];

  // Delete existing content (the placeholder text)
  if (targetCellStartIndex > 0 && targetCellEndIndex > targetCellStartIndex) {
    clearAndInsertRequests.push({
      deleteContentRange: {
        range: { startIndex: targetCellStartIndex, endIndex: targetCellEndIndex - 1 },
      },
    });
    clearAndInsertRequests.push({
      insertText: {
        location: { index: targetCellStartIndex },
        text: scopeNames[0],
      },
    });
  }

  if (clearAndInsertRequests.length > 0) {
    await docBatchUpdate(accessToken, docId, clearAndInsertRequests);
  }

  // Step 3: Insert additional rows for remaining scope names
  if (scopeNames.length > 1) {
    // Insert rows below the current row
    const insertRowRequests: any[] = [];
    for (let i = 1; i < scopeNames.length; i++) {
      insertRowRequests.push({
        insertTableRow: {
          tableCellLocation: {
            tableStartLocation: { index: targetTableStartIndex },
            rowIndex: targetRowIndex,
            columnIndex: 0,
          },
          insertBelow: true,
        },
      });
    }
    await docBatchUpdate(accessToken, docId, insertRowRequests);

    // Re-read document to get updated indices
    const updatedDoc = await getDocumentStructure(accessToken, docId);
    const updatedBody = updatedDoc.body?.content || [];

    // Find the table again
    let table: any = null;
    for (const el of updatedBody) {
      if (el.table && el.startIndex === targetTableStartIndex) {
        table = el;
        break;
      }
    }
    // If startIndex shifted, search by proximity
    if (!table) {
      for (const el of updatedBody) {
        if (el.table) {
          const rows = el.table.tableRows || [];
          for (const row of rows) {
            const cells = row.tableCells || [];
            for (const cell of cells) {
              const cellText = (cell.content || [])
                .map((c: any) => (c.paragraph?.elements || []).map((e: any) => e.textRun?.content || "").join(""))
                .join("");
              if (cellText.includes(scopeNames[0])) {
                table = el;
                break;
              }
            }
            if (table) break;
          }
          if (table) break;
        }
      }
    }

    if (table) {
      const rows = table.table.tableRows || [];
      // Fill the new rows (they start after targetRowIndex)
      const fillRequests: any[] = [];
      for (let i = 1; i < scopeNames.length; i++) {
        const newRowIdx = targetRowIndex + i;
        if (newRowIdx < rows.length) {
          const cell = rows[newRowIdx].tableCells?.[0];
          const para = cell?.content?.[0]?.paragraph;
          const insertIdx = para?.elements?.[0]?.startIndex;
          if (insertIdx) {
            fillRequests.push({
              insertText: {
                location: { index: insertIdx },
                text: scopeNames[i],
              },
            });
          }
        }
      }
      // Sort by descending index
      fillRequests.sort((a: any, b: any) => {
        const aIdx = a.insertText?.location?.index || 0;
        const bIdx = b.insertText?.location?.index || 0;
        return bIdx - aIdx;
      });
      if (fillRequests.length > 0) {
        await docBatchUpdate(accessToken, docId, fillRequests);
      }
    }
  }

  log(logs, "Escopo macro", "ok", `${scopeNames.length} item(ns) de macro escopo inserido(s) na tabela`);
}

// ─── Google Docs structure helpers ──────────────────────────────────

async function getDocumentStructure(accessToken: string, docId: string): Promise<any> {
  const resp = await fetch(`https://docs.googleapis.com/v1/documents/${docId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`Failed to get doc structure: ${await resp.text()}`);
  return resp.json();
}

async function docBatchUpdate(accessToken: string, docId: string, requests: any[]) {
  if (requests.length === 0) return;
  const resp = await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests }),
  });
  if (!resp.ok) throw new Error(`Docs batchUpdate failed: ${await resp.text()}`);
  return resp.json();
}

function findPaymentTableIndex(doc: any): { tableStartIndex: number; tableElement: any } | null {
  const body = doc.body?.content || [];
  for (let i = 0; i < body.length; i++) {
    const el = body[i];
    if (el.paragraph) {
      const text = (el.paragraph.elements || []).map((e: any) => e.textRun?.content || "").join("").toLowerCase();
      if (text.includes("condições de pagamento") || text.includes("condicoes de pagamento")) {
        // Find the next table after this paragraph
        for (let j = i + 1; j < body.length; j++) {
          if (body[j].table) {
            return { tableStartIndex: body[j].startIndex, tableElement: body[j] };
          }
        }
      }
    }
  }
  return null;
}

async function insertPaymentRows(
  accessToken: string, docId: string, tableInfo: { tableStartIndex: number; tableElement: any },
  payments: any[], logs: LogEntry[]
) {
  const table = tableInfo.tableElement.table;
  const numExistingRows = table.tableRows?.length || 0;
  // Row 0 = header. Rows 1+ may be empty template rows we can reuse.
  const emptyDataRows = numExistingRows - 1; // rows after header
  const rowsNeeded = payments.length;
  const rowsToInsert = Math.max(0, rowsNeeded - emptyDataRows);

  // Insert additional rows only if we need more than the existing empty ones
  if (rowsToInsert > 0) {
    const requests: any[] = [];
    for (let i = 0; i < rowsToInsert; i++) {
      requests.push({
        insertTableRow: {
          tableCellLocation: {
            tableStartLocation: { index: tableInfo.tableStartIndex },
            rowIndex: numExistingRows - 1 + i, // insert after last existing row
            columnIndex: 0,
          },
          insertBelow: true,
        },
      });
    }
    await docBatchUpdate(accessToken, docId, requests);
  }

  // If we have extra empty rows (more template rows than payments), delete them
  // We'll handle this after filling to avoid index issues

  // Re-read doc to get updated indices
  const updatedDoc = await getDocumentStructure(accessToken, docId);
  const paymentTableInfo = findPaymentTableIndex(updatedDoc);
  if (!paymentTableInfo) {
    log(logs, "Pagamento", "error", "Tabela de pagamento não encontrada após inserção de linhas");
    return;
  }
  
  const finalTable = paymentTableInfo.tableElement.table;
  const tableRows = finalTable.tableRows || [];
  
  // Fill data rows starting from row index 1 (after header)
  const textRequests: any[] = [];
  for (let p = 0; p < payments.length; p++) {
    const rowIdx = 1 + p; // row 0 is header, data starts at 1
    if (rowIdx >= tableRows.length) break;
    
    const row = tableRows[rowIdx];
    const cells = row.tableCells || [];
    
    const values = [
      `${payments[p].installment}ª parcela`,
      fmtDate(payments[p].due_date),
      `R$ ${fmt(Number(payments[p].amount))}`,
    ];
    
    for (let c = 0; c < Math.min(cells.length, values.length); c++) {
      const cell = cells[c];
      const cellContent = cell.content?.[0];
      if (cellContent?.paragraph) {
        const paraElements = cellContent.paragraph.elements || [];
        const startIdx = paraElements[0]?.startIndex;
        const endIdx = paraElements[paraElements.length - 1]?.endIndex;
        
        // Check if cell has existing text (besides the newline) and clear it first
        if (startIdx && endIdx && endIdx > startIdx + 1) {
          // Delete existing content (keep last char which is paragraph mark)
          textRequests.push({
            deleteContentRange: {
              range: { startIndex: startIdx, endIndex: endIdx - 1 },
            },
          });
        }
        
        if (startIdx) {
          textRequests.push({
            insertText: {
              location: { index: startIdx },
              text: values[c],
            },
          });
        }
      }
    }
  }
  
  // Sort by descending index to avoid shifting issues
  textRequests.sort((a: any, b: any) => {
    const aIdx = a.insertText?.location?.index || a.deleteContentRange?.range?.startIndex || 0;
    const bIdx = b.insertText?.location?.index || b.deleteContentRange?.range?.startIndex || 0;
    return bIdx - aIdx;
  });
  
  if (textRequests.length > 0) {
    await docBatchUpdate(accessToken, docId, textRequests);
    log(logs, "Pagamento", "ok", `${payments.length} parcela(s) inserida(s) na tabela`);
  }

  // Delete extra empty rows if template had more rows than payments
  if (emptyDataRows > rowsNeeded) {
    const rowsToDelete = emptyDataRows - rowsNeeded;
    // Re-read to get fresh indices
    const docAfterFill = await getDocumentStructure(accessToken, docId);
    const ptInfo = findPaymentTableIndex(docAfterFill);
    if (ptInfo) {
      const tbl = ptInfo.tableElement.table;
      const tblRows = tbl.tableRows || [];
      const delRequests: any[] = [];
      // Delete from bottom up to avoid index shifting
      for (let d = 0; d < rowsToDelete; d++) {
        const delRowIdx = tblRows.length - 1 - d;
        if (delRowIdx > 0) { // never delete header
          const rowStart = tblRows[delRowIdx].startIndex;
          const rowEnd = tblRows[delRowIdx].endIndex;
          if (rowStart && rowEnd) {
            delRequests.push({
              deleteTableRow: {
                tableCellLocation: {
                  tableStartLocation: { index: ptInfo.tableStartIndex },
                  rowIndex: delRowIdx,
                  columnIndex: 0,
                },
              },
            });
          }
        }
      }
      if (delRequests.length > 0) {
        await docBatchUpdate(accessToken, docId, delRequests);
      }
    }
  }
}

async function appendDetailedScope(
  accessToken: string, docId: string, scopeItems: any[],
  templateNames: Record<string, string>, logs: LogEntry[]
) {
  // Group scope items by template
  const grouped: Record<string, { parents: any[]; children: Record<string, any[]> }> = {};
  
  for (const item of scopeItems) {
    const tmplId = item.template_id || "__other__";
    if (!grouped[tmplId]) grouped[tmplId] = { parents: [], children: {} };
    
    if (!item.parent_id) {
      grouped[tmplId].parents.push(item);
    } else {
      if (!grouped[tmplId].children[item.parent_id]) grouped[tmplId].children[item.parent_id] = [];
      grouped[tmplId].children[item.parent_id].push(item);
    }
  }
  
  // Sort parents by sort_order
  for (const g of Object.values(grouped)) {
    g.parents.sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
    for (const children of Object.values(g.children)) {
      children.sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
    }
  }
  
  // Get current doc end index
  let doc = await getDocumentStructure(accessToken, docId);
  let endIndex = doc.body.content[doc.body.content.length - 1].endIndex - 1;
  
  const requests: any[] = [];
  let cursor = endIndex;
  
  // Page break
  requests.push({ insertText: { location: { index: cursor }, text: "\n" } });
  cursor += 1;
  requests.push({ insertPageBreak: { location: { index: cursor } } });
  cursor += 1;
  
  // Title
  const title1 = "Anexo - Escopo Detalhado\n";
  requests.push({ insertText: { location: { index: cursor }, text: title1 } });
  requests.push({
    updateParagraphStyle: {
      range: { startIndex: cursor, endIndex: cursor + title1.length },
      paragraphStyle: { namedStyleType: "HEADING_1", alignment: "CENTER" },
      fields: "namedStyleType,alignment",
    },
  });
  requests.push({
    updateTextStyle: {
      range: { startIndex: cursor, endIndex: cursor + title1.length - 1 },
      textStyle: { bold: true, fontSize: { magnitude: 16, unit: "PT" } },
      fields: "bold,fontSize",
    },
  });
  cursor += title1.length;
  
  // For each template group
  for (const [tmplId, group] of Object.entries(grouped)) {
    if (group.parents.length === 0) continue;
    
    const tmplName = templateNames[tmplId] || "Outros";
    const subtitle = `\n${tmplName}\n`;
    requests.push({ insertText: { location: { index: cursor }, text: subtitle } });
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: cursor + 1, endIndex: cursor + subtitle.length },
        paragraphStyle: { namedStyleType: "HEADING_2" },
        fields: "namedStyleType",
      },
    });
    requests.push({
      updateTextStyle: {
        range: { startIndex: cursor + 1, endIndex: cursor + subtitle.length - 1 },
        textStyle: { bold: true, fontSize: { magnitude: 13, unit: "PT" } },
        fields: "bold,fontSize",
      },
    });
    cursor += subtitle.length;
    
    // Build table rows with level numbering
    const allRows: string[][] = [["Processo", "Resumo", "Escopo"]];
    
    for (let pi = 0; pi < group.parents.length; pi++) {
      const parent = group.parents[pi];
      const parentNum = pi + 1;
      allRows.push([
        `${parentNum}. ${parent.description || "—"}`,
        parent.notes || "",
        parent.included ? "Sim" : "Não",
      ]);
      
      const children = group.children[parent.id] || [];
      for (let ci = 0; ci < children.length; ci++) {
        const child = children[ci];
        allRows.push([
          `   ${parentNum}.${ci + 1} ${child.description || "—"}`,
          child.notes || "",
          child.included ? "Sim" : "Não",
        ]);
      }
    }
    
    // Insert table
    const numRows = allRows.length;
    const numCols = 3;
    
    requests.push({
      insertTable: {
        rows: numRows,
        columns: numCols,
        location: { index: cursor },
      },
    });
    
    // We need to execute what we have so far, then read the doc to get table cell indices
  }
  
  // Execute the first batch (page break, titles, tables structure)
  if (requests.length > 0) {
    await docBatchUpdate(accessToken, docId, requests);
  }
  
  // Now re-read doc and fill tables with content
  doc = await getDocumentStructure(accessToken, docId);
  const bodyContent = doc.body?.content || [];
  
  // Find all tables that were just inserted (after the original content)
  const newTables: any[] = [];
  for (const el of bodyContent) {
    if (el.table && el.startIndex >= endIndex) {
      newTables.push(el);
    }
  }
  
  // Build text fill requests for each table
  let tableIdx = 0;
  const fillRequests: any[] = [];
  
  // Track row metadata for styling after insert
  interface RowMeta { row: number; isHeader: boolean; isDisabled: boolean; }
  const tableRowMetas: { tableIndex: number; rows: RowMeta[] }[] = [];
  
  for (const [tmplId, group] of Object.entries(grouped)) {
    if (group.parents.length === 0) continue;
    if (tableIdx >= newTables.length) break;
    
    const tableEl = newTables[tableIdx];
    const currentTableIdx = tableIdx;
    tableIdx++;
    
    const allRows: { cells: string[]; isHeader: boolean; isDisabled: boolean }[] = [
      { cells: ["Processo", "Resumo", "Escopo"], isHeader: true, isDisabled: false },
    ];
    for (let pi = 0; pi < group.parents.length; pi++) {
      const parent = group.parents[pi];
      const parentNum = pi + 1;
      allRows.push({
        cells: [`${parentNum}. ${parent.description || "—"}`, parent.notes || "", parent.included ? "Sim" : "Não"],
        isHeader: false,
        isDisabled: !parent.included,
      });
      const children = group.children[parent.id] || [];
      for (let ci = 0; ci < children.length; ci++) {
        const child = children[ci];
        allRows.push({
          cells: [`   ${parentNum}.${ci + 1} ${child.description || "—"}`, child.notes || "", child.included ? "Sim" : "Não"],
          isHeader: false,
          isDisabled: !child.included,
        });
      }
    }
    
    const rowMetas: RowMeta[] = allRows.map((r, i) => ({ row: i, isHeader: r.isHeader, isDisabled: r.isDisabled }));
    tableRowMetas.push({ tableIndex: currentTableIdx, rows: rowMetas });
    
    const tableRows = tableEl.table?.tableRows || [];
    for (let r = 0; r < Math.min(tableRows.length, allRows.length); r++) {
      const cells = tableRows[r].tableCells || [];
      for (let c = 0; c < Math.min(cells.length, allRows[r].cells.length); c++) {
        const cellContent = cells[c].content?.[0];
        if (cellContent?.paragraph) {
          const insertIdx = cellContent.paragraph.elements?.[0]?.startIndex || cellContent.startIndex;
          if (insertIdx && allRows[r].cells[c]) {
            fillRequests.push({
              insertText: {
                location: { index: insertIdx },
                text: allRows[r].cells[c],
              },
            });
          }
        }
      }
    }
  }
  
  // Sort inserts by descending index
  fillRequests.sort((a: any, b: any) => {
    const aIdx = a.insertText?.location?.index || 0;
    const bIdx = b.insertText?.location?.index || 0;
    return bIdx - aIdx;
  });
  
  if (fillRequests.length > 0) {
    await docBatchUpdate(accessToken, docId, fillRequests);
  }
  
  // Re-read doc to apply styling (bold headers, strikethrough+gray for disabled rows, Arial Narrow 9pt)
  doc = await getDocumentStructure(accessToken, docId);
  const styledBodyContent = doc.body?.content || [];
  const styledTables: any[] = [];
  for (const el of styledBodyContent) {
    if (el.table && el.startIndex >= endIndex) {
      styledTables.push(el);
    }
  }
  
  const styleRequests: any[] = [];
  
  for (const meta of tableRowMetas) {
    if (meta.tableIndex >= styledTables.length) continue;
    const tableEl = styledTables[meta.tableIndex];
    const tableRows = tableEl.table?.tableRows || [];
    
    for (const rm of meta.rows) {
      if (rm.row >= tableRows.length) continue;
      const cells = tableRows[rm.row].tableCells || [];
      
      for (const cell of cells) {
        const para = cell.content?.[0]?.paragraph;
        if (!para) continue;
        const startIdx = para.elements?.[0]?.startIndex;
        const endIdx = para.elements?.[para.elements.length - 1]?.endIndex;
        if (!startIdx || !endIdx || startIdx >= endIdx) continue;
        
        if (rm.isHeader) {
          // Header: Bold, Arial Narrow 9pt
          styleRequests.push({
            updateTextStyle: {
              range: { startIndex: startIdx, endIndex: endIdx },
              textStyle: {
                bold: true,
                weightedFontFamily: { fontFamily: "Arial Narrow", weight: 700 },
                fontSize: { magnitude: 9, unit: "PT" },
              },
              fields: "bold,weightedFontFamily,fontSize",
            },
          });
        } else if (rm.isDisabled) {
          // Disabled: strikethrough, gray, Arial Narrow 9pt
          styleRequests.push({
            updateTextStyle: {
              range: { startIndex: startIdx, endIndex: endIdx },
              textStyle: {
                bold: false,
                strikethrough: true,
                foregroundColor: { color: { rgbColor: { red: 0.6, green: 0.6, blue: 0.6 } } },
                weightedFontFamily: { fontFamily: "Arial Narrow", weight: 400 },
                fontSize: { magnitude: 9, unit: "PT" },
              },
              fields: "bold,strikethrough,foregroundColor,weightedFontFamily,fontSize",
            },
          });
        } else {
          // Normal: Arial Narrow 9pt, not bold
          styleRequests.push({
            updateTextStyle: {
              range: { startIndex: startIdx, endIndex: endIdx },
              textStyle: {
                bold: false,
                weightedFontFamily: { fontFamily: "Arial Narrow", weight: 400 },
                fontSize: { magnitude: 9, unit: "PT" },
              },
              fields: "bold,weightedFontFamily,fontSize",
            },
          });
        }
      }
    }
  }
  
  if (styleRequests.length > 0) {
    await docBatchUpdate(accessToken, docId, styleRequests);
  }
  
  log(logs, "Escopo detalhado", "ok", `${Object.keys(grouped).length} grupo(s) de template adicionado(s) ao final do documento`);
}

// ─── Formatters ─────────────────────────────────────────────────────

function roundUp(val: number, factor: number = 8) {
  return Math.ceil(val / factor) * factor;
}

function fmt(val: number) {
  return val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("pt-BR");
}

// ─── Main handler ───────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const logs: LogEntry[] = [];

  try {
    // ─── Parse request ──────────────────────────────────────────
    const bodyText = await req.text();
    let parsedBody: any;
    try {
      parsedBody = JSON.parse(bodyText);
      log(logs, "Receber requisição", "ok", `proposalId: ${parsedBody?.proposalId || "não informado"}`);
    } catch (e) {
      log(logs, "Receber requisição", "error", "Corpo da requisição inválido");
      return respondWithLogs(logs, { error: "Invalid request body" }, 400);
    }
    const { proposalId } = parsedBody;

    if (!proposalId) {
      log(logs, "Validação", "error", "proposalId é obrigatório");
      return respondWithLogs(logs, { error: "proposalId is required" }, 400);
    }

    // ─── Load credentials ───────────────────────────────────────
    log(logs, "Carregar credenciais", "info", "Buscando credenciais do Google...");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let outputFolderId: string;
    let authType = "service_account";
    let serviceAccountKey: any = null;
    let oauthClientId = "";
    let oauthClientSecret = "";
    let oauthRefreshToken = "";

    // Try default integration first, then fall back to first available
    let integration: any = null;
    const { data: defaultInt } = await supabase
      .from("google_integrations")
      .select("*")
      .eq("is_default", true)
      .limit(1)
      .maybeSingle();
    
    if (defaultInt) {
      integration = defaultInt;
    } else {
      const { data: firstInt } = await supabase
        .from("google_integrations")
        .select("*")
        .limit(1)
        .maybeSingle();
      integration = firstInt;
    }

    if (integration) {
      outputFolderId = integration.output_folder_id || integration.drive_folder_id;
      authType = integration.auth_type || "service_account";

      if (authType === "oauth2") {
        oauthClientId = integration.oauth_client_id || "";
        oauthClientSecret = integration.oauth_client_secret || "";
        oauthRefreshToken = integration.oauth_refresh_token || "";
        log(logs, "Carregar credenciais", "ok", `Usando OAuth2 (Client ID: ${oauthClientId.substring(0, 20)}...)`);
      } else {
        try {
          serviceAccountKey = JSON.parse(integration.service_account_key);
          log(logs, "Carregar credenciais", "ok", `Usando Service Account (email: ${serviceAccountKey.client_email})`);
        } catch (e) {
          log(logs, "Carregar credenciais", "error", `Falha ao parsear chave da conta de serviço: ${e.message}`);
          return respondWithLogs(logs, { error: e.message }, 500);
        }
      }
    } else {
      log(logs, "Carregar credenciais", "error", "Nenhuma integração Google configurada");
      return respondWithLogs(logs, { error: "No Google integration configured" }, 500);
    }

    // ─── Fetch proposal data ────────────────────────────────────
    log(logs, "Buscar proposta", "info", `Buscando proposta ${proposalId}...`);

    const { data: proposal, error: propError } = await supabase
      .from("proposals")
      .select(`
        *,
        clients(*),
        esn:sales_team!proposals_esn_id_fkey(*),
        gsn:sales_team!proposals_gsn_id_fkey(*),
        arquiteto:sales_team!proposals_arquiteto_id_fkey(*),
        proposal_scope_items(*),
        proposal_macro_scope(*),
        payment_conditions(*)
      `)
      .eq("id", proposalId)
      .single();

    if (propError || !proposal) {
      log(logs, "Buscar proposta", "error", `Proposta não encontrada: ${propError?.message || "sem dados"}`);
      return respondWithLogs(logs, { error: "Proposal not found" }, 404);
    }

    log(logs, "Buscar proposta", "ok", `Proposta ${proposal.number} — Cliente: ${proposal.clients?.name || "—"}`);

    // ─── Proposal type config (labels + rounding) ───────────────
    let analystLabel = "Analista de Implantação";
    let gpLabelText = "Coordenador de Projeto";
    let roundingFactor = 8;
    if (proposal.type) {
      const { data: ptConfig } = await supabase.from("proposal_types").select("analyst_label, gp_label, rounding_factor").eq("slug", proposal.type).maybeSingle();
      if (ptConfig) {
        analystLabel = ptConfig.analyst_label || analystLabel;
        gpLabelText = ptConfig.gp_label || gpLabelText;
        roundingFactor = ptConfig.rounding_factor || roundingFactor;
      }
    }

    // ─── Unit info ──────────────────────────────────────────────
    let unitInfo: any = null;
    if (proposal.clients?.unit_id) {
      const { data } = await supabase.from("unit_info").select("*").eq("id", proposal.clients.unit_id).single();
      unitInfo = data;
    }
    if (!unitInfo) {
      const { data } = await supabase.from("unit_info").select("*").limit(1).maybeSingle();
      unitInfo = data;
    }
    log(logs, "Buscar unidade", "ok", `Unidade: ${unitInfo?.name || "padrão"} — Fator: ${unitInfo?.tax_factor || 0}`);

    // ─── Calculate values ───────────────────────────────────────
    log(logs, "Calcular valores", "info", "Processando escopo e valores...");

    const scopeItems = proposal.proposal_scope_items || [];
    const includedItems = scopeItems.filter((i: any) => i.included);
    const parentItems = includedItems.filter((i: any) => !i.parent_id);

    const templateIds = [...new Set(includedItems.map((i: any) => i.template_id).filter(Boolean))];
    let templateNames: Record<string, string> = {};
    if (templateIds.length > 0) {
      const { data: templates } = await supabase.from("scope_templates").select("id, name").in("id", templateIds);
      templateNames = (templates || []).reduce((acc: any, t: any) => ({ ...acc, [t.id]: t.name }), {});
    }

    const totalAnalystHoursRaw = parentItems.reduce((s: number, i: any) => s + Number(i.hours), 0);
    const totalAnalystHours = roundUp(totalAnalystHoursRaw, roundingFactor);
    const gpPercentage = Number(proposal.gp_percentage);
    const gpHours = roundUp(Math.ceil(totalAnalystHours * (gpPercentage / 100)), roundingFactor);
    const hourlyRate = Number(proposal.hourly_rate);
    const totalHours = totalAnalystHours + gpHours;
    const totalValueNet = totalHours * hourlyRate;
    const taxFactor = unitInfo?.tax_factor || 0;
    const totalValueGross = taxFactor > 0 ? totalValueNet / taxFactor : totalValueNet;
    const accompAnalyst = Number(proposal.accomp_analyst) || 0;
    const accompGP = Number(proposal.accomp_gp) || 0;
    const accompAnalystHours = roundUp(Math.ceil(totalAnalystHours * (accompAnalyst / 100)), roundingFactor);
    const accompGPHours = roundUp(Math.ceil(gpHours * (accompGP / 100)), roundingFactor);

    const macroScopeNames = templateIds.map((id: string) => templateNames[id] || "Outros");
    const isProjeto = proposal.type === "projeto";
    const client = proposal.clients;
    const esn = proposal.esn;
    const gsn = proposal.gsn;
    const arq = proposal.arquiteto;
    const payments = (proposal.payment_conditions || []).sort((a: any, b: any) => a.installment - b.installment);
    const firstPayment = payments[0];
    const desc = proposal.description || (isProjeto ? "Projeto de Implantação" : "Banco de Horas");

    log(logs, "Calcular valores", "ok", `${totalHours}h total (${totalAnalystHours}h analista + ${gpHours}h GP) — Líquido: R$ ${fmt(totalValueNet)} — Bruto: R$ ${fmt(totalValueGross)}`);

    // ─── Google Auth ────────────────────────────────────────────
    log(logs, "Autenticação Google", "info", `Obtendo token de acesso (${authType})...`);
    let accessToken: string;
    try {
      if (authType === "oauth2") {
        accessToken = await getAccessTokenOAuth2(oauthClientId, oauthClientSecret, oauthRefreshToken);
      } else {
        accessToken = await getAccessTokenServiceAccount(serviceAccountKey);
      }
      log(logs, "Autenticação Google", "ok", "Token obtido com sucesso");
    } catch (e: any) {
      log(logs, "Autenticação Google", "error", `Falha na autenticação: ${e.message}`);
      return respondWithLogs(logs, { error: e.message }, 500);
    }

    // ─── Drive Quota ────────────────────────────────────────────
    log(logs, "Quota do Drive", "info", "Verificando espaço disponível...");
    try {
      const quota = await getDriveQuota(accessToken);
      log(logs, "Quota do Drive", "ok",
        `Conta: ${quota.raw.user}\nLimite: ${quota.limit}\nUsado: ${quota.usage}\nUsado no Drive: ${quota.usageInDrive}\nNa Lixeira: ${quota.usageInTrash}\nLivre: ${quota.free}`
      );
    } catch (e: any) {
      log(logs, "Quota do Drive", "error", `Falha ao consultar quota: ${e.message}`);
    }

    // ─── Find template from proposal_types ────────────────────
    log(logs, "Buscar template", "info", `Buscando template para tipo "${proposal.type}"...`);

    // Look up template_doc_id from proposal_types table
    const { data: proposalTypeRow } = await supabase
      .from("proposal_types")
      .select("template_doc_id")
      .eq("slug", proposal.type)
      .maybeSingle();

    const templateDocId = proposalTypeRow?.template_doc_id;
    if (!templateDocId) {
      log(logs, "Buscar template", "error", `Nenhum template de proposta configurado para o tipo "${proposal.type}". Configure em Tipos de Proposta.`);
      return respondWithLogs(logs, { error: `No proposal template configured for type "${proposal.type}"` }, 404);
    }
    log(logs, "Buscar template", "ok", `Template ID: ${templateDocId}`);

    // ─── Template file info ─────────────────────────────────
    try {
      const fileInfo = await getFileInfo(accessToken, templateDocId);
      log(logs, "Info do Template", "ok", `Nome: ${fileInfo.name}\nTipo: ${fileInfo.mimeType}\nTamanho: ${fileInfo.size}`);
    } catch (e: any) {
      log(logs, "Info do Template", "info", `Não foi possível obter info do arquivo: ${e.message}`);
    }

    // ─── Check existing versions ────────────────────────────────
    const proposalBaseName = `${proposal.number} - ${client?.name || "Cliente"}`;
    const existingFiles = await listFilesInFolder(accessToken, outputFolderId, proposalBaseName);
    const version = existingFiles.length + 1;
    const newFileName = `${proposalBaseName} v${version}`;
    log(logs, "Versionamento", "ok", `Versão ${version} — Nome: "${newFileName}"`);

    // ─── Check folder type (Shared Drive vs personal) ─────────
    const folderInfo = await getFolderDriveInfo(accessToken, outputFolderId, logs);

    // ─── Copy template ──────────────────────────────────────────
    log(logs, "Copiar template", "info", `Criando cópia do template no Drive (pasta output: ${outputFolderId})...`);
    let newDocId: string;
    try {
      newDocId = await copyFile(accessToken, templateDocId, newFileName, outputFolderId, folderInfo.driveId, logs);
      log(logs, "Copiar template", "ok", `Documento criado: ${newDocId}`);
    } catch (e: any) {
      log(logs, "Copiar template", "error", `Falha ao copiar template: ${e.message}`);
      return respondWithLogs(logs, { error: e.message }, 500);
    }

    // ─── Build placeholders map ─────────────────────────────────
    const macroEscopoText = macroScopeNames.join("\n");
    const paymentText = payments.map((p: any) =>
      `${p.installment}ª parcela - Venc.: ${fmtDate(p.due_date)} - R$ ${fmt(Number(p.amount))}`
    ).join("\n");

    const placeholders: Record<string, string> = {
      "{{ID_PROPOSTA}}": proposal.number || "",
      "{{CLIENTE}}": client?.name || "—",
      "{{CODIGO_CLIENTE}}": client?.code || "—",
      "{{CNPJ_CLIENTE}}": client?.cnpj || "—",
      "{{CONTATO_CLIENTE}}": client?.contact || "—",
      "{{EMAIL_CLIENTE}}": client?.email || "—",
      "{{TELEFONE_CLIENTE}}": client?.phone || "—",
      "{{ENDERECO_CLIENTE}}": client?.address || "—",
      "{{INSC_UF_CLIENTE}}": client?.state_registration || "—",
      "{{DATA_PROPOSTA}}": fmtDate(proposal.created_at),
      "{{DATA_VALIDADE}}": fmtDate(proposal.date_validity),
      "{{PROD}}": proposal.product || "—",
      "{{CODIGO_ESN}}": esn?.code || "—",
      "{{NOME_ESN}}": esn?.name || "—",
      "{{CODIGO_ARQ}}": arq?.code || "—",
      "{{NOME_ARQ}}": arq?.name || "—",
      "{{CODIGO_GSN}}": gsn?.code || "—",
      "{{NOME_GSN}}": gsn?.name || "—",
      "{{UNIDADE}}": unitInfo?.name || "—",
      "{{CNPJ_UNIDADE}}": unitInfo?.cnpj || "—",
      "{{CONTATO_UNIDADE}}": unitInfo?.contact || "—",
      "{{EMAIL_UNIDADE}}": unitInfo?.email || "—",
      "{{TELEFONE_UNIDADE}}": unitInfo?.phone || "—",
      "{{ENDERECO_UNIDADE}}": unitInfo?.address || "—",
      "{{CIDADE}}": unitInfo?.city || "—",
      "{{DESC_PROJETO}}": desc,
      "{{QT_TOTALHRS}}": totalHours.toString(),
      "{{QTHR_REC1}}": totalAnalystHours.toString(),
      "{{VRLIQTOT_REC1}}": fmt(totalAnalystHours * hourlyRate),
      "{{QTHR_REC2}}": gpHours.toString(),
      "{{VRLIQTOT_REC2}}": fmt(gpHours * hourlyRate),
      "{{QTHR_TOTAL}}": totalHours.toString(),
      "{{QT_HR_ACOMP1}}": accompAnalystHours.toString(),
      "{{QT_HR_ACOMP2}}": accompGPHours.toString(),
      "{{QT_HORAS_TRASL}}": (proposal.travel_local_hours || 1).toString(),
      "{{QT_HORAS_TRASV}}": (proposal.travel_trip_hours || 4).toString(),
      "{{VR_TRAS}}": fmt(Number(proposal.travel_hourly_rate || 250)),
      "{{QT_EMPRESAS}}": (proposal.num_companies || 1).toString(),
      "{{VR_HORA_ADIC1}}": fmt(Number(proposal.additional_analyst_rate)),
      "{{VR_HORA_ADIC2}}": fmt(Number(proposal.additional_gp_rate)),
      "{{TOTAL_VALOR_BRUTO}}": fmt(totalValueGross),
      "{{TOTAL_VALOR_LIQUI}}": fmt(totalValueNet),
      "{{QT_PARCELAS}}": payments.length.toString(),
      "{{PRIMEIRO_VENC}}": firstPayment ? fmtDate(firstPayment.due_date) : "—",
      "{{MACRO_ESCOPO}}": macroEscopoText,
      "{{CONDICOES_PAGAMENTO}}": paymentText,
      "{{DESC_RECURSO1}}": analystLabel,
      "{{DESC_RECURSO2}}": gpLabelText,
      "{{NEGOCIACAO}}": proposal.negotiation || "",
      "{{CONTEUDO_NEGESPECIFICA}}": proposal.negotiation || "",
    };

    // ─── Replace placeholders ───────────────────────────────────
    log(logs, "Substituir placeholders", "info", `Substituindo ${Object.keys(placeholders).length} placeholders...`);
    try {
      await batchReplace(accessToken, newDocId, placeholders);
      log(logs, "Substituir placeholders", "ok", "Todos os placeholders substituídos com sucesso");
    } catch (e: any) {
      log(logs, "Substituir placeholders", "error", `Falha: ${e.message}`);
      return respondWithLogs(logs, { error: e.message }, 500);
    }

    // ─── Replace {{ESCOPO1}} with individual table rows ─────────
    if (macroScopeNames.length > 0) {
      log(logs, "Escopo macro", "info", "Inserindo macro escopo com linhas de grade...");
      try {
        await replaceScopePlaceholderWithRows(accessToken, newDocId, macroScopeNames, logs);
      } catch (e: any) {
        log(logs, "Escopo macro", "error", `Falha: ${e.message}`);
      }
    }

    // ─── Insert payment rows into table ─────────────────────────
    if (payments.length > 0) {
      log(logs, "Pagamento", "info", "Inserindo parcelas na tabela de condições de pagamento...");
      try {
        const docStructure = await getDocumentStructure(accessToken, newDocId);
        const paymentTableInfo = findPaymentTableIndex(docStructure);
        if (paymentTableInfo) {
          await insertPaymentRows(accessToken, newDocId, paymentTableInfo, payments, logs);
        } else {
          log(logs, "Pagamento", "info", "Tabela de condições de pagamento não encontrada no template — usando placeholder textual");
        }
      } catch (e: any) {
        log(logs, "Pagamento", "error", `Falha ao inserir parcelas: ${e.message}`);
      }
    }

    // ─── Append detailed scope pages ────────────────────────────
    if (scopeItems.length > 0) {
      log(logs, "Escopo detalhado", "info", "Adicionando páginas de escopo detalhado...");
      try {
        await appendDetailedScope(accessToken, newDocId, scopeItems, templateNames, logs);
      } catch (e: any) {
        log(logs, "Escopo detalhado", "error", `Falha ao adicionar escopo detalhado: ${e.message}`);
      }
    }

    const docUrl = `https://docs.google.com/document/d/${newDocId}/edit`;
    log(logs, "Concluído", "ok", `Documento gerado com sucesso: ${newFileName}`);

    // ─── Share document with involved team members ──────────────
    try {
      const rawEmails: string[] = [];
      if (esn?.email) rawEmails.push(esn.email);
      if (gsn?.email) rawEmails.push(gsn.email);
      if (arq?.email) rawEmails.push(arq.email);
      const authHeaderShare = req.headers.get("Authorization")?.replace("Bearer ", "");
      if (authHeaderShare) {
        const { data: { user: authUser } } = await supabase.auth.getUser(authHeaderShare);
        if (authUser?.email) rawEmails.push(authUser.email);
      }
      // Sanitize: trim, lowercase, remove trailing dots/spaces
      const sanitize = (e: string) => e.trim().toLowerCase().replace(/[.\s]+$/, "");
      const uniqueEmails = [...new Set(rawEmails.map(sanitize).filter(e => e.includes("@")))];
      
      log(logs, "Compartilhar", "info", `E-mails brutos: [${rawEmails.join(", ")}]\nE-mails sanitizados: [${uniqueEmails.join(", ")}]`);
      
      const shareResults: string[] = [];
      for (const email of uniqueEmails) {
        try {
          const permResp = await fetch(
            `https://www.googleapis.com/drive/v3/files/${newDocId}/permissions?supportsAllDrives=true&sendNotificationEmail=false`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({ type: "user", role: "writer", emailAddress: email }),
            }
          );
          const permBody = await permResp.text();
          if (permResp.ok) {
            shareResults.push(`✅ ${email} — OK`);
          } else {
            shareResults.push(`❌ ${email} — HTTP ${permResp.status}: ${permBody}`);
            log(logs, "Compartilhar", "error", `Falha ao compartilhar com ${email}: HTTP ${permResp.status} — ${permBody}`);
          }
        } catch (permE: any) {
          shareResults.push(`❌ ${email} — Exception: ${permE.message}`);
          log(logs, "Compartilhar", "error", `Exceção ao compartilhar com ${email}: ${permE.message}`);
        }
      }
      log(logs, "Compartilhar", "ok", `Resultado:\n${shareResults.join("\n")}`);
    } catch (e: any) {
      log(logs, "Compartilhar", "error", `Falha geral no compartilhamento: ${e.message}`);
    }

    // ─── Save document record ───────────────────────────────────
    try {
      // Get user from auth header
      const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "");
      let userId = proposal.created_by;
      if (authHeader) {
        const { data: { user } } = await supabase.auth.getUser(authHeader);
        if (user) userId = user.id;
      }

      // Desmarcar oficiais anteriores do mesmo tipo
      await supabase.from("proposal_documents").update({ is_official: false })
        .eq("proposal_id", proposalId).eq("doc_type", "proposta").eq("is_official", true);

      await supabase.from("proposal_documents").insert({
        proposal_id: proposalId,
        doc_id: newDocId,
        doc_url: docUrl,
        file_name: newFileName,
        version,
        is_official: true,
        created_by: userId,
        doc_type: "proposta",
      });
      log(logs, "Registro", "ok", "Documento registrado no banco de dados");
    } catch (e: any) {
      log(logs, "Registro", "info", `Não foi possível registrar: ${e.message}`);
    }

    return respondWithLogs(logs, {
      docUrl,
      docId: newDocId,
      fileName: newFileName,
      proposal: { number: proposal.number, totalValue: totalValueNet, totalHours },
    });
  } catch (error: any) {
    console.error("Error:", error.message);
    log(logs, "Erro inesperado", "error", error.message);
    return respondWithLogs(logs, { error: error.message }, 500);
  }
});
