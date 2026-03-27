import { useNavigate } from "react-router-dom";
import { ShieldCheck, Users, UsersRound, ChevronRight } from "lucide-react";

const cards = [
  {
    title: "Usuários Cadastrados",
    description: "Gerencie perfis de acesso, unidades e vínculos dos usuários",
    icon: Users,
    path: "/configuracoes/usuarios/cadastrados",
  },
  {
    title: "Grupos de Usuários",
    description: "Organize usuários em grupos com perfil e unidades compartilhadas",
    icon: UsersRound,
    path: "/configuracoes/usuarios/grupos",
  },
  {
    title: "Permissões por Perfil",
    description: "Gerencie os recursos que cada perfil pode acessar",
    icon: ShieldCheck,
    path: "/configuracoes/usuarios/permissoes",
  },
];

export default function UserManagementPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Usuários e Acessos</h1>
        <p className="text-sm text-muted-foreground">Gerencie perfis, grupos e permissões de acesso</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.path}
            onClick={() => navigate(card.path)}
            className="group cursor-pointer rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                <card.icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{card.title}</p>
                <p className="text-xs text-muted-foreground">{card.description}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
