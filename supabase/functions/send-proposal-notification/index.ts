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
  to: string,
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

    const { proposalId, type, message, proposalLink, recipients } = await req.json();

    if (!proposalId || !type) {
      return new Response(
        JSON.stringify({ error: "Missing proposalId or type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch user profile with gmail tokens
    const { data: senderProfile, error: profileError } = await supabase
      .from("profiles")
      .select("display_name, email, gmail_refresh_token, gmail_sender_email")
      .eq("user_id", user.id)
      .single();

    if (profileError || !senderProfile) {
      return new Response(
        JSON.stringify({ error: "Perfil do usuário não encontrado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!senderProfile.gmail_refresh_token) {
      return new Response(
        JSON.stringify({
          error: "gmail_not_authorized",
          message: "Você precisa autorizar o envio de emails pela sua conta Google antes de usar esta funcionalidade.",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const senderName = senderProfile.display_name || user.email || "Usuário";
    const senderEmail = senderProfile.gmail_sender_email || user.email || "noreply@example.com";

    // Fetch proposal with scope and financial data
    const { data: proposal, error: propError } = await supabase
      .from("proposals")
      .select(
        "*, clients(name, cnpj), esn:sales_team!proposals_esn_id_fkey(id, name, email, unit_id), arquiteto:sales_team!proposals_arquiteto_id_fkey(id, name, email), proposal_macro_scope(scope, description, phase, sort_order, analyst_hours, gp_hours), proposal_scope_items(description, hours, included, parent_id, phase), payment_conditions(installment, amount, due_date)"
      )
      .eq("id", proposalId)
      .single();

    if (propError || !proposal) {
      return new Response(JSON.stringify({ error: "Proposal not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine recipient
    let recipientEmail: string | null = null;
    let recipientName: string | null = null;
    let subject: string;
    let bodyHtml: string;

    const clientName = (proposal as any).clients?.name || "N/A";
    const proposalNumber = proposal.number;
    const proposalProduct = proposal.product;

    // Build scope summary HTML
    const macroScope = ((proposal as any).proposal_macro_scope || [])
      .sort((a: any, b: any) => a.sort_order - b.sort_order);
    let scopeHtml = "";
    if (macroScope.length > 0) {
      scopeHtml = `
        <div style="margin: 16px 0;">
          <strong style="color: #555;">Escopo Resumido:</strong>
          <ul style="margin: 8px 0; padding-left: 20px; color: #333;">
            ${macroScope.map((s: any) => `<li style="margin: 4px 0;">${s.scope}${s.description ? ` — <span style="color: #666;">${s.description}</span>` : ""}</li>`).join("")}
          </ul>
        </div>
      `;
    }

    const linkHtml = proposalLink
      ? `<p style="margin: 16px 0;"><a href="${proposalLink}" style="display: inline-block; padding: 10px 20px; background: #1a1a2e; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">Acessar Proposta na Plataforma</a></p>`
      : "";

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
      subject = `[Proposta ${proposalNumber}] Envio para Engenharia de Valor`;
      bodyHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a2e;">Envio para Engenharia de Valor</h2>
          <p>Olá <strong>${recipientName}</strong>,</p>
          <p><strong>${senderName}</strong> enviou a seguinte proposta para análise de engenharia de valor:</p>
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
          ${scopeHtml}
          ${message ? `<div style="background: #f5f5f5; padding: 12px 16px; border-radius: 8px; margin: 16px 0;"><strong>Mensagem:</strong><br/>${message.replace(/\n/g, "<br/>")}</div>` : ""}
          ${linkHtml}
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
          ${scopeHtml}
          ${message ? `<div style="background: #f5f5f5; padding: 12px 16px; border-radius: 8px; margin: 16px 0;"><strong>Comentários do Arquiteto:</strong><br/>${message.replace(/\n/g, "<br/>")}</div>` : ""}
          ${linkHtml}
          <p style="color: #888; font-size: 12px; margin-top: 24px;">Este é um email automático do sistema de propostas.</p>
        </div>
      `;
    } else if (type === "comunicar_cra") {
      // CRA notification - multiple recipients
      if (!recipients || recipients.length === 0) {
        return new Response(
          JSON.stringify({ error: "Nenhum destinatário CRA selecionado" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Build financial summary
      const scopeItems = (proposal as any).proposal_scope_items || [];
      const macroScopeItems = (proposal as any).proposal_macro_scope || [];
      const payments = (proposal as any).payment_conditions || [];

      // Calculate total hours by level (macro scope)
      const sortedMacro = macroScopeItems.sort((a: any, b: any) => a.sort_order - b.sort_order);
      let macroScopeTableHtml = "";
      if (sortedMacro.length > 0) {
        const totalAnalystH = sortedMacro.reduce((s: number, m: any) => s + (m.analyst_hours || 0), 0);
        const totalGpH = sortedMacro.reduce((s: number, m: any) => s + (m.gp_hours || 0), 0);
        macroScopeTableHtml = `
          <div style="margin: 16px 0;">
            <strong style="color: #555;">Escopo Resumido por Nível:</strong>
            <table style="width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 13px;">
              <tr style="background: #f0f0f0;">
                <th style="padding: 6px 8px; text-align: left; border: 1px solid #ddd;">Escopo</th>
                <th style="padding: 6px 8px; text-align: center; border: 1px solid #ddd;">Hrs Analista</th>
                <th style="padding: 6px 8px; text-align: center; border: 1px solid #ddd;">Hrs GP</th>
              </tr>
              ${sortedMacro.map((m: any) => `
                <tr>
                  <td style="padding: 6px 8px; border: 1px solid #ddd;">${m.scope}${m.description ? ` — <span style="color:#666">${m.description}</span>` : ""}</td>
                  <td style="padding: 6px 8px; text-align: center; border: 1px solid #ddd;">${m.analyst_hours || 0}h</td>
                  <td style="padding: 6px 8px; text-align: center; border: 1px solid #ddd;">${m.gp_hours || 0}h</td>
                </tr>
              `).join("")}
              <tr style="background: #f0f0f0; font-weight: bold;">
                <td style="padding: 6px 8px; border: 1px solid #ddd;">Total</td>
                <td style="padding: 6px 8px; text-align: center; border: 1px solid #ddd;">${totalAnalystH}h</td>
                <td style="padding: 6px 8px; text-align: center; border: 1px solid #ddd;">${totalGpH}h</td>
              </tr>
            </table>
          </div>
        `;
      }

      // Financial data
      const totalIncludedHours = scopeItems
        .filter((i: any) => i.included && i.parent_id)
        .reduce((s: number, i: any) => s + (i.hours || 0), 0);
      const roundUp8 = (v: number) => Math.ceil(v / 8) * 8;
      const roundedHours = roundUp8(totalIncludedHours);
      const gpHours = roundUp8(Math.ceil(roundedHours * (proposal.gp_percentage / 100)));
      const totalHoursWithGp = roundedHours + gpHours;
      const netValue = totalHoursWithGp * proposal.hourly_rate;

      // Payment conditions
      let paymentsHtml = "";
      if (payments.length > 0) {
        const sortedPayments = payments.sort((a: any, b: any) => a.installment - b.installment);
        paymentsHtml = `
          <div style="margin: 16px 0;">
            <strong style="color: #555;">Condições de Pagamento:</strong>
            <table style="width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 13px;">
              <tr style="background: #f0f0f0;">
                <th style="padding: 6px 8px; text-align: center; border: 1px solid #ddd;">Parcela</th>
                <th style="padding: 6px 8px; text-align: right; border: 1px solid #ddd;">Valor</th>
                <th style="padding: 6px 8px; text-align: center; border: 1px solid #ddd;">Vencimento</th>
              </tr>
              ${sortedPayments.map((p: any) => `
                <tr>
                  <td style="padding: 6px 8px; text-align: center; border: 1px solid #ddd;">${p.installment}</td>
                  <td style="padding: 6px 8px; text-align: right; border: 1px solid #ddd;">R$ ${Number(p.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                  <td style="padding: 6px 8px; text-align: center; border: 1px solid #ddd;">${p.due_date ? new Date(p.due_date + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                </tr>
              `).join("")}
            </table>
          </div>
        `;
      }

      const financialHtml = `
        <div style="margin: 16px 0;">
          <strong style="color: #555;">Resumo Financeiro:</strong>
          <table style="width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 13px;">
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 6px 8px; font-weight: bold; color: #555;">Horas Analista (arredondado)</td>
              <td style="padding: 6px 8px; text-align: right;">${roundedHours}h</td>
            </tr>
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 6px 8px; font-weight: bold; color: #555;">Horas GP (${proposal.gp_percentage}%)</td>
              <td style="padding: 6px 8px; text-align: right;">${gpHours}h</td>
            </tr>
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 6px 8px; font-weight: bold; color: #555;">Total de Horas</td>
              <td style="padding: 6px 8px; text-align: right;">${totalHoursWithGp}h</td>
            </tr>
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 6px 8px; font-weight: bold; color: #555;">Valor/Hora</td>
              <td style="padding: 6px 8px; text-align: right;">R$ ${Number(proposal.hourly_rate).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
            </tr>
            <tr style="background: #f0f0f0; font-weight: bold;">
              <td style="padding: 6px 8px; color: #333;">Valor Líquido</td>
              <td style="padding: 6px 8px; text-align: right; color: #333;">R$ ${netValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
            </tr>
          </table>
        </div>
      `;

      subject = `[Proposta ${proposalNumber}] Comunicado CRA`;
      bodyHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a2e;">Comunicado CRA — Proposta ${proposalNumber}</h2>
          <p><strong>${senderName}</strong> enviou o seguinte comunicado referente à proposta:</p>
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
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 8px; font-weight: bold; color: #555;">Status</td>
              <td style="padding: 8px;">${proposal.status}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e0e0e0;">
              <td style="padding: 8px; font-weight: bold; color: #555;">ESN</td>
              <td style="padding: 8px;">${(proposal as any).esn?.name || "—"}</td>
            </tr>
          </table>
          ${financialHtml}
          ${macroScopeTableHtml}
          ${paymentsHtml}
          ${message ? `<div style="background: #f5f5f5; padding: 12px 16px; border-radius: 8px; margin: 16px 0;"><strong>Mensagem:</strong><br/>${message.replace(/\n/g, "<br/>")}</div>` : ""}
          ${linkHtml}
          <p style="color: #888; font-size: 12px; margin-top: 24px;">Este é um email automático do sistema de propostas.</p>
        </div>
      `;

      // Send to all selected CRA recipients
      const gInt2 = await getOAuthClient(supabase);
      const accessToken2 = await getAccessTokenOAuth2(
        gInt2.oauth_client_id,
        gInt2.oauth_client_secret,
        senderProfile.gmail_refresh_token
      );

      for (const r of recipients) {
        await sendGmail(accessToken2, senderName, senderEmail, r.email, subject, bodyHtml);
      }

      return new Response(
        JSON.stringify({
          success: true,
          recipientCount: recipients.length,
          subject,
          senderEmail,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      return new Response(JSON.stringify({ error: "Invalid notification type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get OAuth client credentials from default google integration
    const { data: gInt, error: gIntErr } = await supabase
      .from("google_integrations")
      .select("oauth_client_id, oauth_client_secret")
      .eq("is_default", true)
      .single();

    if (gIntErr || !gInt || !gInt.oauth_client_id || !gInt.oauth_client_secret) {
      return new Response(
        JSON.stringify({ error: "Integração Google OAuth2 padrão não configurada." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use the USER's refresh token
    const accessToken = await getAccessTokenOAuth2(
      gInt.oauth_client_id,
      gInt.oauth_client_secret,
      senderProfile.gmail_refresh_token
    );

    await sendGmail(accessToken, senderName, senderEmail, recipientEmail!, subject!, bodyHtml!);

    return new Response(
      JSON.stringify({
        success: true,
        recipientName,
        recipientEmail,
        subject,
        senderEmail,
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
