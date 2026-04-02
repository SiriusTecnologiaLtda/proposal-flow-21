import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Não autorizado" }, 401);
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return json({ error: "Não autorizado" }, 401);
    }

    // Check admin
    const { data: roleData } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) {
      return json({ error: "Acesso restrito a administradores" }, 403);
    }

    const { code, redirectUri } = await req.json();
    if (!code || !redirectUri) {
      return json({ error: "code e redirectUri são obrigatórios" }, 400);
    }

    // Load default google integration for client_id / client_secret
    const { data: gInt, error: gIntErr } = await admin
      .from("google_integrations")
      .select("oauth_client_id, oauth_client_secret")
      .eq("is_default", true)
      .single();

    if (gIntErr || !gInt?.oauth_client_id || !gInt?.oauth_client_secret) {
      return json({ error: "Integração Google OAuth padrão não configurada. Configure em Configurações > Google Drive / Docs." }, 500);
    }

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: gInt.oauth_client_id,
        client_secret: gInt.oauth_client_secret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenText = await tokenRes.text();
    if (!tokenRes.ok) {
      console.error("Google token exchange failed:", tokenText);
      return json({ error: `Falha na troca do código: ${tokenText.substring(0, 200)}` }, 400);
    }

    const tokenData = JSON.parse(tokenText);
    const refreshToken = tokenData.refresh_token;

    if (!refreshToken) {
      return json({
        error: "Google não retornou refresh_token. Tente revogar o acesso em https://myaccount.google.com/permissions e autorizar novamente.",
      }, 400);
    }

    // Get email from token
    let email = "";
    if (tokenData.access_token) {
      try {
        const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        if (userInfoRes.ok) {
          const userInfo = await userInfoRes.json();
          email = userInfo.email || "";
        }
      } catch { /* ignore */ }
    }

    // Save refresh token to email_inbox_config
    const { data: config } = await admin
      .from("email_inbox_config")
      .select("id")
      .limit(1)
      .single();

    if (!config) {
      return json({ error: "Configuração de e-mail não encontrada. Salve a configuração primeiro." }, 404);
    }

    const { error: updateError } = await admin
      .from("email_inbox_config")
      .update({
        gmail_refresh_token: refreshToken,
        email_address: email || undefined,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", config.id);

    if (updateError) {
      return json({ error: `Erro ao salvar token: ${updateError.message}` }, 500);
    }

    return json({
      success: true,
      email,
      message: `Autorização concluída para ${email || "conta Gmail"}. Refresh token salvo.`,
    });
  } catch (err) {
    console.error("email-inbox-oauth-exchange error:", err);
    return json({ error: err instanceof Error ? err.message : "Erro interno" }, 500);
  }
});
