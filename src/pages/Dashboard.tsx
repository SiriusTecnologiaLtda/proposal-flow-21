import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { FileText, TrendingUp, TrendingDown, Target, Clock, Plus, Filter } from "lucide-react";
import { useProposals, useClients, useSalesTeam } from "@/hooks/useSupabaseData";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend } from "recharts";

function roundUp8(val: number): number {
  return Math.ceil(val / 8) * 8;
}

function computeNetValue(proposal: any): number | null {
  const scopeItems = proposal.proposal_scope_items;
  if (!scopeItems || scopeItems.length === 0) return null;
  const totalHours = roundUp8(
    scopeItems
      .filter((item: any) => item.included && item.parent_id)
      .reduce((sum: number, item: any) => sum + (item.hours || 0), 0)
  );
  const gpHours = roundUp8(Math.ceil(totalHours * (proposal.gp_percentage / 100)));
  return (totalHours + gpHours) * proposal.hourly_rate;
}

const statusMap: Record<string, { label: string; className: string }> = {
  rascunho: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  em_revisao: { label: "Em Revisão", className: "bg-warning/15 text-warning" },
  aprovada: { label: "Aprovada", className: "bg-success/15 text-success" },
  enviada: { label: "Enviada", className: "bg-primary/15 text-primary" },
  ganha: { label: "Ganha", className: "bg-success/15 text-success" },
  cancelada: { label: "Cancelada", className: "bg-destructive/15 text-destructive" },
};

export default function Dashboard() {
  const { user } = useAuth();
  const { role } = useUserRole();
  const { data: proposals = [] } = useProposals();
  const { data: clients = [] } = useClients();
  const { data: salesTeam = [] } = useSalesTeam();

  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedEsnIds, setSelectedEsnIds] = useState<string[]>([]);

  const isAdminOrGsn = role === "admin" || role === "gsn";
  const esnMembers = salesTeam.filter((m) => m.role === "esn");

  // Filter proposals by period and ESN
  const filteredProposals = useMemo(() => {
    return proposals.filter((p: any) => {
      // ESN filter
      if (selectedEsnIds.length > 0 && !selectedEsnIds.includes(p.esn_id)) return false;

      const status = p.status;
      if (status === "ganha" || status === "cancelada") {
        // Use updated_at as proxy for close date
        const closeDate = p.updated_at?.substring(0, 10) || "";
        if (dateFrom && closeDate < dateFrom) return false;
        if (dateTo && closeDate > dateTo) return false;
      } else {
        // Open proposals: use expected_close_date
        const expectedDate = p.expected_close_date || "";
        if (dateFrom && expectedDate && expectedDate < dateFrom) return false;
        if (dateTo && expectedDate && expectedDate > dateTo) return false;
      }
      return true;
    });
  }, [proposals, dateFrom, dateTo, selectedEsnIds]);

  // KPIs
  const wonProposals = filteredProposals.filter((p: any) => p.status === "ganha");
  const lostProposals = filteredProposals.filter((p: any) => p.status === "cancelada");
  const openProposals = filteredProposals.filter((p: any) => !["ganha", "cancelada"].includes(p.status));

  const wonValue = wonProposals.reduce((s: number, p: any) => s + (computeNetValue(p) || 0), 0);
  const lostValue = lostProposals.reduce((s: number, p: any) => s + (computeNetValue(p) || 0), 0);
  const avgTicket = wonProposals.length > 0 ? wonValue / wonProposals.length : 0;

  // Average lifecycle (days between created_at and updated_at for won)
  const avgLifecycleDays = useMemo(() => {
    if (wonProposals.length === 0) return 0;
    const totalDays = wonProposals.reduce((sum: number, p: any) => {
      const created = new Date(p.created_at).getTime();
      const closed = new Date(p.updated_at).getTime();
      return sum + (closed - created) / (1000 * 60 * 60 * 24);
    }, 0);
    return Math.round(totalDays / wonProposals.length);
  }, [wonProposals]);

  // Monthly chart data (last 12 months, unfiltered by period/ESN)
  const monthlyData = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string; ganhas: number; perdidas: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
      months.push({ key, label, ganhas: 0, perdidas: 0 });
    }
    for (const p of proposals as any[]) {
      const closeMonth = (p.updated_at || "").substring(0, 7);
      const bucket = months.find((m) => m.key === closeMonth);
      if (!bucket) continue;
      if (p.status === "ganha") bucket.ganhas++;
      if (p.status === "cancelada") bucket.perdidas++;
    }
    return months;
  }, [proposals]);

  const chartConfig = {
    ganhas: { label: "Ganhas", color: "hsl(var(--success))" },
    perdidas: { label: "Perdidas", color: "hsl(var(--destructive))" },
  };

  const formatCurrency = (v: number) =>
    v >= 1000 ? `R$ ${(v / 1000).toFixed(0)}k` : `R$ ${v.toFixed(0)}`;

  const toggleEsn = (id: string) => {
    setSelectedEsnIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
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

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Filtros</span>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">De</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Até</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
          </div>
          {isAdminOrGsn && (
            <div className="space-y-1">
              <Label className="text-xs">Vendedor (ESN)</Label>
              <div className="flex flex-wrap gap-1.5 rounded-md border border-input bg-background p-2 min-w-[200px] max-w-md">
                {esnMembers.map((m) => (
                  <Badge
                    key={m.id}
                    variant={selectedEsnIds.includes(m.id) ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => toggleEsn(m.id)}
                  >
                    {m.code}
                  </Badge>
                ))}
                {selectedEsnIds.length > 0 && (
                  <Badge variant="secondary" className="cursor-pointer text-xs" onClick={() => setSelectedEsnIds([])}>
                    Limpar
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-success/15 p-2 text-success">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ganhas</p>
                <p className="text-lg font-semibold text-foreground">{wonProposals.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-success/15 p-2 text-success">
                <Target className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Valor Ganho</p>
                <p className="text-lg font-semibold text-foreground">{formatCurrency(wonValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-destructive/15 p-2 text-destructive">
                <TrendingDown className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Perdidas</p>
                <p className="text-lg font-semibold text-foreground">{lostProposals.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-destructive/15 p-2 text-destructive">
                <Target className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Valor Perdido</p>
                <p className="text-lg font-semibold text-foreground">{formatCurrency(lostValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-primary/15 p-2 text-primary">
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ticket Médio</p>
                <p className="text-lg font-semibold text-foreground">{formatCurrency(avgTicket)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-warning/15 p-2 text-warning">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tempo Médio</p>
                <p className="text-lg font-semibold text-foreground">{avgLifecycleDays}d</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Ganhas vs Perdidas — Últimos 12 Meses</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[280px] w-full">
            <BarChart data={monthlyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Legend />
              <Bar dataKey="ganhas" name="Ganhas" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="perdidas" name="Perdidas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Recent Proposals */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm font-semibold">Propostas Recentes</CardTitle>
        </CardHeader>
        <div className="divide-y divide-border">
          {proposals.slice(0, 10).map((proposal: any) => {
            const status = statusMap[proposal.status] || statusMap.rascunho;
            const clientName = proposal.clients?.name || "—";
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
                    <p className="text-xs text-muted-foreground">{clientName}</p>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
                  {status.label}
                </span>
              </Link>
            );
          })}
          {proposals.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhuma proposta ainda. Crie sua primeira proposta!
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
