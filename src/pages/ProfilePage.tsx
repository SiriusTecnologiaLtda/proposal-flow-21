import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Save, Loader2, Mail, Phone, User, Camera, CheckCircle2, XCircle, RefreshCw,
} from "lucide-react";

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: googleInt } = useQuery({
    queryKey: ["google-int-oauth-ids"],
    queryFn: async () => {
      const { data } = await supabase
        .from("google_integrations")
        .select("oauth_client_id")
        .eq("is_default", true)
        .single();
      return data;
    },
  });

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || "");
      setPhone((profile as any).phone || "");
      setAvatarUrl((profile as any).avatar_url || "");
    }
  }, [profile]);

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const updates: any = {
        display_name: displayName,
        phone,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("user_id", user.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      toast({ title: "Perfil atualizado com sucesso" });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleGmailAuth = useCallback(() => {
    if (!googleInt?.oauth_client_id) {
      toast({ title: "Configuração OAuth não encontrada", variant: "destructive" });
      return;
    }
    setAuthorizing(true);

    const redirectUri = `${window.location.origin}/oauth/google/callback`;
    const state = btoa(JSON.stringify({ flow: "user-gmail", openerOrigin: window.location.origin }));
    const scope = "https://www.googleapis.com/auth/gmail.send";

    const url =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(googleInt.oauth_client_id)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scope)}` +
      `&access_type=offline` +
      `&prompt=consent` +
      `&state=${encodeURIComponent(state)}`;

    const popup = window.open(url, "gmail-auth", "width=500,height=600");

    const handler = async (event: MessageEvent) => {
      if (event.data?.type !== "google-oauth-callback" || event.data?.flow !== "user-gmail") return;
      window.removeEventListener("message", handler);

      if (event.data.error) {
        toast({ title: "Autorização cancelada", variant: "destructive" });
        setAuthorizing(false);
        return;
      }

      try {
        const { data: fnData, error: fnError } = await supabase.functions.invoke(
          "user-gmail-oauth-exchange",
          { body: { code: event.data.code, redirectUri } }
        );
        if (fnError) throw fnError;
        if (fnData?.error) throw new Error(fnData.error);

        toast({ title: "Email autorizado", description: `Remetente: ${fnData.email}` });
        queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      } catch (err: any) {
        toast({ title: "Erro na autorização", description: err.message, variant: "destructive" });
      } finally {
        setAuthorizing(false);
      }
    };

    window.addEventListener("message", handler);

    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed);
        setAuthorizing(false);
      }
    }, 1000);
  }, [googleInt, toast, queryClient]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    const ext = file.name.split(".").pop();
    const path = `avatars/${user.id}.${ext}`;

    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (upErr) {
      toast({ title: "Erro no upload", description: upErr.message, variant: "destructive" });
      return;
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    setAvatarUrl(urlData.publicUrl + `?t=${Date.now()}`);
    toast({ title: "Foto carregada. Clique em Salvar para confirmar." });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const initials = (displayName || user?.email || "U").substring(0, 2).toUpperCase();
  const gmailAuthorized = !!profile?.gmail_refresh_token;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-semibold text-foreground">Meu Perfil</h1>
      </div>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            Informações Pessoais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-20 w-20">
                <AvatarImage src={avatarUrl || undefined} />
                <AvatarFallback className="text-lg bg-primary/10 text-primary">{initials}</AvatarFallback>
              </Avatar>
              <label
                htmlFor="avatar-upload"
                className="absolute -bottom-1 -right-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
              >
                <Camera className="h-3.5 w-3.5" />
              </label>
              <input id="avatar-upload" type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </div>
            <div>
              <p className="font-medium text-foreground">{displayName || user?.email}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="displayName">Nome de exibição</Label>
              <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="phone" className="pl-9" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Gmail Authorization Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Autorização de Envio de Email
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div className="flex items-center gap-3">
              {gmailAuthorized ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-destructive" />
              )}
              <div>
                <p className="text-sm font-medium text-foreground">
                  {gmailAuthorized ? "Autorizado" : "Não autorizado"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {gmailAuthorized
                    ? `Emails serão enviados como ${profile?.gmail_sender_email || user?.email}`
                    : "Autorize para enviar emails em seu nome"}
                </p>
              </div>
            </div>
            <Button
              variant={gmailAuthorized ? "outline" : "default"}
              size="sm"
              onClick={handleGmailAuth}
              disabled={authorizing}
            >
              {authorizing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : gmailAuthorized ? (
                <RefreshCw className="mr-2 h-4 w-4" />
              ) : (
                <Mail className="mr-2 h-4 w-4" />
              )}
              {gmailAuthorized ? "Re-autorizar" : "Autorizar"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Esta autorização permite que o sistema envie notificações de propostas utilizando sua conta de email corporativa como remetente.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
