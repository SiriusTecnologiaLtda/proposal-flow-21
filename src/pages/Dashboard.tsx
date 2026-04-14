import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  SlidersHorizontal, CalendarRange, Users, X, Check, ChevronDown, Tag,
  Building2, Repeat, User,
} from "lucide-react";
import { useSalesTeam, useCategories } from "@/hooks/useSupabaseData";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { useVisibleSalesScope } from "@/hooks/useVisibleSalesScope";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { UnifiedRevenueTab } from "@/components/dashboard/UnifiedRevenueTab";

// ─── Dashboard ────────────────────────────────────────────────

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

export default function Dashboard() {
  const { user } = useAuth();
  const { role } = useUserRole();
  const { data: salesTeam = [] } = useSalesTeam();

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [periodPreset, setPeriodPreset] = useState("this_year");
  const [dateFrom, setDateFrom] = useState(() => getPresetDates("this_year").from);
  const [dateTo, setDateTo] = useState(() => getPresetDates("this_year").to);
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("all");
  const [selectedUnitId, setSelectedUnitId] = useState<string>("all");
  const [selectedRevenueFilter, setSelectedRevenueFilter] = useState<string>("all");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [selectedMemberId, setSelectedMemberId] = useState<string>("all");

  const { data: categories = [] } = useCategories();

  const REVENUE_FILTER_OPTIONS = [
    { value: "recorrente", label: "Recorrente" },
    { value: "nao_recorrente", label: "Não Recorrente" },
    { value: "scs", label: "SCS (Serviços)" },
  ];

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

  // ── New scope (from sales_team_assignments) ──
  const newScope = useVisibleSalesScope();

  // Build the set of sales_team IDs this user can see based on hierarchy
  // null = unrestricted (admin-like)
  // LEGACY logic (linked_gsn_id based) — kept intact for rollback
  const legacyHierarchyScopedIds = useMemo((): string[] | null => {
    if (isEffectiveAdmin) return null; // full access

    if (isDsn) {
      const myGsns = salesTeam.filter((m) => m.role === "gsn" && m.linked_gsn_id === mySalesTeamId);
      const myGsnIds = myGsns.map((m) => m.id);
      const myEsns = salesTeam.filter((m) => m.role === "esn" && myGsnIds.includes(m.linked_gsn_id || ""));
      const allEvs = salesTeam.filter((m) => m.role === "arquiteto");
      return [mySalesTeamId!, ...myGsnIds, ...myEsns.map((m) => m.id), ...allEvs.map((m) => m.id)];
    }

    if (isGsn) {
      const myEsns = salesTeam.filter((m) => m.role === "esn" && m.linked_gsn_id === mySalesTeamId);
      const allEvs = salesTeam.filter((m) => m.role === "arquiteto");
      return [mySalesTeamId!, ...myEsns.map((m) => m.id), ...allEvs.map((m) => m.id)];
    }

    if (isEsn) {
      return [mySalesTeamId!];
    }

    if (isArquiteto) {
      return [mySalesTeamId!];
    }

    return [];
  }, [isEffectiveAdmin, isDsn, isGsn, isEsn, isArquiteto, mySalesTeamId, salesTeam]);

  // ── Flag-controlled scope switch ──
  // When useNewScopeDashboard = true → uses get_visible_sales_ids_v2 (assignments)
  // When useNewScopeDashboard = false → uses legacy linked_gsn_id logic
  const hierarchyScopedIds = useMemo((): string[] | null => {
    if (!FEATURE_FLAGS.useNewScopeDashboard) {
      return legacyHierarchyScopedIds;
    }
    // New scope: null = unrestricted
    if (newScope.isUnrestricted) return null;
    return newScope.visibleIds;
  }, [legacyHierarchyScopedIds, newScope.isUnrestricted, newScope.visibleIds]);

  // ─── Hierarchy-scoped member list for filter ──────────────────
  const allowedMembers = useMemo(() => {
    if (isEffectiveAdmin) return salesTeam;
    if (!hierarchyScopedIds) return [];
    return salesTeam.filter((m) => hierarchyScopedIds.includes(m.id));
  }, [isEffectiveAdmin, hierarchyScopedIds, salesTeam]);

  // ─── Hierarchy-scoped units ──────────────────────────────────
  const allowedUnits = useMemo(() => {
    if (isEffectiveAdmin) return units;
    // Restrict units to those that the allowed members belong to
    const memberUnitIds = new Set(allowedMembers.map((m) => m.unit_id).filter(Boolean));
    return units.filter((u) => memberUnitIds.has(u.id));
  }, [isEffectiveAdmin, units, allowedMembers]);

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
    const roleMembers = salesTeam.filter((m) => m.role === selectedRoleFilter).map((m) => m.id);
    if (hierarchyScopedIds === null) return roleMembers;
    return roleMembers.filter((id) => hierarchyScopedIds.includes(id));
  }, [salesTeam, selectedRoleFilter, hierarchyScopedIds]);

  // ─── Unit-scoped member IDs ─────────────────────────────────
  // When unit filter is active, restrict to members belonging to that unit
  const unitScopedMemberIds = useMemo((): string[] | null => {
    if (selectedUnitId === "all") return null;
    return salesTeam.filter((m) => m.unit_id === selectedUnitId).map((m) => m.id);
  }, [selectedUnitId, salesTeam]);

  // ─── Combined member filter (hierarchy ∩ role ∩ unit) ─────────
  // null = unrestricted
  const combinedMemberFilter = useMemo((): string[] | null => {
    let result: string[] | null = null;

    // Start with hierarchy scope
    if (hierarchyScopedIds !== null) {
      result = [...hierarchyScopedIds];
    }

    // Intersect with role filter
    if (filteredMembersByRole) {
      if (result === null) {
        result = [...filteredMembersByRole];
      } else {
        result = result.filter((id) => filteredMembersByRole.includes(id));
      }
    }

    // Intersect with unit filter
    if (unitScopedMemberIds) {
      if (result === null) {
        result = [...unitScopedMemberIds];
      } else {
        result = result.filter((id) => unitScopedMemberIds.includes(id));
      }
    }

    // Intersect with specific member filter
    if (selectedMemberId !== "all") {
      if (result === null) {
        result = [selectedMemberId];
      } else {
        result = result.filter((id) => id === selectedMemberId);
      }
    }

    return result;
  }, [hierarchyScopedIds, filteredMembersByRole, unitScopedMemberIds, selectedMemberId]);

  const handlePreset = (preset: string) => {
    setPeriodPreset(preset);
    if (preset !== "custom") {
      const { from, to } = getPresetDates(preset);
      setDateFrom(from);
      setDateTo(to);
    }
  };


  const activeFilters =
    (dateFrom || dateTo ? 1 : 0) + (selectedRoleFilter !== "all" ? 1 : 0) + (selectedUnitId !== "all" ? 1 : 0) + (selectedRevenueFilter !== "all" ? 1 : 0) + (selectedCategoryId !== "all" ? 1 : 0) + (selectedMemberId !== "all" ? 1 : 0);

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
        <button
          type="button"
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="flex w-full items-center gap-3 border-b border-border bg-accent/30 px-4 py-2.5 text-left transition-colors hover:bg-accent/50"
        >
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
              onClick={(e) => {
                e.stopPropagation();
                handlePreset("this_year");
                setSelectedRoleFilter("all");
                setSelectedUnitId("all");
                setSelectedRevenueFilter("all");
                setSelectedCategoryId("all");
                setSelectedMemberId("all");
              }}
            >
              <X className="mr-1 h-3 w-3" />
              Limpar tudo
            </Button>
          )}
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", filtersOpen && "rotate-180")} />
        </button>

        <AnimatePresence initial={false}>
          {filtersOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
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
                    {allowedUnits.map((u) => (
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

            {/* Divider before Revenue */}
            <div className="hidden h-16 w-px self-center bg-border md:block" />

            {/* Revenue Filter */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Repeat className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium uppercase tracking-wider">Receita</span>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-9 gap-2 border-dashed text-xs font-normal",
                      selectedRevenueFilter !== "all" && "border-primary/40 bg-primary/5 text-primary"
                    )}
                  >
                    <Repeat className="h-3.5 w-3.5" />
                    {selectedRevenueFilter === "all"
                      ? "Todas as receitas"
                      : REVENUE_FILTER_OPTIONS.find((r) => r.value === selectedRevenueFilter)?.label || selectedRevenueFilter}
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-0" align="start">
                  <div className="max-h-64 overflow-auto p-1">
                    <button
                      onClick={() => setSelectedRevenueFilter("all")}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                        selectedRevenueFilter === "all"
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-accent"
                      )}
                    >
                      {selectedRevenueFilter === "all" && <Check className="h-3.5 w-3.5" />}
                      <span className="font-medium">Todas as receitas</span>
                    </button>
                    {REVENUE_FILTER_OPTIONS.map((r) => (
                      <button
                        key={r.value}
                        onClick={() => setSelectedRevenueFilter(r.value)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                          selectedRevenueFilter === r.value
                            ? "bg-primary/10 text-primary"
                            : "text-foreground hover:bg-accent"
                        )}
                      >
                        {selectedRevenueFilter === r.value && <Check className="h-3.5 w-3.5" />}
                        <span className="font-medium">{r.label}</span>
                      </button>
                    ))}
                  </div>
                  {selectedRevenueFilter !== "all" && (
                    <div className="border-t border-border p-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-full text-xs text-muted-foreground"
                        onClick={() => setSelectedRevenueFilter("all")}
                      >
                        <X className="mr-1 h-3 w-3" /> Limpar
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            {/* Divider before Category */}
            <div className="hidden h-16 w-px self-center bg-border md:block" />

            {/* Category Filter */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Tag className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium uppercase tracking-wider">Categoria</span>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-9 gap-2 border-dashed text-xs font-normal",
                      selectedCategoryId !== "all" && "border-primary/40 bg-primary/5 text-primary"
                    )}
                  >
                    <Tag className="h-3.5 w-3.5" />
                    {selectedCategoryId === "all"
                      ? "Todas as categorias"
                      : categories.find((c) => c.id === selectedCategoryId)?.name || selectedCategoryId}
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-0" align="start">
                  <div className="max-h-64 overflow-auto p-1">
                    <button
                      onClick={() => setSelectedCategoryId("all")}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                        selectedCategoryId === "all"
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-accent"
                      )}
                    >
                      {selectedCategoryId === "all" && <Check className="h-3.5 w-3.5" />}
                      <span className="font-medium">Todas as categorias</span>
                    </button>
                    {categories.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setSelectedCategoryId(c.id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                          selectedCategoryId === c.id
                            ? "bg-primary/10 text-primary"
                            : "text-foreground hover:bg-accent"
                        )}
                      >
                        {selectedCategoryId === c.id && <Check className="h-3.5 w-3.5" />}
                        <span className="font-medium">{c.name}</span>
                      </button>
                    ))}
                  </div>
                  {selectedCategoryId !== "all" && (
                    <div className="border-t border-border p-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-full text-xs text-muted-foreground"
                        onClick={() => setSelectedCategoryId("all")}
                      >
                        <X className="mr-1 h-3 w-3" /> Limpar
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            {/* Divider before Member */}
            <div className="hidden h-16 w-px self-center bg-border md:block" />

            {/* Member Filter */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium uppercase tracking-wider">Membro</span>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-9 gap-2 border-dashed text-xs font-normal max-w-[220px]",
                      selectedMemberId !== "all" && "border-primary/40 bg-primary/5 text-primary"
                    )}
                  >
                    <User className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {selectedMemberId === "all"
                        ? "Todos os membros"
                        : allowedMembers.find((m) => m.id === selectedMemberId)?.name || "Membro"}
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="start">
                  <div className="max-h-72 overflow-auto p-1">
                    <button
                      onClick={() => setSelectedMemberId("all")}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                        selectedMemberId === "all"
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-accent"
                      )}
                    >
                      {selectedMemberId === "all" && <Check className="h-3.5 w-3.5" />}
                      <span className="font-medium">Todos os membros</span>
                    </button>
                    {allowedMembers.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setSelectedMemberId(m.id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                          selectedMemberId === m.id
                            ? "bg-primary/10 text-primary"
                            : "text-foreground hover:bg-accent"
                        )}
                      >
                        {selectedMemberId === m.id && <Check className="h-3.5 w-3.5 shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <span className="font-medium">{m.name}</span>
                          <span className="ml-1.5 text-muted-foreground">{m.role?.toUpperCase()}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                  {selectedMemberId !== "all" && (
                    <div className="border-t border-border p-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-full text-xs text-muted-foreground"
                        onClick={() => setSelectedMemberId("all")}
                      >
                        <X className="mr-1 h-3 w-3" /> Limpar
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* ─── Visão Unificada ────────────────────────────────── */}
      <UnifiedRevenueTab selectedYear={targetYear} selectedUnitId={selectedUnitId} dateFrom={dateFrom} dateTo={dateTo} selectedRoleFilter={selectedRoleFilter} hierarchyScopedIds={hierarchyScopedIds} isArquiteto={isArquiteto && !isEffectiveAdmin} mySalesTeamId={mySalesTeamId} selectedRevenueFilter={selectedRevenueFilter} selectedCategoryId={selectedCategoryId} selectedMemberId={selectedMemberId} />
    </div>
  );
}
