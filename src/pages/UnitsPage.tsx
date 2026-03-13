import { useState } from "react";
import { Building, Plus, Edit2 } from "lucide-react";
import { useUnits, useCreateUnit, useUpdateUnit } from "@/hooks/useSupabaseData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const emptyForm = { name: "", cnpj: "", contact: "", email: "", phone: "", address: "", city: "", tax_factor: 0 };

export default function UnitsPage() {
  const { data: units = [] } = useUnits();
  const createUnit = useCreateUnit();
  const updateUnit = useUpdateUnit();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const openNew = () => { setEditId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (u: any) => {
    setEditId(u.id);
    setForm({ name: u.name, cnpj: u.cnpj || "", contact: u.contact || "", email: u.email || "", phone: u.phone || "", address: u.address || "", city: u.city || "", tax_factor: Number(u.tax_factor) || 0 });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name) { toast({ title: "Nome é obrigatório", variant: "destructive" }); return; }
    try {
      if (editId) {
        await updateUnit.mutateAsync({ id: editId, ...form });
        toast({ title: "Unidade atualizada!" });
      } else {
        await createUnit.mutateAsync(form);
        toast({ title: "Unidade criada!" });
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const fields = [
    { id: "name", label: "Nome da Unidade *", type: "text" },
    { id: "cnpj", label: "CNPJ", type: "text" },
    { id: "contact", label: "Contato", type: "text" },
    { id: "email", label: "E-mail", type: "email" },
    { id: "phone", label: "Telefone", type: "text" },
    { id: "address", label: "Endereço", type: "text" },
    { id: "city", label: "Cidade", type: "text" },
    { id: "tax_factor", label: "Fator Imposto (%)", type: "number" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Unidades</h1>
          <p className="text-sm text-muted-foreground">{units.length} unidades cadastradas</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Nova Unidade</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>{editId ? "Editar Unidade" : "Nova Unidade"}</DialogTitle></DialogHeader>
            <div className="grid gap-3 py-2">
              {fields.map((f) => (
                <div key={f.id} className="grid gap-1">
                  <Label htmlFor={f.id} className="text-xs">{f.label}</Label>
                  <Input
                    id={f.id}
                    type={f.type}
                    placeholder={f.label.replace(" *", "")}
                    value={(form as any)[f.id]}
                    onChange={(e) => setForm((prev) => ({ ...prev, [f.id]: f.type === "number" ? Number(e.target.value) : e.target.value }))}
                  />
                </div>
              ))}
              <Button className="mt-2" onClick={handleSave} disabled={createUnit.isPending || updateUnit.isPending}>
                {(createUnit.isPending || updateUnit.isPending) ? "Salvando..." : editId ? "Atualizar" : "Salvar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {units.map((unit) => (
          <div key={unit.id} className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/30">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Building className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{unit.name}</p>
                  {unit.cnpj && <p className="text-xs text-muted-foreground">{unit.cnpj}</p>}
                </div>
              </div>
              <button onClick={() => openEdit(unit)} className="rounded p-1 text-muted-foreground hover:text-foreground">
                <Edit2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              {unit.city && <p>📍 {unit.city}</p>}
              {unit.email && <p>📧 {unit.email}</p>}
              {unit.phone && <p>📞 {unit.phone}</p>}
              {unit.contact && <p>👤 {unit.contact}</p>}
              {Number(unit.tax_factor) > 0 && <p>💰 Fator Imposto: {unit.tax_factor}%</p>}
            </div>
          </div>
        ))}
        {units.length === 0 && <p className="text-sm text-muted-foreground col-span-full">Nenhuma unidade cadastrada.</p>}
      </div>
    </div>
  );
}
