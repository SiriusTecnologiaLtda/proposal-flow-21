import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Loader2, Target, Pencil, Save, Users, Calendar, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnits, useSalesTeam, useCategories, useSegments } from "@/hooks/useSupabaseData";

const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const ROLE_OPTIONS = [
  { value: "esn", label: "Executivo de Vendas (ESN)" },
  { value: "gsn", label: "Gerente de Vendas (GSN)" },
  { value: "dsn", label: "Diretor de Vendas (DSN)" },
  { value: "arquiteto", label: "Engenheiro de Valor (EV)" },
];

export default function SalesTargetEditPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const qc = useQueryClient();
  const currentYear = new Date().getFullYear();

  const isCreateMode = searchParams.get("modo") === "novo";
  const editEsnIdParam = searchParams.get("esn_id") || "";
  const yearParam = searchParams.get("ano") || String(currentYear);

  const [saving, setSaving] = useState(false);

  // Context fields
  const [editEsnId, setEditEsnId] = useState(editEsnIdParam);
  const [editUnitId, setEditUnitId] = useState("");
  const [editRole, setEditRole] = useState("esn");
  const [editYear, setEditYear] = useState(yearParam);

  // Grid state
  const [editSegId, setEditSegId] = useState("");
  const [gridRows, setGridRows] = useState<{ key: string; catId: string }[]>([]);
  const [gridValues, setGridValues] = useState<Record<string, Record<number, string>>>({});
  const [initialized, setInitialized] = useState(false);

  const { data: categories = [] } = useCategories();
  const { data: segments = [] } = useSegments();
  const { data: units = [] } = useUnits();
  const { data: fullSalesTeam = [] } = useSalesTeam();

  const { data: targets = [], isLoading } = useQuery({
    queryKey: ["sales-targets-edit", editEsnIdParam, yearParam],
    queryFn: async () => {
      if (!editEsnIdParam || isCreateMode) return [];
      const all: any[] = [];
      let offset = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("sales_targets")
          .select("*")
          .eq("esn_id", editEsnIdParam)
          .eq("year", Number(yearParam))
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
    enabled: !!editEsnIdParam || isCreateMode,
  });

  const esnMap = useMemo(() => new Map(fullSalesTeam.map((e: any) => [e.id, e])), [fullSalesTeam]);
  const allEsns = useMemo(() => fullSalesTeam.sort((a: any, b: any) => a.name.localeCompare(b.name)), [fullSalesTeam]);
  const sortedCategories = useMemo(() => [...categories].sort((a: any, b: any) => a.name.localeCompare(b.name)), [categories]);

  const years = useMemo(() => {
    const y = new Set([currentYear - 1, currentYear, currentYear + 1, currentYear + 2]);
    return Array.from(y).sort();
  }, [currentYear]);

  // Initialize grid from targets or blank for create
  useEffect(() => {
    if (initialized) return;
    if (isLoading) return;
    if (!categories.length || !segments.length || !fullSalesTeam.length) return;

    if (isCreateMode) {
      const firstEsn = allEsns[0];
      if (!editEsnId && firstEsn) setEditEsnId(firstEsn.id);
      if (!editUnitId && firstEsn?.unit_id) setEditUnitId(firstEsn.unit_id);
      if (!editSegId && segments[0]) setEditSegId(segments[0].id);

      const rows = sortedCategories.map((c: any) => ({
        key: c.id,
        catId: c.id,
      }));
      const values: Record<string, Record<number, string>> = {};
      for (const r of rows) {
        values[r.key] = {};
        for (let m = 1; m <= 12; m++) values[r.key][m] = "0";
      }
      setGridRows(rows);
      setGridValues(values);
    } else if (targets.length > 0) {
      const esn = esnMap.get(editEsnIdParam);
      if (esn) {
        setEditEsnId(esn.id);
        setEditUnitId(esn.unit_id || "");
        setEditRole(targets[0]?.role || "esn");
      }
      // Use segment from first target
      if (!editSegId && targets[0]?.segment_id) setEditSegId(targets[0].segment_id);

      const rowMap = new Map<string, { catId: string }>();
      const values: Record<string, Record<number, string>> = {};

      for (const t of targets) {
        const catId = t.category_id || "";
        if (!catId) continue;
        const key = catId;
        if (!rowMap.has(key)) rowMap.set(key, { catId });
        if (!values[key]) values[key] = {};
        const current = Number(values[key][t.month] || "0");
        values[key][t.month] = String(current + (t.amount || 0));
      }

      const rows = Array.from(rowMap.entries()).map(([key, r]) => ({ key, ...r }));
      for (const r of rows) {
        if (!values[r.key]) values[r.key] = {};
        for (let m = 1; m <= 12; m++) {
          if (!values[r.key][m]) values[r.key][m] = "0";
        }
      }

      setGridRows(rows);
      setGridValues(values);
    } else if (!isCreateMode && editEsnIdParam) {
      const esn = esnMap.get(editEsnIdParam);
      if (esn) {
        setEditEsnId(esn.id);
        setEditUnitId(esn.unit_id || "");
      }
      if (!editSegId && segments[0]) setEditSegId(segments[0].id);

      const rows = sortedCategories.map((c: any) => ({
        key: c.id,
        catId: c.id,
      }));
      const values: Record<string, Record<number, string>> = {};
      for (const r of rows) {
        values[r.key] = {};
        for (let m = 1; m <= 12; m++) values[r.key][m] = "0";
      }
      setGridRows(rows);
      setGridValues(values);
    }

    setInitialized(true);
  }, [isLoading, targets, categories, segments, fullSalesTeam, isCreateMode, initialized, editEsnIdParam, allEsns, esnMap, sortedCategories, editEsnId, editUnitId]);

  const formatCurrency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
  const formatCompact = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
    return String(Math.round(v));
  };

  /* ── Grid helpers ── */
  function addGridRow() {
    const firstCat = sortedCategories[0];
    if (!firstCat) return;
    let key = firstCat.id;
    let counter = 0;
    while (gridRows.some(r => r.key === key)) {
      counter++;
      key = `${firstCat.id}__${counter}`;
    }
    setGridRows(prev => [...prev, { key, catId: firstCat.id }]);
    setGridValues(prev => {
      const row: Record<number, string> = {};
      for (let m = 1; m <= 12; m++) row[m] = "0";
      return { ...prev, [key]: row };
    });
  }

  function updateGridRowField(rowKey: string, field: "catId", newValue: string) {
    setGridRows(prev => {
      const idx = prev.findIndex(r => r.key === rowKey);
      if (idx === -1) return prev;
      const old = prev[idx];
      const updated = { ...old, [field]: newValue };
      const newKey = updated.catId;
      const result = [...prev];
      result[idx] = { ...updated, key: newKey };
      setGridValues(gv => {
        const vals = { ...gv };
        if (newKey !== rowKey) {
          vals[newKey] = vals[rowKey] || {};
          delete vals[rowKey];
        }
        return vals;
      });
      return result;
    });
  }

  function removeGridRow(rowKey: string) {
    setGridRows(prev => prev.filter(r => r.key !== rowKey));
    setGridValues(prev => {
      const updated = { ...prev };
      delete updated[rowKey];
      return updated;
    });
  }

  const getRowTotal = (key: string) => {
    const vals = gridValues[key] || {};
    return Object.values(vals).reduce((s, v) => s + (Number(v) || 0), 0);
  };
  const getColTotal = (month: number) => {
    return gridRows.reduce((s, r) => s + (Number(gridValues[r.key]?.[month] || "0") || 0), 0);
  };
  const getGridGrandTotal = () => gridRows.reduce((s, r) => s + getRowTotal(r.key), 0);

  /* ── Save ── */
  async function handleSave() {
    if (!editEsnId || !editUnitId) {
      toast({ title: "Preencha Membro e Unidade", variant: "destructive" });
      return;
    }
    if (!editSegId) {
      toast({ title: "Preencha o Segmento", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (!isCreateMode) {
        // Delete existing for this member+year
        const existingTargetIds: string[] = targets.map((t: any) => t.id);
        for (let i = 0; i < existingTargetIds.length; i += 100) {
          const batch = existingTargetIds.slice(i, i + 100);
          const { error } = await supabase.from("sales_targets").delete().in("id", batch);
          if (error) throw error;
        }
      }

      const rows: any[] = [];
      for (const gr of gridRows) {
        for (let m = 1; m <= 12; m++) {
          const val = Number(gridValues[gr.key]?.[m] || "0");
          const amount = Math.round(val * 100) / 100;
          if (amount === 0) continue;
          rows.push({
            esn_id: editEsnId, year: Number(editYear), month: m, amount,
            category_id: gr.catId, segment_id: editSegId, role: editRole, unit_id: editUnitId,
          });
        }
      }

      if (rows.length === 0 && isCreateMode) {
        toast({ title: "Preencha ao menos um valor", variant: "destructive" });
        setSaving(false);
        return;
      }

      if (rows.length > 0) {
        const { error } = await supabase.from("sales_targets").insert(rows);
        if (error) throw error;
      }

      await qc.invalidateQueries({ queryKey: ["sales-targets"] });
      toast({ title: isCreateMode ? "Metas adicionadas com sucesso!" : "Metas atualizadas!" });
      navigate("/cadastros/metas");
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const memberName = esnMap.get(editEsnId)?.name || "—";
  const memberCode = esnMap.get(editEsnId)?.code || "—";

  if (isLoading || !initialized) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Carregando...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Hero Header ── */}
      <div className="rounded-lg bg-gradient-to-r from-primary/90 to-primary p-5 shadow-md">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/cadastros/metas")} className="text-primary-foreground hover:bg-white/10 h-9 w-9">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/15 p-2.5">
                {isCreateMode ? <Plus className="h-5 w-5 text-primary-foreground" /> : <Pencil className="h-5 w-5 text-primary-foreground" />}
              </div>
              <div>
                <h1 className="text-lg font-semibold text-primary-foreground leading-tight">
                  {isCreateMode ? "Adicionar Metas" : "Editar Metas"}
                </h1>
                <p className="text-xs text-primary-foreground/70 mt-0.5">
                  {isCreateMode ? "Preencha o contexto e lance os valores por categoria" : `${memberName} (${memberCode}) — ${editYear}`}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/cadastros/metas")} disabled={saving} className="text-primary-foreground hover:bg-white/10 border border-white/20">
              Cancelar
            </Button>
            <Button size="sm" variant="secondary" className="bg-white/15 text-primary-foreground border-white/20 hover:bg-white/25" onClick={handleSave} disabled={saving || !editEsnId || !editUnitId}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
              {isCreateMode ? "Adicionar Metas" : "Salvar Metas"}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Context Fields ── */}
      <Card className="border-border/50 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Contexto</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
            {isCreateMode ? (
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label className="text-xs text-muted-foreground font-medium">Membro</Label>
                <Select value={editEsnId} onValueChange={(val) => {
                  setEditEsnId(val);
                  const member = esnMap.get(val);
                  if (member?.unit_id) setEditUnitId(member.unit_id);
                }}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {allEsns.map((e: any) => (
                      <SelectItem key={e.id} value={e.id}>{e.name} ({e.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label className="text-xs text-muted-foreground font-medium">Membro</Label>
                <p className="text-sm font-medium text-foreground truncate leading-9">
                  {memberName} <span className="text-[10px] text-muted-foreground font-mono">({memberCode})</span>
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium">Unidade</Label>
              <Select value={editUnitId} onValueChange={setEditUnitId}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{units.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium">Ano</Label>
              {isCreateMode ? (
                <Select value={editYear} onValueChange={setEditYear}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <p className="text-sm font-medium text-foreground leading-9">{editYear}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium">Nível</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{ROLE_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium">Segmento</Label>
              <Select value={editSegId} onValueChange={setEditSegId}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {segments.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Spreadsheet Grid ── */}
      <Card className="border-border/50 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border/60 bg-muted/20">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Grade de Lançamento</span>
            <span className="text-[10px] text-muted-foreground ml-auto">Valores em R$</span>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-20">
                <tr className="bg-muted/80 backdrop-blur-sm">
                  <th className="sticky left-0 z-30 bg-muted text-left px-3 py-3 font-medium text-muted-foreground text-[10px] uppercase tracking-wider min-w-[160px] border-b border-r border-border/60">
                    Categoria
                  </th>
                  <th className="text-left px-2 py-3 font-medium text-muted-foreground text-[10px] uppercase tracking-wider min-w-[140px] border-b border-r border-border/60">
                    Segmento
                  </th>
                  {MONTH_NAMES.map((m) => (
                    <th key={m} className="text-center px-1 py-3 font-medium text-muted-foreground text-[10px] uppercase tracking-wider min-w-[80px] border-b border-r border-border/30">
                      {m}
                    </th>
                  ))}
                  <th className="text-center px-3 py-3 font-semibold text-muted-foreground text-[10px] uppercase tracking-wider min-w-[110px] bg-muted border-b border-l border-border/60">
                    Total
                  </th>
                  <th className="w-[44px] border-b border-l border-border/30" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {gridRows.map((gr) => {
                  const rowTotal = getRowTotal(gr.key);
                  return (
                    <tr key={gr.key} className="group hover:bg-accent/30 transition-colors">
                      <td className="sticky left-0 z-10 bg-background group-hover:bg-accent/30 transition-colors px-2 py-2 border-r border-border/60">
                        <Select value={gr.catId} onValueChange={(newId) => updateGridRowField(gr.key, "catId", newId)}>
                          <SelectTrigger className="h-8 text-xs border-transparent bg-transparent hover:bg-muted/40 px-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {sortedCategories.map((c: any) => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-2 border-r border-border/60">
                        <Select value={gr.segId} onValueChange={(newId) => updateGridRowField(gr.key, "segId", newId)}>
                          <SelectTrigger className="h-8 text-xs border-transparent bg-transparent hover:bg-muted/40 px-2">
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {segments.map((s: any) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      {Array.from({ length: 12 }, (_, i) => {
                        const m = i + 1;
                        const val = gridValues[gr.key]?.[m] ?? "0";
                        return (
                          <td key={m} className="px-0.5 py-1.5 border-r border-border/20">
                            <Input
                              type="number"
                              value={val}
                              onChange={e => setGridValues(prev => ({
                                ...prev,
                                [gr.key]: { ...prev[gr.key], [m]: e.target.value }
                              }))}
                              className="h-8 text-xs tabular-nums text-right font-medium px-2 border-transparent bg-transparent hover:bg-muted/40 focus:bg-background focus:border-primary/40 transition-colors rounded-sm"
                              onFocus={e => e.target.select()}
                            />
                          </td>
                        );
                      })}
                      <td className="text-center px-3 py-2 bg-muted/20 border-l border-border/60">
                        <span className="text-xs font-bold tabular-nums text-foreground">
                          {rowTotal.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                      </td>
                      <td className="text-center px-1 py-2 border-l border-border/30">
                        {gridRows.length > 1 && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/40 hover:text-destructive" onClick={() => removeGridRow(gr.key)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="sticky bottom-0 z-20 bg-muted/80 backdrop-blur-sm border-t-2 border-border">
                  <td colSpan={2} className="sticky left-0 z-30 bg-muted px-3 py-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground border-r border-border/60">
                    Total Geral
                  </td>
                  {Array.from({ length: 12 }, (_, i) => {
                    const colTotal = getColTotal(i + 1);
                    return (
                      <td key={i} className="text-center px-1 py-3 text-xs font-bold tabular-nums text-foreground border-r border-border/20">
                        {colTotal > 0 ? formatCompact(colTotal) : "—"}
                      </td>
                    );
                  })}
                  <td className="text-center px-3 py-3 bg-muted border-l border-border/60">
                    <span className="text-sm font-bold tabular-nums text-primary">
                      {formatCurrency(getGridGrandTotal())}
                    </span>
                  </td>
                  <td className="border-l border-border/30" />
                </tr>
              </tfoot>
            </table>
          </div>
          {/* Add row button */}
          <div className="px-5 py-3 border-t border-border/40">
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground gap-1.5" onClick={addGridRow}>
              <Plus className="h-3.5 w-3.5" /> Adicionar Linha
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Footer Actions ── */}
      <div className="flex items-center justify-end gap-3 pb-6">
        <Button variant="outline" onClick={() => navigate("/cadastros/metas")} disabled={saving} className="h-10">
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={saving || !editEsnId || !editUnitId} className="h-10">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
          {isCreateMode ? "Adicionar Metas" : "Salvar Metas"}
        </Button>
      </div>
    </div>
  );
}
