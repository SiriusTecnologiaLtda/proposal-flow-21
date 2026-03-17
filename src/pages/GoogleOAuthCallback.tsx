import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

export default function GoogleOAuthCallback() {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (window.opener) {
      // Send data to parent window and close
      window.opener.postMessage(
        { type: "google-oauth-callback", code, state, error },
        window.location.origin
      );
      window.close();
    } else {
      // If opened directly (not popup), redirect to main page with params
      const params = new URLSearchParams();
      if (code) params.set("code", code);
      if (state) params.set("state", state);
      if (error) params.set("error", error);
      window.location.href = `/configuracoes/google?${params.toString()}`;
    }
  }, [searchParams]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <p className="text-sm text-muted-foreground">Processando autorização...</p>
      </div>
    </div>
  );
}
