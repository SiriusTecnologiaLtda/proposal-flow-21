import { useNavigate } from "react-router-dom";
import { Users, Building, UserCog, Package, Tag, FileText, ChevronRight } from "lucide-react";

const cards = [
  { title: "Clientes", desc: "Gerenciar cadastro de clientes", path: "/cadastros/clientes", icon: Users },
  { title: "Unidades", desc: "Unidades TOTVS (CNPJ, endereço, fator imposto)", path: "/cadastros/unidades", icon: Building },
  { title: "Time de Vendas", desc: "ESN, GSN e Arquitetos", path: "/cadastros/time", icon: UserCog },
  { title: "Produtos", desc: "Produtos disponíveis para templates e propostas", path: "/cadastros/produtos", icon: Package },
  { title: "Categorias", desc: "Categorias de escopo para templates", path: "/cadastros/categorias", icon: Tag },
  { title: "Tipos de Proposta", desc: "Tipos e templates Google Docs vinculados", path: "/cadastros/tipos-proposta", icon: FileText },
];

export default function CadastrosPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Cadastros</h1>
        <p className="text-sm text-muted-foreground">Gerencie os cadastros base do sistema</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((item) => (
          <div
            key={item.title}
            onClick={() => navigate(item.path)}
            className="group cursor-pointer rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                <item.icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
