import { useState } from "react";
import { Search, LayoutTemplate, ChevronDown, ChevronRight, Edit2 } from "lucide-react";
import { useScopeTemplates } from "@/hooks/useSupabaseData";
import { Input } from "@/components/ui/input";

export default function ScopeTemplatesPage() {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: templates = [] } = useScopeTemplates();

  const filtered = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.product.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, t) => {
    (acc[t.product] = acc[t.product] || []).push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Templates de Escopo</h1>
        <p className="text-sm text-muted-foreground">{templates.length} templates disponíveis</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar template..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="space-y-4">
        {Object.entries(grouped).map(([product, templates]) => (
          <div key={product}>
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">{product}</h2>
            <div className="space-y-2">
              {templates.map((template) => {
                const isOpen = expandedId === template.id;
                const items = (template as any).scope_template_items || [];
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
                          <p className="text-sm font-medium text-foreground">{template.name}</p>
                          <p className="text-xs text-muted-foreground">{items.length} itens · {template.category}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="rounded p-1 text-muted-foreground hover:text-foreground" onClick={(e) => e.stopPropagation()}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t border-border px-4 py-3">
                        <div className="space-y-1.5">
                          {items.map((item: any, i: number) => (
                            <div key={item.id} className="flex items-center gap-2 text-sm text-foreground">
                              <span className="shrink-0 text-xs text-muted-foreground w-5 text-right">{i + 1}.</span>
                              <span>{item.description}</span>
                            </div>
                          ))}
                          {items.length === 0 && <p className="text-sm text-muted-foreground">Nenhum item neste template.</p>}
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
