import { useState } from "react";
import { Search, LayoutTemplate, ChevronDown, ChevronRight, Edit2, Plus, Trash2 } from "lucide-react";
import { useScopeTemplates, useProducts } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const emptyForm = { name: "", product: "", category: "" };

export default function ScopeTemplatesPage() {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: templates = [] } = useScopeTemplates();
  const { data: products = [] } = useProducts();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState<{ id?: string; description: string; default_hours: number; phase: number; sort_order: number }[]>([]);
  const [saving, setSaving] = useState(false);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setItems([]);
    setDialogOpen(true);
  };

  const openEdit = (template: any) => {
    setEditingId(template.id);
    setForm({ name: template.name, product: template.product, category: template.category });
    const templateItems = (template.scope_template_items || []).map((it: any) => ({
      id: it.id,
      description: it.description,
      default_hours: it.default_hours,
      phase: it.phase,
      sort_order: it.sort_order,
    }));
    setItems(templateItems.sort((a: any, b: any) => a.sort_order - b.sort_order));
    setDialogOpen(true);
  };

  const addItem = () => {
    setItems((prev) => [...prev, { description: "", default_hours: 0, phase: 1, sort_order: prev.length }]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: string, value: any) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  };

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
        // Delete old items and re-insert
        await supabase.from("scope_template_items").delete().eq("template_id", editingId);
      } else {
        const { data, error } = await supabase.from("scope_templates").insert({ name: form.name, product: form.product, category: form.category }).select().single();
        if (error) throw error;
        templateId = data.id;
      }

      if (items.length > 0 && templateId) {
        const rows = items.map((it, i) => ({
          template_id: templateId!,
          description: it.description,
          default_hours: it.default_hours,
          phase: it.phase,
          sort_order: i,
        }));
        const { error: itemsError } = await supabase.from("scope_template_items").insert(rows);
        if (itemsError) throw itemsError;
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
                <Input placeholder="Ex: Fiscal, Compras" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
              </div>
            </div>

            {/* Items */}
            <div className="mt-2">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-semibold">Itens do Escopo</Label>
                <Button variant="outline" size="sm" onClick={addItem}>
                  <Plus className="mr-1 h-3 w-3" />Adicionar Item
                </Button>
              </div>
              <div className="space-y-2">
                {items.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-md border border-border p-2">
                    <span className="mt-2 text-xs text-muted-foreground w-5 shrink-0 text-right">{i + 1}.</span>
                    <div className="flex-1 grid gap-1">
                      <Input
                        placeholder="Descrição do item"
                        value={item.description}
                        onChange={(e) => updateItem(i, "description", e.target.value)}
                        className="text-sm"
                      />
                      <div className="flex gap-2">
                        <div className="flex items-center gap-1">
                          <Label className="text-[10px] text-muted-foreground">Horas:</Label>
                          <Input
                            type="number"
                            value={item.default_hours}
                            onChange={(e) => updateItem(i, "default_hours", Number(e.target.value))}
                            className="w-16 h-7 text-xs"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <Label className="text-[10px] text-muted-foreground">Fase:</Label>
                          <Input
                            type="number"
                            value={item.phase}
                            onChange={(e) => updateItem(i, "phase", Number(e.target.value))}
                            className="w-14 h-7 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                    <button onClick={() => removeItem(i)} className="mt-2 rounded p-1 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {items.length === 0 && <p className="text-xs text-muted-foreground">Nenhum item adicionado.</p>}
              </div>
            </div>

            <Button className="mt-2" onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-4">
        {Object.entries(grouped).map(([product, templates]) => (
          <div key={product}>
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">{product}</h2>
            <div className="space-y-2">
              {templates.map((template) => {
                const isOpen = expandedId === template.id;
                const templateItems = (template as any).scope_template_items || [];
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
                          <p className="text-xs text-muted-foreground">{templateItems.length} itens · {template.category}</p>
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
                        <div className="space-y-1.5">
                          {templateItems.map((item: any, i: number) => (
                            <div key={item.id} className="flex items-center gap-2 text-sm text-foreground">
                              <span className="shrink-0 text-xs text-muted-foreground w-5 text-right">{i + 1}.</span>
                              <span>{item.description}</span>
                            </div>
                          ))}
                          {templateItems.length === 0 && <p className="text-sm text-muted-foreground">Nenhum item neste template.</p>}
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
