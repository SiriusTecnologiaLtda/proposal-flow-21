import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, ShieldCheck, Users } from "lucide-react";

const cards = [
  {
    title: "Permissões por Perfil",
    description: "Gerencie os recursos que cada perfil pode acessar",
    icon: ShieldCheck,
    path: "/configuracoes/usuarios/permissoes",
  },
  {
    title: "Usuários Cadastrados",
    description: "Gerencie perfis de acesso dos usuários",
    icon: Users,
    path: "/configuracoes/usuarios/cadastrados",
  },
];

export default function UserManagementPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/configuracoes")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Usuários e Acessos</h1>
          <p className="text-sm text-muted-foreground">Gerencie perfis e permissões de acesso</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Card
            key={card.path}
            className="cursor-pointer transition-colors hover:border-primary/40"
            onClick={() => navigate(card.path)}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <card.icon className="h-4 w-4 text-primary" />
                {card.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
