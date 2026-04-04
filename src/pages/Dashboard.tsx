import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  FileText, TrendingUp, TrendingDown, Target, Clock, Plus,
  SlidersHorizontal, CalendarRange, Users, X, Check, Search, ChevronDown,
  BarChart3, Percent, UserCheck, Trophy, DollarSign, Building2,
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
import { UnifiedRevenueTab } from "@/components/dashboard/UnifiedRevenueTab";

function computeNetValue(proposal: any): number | null {
  const serviceItems = proposal.proposal_service_items;
  if (!serviceItems || serviceItems.length === 0) return null;
  return serviceItems.reduce((sum: number, item: any) =>
    sum + (Number(item.calculated_hours) * Number(item.hourly_rate)), 0);
}

const statusMap: Record<string, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "bg-muted text-muted-foreground" },
  proposta_gerada: { label: "Pendente", className: "bg-muted text-muted-foreground" },
  em_analise_ev: { label: "Em Revisão", className: "bg-warning/15 text-warning" },
  analise_ev_concluida: { label: "Revisado", className: "bg-success/15 text-success" },
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
  const k = v / 1000;
  return `${k.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}K`;
}

// ─── Role Filter Selector ─────────────────────────────────────
const ALL_ROLE_OPTIONS = [
  { value: "dsn", label: "DSN" },
  { value: "gsn", label: "GSN" },
  { value: "esn", label: "ESN" },
] as const;

