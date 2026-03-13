import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie acessos, APIs e parâmetros do sistema</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {[
          { title: "Usuários e Acessos", desc: "Gerenciar usuários e permissões da plataforma" },
          { title: "Integrações / APIs", desc: "Configurar APIs externas para sincronizar Clientes e Time de Vendas" },
          { title: "Parâmetros de Proposta", desc: "Valores padrão de hora, impostos e percentuais" },
          { title: "Dados da Unidade", desc: "Informações da unidade TOTVS Leste (CNPJ, endereço, etc.)" },
        ].map((item) => (
          <div key={item.title} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-muted-foreground">
                <Settings className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
