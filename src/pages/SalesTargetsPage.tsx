import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox";
import { ArrowLeft, Search, Plus, Loader2, Target, Pencil, Trash2, CheckSquare } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useUnits, useSalesTeam, useCategories, useSegments } from "@/hooks/useSupabaseData";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { useVisibleSalesScope } from "@/hooks/useVisibleSalesScope";

const ROLE_LABELS: Record<string, string> = { dsn: "DSN", gsn: "GSN", esn: "ESN", arquiteto: "EV" };
const ROLE_OPTIONS = [
  { value: "esn", label: "Executivo de Vendas (ESN)" },
  { value: "gsn", label: "Gerente de Vendas (GSN)" },
  { value: "dsn", label: "Diretor de Vendas (DSN)" },
  { value: "arquiteto", label: "Engenheiro de Valor (EV)" },
];

type SummaryRow = {
  esn_id: string;
  name: string;
  code: string;
  role: string;
  unit_id: string | null;
  unitIds: Set<string>;
  linked_gsn_id: string | null;
  categoryTotals: Record<string, number>;
  grandTotal: number;
  rowKey: string;
};

export default function SalesTargetsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const currentYear = new Date().getFullYear();

  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState(String(currentYear));
  const [filterUnitIds, setFilterUnitIds] = useState<string[]>([]);
  const [filterGsnIds, setFilterGsnIds] = useState<string[]>([]);
  const [filterCategoryIds, setFilterCategoryIds] = useState<string[]>([]);
  const [filterSegmentIds, setFilterSegmentIds] = useState<string[]>([]);
  const [filterRoles, setFilterRoles] = useState<string[]>([]);

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: categories = [] } = useCategories();
  const { data: segments = [] } = useSegments();
  const { data: units = [] } = useUnits();
  const { data: fullSalesTeam = [] } = useSalesTeam();
  const newScope = useVisibleSalesScope();

  const { data: targets = [], isLoading } = useQuery({
    queryKey: ["sales-targets", yearFilter],
    queryFn: async () => {
      const all: any[] = [];
      let offset = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("sales_targets")
          .select("*")
          .eq("year", Number(yearFilter))
          .order("month", { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < PAGE) break;
        offset += PAGE;
      }
      return all;
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });

  const esnMap = useMemo(() => new Map(fullSalesTeam.map((e: any) => [e.id, e])), [fullSalesTeam]);
  const gsnList = useMemo(() => fullSalesTeam.filter((m: any) => m.role === "gsn").sort((a: any, b: any) => a.name.localeCompare(b.name)), [fullSalesTeam]);

  const unitOptions = useMemo(() => units.map((u: any) => ({ value: u.id, label: u.name })), [units]);
  const gsnOptions = useMemo(() => gsnList.map((g: any) => ({ value: g.id, label: `${g.name} (${g.code})` })), [gsnList]);
  const categoryOptions = useMemo(() => categories.map((c: any) => ({ value: c.id, label: c.name })), [categories]);
  const segmentOptions = useMemo(() => segments.map((s: any) => ({ value: s.id, label: s.name })), [segments]);

  const years = useMemo(() => {
    const y = new Set([currentYear - 1, currentYear, currentYear + 1, currentYear + 2]);
    targets.forEach((t: any) => y.add(t.year));
    return Array.from(y).sort();
  }, [targets, currentYear]);

  const sortedCategories = useMemo(() => [...categories].sort((a: any, b: any) => a.name.localeCompare(b.name)), [categories]);

  const summaryRows: SummaryRow[] = useMemo(() => {
    // Pre-filter targets by unit/segment/category so totals reflect active filters
    let filteredTargets = targets as any[];
    if (filterUnitIds.length > 0) {
      filteredTargets = filteredTargets.filter(t => t.unit_id && filterUnitIds.includes(t.unit_id));
    }
    if (filterSegmentIds.length > 0) {
      filteredTargets = filteredTargets.filter(t => t.segment_id && filterSegmentIds.includes(t.segment_id));
    }
    if (filterCategoryIds.length > 0) {
      filteredTargets = filteredTargets.filter(t => t.category_id && filterCategoryIds.includes(t.category_id));
    }

    const map = new Map<string, SummaryRow>();
    for (const t of filteredTargets) {
      const unitId = t.unit_id || "__sem_unidade__";
      const key = `${unitId}::${t.esn_id}`;
      if (!map.has(key)) {
        const esn: any = esnMap.get(t.esn_id);
        map.set(key, {
          esn_id: t.esn_id,
          name: esn?.name || "—",
          code: esn?.code || "—",
          role: t.role || "esn",
          unit_id: t.unit_id || esn?.unit_id || null,
          unitIds: new Set(),
          linked_gsn_id: esn?.linked_gsn_id || null,
          categoryTotals: {},
          grandTotal: 0,
          rowKey: key,
        });
      }
      const row = map.get(key)!;
      if (t.unit_id) row.unitIds.add(t.unit_id);
      const catId = t.category_id || "sem_categoria";
      row.categoryTotals[catId] = (row.categoryTotals[catId] || 0) + (t.amount || 0);
      row.grandTotal += (t.amount || 0);
    }
    const unitNameMap = new Map(units.map((u: any) => [u.id, u.name || ""]));
    return Array.from(map.values()).sort((a, b) => {
      const uA = unitNameMap.get(a.unit_id || "") || "zzz";
      const uB = unitNameMap.get(b.unit_id || "") || "zzz";
      const uCmp = uA.localeCompare(uB);
      if (uCmp !== 0) return uCmp;
      return a.name.localeCompare(b.name);
    });
  }, [targets, esnMap, filterUnitIds, filterSegmentIds, filterCategoryIds, units]);

  const filtered = useMemo(() => {
    let result = summaryRows;
    // ── New scope filter (flag-controlled) ──
    if (FEATURE_FLAGS.useNewScopeSalesTargets && newScope.visibleIds) {
      const allowed = new Set(newScope.visibleIds);
      result = result.filter(g => allowed.has(g.esn_id));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(g => g.name.toLowerCase().includes(q) || g.code.toLowerCase().includes(q));
    }
    if (filterGsnIds.length > 0) result = result.filter(g => g.linked_gsn_id && filterGsnIds.includes(g.linked_gsn_id));
    if (filterRoles.length > 0) result = result.filter(g => filterRoles.includes(g.role));
    return result;
  }, [summaryRows, search, filterGsnIds, filterRoles, newScope.visibleIds]);

  const activeFilterCount = (filterUnitIds.length > 0 ? 1 : 0) + (filterGsnIds.length > 0 ? 1 : 0) + (filterCategoryIds.length > 0 ? 1 : 0) + (filterSegmentIds.length > 0 ? 1 : 0) + (filterRoles.length > 0 ? 1 : 0);

  const categoryKpiTotals = useMemo(() => {
    const map = new Map<string, { name: string; total: number }>();
    for (const row of filtered) {
      for (const [catId, amount] of Object.entries(row.categoryTotals)) {
        const catName = categories.find((c: any) => c.id === catId)?.name || "Sem Categoria";
        const entry = map.get(catId);
        if (entry) entry.total += amount; else map.set(catId, { name: catName, total: amount });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered, categories]);

  const formatCurrency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
  const formatCompact = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
    return String(Math.round(v));
  };

  const getUnitName = (id: string | null) => id ? units.find((u: any) => u.id === id)?.name : null;
  const getRowKey = (row: SummaryRow) => row.rowKey;

  /* ── Selection ── */
  const toggleSelect = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const allFilteredKeys = useMemo(() => new Set(filtered.map(getRowKey)), [filtered]);
  const allSelected = filtered.length > 0 && allFilteredKeys.size === selectedKeys.size && [...allFilteredKeys].every(k => selectedKeys.has(k));
  const someSelected = selectedKeys.size > 0;
  const toggleAll = () => {
    if (allSelected) setSelectedKeys(new Set());
    else setSelectedKeys(new Set(allFilteredKeys));
  };

  /* ── Delete selected ── */
  async function deleteSelected() {
    setDeleting(true);
    try {
      const idsToDelete: string[] = [];
      for (const esnId of selectedKeys) {
        for (const t of targets) {
          if (t.esn_id === esnId) idsToDelete.push(t.id);
        }
      }
      let deletedCount = 0;
      for (let i = 0; i < idsToDelete.length; i += 100) {
        const batch = idsToDelete.slice(i, i + 100);
        const { error, count } = await supabase.from("sales_targets").delete({ count: "exact" }).in("id", batch);
        if (error) throw error;
        deletedCount += count || 0;
      }
      await qc.invalidateQueries({ queryKey: ["sales-targets"] });
      if (deletedCount === 0) {
        toast({ title: "Nenhuma meta foi excluída", description: "Verifique suas permissões.", variant: "destructive" });
      } else {
        toast({ title: `${deletedCount} registro(s) excluído(s) com sucesso!` });
      }
      setSelectedKeys(new Set());
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
    }
  }

  /* ── Navigation helpers ── */
  function buildFilterParams() {
    const params = new URLSearchParams();
    if (filterUnitIds.length > 0) params.set("f_units", filterUnitIds.join(","));
    if (filterGsnIds.length > 0) params.set("f_gsns", filterGsnIds.join(","));
    if (filterCategoryIds.length > 0) params.set("f_cats", filterCategoryIds.join(","));
    if (filterSegmentIds.length > 0) params.set("f_segs", filterSegmentIds.join(","));
    if (filterRoles.length > 0) params.set("f_roles", filterRoles.join(","));
    if (search.trim()) params.set("f_search", search.trim());
    return params.toString();
  }

  function openEdit(row: SummaryRow) {
    if (!isAdmin) return;
    const fp = buildFilterParams();
    navigate(`/cadastros/metas/editar?esn_id=${row.esn_id}&ano=${yearFilter}&unit_id=${row.unit_id || ""}${fp ? `&${fp}` : ""}`);
  }

  function openCreate() {
    const fp = buildFilterParams();
    navigate(`/cadastros/metas/editar?modo=novo&ano=${yearFilter}${fp ? `&${fp}` : ""}`);
  }

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="rounded-lg bg-gradient-to-r from-primary/90 to-primary p-5 shadow-md">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/cadastros")} className="text-primary-foreground hover:bg-white/10 h-9 w-9">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/15 p-2.5">
                <Target className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-primary-foreground leading-tight">Metas de Vendas</h1>
                <p className="text-xs text-primary-foreground/70 mt-0.5">Visão gerencial por membro e segmento</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button size="sm" variant="secondary" className="bg-white/15 text-primary-foreground border-white/20 hover:bg-white/25" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1.5" /> Adicionar Meta
              </Button>
            )}
          </div>
        </div>
      </div>


      {/* ── Filters ── */}
      <Card className="border-border/50 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Filtros</span>
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{activeFilterCount} ativo{activeFilterCount > 1 ? "s" : ""}</Badge>
            )}
            <div className="ml-auto flex items-center gap-2">
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground px-2" onClick={() => { setFilterUnitIds([]); setFilterGsnIds([]); setFilterCategoryIds([]); setFilterSegmentIds([]); setFilterRoles([]); setSearch(""); }}>
                  Limpar filtros
                </Button>
              )}
              <span className="text-xs text-muted-foreground tabular-nums">{filtered.length} registro{filtered.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
            <div className="relative col-span-2 sm:col-span-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Pesquisar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
            </div>
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <MultiSelectCombobox options={ROLE_OPTIONS.map(r => ({ value: r.value, label: r.label }))} selected={filterRoles} onChange={setFilterRoles} placeholder="Nível" searchPlaceholder="Buscar nível..." className="h-9" />
            <MultiSelectCombobox options={unitOptions} selected={filterUnitIds} onChange={setFilterUnitIds} placeholder="Unidade" searchPlaceholder="Buscar unidade..." className="h-9" />
            <MultiSelectCombobox options={gsnOptions} selected={filterGsnIds} onChange={setFilterGsnIds} placeholder="GSN" searchPlaceholder="Buscar GSN..." className="h-9" />
            <MultiSelectCombobox options={categoryOptions} selected={filterCategoryIds} onChange={setFilterCategoryIds} placeholder="Categoria" searchPlaceholder="Buscar categoria..." className="h-9" />
            <MultiSelectCombobox options={segmentOptions} selected={filterSegmentIds} onChange={setFilterSegmentIds} placeholder="Segmento" searchPlaceholder="Buscar segmento..." className="h-9" />
          </div>
        </CardContent>
      </Card>

      {/* ── Selection Action Bar ── */}
      {isAdmin && someSelected && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-primary/5 border border-primary/20 animate-in fade-in slide-in-from-top-2 duration-200">
          <CheckSquare className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground">
            {selectedKeys.size} meta{selectedKeys.size > 1 ? "s" : ""} selecionada{selectedKeys.size > 1 ? "s" : ""}
          </span>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground px-2" onClick={() => setSelectedKeys(new Set())}>
            Limpar seleção
          </Button>
          <div className="ml-auto">
            <Button variant="destructive" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setDeleteConfirmOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Excluir selecionadas
            </Button>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <Card className="overflow-hidden border-border/50 shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Carregando metas...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-2">
              <Target className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {search || activeFilterCount > 0 ? "Nenhum registro encontrado com os filtros aplicados." : `Nenhuma meta cadastrada para ${yearFilter}.`}
              </p>
            </div>
          ) : (
            <div className="overflow-auto max-h-[calc(100vh-460px)]">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-muted/80 backdrop-blur-sm">
                    {isAdmin && (
                      <th className="sticky left-0 z-30 bg-muted backdrop-blur-sm px-2 py-3 w-[40px] border-b border-r border-border/60">
                        <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Selecionar todos" className="mx-auto block" />
                      </th>
                    )}
                    <th className={cn("sticky z-30 bg-muted backdrop-blur-sm text-left px-4 py-3 font-medium text-muted-foreground text-[11px] uppercase tracking-wider min-w-[160px] border-b border-r border-border/60", isAdmin ? "left-[40px]" : "left-0")}>
                      Unidade
                    </th>
                    <th className={cn("sticky z-30 bg-muted backdrop-blur-sm text-left px-4 py-3 font-medium text-muted-foreground text-[11px] uppercase tracking-wider min-w-[240px] border-b border-r border-border/60", isAdmin ? "left-[200px]" : "left-[160px]")}>
                      Time de Vendas
                    </th>
                    {sortedCategories.map((cat: any) => (
                      <th key={cat.id} className="text-center px-2 py-3 font-medium text-muted-foreground text-[11px] uppercase tracking-wider min-w-[100px] border-b border-border/60">
                        {cat.name}
                      </th>
                    ))}
                    {isAdmin && (
                      <th className="text-center px-2 py-3 w-[44px] border-b border-l border-border/60 bg-muted" />
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filtered.map((row) => {
                    const rowKey = getRowKey(row);
                    const isSelected = selectedKeys.has(rowKey);
                    const unitName = getUnitName(row.unit_id);
                    return (
                      <tr key={rowKey} className={cn("group transition-colors hover:bg-accent/40", isAdmin && "cursor-pointer", isSelected && "bg-primary/5")}>
                        {isAdmin && (
                          <td className="sticky left-0 z-10 px-2 py-2.5 border-r border-border/40 bg-background group-hover:bg-accent/40 transition-colors"
                              style={isSelected ? { backgroundColor: 'hsl(var(--primary) / 0.05)' } : undefined}>
                            <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(rowKey)} onClick={(e) => e.stopPropagation()} className="mx-auto block" />
                          </td>
                        )}
                        <td
                          className={cn("sticky z-10 px-4 py-2.5 border-r border-border/40 bg-background group-hover:bg-accent/40 transition-colors", isAdmin ? "left-[40px]" : "left-0")}
                          style={isSelected ? { backgroundColor: 'hsl(var(--primary) / 0.05)' } : undefined}
                          onClick={() => openEdit(row)}
                        >
                          <span className="text-xs text-foreground truncate block max-w-[140px]">{unitName || "—"}</span>
                        </td>
                        <td
                          className={cn("sticky z-10 px-4 py-2.5 border-r border-border/40 bg-background group-hover:bg-accent/40 transition-colors", isAdmin ? "left-[200px]" : "left-[160px]")}
                          style={isSelected ? { backgroundColor: 'hsl(var(--primary) / 0.05)' } : undefined}
                          onClick={() => openEdit(row)}
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-semibold text-foreground leading-tight">{row.name}</span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge className="text-[9px] px-1.5 py-0 h-4 font-medium bg-primary/10 text-primary border-primary/20">{ROLE_LABELS[row.role] || row.role.toUpperCase()}</Badge>
                              <span className="text-[10px] text-muted-foreground font-mono">{row.code}</span>
                            </div>
                          </div>
                        </td>
                        {sortedCategories.map((cat: any) => {
                          const val = row.categoryTotals[cat.id] || 0;
                          return (
                            <td key={cat.id} className="text-center px-2 py-2.5" onClick={() => openEdit(row)}>
                              <span className={cn("tabular-nums text-xs", val > 0 ? "text-foreground font-medium" : "text-muted-foreground/30")}>
                                {val > 0 ? formatCompact(val) : "—"}
                              </span>
                            </td>
                          );
                        })}
                        {isAdmin && (
                          <td className="text-center px-2 py-2.5 border-l border-border/40 bg-muted/20" onClick={() => openEdit(row)}>
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors mx-auto" />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="sticky bottom-0 z-20 bg-muted backdrop-blur-sm border-t-2 border-border">
                    {isAdmin && <td className="sticky left-0 z-30 bg-muted border-r border-border/60" />}
                    <td className={cn("sticky z-30 bg-muted px-4 py-3 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold border-r border-border/60", isAdmin ? "left-[40px]" : "left-0")}>
                      Total Geral
                    </td>
                    {sortedCategories.map((cat: any) => {
                      const colTotal = filtered.reduce((s, r) => s + (r.categoryTotals[cat.id] || 0), 0);
                      return (
                        <td key={cat.id} className="text-center px-2 py-3 text-xs tabular-nums text-foreground font-bold">
                          {colTotal > 0 ? formatCompact(colTotal) : "—"}
                        </td>
                      );
                    })}
                    {isAdmin && <td className="border-l border-border/60" />}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir metas selecionadas?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a excluir <strong>{selectedKeys.size}</strong> grupo{selectedKeys.size > 1 ? "s" : ""} de metas e todos os seus valores. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteSelected} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