function RoleSelector({
  selectedRole,
  onChange,
  allowedRoles,
}: {
  selectedRole: string;
  onChange: (role: string) => void;
  allowedRoles: string[];
}) {
  const visibleOptions = ALL_ROLE_OPTIONS.filter((r) => allowedRoles.includes(r.value));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-9 gap-2 border-dashed text-xs font-normal",
            selectedRole !== "all" && "border-primary/40 bg-primary/5 text-primary"
          )}
        >
          <Users className="h-3.5 w-3.5" />
          {selectedRole === "all"
            ? "Todos os Níveis"
            : ALL_ROLE_OPTIONS.find((r) => r.value === selectedRole)?.label || selectedRole.toUpperCase()}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="start">
        <button
          onClick={() => onChange("all")}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
            selectedRole === "all"
              ? "bg-primary/10 text-primary font-medium"
              : "text-foreground hover:bg-accent"
          )}
        >
          Todos os Níveis
        </button>
        {visibleOptions.map((r) => (
          <button
            key={r.value}
            onClick={() => onChange(r.value)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
              selectedRole === r.value
                ? "bg-primary/10 text-primary font-medium"
                : "text-foreground hover:bg-accent"
            )}
          >
            {r.label}
          </button>
        ))}
        {selectedRole !== "all" && (
          <div className="border-t border-border mt-1 pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full text-xs text-muted-foreground"
              onClick={() => onChange("all")}
            >
              <X className="mr-1 h-3 w-3" /> Limpar
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
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate">
            {label}
          </p>
          <p className={cn("mt-0.5 text-2xl font-bold tracking-tight truncate", colorClass)}>
            {value}
          </p>
          {subValue && (
            <p className="mt-1 text-[11px] text-muted-foreground truncate">{subValue}</p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Top 10 Proposals ─────────────────────────────────────────
function Top10Proposals({
  proposals,
  computeNetValue: calcValue,
  statusMap: sMap,
}: {
  proposals: any[];
  computeNetValue: (p: any) => number | null;
  statusMap: Record<string, { label: string; className: string }>;
}) {
  const [mode, setMode] = useState<"aberto" | "realizado">("aberto");

  const top10 = useMemo(() => {
    const filtered =
      mode === "aberto"
        ? proposals.filter(
            (p: any) =>
              p.status === "pendente" ||
              p.status === "proposta_gerada" ||
              p.status === "em_assinatura"
          )
        : proposals.filter((p: any) => p.status === "ganha");

    return filtered
      .map((p: any) => ({ ...p, _value: calcValue(p) || 0 }))
      .sort((a: any, b: any) => b._value - a._value)
      .slice(0, 10);
  }, [proposals, mode, calcValue]);

  const medalColors = [
    "from-yellow-400 to-amber-500",   // 🥇
    "from-slate-300 to-slate-400",     // 🥈
    "from-amber-600 to-amber-700",     // 🥉
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-semibold">
            Top 10 — {mode === "aberto" ? "Em Aberto" : "Realizadas"}
          </CardTitle>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setMode("aberto")}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-all",
              mode === "aberto"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            Em Aberto
          </button>
          <button
            onClick={() => setMode("realizado")}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-all",
              mode === "realizado"
                ? "border-success bg-success text-success-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            Realizadas
          </button>
        </div>
      </CardHeader>
      <div className="divide-y divide-border/50">
        {top10.map((proposal: any, i: number) => {
          const status = sMap[proposal.status] || sMap.pendente;
          const clientName = proposal.clients?.name || "—";
          const esnName = proposal.sales_team?.name || "";
          const isTop3 = i < 3;
          return (
            <motion.div
              key={proposal.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Link
                to={`/propostas/${proposal.id}`}
                className={cn(
                  "flex items-center justify-between gap-3 px-4 py-3.5 transition-all hover:bg-accent/50 group",
                  isTop3 && "bg-accent/20"
                )}
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <span className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                    isTop3
                      ? `bg-gradient-to-br ${medalColors[i]} text-white shadow-sm`
                      : "bg-muted text-muted-foreground"
                  )}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {clientName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {proposal.number}{esnName ? ` · ${esnName}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={cn(
                    "text-sm font-bold tabular-nums whitespace-nowrap",
                    isTop3 ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {formatCurrency(proposal._value)}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${status.className}`}>
                    {status.label}
                  </span>
                </div>
              </Link>
            </motion.div>
          );
        })}
        {top10.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            Nenhuma proposta encontrada para os filtros selecionados.
          </div>
        )}
      </div>
    </Card>
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
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("all");
  const [selectedUnitId, setSelectedUnitId] = useState<string>("all");

  // Fetch units for filter
  const { data: units = [] } = useQuery({
    queryKey: ["units-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase.from("unit_info").select("id, name").order("name");
      if (error) throw error;
      return data || [];
    },
  });

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

  // Fetch commission projections
  const { data: commissionProjections = [] } = useQuery({
    queryKey: ["commission-projections-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commission_projections")
        .select("*")
        .neq("proposal_status", "cancelada");
      if (error) throw error;
      return data || [];
    },
  });

  const esnMembers = salesTeam.filter((m) => m.role === "esn");

  // ─── Hierarchy Context ───────────────────────────────────────
  // Determine the user's effective dashboard context:
  // Admin OR user NOT in sales_team → full access (acts as admin)
  // DSN → sees their GSNs + those GSNs' ESNs
  // GSN → sees their linked ESNs
  // ESN → sees only own data
  // EV (arquiteto) → sees everything they're involved in (cross role)
  const mySalesTeamId = myProfile?.sales_team_member_id || null;
  const mySalesTeamMember = salesTeam.find((m) => m.id === mySalesTeamId);
  const myTeamRole = mySalesTeamMember?.role || null;

  // User NOT in sales_team but has dashboard access → treat as admin
  const isEffectiveAdmin = role === "admin" || !mySalesTeamId || !mySalesTeamMember;
  const isArquiteto = myTeamRole === "arquiteto";
  const isDsn = myTeamRole === "dsn";
  const isGsn = myTeamRole === "gsn";
  const isEsn = myTeamRole === "esn";

  // Build the set of sales_team IDs this user can see based on hierarchy
  // null = unrestricted (admin-like)
  const hierarchyScopedIds = useMemo((): string[] | null => {
    if (isEffectiveAdmin) return null; // full access

    if (isDsn) {
      // DSN sees: themselves + their GSNs + ESNs linked to those GSNs
      const myGsns = salesTeam.filter((m) => m.role === "gsn" && m.linked_gsn_id === mySalesTeamId);
      const myGsnIds = myGsns.map((m) => m.id);
      const myEsns = salesTeam.filter((m) => m.role === "esn" && myGsnIds.includes(m.linked_gsn_id || ""));
      return [mySalesTeamId!, ...myGsnIds, ...myEsns.map((m) => m.id)];
    }

    if (isGsn) {
      // GSN sees: themselves + their linked ESNs
      const myEsns = salesTeam.filter((m) => m.role === "esn" && m.linked_gsn_id === mySalesTeamId);
      return [mySalesTeamId!, ...myEsns.map((m) => m.id)];
    }

    if (isEsn) {
      return [mySalesTeamId!];
    }

    if (isArquiteto) {
      // EV: cross role — will be handled via proposal involvement, not member IDs
      return [mySalesTeamId!];
    }

    return [];
  }, [isEffectiveAdmin, isDsn, isGsn, isEsn, isArquiteto, mySalesTeamId, salesTeam]);

  // Determine which role filter options are available based on hierarchy
  const allowedRoleFilterOptions = useMemo((): string[] => {
    if (isEffectiveAdmin) return ["dsn", "gsn", "esn"];
    if (isDsn) return ["gsn", "esn"];
    if (isGsn) return ["esn"];
    // ESN and EV don't get role filter
    return [];
  }, [isEffectiveAdmin, isDsn, isGsn]);

  const showRoleFilter = allowedRoleFilterOptions.length > 0;

  const filteredMembersByRole = useMemo(() => {
    if (selectedRoleFilter === "all") return null;
    // When filtering by role, intersect with hierarchy scope
    const roleMembers = salesTeam.filter((m) => m.role === selectedRoleFilter).map((m) => m.id);
    if (hierarchyScopedIds === null) return roleMembers; // admin: no restriction
    return roleMembers.filter((id) => hierarchyScopedIds.includes(id));
  }, [salesTeam, selectedRoleFilter, hierarchyScopedIds]);

  const handlePreset = (preset: string) => {
    setPeriodPreset(preset);
    if (preset !== "custom") {
      const { from, to } = getPresetDates(preset);
      setDateFrom(from);
      setDateTo(to);
    }
  };

  // Filter proposals based on hierarchy + role filter
  const filteredProposals = useMemo(() => {
    return proposals.filter((p: any) => {
      // Hierarchy scope check
      if (isArquiteto && !isEffectiveAdmin) {
        // EV: only proposals where they're involved as arquiteto
        if (p.arquiteto_id !== mySalesTeamId) return false;
      } else if (hierarchyScopedIds !== null && !isArquiteto) {
        // Non-admin: check if proposal's esn_id or gsn_id is in scoped IDs
        const matchesScope = hierarchyScopedIds.includes(p.esn_id) || hierarchyScopedIds.includes(p.gsn_id);
        if (!matchesScope) return false;
      }

      // Role filter: additional narrowing within allowed scope
      if (filteredMembersByRole) {
        const matchesRole = filteredMembersByRole.includes(p.esn_id) || filteredMembersByRole.includes(p.gsn_id);
        if (!matchesRole) return false;
      }

      // Date filter
      const refDate = p.expected_close_date || "";
      if (dateFrom && refDate && refDate < dateFrom) return false;
      if (dateTo && refDate && refDate > dateTo) return false;
      return true;
    });
  }, [proposals, dateFrom, dateTo, filteredMembersByRole, hierarchyScopedIds, isArquiteto, isEffectiveAdmin, mySalesTeamId]);

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
      const closed = new Date(p.expected_close_date || p.updated_at).getTime();
      return sum + (closed - created) / (1000 * 60 * 60 * 24);
    }, 0);
    return Math.round(totalDays / wonProposals.length);
  }, [wonProposals]);

  // ─── Effective ESN filter for downstream computations ─────────
  // Combines hierarchy scope + role filter for targets/commissions
  const effectiveEsnFilter = useMemo((): string[] | null => {
    if (isEffectiveAdmin && !filteredMembersByRole) return null;
    if (isEffectiveAdmin && filteredMembersByRole) return filteredMembersByRole;
    if (isArquiteto) return mySalesTeamId ? [mySalesTeamId] : [];
    if (filteredMembersByRole) return filteredMembersByRole;
    return hierarchyScopedIds;
  }, [isEffectiveAdmin, isArquiteto, mySalesTeamId, filteredMembersByRole, hierarchyScopedIds]);

  const myClients = useMemo(() => {
    // Effective admin or unrestricted → all clients (optionally narrowed by role filter)
    if (isEffectiveAdmin && !effectiveEsnFilter) return clients;
    
    // When filter is active, scope clients
    if (effectiveEsnFilter && effectiveEsnFilter.length > 0) {
      return clients.filter((c: any) =>
        effectiveEsnFilter.includes(c.esn_id) || effectiveEsnFilter.includes(c.gsn_id)
      );
    }

    // EV: clients from proposals where they're involved
    if (isArquiteto) {
      const clientIdsWithArquiteto = new Set(
        filteredProposals
          .filter((p: any) => p.arquiteto_id === mySalesTeamId)
          .map((p: any) => p.client_id)
      );
      return clients.filter((c: any) => clientIdsWithArquiteto.has(c.id));
    }

    // DSN/GSN/ESN: use hierarchy scope
    if (hierarchyScopedIds) {
      return clients.filter((c: any) =>
        hierarchyScopedIds.includes(c.esn_id) || hierarchyScopedIds.includes(c.gsn_id)
      );
    }

    return [];
  }, [isEffectiveAdmin, isArquiteto, mySalesTeamId, clients, filteredProposals, effectiveEsnFilter, hierarchyScopedIds]);

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
    const months: { key: string; label: string; ganhas: number; perdidas: number; ganhasValor: number; perdidasValor: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
      months.push({ key, label, ganhas: 0, perdidas: 0, ganhasValor: 0, perdidasValor: 0 });
    }
    for (const p of proposals as any[]) {
      if (p.status !== "ganha" && p.status !== "cancelada") continue;
      const closeMonth = (p.expected_close_date || "").substring(0, 7);
      const bucket = months.find((m) => m.key === closeMonth);
      if (!bucket) continue;
      const val = computeNetValue(p) || 0;
      if (p.status === "ganha") { bucket.ganhas++; bucket.ganhasValor += val; }
      if (p.status === "cancelada") { bucket.perdidas++; bucket.perdidasValor += val; }
    }
    return months;
  }, [proposals]);

  const chartConfig = {
    ganhas: { label: "Ganhas", color: "hsl(var(--success))" },
    perdidas: { label: "Perdidas", color: "hsl(var(--destructive))" },
  };

  // ─── Resultado: Meta vs Realizado vs Previsto ────────────────
  const resultadoData = useMemo(() => {
    const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const months = MONTH_LABELS.map((label, i) => ({
      label,
      month: i + 1,
      meta: 0,
      realizado: 0,
      previsto: 0,
    }));

    // Filter targets by hierarchy + role scope
    const relevantTargets = isArquiteto && !isEffectiveAdmin
      ? salesTargets.filter((t: any) => t.esn_id === mySalesTeamId)
      : effectiveEsnFilter === null
        ? salesTargets
        : salesTargets.filter((t: any) => effectiveEsnFilter.includes(t.esn_id));

    for (const t of relevantTargets) {
      if (t.month >= 1 && t.month <= 12) {
        months[t.month - 1].meta += Number(t.amount) || 0;
      }
    }

    // Realizado / Previsto: use hierarchy-scoped proposals
    const relevantProposals = isArquiteto && !isEffectiveAdmin
      ? proposals.filter((p: any) => p.arquiteto_id === mySalesTeamId)
      : effectiveEsnFilter === null
        ? proposals
        : proposals.filter((p: any) => effectiveEsnFilter.includes(p.esn_id) || effectiveEsnFilter.includes(p.gsn_id));

    for (const p of relevantProposals as any[]) {
      const value = computeNetValue(p) || 0;
      if (value === 0) continue;

      if (p.status === "ganha") {
        // Realizado: use expected_close_date or fallback to updated_at
        const dateStr = p.expected_close_date || (p.updated_at || "").substring(0, 10);
        if (!dateStr) continue;
        const year = Number(dateStr.substring(0, 4));
        const month = Number(dateStr.substring(5, 7));
        if (year === targetYear && month >= 1 && month <= 12) {
          months[month - 1].realizado += value;
          months[month - 1].previsto += value;
        }
      } else if (p.status !== "cancelada") {
        // Previsto (não ganha, não cancelada): use expected_close_date
        const dateStr = p.expected_close_date || "";
        if (!dateStr) continue;
        const year = Number(dateStr.substring(0, 4));
        const month = Number(dateStr.substring(5, 7));
        if (year === targetYear && month >= 1 && month <= 12) {
          months[month - 1].previsto += value;
        }
      }
    }

    return months;
  }, [salesTargets, proposals, effectiveEsnFilter, isArquiteto, mySalesTeamId, targetYear]);

  const [resultadoMode, setResultadoMode] = useState<"anual" | "ytd">("anual");
  const currentMonth = new Date().getMonth() + 1; // 1-12

  const totalMeta = useMemo(() => {
    if (resultadoMode === "ytd") {
      return resultadoData.filter(m => m.month <= currentMonth).reduce((s, m) => s + m.meta, 0);
    }
    return resultadoData.reduce((s, m) => s + m.meta, 0);
  }, [resultadoData, resultadoMode, currentMonth]);

  const totalRealizado = useMemo(() => {
    const data = resultadoMode === "ytd" ? resultadoData.filter(m => m.month <= currentMonth) : resultadoData;
    return data.reduce((s, m) => s + m.realizado, 0);
  }, [resultadoData, resultadoMode, currentMonth]);

  const totalPrevisto = useMemo(() => {
    const data = resultadoMode === "ytd" ? resultadoData.filter(m => m.month <= currentMonth) : resultadoData;
    return data.reduce((s, m) => s + m.previsto, 0);
  }, [resultadoData, resultadoMode, currentMonth]);
  const atingimentoPercent = totalMeta > 0 ? (totalRealizado / totalMeta * 100) : 0;
  const totalGap = totalMeta - totalRealizado;

  // ─── Commission chart data ────────────────────────────────────
  const commissionChartData = useMemo(() => {
    const today = new Date().toISOString().substring(0, 10);
    const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const months = MONTH_LABELS.map((label, i) => ({
      label,
      month: i + 1,
      realizada: 0,
      prevista: 0,
    }));

    if (isArquiteto) {
      // Arquiteto: calculate commission from proposals where they are linked as arquiteto
      const arquitetoPct = Number(mySalesTeamMember?.commission_pct) || 1.31;
      const myProposals = (proposals as any[]).filter((p: any) => p.arquiteto_id === mySalesTeamId && p.status !== "cancelada");

      for (const p of myProposals) {
        const netValue = computeNetValue(p) || 0;
        if (netValue === 0) continue;
        const commValue = (netValue * arquitetoPct) / 100;

        // Use expected_close_date for timing
        const dateStr = p.status === "ganha"
          ? (p.expected_close_date || (p.updated_at || "").substring(0, 10))
          : (p.expected_close_date || "");
        if (!dateStr) continue;
        const year = Number(dateStr.substring(0, 4));
        const month = Number(dateStr.substring(5, 7));
        if (year !== targetYear || month < 1 || month > 12) continue;

        if (p.status === "ganha") {
          months[month - 1].realizada += commValue;
        } else {
          if (dateStr <= today) continue; // past non-ganha: skip
          months[month - 1].prevista += commValue;
        }
      }
    } else {
      // ESN-based commissions from commission_projections
      const relevant = effectiveEsnFilter === null
        ? (commissionProjections as any[])
        : (commissionProjections as any[]).filter((cp: any) => effectiveEsnFilter.includes(cp.esn_id));

      for (const cp of relevant) {
        const dueDate = cp.due_date || "";
        const year = Number(dueDate.substring(0, 4));
        const month = Number(dueDate.substring(5, 7));
        if (year !== targetYear || month < 1 || month > 12) continue;

        const commValue = Number(cp.commission_value) || 0;
        if (dueDate <= today) {
          if (cp.proposal_status === "ganha") {
            months[month - 1].realizada += commValue;
          }
        } else {
          if (cp.proposal_status === "ganha") {
            months[month - 1].realizada += commValue;
          } else {
            months[month - 1].prevista += commValue;
          }
        }
      }
    }

    return months;
  }, [commissionProjections, effectiveEsnFilter, isArquiteto, mySalesTeamMember, mySalesTeamId, proposals, targetYear]);

  const totalCommRealizada = commissionChartData.reduce((s, m) => s + m.realizada, 0);
  const totalCommPrevista = commissionChartData.reduce((s, m) => s + m.prevista, 0);

  const activeFilters =
    (dateFrom || dateTo ? 1 : 0) + (selectedRoleFilter !== "all" ? 1 : 0) + (selectedUnitId !== "all" ? 1 : 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Visão geral das oportunidades comerciais
          </p>
        </div>
        <Button asChild>
          <Link to="/propostas/nova">
            <Plus className="mr-2 h-4 w-4" />
            Nova Oportunidade
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
                setSelectedRoleFilter("all");
                setSelectedUnitId("all");
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
            {showRoleFilter && (
              <div className="hidden h-16 w-px self-center bg-border md:block" />
            )}

            {/* Role Selector */}
            {showRoleFilter && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium uppercase tracking-wider">Nível</span>
                </div>
                <RoleSelector
                  selectedRole={selectedRoleFilter}
                  onChange={setSelectedRoleFilter}
                  allowedRoles={allowedRoleFilterOptions}
                />
              </div>
            )}

            {/* Divider before Unit */}
            <div className="hidden h-16 w-px self-center bg-border md:block" />

            {/* Unit Selector */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium uppercase tracking-wider">Unidade</span>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-9 gap-2 border-dashed text-xs font-normal",
                      selectedUnitId !== "all" && "border-primary/40 bg-primary/5 text-primary"
                    )}
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    {selectedUnitId === "all"
                      ? "Todas as unidades"
                      : units.find((u) => u.id === selectedUnitId)?.name || "Unidade"}
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="start">
                  <div className="max-h-64 overflow-auto p-1">
                    <button
                      onClick={() => setSelectedUnitId("all")}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                        selectedUnitId === "all"
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-accent"
                      )}
                    >
                      {selectedUnitId === "all" && <Check className="h-3.5 w-3.5" />}
                      <span className="font-medium">Todas as unidades</span>
                    </button>
                    {units.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => setSelectedUnitId(u.id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                          selectedUnitId === u.id
                            ? "bg-primary/10 text-primary"
                            : "text-foreground hover:bg-accent"
                        )}
                      >
                        {selectedUnitId === u.id && <Check className="h-3.5 w-3.5" />}
                        <span className="font-medium">{u.name}</span>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Tabs ────────────────────────────────────────────── */}
      <Tabs defaultValue="unificado" className="space-y-6">
        <TabsList>
          <TabsTrigger value="unificado">Visão Unificada</TabsTrigger>
          <TabsTrigger value="propostas">Oportunidades</TabsTrigger>
          <TabsTrigger value="resultado">Análise de Resultado</TabsTrigger>
          <TabsTrigger value="performance">Indicadores de Performance</TabsTrigger>
        </TabsList>

        {/* ═══ TAB: Visão Unificada ═══ */}
        <TabsContent value="unificado">
          <UnifiedRevenueTab selectedYear={targetYear} selectedUnitId={selectedUnitId} dateFrom={dateFrom} dateTo={dateTo} selectedRoleFilter={selectedRoleFilter} hierarchyScopedIds={hierarchyScopedIds} isArquiteto={isArquiteto && !isEffectiveAdmin} mySalesTeamId={mySalesTeamId} />
        </TabsContent>

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
                  <ChartTooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const data = payload[0]?.payload;
                      return (
                        <div className="rounded-lg border border-border bg-background p-3 shadow-md">
                          <p className="mb-2 text-sm font-medium text-foreground">{label}</p>
                          {data?.ganhas > 0 && (
                            <div className="flex items-center justify-between gap-4 text-sm">
                              <span className="flex items-center gap-1.5">
                                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "hsl(var(--success))" }} />
                                Ganhas ({data.ganhas})
                              </span>
                              <span className="font-medium">{data.ganhasValor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                            </div>
                          )}
                          {data?.perdidas > 0 && (
                            <div className="flex items-center justify-between gap-4 text-sm">
                              <span className="flex items-center gap-1.5">
                                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "hsl(var(--destructive))" }} />
                                Perdidas ({data.perdidas})
                              </span>
                              <span className="font-medium">{data.perdidasValor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                            </div>
                          )}
                          {(!data?.ganhas && !data?.perdidas) && (
                            <p className="text-xs text-muted-foreground">Sem dados</p>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Legend />
                  <Bar dataKey="ganhas" name="Ganhas" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="perdidas" name="Perdidas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Top 10 Proposals */}
          <Top10Proposals proposals={filteredProposals} computeNetValue={computeNetValue} statusMap={statusMap} />
        </TabsContent>

        {/* ═══ TAB: Resultado ═══ */}
        <TabsContent value="resultado" className="space-y-6">
          {/* YTD / Anual toggle */}
          <div className="flex items-center justify-end gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">Visão:</span>
            {(["ytd", "anual"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setResultadoMode(mode)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-all",
                  resultadoMode === mode
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
              >
                {mode === "ytd" ? "YTD" : "Anual"}
              </button>
            ))}
          </div>

          {/* KPI summary */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <KpiCard icon={Target} label="Meta Total" value={formatCurrency(totalMeta)} subValue={resultadoMode === "ytd" ? `Jan–${resultadoData[currentMonth - 1]?.label || ""} ${targetYear}` : `Ano ${targetYear}`} colorClass="text-primary" bgClass="bg-primary/15" delay={0} />
            <KpiCard icon={TrendingUp} label="Realizado" value={formatCurrency(totalRealizado)} subValue="propostas ganhas" colorClass="text-success" bgClass="bg-success/15" delay={0.05} />
            <KpiCard icon={Trophy} label="Atingimento" value={`${atingimentoPercent.toFixed(1)}%`} subValue="realizado / meta" colorClass={atingimentoPercent >= 100 ? "text-success" : "text-warning"} bgClass={atingimentoPercent >= 100 ? "bg-success/15" : "bg-warning/15"} delay={0.1} />
            <KpiCard icon={TrendingDown} label="GAP" value={formatCurrency(totalGap)} subValue="meta − realizado" colorClass={totalGap <= 0 ? "text-success" : "text-destructive"} bgClass={totalGap <= 0 ? "bg-success/15" : "bg-destructive/15"} delay={0.15} />
            <KpiCard icon={BarChart3} label="Previsto" value={formatCurrency(totalPrevisto)} subValue="ganhas + pipeline ativo" colorClass="text-primary" bgClass="bg-primary/15" delay={0.2} />
          </div>

          {/* Meta vs Previsto Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Análise de Resultado — {targetYear}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={resultadoData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <YAxis tickFormatter={(v: number) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <RechartsTooltip formatter={(value: number) => formatCurrency(value)} labelStyle={{ color: "hsl(var(--foreground))" }} contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Legend />
                    <Bar dataKey="meta" name="Meta" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} opacity={0.35} />
                    <Bar dataKey="realizado" name="Realizado" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                    <Line dataKey="previsto" name="Previsto" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Previsto = propostas ganhas + propostas em andamento (pendente, gerada, em assinatura), usando a data de previsão de fechamento.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

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

          {/* Commission Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Comissões Previstas — {targetYear}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Realizada</p>
                  <p className="text-lg font-bold text-success">{formatCurrency(totalCommRealizada)}</p>
                  <p className="text-[11px] text-muted-foreground">propostas ganhas</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Prevista</p>
                  <p className="text-lg font-bold text-primary">{formatCurrency(totalCommPrevista)}</p>
                  <p className="text-[11px] text-muted-foreground">propostas em aberto</p>
                </div>
              </div>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={commissionChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <YAxis tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <RechartsTooltip formatter={(value: number) => formatCurrency(value)} labelStyle={{ color: "hsl(var(--foreground))" }} contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Legend />
                    <Bar dataKey="realizada" name="Realizada (Ganhas)" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="prevista" name="Prevista (Em Aberto)" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} opacity={0.6} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {isArquiteto
                  ? `Comissão = ${Number(mySalesTeamMember?.commission_pct) || 1.31}% × valor líquido da proposta vinculada ao arquiteto.`
                  : "Comissão = % comissão do ESN × valor da parcela. Parcelas passadas: somente ganhas. Parcelas futuras: ganhas + em aberto."}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground italic">
                ⚠️ Os valores apresentados aqui são meramente simulados e de caráter informativo. A apuração oficial de comissões é realizada exclusivamente através do GooData, disponibilizado mensalmente pelo setor de Comissões da TOTVS Leste.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
