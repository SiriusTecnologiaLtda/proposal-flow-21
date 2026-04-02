import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

function decodeOAuthState(rawState: string | null) {
  if (!rawState) return null;

  try {
    const parsed = JSON.parse(atob(rawState));
    return {
      integrationId: typeof parsed?.integrationId === "string" ? parsed.integrationId : undefined,
      flow: typeof parsed?.flow === "string" ? parsed.flow : "integration",
      openerOrigin:
        typeof parsed?.openerOrigin === "string"
          ? parsed.openerOrigin
          : window.location.origin,
    };
  } catch {
    // Legacy plain-text state support
  }

  return {
    integrationId: rawState,
    flow: "integration",
    openerOrigin: window.location.origin,
  };
}

export default function GoogleOAuthCallback() {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const rawState = searchParams.get("state");
    const decodedState = decodeOAuthState(rawState);
    const openerOrigin = decodedState?.openerOrigin ?? window.location.origin;
    const integrationId = decodedState?.integrationId ?? rawState;
    const flow = decodedState?.flow ?? "integration";

    if (window.opener) {
      window.opener.postMessage(
        { type: "google-oauth-callback", code, state: integrationId, error, flow },
        openerOrigin
      );
      window.close();
      return;
    }

    const params = new URLSearchParams();
    if (code) params.set("code", code);
    if (integrationId) params.set("state", integrationId);
    if (error) params.set("error", error);
    if (flow) params.set("flow", flow);
    const targetPath = flow === "email-inbox" ? "/configuracoes/email-inbox" : "/configuracoes/google";
    window.location.href = `${openerOrigin}${targetPath}?${params.toString()}`;
  }, [searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="space-y-3 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Processando autorização...</p>
      </div>
    </div>
  );
}
