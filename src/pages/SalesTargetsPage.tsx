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
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox";
import { ArrowLeft, Search, Plus, Loader2, Filter, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnits, useSalesTeam, useCategories } from "@/hooks/useSupabaseData";

const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type GroupedRow = {
  esn_id: string;
  category_id: string | null;
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
  const [editingCell, setEditingCell] = useState<{ esnId: string; month: number } | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const [newDialog, setNewDialog] = useState(false);
  const [newEsnId, setNewEsnId] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [filterCategoryIds, setFilterCategoryIds] = useState<string[]>([]);
  const { data: categories = [] } = useCategories();
  const { data: units = [] } = useUnits();
  const { data: fullSalesTeam = [] } = useSalesTeam();

  // Fetch targets
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

  // ESN list with unit/gsn info
  const esnList = useMemo(() =>
    fullSalesTeam.filter((m: any) => m.role === "esn").sort((a: any, b: any) => a.name.localeCompare(b.name)),
    [fullSalesTeam]
  );
  const gsnList = useMemo(() =>
    fullSalesTeam.filter((m: any) => m.role === "gsn").sort((a: any, b: any) => a.name.localeCompare(b.name)),
    [fullSalesTeam]
  );

  const esnMap = useMemo(() => new Map(esnList.map((e: any) => [e.id, e])), [esnList]);

  // Unit options for filter
  const unitOptions = useMemo(() => units.map((u: any) => ({ value: u.id, label: u.name })), [units]);
  const gsnOptions = useMemo(() => gsnList.map((g: any) => ({ value: g.id, label: `${g.name} (${g.code})` })), [gsnList]);

  // Group by ESN for pivot view
  const grouped: GroupedRow[] = useMemo(() => {
    const map = new Map<string, GroupedRow>();
    for (const t of targets) {
      const key = `${t.esn_id}__${t.category_id || "none"}`;
      if (!map.has(key)) {
        const esn = esnMap.get(t.esn_id);
        map.set(key, {
          esn_id: t.esn_id,
          category_id: (t as any).category_id || null,
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

  // Filter
  const filtered = useMemo(() => {
    let result = grouped;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(g => g.name.toLowerCase().includes(q) || g.code.toLowerCase().includes(q));
    }
    if (filterUnitIds.length > 0) {
      result = result.filter(g => g.unit_id && filterUnitIds.includes(g.unit_id));
    }
    if (filterGsnIds.length > 0) {
      result = result.filter(g => g.linked_gsn_id && filterGsnIds.includes(g.linked_gsn_id));
    }
    return result;
  }, [grouped, search, filterUnitIds, filterGsnIds]);

  const activeFilterCount = (filterUnitIds.length > 0 ? 1 : 0) + (filterGsnIds.length > 0 ? 1 : 0);

  // Available years
  const years = useMemo(() => {
    const y = new Set([currentYear - 1, currentYear, currentYear + 1, currentYear + 2]);
    targets.forEach(t => y.add(t.year));
    return Array.from(y).sort();
  }, [targets, currentYear]);

  // ESNs not yet in the table for this year
  const availableEsns = useMemo(() => {
    const usedIds = new Set(grouped.map(g => g.esn_id));
    return esnList.filter((e: any) => !usedIds.has(e.id));
  }, [esnList, grouped]);

  // Upsert mutation
  const upsertMutation = useMutation({
    mutationFn: async ({ esn_id, month, amount, existingId }: { esn_id: string; month: number; amount: number; existingId?: string }) => {
      if (existingId) {
        const { error } = await supabase.from("sales_targets").update({ amount }).eq("id", existingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("sales_targets").insert({ esn_id, year: Number(yearFilter), month, amount });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sales-targets"] }),
    onError: (err: any) => toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" }),
  });

  // Add ESN row
  const addEsnMutation = useMutation({
    mutationFn: async (esn_id: string) => {
      const rows = Array.from({ length: 12 }, (_, i) => ({
        esn_id,
        year: Number(yearFilter),
        month: i + 1,
        amount: 0,
      }));
      const { error } = await supabase.from("sales_targets").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-targets"] });
      setNewDialog(false);
      setNewEsnId("");
      toast({ title: "ESN adicionado com sucesso!" });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingCell]);

  function startEdit(esnId: string, month: number, currentAmount: number) {
    if (!isAdmin) return;
    setEditingCell({ esnId, month });
    setEditValue(String(currentAmount || 0));
  }

  function commitEdit(row: GroupedRow) {
    if (!editingCell) return;
    const amount = Number(editValue);
    if (isNaN(amount)) { cancelEdit(); return; }
    const existing = row.months[editingCell.month];
    if (existing && existing.amount === amount) { cancelEdit(); return; }
    upsertMutation.mutate({ esn_id: editingCell.esnId, month: editingCell.month, amount, existingId: existing?.id });
    setEditingCell(null);
  }

  function cancelEdit() {
    setEditingCell(null);
    setEditValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent, row: GroupedRow) {
    if (e.key === "Enter") {
      commitEdit(row);
    } else if (e.key === "Escape") {
      cancelEdit();
    } else if (e.key === "Tab" && editingCell) {
      e.preventDefault();
      commitEdit(row);
      const nextMonth = editingCell.month + (e.shiftKey ? -1 : 1);
      if (nextMonth >= 1 && nextMonth <= 12) {
        const nextVal = row.months[nextMonth]?.amount || 0;
        setTimeout(() => startEdit(editingCell.esnId, nextMonth, nextVal), 50);
      }
    }
  }

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

  return (
    <div className="space-y-4">
      {/* Header with gradient */}
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
                <p className="text-xs text-primary-foreground/70">Metas mensais por ESN — clique na célula para editar</p>
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
            <MultiSelectCombobox
              options={unitOptions}
              selected={filterUnitIds}
              onChange={setFilterUnitIds}
              placeholder="Unidade"
              searchPlaceholder="Buscar unidade..."
              className="h-9 min-w-[140px]"
            />
            <MultiSelectCombobox
              options={gsnOptions}
              selected={filterGsnIds}
              onChange={setFilterGsnIds}
              placeholder="GSN"
              searchPlaceholder="Buscar GSN..."
              className="h-9 min-w-[140px]"
            />
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-xs text-muted-foreground"
                onClick={() => { setFilterUnitIds([]); setFilterGsnIds([]); setSearch(""); }}
              >
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
                    <th className="sticky left-0 z-30 bg-muted/95 backdrop-blur-sm text-left px-3 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider min-w-[180px] border-b border-r border-border">
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
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, rowIdx) => {
                    const total = Object.values(row.months).reduce((s, m) => s + m.amount, 0);
                    const unitName = units.find((u: any) => u.id === row.unit_id)?.name;
                    return (
                      <tr key={row.esn_id} className={cn("group transition-colors hover:bg-accent/30", rowIdx % 2 === 0 ? "bg-background" : "bg-muted/20")}>
                        <td className={cn(
                          "sticky left-0 z-10 px-3 py-2 border-r border-border font-medium",
                          rowIdx % 2 === 0 ? "bg-background" : "bg-muted/20",
                          "group-hover:bg-accent/30"
                        )}>
                          <span className="text-sm text-foreground">{row.name}</span>
                          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <span>{row.code}</span>
                            {unitName && (
                              <>
                                <span className="text-muted-foreground/40">•</span>
                                <span className="truncate max-w-[100px]">{unitName}</span>
                              </>
                            )}
                          </span>
                        </td>
                        {Array.from({ length: 12 }, (_, i) => {
                          const month = i + 1;
                          const m = row.months[month];
                          const isEditing = editingCell?.esnId === row.esn_id && editingCell?.month === month;

                          return (
                            <td
                              key={i}
                              className={cn(
                                "text-center px-1 py-1.5 border-border transition-colors",
                                isAdmin && !isEditing && "cursor-pointer hover:bg-primary/10",
                              )}
                              onClick={() => {
                                if (!isEditing && isAdmin) startEdit(row.esn_id, month, m?.amount || 0);
                              }}
                            >
                              {isEditing ? (
                                <div className="flex items-center gap-0.5 justify-center">
                                  <input
                                    ref={editInputRef}
                                    type="number"
                                    value={editValue}
                                    onChange={e => setEditValue(e.target.value)}
                                    onKeyDown={e => handleKeyDown(e, row)}
                                    onBlur={() => commitEdit(row)}
                                    className="w-[70px] h-7 text-center text-xs rounded border border-primary bg-background px-1 focus:outline-none focus:ring-1 focus:ring-primary tabular-nums"
                                  />
                                </div>
                              ) : (
                                <span className={cn(
                                  "tabular-nums text-xs",
                                  m && m.amount > 0 ? "text-foreground font-medium" : "text-muted-foreground/40"
                                )}>
                                  {m && m.amount > 0 ? formatCompact(m.amount) : "—"}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className={cn(
                          "text-center px-2 py-1.5 font-semibold tabular-nums text-xs border-l border-border",
                          "bg-muted/30"
                        )}>
                          {formatCurrency(total)}
                        </td>
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
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add ESN Dialog */}
      <Dialog open={newDialog} onOpenChange={v => !v && setNewDialog(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar ESN ao ano {yearFilter}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>ESN</Label>
            {availableEsns.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todos os ESNs já possuem metas para {yearFilter}.</p>
            ) : (
              <Select value={newEsnId} onValueChange={setNewEsnId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o ESN" />
                </SelectTrigger>
                <SelectContent>
                  {availableEsns.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.name} ({e.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewDialog(false)}>Cancelar</Button>
            <Button
              onClick={() => newEsnId && addEsnMutation.mutate(newEsnId)}
              disabled={!newEsnId || availableEsns.length === 0 || addEsnMutation.isPending}
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
