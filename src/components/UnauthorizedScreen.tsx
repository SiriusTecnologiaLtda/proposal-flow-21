import { ShieldX } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

export default function UnauthorizedScreen() {
  const { signOut, user } = useAuth();

  return (
    <div className="flex h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md text-center space-y-4">
        <ShieldX className="h-12 w-12 text-destructive mx-auto" />
        <h1 className="text-xl font-semibold text-foreground">Acesso não autorizado</h1>
        <p className="text-sm text-muted-foreground">
          O e-mail <span className="font-medium text-foreground">{user?.email}</span> não está
          cadastrado no Time de Vendas e não possui um perfil de acesso atribuído.
        </p>
        <p className="text-sm text-muted-foreground">
          Entre em contato com o administrador do sistema para solicitar permissão de acesso.
        </p>
        <Button variant="outline" onClick={signOut}>
          Sair
        </Button>
      </div>
    </div>
  );
}
