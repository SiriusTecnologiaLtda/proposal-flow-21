import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    "pkcs8", binaryKey.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signInput));
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const jwt = `${header}.${payload}.${sig}`;
  const tokenResp = await fetch(serviceAccountKey.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResp.ok) throw new Error(`Failed to get access token: ${await tokenResp.text()}`);
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
  if (!tokenRes.ok) throw new Error(`OAuth2 token refresh failed: ${await tokenRes.text()}`);
  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

// ─── Drive helpers ──────────────────────────────────────────────────

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

async function getFolderDriveInfo(accessToken: string, folderId: string, logs: LogEntry[]): Promise<{ driveId: string | null }> {
  const url = `https://www.googleapis.com/drive/v3/files/${folderId}?fields=driveId,name&supportsAllDrives=true`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await resp.json();
  if (!resp.ok) {
    log(logs, "Info da pasta", "error", `Falha ao obter info da pasta: ${JSON.stringify(data)}`);
    return { driveId: null };
  }
  const driveId = data.driveId || null;
  log(logs, "Info da pasta", "ok", `Pasta: ${data.name || folderId} — ${driveId ? "Shared Drive" : "Pessoal"}`);
  return { driveId };
}

async function copyFile(accessToken: string, fileId: string, name: string, parentFolderId: string, driveId: string | null, logs: LogEntry[]): Promise<string> {
  const copyUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/copy?supportsAllDrives=true`;
  const copyBody = JSON.stringify({ name, parents: [parentFolderId] });

  const copyResp = await fetch(copyUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: copyBody,
  });
  const copyText = await copyResp.text();
  if (!copyResp.ok) throw new Error(`Drive copy failed (${copyResp.status}): ${copyText}`);
  const copyData = JSON.parse(copyText);
  return copyData.id;
}

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
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests }),
  });
  if (!resp.ok) throw new Error(`Docs batchUpdate failed: ${await resp.text()}`);
}

// ─── Scope table helper ─────────────────────────────────────────────

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

async function replaceScopePlaceholderWithRows(
  accessToken: string, docId: string, scopeNames: string[], logs: LogEntry[]
) {
  const doc = await getDocumentStructure(accessToken, docId);
  const body = doc.body?.content || [];

  let targetTableStartIndex: number | null = null;
  let targetRowIndex = -1;
  let targetCellStartIndex = -1;
  let targetCellEndIndex = -1;

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
    log(logs, "Escopo macro", "info", "Tabela com {{ESCOPO1}} não encontrada, usando substituição simples");
    await batchReplace(accessToken, docId, { "{{ESCOPO1}}": scopeNames.join("\n") });
    return;
  }

  // Clear placeholder and insert first scope name
  const clearRequests: any[] = [];
  if (targetCellStartIndex > 0 && targetCellEndIndex > targetCellStartIndex) {
    clearRequests.push({
      deleteContentRange: {
        range: { startIndex: targetCellStartIndex, endIndex: targetCellEndIndex - 1 },
      },
    });
    clearRequests.push({
      insertText: {
        location: { index: targetCellStartIndex },
        text: scopeNames[0],
      },
    });
  }
  if (clearRequests.length > 0) {
    await docBatchUpdate(accessToken, docId, clearRequests);
  }

  // Insert additional rows
  if (scopeNames.length > 1) {
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

    // Re-read to fill new rows
    const updatedDoc = await getDocumentStructure(accessToken, docId);
    const updatedBody = updatedDoc.body?.content || [];

    let table: any = null;
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

    if (table) {
      const rows = table.table.tableRows || [];
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
      fillRequests.sort((a: any, b: any) => (b.insertText?.location?.index || 0) - (a.insertText?.location?.index || 0));
      if (fillRequests.length > 0) {
        await docBatchUpdate(accessToken, docId, fillRequests);
      }
    }
  }

  log(logs, "Escopo macro", "ok", `${scopeNames.length} item(ns) de macro escopo inserido(s) na tabela`);
}

// ─── Formatting helpers ─────────────────────────────────────────────

function fmt(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  try {
    const date = new Date(d);
    return date.toLocaleDateString("pt-BR");
  } catch { return d; }
}

function roundUp(val: number, factor: number = 8): number {
  return Math.ceil(val / factor) * factor;
}

// ─── Main handler ───────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const logs: LogEntry[] = [];

  try {
    const bodyText = await req.text();
    let parsedBody: any;
    try {
      parsedBody = JSON.parse(bodyText);
      log(logs, "Receber requisição", "ok", `proposalId: ${parsedBody?.proposalId || "não informado"}`);
    } catch {
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

    if (!integration) {
      log(logs, "Carregar credenciais", "error", "Nenhuma integração Google configurada");
      return respondWithLogs(logs, { error: "No Google integration configured" }, 500);
    }

    outputFolderId = integration.output_folder_id || integration.drive_folder_id;
    authType = integration.auth_type || "service_account";

    if (authType === "oauth2") {
      oauthClientId = integration.oauth_client_id || "";
      oauthClientSecret = integration.oauth_client_secret || "";
      oauthRefreshToken = integration.oauth_refresh_token || "";
      log(logs, "Carregar credenciais", "ok", `Usando OAuth2`);
    } else {
      try {
        serviceAccountKey = JSON.parse(integration.service_account_key);
        log(logs, "Carregar credenciais", "ok", `Usando Service Account (${serviceAccountKey.client_email})`);
      } catch (e: any) {
        log(logs, "Carregar credenciais", "error", `Falha ao parsear chave: ${e.message}`);
        return respondWithLogs(logs, { error: e.message }, 500);
      }
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

    // ─── Calculate values ───────────────────────────────────────
    const scopeItems = proposal.proposal_scope_items || [];
    const includedItems = scopeItems.filter((i: any) => i.included);
    const parentItems = includedItems.filter((i: any) => !i.parent_id);
    const templateIds = [...new Set(includedItems.map((i: any) => i.template_id).filter(Boolean))];
    let templateNames: Record<string, string> = {};
    if (templateIds.length > 0) {
      const { data: templates } = await supabase.from("scope_templates").select("id, name").in("id", templateIds);
      templateNames = (templates || []).reduce((acc: any, t: any) => ({ ...acc, [t.id]: t.name }), {});
    }

    const totalAnalystHours = roundUp(parentItems.reduce((s: number, i: any) => s + Number(i.hours), 0), roundingFactor);
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

    const client = proposal.clients;
    const esn = proposal.esn;
    const gsn = proposal.gsn;
    const arq = proposal.arquiteto;
    const payments = (proposal.payment_conditions || []).sort((a: any, b: any) => a.installment - b.installment);
    const isProjeto = proposal.type === "projeto";
    const desc = proposal.description || (isProjeto ? "Projeto de Implantação" : "Banco de Horas");

    log(logs, "Calcular valores", "ok", `${totalHours}h total — R$ ${fmt(totalValueGross)} bruto`);

    // ─── Google Auth ────────────────────────────────────────────
    log(logs, "Autenticação Google", "info", `Obtendo token (${authType})...`);
    let accessToken: string;
    try {
      if (authType === "oauth2") {
        accessToken = await getAccessTokenOAuth2(oauthClientId, oauthClientSecret, oauthRefreshToken);
      } else {
        accessToken = await getAccessTokenServiceAccount(serviceAccountKey);
      }
      log(logs, "Autenticação Google", "ok", "Token obtido");
    } catch (e: any) {
      log(logs, "Autenticação Google", "error", `Falha: ${e.message}`);
      return respondWithLogs(logs, { error: e.message }, 500);
    }

    // ─── Find MIT template from proposal_types ────────────────
    log(logs, "Buscar template MIT", "info", `Buscando template MIT para tipo "${proposal.type}"...`);

    const { data: proposalTypeRow } = await supabase
      .from("proposal_types")
      .select("mit_template_doc_id")
      .eq("slug", proposal.type)
      .maybeSingle();

    const templateDocId = proposalTypeRow?.mit_template_doc_id;
    if (!templateDocId) {
      log(logs, "Buscar template MIT", "error", `Nenhum template MIT configurado para o tipo "${proposal.type}". Configure em Tipos de Proposta.`);
      return respondWithLogs(logs, { error: `No MIT template configured for type "${proposal.type}"` }, 404);
    }
    log(logs, "Buscar template MIT", "ok", `Template MIT ID: ${templateDocId}`);

    // ─── Version check ──────────────────────────────────────────
    const mitBaseName = `MIT-065 ${proposal.number} - ${client?.name || "Cliente"}`;
    const existingFiles = await listFilesInFolder(accessToken, outputFolderId, mitBaseName);
    const version = existingFiles.length + 1;
    const newFileName = `${mitBaseName} v${version}`;
    log(logs, "Versionamento", "ok", `Versão ${version} — Nome: "${newFileName}"`);

    // ─── Copy template ──────────────────────────────────────────
    const folderInfo = await getFolderDriveInfo(accessToken, outputFolderId, logs);
    log(logs, "Copiar template", "info", "Criando cópia...");
    let newDocId: string;
    try {
      newDocId = await copyFile(accessToken, templateDocId, newFileName, outputFolderId, folderInfo.driveId, logs);
      log(logs, "Copiar template", "ok", `Documento criado: ${newDocId}`);
    } catch (e: any) {
      log(logs, "Copiar template", "error", `Falha: ${e.message}`);
      return respondWithLogs(logs, { error: e.message }, 500);
    }

    // ─── Build placeholders ─────────────────────────────────────
    const macroScopeNames = templateIds.map((id: string) => templateNames[id] || "Outros");
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
      "{{DESC_RECURSO1}}": "Analista de Implantação",
      "{{DESC_RECURSO2}}": "Coordenador de Projeto",
      "{{NEGOCIACAO}}": proposal.negotiation || "",
      "{{CONTEUDO_NEGESPECIFICA}}": proposal.negotiation || "",
    };

    // ─── Replace placeholders ───────────────────────────────────
    log(logs, "Substituir placeholders", "info", `Substituindo ${Object.keys(placeholders).length} placeholders...`);
    try {
      await batchReplace(accessToken, newDocId, placeholders);
      log(logs, "Substituir placeholders", "ok", "Placeholders substituídos com sucesso");
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

    const docUrl = `https://docs.google.com/document/d/${newDocId}/edit`;
    log(logs, "Concluído", "ok", `MIT-065 gerado com sucesso: ${newFileName}`);

    // ─── Save document record ───────────────────────────────────
    try {
      const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "");
      let userId = proposal.created_by;
      if (authHeader) {
        const { data: { user } } = await supabase.auth.getUser(authHeader);
        if (user) userId = user.id;
      }

      // Desmarcar oficiais anteriores do mesmo tipo
      await supabase.from("proposal_documents").update({ is_official: false })
        .eq("proposal_id", proposalId).eq("doc_type", "mit").eq("is_official", true);

      await supabase.from("proposal_documents").insert({
        proposal_id: proposalId,
        doc_id: newDocId,
        doc_url: docUrl,
        file_name: newFileName,
        version,
        is_official: true,
        created_by: userId,
        doc_type: "mit",
      });
      log(logs, "Registro", "ok", "Documento MIT registrado no banco de dados");
    } catch (e: any) {
      log(logs, "Registro", "info", `Não foi possível registrar: ${e.message}`);
    }

    return respondWithLogs(logs, { docUrl, docId: newDocId, fileName: newFileName });
  } catch (error: any) {
    console.error("Error:", error.message);
    log(logs, "Erro inesperado", "error", error.message);
    return respondWithLogs(logs, { error: error.message }, 500);
  }
});
