import { Link } from "react-router-dom";
import { FileText, Users, TrendingUp, Clock, Plus } from "lucide-react";
import { mockProposals, mockClients } from "@/data/mockData";
import { Button } from "@/components/ui/button";

const statusMap: Record<string, { label: string; className: string }> = {
  rascunho: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  em_revisao: { label: "Em Revisão", className: "bg-warning/15 text-warning" },
  aprovada: { label: "Aprovada", className: "bg-success/15 text-success" },
  enviada: { label: "Enviada", className: "bg-primary/15 text-primary" },
};

export default function Dashboard() {
  const totalValue = mockProposals.reduce((s, p) => s + p.totalValue, 0);
  const totalHours = mockProposals.reduce((s, p) => s + p.totalHours, 0);

  const stats = [
    { label: "Propostas", value: mockProposals.length, icon: FileText, color: "text-primary" },
    { label: "Clientes", value: mockClients.length, icon: Users, color: "text-success" },
    { label: "Valor Total", value: `R$ ${(totalValue / 1000).toFixed(0)}k`, icon: TrendingUp, color: "text-warning" },
    { label: "Horas Estimadas", value: totalHours.toLocaleString("pt-BR"), icon: Clock, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral das propostas comerciais</p>
        </div>
        <Button asChild>
          <Link to="/propostas/nova">
            <Plus className="mr-2 h-4 w-4" />
            Nova Proposta
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className={`rounded-md bg-accent p-2 ${stat.color}`}>
                <stat.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-lg font-semibold text-foreground">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent proposals */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Propostas Recentes</h2>
        </div>
        <div className="divide-y divide-border">
          {mockProposals.map((proposal) => {
            const status = statusMap[proposal.status];
            return (
              <Link
                key={proposal.id}
                to={`/propostas/${proposal.id}`}
                className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-accent/50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{proposal.number}</p>
                    <p className="text-xs text-muted-foreground">{proposal.clientName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="hidden text-right md:block">
                    <p className="text-sm font-medium text-foreground">
                      R$ {proposal.totalValue.toLocaleString("pt-BR")}
                    </p>
                    <p className="text-xs text-muted-foreground">{proposal.totalHours}h</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
                    {status.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
