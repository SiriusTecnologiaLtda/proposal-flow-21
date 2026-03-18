import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { code, integrationId, redirectUri } = await req.json();

    if (!code || !integrationId || !redirectUri) {
      return new Response(JSON.stringify({ error: "code, integrationId e redirectUri são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load integration to get client_id and client_secret
    const { data: integration, error: intError } = await admin
      .from("google_integrations")
      .select("oauth_client_id, oauth_client_secret")
      .eq("id", integrationId)
      .single();

    if (intError || !integration) {
      return new Response(JSON.stringify({ error: "Integração não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!integration.oauth_client_id || !integration.oauth_client_secret) {
      return new Response(JSON.stringify({ error: "Client ID e Client Secret são necessários" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Exchange authorization code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: integration.oauth_client_id,
        client_secret: integration.oauth_client_secret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenText = await tokenRes.text();

    if (!tokenRes.ok) {
      console.error("Google token exchange failed:", tokenText);
      return new Response(JSON.stringify({ error: `Falha na troca do código: ${tokenText.substring(0, 200)}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tokenData = JSON.parse(tokenText);
    const refreshToken = tokenData.refresh_token;

    if (!refreshToken) {
      return new Response(JSON.stringify({ 
        error: "Google não retornou refresh_token. Tente revogar o acesso em https://myaccount.google.com/permissions e autorizar novamente.",
        tokenData,
      }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user info to show which account was authorized
    let email = "";
    if (tokenData.access_token) {
      try {
        const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const userInfoText = await userInfoRes.text();
        if (userInfoRes.ok) {
          const userInfo = JSON.parse(userInfoText);
          email = userInfo.email || "";
        }
      } catch { /* ignore */ }
    }

    // Save refresh token and sender email to the integration
    const { error: updateError } = await admin
      .from("google_integrations")
      .update({ oauth_refresh_token: refreshToken, sender_email: email || null })
      .eq("id", integrationId);

    if (updateError) {
      return new Response(JSON.stringify({ error: `Erro ao salvar token: ${updateError.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      email,
      message: `Autorização concluída${email ? ` para ${email}` : ""}. Refresh token salvo automaticamente.` 
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("google-oauth-exchange error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
