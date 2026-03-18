import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// --- OAuth2 Gmail helpers ---

async function getAccessTokenOAuth2(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    console.error("OAuth2 token refresh error:", JSON.stringify(data));
    throw new Error(`Falha ao obter access token: ${data.error_description || data.error || "unknown"}`);
  }
  return data.access_token;
}

function buildRawEmail(
  fromName: string,
  from: string,
  subject: string,
  htmlBody: string
): string {
  const boundary = "boundary_" + crypto.randomUUID().replace(/-/g, "");
  const rawLines = [
    `From: =?UTF-8?B?${btoa(unescape(encodeURIComponent(fromName)))}?= <${from}>`,
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
  senderName: string,
  senderEmail: string,
  recipientEmail: string,
  subject: string,
  htmlBody: string
): Promise<void> {
  const raw = buildRawEmail(senderName, senderEmail, recipientEmail, subject, htmlBody);
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

    // --- Send via Gmail API using OAuth2 from google_integrations ---
    const { data: gInt, error: gIntErr } = await supabase
      .from("google_integrations")
      .select("oauth_client_id, oauth_client_secret, oauth_refresh_token, sender_email, auth_type")
      .eq("is_default", true)
      .single();

    if (gIntErr || !gInt) {
      return new Response(
        JSON.stringify({ error: "Integração Google não configurada (nenhuma padrão encontrada)" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!gInt.oauth_client_id || !gInt.oauth_client_secret || !gInt.oauth_refresh_token) {
      return new Response(
        JSON.stringify({ error: "Integração OAuth2 incompleta: Client ID, Client Secret e Refresh Token são necessários. Autorize a conexão na página de configuração do Google." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const senderEmail = gInt.sender_email || "noreply@example.com";

    const accessToken = await getAccessTokenOAuth2(
      gInt.oauth_client_id,
      gInt.oauth_client_secret,
      gInt.oauth_refresh_token
    );

    await sendGmail(accessToken, "Propostai", senderEmail, recipientEmail!, subject!, bodyHtml!);

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
