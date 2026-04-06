import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Google Auth (reused from generate-proposal-pdf) ───────────────

async function getAccessTokenServiceAccount(serviceAccountKey: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({
    iss: serviceAccountKey.client_email,
    scope: "https://www.googleapis.com/auth/drive",
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

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`OAuth2 token refresh failed (${tokenRes.status}): ${errText}`);
  }
  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

// ─── Main ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { doc_ids } = await req.json();

    if (!doc_ids || !Array.isArray(doc_ids) || doc_ids.length === 0) {
      return new Response(JSON.stringify({ error: "doc_ids array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate user session
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get Google integration
    const { data: googleInt } = await supabaseAdmin
      .from("google_integrations")
      .select("*")
      .eq("is_default", true)
      .maybeSingle();

    if (!googleInt) {
      return new Response(JSON.stringify({ error: "Integração Google não configurada" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get access token
    let accessToken: string;
    if (googleInt.auth_type === "oauth2" && googleInt.oauth_client_id && googleInt.oauth_client_secret && googleInt.oauth_refresh_token) {
      accessToken = await getAccessTokenOAuth2(googleInt.oauth_client_id, googleInt.oauth_client_secret, googleInt.oauth_refresh_token);
    } else if (googleInt.service_account_key) {
      const saKey = typeof googleInt.service_account_key === "string"
        ? JSON.parse(googleInt.service_account_key)
        : googleInt.service_account_key;
      accessToken = await getAccessTokenServiceAccount(saKey);
    } else {
      return new Response(JSON.stringify({ error: "Credenciais Google não configuradas" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete each document from Drive
    const results: { doc_id: string; status: string; error?: string }[] = [];

    for (const docId of doc_ids) {
      if (!docId || typeof docId !== "string") {
        results.push({ doc_id: docId, status: "skipped", error: "invalid doc_id" });
        continue;
      }

      try {
        const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${docId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (resp.ok || resp.status === 204) {
          results.push({ doc_id: docId, status: "deleted" });
        } else if (resp.status === 404) {
          results.push({ doc_id: docId, status: "not_found" });
        } else {
          const errText = await resp.text();
          results.push({ doc_id: docId, status: "error", error: `HTTP ${resp.status}: ${errText}` });
        }
      } catch (err: any) {
        results.push({ doc_id: docId, status: "error", error: err.message });
      }
    }

    const deleted = results.filter(r => r.status === "deleted").length;
    const notFound = results.filter(r => r.status === "not_found").length;
    const errors = results.filter(r => r.status === "error").length;

    return new Response(JSON.stringify({
      success: true,
      summary: { total: doc_ids.length, deleted, not_found: notFound, errors },
      results,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("delete-drive-documents error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
