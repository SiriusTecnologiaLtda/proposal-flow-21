import { useState } from "react";
import { Plus, Edit2, Trash2, Package, Tag } from "lucide-react";
import {
  useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct,
  useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory,
} from "@/hooks/useSupabaseData";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type ItemType = "product" | "category";

const COST_CLASSIFICATIONS = [
  { value: "opex", label: "Opex (Recorrente)" },
  { value: "capex", label: "Capex (Não Recorrente)" },
] as const;

const getClassificationLabel = (v: string) =>
  v === "capex" ? "Capex" : "Opex";

const getClassificationVariant = (v: string): "default" | "secondary" =>
  v === "capex" ? "secondary" : "default";

export default function ProductsCategoriesPage() {
  const { data: products = [] } = useProducts();
  const { data: categories = [] } = useCategories();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [itemType, setItemType] = useState<ItemType>("product");
  const [name, setName] = useState("");
  const [costClassification, setCostClassification] = useState("opex");

  const openNew = (type: ItemType) => {
    setItemType(type);
    setEditingId(null);
    setName("");
    setCostClassification("opex");
    setDialogOpen(true);
  };

  const openEdit = (type: ItemType, id: string, currentName: string, classification?: string) => {
    setItemType(type);
    setEditingId(id);
    setName(currentName);
    setCostClassification(classification || "opex");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Informe o nome", variant: "destructive" });
      return;
    }
    try {
      if (itemType === "product") {
        if (editingId) await updateProduct.mutateAsync({ id: editingId, name: name.trim() });
        else await createProduct.mutateAsync({ name: name.trim() });
      } else {
        if (editingId) await updateCategory.mutateAsync({ id: editingId, name: name.trim(), cost_classification: costClassification });
        else await createCategory.mutateAsync({ name: name.trim(), cost_classification: costClassification });
      }
      toast({ title: editingId ? "Atualizado!" : "Criado!" });
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (type: ItemType, id: string) => {
    if (!confirm("Deseja excluir este item?")) return;
    try {
      if (type === "product") await deleteProduct.mutateAsync(id);
      else await deleteCategory.mutateAsync(id);
      toast({ title: "Excluído!" });
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    }
  };

  const renderProductList = (items: { id: string; name: string }[]) => (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Produtos</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{items.length}</span>
        </div>
        <Button size="sm" onClick={() => openNew("product")}>
          <Plus className="mr-1 h-3 w-3" />Novo
        </Button>
      </div>
      <div className="divide-y divide-border">
        {items.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum registro cadastrado.</p>
        )}
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-foreground">{item.name}</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit("product", item.id, item.name)}>
                <Edit2 className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete("product", item.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderCategoryList = (items: any[]) => (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Categorias</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{items.length}</span>
        </div>
        <Button size="sm" onClick={() => openNew("category")}>
          <Plus className="mr-1 h-3 w-3" />Novo
        </Button>
      </div>
      <div className="divide-y divide-border">
        {items.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum registro cadastrado.</p>
        )}
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-sm text-foreground">{item.name}</span>
              <Badge variant={getClassificationVariant(item.cost_classification || "opex")} className="text-[10px] px-1.5 py-0">
                {getClassificationLabel(item.cost_classification || "opex")}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit("category", item.id, item.name, item.cost_classification)}>
                <Edit2 className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete("category", item.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Produtos & Categorias</h1>
        <p className="text-sm text-muted-foreground">Gerencie os produtos e categorias disponíveis para templates e propostas</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {renderProductList(products)}
        {renderCategoryList(categories)}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar" : "Novo"} {itemType === "product" ? "Produto" : "Categoria"}</DialogTitle>
            <DialogDescription>Informe os dados.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label className="text-xs">Nome *</Label>
              <Input
                placeholder={itemType === "product" ? "Ex: Protheus" : "Ex: SCS"}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
              />
            </div>
            {itemType === "category" && (
              <div className="grid gap-1">
                <Label className="text-xs">Classificação de Custo *</Label>
                <Select value={costClassification} onValueChange={setCostClassification}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COST_CLASSIFICATIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={handleSave} disabled={createProduct.isPending || updateProduct.isPending || createCategory.isPending || updateCategory.isPending}>
              {editingId ? "Salvar" : "Criar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
