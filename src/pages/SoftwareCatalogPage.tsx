import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import {
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  Search,
  Tag,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const CATEGORY_OPTIONS = [
  { value: "erp", label: "ERP" },
  { value: "crm", label: "CRM" },
  { value: "bi", label: "BI / Analytics" },
  { value: "rh", label: "RH / HCM" },
  { value: "fiscal", label: "Fiscal / Contábil" },
  { value: "infra", label: "Infraestrutura" },
  { value: "security", label: "Segurança" },
  { value: "cloud", label: "Cloud / SaaS" },
  { value: "other", label: "Outro" },
];

import { RECURRENCE_OPTIONS, COST_CLASSIFICATION_OPTIONS, getRecurrenceLabel, getCostClassificationLabel } from "@/lib/softwareConstants";

const COST_CLASSIFICATION_OPTIONS = [
  { value: "opex", label: "Opex" },
  { value: "capex", label: "Capex" },
  { value: "other", label: "Outros" },
];

interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  vendor_name: string | null;
  default_recurrence: string;
  default_cost_classification: string;
  is_active: boolean;
  part_number: string | null;
  external_code: string | null;
  created_at: string;
}

interface AliasItem {
  id: string;
  catalog_item_id: string;
  alias: string;
  source: string;
}

type FormData = {
  name: string;
  description: string;
  category: string;
  vendor_name: string;
  default_recurrence: string;
  default_cost_classification: string;
  is_active: boolean;
  part_number: string;
  external_code: string;
};

const emptyForm: FormData = {
  name: "",
  description: "",
  category: "other",
  vendor_name: "",
  default_recurrence: "one_time",
  default_cost_classification: "opex",
  is_active: true,
  part_number: "",
  external_code: "",
};

