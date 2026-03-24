import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    "pkcs8", binaryKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signInput));
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const jwt = `${signInput}.${sig}`;
  const tokenResp = await fetch(serviceAccountKey.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenResp.json();
  if (!tokenData.access_token) throw new Error("Failed to get access token");
  return tokenData.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate caller is admin
    const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user: caller } } = await supabase.auth.getUser(authHeader);
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: adminCheck } = await supabase.rpc("has_role", { _user_id: caller.id, _role: "admin" });
    if (!adminCheck) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { emails } = await req.json();
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return new Response(JSON.stringify({ error: "emails array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get Google integration with output folder
    const { data: integration } = await supabase
      .from("google_integrations")
      .select("service_account_key, output_folder_id")
      .eq("is_default", true)
      .maybeSingle();

    if (!integration?.output_folder_id) {
      return new Response(JSON.stringify({ error: "Google integration output folder not configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try service_account_key from DB first, then fall back to env secret
    let saKeyRaw = integration.service_account_key;
    if (!saKeyRaw) {
      saKeyRaw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY") || null;
    }
    if (!saKeyRaw) {
      return new Response(JSON.stringify({ error: "Google service account key not configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const saKey = typeof saKeyRaw === "string" ? JSON.parse(saKeyRaw) : saKeyRaw;

    const accessToken = await getAccessTokenServiceAccount(saKey);
    const folderId = integration.output_folder_id;

    const sanitize = (e: string) => e.trim().toLowerCase().replace(/[.\s]+$/, "");
    const uniqueEmails = [...new Set(emails.map(sanitize).filter((e: string) => e.includes("@")))];

    const results: { email: string; status: "ok" | "error" | "already"; message: string }[] = [];

    for (const email of uniqueEmails) {
      try {
        const permResp = await fetch(
          `https://www.googleapis.com/drive/v3/files/${folderId}/permissions?supportsAllDrives=true&sendNotificationEmail=false`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ type: "user", role: "reader", emailAddress: email }),
          }
        );
        const permBody = await permResp.text();
        if (permResp.ok) {
          results.push({ email, status: "ok", message: "Acesso concedido" });
        } else if (permResp.status === 400 && permBody.includes("already has access")) {
          results.push({ email, status: "already", message: "Já possui acesso" });
        } else {
          results.push({ email, status: "error", message: `HTTP ${permResp.status}: ${permBody}` });
        }
      } catch (e: any) {
        results.push({ email, status: "error", message: e.message });
      }
    }

    // Log the action
    await supabase.from("proposal_process_logs").insert({
      user_id: caller.id,
      user_email: caller.email,
      stage: "drive_folder_access",
      action: "grant_folder_reader",
      metadata: { emails: uniqueEmails, results },
      payload: {},
    });

    return new Response(JSON.stringify({ results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
