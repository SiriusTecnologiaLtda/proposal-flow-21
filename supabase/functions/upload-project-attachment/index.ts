import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Google Auth (reused from generate-proposal-pdf) ─────────────────

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
    "pkcs8", binaryKey.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signInput));
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const jwt = `${header}.${payload}.${sig}`;
  const tokenResp = await fetch(serviceAccountKey.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResp.ok) throw new Error(`Failed to get access token: ${await tokenResp.text()}`);
  return (await tokenResp.json()).access_token;
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
  if (!tokenRes.ok) throw new Error(`OAuth2 token refresh failed: ${await tokenRes.text()}`);
  return (await tokenRes.json()).access_token;
}

// ─── Drive helpers ──────────────────────────────────────────────────

async function findOrCreateFolder(accessToken: string, parentFolderId: string, folderName: string): Promise<string> {
  // Search for existing folder
  const query = `name='${folderName.replace(/'/g, "\\'")}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchResp = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const searchData = await searchResp.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create folder
  const createResp = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId],
    }),
  });
  if (!createResp.ok) throw new Error(`Failed to create folder: ${await createResp.text()}`);
  return (await createResp.json()).id;
}

async function uploadFileToDrive(
  accessToken: string,
  parentFolderId: string,
  fileName: string,
  fileBytes: Uint8Array,
  mimeType: string
): Promise<{ id: string; webViewLink: string }> {
  const metadata = {
    name: fileName,
    parents: [parentFolderId],
  };

  const boundary = "-------314159265358979323846";
  const metaJson = JSON.stringify(metadata);

  const body = new Uint8Array(
    await new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaJson}\r\n`,
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      fileBytes,
      `\r\n--${boundary}--`,
    ]).arrayBuffer()
  );

  const resp = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Drive upload failed (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  return { id: data.id, webViewLink: data.webViewLink || `https://drive.google.com/file/d/${data.id}/view` };
}

// ─── Main handler ───────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const projectId = formData.get("project_id") as string | null;
    const projectLabel = formData.get("project_label") as string | null;

    if (!file) throw new Error("No file provided");
    if (!projectId) throw new Error("No project_id provided");

    // Get auth header for supabase
    const authHeader = req.headers.get("authorization") || "";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get default Google integration
    const { data: integration, error: intError } = await supabase
      .from("google_integrations")
      .select("*")
      .eq("is_default", true)
      .maybeSingle();

    if (intError || !integration) {
      throw new Error("Nenhuma integração Google padrão configurada. Configure em Integrações > Google.");
    }

    const outputFolderId = integration.output_folder_id || integration.drive_folder_id;
    if (!outputFolderId) {
      throw new Error("Nenhuma pasta de saída configurada na integração Google.");
    }

    // Get Google access token
    let accessToken: string;
    if (integration.auth_type === "oauth2") {
      if (!integration.oauth_client_id || !integration.oauth_client_secret || !integration.oauth_refresh_token) {
        throw new Error("Credenciais OAuth2 incompletas na integração Google.");
      }
      accessToken = await getAccessTokenOAuth2(
        integration.oauth_client_id,
        integration.oauth_client_secret,
        integration.oauth_refresh_token
      );
    } else {
      const saKeyStr = integration.service_account_key;
      if (!saKeyStr) throw new Error("Service Account Key não configurada.");
      const saKey = JSON.parse(saKeyStr);
      accessToken = await getAccessTokenServiceAccount(saKey);
    }

    // Create or find project subfolder: "Projeto - {projectLabel}"
    const folderName = `Projeto - ${projectLabel || projectId}`;
    const projectFolderId = await findOrCreateFolder(accessToken, outputFolderId, folderName);

    // Upload file
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const result = await uploadFileToDrive(accessToken, projectFolderId, file.name, fileBytes, file.type || "application/octet-stream");

    return new Response(JSON.stringify({
      success: true,
      drive_file_id: result.id,
      drive_url: result.webViewLink,
      folder_id: projectFolderId,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("upload-project-attachment error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
