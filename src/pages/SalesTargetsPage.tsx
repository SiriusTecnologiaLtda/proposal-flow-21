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
import { ArrowLeft, Search, Plus, Loader2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTH_NAMES_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

type GroupedRow = {
  esn_id: string;
  name: string;
  code: string;
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
  const [editingCell, setEditingCell] = useState<{ esnId: string; month: number } | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // New target dialog (only for adding a brand new ESN row)
  const [newDialog, setNewDialog] = useState(false);
  const [newEsnId, setNewEsnId] = useState("");

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

  // Fetch ESN list
  const { data: esnList = [] } = useQuery({
    queryKey: ["sales-team-esn"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_team")
        .select("id, code, name")
        .eq("role", "esn")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const esnMap = useMemo(() => new Map(esnList.map(e => [e.id, e])), [esnList]);

  // Group by ESN for pivot view
  const grouped: GroupedRow[] = useMemo(() => {
    const map = new Map<string, GroupedRow>();
    for (const t of targets) {
      if (!map.has(t.esn_id)) {
        const esn = esnMap.get(t.esn_id);
        map.set(t.esn_id, { esn_id: t.esn_id, name: esn?.name || "—", code: esn?.code || "—", months: {} });
      }
      map.get(t.esn_id)!.months[t.month] = { id: t.id, amount: t.amount };
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [targets, esnMap]);

  // Filter
  const filtered = useMemo(() => {
    if (!search.trim()) return grouped;
    const q = search.toLowerCase();
    return grouped.filter(g => g.name.toLowerCase().includes(q) || g.code.toLowerCase().includes(q));
  }, [grouped, search]);

  // Available years
  const years = useMemo(() => {
    const y = new Set([currentYear - 1, currentYear, currentYear + 1, currentYear + 2]);
    targets.forEach(t => y.add(t.year));
    return Array.from(y).sort();
  }, [targets, currentYear]);

  // ESNs not yet in the table for this year
  const availableEsns = useMemo(() => {
    const usedIds = new Set(grouped.map(g => g.esn_id));
    return esnList.filter(e => !usedIds.has(e.id));
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-targets"] });
    },
    onError: (err: any) => toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" }),
  });

  // Add ESN row with zero amounts
  const addEsnMutation = useMutation({
    mutationFn: async (esn_id: string) => {
      // Insert 12 months with 0
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

  // Focus input when editing cell changes
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
    if (isNaN(amount)) {
      cancelEdit();
      return;
    }
    const existing = row.months[editingCell.month];
    // Only save if value actually changed
    if (existing && existing.amount === amount) {
      cancelEdit();
      return;
    }
    upsertMutation.mutate({
      esn_id: editingCell.esnId,
      month: editingCell.month,
      amount,
      existingId: existing?.id,
    });
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
      // Move to next month
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

  // Grand totals
  const grandTotalMeta = useMemo(() =>
    filtered.reduce((s, r) => s + Object.values(r.months).reduce((ms, m) => ms + m.amount, 0), 0),
    [filtered]
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/cadastros")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Metas de Vendas</h1>
            <p className="text-xs text-muted-foreground">Metas mensais por ESN — clique na célula para editar</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs font-mono">
            Total: {formatCurrency(grandTotalMeta)}
          </Badge>
          {isAdmin && (
            <Button size="sm" onClick={() => { setNewDialog(true); setNewEsnId(availableEsns[0]?.id || ""); }}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar ESN
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
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
        <span className="text-xs text-muted-foreground">
          {filtered.length} ESN{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground text-sm">
              {search ? "Nenhum ESN encontrado." : `Nenhuma meta cadastrada para ${yearFilter}.`}
            </div>
          ) : (
            <div className="overflow-auto max-h-[calc(100vh-260px)]">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-20 bg-muted">
                  <tr>
                    <th className="sticky left-0 z-30 bg-muted text-left px-3 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider min-w-[160px] border-b border-r border-border">
                      ESN
                    </th>
                    {MONTH_NAMES.map((m, i) => (
                      <th key={i} className="text-center px-1 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider min-w-[85px] border-b border-border">
                        {m}
                      </th>
                    ))}
                    <th className="text-center px-2 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider min-w-[100px] border-b border-l border-border bg-muted/80">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, rowIdx) => {
                    const total = Object.values(row.months).reduce((s, m) => s + m.amount, 0);
                    return (
                      <tr key={row.esn_id} className={cn("group", rowIdx % 2 === 0 ? "bg-background" : "bg-muted/20")}>
                        <td className={cn(
                          "sticky left-0 z-10 px-3 py-2 border-r border-border font-medium",
                          rowIdx % 2 === 0 ? "bg-background" : "bg-muted/20"
                        )}>
                          <span className="text-sm text-foreground">{row.name}</span>
                          <span className="block text-[10px] text-muted-foreground">{row.code}</span>
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
                          rowIdx % 2 === 0 ? "bg-muted/30" : "bg-muted/40"
                        )}>
                          {formatCurrency(total)}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Totals row */}
                  <tr className="sticky bottom-0 z-20 bg-muted font-semibold border-t-2 border-border">
                    <td className="sticky left-0 z-30 bg-muted px-3 py-2.5 text-xs uppercase tracking-wider text-muted-foreground border-r border-border">
                      Total
                    </td>
                    {Array.from({ length: 12 }, (_, i) => {
                      const monthTotal = filtered.reduce((s, r) => s + (r.months[i + 1]?.amount || 0), 0);
                      return (
                        <td key={i} className="text-center px-1 py-2.5 text-xs tabular-nums text-foreground">
                          {formatCompact(monthTotal)}
                        </td>
                      );
                    })}
                    <td className="text-center px-2 py-2.5 text-xs tabular-nums font-bold border-l border-border">
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
                  {availableEsns.map(e => (
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