export default function SoftwareCatalogPage() {
  const { role } = useUserRole();
  const queryClient = useQueryClient();
  const isAdmin = role === "admin";

  const [search, setSearch] = useState("");
  const [editItem, setEditItem] = useState<CatalogItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<CatalogItem | null>(null);

  // Alias state
  const [aliasDialogItem, setAliasDialogItem] = useState<CatalogItem | null>(null);
  const [newAlias, setNewAlias] = useState("");

  // Queries
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["software-catalog-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("software_catalog_items")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as CatalogItem[];
    },
  });

  const { data: aliases = [] } = useQuery({
    queryKey: ["software-catalog-aliases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("software_catalog_aliases")
        .select("*")
        .order("alias");
      if (error) throw error;
      return data as AliasItem[];
    },
  });

  const filteredItems = items.filter((i) => {
    const s = search.trim().toLowerCase();
    if (!s) return true;
    const itemAliases = aliases.filter((a) => a.catalog_item_id === i.id);
    return (
      i.name.toLowerCase().includes(s) ||
      (i.vendor_name || "").toLowerCase().includes(s) ||
      (i.description || "").toLowerCase().includes(s) ||
      (i.part_number || "").toLowerCase().includes(s) ||
      (i.external_code || "").toLowerCase().includes(s) ||
      itemAliases.some((a) => a.alias.toLowerCase().includes(s))
    );
  });

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!formData.name.trim()) throw new Error("Nome é obrigatório");
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        category: formData.category,
        vendor_name: formData.vendor_name.trim() || null,
        default_recurrence: formData.default_recurrence,
        default_cost_classification: formData.default_cost_classification,
        is_active: formData.is_active,
        part_number: formData.part_number.trim() || null,
        external_code: formData.external_code.trim() || null,
      };
      if (editItem) {
        const { error } = await supabase
          .from("software_catalog_items")
          .update(payload)
          .eq("id", editItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("software_catalog_items")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editItem ? "Item atualizado!" : "Item criado!");
      queryClient.invalidateQueries({ queryKey: ["software-catalog-items"] });
      closeForm();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("software_catalog_items")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item desativado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["software-catalog-items"] });
      setDeleteTarget(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const addAliasMutation = useMutation({
    mutationFn: async ({ catalogItemId, alias }: { catalogItemId: string; alias: string }) => {
      const normalizedAlias = alias.trim().toLowerCase();
      if (!normalizedAlias) throw new Error("Alias não pode ser vazio");
      const { error } = await supabase.from("software_catalog_aliases").insert({
        catalog_item_id: catalogItemId,
        alias: normalizedAlias,
        source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Alias adicionado!");
      queryClient.invalidateQueries({ queryKey: ["software-catalog-aliases"] });
      setNewAlias("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteAliasMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("software_catalog_aliases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Alias removido!");
      queryClient.invalidateQueries({ queryKey: ["software-catalog-aliases"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("software_catalog_items")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["software-catalog-items"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function openCreate() {
    setEditItem(null);
    setFormData(emptyForm);
    setFormOpen(true);
  }

  function openEdit(item: CatalogItem) {
    setEditItem(item);
    setFormData({
      name: item.name,
      description: item.description || "",
      category: item.category,
      vendor_name: item.vendor_name || "",
      default_recurrence: item.default_recurrence,
      default_cost_classification: item.default_cost_classification,
      is_active: item.is_active,
      part_number: item.part_number || "",
      external_code: item.external_code || "",
    });
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditItem(null);
    setFormData(emptyForm);
  }

  const categoryLabel = (cat: string) =>
    CATEGORY_OPTIONS.find((c) => c.value === cat)?.label || cat;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Catálogo de Itens de Software</h1>
          <p className="text-sm text-muted-foreground">
            {search ? `${filteredItems.length} de ${items.length}` : items.length} itens cadastrados
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Item
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, fornecedor, descrição, alias, part number ou código..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* List — Grid-based */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Grid Header */}
        <div className={`hidden border-b border-border bg-muted/50 px-4 py-2.5 md:grid md:gap-3 md:items-center ${isAdmin ? "md:grid-cols-[2fr_1.5fr_auto_auto_auto_auto_auto_80px]" : "md:grid-cols-[2fr_1.5fr_auto_auto_auto_auto_auto]"}`}>
          <span className="text-xs font-medium text-muted-foreground">Nome</span>
          <span className="text-xs font-medium text-muted-foreground">Fornecedor</span>
          <span className="text-xs font-medium text-muted-foreground">Categoria</span>
          <span className="text-xs font-medium text-muted-foreground">Recorrência</span>
          <span className="text-xs font-medium text-muted-foreground">Classificação</span>
          <span className="text-xs font-medium text-muted-foreground">Aliases</span>
          <span className="text-xs font-medium text-muted-foreground">Ativo</span>
          {isAdmin && <span className="text-xs font-medium text-muted-foreground text-right">Ações</span>}
        </div>

        <div className="divide-y divide-border">
          {isLoading ? (
            <div className="space-y-0">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-4 py-3">
                  <Skeleton className="h-8 w-full" />
                </div>
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <BookOpen className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">
                {search ? "Nenhum resultado encontrado" : "Nenhum item cadastrado"}
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                {search
                  ? "Tente ajustar os termos de busca."
                  : "Cadastre itens no catálogo para normalizar dados extraídos das propostas de software."}
              </p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const itemAliases = aliases.filter((a) => a.catalog_item_id === item.id);
              return (
                <div
                  key={item.id}
                  className={`flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-accent/50 md:grid md:gap-3 md:items-center ${isAdmin ? "md:grid-cols-[2fr_1.5fr_auto_auto_auto_auto_auto_80px]" : "md:grid-cols-[2fr_1.5fr_auto_auto_auto_auto_auto]"}`}
                >
                  {/* Nome */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                    )}
                  </div>
                  {/* Fornecedor */}
                  <p className="text-sm text-muted-foreground truncate min-w-0">{item.vendor_name || "—"}</p>
                  {/* Categoria */}
                  <div>
                    <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
                      {categoryLabel(item.category)}
                    </span>
                  </div>
                  {/* Recorrência */}
                  <p className="text-sm text-muted-foreground whitespace-nowrap">
                    {RECURRENCE_OPTIONS.find((r) => r.value === item.default_recurrence)?.label || item.default_recurrence}
                  </p>
                  {/* Classificação */}
                  <p className="text-sm text-foreground uppercase whitespace-nowrap">{item.default_cost_classification}</p>
                  {/* Aliases */}
                  <div>
                    <button
                      onClick={() => setAliasDialogItem(item)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Tag className="h-3 w-3" />
                      {itemAliases.length}
                    </button>
                  </div>
                  {/* Ativo */}
                  <div>
                    {isAdmin ? (
                      <Switch
                        checked={item.is_active}
                        onCheckedChange={(checked) =>
                          toggleActiveMutation.mutate({ id: item.id, is_active: checked })
                        }
                      />
                    ) : item.is_active ? (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-success/15 text-success whitespace-nowrap">Ativo</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground whitespace-nowrap">Inativo</span>
                    )}
                  </div>
                  {/* Ações */}
                  {isAdmin && (
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(item)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={(o) => !o && closeForm()}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              {editItem ? "Editar Item do Catálogo" : "Novo Item do Catálogo"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Section: Identification */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Identificação</h4>
              <div className="space-y-2">
                <Label className="text-xs">Nome do item *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Ex: TOTVS Protheus"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Descrição</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                  rows={2}
                  placeholder="Descrição opcional do item..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Fornecedor</Label>
                  <Input
                    value={formData.vendor_name}
                    onChange={(e) => setFormData((p) => ({ ...p, vendor_name: e.target.value }))}
                    placeholder="Ex: TOTVS"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Categoria</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(v) => setFormData((p) => ({ ...p, category: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Section: Financial Defaults */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Padrões Financeiros</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Recorrência Padrão</Label>
                  <Select
                    value={formData.default_recurrence}
                    onValueChange={(v) => setFormData((p) => ({ ...p, default_recurrence: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RECURRENCE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Classificação de Custo</Label>
                  <Select
                    value={formData.default_cost_classification}
                    onValueChange={(v) =>
                      setFormData((p) => ({ ...p, default_cost_classification: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COST_CLASSIFICATION_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Section: Codes & Integration */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Códigos & Integração</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Part Number</Label>
                  <Input
                    value={formData.part_number}
                    onChange={(e) => setFormData((p) => ({ ...p, part_number: e.target.value }))}
                    placeholder="Ex: CLOUD-001"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Código Externo ERP</Label>
                  <Input
                    value={formData.external_code}
                    onChange={(e) => setFormData((p) => ({ ...p, external_code: e.target.value }))}
                    placeholder="Ex: ERP-12345"
                  />
                </div>
              </div>
            </div>

            {/* Section: Status */}
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Itens inativos não aparecem em novos vínculos
                  </p>
                </div>
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(c) => setFormData((p) => ({ ...p, is_active: c }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>
              Cancelar
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {editItem ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar item do catálogo?</AlertDialogTitle>
            <AlertDialogDescription>
              O item "{deleteTarget?.name}" será desativado e não aparecerá em novos vínculos.
              Você poderá reativá-lo a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deactivateMutation.mutate(deleteTarget.id)}
            >
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Alias Dialog */}
      <Dialog open={!!aliasDialogItem} onOpenChange={(o) => !o && setAliasDialogItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" />
              Aliases — {aliasDialogItem?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {aliasDialogItem && (
              <>
                {(() => {
                  const itemAliases = aliases.filter(
                    (a) => a.catalog_item_id === aliasDialogItem.id
                  );
                  return itemAliases.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhum alias cadastrado para este item.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {itemAliases.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                        >
                          <div>
                            <span className="text-sm font-medium">{a.alias}</span>
                            <span className="ml-2 text-xs text-muted-foreground">({a.source})</span>
                          </div>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => deleteAliasMutation.mutate(a.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {isAdmin && (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Novo alias..."
                      value={newAlias}
                      onChange={(e) => setNewAlias(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newAlias.trim()) {
                          addAliasMutation.mutate({
                            catalogItemId: aliasDialogItem.id,
                            alias: newAlias,
                          });
                        }
                      }}
                    />
                    <Button
                      onClick={() => {
                        if (newAlias.trim()) {
                          addAliasMutation.mutate({
                            catalogItemId: aliasDialogItem.id,
                            alias: newAlias,
                          });
                        }
                      }}
                      disabled={!newAlias.trim() || addAliasMutation.isPending}
                      size="sm"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
