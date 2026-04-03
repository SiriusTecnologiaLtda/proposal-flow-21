import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Progress } from "@/components/ui/progress";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer,
  Tooltip as RechartsTooltip, Cell, PieChart, Pie,
} from "recharts";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, Target, Building2, Layers, ArrowUpRight,
  ArrowDownRight, Minus, BarChart3,
} from "lucide-react";

const REVENUE_LINES = [
  { key: "producao", label: "Produção", color: "hsl(215, 50%, 42%)" },
  { key: "recorrente", label: "Recorrente", color: "hsl(158, 40%, 32%)" },
  { key: "nao_recorrente", label: "Não Recorrente", color: "hsl(35, 55%, 45%)" },
  { key: "servico", label: "Serviço (SCS)", color: "hsl(262, 40%, 50%)" },
  { key: "rrf", label: "RRF", color: "hsl(190, 50%, 40%)" },
  { key: "nrf", label: "NRF", color: "hsl(340, 45%, 50%)" },
] as const;

function formatCurrencyFull(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`;
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatPercent(v: number): string {
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

// ─── Revenue Line KPI Card ──────────────────────────────
function RevenueKpiCard({
  label,
  meta,
  realizado,
  color,
  delay = 0,
}: {
  label: string;
  meta: number;
  realizado: number;
  color: string;
  delay?: number;
}) {
  const pct = meta > 0 ? (realizado / meta) * 100 : 0;
  const gap = meta - realizado;
  const isPositive = pct >= 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <Card className="relative overflow-hidden group hover:shadow-md transition-shadow">
        {/* Top accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: color }} />
        <CardContent className="pt-5 pb-4 px-5">
          <div className="flex items-start justify-between mb-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                {label}
              </p>
              <p className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
                {formatCurrencyFull(realizado)}
              </p>
            </div>
            <div className={cn(
              "flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold",
              isPositive ? "bg-success/10 text-success" : pct > 0 ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground"
            )}>
              {isPositive ? <ArrowUpRight className="h-3 w-3" /> : pct > 0 ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
              {formatPercent(pct)}
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Meta: {formatCurrencyFull(meta)}</span>
              <span className={cn(
                "font-medium",
                gap > 0 ? "text-destructive" : "text-success"
              )}>
                GAP: {gap > 0 ? "-" : "+"}{formatCurrencyFull(Math.abs(gap))}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(pct, 100)}%` }}
                transition={{ duration: 0.8, delay: delay + 0.2 }}
                className="h-full rounded-full"
                style={{ background: color }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Unit Row ──────────────────────────────
function UnitBreakdownRow({
  unitName,
  lines,
  delay = 0,
}: {
  unitName: string;
  lines: Record<string, { meta: number; realizado: number }>;
  delay?: number;
}) {
  const totalMeta = Object.values(lines).reduce((s, l) => s + l.meta, 0);
  const totalReal = Object.values(lines).reduce((s, l) => s + l.realizado, 0);
  const pct = totalMeta > 0 ? (totalReal / totalMeta) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay }}
      className="group"
    >
      <div className="flex items-center gap-4 py-3 px-4 rounded-lg hover:bg-accent/50 transition-colors">
        <div className="flex items-center gap-3 min-w-0 w-48 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-semibold text-foreground truncate">{unitName}</span>
        </div>

        {/* Mini bars for each revenue line */}
        <div className="flex-1 grid grid-cols-6 gap-3">
          {REVENUE_LINES.map((rl) => {
            const data = lines[rl.key] || { meta: 0, realizado: 0 };
            const linePct = data.meta > 0 ? (data.realizado / data.meta) * 100 : 0;
            return (
              <div key={rl.key} className="min-w-0">
                <div className="flex items-baseline justify-between mb-0.5">
                  <span className="text-[10px] text-muted-foreground truncate">{formatCurrencyFull(data.realizado)}</span>
                  <span className={cn(
                    "text-[10px] font-bold",
                    linePct >= 100 ? "text-success" : linePct > 0 ? "text-warning" : "text-muted-foreground"
                  )}>
                    {data.meta > 0 ? formatPercent(linePct) : "—"}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min(linePct, 100)}%`,
                      background: rl.color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Total */}
        <div className="w-28 shrink-0 text-right">
          <p className="text-sm font-bold text-foreground tabular-nums">{formatCurrencyFull(totalReal)}</p>
          <p className={cn(
            "text-[10px] font-medium",
            pct >= 100 ? "text-success" : "text-warning"
          )}>
            {totalMeta > 0 ? formatPercent(pct) : "—"}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

interface UnifiedRevenueTabProps {
  selectedYear: number;
  selectedUnitId: string;
}

export function UnifiedRevenueTab({ selectedYear, selectedUnitId }: UnifiedRevenueTabProps) {

  // Fetch units
  const { data: units = [] } = useQuery({
    queryKey: ["units-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase.from("unit_info").select("id, name").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch revenue targets
  const { data: revenueTargets = [] } = useQuery({
    queryKey: ["revenue-targets", selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("revenue_targets")
        .select("*")
        .eq("year", selectedYear);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch software proposals with items for Realizado
  const { data: softwareProposals = [] } = useQuery({
    queryKey: ["sw-proposals-dashboard", selectedYear],
    queryFn: async () => {
      const startDate = `${selectedYear}-01-01`;
      const endDate = `${selectedYear}-12-31`;
      const { data, error } = await supabase
        .from("software_proposals")
        .select("id, client_id, esn_id, gsn_id, proposal_date, status, unit_id, software_proposal_items(total_price, cost_classification, recurrence)")
        .gte("proposal_date", startDate)
        .lte("proposal_date", endDate);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch service proposals (won) for Serviço line
  const { data: serviceProposals = [] } = useQuery({
    queryKey: ["service-proposals-dashboard", selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposals")
        .select("id, client_id, esn_id, status, expected_close_date, clients(unit_id), proposal_service_items(calculated_hours, hourly_rate)")
        .eq("status", "ganha");
      if (error) throw error;
      return (data || []).filter((p: any) => {
        const dateStr = p.expected_close_date || "";
        return dateStr.startsWith(String(selectedYear));
      });
    },
  });

  // Fetch clients for unit mapping
  const { data: clients = [] } = useQuery({
    queryKey: ["clients-unit-map"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, unit_id").limit(5000);
      if (error) throw error;
      return data || [];
    },
  });

  const clientUnitMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clients) { if (c.unit_id) map.set(c.id, c.unit_id); }
    return map;
  }, [clients]);

  // Compute Realizado by revenue line and unit
  const realizadoData = useMemo(() => {
    // Structure: { [unitId]: { producao, recorrente, nao_recorrente, servico, rrf, nrf } }
    const result: Record<string, Record<string, number>> = {};

    const ensureUnit = (unitId: string) => {
      if (!result[unitId]) {
        result[unitId] = { producao: 0, recorrente: 0, nao_recorrente: 0, servico: 0, rrf: 0, nrf: 0 };
      }
    };

    // Software proposals → Recorrente, Não Recorrente, Produção
    for (const sp of softwareProposals as any[]) {
      const unitId = sp.unit_id || (sp.client_id && clientUnitMap.get(sp.client_id)) || "unknown";
      ensureUnit(unitId);

      const items = sp.software_proposal_items || [];
      let totalCapex = 0;
      let totalOpex = 0;

      for (const item of items) {
        const price = Number(item.total_price) || 0;
        const isRecurring = ["monthly", "annual"].includes(item.recurrence);
        const isOneTime = item.recurrence === "one_time";

        if (item.cost_classification === "capex") totalCapex += price;
        if (item.cost_classification === "opex") totalOpex += price;

        if (isRecurring) {
          result[unitId].recorrente += price;
        } else if (isOneTime) {
          result[unitId].nao_recorrente += price;
        }
      }

      // Produção = (Capex / 21.82) + Opex
      result[unitId].producao += (totalCapex / 21.82) + totalOpex;
    }

    // Service proposals → Serviço
    for (const sp of serviceProposals as any[]) {
      const unitId = sp.clients?.unit_id || (sp.client_id && clientUnitMap.get(sp.client_id)) || "unknown";
      ensureUnit(unitId);

      const serviceItems = sp.proposal_service_items || [];
      const netValue = serviceItems.reduce((sum: number, item: any) =>
        sum + (Number(item.calculated_hours) * Number(item.hourly_rate)), 0);
      result[unitId].servico += netValue;
    }

    return result;
  }, [softwareProposals, serviceProposals, clientUnitMap]);

  // Compute Meta by revenue line and unit
  const metaData = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};
    for (const t of revenueTargets as any[]) {
      if (!result[t.unit_id]) {
        result[t.unit_id] = { producao: 0, recorrente: 0, nao_recorrente: 0, servico: 0, rrf: 0, nrf: 0 };
      }
      result[t.unit_id][t.revenue_line] = (result[t.unit_id][t.revenue_line] || 0) + Number(t.amount);
    }
    return result;
  }, [revenueTargets]);

  // Consolidated totals
  const consolidated = useMemo(() => {
    const totals: Record<string, { meta: number; realizado: number }> = {};
    for (const rl of REVENUE_LINES) {
      totals[rl.key] = { meta: 0, realizado: 0 };
    }

    const allUnitIds = new Set([...Object.keys(realizadoData), ...Object.keys(metaData)]);
    for (const uid of allUnitIds) {
      if (selectedUnitId !== "all" && uid !== selectedUnitId) continue;
      for (const rl of REVENUE_LINES) {
        totals[rl.key].realizado += realizadoData[uid]?.[rl.key] || 0;
        totals[rl.key].meta += metaData[uid]?.[rl.key] || 0;
      }
    }

    return totals;
  }, [realizadoData, metaData, selectedUnitId]);

  // Per-unit breakdown for table
  const unitBreakdown = useMemo(() => {
    const allUnitIds = new Set([...Object.keys(realizadoData), ...Object.keys(metaData)]);
    const rows: { unitId: string; unitName: string; lines: Record<string, { meta: number; realizado: number }> }[] = [];

    for (const uid of allUnitIds) {
      if (uid === "unknown") continue;
      if (selectedUnitId !== "all" && uid !== selectedUnitId) continue;
      const unit = units.find((u) => u.id === uid);
      if (!unit) continue;

      const lines: Record<string, { meta: number; realizado: number }> = {};
      for (const rl of REVENUE_LINES) {
        lines[rl.key] = {
          meta: metaData[uid]?.[rl.key] || 0,
          realizado: realizadoData[uid]?.[rl.key] || 0,
        };
      }
      rows.push({ unitId: uid, unitName: unit.name, lines });
    }

    return rows.sort((a, b) => a.unitName.localeCompare(b.unitName));
  }, [realizadoData, metaData, units, selectedUnitId]);

  // Monthly chart data
  const monthlyChartData = useMemo(() => {
    const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return MONTH_LABELS.map((label, i) => {
      const month = i + 1;
      let meta = 0;
      let realizado = 0;

      // Meta from targets
      for (const t of revenueTargets as any[]) {
        if (t.month !== month) continue;
        if (selectedUnitId !== "all" && t.unit_id !== selectedUnitId) continue;
        meta += Number(t.amount);
      }

      // Realizado from software proposals
      for (const sp of softwareProposals as any[]) {
        const pd = sp.proposal_date || "";
        const pMonth = Number(pd.substring(5, 7));
        if (pMonth !== month) continue;
        const unitId = sp.unit_id || (sp.client_id && clientUnitMap.get(sp.client_id));
        if (selectedUnitId !== "all" && unitId !== selectedUnitId) continue;

        const items = sp.software_proposal_items || [];
        let capex = 0, opex = 0;
        for (const item of items) {
          if (item.cost_classification === "capex") capex += Number(item.total_price) || 0;
          if (item.cost_classification === "opex") opex += Number(item.total_price) || 0;
        }
        realizado += (capex / 21.82) + opex;
      }

      // Realizado from service proposals
      for (const sp of serviceProposals as any[]) {
        const dateStr = (sp as any).expected_close_date || "";
        const pMonth = Number(dateStr.substring(5, 7));
        if (pMonth !== month) continue;
        const unitId = (sp as any).clients?.unit_id || ((sp as any).client_id && clientUnitMap.get((sp as any).client_id));
        if (selectedUnitId !== "all" && unitId !== selectedUnitId) continue;

        const serviceItems = (sp as any).proposal_service_items || [];
        realizado += serviceItems.reduce((sum: number, item: any) =>
          sum + (Number(item.calculated_hours) * Number(item.hourly_rate)), 0);
      }

      return { label, meta, realizado };
    });
  }, [revenueTargets, softwareProposals, serviceProposals, selectedUnitId, clientUnitMap]);

  // Totals for summary
  const grandTotalMeta = Object.values(consolidated).reduce((s, l) => s + l.meta, 0);
  const grandTotalReal = Object.values(consolidated).reduce((s, l) => s + l.realizado, 0);
  const grandPct = grandTotalMeta > 0 ? (grandTotalReal / grandTotalMeta) * 100 : 0;
  const grandGap = grandTotalMeta - grandTotalReal;

  // Pie data for revenue mix
  const pieData = REVENUE_LINES
    .map((rl) => ({
      name: rl.label,
      value: consolidated[rl.key]?.realizado || 0,
      color: rl.color,
    }))
    .filter((d) => d.value > 0);

  return (
    <div className="space-y-6">

      {/* Grand Summary Row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
          <Card className="border-l-4 border-l-primary">
            <CardContent className="py-4 px-5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Meta Total</p>
              <p className="text-xl font-bold text-primary mt-0.5 tabular-nums">{formatCurrencyFull(grandTotalMeta)}</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="border-l-4 border-l-success">
            <CardContent className="py-4 px-5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Realizado</p>
              <p className="text-xl font-bold text-success mt-0.5 tabular-nums">{formatCurrencyFull(grandTotalReal)}</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className={cn("border-l-4", grandPct >= 100 ? "border-l-success" : "border-l-warning")}>
            <CardContent className="py-4 px-5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Atingimento</p>
              <p className={cn("text-xl font-bold mt-0.5 tabular-nums", grandPct >= 100 ? "text-success" : "text-warning")}>
                {formatPercent(grandPct)}
              </p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className={cn("border-l-4", grandGap <= 0 ? "border-l-success" : "border-l-destructive")}>
            <CardContent className="py-4 px-5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">GAP</p>
              <p className={cn("text-xl font-bold mt-0.5 tabular-nums", grandGap <= 0 ? "text-success" : "text-destructive")}>
                {grandGap > 0 ? "-" : "+"}{formatCurrencyFull(Math.abs(grandGap))}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Revenue Line KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {REVENUE_LINES.map((rl, i) => (
          <RevenueKpiCard
            key={rl.key}
            label={rl.label}
            meta={consolidated[rl.key]?.meta || 0}
            realizado={consolidated[rl.key]?.realizado || 0}
            color={rl.color}
            delay={i * 0.06}
          />
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Monthly Meta vs Realizado */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Meta vs Realizado Mensal — {selectedYear}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis
                    tickFormatter={(v: number) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v/1_000).toFixed(0)}k` : String(v)}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  />
                  <RechartsTooltip
                    formatter={(value: number, name: string) => [
                      value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
                      name,
                    ]}
                    contentStyle={{
                      background: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                    }}
                  />
                  <Legend />
                  <Bar dataKey="meta" name="Meta" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} opacity={0.3} />
                  <Bar dataKey="realizado" name="Realizado" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Revenue Mix Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Mix de Receita
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <>
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        formatter={(value: number, name: string) => [
                          value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
                          name,
                        ]}
                        contentStyle={{
                          background: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 space-y-1.5">
                  {pieData.map((d) => (
                    <div key={d.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
                        <span className="text-muted-foreground">{d.name}</span>
                      </div>
                      <span className="font-medium text-foreground tabular-nums">{formatCurrencyFull(d.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                Sem dados de receita
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Unit Breakdown */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Resultado por Unidade
            </CardTitle>
            <div className="flex gap-3">
              {REVENUE_LINES.map((rl) => (
                <div key={rl.key} className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-sm" style={{ background: rl.color }} />
                  <span className="text-[10px] text-muted-foreground">{rl.label}</span>
                </div>
              ))}
            </div>
          </div>
        </CardHeader>
        <div className="divide-y divide-border/40">
          {unitBreakdown.length > 0 ? (
            unitBreakdown.map((row, i) => (
              <UnitBreakdownRow
                key={row.unitId}
                unitName={row.unitName}
                lines={row.lines}
                delay={i * 0.05}
              />
            ))
          ) : (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Nenhum dado disponível para o período selecionado.
            </div>
          )}

          {/* Totals row */}
          {unitBreakdown.length > 0 && (
            <div className="flex items-center gap-4 py-3 px-4 bg-accent/30">
              <div className="flex items-center gap-3 min-w-0 w-48 shrink-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/10">
                  <Target className="h-4 w-4 text-foreground" />
                </div>
                <span className="text-sm font-bold text-foreground">Consolidado</span>
              </div>
              <div className="flex-1 grid grid-cols-6 gap-3">
                {REVENUE_LINES.map((rl) => {
                  const data = consolidated[rl.key] || { meta: 0, realizado: 0 };
                  const pct = data.meta > 0 ? (data.realizado / data.meta) * 100 : 0;
                  return (
                    <div key={rl.key} className="min-w-0">
                      <div className="flex items-baseline justify-between mb-0.5">
                        <span className="text-[10px] font-bold text-foreground">{formatCurrencyFull(data.realizado)}</span>
                        <span className={cn(
                          "text-[10px] font-bold",
                          pct >= 100 ? "text-success" : pct > 0 ? "text-warning" : "text-muted-foreground"
                        )}>
                          {data.meta > 0 ? formatPercent(pct) : "—"}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(pct, 100)}%`,
                            background: rl.color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="w-28 shrink-0 text-right">
                <p className="text-sm font-bold text-foreground tabular-nums">{formatCurrencyFull(grandTotalReal)}</p>
                <p className={cn("text-[10px] font-bold", grandPct >= 100 ? "text-success" : "text-warning")}>
                  {grandTotalMeta > 0 ? formatPercent(grandPct) : "—"}
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
