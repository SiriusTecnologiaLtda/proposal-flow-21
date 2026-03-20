import { useState } from "react";
import { Building, Plus, Edit2, Users, Copy, Trash2 } from "lucide-react";
import { useUnits, useCreateUnit, useUpdateUnit } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

const emptyForm = { name: "", code: "", cnpj: "", contact: "", email: "", phone: "", address: "", city: "", tax_factor: 0 };
const emptyContact = { name: "", email: "", phone: "", role: "Signatário", department: "", position: "", notes: "" };
const ROLES = ["Signatário", "Testemunha", "Aprovador", "Observador"];

function useUnitContacts(unitId: string | null) {
  return useQuery({
    queryKey: ["unit_contacts", unitId],
    enabled: !!unitId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unit_contacts")
        .select("*")
        .eq("unit_id", unitId!)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

export default function UnitsPage() {
  const { data: units = [] } = useUnits();
  const createUnit = useCreateUnit();
  const updateUnit = useUpdateUnit();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Detail / Contacts panel
  const [selectedUnit, setSelectedUnit] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("dados");

  // Contact editing
  const [contactForm, setContactForm] = useState(emptyContact);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [savingContact, setSavingContact] = useState(false);

  // Copy dialog
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copyTargets, setCopyTargets] = useState<string[]>([]);
  const [copying, setCopying] = useState(false);

  const { data: unitContacts = [], isLoading: loadingContacts } = useUnitContacts(selectedUnit?.id || null);

  const openNew = () => { setEditId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (u: any) => {
    setEditId(u.id);
    setForm({ name: u.name, code: u.code || "", cnpj: u.cnpj || "", contact: u.contact || "", email: u.email || "", phone: u.phone || "", address: u.address || "", city: u.city || "", tax_factor: Number(u.tax_factor) || 0 });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name) { toast({ title: "Nome é obrigatório", variant: "destructive" }); return; }
    setSaving(true);
    const mutation = editId ? updateUnit : createUnit;
    const payload = editId ? { id: editId, ...form } : form;
    mutation.mutate(payload as any, {
      onSuccess: () => {
        toast({ title: editId ? "Unidade atualizada!" : "Unidade criada!" });
        setDialogOpen(false);
        setSaving(false);
      },
      onError: (err: any) => {
        toast({ title: "Erro", description: err.message, variant: "destructive" });
        setSaving(false);
      },
    });
  };

  // Contact CRUD
  const openNewContact = () => {
    setEditingContactId(null);
    setContactForm(emptyContact);
    setContactDialogOpen(true);
  };

  const openEditContact = (c: any) => {
    setEditingContactId(c.id);
    setContactForm({ name: c.name, email: c.email, phone: c.phone || "", role: c.role || "Signatário", department: c.department || "", position: c.position || "", notes: c.notes || "" });
    setContactDialogOpen(true);
  };

  const handleSaveContact = async () => {
    if (!contactForm.name || !contactForm.email) {
      toast({ title: "Nome e e-mail são obrigatórios", variant: "destructive" });
      return;
    }
    setSavingContact(true);
    try {
      if (editingContactId) {
        const { error } = await supabase.from("unit_contacts").update(contactForm).eq("id", editingContactId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("unit_contacts").insert({ ...contactForm, unit_id: selectedUnit.id });
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ["unit_contacts", selectedUnit.id] });
      setContactDialogOpen(false);
      toast({ title: editingContactId ? "Contato atualizado!" : "Contato adicionado!" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSavingContact(false);
    }
  };

  const handleDeleteContact = async (id: string) => {
    const { error } = await supabase.from("unit_contacts").delete().eq("id", id);
    if (error) { toast({ title: "Erro ao excluir", variant: "destructive" }); return; }
    queryClient.invalidateQueries({ queryKey: ["unit_contacts", selectedUnit.id] });
    toast({ title: "Contato removido!" });
  };

  // Copy contacts to other units
  const handleCopyContacts = async () => {
    if (copyTargets.length === 0) { toast({ title: "Selecione ao menos uma unidade", variant: "destructive" }); return; }
    setCopying(true);
    try {
      const rows = copyTargets.flatMap((targetId) =>
        unitContacts.map((c: any) => ({
          unit_id: targetId,
          name: c.name,
          email: c.email,
          phone: c.phone || null,
          role: c.role || "Signatário",
          department: c.department || "",
          position: c.position || "",
          notes: c.notes || "",
        }))
      );
      const { error } = await supabase.from("unit_contacts").insert(rows);
      if (error) throw error;
      copyTargets.forEach((id) => queryClient.invalidateQueries({ queryKey: ["unit_contacts", id] }));
      setCopyDialogOpen(false);
      setCopyTargets([]);
      toast({ title: `Contatos copiados para ${copyTargets.length} unidade(s)!` });
    } catch (err: any) {
      toast({ title: "Erro ao copiar", description: err.message, variant: "destructive" });
    } finally {
      setCopying(false);
    }
  };

  const fields = [
    { id: "name", label: "Nome da Unidade *", type: "text" },
    { id: "code", label: "Código TOTVS", type: "text" },
    { id: "cnpj", label: "CNPJ", type: "text" },
    { id: "contact", label: "Contato", type: "text" },
    { id: "email", label: "E-mail", type: "email" },
    { id: "phone", label: "Telefone", type: "text" },
    { id: "address", label: "Endereço", type: "text" },
    { id: "city", label: "Cidade", type: "text" },
    { id: "tax_factor", label: "Fator Imposto", type: "number", step: "0.0001" },
  ];

  const otherUnits = units.filter((u: any) => u.id !== selectedUnit?.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Unidades</h1>
          <p className="text-sm text-muted-foreground">{units.length} unidades cadastradas</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Nova Unidade</Button>
      </div>

      {/* Unit form dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Unidade" : "Nova Unidade"}</DialogTitle>
            <DialogDescription>Preencha os dados da unidade TOTVS.</DialogDescription>
          </DialogHeader>
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
            <Button className="mt-2" onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : editId ? "Atualizar" : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Contact form dialog */}
      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingContactId ? "Editar Contato" : "Novo Contato"}</DialogTitle>
            <DialogDescription>Contato default para assinatura eletrônica.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label className="text-xs">Nome *</Label>
              <Input value={contactForm.name} onChange={(e) => setContactForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">E-mail *</Label>
              <Input type="email" value={contactForm.email} onChange={(e) => setContactForm((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Telefone</Label>
              <Input value={contactForm.phone} onChange={(e) => setContactForm((p) => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Papel</Label>
              <Select value={contactForm.role} onValueChange={(v) => setContactForm((p) => ({ ...p, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Departamento</Label>
              <Input value={contactForm.department} onChange={(e) => setContactForm((p) => ({ ...p, department: e.target.value }))} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Cargo</Label>
              <Input value={contactForm.position} onChange={(e) => setContactForm((p) => ({ ...p, position: e.target.value }))} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Notas</Label>
              <Input value={contactForm.notes} onChange={(e) => setContactForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveContact} disabled={savingContact}>
              {savingContact ? "Salvando..." : editingContactId ? "Atualizar" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copy contacts dialog */}
      <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Copiar Contatos</DialogTitle>
            <DialogDescription>
              Copiar {unitContacts.length} contato(s) de "{selectedUnit?.name}" para as unidades selecionadas.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-60 overflow-y-auto space-y-2 py-2">
            {otherUnits.map((u: any) => (
              <label key={u.id} className="flex items-center gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/50">
                <Checkbox
                  checked={copyTargets.includes(u.id)}
                  onCheckedChange={(checked) => {
                    setCopyTargets((prev) => checked ? [...prev, u.id] : prev.filter((id) => id !== u.id));
                  }}
                />
                <span className="text-sm">{u.name}</span>
                {u.code && <span className="text-xs text-muted-foreground font-mono ml-auto">{u.code}</span>}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCopyContacts} disabled={copying || copyTargets.length === 0}>
              {copying ? "Copiando..." : `Copiar para ${copyTargets.length} unidade(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex gap-4">
        {/* Units list */}
        <div className={`${selectedUnit ? "w-1/3" : "w-full"} transition-all`}>
          <div className={`grid gap-3 ${selectedUnit ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
            {units.map((unit: any) => (
              <div
                key={unit.id}
                onClick={() => { setSelectedUnit(unit); setActiveTab("dados"); }}
                className={`rounded-lg border bg-card p-4 transition-colors cursor-pointer ${selectedUnit?.id === unit.id ? "border-primary ring-1 ring-primary/20" : "border-border hover:border-primary/30"}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Building className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{unit.name}</p>
                      {unit.code && <p className="text-xs text-muted-foreground font-mono">{unit.code}</p>}
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); openEdit(unit); }} className="rounded p-1 text-muted-foreground hover:text-foreground">
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {!selectedUnit && (
                  <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                    {unit.city && <p>📍 {unit.city}</p>}
                    {unit.email && <p>📧 {unit.email}</p>}
                    {Number(unit.tax_factor) > 0 && <p>💰 Fator: {Number(unit.tax_factor).toFixed(4)}</p>}
                  </div>
                )}
              </div>
            ))}
            {units.length === 0 && <p className="text-sm text-muted-foreground col-span-full">Nenhuma unidade cadastrada.</p>}
          </div>
        </div>

        {/* Detail panel */}
        {selectedUnit && (
          <div className="w-2/3 rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <h2 className="text-lg font-semibold">{selectedUnit.name}</h2>
                {selectedUnit.code && <p className="text-xs text-muted-foreground font-mono">{selectedUnit.code}</p>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedUnit(null)}>✕</Button>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="p-4">
              <TabsList>
                <TabsTrigger value="dados" className="gap-1.5"><Building className="h-3.5 w-3.5" />Dados Cadastrais</TabsTrigger>
                <TabsTrigger value="contatos" className="gap-1.5"><Users className="h-3.5 w-3.5" />Contatos</TabsTrigger>
              </TabsList>

              <TabsContent value="dados" className="mt-4 space-y-3 text-sm">
                {selectedUnit.cnpj && <div><span className="text-muted-foreground">CNPJ:</span> {selectedUnit.cnpj}</div>}
                {selectedUnit.contact && <div><span className="text-muted-foreground">Contato:</span> {selectedUnit.contact}</div>}
                {selectedUnit.email && <div><span className="text-muted-foreground">E-mail:</span> {selectedUnit.email}</div>}
                {selectedUnit.phone && <div><span className="text-muted-foreground">Telefone:</span> {selectedUnit.phone}</div>}
                {selectedUnit.address && <div><span className="text-muted-foreground">Endereço:</span> {selectedUnit.address}</div>}
                {selectedUnit.city && <div><span className="text-muted-foreground">Cidade:</span> {selectedUnit.city}</div>}
                {Number(selectedUnit.tax_factor) > 0 && <div><span className="text-muted-foreground">Fator Imposto:</span> {Number(selectedUnit.tax_factor).toFixed(4)}</div>}
              </TabsContent>

              <TabsContent value="contatos" className="mt-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-medium">Contatos / Signatários</p>
                    <p className="text-xs text-muted-foreground">Contatos default para assinatura eletrônica (TAE)</p>
                  </div>
                  <div className="flex gap-2">
                    {unitContacts.length > 0 && (
                      <Button variant="outline" size="sm" onClick={() => { setCopyTargets([]); setCopyDialogOpen(true); }}>
                        <Copy className="mr-1.5 h-3.5 w-3.5" />Copiar para...
                      </Button>
                    )}
                    <Button size="sm" onClick={openNewContact}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" />Novo Contato
                    </Button>
                  </div>
                </div>

                {loadingContacts ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
                ) : unitContacts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Users className="h-10 w-10 text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">Nenhum contato cadastrado</p>
                    <p className="text-xs text-muted-foreground mt-1">Adicione contatos que serão carregados automaticamente ao enviar propostas para assinatura</p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={openNewContact}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" />Adicionar Contato
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {unitContacts.map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/30 transition-colors">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.email} {c.phone ? `• ${c.phone}` : ""}</p>
                          <div className="flex gap-2 mt-1">
                            {c.role && <span className="text-xs rounded bg-primary/10 text-primary px-1.5 py-0.5">{c.role}</span>}
                            {c.department && <span className="text-xs text-muted-foreground">{c.department}</span>}
                            {c.position && <span className="text-xs text-muted-foreground">• {c.position}</span>}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditContact(c)}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteContact(c.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}
