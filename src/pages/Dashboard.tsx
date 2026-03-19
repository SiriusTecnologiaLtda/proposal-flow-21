import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  FileText, TrendingUp, TrendingDown, Target, Clock, Plus,
  SlidersHorizontal, CalendarRange, Users, X, Check, Search, ChevronDown,
  BarChart3, Percent, UserCheck, Trophy,
} from "lucide-react";
import { useProposals, useSalesTeam, useClients } from "@/hooks/useSupabaseData";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RechartsTooltip, Line, ComposedChart } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

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
  pendente: { label: "Pendente", className: "bg-muted text-muted-foreground" },
  proposta_gerada: { label: "Proposta Gerada", className: "bg-primary/15 text-primary" },
  em_assinatura: { label: "Em Assinatura", className: "bg-warning/15 text-warning" },
  ganha: { label: "Ganha", className: "bg-success/15 text-success" },
  cancelada: { label: "Cancelada", className: "bg-destructive/15 text-destructive" },
};

const PERIOD_PRESETS = [
  { label: "Este mês", value: "this_month" },
  { label: "Último mês", value: "last_month" },
  { label: "Este trimestre", value: "this_quarter" },
  { label: "Este ano", value: "this_year" },
  { label: "Personalizado", value: "custom" },
] as const;

function getPresetDates(preset: string): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "this_month":
      return { from: `${y}-${String(m + 1).padStart(2, "0")}-01`, to: "" };
    case "last_month": {
      const lm = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      return {
        from: lm.toISOString().substring(0, 10),
        to: end.toISOString().substring(0, 10),
      };
    }
    case "this_quarter": {
      const qStart = new Date(y, Math.floor(m / 3) * 3, 1);
      return { from: qStart.toISOString().substring(0, 10), to: "" };
    }
    case "this_year":
      return { from: `${y}-01-01`, to: "" };
    default:
      return { from: "", to: "" };
  }
}

function formatCurrency(v: number): string {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
  return `R$ ${v.toFixed(0)}`;
}

