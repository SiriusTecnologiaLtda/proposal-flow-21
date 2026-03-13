import { Link } from "react-router-dom";
import { Plus, Search, FileText, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { mockProposals } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const statusMap: Record<string, { label: string; className: string }> = {
  rascunho: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  em_revisao: { label: "Em Revisão", className: "bg-warning/15 text-warning" },
  aprovada: { label: "Aprovada", className: "bg-success/15 text-success" },
  enviada: { label: "Enviada", className: "bg-primary/15 text-primary" },
};

const typeMap: Record<string, string> = {
  projeto: "Projeto",
  banco_de_horas: "Banco de Horas",
};

export default function ProposalsList() {
  const [search, setSearch] = useState("");
  const filtered = mockProposals.filter(
    (p) =>
      p.number.toLowerCase().includes(search.toLowerCase()) ||
      p.clientName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Propostas</h1>
          <p className="text-sm text-muted-foreground">{mockProposals.length} propostas cadastradas</p>
        </div>
        <Button asChild>
          <Link to="/propostas/nova">
            <Plus className="mr-2 h-4 w-4" />
            Nova Proposta
          </Link>
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por número ou cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Header */}
        <div className="hidden border-b border-border bg-muted/50 px-4 py-2.5 md:grid md:grid-cols-6 md:gap-4">
          <span className="text-xs font-medium text-muted-foreground col-span-2">Proposta / Cliente</span>
          <span className="text-xs font-medium text-muted-foreground">Tipo</span>
          <span className="text-xs font-medium text-muted-foreground">Produto</span>
          <span className="text-xs font-medium text-muted-foreground text-right">Valor</span>
          <span className="text-xs font-medium text-muted-foreground text-right">Status</span>
        </div>

        <div className="divide-y divide-border">
          {filtered.map((p) => {
            const status = statusMap[p.status];
            return (
              <Link
                key={p.id}
                to={`/propostas/${p.id}`}
                className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-accent/50 md:grid md:grid-cols-6 md:items-center md:gap-4"
              >
                <div className="col-span-2 flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <FileText className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{p.number}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.clientName}</p>
                  </div>
                </div>
                <p className="text-sm text-foreground">{typeMap[p.type]}</p>
                <p className="text-sm text-foreground">{p.product}</p>
                <p className="text-sm font-medium text-foreground text-right">
                  R$ {p.totalValue.toLocaleString("pt-BR")}
                </p>
                <div className="text-right">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
                    {status.label}
                  </span>
                </div>
              </Link>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhuma proposta encontrada.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
