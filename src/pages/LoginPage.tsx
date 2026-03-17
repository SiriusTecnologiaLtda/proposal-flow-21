import { useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

export default function LoginPage() {
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isForgot, setIsForgot] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isForgot) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setLoading(false);
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "E-mail enviado", description: "Verifique sua caixa de entrada para redefinir a senha." });
        setIsForgot(false);
      }
      return;
    }

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: window.location.origin,
        },
      });
      setLoading(false);
      if (error) {
        toast({ title: "Erro no cadastro", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Conta criada!", description: "Verifique seu e-mail para confirmar o cadastro." });
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        toast({ title: "Erro no login", description: error.message, variant: "destructive" });
      }
    }
  };

  if (!authLoading && user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">TOTVS Leste</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isForgot ? "Recuperar senha" : isSignUp ? "Criar conta" : "Acesse sua conta"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-card p-6">
          {isSignUp && (
            <div className="space-y-1.5">
              <Label className="text-xs">Nome</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Seu nome completo"
                required
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">E-mail</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
            />
          </div>
          {!isForgot && (
            <div className="space-y-1.5">
              <Label className="text-xs">Senha</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading
              ? "Aguarde..."
              : isForgot
              ? "Enviar link"
              : isSignUp
              ? "Criar conta"
              : "Entrar"}
          </Button>

          <div className="flex flex-col gap-1 text-center text-xs text-muted-foreground">
            {!isForgot && (
              <button type="button" onClick={() => setIsForgot(true)} className="hover:text-foreground">
                Esqueceu a senha?
              </button>
            )}
            <button
              type="button"
              onClick={() => { setIsSignUp(!isSignUp); setIsForgot(false); }}
              className="hover:text-foreground"
            >
              {isSignUp ? "Já tem conta? Entrar" : "Não tem conta? Cadastre-se"}
            </button>
            {isForgot && (
              <button type="button" onClick={() => setIsForgot(false)} className="hover:text-foreground">
                Voltar ao login
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
