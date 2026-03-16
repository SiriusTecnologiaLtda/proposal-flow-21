import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

  // Import the private key
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

async function copyFile(accessToken: string, fileId: string, name: string, parentFolderId: string): Promise<string> {
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/copy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, parents: [parentFolderId] }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Drive copy failed: ${err}`);
  }
  const data = await resp.json();
  return data.id;
}

async function listTemplates(accessToken: string, folderId: string): Promise<any[]> {
  const query = `'${folderId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`;
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!resp.ok) throw new Error(`Drive list failed: ${await resp.text()}`);
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

  try {
    const { proposalId } = await req.json();

    if (!proposalId) {
      return new Response(JSON.stringify({ error: "proposalId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Load secrets ─────────────────────────────────────────────
    const serviceAccountKeyRaw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    const driveFolderId = Deno.env.get("GOOGLE_DRIVE_FOLDER_ID");

    if (!serviceAccountKeyRaw) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY not configured");
    if (!driveFolderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID not configured");

    let serviceAccountKey: any;
    try {
      // Handle potential double-encoding or extra wrapping
      let raw = serviceAccountKeyRaw.trim();
      if (raw.startsWith('"') || raw.startsWith("'")) {
        try { raw = JSON.parse(raw); } catch { /* use as-is */ }
      }
      serviceAccountKey = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      console.error("Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY. First 100 chars:", serviceAccountKeyRaw.substring(0, 100));
      throw new Error(`Failed to parse service account key: ${e.message}`);
    }

    // ─── Fetch proposal data from Supabase ────────────────────────
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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
      return new Response(JSON.stringify({ error: "Proposal not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Unit info ────────────────────────────────────────────────
    let unitInfo: any = null;
    if (proposal.clients?.unit_id) {
      const { data } = await supabase.from("unit_info").select("*").eq("id", proposal.clients.unit_id).single();
      unitInfo = data;
    }
    if (!unitInfo) {
      const { data } = await supabase.from("unit_info").select("*").limit(1).maybeSingle();
      unitInfo = data;
    }

    // ─── Calculate values ─────────────────────────────────────────
    const scopeItems = proposal.proposal_scope_items || [];
    const includedItems = scopeItems.filter((i: any) => i.included);
    const parentItems = includedItems.filter((i: any) => !i.parent_id);
    const childItems = includedItems.filter((i: any) => i.parent_id);

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

    // ─── Google Auth ──────────────────────────────────────────────
    const accessToken = await getAccessToken(serviceAccountKey);

    // ─── Find template in Drive ───────────────────────────────────
    const templates = await listTemplates(accessToken, driveFolderId);
    const templateKeyword = isProjeto ? "projeto" : "banco";
    const template = templates.find((t: any) => t.name.toLowerCase().includes(templateKeyword));

    if (!template) {
      return new Response(JSON.stringify({ error: `Template "${templateKeyword}" not found in Drive folder` }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Check for existing versions to determine version number ──
    const proposalBaseName = `${proposal.number} - ${client?.name || "Cliente"}`;
    const existingFiles = await listFilesInFolder(accessToken, driveFolderId, proposalBaseName);
    const version = existingFiles.length + 1;
    const newFileName = `${proposalBaseName} v${version}`;

    // ─── Copy template ────────────────────────────────────────────
    const newDocId = await copyFile(accessToken, template.id, newFileName, driveFolderId);

    // ─── Build placeholders map ───────────────────────────────────
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

    // ─── Replace placeholders in the document ─────────────────────
    await batchReplace(accessToken, newDocId, placeholders);

    const docUrl = `https://docs.google.com/document/d/${newDocId}/edit`;

    return new Response(JSON.stringify({
      docUrl,
      docId: newDocId,
      fileName: newFileName,
      proposal: { number: proposal.number, totalValue: totalValueNet, totalHours },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─── Additional Drive helper ────────────────────────────────────────

async function listFilesInFolder(accessToken: string, folderId: string, namePrefix: string): Promise<any[]> {
  const query = `'${folderId}' in parents and name contains '${namePrefix.replace(/'/g, "\\'")}' and trashed=false`;
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!resp.ok) return [];
  const data = await resp.json();
  return data.files || [];
}
