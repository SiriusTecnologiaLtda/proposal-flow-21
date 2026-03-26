import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, LayoutTemplate, ChevronDown, ChevronRight, Edit2, Plus, CheckCircle2, XCircle, Clock, Filter } from "lucide-react";
import { useScopeTemplates } from "@/hooks/useSupabaseData";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_CONFIG: Record<string, { label: string; icon: any; badgeClass: string }> = {
  em_revisao: { label: "Em Revisão", icon: Clock, badgeClass: "bg-warning/10 text-warning border-warning/20" },
  aprovado: { label: "Aprovado", icon: CheckCircle2, badgeClass: "bg-success/10 text-success border-success/20" },
  inativo: { label: "Inativo", icon: XCircle, badgeClass: "bg-muted text-muted-foreground border-border" },
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: templates = [] } = useScopeTemplates();

  function buildHierarchy(flatItems: any[]): ScopeItemForm[] {
    const parents = flatItems.filter((it: any) => !it.parent_id).sort((a: any, b: any) => a.sort_order - b.sort_order);
    return parents.map((p: any) => ({
      id: p.id,
      description: p.description,
      default_hours: p.default_hours,
      sort_order: p.sort_order,
      parent_id: null,
      children: flatItems
        .filter((c: any) => c.parent_id === p.id)
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((c: any) => ({
          id: c.id, description: c.description, default_hours: c.default_hours, sort_order: c.sort_order, parent_id: p.id,
        })),
    }));
  }

  function parentHours(parent: ScopeItemForm): number {
    if (!parent.children || parent.children.length === 0) return parent.default_hours;
    return parent.children.reduce((sum, c) => sum + (c.default_hours || 0), 0);
  }

  const filtered = useMemo(() => {
    let result = templates;
    if (statusFilter !== "todos") {
      result = result.filter((t: any) => (t as any).status === statusFilter);
    }
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
  }, [templates, search, statusFilter]);

  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, t) => {
    (acc[t.product] = acc[t.product] || []).push(t);
    return acc;
  }, {});

  // Status counts
  const counts = useMemo(() => {
    const c = { em_revisao: 0, aprovado: 0, inativo: 0, total: templates.length };
    templates.forEach((t: any) => {
      const s = (t as any).status || "em_revisao";
      if (s in c) (c as any)[s]++;
    });
    return c;
  }, [templates]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Templates de Escopo</h1>
          <p className="text-sm text-muted-foreground">{templates.length} templates disponíveis</p>
        </div>
        <Button onClick={() => navigate("/templates/novo")}>
          <Plus className="mr-2 h-4 w-4" />Novo Template
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por nome, produto, categoria ou criador..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos ({counts.total})</SelectItem>
            <SelectItem value="em_revisao">Em Revisão ({counts.em_revisao})</SelectItem>
            <SelectItem value="aprovado">Aprovado ({counts.aprovado})</SelectItem>
            <SelectItem value="inativo">Inativo ({counts.inativo})</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Template List */}
      <div className="space-y-4">
        {Object.entries(grouped).map(([product, templates]) => (
          <div key={product}>
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">{product}</h2>
            <div className="space-y-2">
              {templates.map((template) => {
                const isOpen = expandedId === template.id;
                const flatItems = (template as any).scope_template_items || [];
                const hierarchy = buildHierarchy(flatItems);
                const totalItems = flatItems.length;
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
                            {totalItems} itens · {template.category}
                            {(template as any).created_by_name && ` · por ${(template as any).created_by_name}`}
                            {template.created_at && ` · ${new Date(template.created_at).toLocaleDateString("pt-BR")}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          role="button"
                          className="rounded p-1 text-muted-foreground hover:text-foreground"
                          onClick={(e) => { e.stopPropagation(); navigate(`/templates/${template.id}`); }}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
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
    </div>
  );
}
