import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox";
import { ArrowLeft, Search, Plus, Loader2, Target, Pencil, Save, TrendingUp, Users, Calendar, Trash2, CheckSquare } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useUnits, useSalesTeam, useCategories, useSegments } from "@/hooks/useSupabaseData";

const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const ROLE_LABELS: Record<string, string> = {
  dsn: "DSN",
  gsn: "GSN",
  esn: "ESN",
  arquiteto: "EV",
};

const ROLE_OPTIONS = [
  { value: "esn", label: "Executivo de Vendas (ESN)" },
  { value: "gsn", label: "Gerente de Vendas (GSN)" },
  { value: "dsn", label: "Diretor de Vendas (DSN)" },
  { value: "arquiteto", label: "Engenheiro de Valor (EV)" },
];

/* ── Summary row: one per member ── */
type SummaryRow = {
  esn_id: string;
  name: string;
  code: string;
  role: string;
  unit_id: string | null;
  linked_gsn_id: string | null;
  /** category_id → total amount */
  categoryTotals: Record<string, number>;
  grandTotal: number;
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

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [saving, setSaving] = useState(false);

  // Context fields (shared create/edit)
  const [editEsnId, setEditEsnId] = useState("");
  const [editUnitId, setEditUnitId] = useState("");
  const [editRole, setEditRole] = useState("esn");
  const [editSegmentId, setEditSegmentId] = useState("");
  const [editYear, setEditYear] = useState(String(currentYear));

  // Grid: categoryId → month → value string
  const [gridValues, setGridValues] = useState<Record<string, Record<number, string>>>({});
  // Which category rows are shown in the grid
  const [gridCategoryIds, setGridCategoryIds] = useState<string[]>([]);
  // Existing record IDs for edit: categoryId_month → id
  const [existingIds, setExistingIds] = useState<Record<string, string>>({});

  // Selection / delete
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: categories = [] } = useCategories();
  const { data: segments = [] } = useSegments();
  const { data: units = [] } = useUnits();
  const { data: fullSalesTeam = [] } = useSalesTeam();

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
  const allEsns = useMemo(() => fullSalesTeam.sort((a: any, b: any) => a.name.localeCompare(b.name)), [fullSalesTeam]);
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

  // Sort categories for consistent column order
  const sortedCategories = useMemo(() => [...categories].sort((a: any, b: any) => a.name.localeCompare(b.name)), [categories]);

  /* ── Build summary rows: group by esn_id + segment_id ── */
  const summaryRows: SummaryRow[] = useMemo(() => {
    const map = new Map<string, SummaryRow>();
    for (const t of targets) {
      const key = t.esn_id;
      if (!map.has(key)) {
      const esn: any = esnMap.get(t.esn_id);
        map.set(key, {
          esn_id: t.esn_id,
          name: esn?.name || "—",
          code: esn?.code || "—",
          role: (t as any).role || "esn",
          unit_id: (t as any).unit_id || esn?.unit_id || null,
          linked_gsn_id: esn?.linked_gsn_id || null,
          categoryTotals: {},
          grandTotal: 0,
        });
      }
      const row = map.get(key)!;
      const catId = (t as any).category_id || "sem_categoria";
      row.categoryTotals[catId] = (row.categoryTotals[catId] || 0) + (t.amount || 0);
      row.grandTotal += (t.amount || 0);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [targets, esnMap]);

  /* ── Filter summary rows ── */
  const filtered = useMemo(() => {
    let result = summaryRows;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(g => g.name.toLowerCase().includes(q) || g.code.toLowerCase().includes(q));
    }
    if (filterUnitIds.length > 0) result = result.filter(g => g.unit_id && filterUnitIds.includes(g.unit_id));
    if (filterGsnIds.length > 0) result = result.filter(g => g.linked_gsn_id && filterGsnIds.includes(g.linked_gsn_id));
    if (filterSegmentIds.length > 0) {
      // Filter by checking if the member has ANY target with the selected segment
      const memberSegments = new Map<string, Set<string>>();
      for (const t of targets) {
        const segId = (t as any).segment_id;
        if (segId) {
          if (!memberSegments.has(t.esn_id)) memberSegments.set(t.esn_id, new Set());
          memberSegments.get(t.esn_id)!.add(segId);
        }
      }
      result = result.filter(g => {
        const segs = memberSegments.get(g.esn_id);
        return segs && filterSegmentIds.some(sid => segs.has(sid));
      });
    }
    if (filterRoles.length > 0) result = result.filter(g => filterRoles.includes(g.role));
    if (filterCategoryIds.length > 0) {
      result = result.filter(g => filterCategoryIds.some(cid => (g.categoryTotals[cid] || 0) > 0));
    }
    return result;
  }, [summaryRows, search, filterUnitIds, filterGsnIds, filterCategoryIds, filterSegmentIds, filterRoles]);

  const activeFilterCount = (filterUnitIds.length > 0 ? 1 : 0) + (filterGsnIds.length > 0 ? 1 : 0) + (filterCategoryIds.length > 0 ? 1 : 0) + (filterSegmentIds.length > 0 ? 1 : 0) + (filterRoles.length > 0 ? 1 : 0);

  const grandTotal = useMemo(() => filtered.reduce((s, r) => s + r.grandTotal, 0), [filtered]);

  // KPI cards: total by category from filtered data
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

  const getCategoryName = (id: string | null) => id ? categories.find((c: any) => c.id === id)?.name || "—" : "—";
  const getSegmentName = (id: string | null) => id ? segments.find((s: any) => s.id === id)?.name || "—" : "—";
  const getUnitName = (id: string | null) => id ? units.find((u: any) => u.id === id)?.name : null;

  const getRowKey = (row: SummaryRow) => row.esn_id;

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
      // Get all target IDs for selected member+segment combos
      const idsToDelete: string[] = [];
      for (const key of selectedKeys) {
        const [esnId, segId] = key.split("__");
        const realSegId = segId === "none" ? null : segId;
        for (const t of targets) {
          if (t.esn_id === esnId && ((t as any).segment_id || null) === realSegId) {
            idsToDelete.push(t.id);
          }
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

  /* ── Open Edit Dialog ── */
  function openEditDialog(row: SummaryRow) {
    if (!isAdmin) return;
    setIsCreateMode(false);
    setEditEsnId(row.esn_id);
    setEditUnitId(row.unit_id || "");
    setEditRole(row.role);
    setEditSegmentId("");
    setEditYear(yearFilter);

    // Find all targets for this member to populate the grid
    const relevantTargets = targets.filter((t: any) => t.esn_id === row.esn_id);

    // Build grid values and existing IDs
    const catIds = new Set<string>();
    const values: Record<string, Record<number, string>> = {};
    const ids: Record<string, string> = {};

    for (const t of relevantTargets) {
      const catId = (t as any).category_id || "";
      if (!catId) continue;
      catIds.add(catId);
      if (!values[catId]) values[catId] = {};
      // Sum values for same category+month (since we removed unique constraints)
      const current = Number(values[catId][t.month] || "0");
      values[catId][t.month] = String(current + (t.amount || 0));
      // Store IDs (may have multiple per cat+month, store comma-separated)
      const idKey = `${catId}_${t.month}`;
      ids[idKey] = ids[idKey] ? `${ids[idKey]},${t.id}` : t.id;
    }

    // Fill empty months with "0"
    for (const catId of catIds) {
      for (let m = 1; m <= 12; m++) {
        if (!values[catId][m]) values[catId][m] = "0";
      }
    }

    setGridCategoryIds(Array.from(catIds));
    setGridValues(values);
    setExistingIds(ids);
    setEditDialogOpen(true);
  }

  /* ── Open Create Dialog ── */
  function openCreateDialog() {
    setIsCreateMode(true);
    const firstEsn = allEsns[0];
    setEditEsnId(firstEsn?.id || "");
    setEditUnitId(firstEsn?.unit_id || "");
    setEditRole("esn");
    setEditSegmentId("");
    setEditYear(yearFilter);

    // Start with all categories
    const catIds = sortedCategories.map((c: any) => c.id);
    const values: Record<string, Record<number, string>> = {};
    for (const catId of catIds) {
      values[catId] = {};
      for (let m = 1; m <= 12; m++) values[catId][m] = "0";
    }
    setGridCategoryIds(catIds);
    setGridValues(values);
    setExistingIds({});
    setEditDialogOpen(true);
  }

  /* ── Add category row to grid ── */
  function addCategoryRow() {
    // Find categories not yet in the grid
    const available = sortedCategories.filter((c: any) => !gridCategoryIds.includes(c.id));
    if (available.length === 0) {
      toast({ title: "Todas as categorias já estão na grade" });
      return;
    }
    const newCatId = available[0].id;
    setGridCategoryIds(prev => [...prev, newCatId]);
    setGridValues(prev => {
      const row: Record<number, string> = {};
      for (let m = 1; m <= 12; m++) row[m] = "0";
      return { ...prev, [newCatId]: row };
    });
  }

  /* ── Change category for a row ── */
  function changeCategoryForRow(oldCatId: string, newCatId: string) {
    if (oldCatId === newCatId) return;
    setGridCategoryIds(prev => prev.map(id => id === oldCatId ? newCatId : id));
    setGridValues(prev => {
      const updated = { ...prev };
      updated[newCatId] = updated[oldCatId] || {};
      for (let m = 1; m <= 12; m++) {
        if (!updated[newCatId][m]) updated[newCatId][m] = "0";
      }
      delete updated[oldCatId];
      return updated;
    });
  }

  /* ── Remove category row ── */
  function removeCategoryRow(catId: string) {
    setGridCategoryIds(prev => prev.filter(id => id !== catId));
    setGridValues(prev => {
      const updated = { ...prev };
      delete updated[catId];
      return updated;
    });
  }

  /* ── Save ── */
  async function handleSave() {
    if (!editEsnId || !editSegmentId || !editUnitId) {
      toast({ title: "Preencha todos os campos de contexto", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (isCreateMode) {
        // Insert all non-zero values
        const rows: any[] = [];
        for (const catId of gridCategoryIds) {
          for (let m = 1; m <= 12; m++) {
            const val = Number(gridValues[catId]?.[m] || "0");
            const amount = Math.round(val * 100) / 100;
            if (amount === 0) continue;
            rows.push({
              esn_id: editEsnId,
              year: Number(editYear),
              month: m,
              amount,
              category_id: catId,
              segment_id: editSegmentId,
              role: editRole,
              unit_id: editUnitId,
            });
          }
        }
        if (rows.length === 0) {
          toast({ title: "Preencha ao menos um valor", variant: "destructive" });
          setSaving(false);
          return;
        }
        const { error } = await supabase.from("sales_targets").insert(rows);
        if (error) throw error;
        toast({ title: "Metas adicionadas com sucesso!" });
      } else {
        // Edit mode: delete all existing records for this member+segment+year, then re-insert
        const existingTargetIds: string[] = [];
        for (const t of targets) {
          if (t.esn_id === editEsnId && ((t as any).segment_id || null) === (editSegmentId || null)) {
            existingTargetIds.push(t.id);
          }
        }
        // Delete in batches
        for (let i = 0; i < existingTargetIds.length; i += 100) {
          const batch = existingTargetIds.slice(i, i + 100);
          const { error } = await supabase.from("sales_targets").delete().in("id", batch);
          if (error) throw error;
        }
        // Insert new values
        const rows: any[] = [];
        for (const catId of gridCategoryIds) {
          for (let m = 1; m <= 12; m++) {
            const val = Number(gridValues[catId]?.[m] || "0");
            const amount = Math.round(val * 100) / 100;
            if (amount === 0) continue;
            rows.push({
              esn_id: editEsnId,
              year: Number(editYear),
              month: m,
              amount,
              category_id: catId,
              segment_id: editSegmentId,
              role: editRole,
              unit_id: editUnitId,
            });
          }
        }
        if (rows.length > 0) {
          const { error } = await supabase.from("sales_targets").insert(rows);
          if (error) throw error;
        }
        toast({ title: "Metas atualizadas!" });
      }
      qc.invalidateQueries({ queryKey: ["sales-targets"] });
      setEditDialogOpen(false);
      setIsCreateMode(false);
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  /* ── Grid totals ── */
  const getRowTotal = (catId: string) => {
    const vals = gridValues[catId] || {};
    return Object.values(vals).reduce((s, v) => s + (Number(v) || 0), 0);
  };
  const getColTotal = (month: number) => {
    return gridCategoryIds.reduce((s, catId) => s + (Number(gridValues[catId]?.[month] || "0") || 0), 0);
  };
  const getGridGrandTotal = () => gridCategoryIds.reduce((s, catId) => s + getRowTotal(catId), 0);

  // Categories available to add (not yet in grid)
  const availableCatsToAdd = useMemo(() => sortedCategories.filter((c: any) => !gridCategoryIds.includes(c.id)), [sortedCategories, gridCategoryIds]);

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
              <Button size="sm" variant="secondary" className="bg-white/15 text-primary-foreground border-white/20 hover:bg-white/25" onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-1.5" /> Adicionar Meta
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── KPI por Categoria ── */}
      <div className={cn("grid gap-3", categoryKpiTotals.length <= 3 ? "grid-cols-1 sm:grid-cols-3" : categoryKpiTotals.length <= 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5")}>
        {categoryKpiTotals.map((cat) => (
          <Card key={cat.name} className="border-border/50 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2.5">
                <Target className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium truncate">{cat.name}</p>
                <p className="text-lg font-bold text-foreground tabular-nums leading-tight">{formatCurrency(cat.total)}</p>
              </div>
            </CardContent>
          </Card>
        ))}
        {categoryKpiTotals.length === 0 && (
          <p className="text-sm text-muted-foreground col-span-full py-2">Nenhuma meta encontrada com os filtros atuais.</p>
        )}
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
              <span className="text-xs text-muted-foreground tabular-nums">
                {filtered.length} registro{filtered.length !== 1 ? "s" : ""}
              </span>
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

      {/* ── Table: Member + Segment + Category Columns ── */}
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
                    <th className={cn("sticky z-30 bg-muted backdrop-blur-sm text-left px-4 py-3 font-medium text-muted-foreground text-[11px] uppercase tracking-wider min-w-[240px] border-b border-r border-border/60", isAdmin ? "left-[40px]" : "left-0")}>
                      Membro / Segmento
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
                          onClick={() => isAdmin && openEditDialog(row)}
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-semibold text-foreground leading-tight">{row.name}</span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge className="text-[9px] px-1.5 py-0 h-4 font-medium bg-primary/10 text-primary border-primary/20">{ROLE_LABELS[row.role] || row.role.toUpperCase()}</Badge>
                              <span className="text-[10px] text-muted-foreground font-mono">{row.code}</span>
                              {unitName && (
                                <>
                                  <span className="text-muted-foreground/30">•</span>
                                  <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">{unitName}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                        {sortedCategories.map((cat: any) => {
                          const val = row.categoryTotals[cat.id] || 0;
                          return (
                            <td key={cat.id} className="text-center px-2 py-2.5" onClick={() => isAdmin && openEditDialog(row)}>
                              <span className={cn("tabular-nums text-xs", val > 0 ? "text-foreground font-medium" : "text-muted-foreground/30")}>
                                {val > 0 ? formatCompact(val) : "—"}
                              </span>
                            </td>
                          );
                        })}
                        {isAdmin && (
                          <td className="text-center px-2 py-2.5 border-l border-border/40 bg-muted/20" onClick={() => openEditDialog(row)}>
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

      {/* ── Edit / Create Dialog ── */}
      <Dialog open={editDialogOpen} onOpenChange={v => { if (!v && !saving) { setEditDialogOpen(false); setIsCreateMode(false); } }}>
        <DialogContent className="max-w-[95vw] w-[1200px] p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
          {/* Hero header */}
          <div className="bg-gradient-to-r from-primary/90 to-primary px-6 py-4 shrink-0">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/15 p-2">
                {isCreateMode ? <Plus className="h-4 w-4 text-primary-foreground" /> : <Pencil className="h-4 w-4 text-primary-foreground" />}
              </div>
              <div>
                <DialogTitle className="text-primary-foreground text-base font-semibold">
                  {isCreateMode ? "Adicionar Metas" : "Editar Metas"}
                </DialogTitle>
                <DialogDescription className="text-primary-foreground/70 text-xs mt-0.5">
                  {isCreateMode ? "Preencha o contexto e lance os valores por categoria" : "Ajuste os valores mensais na grade abaixo"}
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* Context header fields */}
          <div className="px-6 pt-4 pb-3 border-b border-border/60 bg-muted/20 shrink-0">
            <div className="flex items-center gap-2 mb-2.5">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Contexto</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {isCreateMode ? (
                <>
                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <Label className="text-[10px] text-muted-foreground font-medium">Membro</Label>
                    <Select value={editEsnId} onValueChange={(val) => {
                      setEditEsnId(val);
                      const member = esnMap.get(val);
                      if (member?.unit_id) setEditUnitId(member.unit_id);
                    }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {allEsns.map((e: any) => (
                          <SelectItem key={e.id} value={e.id}>{e.name} ({e.code})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground font-medium">Unidade</Label>
                    <Select value={editUnitId} onValueChange={setEditUnitId}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{units.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground font-medium">Ano</Label>
                    <Select value={editYear} onValueChange={setEditYear}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground font-medium">Nível</Label>
                    <Select value={editRole} onValueChange={setEditRole}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{ROLE_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground font-medium">Segmento</Label>
                    <Select value={editSegmentId} onValueChange={setEditSegmentId}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{segments.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <Label className="text-[10px] text-muted-foreground font-medium">Membro</Label>
                    <p className="text-sm font-medium text-foreground truncate leading-8">{esnMap.get(editEsnId)?.name || "—"} <span className="text-[10px] text-muted-foreground font-mono">({esnMap.get(editEsnId)?.code || "—"})</span></p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground font-medium">Unidade</Label>
                    <Select value={editUnitId} onValueChange={setEditUnitId}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{units.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground font-medium">Ano</Label>
                    <p className="text-sm font-medium text-foreground leading-8">{editYear}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground font-medium">Nível</Label>
                    <Select value={editRole} onValueChange={setEditRole}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{ROLE_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground font-medium">Segmento</Label>
                    <Select value={editSegmentId} onValueChange={setEditSegmentId}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{segments.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Spreadsheet grid */}
          <div className="flex-1 overflow-auto px-6 py-4 min-h-0">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Grade de Lançamento</span>
              <span className="text-[10px] text-muted-foreground ml-auto">Valores em R$</span>
            </div>
            <div className="overflow-auto rounded-lg border border-border/60">
              <table className="w-full text-sm border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-muted/80">
                    <th className="sticky left-0 z-10 bg-muted text-left px-3 py-2.5 font-medium text-muted-foreground text-[10px] uppercase tracking-wider min-w-[160px] border-r border-border/60">
                      Categoria
                    </th>
                    {MONTH_NAMES.map((m) => (
                      <th key={m} className="text-center px-1 py-2.5 font-medium text-muted-foreground text-[10px] uppercase tracking-wider min-w-[72px] border-r border-border/30">
                        {m}
                      </th>
                    ))}
                    <th className="text-center px-2 py-2.5 font-semibold text-muted-foreground text-[10px] uppercase tracking-wider min-w-[100px] bg-muted border-l border-border/60">
                      Total
                    </th>
                    <th className="w-[36px] border-l border-border/30" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {gridCategoryIds.map((catId) => {
                    const cat = categories.find((c: any) => c.id === catId);
                    const rowTotal = getRowTotal(catId);
                    const hasExisting = Object.keys(existingIds).some(k => k.startsWith(`${catId}_`));
                    return (
                      <tr key={catId} className="group hover:bg-accent/30 transition-colors">
                        <td className="sticky left-0 z-10 bg-background group-hover:bg-accent/30 transition-colors px-3 py-1.5 border-r border-border/60">
                          {/* If it's a new row without existing data, allow changing category */}
                          {!hasExisting && !isCreateMode ? (
                            <Select value={catId} onValueChange={(newId) => changeCategoryForRow(catId, newId)}>
                              <SelectTrigger className="h-7 text-xs border-transparent bg-transparent hover:bg-muted/40 px-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {sortedCategories.filter((c: any) => c.id === catId || !gridCategoryIds.includes(c.id)).map((c: any) => (
                                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : isCreateMode ? (
                            <Select value={catId} onValueChange={(newId) => changeCategoryForRow(catId, newId)}>
                              <SelectTrigger className="h-7 text-xs border-transparent bg-transparent hover:bg-muted/40 px-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {sortedCategories.filter((c: any) => c.id === catId || !gridCategoryIds.includes(c.id)).map((c: any) => (
                                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs font-semibold text-foreground">{cat?.name || "—"}</span>
                          )}
                        </td>
                        {Array.from({ length: 12 }, (_, i) => {
                          const m = i + 1;
                          const val = gridValues[catId]?.[m] ?? "0";
                          return (
                            <td key={m} className="px-0.5 py-1 border-r border-border/20">
                              <Input
                                type="number"
                                value={val}
                                onChange={e => setGridValues(prev => ({
                                  ...prev,
                                  [catId]: { ...prev[catId], [m]: e.target.value }
                                }))}
                                className="h-7 text-xs tabular-nums text-right font-medium px-1.5 border-transparent bg-transparent hover:bg-muted/40 focus:bg-background focus:border-primary/40 transition-colors rounded-sm"
                                onFocus={e => e.target.select()}
                              />
                            </td>
                          );
                        })}
                        <td className="text-center px-2 py-1.5 bg-muted/20 border-l border-border/60">
                          <span className="text-xs font-bold tabular-nums text-foreground">
                            {rowTotal.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
                        </td>
                        <td className="text-center px-1 py-1.5 border-l border-border/30">
                          {gridCategoryIds.length > 1 && (
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground/40 hover:text-destructive" onClick={() => removeCategoryRow(catId)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/60 border-t-2 border-border">
                    <td className="sticky left-0 z-10 bg-muted px-3 py-2 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground border-r border-border/60">
                      Total Geral
                    </td>
                    {Array.from({ length: 12 }, (_, i) => {
                      const colTotal = getColTotal(i + 1);
                      return (
                        <td key={i} className="text-center px-1 py-2 text-xs font-bold tabular-nums text-foreground border-r border-border/20">
                          {colTotal > 0 ? formatCompact(colTotal) : "—"}
                        </td>
                      );
                    })}
                    <td className="text-center px-2 py-2 bg-muted border-l border-border/60">
                      <span className="text-sm font-bold tabular-nums text-primary">
                        {formatCurrency(getGridGrandTotal())}
                      </span>
                    </td>
                    <td className="border-l border-border/30" />
                  </tr>
                </tfoot>
              </table>
            </div>
            {/* Add category button */}
            {availableCatsToAdd.length > 0 && (
              <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs text-muted-foreground gap-1" onClick={addCategoryRow}>
                <Plus className="h-3 w-3" /> Adicionar Categoria
              </Button>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border/60 px-6 py-3 flex items-center justify-end gap-2 bg-muted/20 shrink-0">
            <Button variant="ghost" onClick={() => { setEditDialogOpen(false); setIsCreateMode(false); }} disabled={saving} className="h-9">
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || !editEsnId || !editSegmentId || !editUnitId} className="h-9">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
              {isCreateMode ? "Adicionar Metas" : "Salvar Metas"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
