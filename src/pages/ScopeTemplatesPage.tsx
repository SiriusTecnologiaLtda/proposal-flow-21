import { useState } from "react";
import { Search, LayoutTemplate, ChevronDown, ChevronRight, Edit2, Plus, Trash2, FolderPlus } from "lucide-react";
import { useScopeTemplates, useProducts, useCategories } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const emptyForm = { name: "", product: "", category: "" };

interface ScopeItemForm {
  id?: string;
  description: string;
  default_hours: number;
  sort_order: number;
  parent_id?: string | null;
  children?: ScopeItemForm[];
}

export default function ScopeTemplatesPage() {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: templates = [] } = useScopeTemplates();
  const { data: products = [] } = useProducts();
  const { data: categories = [] } = useCategories();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [parentItems, setParentItems] = useState<ScopeItemForm[]>([]);
  const [saving, setSaving] = useState(false);

  // Build hierarchical structure from flat items
  function buildHierarchy(flatItems: any[]): ScopeItemForm[] {
    const parents = flatItems
      .filter((it: any) => !it.parent_id)
      .sort((a: any, b: any) => a.sort_order - b.sort_order);

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
          id: c.id,
          description: c.description,
          default_hours: c.default_hours,
          sort_order: c.sort_order,
          parent_id: p.id,
        })),
    }));
  }

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setParentItems([]);
    setDialogOpen(true);
  };

  const openEdit = (template: any) => {
    setEditingId(template.id);
    setForm({ name: template.name, product: template.product, category: template.category });
    const flatItems = template.scope_template_items || [];
    setParentItems(buildHierarchy(flatItems));
    setDialogOpen(true);
  };

  const addParent = () => {
    setParentItems((prev) => [
      ...prev,
      { description: "", default_hours: 0, sort_order: prev.length, parent_id: null, children: [] },
    ]);
  };

  const removeParent = (index: number) => {
    setParentItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateParent = (index: number, field: string, value: any) => {
    setParentItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  };

  const addChild = (parentIndex: number) => {
    setParentItems((prev) =>
      prev.map((p, i) =>
        i === parentIndex
          ? { ...p, children: [...(p.children || []), { description: "", default_hours: 0, sort_order: (p.children || []).length }] }
          : p
      )
    );
  };

  const removeChild = (parentIndex: number, childIndex: number) => {
    setParentItems((prev) =>
      prev.map((p, i) =>
        i === parentIndex
          ? { ...p, children: (p.children || []).filter((_, ci) => ci !== childIndex) }
          : p
      )
    );
  };

  const updateChild = (parentIndex: number, childIndex: number, field: string, value: any) => {
    setParentItems((prev) =>
      prev.map((p, i) =>
        i === parentIndex
          ? {
              ...p,
              children: (p.children || []).map((c, ci) =>
                ci === childIndex ? { ...c, [field]: value } : c
              ),
            }
          : p
      )
    );
  };

  // Calculate parent hours as sum of children
  function parentHours(parent: ScopeItemForm): number {
    if (!parent.children || parent.children.length === 0) return parent.default_hours;
    return parent.children.reduce((sum, c) => sum + (c.default_hours || 0), 0);
  }

  const handleSave = async () => {
    if (!form.name || !form.product || !form.category) {
      toast({ title: "Preencha Nome, Produto e Categoria", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      let templateId = editingId;
      if (editingId) {
        const { error } = await supabase.from("scope_templates").update({ name: form.name, product: form.product, category: form.category }).eq("id", editingId);
        if (error) throw error;
        // Delete old items (children first due to FK)
        const { data: existingItems } = await supabase.from("scope_template_items").select("id, parent_id").eq("template_id", editingId);
        if (existingItems) {
          const childIds = existingItems.filter(i => i.parent_id).map(i => i.id);
          if (childIds.length > 0) await supabase.from("scope_template_items").delete().in("id", childIds);
          const parentIds = existingItems.filter(i => !i.parent_id).map(i => i.id);
          if (parentIds.length > 0) await supabase.from("scope_template_items").delete().in("id", parentIds);
        }
      } else {
        const { data, error } = await supabase.from("scope_templates").insert({ name: form.name, product: form.product, category: form.category }).select().single();
        if (error) throw error;
        templateId = data.id;
      }

      if (parentItems.length > 0 && templateId) {
        for (let pi = 0; pi < parentItems.length; pi++) {
          const p = parentItems[pi];
          const hours = parentHours(p);
          const { data: parentData, error: parentError } = await supabase
            .from("scope_template_items")
            .insert({
              template_id: templateId!,
              description: p.description,
              default_hours: hours,
              sort_order: pi,
              parent_id: null,
            })
            .select()
            .single();
          if (parentError) throw parentError;

          if (p.children && p.children.length > 0) {
            const childRows = p.children.map((c, ci) => ({
              template_id: templateId!,
              description: c.description,
              default_hours: c.default_hours,
              sort_order: ci,
              parent_id: parentData.id,
            }));
            const { error: childError } = await supabase.from("scope_template_items").insert(childRows);
            if (childError) throw childError;
          }
        }
      }

      toast({ title: editingId ? "Template atualizado!" : "Template criado!" });
      qc.invalidateQueries({ queryKey: ["scope_templates"] });
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Templates de Escopo</h1>
          <p className="text-sm text-muted-foreground">{templates.length} templates disponíveis</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />Novo Template
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar template..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Edit/Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Template" : "Novo Template"}</DialogTitle>
            <DialogDescription>Preencha os dados do template de escopo.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label className="text-xs">Nome *</Label>
              <Input placeholder="Nome do template" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label className="text-xs">Produto *</Label>
                <Select value={form.product} onValueChange={(v) => setForm((f) => ({ ...f, product: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (<SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Categoria *</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (<SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Hierarchical Items */}
            <div className="mt-2">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-semibold">Itens do Escopo</Label>
                <Button variant="outline" size="sm" onClick={addParent}>
                  <FolderPlus className="mr-1 h-3 w-3" />Adicionar Processo
                </Button>
              </div>
              <div className="space-y-3">
                {parentItems.map((parent, pi) => (
                  <div key={pi} className="rounded-md border border-border overflow-hidden">
                    {/* Parent row */}
                    <div className="flex items-center gap-2 bg-muted/50 px-3 py-2">
                      <span className="text-xs font-semibold text-muted-foreground w-5 shrink-0 text-right">{pi + 1}.</span>
                      <Input
                        placeholder="Nome do processo (ex: CONTAS A PAGAR)"
                        value={parent.description}
                        onChange={(e) => updateParent(pi, "description", e.target.value)}
                        className="text-sm font-semibold flex-1"
                      />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{parentHours(parent)}h</span>
                      <button onClick={() => removeParent(pi)} className="rounded p-1 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {/* Children */}
                    <div className="px-3 py-2 space-y-1.5">
                      {(parent.children || []).map((child, ci) => (
                        <div key={ci} className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground w-8 shrink-0 text-right">{pi + 1}.{ci + 1}</span>
                          <Input
                            placeholder="Descrição do item"
                            value={child.description}
                            onChange={(e) => updateChild(pi, ci, "description", e.target.value)}
                            className="text-sm flex-1"
                          />
                          <div className="flex items-center gap-1">
                            <Label className="text-[10px] text-muted-foreground">Horas:</Label>
                            <Input
                              type="number"
                              value={child.default_hours}
                              onChange={(e) => updateChild(pi, ci, "default_hours", Number(e.target.value))}
                              className="w-16 h-7 text-xs"
                            />
                          </div>
                          <button onClick={() => removeChild(pi, ci)} className="rounded p-1 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => addChild(pi)}>
                        <Plus className="mr-1 h-3 w-3" />Adicionar Item
                      </Button>
                    </div>
                  </div>
                ))}
                {parentItems.length === 0 && <p className="text-xs text-muted-foreground">Nenhum processo adicionado.</p>}
              </div>
            </div>

            <Button className="mt-2" onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
                          <p className="text-xs text-muted-foreground">{totalItems} itens · {template.category}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          role="button"
                          className="rounded p-1 text-muted-foreground hover:text-foreground"
                          onClick={(e) => { e.stopPropagation(); openEdit(template); }}
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
