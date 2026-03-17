const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface LogEntry {
  step: string;
  status: 'ok' | 'error' | 'info';
  message: string;
  timestamp: string;
}

function log(step: string, status: LogEntry['status'], message: string): LogEntry {
  return { step, status, message, timestamp: new Date().toISOString() };
}

async function getAccessTokenServiceAccount(serviceAccountKey: any): Promise<string> {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const claimSet = btoa(JSON.stringify({
    iss: serviceAccountKey.client_email,
    scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }));

  const pemContent = serviceAccountKey.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');
  const binaryDer = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('pkcs8', binaryDer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);

  const input = new TextEncoder().encode(`${header}.${claimSet}`);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, input);
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const jwt = `${header}.${claimSet}.${sig}`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Token request failed (${tokenRes.status}): ${errText}`);
  }
  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

async function getAccessTokenOAuth2(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const logs: LogEntry[] = [];

  try {
    const { integrationId } = await req.json();
    if (!integrationId) {
      logs.push(log('input', 'error', 'integrationId não fornecido'));
      return new Response(JSON.stringify({ logs }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }
    logs.push(log('input', 'ok', `ID da integração: ${integrationId}`));

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: integration, error: dbError } = await supabaseAdmin
      .from('google_integrations')
      .select('*')
      .eq('id', integrationId)
      .single();

    if (dbError || !integration) {
      logs.push(log('database', 'error', `Erro ao buscar integração: ${dbError?.message || 'não encontrada'}`));
      return new Response(JSON.stringify({ logs }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    logs.push(log('database', 'ok', `Integração "${integration.label}" encontrada (tipo: ${integration.auth_type || 'service_account'})`));

    let accessToken: string;
    const authType = integration.auth_type || 'service_account';

    if (authType === 'oauth2') {
      // OAuth2 flow
      logs.push(log('auth', 'info', 'Usando autenticação OAuth2...'));
      try {
        accessToken = await getAccessTokenOAuth2(
          integration.oauth_client_id,
          integration.oauth_client_secret,
          integration.oauth_refresh_token
        );
        logs.push(log('auth', 'ok', 'Access token OAuth2 obtido com sucesso'));
      } catch (e: any) {
        logs.push(log('auth', 'error', `Falha na autenticação OAuth2: ${e.message}`));
        return new Response(JSON.stringify({ logs }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    } else {
      // Service Account flow
      logs.push(log('auth', 'info', 'Usando autenticação Service Account...'));
      let saKey: any;
      try {
        saKey = JSON.parse(integration.service_account_key);
        logs.push(log('json_parse', 'ok', `Service Account: ${saKey.client_email || 'email não encontrado'}`));
      } catch {
        logs.push(log('json_parse', 'error', 'Falha ao parsear JSON da Service Account'));
        return new Response(JSON.stringify({ logs }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      try {
        accessToken = await getAccessTokenServiceAccount(saKey);
        logs.push(log('auth', 'ok', 'Access token obtido com sucesso'));
      } catch (e: any) {
        logs.push(log('auth', 'error', `Falha na autenticação: ${e.message}`));
        return new Response(JSON.stringify({ logs }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // List files in folder
    const folderId = integration.drive_folder_id;
    try {
      const driveRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id,name,mimeType)&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!driveRes.ok) {
        const errText = await driveRes.text();
        logs.push(log('drive_list', 'error', `Erro ao listar pasta (${driveRes.status}): ${errText}`));
        return new Response(JSON.stringify({ logs }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const driveData = await driveRes.json();
      const files = driveData.files || [];
      logs.push(log('drive_list', 'ok', `Pasta acessada com sucesso. ${files.length} arquivo(s) encontrado(s).`));

      for (const f of files.slice(0, 5)) {
        logs.push(log('drive_file', 'info', `📄 ${f.name} (${f.mimeType})`));
      }
      if (files.length > 5) {
        logs.push(log('drive_file', 'info', `... e mais ${files.length - 5} arquivo(s)`));
      }

      logs.push(log('result', 'ok', '✅ Conexão testada com sucesso!'));
    } catch (e: any) {
      logs.push(log('drive_list', 'error', `Erro inesperado: ${e.message}`));
    }

    return new Response(JSON.stringify({ logs }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    logs.push(log('error', 'error', `Erro geral: ${e.message}`));
    return new Response(JSON.stringify({ logs }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
