import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox";
import { ArrowLeft, Search, Plus, Loader2, Target, Pencil, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnits, useSalesTeam, useCategories, useSegments } from "@/hooks/useSupabaseData";

const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTH_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

type GroupedRow = {
  esn_id: string;
  category_id: string | null;
  segment_id: string | null;
  name: string;
  code: string;
  unit_id: string | null;
  linked_gsn_id: string | null;
  months: Record<number, { id: string; amount: number }>;
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

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editRow, setEditRow] = useState<GroupedRow | null>(null);
  const [editMonthValues, setEditMonthValues] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  // Add dialog state
  const [newDialog, setNewDialog] = useState(false);
  const [newEsnId, setNewEsnId] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [newSegmentId, setNewSegmentId] = useState("");

  const { data: categories = [] } = useCategories();
  const { data: segments = [] } = useSegments();
  const { data: units = [] } = useUnits();
  const { data: fullSalesTeam = [] } = useSalesTeam();

  const { data: targets = [], isLoading } = useQuery({
    queryKey: ["sales-targets", yearFilter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_targets")
        .select("*")
        .eq("year", Number(yearFilter))
        .order("month", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const esnList = useMemo(() =>
    fullSalesTeam.filter((m: any) => m.role === "esn").sort((a: any, b: any) => a.name.localeCompare(b.name)),
    [fullSalesTeam]
  );
  const gsnList = useMemo(() =>
    fullSalesTeam.filter((m: any) => m.role === "gsn").sort((a: any, b: any) => a.name.localeCompare(b.name)),
    [fullSalesTeam]
  );
  const esnMap = useMemo(() => new Map(esnList.map((e: any) => [e.id, e])), [esnList]);
  const unitOptions = useMemo(() => units.map((u: any) => ({ value: u.id, label: u.name })), [units]);
  const gsnOptions = useMemo(() => gsnList.map((g: any) => ({ value: g.id, label: `${g.name} (${g.code})` })), [gsnList]);
  const categoryOptions = useMemo(() => categories.map((c: any) => ({ value: c.id, label: c.name })), [categories]);
  const segmentOptions = useMemo(() => segments.map((s: any) => ({ value: s.id, label: s.name })), [segments]);

  const grouped: GroupedRow[] = useMemo(() => {
    const map = new Map<string, GroupedRow>();
    for (const t of targets) {
      const key = `${t.esn_id}__${(t as any).category_id || "none"}__${(t as any).segment_id || "none"}`;
      if (!map.has(key)) {
        const esn = esnMap.get(t.esn_id);
        map.set(key, {
          esn_id: t.esn_id,
          category_id: (t as any).category_id || null,
          segment_id: (t as any).segment_id || null,
          name: esn?.name || "—",
          code: esn?.code || "—",
          unit_id: esn?.unit_id || null,
          linked_gsn_id: esn?.linked_gsn_id || null,
          months: {},
        });
      }
      map.get(key)!.months[t.month] = { id: t.id, amount: t.amount };
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
    return result;
  }, [grouped, search, filterUnitIds, filterGsnIds, filterCategoryIds, filterSegmentIds]);

  const activeFilterCount = (filterUnitIds.length > 0 ? 1 : 0) + (filterGsnIds.length > 0 ? 1 : 0) + (filterCategoryIds.length > 0 ? 1 : 0) + (filterSegmentIds.length > 0 ? 1 : 0);

  const years = useMemo(() => {
    const y = new Set([currentYear - 1, currentYear, currentYear + 1, currentYear + 2]);
    targets.forEach(t => y.add(t.year));
    return Array.from(y).sort();
  }, [targets, currentYear]);

  const availableEsns = useMemo(() => {
    const usedIds = new Set(grouped.map(g => g.esn_id));
    return esnList.filter((e: any) => !usedIds.has(e.id));
  }, [esnList, grouped]);

  const addEsnMutation = useMutation({
    mutationFn: async ({ esn_id, category_id, segment_id }: { esn_id: string; category_id: string; segment_id: string }) => {
      const rows = Array.from({ length: 12 }, (_, i) => ({
        esn_id,
        year: Number(yearFilter),
        month: i + 1,
        amount: 0,
        category_id,
        segment_id,
      }));
      const { error } = await supabase.from("sales_targets").insert(rows as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-targets"] });
      setNewDialog(false);
      setNewEsnId("");
      setNewCategoryId("");
      setNewSegmentId("");
      toast({ title: "ESN adicionado com sucesso!" });
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

  // ── Edit dialog helpers ─────────────────────────────────────────
  function openEditDialog(row: GroupedRow) {
    if (!isAdmin) return;
    setEditRow(row);
    const values: Record<number, string> = {};
    for (let m = 1; m <= 12; m++) {
      values[m] = String(row.months[m]?.amount || 0);
    }
    setEditMonthValues(values);
    setEditDialogOpen(true);
  }

  async function saveEditDialog() {
    if (!editRow) return;
    setSaving(true);
    try {
      for (let m = 1; m <= 12; m++) {
        const newAmount = Number(editMonthValues[m]) || 0;
        const existing = editRow.months[m];
        if (existing) {
          if (existing.amount !== newAmount) {
            const { error } = await supabase.from("sales_targets").update({ amount: newAmount }).eq("id", existing.id);
            if (error) throw error;
          }
        } else if (newAmount > 0) {
          const insertData: any = {
            esn_id: editRow.esn_id,
            year: Number(yearFilter),
            month: m,
            amount: newAmount,
          };
          if (editRow.category_id) insertData.category_id = editRow.category_id;
          if (editRow.segment_id) insertData.segment_id = editRow.segment_id;
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

  // ── Category/Segment helpers ────────────────────────────────────
  const getCategoryName = (id: string | null) => id ? categories.find((c: any) => c.id === id)?.name || "—" : "—";
  const getSegmentName = (id: string | null) => id ? segments.find((s: any) => s.id === id)?.name || "—" : "—";
  const getUnitName = (id: string | null) => id ? units.find((u: any) => u.id === id)?.name : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-lg bg-gradient-to-r from-primary/90 to-primary p-4 shadow-md">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/cadastros")} className="text-primary-foreground hover:bg-white/10">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-white/15 p-2">
                <Target className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-primary-foreground">Metas de Vendas</h1>
                <p className="text-xs text-primary-foreground/70">Metas mensais por ESN — clique na linha para editar</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-white/15 text-primary-foreground border-white/20 text-xs font-mono">
              Total: {formatCurrency(grandTotalMeta)}
            </Badge>
            {isAdmin && (
              <Button size="sm" variant="secondary" className="bg-white/15 text-primary-foreground border-white/20 hover:bg-white/25" onClick={() => { setNewDialog(true); setNewEsnId(availableEsns[0]?.id || ""); }}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar ESN
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-border/50 shadow-sm">
        <CardContent className="p-3">
          <div className="flex gap-2 flex-wrap items-center">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Pesquisar ESN..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
            </div>
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-[100px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <MultiSelectCombobox options={unitOptions} selected={filterUnitIds} onChange={setFilterUnitIds} placeholder="Unidade" searchPlaceholder="Buscar unidade..." className="h-9 min-w-[140px]" />
            <MultiSelectCombobox options={gsnOptions} selected={filterGsnIds} onChange={setFilterGsnIds} placeholder="GSN" searchPlaceholder="Buscar GSN..." className="h-9 min-w-[140px]" />
            <MultiSelectCombobox options={categoryOptions} selected={filterCategoryIds} onChange={setFilterCategoryIds} placeholder="Categoria" searchPlaceholder="Buscar categoria..." className="h-9 min-w-[140px]" />
            <MultiSelectCombobox options={segmentOptions} selected={filterSegmentIds} onChange={setFilterSegmentIds} placeholder="Segmento" searchPlaceholder="Buscar segmento..." className="h-9 min-w-[140px]" />
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" className="h-9 text-xs text-muted-foreground" onClick={() => { setFilterUnitIds([]); setFilterGsnIds([]); setFilterCategoryIds([]); setFilterSegmentIds([]); setSearch(""); }}>
                Limpar filtros
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">{activeFilterCount}</Badge>
              </Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {filtered.length} ESN{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden border-border/50 shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground text-sm">
              {search || activeFilterCount > 0 ? "Nenhum ESN encontrado com os filtros aplicados." : `Nenhuma meta cadastrada para ${yearFilter}.`}
            </div>
          ) : (
            <div className="overflow-auto max-h-[calc(100vh-320px)]">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-20 bg-muted/80 backdrop-blur-sm">
                  <tr>
                    <th className="sticky left-0 z-30 bg-muted/95 backdrop-blur-sm text-left px-3 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider min-w-[220px] border-b border-r border-border">
                      ESN
                    </th>
                    {MONTH_NAMES.map((m, i) => (
                      <th key={i} className="text-center px-1 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider min-w-[85px] border-b border-border">
                        {m}
                      </th>
                    ))}
                    <th className="text-center px-2 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider min-w-[100px] border-b border-l border-border bg-muted/95">
                      Total
                    </th>
                    {isAdmin && (
                      <th className="text-center px-2 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider w-[50px] border-b border-l border-border bg-muted/95" />
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, rowIdx) => {
                    const total = Object.values(row.months).reduce((s, m) => s + m.amount, 0);
                    const unitName = getUnitName(row.unit_id);
                    const catName = getCategoryName(row.category_id);
                    const segName = getSegmentName(row.segment_id);
                    return (
                      <tr
                        key={`${row.esn_id}-${row.category_id}-${row.segment_id}`}
                        className={cn(
                          "group transition-colors hover:bg-accent/30",
                          rowIdx % 2 === 0 ? "bg-background" : "bg-muted/20",
                          isAdmin && "cursor-pointer"
                        )}
                        onClick={() => isAdmin && openEditDialog(row)}
                      >
                        <td className={cn(
                          "sticky left-0 z-10 px-3 py-2 border-r border-border",
                          rowIdx % 2 === 0 ? "bg-background" : "bg-muted/20",
                          "group-hover:bg-accent/30"
                        )}>
                          <span className="text-sm text-foreground font-medium">{row.name}</span>
                          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <span>{row.code}</span>
                            {unitName && (
                              <>
                                <span className="text-muted-foreground/40">•</span>
                                <span className="truncate max-w-[80px]">{unitName}</span>
                              </>
                            )}
                            {row.category_id && (
                              <>
                                <span className="text-muted-foreground/40">•</span>
                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">{catName}</Badge>
                              </>
                            )}
                            {row.segment_id && (
                              <>
                                <span className="text-muted-foreground/40">•</span>
                                <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5">{segName}</Badge>
                              </>
                            )}
                          </span>
                        </td>
                        {Array.from({ length: 12 }, (_, i) => {
                          const month = i + 1;
                          const m = row.months[month];
                          return (
                            <td key={i} className="text-center px-1 py-1.5 border-border">
                              <span className={cn(
                                "tabular-nums text-xs",
                                m && m.amount > 0 ? "text-foreground font-medium" : "text-muted-foreground/40"
                              )}>
                                {m && m.amount > 0 ? formatCompact(m.amount) : "—"}
                              </span>
                            </td>
                          );
                        })}
                        <td className="text-center px-2 py-1.5 font-semibold tabular-nums text-xs border-l border-border bg-muted/30">
                          {formatCurrency(total)}
                        </td>
                        {isAdmin && (
                          <td className="text-center px-2 py-1.5 border-l border-border bg-muted/30">
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors mx-auto" />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {/* Totals row */}
                  <tr className="sticky bottom-0 z-20 bg-muted/95 backdrop-blur-sm font-semibold border-t-2 border-border">
                    <td className="sticky left-0 z-30 bg-muted/95 backdrop-blur-sm px-3 py-2.5 text-xs uppercase tracking-wider text-muted-foreground border-r border-border">
                      Total
                    </td>
                    {Array.from({ length: 12 }, (_, i) => {
                      const monthTotal = filtered.reduce((s, r) => s + (r.months[i + 1]?.amount || 0), 0);
                      return (
                        <td key={i} className="text-center px-1 py-2.5 text-xs tabular-nums text-foreground font-semibold">
                          {formatCompact(monthTotal)}
                        </td>
                      );
                    })}
                    <td className="text-center px-2 py-2.5 text-xs tabular-nums font-bold border-l border-border text-primary">
                      {formatCurrency(grandTotalMeta)}
                    </td>
                    {isAdmin && <td className="border-l border-border bg-muted/95" />}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Edit Dialog ──────────────────────────────────────────── */}
      <Dialog open={editDialogOpen} onOpenChange={v => { if (!v && !saving) setEditDialogOpen(false); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" />
              Editar Metas
            </DialogTitle>
          </DialogHeader>
          {editRow && (
            <div className="space-y-4">
              {/* Header section */}
              <div className="rounded-lg bg-muted/30 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <div>
                    <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">ESN</Label>
                    <p className="text-sm font-medium text-foreground">{editRow.name} <span className="text-muted-foreground">({editRow.code})</span></p>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Ano</Label>
                    <p className="text-sm font-medium text-foreground">{yearFilter}</p>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Categoria</Label>
                    <p className="text-sm text-foreground">{getCategoryName(editRow.category_id)}</p>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Segmento</Label>
                    <p className="text-sm text-foreground">{getSegmentName(editRow.segment_id)}</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Monthly values grid */}
              <div className="grid grid-cols-4 gap-3">
                {Array.from({ length: 12 }, (_, i) => {
                  const m = i + 1;
                  return (
                    <div key={m} className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">{MONTH_FULL[i]}</Label>
                      <Input
                        type="number"
                        value={editMonthValues[m] || "0"}
                        onChange={e => setEditMonthValues(prev => ({ ...prev, [m]: e.target.value }))}
                        className="h-9 text-sm tabular-nums text-right"
                        onFocus={e => e.target.select()}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Total */}
              <div className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-2.5">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Anual</span>
                <span className="text-sm font-bold text-primary tabular-nums">{formatCurrency(editDialogTotal)}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={saveEditDialog} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add ESN Dialog ───────────────────────────────────────── */}
      <Dialog open={newDialog} onOpenChange={v => !v && setNewDialog(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar ESN ao ano {yearFilter}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>ESN</Label>
              {availableEsns.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todos os ESNs já possuem metas para {yearFilter}.</p>
              ) : (
                <Select value={newEsnId} onValueChange={setNewEsnId}>
                  <SelectTrigger><SelectValue placeholder="Selecione o ESN" /></SelectTrigger>
                  <SelectContent>
                    {availableEsns.map((e: any) => (
                      <SelectItem key={e.id} value={e.id}>{e.name} ({e.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={newCategoryId} onValueChange={setNewCategoryId}>
                <SelectTrigger><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Segmento</Label>
              <Select value={newSegmentId} onValueChange={setNewSegmentId}>
                <SelectTrigger><SelectValue placeholder="Selecione o segmento" /></SelectTrigger>
                <SelectContent>
                  {segments.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewDialog(false)}>Cancelar</Button>
            <Button
              onClick={() => newEsnId && newCategoryId && newSegmentId && addEsnMutation.mutate({ esn_id: newEsnId, category_id: newCategoryId, segment_id: newSegmentId })}
              disabled={!newEsnId || !newCategoryId || !newSegmentId || availableEsns.length === 0 || addEsnMutation.isPending}
            >
              {addEsnMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
