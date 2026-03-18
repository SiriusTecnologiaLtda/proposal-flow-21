import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { proposalId, type, message } = await req.json();
    // type: "solicitar_ajuste" (ESN → Arquiteto) or "notificar_esn" (Arquiteto → ESN)

    if (!proposalId || !type) {
      return new Response(JSON.stringify({ error: "Missing proposalId or type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch proposal with related data
    const { data: proposal, error: propError } = await supabase
      .from("proposals")
      .select("*, clients(name, cnpj), esn:sales_team!proposals_esn_id_fkey(id, name, email), arquiteto:sales_team!proposals_arquiteto_id_fkey(id, name, email)")
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
      // ESN → Arquiteto
      const arq = (proposal as any).arquiteto;
      if (!arq?.email) {
        return new Response(JSON.stringify({ error: "Arquiteto não possui email cadastrado" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
      // Arquiteto → ESN
      const esn = (proposal as any).esn;
      if (!esn?.email) {
        return new Response(JSON.stringify({ error: "ESN não possui email cadastrado" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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

    // Send email using Lovable AI gateway
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailRes = await fetch("https://api.lovable.dev/v1/email/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        to: recipientEmail,
        subject,
        html: bodyHtml,
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error("Email send failed:", errText);
      return new Response(
        JSON.stringify({ 
          error: "Falha ao enviar email", 
          details: errText,
          // Fallback: return info so frontend can show mailto link
          fallback: { to: recipientEmail, subject, recipientName }
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, recipientName, recipientEmail }),
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
