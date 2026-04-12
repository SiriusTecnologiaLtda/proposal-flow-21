import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, LayoutTemplate, ChevronDown, ChevronRight, ChevronUp, Edit2, Plus, CheckCircle2, XCircle, Clock, SlidersHorizontal, CalendarRange, FileText, X, Trash2 } from "lucide-react";
import { startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from "date-fns";
import { useScopeTemplates } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATUS_CONFIG: Record<string, { label: string; icon: any; badgeClass: string; filterClass: string }> = {
  em_revisao: { label: "Em Revisão", icon: Clock, badgeClass: "bg-warning/10 text-warning border-warning/20", filterClass: "text-warning" },
  aprovado: { label: "Aprovado", icon: CheckCircle2, badgeClass: "bg-success/10 text-success border-success/20", filterClass: "text-success" },
  inativo: { label: "Inativo", icon: XCircle, badgeClass: "bg-muted text-muted-foreground border-border", filterClass: "text-muted-foreground" },
};

interface ScopeItemForm {
  id?: string;
  description: string;
  default_hours: number;
  sort_order: number;
  parent_id?: string | null;
  children?: ScopeItemForm[];
}

export default function ScopeTemplatesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [periodFilter, setPeriodFilter] = useState<string>("este_ano");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { data: templates = [] } = useScopeTemplates();

  const handleDeleteTemplate = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const { data: items } = await supabase.from("scope_template_items").select("id, parent_id").eq("template_id", deleteId);
      if (items) {
        const childIds = items.filter(i => i.parent_id).map(i => i.id);
        if (childIds.length > 0) await supabase.from("scope_template_items").delete().in("id", childIds);
        const parentIds = items.filter(i => !i.parent_id).map(i => i.id);
        if (parentIds.length > 0) await supabase.from("scope_template_items").delete().in("id", parentIds);
      }
      const { error } = await supabase.from("scope_templates").delete().eq("id", deleteId);
      if (error) throw error;
      toast({ title: "Template excluído com sucesso" });
      qc.invalidateQueries({ queryKey: ["scope_templates"] });
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    }
    setDeleting(false);
    setDeleteId(null);
  };

  function buildHierarchy(flatItems: any[]): ScopeItemForm[] {
    const parents = flatItems.filter((it: any) => !it.parent_id).sort((a: any, b: any) => a.sort_order - b.sort_order);
    return parents.map((p: any) => ({
      id: p.id, description: p.description, default_hours: p.default_hours, sort_order: p.sort_order, parent_id: null,
      children: flatItems.filter((c: any) => c.parent_id === p.id).sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((c: any) => ({ id: c.id, description: c.description, default_hours: c.default_hours, sort_order: c.sort_order, parent_id: p.id })),
    }));
  }

  function parentHours(parent: ScopeItemForm): number {
    if (!parent.children || parent.children.length === 0) return parent.default_hours;
    return parent.children.reduce((sum, c) => sum + (c.default_hours || 0), 0);
  }

  // Date range
  const dateRange = useMemo(() => {
    const now = new Date();
    switch (periodFilter) {
      case "este_mes": return { start: startOfMonth(now), end: endOfMonth(now) };
      case "ultimo_mes": { const prev = subMonths(now, 1); return { start: startOfMonth(prev), end: endOfMonth(prev) }; }
      case "este_trimestre": return { start: startOfQuarter(now), end: endOfQuarter(now) };
      case "este_ano": return { start: startOfYear(now), end: endOfYear(now) };
      case "personalizado": {
        if (customStart && customEnd) return { start: new Date(customStart), end: new Date(customEnd + "T23:59:59") };
        return null;
      }
      default: return null;
    }
  }, [periodFilter, customStart, customEnd]);

  const filtered = useMemo(() => {
    let result = templates;

    // Status filter
    if (statusFilter.length > 0) {
      result = result.filter((t: any) => statusFilter.includes((t as any).status || "em_revisao"));
    }

    // Period filter
    if (dateRange) {
      result = result.filter((t) => {
        const d = new Date(t.created_at);
        return d >= dateRange.start && d <= dateRange.end;
      });
    }

    // Search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.product.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          ((t as any).created_by_name || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [templates, search, statusFilter, dateRange]);

  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, t) => {
    (acc[t.product] = acc[t.product] || []).push(t);
    return acc;
  }, {});

  const activeFilterCount =
    (statusFilter.length > 0 ? 1 : 0) +
    (periodFilter && periodFilter !== "este_ano" ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Templates de Escopo</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} de {templates.length} templates</p>
        </div>
        <Button onClick={() => navigate("/cadastros/templates/novo")}>
          <Plus className="mr-2 h-4 w-4" />Novo Template
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar por nome, produto, categoria ou criador..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Filters - pill style like Oportunidades */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="flex w-full items-center gap-3 bg-accent/30 px-4 py-2.5 transition-colors hover:bg-accent/50"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <SlidersHorizontal className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Filtros</span>
          </div>
          {activeFilterCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
          <div className="flex-1" />
          {activeFilterCount > 0 && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                setStatusFilter([]);
                setPeriodFilter("este_ano");
                setCustomStart("");
                setCustomEnd("");
              }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <X className="h-3 w-3" />
              Limpar tudo
            </span>
          )}
          {filtersOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {filtersOpen && (
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:flex-wrap sm:items-start">
            {/* Period */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <CalendarRange className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium uppercase tracking-wider">Período</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {([
                  { key: "este_mes", label: "Este mês" },
                  { key: "ultimo_mes", label: "Último mês" },
                  { key: "este_trimestre", label: "Este trimestre" },
                  { key: "este_ano", label: "Este ano" },
                  { key: "personalizado", label: "Personalizado" },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setPeriodFilter(periodFilter === key && key !== "este_ano" ? "" : key)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      periodFilter === key
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {periodFilter === "personalizado" && (
                <div className="flex items-center gap-2 pt-1">
                  <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-8 w-36 text-xs" />
                  <span className="text-xs text-muted-foreground">até</span>
                  <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-8 w-36 text-xs" />
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="hidden h-16 w-px self-center bg-border sm:block" />

            {/* Status */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium uppercase tracking-wider">Status</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(STATUS_CONFIG).map(([key, { label, filterClass }]) => {
                  const active = statusFilter.includes(key);
                  return (
                    <button
                      key={key}
                      onClick={() =>
                        setStatusFilter((prev) =>
                          active ? prev.filter((s) => s !== key) : [...prev, key]
                        )
                      }
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                        active
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Template List */}
      <div className="space-y-4">
        {Object.entries(grouped).map(([product, tpls]) => (
          <div key={product}>
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">{product}</h2>
            <div className="space-y-2">
              {tpls.map((template) => {
                const isOpen = expandedId === template.id;
                const flatItems = (template as any).scope_template_items || [];
                const hierarchy = buildHierarchy(flatItems);
                const totalItems = flatItems.length;
                const totalHours = flatItems.reduce((s: number, it: any) => s + (Number(it.default_hours) || 0), 0);
                const tplStatus = (template as any).status || "em_revisao";
                const sCfg = STATUS_CONFIG[tplStatus] || STATUS_CONFIG.em_revisao;
                const SIcon = sCfg.icon;
                return (
                  <div key={template.id} className="rounded-lg border border-border bg-card overflow-hidden">
                    <button
                      onClick={() => setExpandedId(isOpen ? null : template.id)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-accent/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <LayoutTemplate className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{template.name}</p>
                            <Badge variant="outline" className={`text-[10px] h-5 gap-1 ${sCfg.badgeClass}`}>
                              <SIcon className="h-3 w-3" />
                              {sCfg.label}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {totalItems} itens · {totalHours}h · {template.category}
                            {(template as any).created_by_name && ` · por ${(template as any).created_by_name}`}
                            {template.created_at && ` · ${new Date(template.created_at).toLocaleDateString("pt-BR")}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span
                          role="button"
                          className="rounded p-1 text-muted-foreground hover:text-foreground"
                          onClick={(e) => { e.stopPropagation(); navigate(`/cadastros/templates/${template.id}`); }}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </span>
                        <span
                          role="button"
                          className="rounded p-1 text-muted-foreground hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setDeleteId(template.id); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </span>
                        {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t border-border px-4 py-3">
                        <div className="space-y-2">
                          {hierarchy.map((parent, pi) => (
                            <div key={parent.id || pi}>
                              <div className="flex items-center gap-2 text-sm font-semibold text-foreground bg-muted/40 rounded px-2 py-1">
                                <span className="text-xs text-muted-foreground w-5 text-right">{pi + 1}.</span>
                                <span className="flex-1">{parent.description}</span>
                                <span className="text-xs text-muted-foreground">{parentHours(parent)}h</span>
                              </div>
                              {(parent.children || []).length > 0 && (
                                <div className="ml-7 mt-1 space-y-0.5">
                                  {(parent.children || []).map((child, ci) => (
                                    <div key={child.id || ci} className="flex items-center gap-2 text-sm text-foreground">
                                      <span className="text-[10px] text-muted-foreground w-8 text-right">{pi + 1}.{ci + 1}</span>
                                      <span className="flex-1">{child.description}</span>
                                      <span className="text-xs text-muted-foreground">{child.default_hours}h</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                          {hierarchy.length === 0 && <p className="text-sm text-muted-foreground">Nenhum item neste template.</p>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {Object.keys(grouped).length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum template encontrado.</p>
        )}
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir template?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. Todos os itens de escopo deste template serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTemplate} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
