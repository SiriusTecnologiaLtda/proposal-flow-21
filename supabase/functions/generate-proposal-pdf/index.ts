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

async function getAccessToken(serviceAccountKey: any): Promise<string> {
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

// ─── Formatters ─────────────────────────────────────────────────────

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

    let serviceAccountKey: any;
    let driveFolderId: string;

    const { data: integration } = await supabase
      .from("google_integrations")
      .select("service_account_key, drive_folder_id")
      .limit(1)
      .maybeSingle();

    if (integration) {
      try {
        serviceAccountKey = JSON.parse(integration.service_account_key);
        driveFolderId = integration.drive_folder_id;
        log(logs, "Carregar credenciais", "ok", `Usando integração do banco (email: ${serviceAccountKey.client_email})`);
      } catch (e) {
        log(logs, "Carregar credenciais", "error", `Falha ao parsear chave da conta de serviço: ${e.message}`);
        return respondWithLogs(logs, { error: e.message }, 500);
      }
    } else {
      log(logs, "Carregar credenciais", "info", "Nenhuma integração no banco, usando variáveis de ambiente");
      const serviceAccountKeyRaw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
      driveFolderId = Deno.env.get("GOOGLE_DRIVE_FOLDER_ID") || "";

      if (!serviceAccountKeyRaw) {
        log(logs, "Carregar credenciais", "error", "GOOGLE_SERVICE_ACCOUNT_KEY não configurado");
        return respondWithLogs(logs, { error: "GOOGLE_SERVICE_ACCOUNT_KEY not configured" }, 500);
      }
      if (!driveFolderId) {
        log(logs, "Carregar credenciais", "error", "GOOGLE_DRIVE_FOLDER_ID não configurado");
        return respondWithLogs(logs, { error: "GOOGLE_DRIVE_FOLDER_ID not configured" }, 500);
      }

      try {
        let raw = serviceAccountKeyRaw.trim();
        if (raw.startsWith('"') || raw.startsWith("'")) {
          try { raw = JSON.parse(raw); } catch { /* use as-is */ }
        }
        serviceAccountKey = typeof raw === 'string' ? JSON.parse(raw) : raw;
        log(logs, "Carregar credenciais", "ok", `Usando env (email: ${serviceAccountKey.client_email})`);
      } catch (e) {
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
    log(logs, "Buscar unidade", "ok", `Unidade: ${unitInfo?.name || "padrão"} — Fator: ${unitInfo?.tax_factor || 0}%`);

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

    const totalAnalystHours = parentItems.reduce((s: number, i: any) => s + Number(i.hours), 0);
    const gpPercentage = Number(proposal.gp_percentage);
    const gpHours = Math.ceil(totalAnalystHours * (gpPercentage / 100));
    const hourlyRate = Number(proposal.hourly_rate);
    const totalHours = totalAnalystHours + gpHours;
    const totalValueNet = totalHours * hourlyRate;
    const taxFactor = unitInfo?.tax_factor || 0;
    const totalValueGross = totalValueNet * (1 + taxFactor / 100);
    const accompAnalyst = Number(proposal.accomp_analyst) || 0;
    const accompGP = Number(proposal.accomp_gp) || 0;
    const accompAnalystHours = Math.ceil(totalAnalystHours * (accompAnalyst / 100));
    const accompGPHours = Math.ceil(gpHours * (accompGP / 100));

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
    log(logs, "Autenticação Google", "info", "Obtendo token de acesso...");
    let accessToken: string;
    try {
      accessToken = await getAccessToken(serviceAccountKey);
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

    // ─── Find template in Drive ─────────────────────────────────
    log(logs, "Buscar template", "info", `Buscando template "${isProjeto ? "projeto" : "banco"}" na pasta ${driveFolderId}...`);
    let templates: any[];
    try {
      templates = await listTemplates(accessToken, driveFolderId);
    } catch (e: any) {
      log(logs, "Buscar template", "error", `Falha ao listar templates: ${e.message}`);
      return respondWithLogs(logs, { error: e.message }, 500);
    }

    const templateKeyword = isProjeto ? "projeto" : "banco";
    const template = templates.find((t: any) => t.name.toLowerCase().includes(templateKeyword));

    if (!template) {
      log(logs, "Buscar template", "error", `Template "${templateKeyword}" não encontrado. Arquivos na pasta: ${templates.map((t: any) => t.name).join(", ") || "nenhum"}`);
      return respondWithLogs(logs, { error: `Template "${templateKeyword}" not found in Drive folder` }, 404);
    }
    log(logs, "Buscar template", "ok", `Template encontrado: "${template.name}" (ID: ${template.id})`);

    // ─── Template file info ─────────────────────────────────────
    try {
      const fileInfo = await getFileInfo(accessToken, template.id);
      log(logs, "Info do Template", "ok", `Nome: ${fileInfo.name}\nTipo: ${fileInfo.mimeType}\nTamanho: ${fileInfo.size}`);
    } catch (e: any) {
      log(logs, "Info do Template", "info", `Não foi possível obter info do arquivo: ${e.message}`);
    }

    // ─── Check existing versions ────────────────────────────────
    const proposalBaseName = `${proposal.number} - ${client?.name || "Cliente"}`;
    const existingFiles = await listFilesInFolder(accessToken, driveFolderId, proposalBaseName);
    const version = existingFiles.length + 1;
    const newFileName = `${proposalBaseName} v${version}`;
    log(logs, "Versionamento", "ok", `Versão ${version} — Nome: "${newFileName}"`);

    // ─── Check folder type (Shared Drive vs personal) ─────────
    const folderInfo = await getFolderDriveInfo(accessToken, driveFolderId, logs);

    // ─── Copy template ──────────────────────────────────────────
    log(logs, "Copiar template", "info", `Criando cópia do template no Drive (pasta: ${driveFolderId})...`);
    let newDocId: string;
    try {
      newDocId = await copyFile(accessToken, template.id, newFileName, driveFolderId, folderInfo.driveId, logs);
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
      "{{DESC_RECURSO1}}": "Analista de Implantação",
      "{{DESC_RECURSO2}}": "Coordenador de Projeto",
      "{{NEGOCIACAO}}": proposal.negotiation || "",
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

    const docUrl = `https://docs.google.com/document/d/${newDocId}/edit`;
    log(logs, "Concluído", "ok", `Documento gerado com sucesso: ${newFileName}`);

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
