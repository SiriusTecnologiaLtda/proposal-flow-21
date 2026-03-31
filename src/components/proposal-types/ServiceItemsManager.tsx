import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Layers } from "lucide-react";

interface ServiceItem {
  id: string;
  proposal_type_id: string;
  label: string;
  rounding_factor: number;
  is_base_scope: boolean;
  additional_pct: number;
  hourly_rate: number;
  related_item_id: string | null;
  sort_order: number;
}

interface Props {
  proposalTypeId: string;
  proposalTypeName: string;
}

const emptyForm = {
  label: "",
  rounding_factor: 8,
  is_base_scope: false,
  additional_pct: 0,
  related_item_id: "",
};

export default function ServiceItemsManager({ proposalTypeId, proposalTypeName }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const queryKey = ["service_items", proposalTypeId];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: items = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposal_type_service_items")
        .select("*")
        .eq("proposal_type_id", proposalTypeId)
        .order("sort_order");
      if (error) throw error;
      return data as unknown as ServiceItem[];
    },
  });

  const baseItems = items.filter((i) => i.is_base_scope);
  const hasBaseItem = baseItems.length > 0;

  const saveMutation = useMutation({
    mutationFn: async (values: typeof emptyForm & { id?: string }) => {
      const payload: any = {
        proposal_type_id: proposalTypeId,
        label: values.label,
        rounding_factor: values.rounding_factor,
        is_base_scope: values.is_base_scope,
        additional_pct: values.is_base_scope ? 0 : values.additional_pct,
        related_item_id: values.is_base_scope ? null : (values.related_item_id || null),
        sort_order: values.is_base_scope ? 0 : (items.length + 1),
      };
      if (values.id) {
        const { error } = await supabase
          .from("proposal_type_service_items")
          .update(payload)
          .eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("proposal_type_service_items")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast({ title: "Salvo", description: "Item de serviço salvo com sucesso." });
      closeDialog();
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("proposal_type_service_items")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast({ title: "Excluído" });
      setDeleteId(null);
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function openCreate() {
    setForm({ ...emptyForm, is_base_scope: !hasBaseItem });
    setEditingId(null);
    setDialogOpen(true);
  }

  function openEdit(item: ServiceItem) {
    setForm({
      label: item.label,
      rounding_factor: item.rounding_factor,
      is_base_scope: item.is_base_scope,
      additional_pct: item.additional_pct,
      related_item_id: item.related_item_id || "",
    });
    setEditingId(item.id);
    setDialogOpen(true);
  }

  function handleSave() {
    if (!form.label.trim()) {
      toast({ title: "Campo obrigatório", description: "Preencha o nome do item.", variant: "destructive" });
      return;
    }
    if (form.is_base_scope && hasBaseItem && editingId !== baseItems[0]?.id) {
      toast({ title: "Limite atingido", description: "Já existe um item base escopo para este tipo.", variant: "destructive" });
      return;
    }
    if (!form.is_base_scope && !form.related_item_id) {
      toast({ title: "Campo obrigatório", description: "Selecione o item relacionado.", variant: "destructive" });
      return;
    }
    saveMutation.mutate({ ...form, id: editingId ?? undefined });
  }

  // Can toggle base scope only if no other base item exists (or editing the current base)
  const canToggleBase = !hasBaseItem || (editingId != null && baseItems[0]?.id === editingId);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            Itens de Serviço — {proposalTypeName}
          </CardTitle>
          <Button size="sm" variant="outline" onClick={openCreate}>
            <Plus className="mr-1 h-3 w-3" /> Novo Item
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum item cadastrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="w-28">Arredond. (h)</TableHead>
                  <TableHead className="w-28">Base Escopo</TableHead>
                  <TableHead className="w-28">% Adicional</TableHead>
                  <TableHead>Item Relacionado</TableHead>
                  <TableHead className="w-20">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const related = items.find((i) => i.id === item.related_item_id);
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.label}</TableCell>
                      <TableCell>{item.rounding_factor}h</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${item.is_base_scope ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                          {item.is_base_scope ? "Sim" : "Não"}
                        </span>
                      </TableCell>
                      <TableCell>{item.is_base_scope ? "—" : `${item.additional_pct}%`}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.is_base_scope ? "—" : (related?.label || "—")}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteId(item.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Item de Serviço" : "Novo Item de Serviço"}</DialogTitle>
            <DialogDescription>Configure o item de serviço para o tipo "{proposalTypeName}"</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome do Item</Label>
              <Input
                placeholder="Ex: Analista de Implantação"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
            </div>

            <div className="grid gap-4 grid-cols-2">
              <div>
                <Label>Fator de Arredondamento (horas)</Label>
                <Select value={String(form.rounding_factor)} onValueChange={(v) => setForm({ ...form, rounding_factor: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 hora</SelectItem>
                    <SelectItem value="2">2 horas</SelectItem>
                    <SelectItem value="4">4 horas</SelectItem>
                    <SelectItem value="8">8 horas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end gap-3 pb-1">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.is_base_scope}
                    onCheckedChange={(checked) => {
                      if (!canToggleBase && checked) {
                        toast({ title: "Limite", description: "Já existe um item base escopo.", variant: "destructive" });
                        return;
                      }
                      setForm({ ...form, is_base_scope: checked, additional_pct: 0, related_item_id: "" });
                    }}
                  />
                  <Label className="text-sm">Item Base Escopo</Label>
                </div>
              </div>
            </div>

            {!form.is_base_scope && (
              <>
                <div>
                  <Label>Percentual Adicional (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="Ex: 20"
                    value={form.additional_pct}
                    onChange={(e) => setForm({ ...form, additional_pct: Number(e.target.value) })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Percentual aplicado sobre as horas do item base</p>
                </div>

                <div>
                  <Label>Item Relacionado (Base Escopo)</Label>
                  <Select value={form.related_item_id} onValueChange={(v) => setForm({ ...form, related_item_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o item base" />
                    </SelectTrigger>
                    <SelectContent>
                      {baseItems.map((bi) => (
                        <SelectItem key={bi.id} value={bi.id}>{bi.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {baseItems.length === 0 && (
                    <p className="text-xs text-destructive mt-1">Cadastre primeiro um item com Base Escopo = Sim</p>
                  )}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir item de serviço?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Itens relacionados perderão a referência.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
