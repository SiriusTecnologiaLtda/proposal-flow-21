import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Search, Target, Pencil, Trash2, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTH_NAMES_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

type SalesTarget = {
  id: string;
  esn_id: string;
  year: number;
  month: number;
  amount: number;
  esn_name?: string;
  esn_code?: string;
};

export default function SalesTargetsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const currentYear = new Date().getFullYear();

  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState(String(currentYear));
  const [editDialog, setEditDialog] = useState<{ open: boolean; target?: SalesTarget; isNew?: boolean }>({ open: false });
  const [formAmount, setFormAmount] = useState("");
  const [formEsnId, setFormEsnId] = useState("");
  const [formMonth, setFormMonth] = useState("1");
  const [deleteId, setDeleteId] = useState<string | null>(null);

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

  // Enrich targets with ESN info
  const enriched: SalesTarget[] = useMemo(() =>
    targets.map(t => ({
      ...t,
      esn_name: esnMap.get(t.esn_id)?.name || "—",
      esn_code: esnMap.get(t.esn_id)?.code || "—",
    })),
    [targets, esnMap]
  );

  // Group by ESN for pivot view
  const grouped = useMemo(() => {
    const map = new Map<string, { esn_id: string; name: string; code: string; months: Record<number, { id: string; amount: number }> }>();
    for (const t of enriched) {
      if (!map.has(t.esn_id)) {
        map.set(t.esn_id, { esn_id: t.esn_id, name: t.esn_name || "", code: t.esn_code || "", months: {} });
      }
      map.get(t.esn_id)!.months[t.month] = { id: t.id, amount: t.amount };
    }
    return Array.from(map.values());
  }, [enriched]);

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

  // Mutations
  const upsertMutation = useMutation({
    mutationFn: async ({ id, esn_id, month, amount }: { id?: string; esn_id: string; month: number; amount: number }) => {
      if (id) {
        const { error } = await supabase.from("sales_targets").update({ amount }).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("sales_targets").insert({ esn_id, year: Number(yearFilter), month, amount });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-targets"] });
      setEditDialog({ open: false });
      toast({ title: "Meta salva com sucesso!" });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sales_targets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-targets"] });
      setDeleteId(null);
      toast({ title: "Meta excluída!" });
    },
  });

  function openEdit(target?: SalesTarget) {
    if (target) {
      setFormAmount(String(target.amount));
      setFormEsnId(target.esn_id);
      setFormMonth(String(target.month));
      setEditDialog({ open: true, target, isNew: false });
    } else {
      setFormAmount("");
      setFormEsnId(esnList[0]?.id || "");
      setFormMonth("1");
      setEditDialog({ open: true, isNew: true });
    }
  }

  function handleSave() {
    const amount = Number(formAmount);
    if (!formEsnId || isNaN(amount)) return;
    upsertMutation.mutate({
      id: editDialog.target?.id,
      esn_id: formEsnId,
      month: Number(formMonth),
      amount,
    });
  }

  const formatCurrency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/cadastros")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Metas de Vendas</h1>
            <p className="text-sm text-muted-foreground">Metas mensais por ESN — Receita SCS</p>
          </div>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => openEdit()}>
            <Plus className="h-4 w-4 mr-1" /> Nova Meta
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Pesquisar ESN..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Badge variant="outline" className="self-center text-xs">
          {filtered.length} ESN{filtered.length !== 1 ? "s" : ""} · {enriched.length} metas
        </Badge>
      </div>

      {/* Pivot Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              {search ? "Nenhum ESN encontrado." : `Nenhuma meta cadastrada para ${yearFilter}.`}
            </div>
          ) : (
            <ScrollArea className="w-full">
              <div className="min-w-[900px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 z-10 bg-background min-w-[200px]">ESN</TableHead>
                      {MONTH_NAMES.map((m, i) => (
                        <TableHead key={i} className="text-right min-w-[90px]">{m}</TableHead>
                      ))}
                      <TableHead className="text-right min-w-[110px] font-semibold">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(row => {
                      const total = Object.values(row.months).reduce((s, m) => s + m.amount, 0);
                      return (
                        <TableRow key={row.esn_id}>
                          <TableCell className="sticky left-0 z-10 bg-background">
                            <div>
                              <p className="text-sm font-medium">{row.name}</p>
                              <p className="text-[10px] text-muted-foreground">{row.code}</p>
                            </div>
                          </TableCell>
                          {Array.from({ length: 12 }, (_, i) => {
                            const m = row.months[i + 1];
                            return (
                              <TableCell
                                key={i}
                                className={cn(
                                  "text-right text-sm tabular-nums",
                                  isAdmin && "cursor-pointer hover:bg-accent/50 transition-colors",
                                  !m && "text-muted-foreground/40"
                                )}
                                onClick={() => {
                                  if (!isAdmin) return;
                                  if (m) {
                                    openEdit({ id: m.id, esn_id: row.esn_id, year: Number(yearFilter), month: i + 1, amount: m.amount, esn_name: row.name, esn_code: row.code });
                                  } else {
                                    setFormEsnId(row.esn_id);
                                    setFormMonth(String(i + 1));
                                    setFormAmount("");
                                    setEditDialog({ open: true, isNew: true });
                                  }
                                }}
                              >
                                {m ? formatCurrency(m.amount) : "—"}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-right font-semibold text-sm tabular-nums">
                            {formatCurrency(total)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {/* Totals row */}
                    <TableRow className="bg-muted/30 font-semibold">
                      <TableCell className="sticky left-0 z-10 bg-muted/30">Total</TableCell>
                      {Array.from({ length: 12 }, (_, i) => {
                        const monthTotal = filtered.reduce((s, r) => s + (r.months[i + 1]?.amount || 0), 0);
                        return (
                          <TableCell key={i} className="text-right text-sm tabular-nums">
                            {formatCurrency(monthTotal)}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatCurrency(filtered.reduce((s, r) => s + Object.values(r.months).reduce((ms, m) => ms + m.amount, 0), 0))}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Edit/Create Dialog */}
      <Dialog open={editDialog.open} onOpenChange={v => !v && setEditDialog({ open: false })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editDialog.isNew ? "Nova Meta" : "Editar Meta"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>ESN</Label>
              <Select value={formEsnId} onValueChange={setFormEsnId} disabled={!editDialog.isNew && !!editDialog.target}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o ESN" />
                </SelectTrigger>
                <SelectContent>
                  {esnList.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.name} ({e.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Mês</Label>
                <Select value={formMonth} onValueChange={setFormMonth} disabled={!editDialog.isNew}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES_FULL.map((m, i) => (
                      <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Valor (R$)</Label>
                <Input
                  type="number"
                  value={formAmount}
                  onChange={e => setFormAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Ano: {yearFilter}</p>
          </div>
          <DialogFooter className="flex gap-2">
            {!editDialog.isNew && editDialog.target && isAdmin && (
              <Button variant="destructive" size="sm" onClick={() => { setDeleteId(editDialog.target!.id); setEditDialog({ open: false }); }}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="ghost" onClick={() => setEditDialog({ open: false })}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!formEsnId || !formAmount || upsertMutation.isPending}>
              {upsertMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir Meta</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir esta meta?</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