// ─── ESN Multi-Select Popover ─────────────────────────────────
function EsnSelector({
  esnMembers,
  selectedIds,
  onChange,
}: {
  esnMembers: any[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = esnMembers.filter(
    (m) =>
      m.code.toLowerCase().includes(search.toLowerCase()) ||
      m.name.toLowerCase().includes(search.toLowerCase())
  );
  const toggle = (id: string) =>
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-9 gap-2 border-dashed text-xs font-normal",
            selectedIds.length > 0 && "border-primary/40 bg-primary/5 text-primary"
          )}
        >
          <Users className="h-3.5 w-3.5" />
          {selectedIds.length === 0
            ? "Todos os ESNs"
            : `${selectedIds.length} ESN${selectedIds.length > 1 ? "s" : ""}`}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar vendedor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
        <div className="max-h-56 overflow-auto p-1">
          {filtered.map((m) => {
            const selected = selectedIds.includes(m.id);
            return (
              <button
                key={m.id}
                onClick={() => toggle(m.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                  selected
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-accent"
                )}
              >
                <div
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30"
                  )}
                >
                  {selected && <Check className="h-2.5 w-2.5" />}
                </div>
                <span className="font-medium">{m.code}</span>
                <span className="truncate text-muted-foreground">{m.name}</span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">Nenhum resultado</p>
          )}
        </div>
        {selectedIds.length > 0 && (
          <div className="border-t border-border p-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full text-xs text-muted-foreground"
              onClick={() => onChange([])}
            >
              <X className="mr-1 h-3 w-3" /> Limpar seleção
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────
function KpiCard({
  icon: Icon,
  label,
  value,
  subValue,
  colorClass,
  bgClass,
  delay = 0,
}: {
  icon: any;
  label: string;
  value: string | number;
  subValue?: string;
  colorClass: string;
  bgClass: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="relative overflow-hidden">
        <div className={cn("absolute inset-0 opacity-[0.04]", bgClass)} />
        <CardContent className="relative p-5">
          <div className={cn("mb-3 inline-flex rounded-lg p-2", bgClass)}>
            <Icon className={cn("h-4 w-4", colorClass)} />
          </div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className={cn("mt-0.5 text-2xl font-bold tracking-tight", colorClass)}>
            {value}
          </p>
          {subValue && (
            <p className="mt-1 text-[11px] text-muted-foreground">{subValue}</p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  const { role } = useUserRole();
  const { data: proposals = [] } = useProposals();
  const { data: salesTeam = [] } = useSalesTeam();
  const { data: clients = [] } = useClients();

  // Get current user's profile to find their sales_team_member_id
  const { data: myProfile } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, sales_team_member_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Filters
  const [periodPreset, setPeriodPreset] = useState("this_year");
  const [dateFrom, setDateFrom] = useState(() => getPresetDates("this_year").from);
  const [dateTo, setDateTo] = useState(() => getPresetDates("this_year").to);
  const [selectedEsnIds, setSelectedEsnIds] = useState<string[]>([]);

  // Fetch sales targets for the selected year
  const targetYear = useMemo(() => {
    if (dateFrom) return Number(dateFrom.substring(0, 4));
    return new Date().getFullYear();
  }, [dateFrom]);

  const { data: salesTargets = [] } = useQuery({
    queryKey: ["sales-targets-dashboard", targetYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_targets")
        .select("*")
        .eq("year", targetYear);
      if (error) throw error;
      return data || [];
    },
  });

  const isAdminOrGsn = role === "admin" || role === "gsn";
  const esnMembers = salesTeam.filter((m) => m.role === "esn");

  const handlePreset = (preset: string) => {
    setPeriodPreset(preset);
    if (preset !== "custom") {
      const { from, to } = getPresetDates(preset);
      setDateFrom(from);
      setDateTo(to);
    }
  };

  // Filter proposals
  const filteredProposals = useMemo(() => {
    return proposals.filter((p: any) => {
      if (selectedEsnIds.length > 0 && !selectedEsnIds.includes(p.esn_id)) return false;
      const status = p.status;
      if (status === "ganha" || status === "cancelada") {
        const closeDate = p.updated_at?.substring(0, 10) || "";
        if (dateFrom && closeDate < dateFrom) return false;
        if (dateTo && closeDate > dateTo) return false;
      } else {
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
  const pendingProposals = filteredProposals.filter((p: any) =>
    p.status === "pendente" || p.status === "proposta_gerada" || p.status === "em_assinatura"
  );

  const wonValue = wonProposals.reduce((s: number, p: any) => s + (computeNetValue(p) || 0), 0);
  const lostValue = lostProposals.reduce((s: number, p: any) => s + (computeNetValue(p) || 0), 0);
  const pendingValue = pendingProposals.reduce((s: number, p: any) => s + (computeNetValue(p) || 0), 0);
  const avgTicket = wonProposals.length > 0 ? wonValue / wonProposals.length : 0;

  const avgLifecycleDays = useMemo(() => {
    if (wonProposals.length === 0) return 0;
    const totalDays = wonProposals.reduce((sum: number, p: any) => {
      const created = new Date(p.created_at).getTime();
      const closed = new Date(p.updated_at).getTime();
      return sum + (closed - created) / (1000 * 60 * 60 * 24);
    }, 0);
    return Math.round(totalDays / wonProposals.length);
  }, [wonProposals]);

  // ─── Performance KPIs (role-based) ───────────────────────────
  const mySalesTeamId = myProfile?.sales_team_member_id || null;
  const mySalesTeamMember = salesTeam.find((m) => m.id === mySalesTeamId);

  const myClients = useMemo(() => {
    if (!mySalesTeamId) {
      if (role === "admin") return clients;
      return [];
    }
    const memberRole = mySalesTeamMember?.role;

    if (memberRole === "esn") {
      return clients.filter((c: any) => c.esn_id === mySalesTeamId);
    }
    if (memberRole === "gsn") {
      const linkedEsnIds = salesTeam
        .filter((m) => m.role === "esn" && m.linked_gsn_id === mySalesTeamId)
        .map((m) => m.id);
      return clients.filter((c: any) => linkedEsnIds.includes(c.esn_id) || c.gsn_id === mySalesTeamId);
    }
    if (memberRole === "arquiteto") {
      // Use filteredProposals so arquiteto client count respects filters
      const clientIdsWithArquiteto = new Set(
        filteredProposals
          .filter((p: any) => p.arquiteto_id === mySalesTeamId)
          .map((p: any) => p.client_id)
      );
      return clients.filter((c: any) => clientIdsWithArquiteto.has(c.id));
    }
    return [];
  }, [mySalesTeamId, mySalesTeamMember, clients, salesTeam, filteredProposals, role]);

  const myClientIds = useMemo(() => new Set(myClients.map((c: any) => c.id)), [myClients]);

  // Penetração: % of my clients that have at least one won proposal (filtered)
  const penetrationRate = useMemo(() => {
    if (myClients.length === 0) return 0;
    const clientsWithWon = new Set(
      filteredProposals
        .filter((p: any) => p.status === "ganha" && myClientIds.has(p.client_id))
        .map((p: any) => p.client_id)
    );
    return (clientsWithWon.size / myClients.length) * 100;
  }, [myClients, filteredProposals, myClientIds]);

  // Taxa de Conversão: won / total filtered proposals
  const conversionRate = useMemo(() => {
    if (filteredProposals.length === 0) return 0;
    const won = filteredProposals.filter((p: any) => p.status === "ganha").length;
    return (won / filteredProposals.length) * 100;
  }, [filteredProposals]);

  // Monthly chart (unfiltered)
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

  const activeFilters =
    (dateFrom || dateTo ? 1 : 0) + (selectedEsnIds.length > 0 ? 1 : 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Visão geral das propostas comerciais
          </p>
        </div>
        <Button asChild>
          <Link to="/propostas/nova">
            <Plus className="mr-2 h-4 w-4" />
            Nova Proposta
          </Link>
        </Button>
      </div>

      {/* ─── Filter Bar ──────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border bg-accent/30 px-4 py-2.5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <SlidersHorizontal className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Filtros</span>
          </div>
          {activeFilters > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
            >
              {activeFilters}
            </motion.span>
          )}
          <div className="flex-1" />
          {activeFilters > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-destructive"
              onClick={() => {
                handlePreset("this_year");
                setSelectedEsnIds([]);
              }}
            >
              <X className="mr-1 h-3 w-3" />
              Limpar tudo
            </Button>
          )}
        </div>

        <CardContent className="p-4">
          <div className="flex flex-wrap items-start gap-4">
            {/* Period */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <CalendarRange className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium uppercase tracking-wider">Período</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PERIOD_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => handlePreset(p.value)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-all",
                      periodPreset === p.value
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <AnimatePresence>
                {periodPreset === "custom" && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center gap-2 pt-1">
                      <Input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="h-8 w-36 text-xs"
                      />
                      <span className="text-xs text-muted-foreground">até</span>
                      <Input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="h-8 w-36 text-xs"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Divider */}
            {isAdminOrGsn && (
              <div className="hidden h-16 w-px self-center bg-border md:block" />
            )}

            {/* ESN Selector */}
            {isAdminOrGsn && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium uppercase tracking-wider">Vendedor</span>
                </div>
                <EsnSelector
                  esnMembers={esnMembers}
                  selectedIds={selectedEsnIds}
                  onChange={setSelectedEsnIds}
                />
                {/* Selected chips */}
                <AnimatePresence>
                  {selectedEsnIds.length > 0 && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="flex flex-wrap gap-1 overflow-hidden"
                    >
                      {selectedEsnIds.map((id) => {
                        const m = esnMembers.find((e) => e.id === id);
                        return (
                          <motion.span
                            key={id}
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary"
                          >
                            {m?.code}
                            <button
                              onClick={() =>
                                setSelectedEsnIds((prev) => prev.filter((x) => x !== id))
                              }
                              className="rounded-full p-0.5 hover:bg-primary/10"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </motion.span>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─── Tabs ────────────────────────────────────────────── */}
      <Tabs defaultValue="propostas" className="space-y-6">
        <TabsList>
          <TabsTrigger value="propostas">Propostas</TabsTrigger>
          <TabsTrigger value="resultado">Resultado</TabsTrigger>
          <TabsTrigger value="performance">Indicadores de Performance</TabsTrigger>
        </TabsList>

        {/* ═══ TAB: Propostas ═══ */}
        <TabsContent value="propostas" className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              icon={TrendingUp}
              label="Propostas Ganhas"
              value={wonProposals.length}
              colorClass="text-success"
              bgClass="bg-success/15"
              delay={0}
            />
            <KpiCard
              icon={Target}
              label="Valor Ganho"
              value={formatCurrency(wonValue)}
              colorClass="text-success"
              bgClass="bg-success/15"
              delay={0.05}
            />
            <KpiCard
              icon={TrendingDown}
              label="Propostas Perdidas"
              value={lostProposals.length}
              colorClass="text-destructive"
              bgClass="bg-destructive/15"
              delay={0.1}
            />
            <KpiCard
              icon={Target}
              label="Valor Perdido"
              value={formatCurrency(lostValue)}
              colorClass="text-destructive"
              bgClass="bg-destructive/15"
              delay={0.15}
            />
            <KpiCard
              icon={FileText}
              label="Propostas Pendentes"
              value={pendingProposals.length}
              colorClass="text-warning"
              bgClass="bg-warning/15"
              delay={0.2}
            />
            <KpiCard
              icon={Target}
              label="Valor Pendente"
              value={formatCurrency(pendingValue)}
              colorClass="text-warning"
              bgClass="bg-warning/15"
              delay={0.25}
            />
          </div>

          {/* Monthly Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Ganhas vs Perdidas — Últimos 12 Meses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[280px] w-full">
                <BarChart data={monthlyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  />
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
                const status = statusMap[proposal.status] || statusMap.pendente;
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
        </TabsContent>

        {/* ═══ TAB: Indicadores de Performance ═══ */}
        <TabsContent value="performance" className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
            <KpiCard
              icon={Users}
              label="Quantidade de Clientes"
              value={myClients.length}
              subValue={
                role === "admin"
                  ? "todos os clientes"
                  : mySalesTeamMember
                  ? `clientes do ${mySalesTeamMember.role?.toUpperCase()}`
                  : "vincule seu perfil ao time de vendas"
              }
              colorClass="text-primary"
              bgClass="bg-primary/15"
              delay={0}
            />
            <KpiCard
              icon={Percent}
              label="Penetração"
              value={`${penetrationRate.toFixed(1)}%`}
              subValue="clientes com proposta ganha"
              colorClass="text-success"
              bgClass="bg-success/15"
              delay={0.05}
            />
            <KpiCard
              icon={UserCheck}
              label="Taxa de Conversão"
              value={`${conversionRate.toFixed(1)}%`}
              subValue="ganhas / total de propostas"
              colorClass="text-primary"
              bgClass="bg-primary/15"
              delay={0.1}
            />
            <KpiCard
              icon={BarChart3}
              label="Ticket Médio"
              value={formatCurrency(avgTicket)}
              subValue="por proposta ganha"
              colorClass="text-primary"
              bgClass="bg-primary/15"
              delay={0.15}
            />
            <KpiCard
              icon={Clock}
              label="Tempo Médio"
              value={`${avgLifecycleDays}d`}
              subValue="abertura → ganho"
              colorClass="text-warning"
              bgClass="bg-warning/15"
              delay={0.2}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
