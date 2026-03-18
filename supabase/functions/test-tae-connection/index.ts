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
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } =
      await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get TAE config
    const { data: config, error: configError } = await supabase
      .from("tae_config")
      .select("*")
      .maybeSingle();

    if (configError || !config) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Configuração TAE não encontrada",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const serviceEmail = config.service_user_email;
    const servicePassword = Deno.env.get("TAE_SERVICE_USER_PASSWORD");

    if (!serviceEmail || !servicePassword) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "E-mail ou senha do usuário de serviço não configurados",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const baseUrl = config.base_url;

    // Step 1: Login to TAE Identity API
    const loginUrl = `${baseUrl}/identityintegration/v3/auth/login`;
    const loginStart = Date.now();

    const loginRes = await fetch(loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        login: serviceEmail,
        password: servicePassword,
      }),
    });

    const loginMs = Date.now() - loginStart;
    const loginBody = await loginRes.text();

    if (!loginRes.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Login falhou (HTTP ${loginRes.status})`,
          details: loginBody.substring(0, 500),
          latency_ms: loginMs,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let tokenData;
    try {
      tokenData = JSON.parse(loginBody);
    } catch {
      tokenData = { raw: loginBody.substring(0, 200) };
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Conexão com TAE bem-sucedida! Login realizado com sucesso.",
        environment: config.environment,
        base_url: baseUrl,
        service_user: serviceEmail,
        latency_ms: loginMs,
        token_preview: typeof tokenData === "object" && tokenData.access_token
          ? `${String(tokenData.access_token).substring(0, 20)}...`
          : "Token obtido",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Erro inesperado: ${err.message}`,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
