import { useNavigate } from "react-router-dom";
import { Settings, ChevronRight, FolderOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const cards = [
    { title: "Usuários e Acessos", desc: "Gerenciar usuários e permissões da plataforma", action: () => toast({ title: "Em breve", description: "Módulo de gestão de usuários será implementado em breve." }) },
    { title: "Integrações / APIs", desc: "Configurar APIs externas para sincronizar Clientes e Time de Vendas", action: () => toast({ title: "Em breve", description: "Módulo de integrações será implementado em breve." }) },
    { title: "Dados da Unidade", desc: "Informações da unidade TOTVS Leste (CNPJ, endereço, etc.)", action: () => navigate("/unidades") },
    { title: "Parâmetros Padrão de Proposta", desc: "Valores padrão de hora, GP, traslado e taxas carregados em novas propostas", action: () => navigate("/configuracoes/parametros"), icon: Settings },
    { title: "Google Drive / Docs", desc: "Configurar credenciais de acesso ao Google Drive e Docs para geração de propostas", action: () => navigate("/configuracoes/google"), icon: FolderOpen },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie acessos, APIs e parâmetros do sistema</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((item) => (
          <div key={item.title} onClick={item.action} className="cursor-pointer rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/50">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-muted-foreground">
                <Settings className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
