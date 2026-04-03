import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Edit2, Trash2, Layers, ArrowLeft } from "lucide-react";
import {
  useSegments, useCreateSegment, useUpdateSegment, useDeleteSegment,
} from "@/hooks/useSupabaseData";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

export default function SegmentsPage() {
  const navigate = useNavigate();
  const { data: segments = [] } = useSegments();
  const createSegment = useCreateSegment();
  const updateSegment = useUpdateSegment();
  const deleteSegment = useDeleteSegment();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");

  const openNew = () => {
    setEditingId(null);
    setName("");
    setDialogOpen(true);
  };

  const openEdit = (id: string, currentName: string) => {
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
      if (editingId) await updateSegment.mutateAsync({ id: editingId, name: name.trim() });
      else await createSegment.mutateAsync({ name: name.trim() });
      toast({ title: editingId ? "Atualizado!" : "Criado!" });
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja excluir este segmento?")) return;
    try {
      await deleteSegment.mutateAsync(id);
      toast({ title: "Excluído!" });
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/cadastros")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Segmentos</h1>
          <p className="text-sm text-muted-foreground">Gerencie os segmentos de mercado vinculados às propostas de software</p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Segmentos</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{segments.length}</span>
          </div>
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-1 h-3 w-3" />Novo
          </Button>
        </div>
        <div className="divide-y divide-border">
          {segments.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum segmento cadastrado.</p>
          )}
          {segments.map((item) => (
            <div key={item.id} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-foreground">{item.name}</span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item.id, item.name)}>
                  <Edit2 className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(item.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar" : "Novo"} Segmento</DialogTitle>
            <DialogDescription>Informe o nome do segmento.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label className="text-xs">Nome *</Label>
              <Input
                placeholder="Ex: Serviços"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
              />
            </div>
            <Button onClick={handleSave} disabled={createSegment.isPending || updateSegment.isPending}>
              {editingId ? "Salvar" : "Criar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
