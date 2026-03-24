import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getAccessTokenOAuth2(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }),
  });
  if (!tokenRes.ok) throw new Error(`OAuth2 token failed: ${await tokenRes.text()}`);
  const data = await tokenRes.json();
  return data.access_token;
}

async function getAccessTokenServiceAccount(serviceAccountKey: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({
    iss: serviceAccountKey.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: serviceAccountKey.token_uri || "https://oauth2.googleapis.com/token",
    exp: now + 3600, iat: now,
  }));
  const signInput = `${header}.${payload}`;
  const pem = serviceAccountKey.private_key.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("pkcs8", binaryKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signInput));
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const jwt = `${signInput}.${sig}`;
  const tokenResp = await fetch(serviceAccountKey.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenResp.json();
  if (!tokenData.access_token) throw new Error("Failed to get SA access token");
  return tokenData.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate caller is admin
    const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: { user: caller } } = await supabase.auth.getUser(authHeader);
    if (!caller) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: adminCheck } = await supabase.rpc("has_role", { _user_id: caller.id, _role: "admin" });
    if (!adminCheck) return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { emails } = await req.json();
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return new Response(JSON.stringify({ error: "emails array required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get Google integration
    const { data: integration } = await supabase.from("google_integrations").select("*").eq("is_default", true).maybeSingle();
    const folderId = integration?.output_folder_id || integration?.drive_folder_id;
    if (!folderId) {
      return new Response(JSON.stringify({ error: "Output folder not configured in Google integration" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get access token using same auth method as other functions
    let accessToken: string;
    const authType = integration.auth_type || "service_account";
    if (authType === "oauth2") {
      accessToken = await getAccessTokenOAuth2(integration.oauth_client_id, integration.oauth_client_secret, integration.oauth_refresh_token);
    } else {
      let saKey: any;
      try {
        saKey = JSON.parse(integration.service_account_key);
      } catch {
        const envKey = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
        if (envKey) {
          saKey = JSON.parse(envKey);
          if (typeof saKey === "string") saKey = JSON.parse(saKey);
        }
      }
      if (!saKey?.private_key) return new Response(JSON.stringify({ error: "Service account key not configured" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      accessToken = await getAccessTokenServiceAccount(saKey);
    }

    const sanitize = (e: string) => e.trim().toLowerCase().replace(/[.\s]+$/, "");
    const uniqueEmails = [...new Set(emails.map(sanitize).filter((e: string) => e.includes("@")))];
    const results: { email: string; status: "ok" | "error" | "already"; message: string }[] = [];

    for (const email of uniqueEmails) {
      try {
        const permResp = await fetch(
          `https://www.googleapis.com/drive/v3/files/${folderId}/permissions?supportsAllDrives=true&sendNotificationEmail=false`,
          { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "user", role: "reader", emailAddress: email }) }
        );
        const permBody = await permResp.text();
        if (permResp.ok) results.push({ email, status: "ok", message: "Acesso concedido" });
        else if (permBody.includes("already")) results.push({ email, status: "already", message: "Já possui acesso" });
        else results.push({ email, status: "error", message: `HTTP ${permResp.status}: ${permBody}` });
      } catch (e: any) { results.push({ email, status: "error", message: e.message }); }
    }

    await supabase.from("proposal_process_logs").insert({ user_id: caller.id, user_email: caller.email, stage: "drive_folder_access", action: "grant_folder_reader", metadata: { emails: uniqueEmails, results }, payload: {} });

    return new Response(JSON.stringify({ results }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
