import { useState } from "react";
import { Plus, Edit2, Trash2, Package, Tag } from "lucide-react";
import {
  useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct,
  useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory,
} from "@/hooks/useSupabaseData";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type ItemType = "product" | "category";

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

  const openNew = (type: ItemType) => {
    setItemType(type);
    setEditingId(null);
    setName("");
    setDialogOpen(true);
  };

  const openEdit = (type: ItemType, id: string, currentName: string) => {
    setItemType(type);
    setEditingId(id);
    setName(currentName);
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
        if (editingId) await updateCategory.mutateAsync({ id: editingId, name: name.trim() });
        else await createCategory.mutateAsync({ name: name.trim() });
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

  const renderList = (type: ItemType, items: { id: string; name: string }[], icon: React.ReactNode) => (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold text-foreground">{type === "product" ? "Produtos" : "Categorias"}</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{items.length}</span>
        </div>
        <Button size="sm" onClick={() => openNew(type)}>
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
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(type, item.id, item.name)}>
                <Edit2 className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(type, item.id)}>
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
        {renderList("product", products, <Package className="h-4 w-4 text-muted-foreground" />)}
        {renderList("category", categories, <Tag className="h-4 w-4 text-muted-foreground" />)}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar" : "Novo"} {itemType === "product" ? "Produto" : "Categoria"}</DialogTitle>
            <DialogDescription>Informe o nome.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label className="text-xs">Nome *</Label>
              <Input
                placeholder={itemType === "product" ? "Ex: Protheus" : "Ex: Fiscal"}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
              />
            </div>
            <Button onClick={handleSave} disabled={createProduct.isPending || updateProduct.isPending || createCategory.isPending || updateCategory.isPending}>
              {editingId ? "Salvar" : "Criar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
