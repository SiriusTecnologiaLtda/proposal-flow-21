import { useState, useMemo } from "react";
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
const MONTH_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

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

type GroupedRow = {
  esn_id: string;
  category_id: string | null;
  segment_id: string | null;
  role: string;
  name: string;
  code: string;
  unit_id: string | null;
  linked_gsn_id: string | null;
  months: Record<number, { id: string; amount: number; unit_id?: string }>;
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

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editRow, setEditRow] = useState<GroupedRow | null>(null);
  const [editMonthValues, setEditMonthValues] = useState<Record<number, string>>({});
  const [editUnitId, setEditUnitId] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editSegmentId, setEditSegmentId] = useState("");
  const [saving, setSaving] = useState(false);

  const [isCreateMode, setIsCreateMode] = useState(false);
  const [newEsnId, setNewEsnId] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [newSegmentId, setNewSegmentId] = useState("");
  const [newRole, setNewRole] = useState("esn");
  const [newUnitId, setNewUnitId] = useState("");
  const [newYear, setNewYear] = useState(String(currentYear));

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
      // Paginate to avoid the 1000-row default limit
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

  const esnList = useMemo(() =>
    fullSalesTeam.filter((m: any) => m.role === "esn").sort((a: any, b: any) => a.name.localeCompare(b.name)),
    [fullSalesTeam]
  );
  const gsnList = useMemo(() =>
    fullSalesTeam.filter((m: any) => m.role === "gsn").sort((a: any, b: any) => a.name.localeCompare(b.name)),
    [fullSalesTeam]
  );
  // Map ALL sales team members (ESN, GSN, DSN, EV) so any role resolves a name
  const esnMap = useMemo(() => new Map(fullSalesTeam.map((e: any) => [e.id, e])), [fullSalesTeam]);
  const unitOptions = useMemo(() => units.map((u: any) => ({ value: u.id, label: u.name })), [units]);
  const gsnOptions = useMemo(() => gsnList.map((g: any) => ({ value: g.id, label: `${g.name} (${g.code})` })), [gsnList]);
  const categoryOptions = useMemo(() => categories.map((c: any) => ({ value: c.id, label: c.name })), [categories]);
  const segmentOptions = useMemo(() => segments.map((s: any) => ({ value: s.id, label: s.name })), [segments]);

  const grouped: GroupedRow[] = useMemo(() => {
    const map = new Map<string, GroupedRow>();
    for (const t of targets) {
      const tRole = (t as any).role || "esn";
      const key = `${t.esn_id}__${(t as any).category_id || "none"}__${(t as any).segment_id || "none"}__${tRole}`;
      if (!map.has(key)) {
        const esn = esnMap.get(t.esn_id);
        map.set(key, {
          esn_id: t.esn_id,
          category_id: (t as any).category_id || null,
          segment_id: (t as any).segment_id || null,
          role: tRole,
          name: esn?.name || "—",
          code: esn?.code || "—",
          unit_id: (t as any).unit_id || esn?.unit_id || null,
          linked_gsn_id: esn?.linked_gsn_id || null,
          months: {},
        });
      }
      map.get(key)!.months[t.month] = { id: t.id, amount: t.amount, unit_id: (t as any).unit_id };
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [targets, esnMap]);

  const filtered = useMemo(() => {
    let result = grouped;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(g => g.name.toLowerCase().includes(q) || g.code.toLowerCase().includes(q));
    }
    if (filterUnitIds.length > 0) result = result.filter(g => g.unit_id && filterUnitIds.includes(g.unit_id));
    if (filterGsnIds.length > 0) result = result.filter(g => g.linked_gsn_id && filterGsnIds.includes(g.linked_gsn_id));
    if (filterCategoryIds.length > 0) result = result.filter(g => g.category_id && filterCategoryIds.includes(g.category_id));
    if (filterSegmentIds.length > 0) result = result.filter(g => g.segment_id && filterSegmentIds.includes(g.segment_id));
    if (filterRoles.length > 0) result = result.filter(g => filterRoles.includes(g.role));
    return result;
  }, [grouped, search, filterUnitIds, filterGsnIds, filterCategoryIds, filterSegmentIds, filterRoles]);

  const activeFilterCount = (filterUnitIds.length > 0 ? 1 : 0) + (filterGsnIds.length > 0 ? 1 : 0) + (filterCategoryIds.length > 0 ? 1 : 0) + (filterSegmentIds.length > 0 ? 1 : 0) + (filterRoles.length > 0 ? 1 : 0);

  const years = useMemo(() => {
    const y = new Set([currentYear - 1, currentYear, currentYear + 1, currentYear + 2]);
    targets.forEach(t => y.add(t.year));
    return Array.from(y).sort();
  }, [targets, currentYear]);

  const allEsns = useMemo(() =>
    fullSalesTeam.sort((a: any, b: any) => a.name.localeCompare(b.name)),
    [fullSalesTeam]
  );

  const addEsnMutation = useMutation({
    mutationFn: async ({ esn_id, category_id, segment_id, role, monthValues, unit_id }: { esn_id: string; category_id: string; segment_id: string; role: string; monthValues: Record<number, string>; unit_id: string }) => {
      if (!unit_id) throw new Error("Selecione uma unidade para a meta.");
      const rows = Array.from({ length: 12 }, (_, i) => ({
        esn_id,
        year: Number(newYear),
        month: i + 1,
        amount: Number(monthValues[i + 1]) || 0,
        category_id,
        segment_id,
        role,
        unit_id,
      }));
      const { error } = await supabase.from("sales_targets").insert(rows as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-targets"] });
      setEditDialogOpen(false);
      setIsCreateMode(false);
      setNewEsnId("");
      setNewCategoryId("");
      setNewSegmentId("");
      setNewRole("esn");
      setNewUnitId("");
      setNewYear(yearFilter);
      toast({ title: "Meta adicionada com sucesso!" });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

  const formatCompact = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
    return String(v);
  };

  const grandTotalMeta = useMemo(() =>
    filtered.reduce((s, r) => s + Object.values(r.months).reduce((ms, m) => ms + m.amount, 0), 0),
    [filtered]
  );

  function openEditDialog(row: GroupedRow) {
    if (!isAdmin) return;
    setEditRow(row);
    const values: Record<number, string> = {};
    for (let m = 1; m <= 12; m++) {
      values[m] = String(row.months[m]?.amount || 0);
    }
    setEditMonthValues(values);
    setEditUnitId(row.unit_id || "");
    setEditRole(row.role || "esn");
    setEditCategoryId(row.category_id || "");
    setEditSegmentId(row.segment_id || "");
    setEditDialogOpen(true);
  }

  async function saveEditDialog() {
    if (!editRow) return;
    if (!editUnitId) {
      toast({ title: "Selecione uma unidade", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      for (let m = 1; m <= 12; m++) {
        const newAmount = Number(editMonthValues[m]) || 0;
        const existing = editRow.months[m];
        if (existing) {
          const updates: any = {};
          if (existing.amount !== newAmount) updates.amount = newAmount;
          if (existing.unit_id !== editUnitId) updates.unit_id = editUnitId;
          if (editRole !== editRow.role) updates.role = editRole;
          if (editCategoryId !== editRow.category_id) updates.category_id = editCategoryId;
          if (editSegmentId !== editRow.segment_id) updates.segment_id = editSegmentId;
          if (Object.keys(updates).length > 0) {
            const { error } = await supabase.from("sales_targets").update(updates).eq("id", existing.id);
            if (error) throw error;
          }
        } else if (newAmount > 0) {
          const insertData: any = {
            esn_id: editRow.esn_id,
            year: Number(yearFilter),
            month: m,
            amount: newAmount,
            unit_id: editUnitId,
            category_id: editCategoryId,
            segment_id: editSegmentId,
            role: editRole,
          };
          const { error } = await supabase.from("sales_targets").insert(insertData);
          if (error) throw error;
        }
      }
      qc.invalidateQueries({ queryKey: ["sales-targets"] });
      toast({ title: "Metas atualizadas!" });
      setEditDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const editDialogTotal = useMemo(() => {
    return Object.values(editMonthValues).reduce((s, v) => s + (Number(v) || 0), 0);
  }, [editMonthValues]);

  const getCategoryName = (id: string | null) => id ? categories.find((c: any) => c.id === id)?.name || "—" : "—";
  const getSegmentName = (id: string | null) => id ? segments.find((s: any) => s.id === id)?.name || "—" : "—";
  const getUnitName = (id: string | null) => id ? units.find((u: any) => u.id === id)?.name : null;

  // Row key helper
  const getRowKey = (row: GroupedRow) => `${row.esn_id}__${row.category_id || "none"}__${row.segment_id || "none"}__${row.role}`;

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
    if (allSelected) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(allFilteredKeys));
    }
  };

  async function deleteSelected() {
    setDeleting(true);
    try {
      const idsToDelete: string[] = [];
      for (const key of selectedKeys) {
        const row = filtered.find(r => getRowKey(r) === key);
        if (row) {
          Object.values(row.months).forEach(m => idsToDelete.push(m.id));
        }
      }
      let deletedCount = 0;
      // Delete in batches of 100
      for (let i = 0; i < idsToDelete.length; i += 100) {
        const batch = idsToDelete.slice(i, i + 100);
        const { error, count } = await supabase.from("sales_targets").delete({ count: "exact" }).in("id", batch);
        if (error) throw error;
        deletedCount += count || 0;
      }
      await qc.invalidateQueries({ queryKey: ["sales-targets"] });
      if (deletedCount === 0) {
        toast({ title: "Nenhuma meta foi excluída", description: "Verifique suas permissões.", variant: "destructive" });
      } else if (deletedCount < idsToDelete.length) {
        toast({ title: `${deletedCount} de ${idsToDelete.length} registro(s) excluído(s)`, description: "Alguns registros não puderam ser removidos." });
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

  // KPI cards: total by category from filtered data
  const categoryTotals = useMemo(() => {
    const map = new Map<string, { name: string; total: number }>();
    for (const row of filtered) {
      const catId = row.category_id || "sem_categoria";
      const catName = categories.find(c => c.id === row.category_id)?.name || "Sem Categoria";
      const rowTotal = Object.values(row.months).reduce((s, m) => s + m.amount, 0);
      const entry = map.get(catId);
      if (entry) { entry.total += rowTotal; } else { map.set(catId, { name: catName, total: rowTotal }); }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered, categories]);

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────── */}
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
                <p className="text-xs text-primary-foreground/70 mt-0.5">Gestão de metas mensais por executivo de negócios</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button size="sm" variant="secondary" className="bg-white/15 text-primary-foreground border-white/20 hover:bg-white/25" onClick={() => {
                setIsCreateMode(true);
                setEditRow(null);
                const firstEsn = allEsns[0];
                setNewEsnId(firstEsn?.id || "");
                setNewUnitId(firstEsn?.unit_id || "");
                setNewCategoryId("");
                setNewSegmentId("");
                setNewRole("esn");
                setNewYear(yearFilter);
                const emptyMonths: Record<number, string> = {};
                for (let m = 1; m <= 12; m++) emptyMonths[m] = "0";
                setEditMonthValues(emptyMonths);
                setEditDialogOpen(true);
              }}>
                <Plus className="h-4 w-4 mr-1.5" /> Adicionar Meta
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── KPI por Categoria ──────────────────────────────────── */}
      <div className={cn("grid gap-3", categoryTotals.length <= 3 ? "grid-cols-1 sm:grid-cols-3" : categoryTotals.length <= 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5")}>
        {categoryTotals.map((cat) => (
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
        {categoryTotals.length === 0 && (
          <p className="text-sm text-muted-foreground col-span-full py-2">Nenhuma meta encontrada com os filtros atuais.</p>
        )}
      </div>

      {/* ── Filters ────────────────────────────────────────────── */}
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
              <Input placeholder="Pesquisar ESN..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
            </div>
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <MultiSelectCombobox options={ROLE_OPTIONS.map(r => ({ value: r.value, label: r.label }))} selected={filterRoles} onChange={setFilterRoles} placeholder="Nível" searchPlaceholder="Buscar nível..." className="h-9" />
            <MultiSelectCombobox options={unitOptions} selected={filterUnitIds} onChange={setFilterUnitIds} placeholder="Unidade" searchPlaceholder="Buscar unidade..." className="h-9" />
            <MultiSelectCombobox options={gsnOptions} selected={filterGsnIds} onChange={setFilterGsnIds} placeholder="GSN" searchPlaceholder="Buscar GSN..." className="h-9" />
            <MultiSelectCombobox options={categoryOptions} selected={filterCategoryIds} onChange={setFilterCategoryIds} placeholder="Categoria" searchPlaceholder="Buscar categoria..." className="h-9" />
            <MultiSelectCombobox options={segmentOptions} selected={filterSegmentIds} onChange={setFilterSegmentIds} placeholder="Segmento" searchPlaceholder="Buscar segmento..." className="h-9" />
          </div>
        </CardContent>
      </Card>

      {/* ── Selection Action Bar ──────────────────────────────── */}
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

      {/* ── Table ──────────────────────────────────────────────── */}
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
                {search || activeFilterCount > 0 ? "Nenhum ESN encontrado com os filtros aplicados." : `Nenhuma meta cadastrada para ${yearFilter}.`}
              </p>
            </div>
          ) : (
            <div className="overflow-auto max-h-[calc(100vh-460px)]">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-muted/80 backdrop-blur-sm">
                    {isAdmin && (
                      <th className="sticky left-0 z-30 bg-muted backdrop-blur-sm px-2 py-3 w-[40px] border-b border-r border-border/60">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={toggleAll}
                          aria-label="Selecionar todos"
                          className="mx-auto block"
                        />
                      </th>
                    )}
                    <th className={cn("sticky z-30 bg-muted backdrop-blur-sm text-left px-4 py-3 font-medium text-muted-foreground text-[11px] uppercase tracking-wider min-w-[240px] border-b border-r border-border/60", isAdmin ? "left-[40px]" : "left-0")}>
                      Executivo de Negócios
                    </th>
                    {MONTH_NAMES.map((m, i) => (
                      <th key={i} className="text-center px-1.5 py-3 font-medium text-muted-foreground text-[11px] uppercase tracking-wider min-w-[80px] border-b border-border/60">
                        {m}
                      </th>
                    ))}
                    <th className="text-center px-3 py-3 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider min-w-[110px] border-b border-l border-border/60 bg-muted">
                      Total Anual
                    </th>
                    {isAdmin && (
                      <th className="text-center px-2 py-3 w-[44px] border-b border-l border-border/60 bg-muted" />
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filtered.map((row) => {
                    const total = Object.values(row.months).reduce((s, m) => s + m.amount, 0);
                    const unitName = getUnitName(row.unit_id);
                    const catName = getCategoryName(row.category_id);
                    const segName = getSegmentName(row.segment_id);
                    const rowKey = getRowKey(row);
                    const isSelected = selectedKeys.has(rowKey);
                    return (
                      <tr
                        key={rowKey}
                        className={cn(
                          "group transition-colors hover:bg-accent/40",
                          isAdmin && "cursor-pointer",
                          isSelected && "bg-primary/5"
                        )}
                      >
                        {isAdmin && (
                          <td className="sticky left-0 z-10 px-2 py-2.5 border-r border-border/40 bg-background group-hover:bg-accent/40 transition-colors"
                              style={isSelected ? { backgroundColor: 'hsl(var(--primary) / 0.05)' } : undefined}>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelect(rowKey)}
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`Selecionar ${row.name}`}
                              className="mx-auto block"
                            />
                          </td>
                        )}
                        <td
                          className={cn("sticky z-10 px-4 py-2.5 border-r border-border/40 bg-background group-hover:bg-accent/40 transition-colors", isAdmin ? "left-[40px]" : "left-0")}
                          style={isSelected ? { backgroundColor: 'hsl(var(--primary) / 0.05)' } : undefined}
                          onClick={() => isAdmin && openEditDialog(row)}
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm text-foreground font-medium leading-tight">{row.name}</span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge className="text-[9px] px-1.5 py-0 h-4 font-medium bg-primary/10 text-primary border-primary/20">{ROLE_LABELS[row.role] || row.role.toUpperCase()}</Badge>
                              <span className="text-[10px] text-muted-foreground font-mono">{row.code}</span>
                              {unitName && (
                                <>
                                  <span className="text-muted-foreground/30">•</span>
                                  <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">{unitName}</span>
                                </>
                              )}
                              {row.category_id && (
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-normal">{catName}</Badge>
                              )}
                              {row.segment_id && (
                                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-normal">{segName}</Badge>
                              )}
                            </div>
                          </div>
                        </td>
                        {Array.from({ length: 12 }, (_, i) => {
                          const month = i + 1;
                          const m = row.months[month];
                          return (
                            <td key={i} className="text-center px-1.5 py-2.5" onClick={() => isAdmin && openEditDialog(row)}>
                              <span className={cn(
                                "tabular-nums text-xs",
                                m && m.amount > 0 ? "text-foreground font-medium" : "text-muted-foreground/30"
                              )}>
                                {m && m.amount > 0 ? formatCompact(m.amount) : "—"}
                              </span>
                            </td>
                          );
                        })}
                        <td className="text-center px-3 py-2.5 font-semibold tabular-nums text-xs border-l border-border/40 bg-muted/20" onClick={() => isAdmin && openEditDialog(row)}>
                          {formatCurrency(total)}
                        </td>
                        {isAdmin && (
                          <td className="text-center px-2 py-2.5 border-l border-border/40 bg-muted/20" onClick={() => openEditDialog(row)}>
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors mx-auto" />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                {/* Totals footer */}
                <tfoot>
                  <tr className="sticky bottom-0 z-20 bg-muted backdrop-blur-sm border-t-2 border-border">
                    {isAdmin && <td className="sticky left-0 z-30 bg-muted border-r border-border/60" />}
                    <td className={cn("sticky z-30 bg-muted px-4 py-3 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold border-r border-border/60", isAdmin ? "left-[40px]" : "left-0")}>
                      Total Geral
                    </td>
                    {Array.from({ length: 12 }, (_, i) => {
                      const monthTotal = filtered.reduce((s, r) => s + (r.months[i + 1]?.amount || 0), 0);
                      return (
                        <td key={i} className="text-center px-1.5 py-3 text-xs tabular-nums text-foreground font-bold">
                          {formatCompact(monthTotal)}
                        </td>
                      );
                    })}
                    <td className="text-center px-3 py-3 text-sm tabular-nums font-bold border-l border-border/60 text-primary">
                      {formatCurrency(grandTotalMeta)}
                    </td>
                    {isAdmin && <td className="border-l border-border/60" />}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Delete Confirmation Dialog ────────────────────────── */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir metas selecionadas?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a excluir <strong>{selectedKeys.size}</strong> meta{selectedKeys.size > 1 ? "s" : ""} e todos os seus valores mensais. Esta ação não pode ser desfeita.
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

      {/* ── Edit / Create Dialog ──────────────────────────────────── */}
      <Dialog open={editDialogOpen} onOpenChange={v => { if (!v && !saving && !addEsnMutation.isPending) { setEditDialogOpen(false); setIsCreateMode(false); } }}>
        <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
          <div className="bg-gradient-to-r from-primary/90 to-primary px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/15 p-2">
                {isCreateMode ? <Plus className="h-4 w-4 text-primary-foreground" /> : <Pencil className="h-4 w-4 text-primary-foreground" />}
              </div>
              <div>
                <DialogTitle className="text-primary-foreground text-base font-semibold">
                  {isCreateMode ? "Adicionar Meta" : "Editar Metas Mensais"}
                </DialogTitle>
                <DialogDescription className="text-primary-foreground/70 text-xs mt-0.5">
                  {isCreateMode ? `Criar nova meta para o ano de ${yearFilter}` : "Ajuste os valores mensais para o executivo selecionado"}
                </DialogDescription>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {/* Context section */}
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Identificação</span>
              </div>

              {isCreateMode ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Membro da Equipe</Label>
                    <Select value={newEsnId} onValueChange={(val) => {
                      setNewEsnId(val);
                      const member = esnMap.get(val);
                      if (member?.unit_id) setNewUnitId(member.unit_id);
                    }}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Selecione o membro" /></SelectTrigger>
                      <SelectContent>
                        {allEsns.map((e: any) => (
                          <SelectItem key={e.id} value={e.id}>{e.name} ({e.code})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Ano</Label>
                      <Select value={newYear} onValueChange={setNewYear}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Ano" /></SelectTrigger>
                        <SelectContent>
                          {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Nível de Meta</Label>
                      <Select value={newRole} onValueChange={setNewRole}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map(r => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Unidade</Label>
                      <Select value={newUnitId} onValueChange={setNewUnitId}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {units.map((u: any) => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Categoria</Label>
                      <Select value={newCategoryId} onValueChange={setNewCategoryId}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {categories.map((c: any) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Segmento</Label>
                      <Select value={newSegmentId} onValueChange={setNewSegmentId}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {segments.map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ) : editRow ? (
                <div className="space-y-3">
                  <div>
                    <Label className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">Membro</Label>
                    <p className="text-sm font-medium text-foreground mt-0.5">{editRow.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{editRow.code}</p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Nível</Label>
                      <Select value={editRole} onValueChange={setEditRole}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map(r => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Ano</Label>
                      {isCreateMode ? (
                        <Select value={newYear} onValueChange={setNewYear}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Ano" /></SelectTrigger>
                          <SelectContent>
                            {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm font-medium text-foreground mt-1.5">{yearFilter}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Unidade</Label>
                      <Select value={editUnitId} onValueChange={setEditUnitId}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {units.map((u: any) => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Categoria</Label>
                      <Select value={editCategoryId} onValueChange={setEditCategoryId}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {categories.map((c: any) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Segmento</Label>
                      <Select value={editSegmentId} onValueChange={setEditSegmentId}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {segments.map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Monthly values section */}
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Valores Mensais</span>
                <span className="text-[10px] text-muted-foreground ml-auto">Valores em R$</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-4 gap-y-3">
                {Array.from({ length: 12 }, (_, i) => {
                  const m = i + 1;
                  return (
                    <div key={m} className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground font-medium">{MONTH_FULL[i]}</Label>
                      <Input
                        type="number"
                        value={editMonthValues[m] || "0"}
                        onChange={e => setEditMonthValues(prev => ({ ...prev, [m]: e.target.value }))}
                        className="h-9 text-sm tabular-nums text-right font-medium"
                        onFocus={e => e.target.select()}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Total summary */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Anual</span>
              </div>
              <span className="text-lg font-bold text-primary tabular-nums">{formatCurrency(editDialogTotal)}</span>
            </div>
          </div>

          {/* Dialog footer */}
          <div className="border-t border-border/60 px-6 py-3.5 flex items-center justify-end gap-2 bg-muted/20">
            <Button variant="ghost" onClick={() => { setEditDialogOpen(false); setIsCreateMode(false); }} disabled={saving || addEsnMutation.isPending} className="h-9">
              Cancelar
            </Button>
            {isCreateMode ? (
              <Button
                onClick={() => newEsnId && newCategoryId && newSegmentId && newUnitId && addEsnMutation.mutate({ esn_id: newEsnId, category_id: newCategoryId, segment_id: newSegmentId, role: newRole, monthValues: editMonthValues, unit_id: newUnitId })}
                disabled={!newEsnId || !newCategoryId || !newSegmentId || !newUnitId || addEsnMutation.isPending}
                className="h-9"
              >
                {addEsnMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
                Adicionar Meta
              </Button>
            ) : (
              <Button onClick={saveEditDialog} disabled={saving} className="h-9">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
                Salvar Metas
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
