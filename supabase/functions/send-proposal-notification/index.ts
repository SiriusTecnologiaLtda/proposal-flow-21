import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// --- Gmail via Service Account helpers ---

function base64url(data: Uint8Array): string {
  let b64 = btoa(String.fromCharCode(...data));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function strToUint8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function createSignedJwt(
  serviceAccountEmail: string,
  privateKey: string,
  impersonateEmail: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccountEmail,
    sub: impersonateEmail,
    scope: "https://www.googleapis.com/auth/gmail.send",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const headerB64 = base64url(strToUint8(JSON.stringify(header)));
  const payloadB64 = base64url(strToUint8(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await importPrivateKey(privateKey);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    strToUint8(signingInput)
  );

  const signatureB64 = base64url(new Uint8Array(signature));
  return `${signingInput}.${signatureB64}`;
}

async function getAccessToken(
  serviceAccountEmail: string,
  privateKey: string,
  impersonateEmail: string
): Promise<string> {
  const jwt = await createSignedJwt(serviceAccountEmail, privateKey, impersonateEmail);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    console.error("Token error:", JSON.stringify(data));
    throw new Error(`Failed to get access token: ${data.error_description || data.error || "unknown"}`);
  }
  return data.access_token;
}

function buildRawEmail(
  from: string,
  to: string,
  subject: string,
  htmlBody: string
): string {
  const boundary = "boundary_" + crypto.randomUUID().replace(/-/g, "");
  const rawLines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    btoa(unescape(encodeURIComponent(htmlBody))),
    ``,
    `--${boundary}--`,
  ];
  return rawLines.join("\r\n");
}

async function sendGmail(
  accessToken: string,
  senderEmail: string,
  recipientEmail: string,
  subject: string,
  htmlBody: string
): Promise<void> {
  const raw = buildRawEmail(senderEmail, recipientEmail, subject, htmlBody);
  const rawB64 = btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: rawB64 }),
    }
  );

  if (!res.ok) {
    const errData = await res.text();
    console.error("Gmail send error:", errData);
    throw new Error(`Gmail API error (${res.status}): ${errData}`);
  }
  await res.text();
}

// --- Main handler ---

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify user
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { proposalId, type, message } = await req.json();

    if (!proposalId || !type) {
      return new Response(
        JSON.stringify({ error: "Missing proposalId or type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch proposal
    const { data: proposal, error: propError } = await supabase
      .from("proposals")
      .select(
        "*, clients(name, cnpj), esn:sales_team!proposals_esn_id_fkey(id, name, email), arquiteto:sales_team!proposals_arquiteto_id_fkey(id, name, email)"
      )
      .eq("id", proposalId)
      .single();

    if (propError || !proposal) {
      return new Response(JSON.stringify({ error: "Proposal not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine sender and recipient
    let recipientEmail: string | null = null;
    let recipientName: string | null = null;
    let senderName: string | null = null;
    let subject: string;
    let bodyHtml: string;

    const clientName = (proposal as any).clients?.name || "N/A";
    const proposalNumber = proposal.number;
    const proposalProduct = proposal.product;

    // Get sender profile name
    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .single();
    senderName = senderProfile?.display_name || user.email || "Usuário";

    if (type === "solicitar_ajuste") {
      const arq = (proposal as any).arquiteto;
      if (!arq?.email) {
        return new Response(
          JSON.stringify({ error: "Arquiteto não possui email cadastrado" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      recipientEmail = arq.email;
      recipientName = arq.name;
      subject = `[Proposta ${proposalNumber}] Solicitação de Ajuste no Escopo`;
      bodyHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a2e;">Solicitação de Ajuste no Escopo</h2>
          <p>Olá <strong>${recipientName}</strong>,</p>
          <p><strong>${senderName}</strong> solicitou que você revise e ajuste o escopo da seguinte proposta:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 8px; font-weight: bold; color: #555;">Proposta</td>
              <td style="padding: 8px;">${proposalNumber}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 8px; font-weight: bold; color: #555;">Cliente</td>
              <td style="padding: 8px;">${clientName}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 8px; font-weight: bold; color: #555;">Produto</td>
              <td style="padding: 8px;">${proposalProduct}</td>
            </tr>
          </table>
          ${message ? `<div style="background: #f5f5f5; padding: 12px 16px; border-radius: 8px; margin: 16px 0;"><strong>Mensagem:</strong><br/>${message.replace(/\n/g, "<br/>")}</div>` : ""}
          <p style="color: #888; font-size: 12px; margin-top: 24px;">Este é um email automático do sistema de propostas.</p>
        </div>
      `;
    } else if (type === "notificar_esn") {
      const esn = (proposal as any).esn;
      if (!esn?.email) {
        return new Response(
          JSON.stringify({ error: "ESN não possui email cadastrado" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      recipientEmail = esn.email;
      recipientName = esn.name;
      subject = `[Proposta ${proposalNumber}] Ajuste de Escopo Concluído`;
      bodyHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a2e;">Ajuste de Escopo Concluído</h2>
          <p>Olá <strong>${recipientName}</strong>,</p>
          <p><strong>${senderName}</strong> concluiu os ajustes no escopo da seguinte proposta:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 8px; font-weight: bold; color: #555;">Proposta</td>
              <td style="padding: 8px;">${proposalNumber}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 8px; font-weight: bold; color: #555;">Cliente</td>
              <td style="padding: 8px;">${clientName}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 8px; font-weight: bold; color: #555;">Produto</td>
              <td style="padding: 8px;">${proposalProduct}</td>
            </tr>
          </table>
          ${message ? `<div style="background: #f5f5f5; padding: 12px 16px; border-radius: 8px; margin: 16px 0;"><strong>Mensagem do Arquiteto:</strong><br/>${message.replace(/\n/g, "<br/>")}</div>` : ""}
          <p style="color: #888; font-size: 12px; margin-top: 24px;">Este é um email automático do sistema de propostas.</p>
        </div>
      `;
    } else {
      return new Response(JSON.stringify({ error: "Invalid notification type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Send via Gmail API using Service Account ---
    const saKeyRaw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (!saKeyRaw) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_SERVICE_ACCOUNT_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let saKey: any;
    try {
      saKey = JSON.parse(saKeyRaw);
    } catch (e) {
      console.error("Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY:", saKeyRaw?.substring(0, 100));
      return new Response(
        JSON.stringify({ error: "GOOGLE_SERVICE_ACCOUNT_KEY JSON inválido" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!saKey.private_key || !saKey.client_email) {
      console.error("SA key missing fields. Keys found:", Object.keys(saKey).join(", "));
      return new Response(
        JSON.stringify({ error: "Service account key incompleta (faltam private_key ou client_email)" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const senderEmail = saKey.client_email;
    const impersonateEmail = Deno.env.get("GMAIL_SENDER_EMAIL") || senderEmail;

    const accessToken = await getAccessToken(
      saKey.client_email,
      saKey.private_key,
      impersonateEmail
    );

    await sendGmail(accessToken, impersonateEmail, recipientEmail!, subject!, bodyHtml!);

    return new Response(
      JSON.stringify({
        success: true,
        recipientName,
        recipientEmail,
        subject,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
