import { useState, useMemo, useEffect } from "react";
import { Building, Plus, Edit2, Users, Copy, Trash2, PenTool, Headphones, Mail, Phone, Briefcase, FileText, Save, Info, ChevronDown } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useUnitEmailTemplates, EMAIL_ACTION_TYPES, EMAIL_PLACEHOLDERS } from "@/hooks/useUnitEmailTemplates";

const emptyForm = { name: "", code: "", cnpj: "", contact: "", email: "", phone: "", address: "", city: "", tax_factor: 0 };
const emptyContact = { name: "", email: "", phone: "", role: "Signatário", department: "", position: "", notes: "", contact_type: "tae" };
const ROLES = ["Signatário", "Testemunha", "Aprovador", "Observador"];
const CONTACT_TYPES = [
  { value: "tae", label: "TAE (Assinatura)", icon: PenTool, description: "Apresentado no processo de assinatura eletrônica", color: "text-primary" },
  { value: "operacoes", label: "Operações", icon: Headphones, description: "Recebe comunicações de propostas ganhas", color: "text-amber-600 dark:text-amber-400" },
];

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

  const [selectedUnit, setSelectedUnit] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("dados");

  const [contactForm, setContactForm] = useState(emptyContact);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [savingContact, setSavingContact] = useState(false);

  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copyTargets, setCopyTargets] = useState<string[]>([]);
  const [copying, setCopying] = useState(false);

  const { data: unitContacts = [], isLoading: loadingContacts } = useUnitContacts(selectedUnit?.id || null);

  // Group contacts by type
  const taeContacts = useMemo(() => unitContacts.filter((c: any) => (c.contact_type || "tae") === "tae"), [unitContacts]);
  const opsContacts = useMemo(() => unitContacts.filter((c: any) => c.contact_type === "operacoes"), [unitContacts]);

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

  const openNewContact = (type: string = "tae") => {
    setEditingContactId(null);
    setContactForm({ ...emptyContact, contact_type: type });
    setContactDialogOpen(true);
  };

  const openEditContact = (c: any) => {
    setEditingContactId(c.id);
    setContactForm({
      name: c.name, email: c.email, phone: c.phone || "",
      role: c.role || "Signatário", department: c.department || "",
      position: c.position || "", notes: c.notes || "",
      contact_type: c.contact_type || "tae",
    });
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
        const { error } = await supabase.from("unit_contacts").update(contactForm as any).eq("id", editingContactId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("unit_contacts").insert({ ...contactForm, unit_id: selectedUnit.id } as any);
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
          contact_type: c.contact_type || "tae",
        }))
      );
      const { error } = await supabase.from("unit_contacts").insert(rows as any);
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

      {/* Contact form dialog - redesigned */}
      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingContactId ? "Editar Contato" : "Novo Contato"}</DialogTitle>
            <DialogDescription>Defina o tipo e os dados do contato.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Contact type selector */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Tipo de Contato *</Label>
              <div className="grid grid-cols-2 gap-2">
                {CONTACT_TYPES.map((ct) => {
                  const Icon = ct.icon;
                  const isSelected = contactForm.contact_type === ct.value;
                  return (
                    <button
                      key={ct.value}
                      type="button"
                      onClick={() => setContactForm((p) => ({ ...p, contact_type: ct.value }))}
                      className={`flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 transition-all text-center
                        ${isSelected
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-primary/30 hover:bg-muted/30"
                        }`}
                    >
                      <Icon className={`h-5 w-5 ${isSelected ? ct.color : "text-muted-foreground"}`} />
                      <span className={`text-xs font-medium ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>
                        {ct.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {CONTACT_TYPES.find(ct => ct.value === contactForm.contact_type)?.description}
              </p>
            </div>

            <Separator />

            <div className="grid gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label className="text-xs">Nome *</Label>
                  <Input value={contactForm.name} onChange={(e) => setContactForm((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">E-mail *</Label>
                  <Input type="email" value={contactForm.email} onChange={(e) => setContactForm((p) => ({ ...p, email: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label className="text-xs">Departamento</Label>
                  <Input value={contactForm.department} onChange={(e) => setContactForm((p) => ({ ...p, department: e.target.value }))} />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Cargo</Label>
                  <Input value={contactForm.position} onChange={(e) => setContactForm((p) => ({ ...p, position: e.target.value }))} />
                </div>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Notas</Label>
                <Input value={contactForm.notes} onChange={(e) => setContactForm((p) => ({ ...p, notes: e.target.value }))} />
              </div>
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
                className={`rounded-lg border bg-card p-4 transition-colors cursor-pointer overflow-hidden ${selectedUnit?.id === unit.id ? "border-primary ring-1 ring-primary/20" : "border-border hover:border-primary/30"}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Building className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{unit.name}</p>
                      {unit.code && <p className="text-xs text-muted-foreground font-mono truncate">{unit.code}</p>}
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); openEdit(unit); }} className="rounded p-1 text-muted-foreground hover:text-foreground shrink-0">
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {!selectedUnit && (
                  <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                    {unit.city && <p className="truncate">📍 {unit.city}</p>}
                    {unit.email && <p className="truncate">📧 {unit.email}</p>}
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
          <div className="w-2/3 rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between border-b p-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold truncate">{selectedUnit.name}</h2>
                {selectedUnit.code && <p className="text-xs text-muted-foreground font-mono">{selectedUnit.code}</p>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedUnit(null)}>✕</Button>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="p-4">
              <TabsList>
                <TabsTrigger value="dados" className="gap-1.5"><Building className="h-3.5 w-3.5" />Dados Cadastrais</TabsTrigger>
                <TabsTrigger value="contatos" className="gap-1.5"><Users className="h-3.5 w-3.5" />Contatos</TabsTrigger>
                <TabsTrigger value="emails" className="gap-1.5"><Mail className="h-3.5 w-3.5" />E-mails Padrão</TabsTrigger>
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

              <TabsContent value="contatos" className="mt-4 space-y-5">
                {/* Header actions */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Contatos da Unidade</p>
                    <p className="text-xs text-muted-foreground">{unitContacts.length} contato(s) cadastrado(s)</p>
                  </div>
                  <div className="flex gap-2 shrink-0 flex-wrap">
                    {unitContacts.length > 0 && (
                      <Button variant="outline" size="sm" onClick={() => { setCopyTargets([]); setCopyDialogOpen(true); }}>
                        <Copy className="mr-1.5 h-3.5 w-3.5" />Copiar para...
                      </Button>
                    )}
                    <Button size="sm" onClick={() => openNewContact("tae")}>
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
                    <p className="text-xs text-muted-foreground mt-1">Adicione contatos que serão utilizados em assinaturas e comunicações</p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={() => openNewContact("tae")}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" />Adicionar Contato
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* TAE Section */}
                    <ContactSection
                      title="Assinatura Eletrônica (TAE)"
                      description="Contatos apresentados no processo de assinatura de propostas"
                      icon={PenTool}
                      iconColor="text-primary"
                      badgeColor="bg-primary/10 text-primary"
                      contacts={taeContacts}
                      onAdd={() => openNewContact("tae")}
                      onEdit={openEditContact}
                      onDelete={handleDeleteContact}
                    />

                    {/* Operações Section */}
                    <ContactSection
                      title="Operações"
                      description="Contatos que recebem comunicações de propostas ganhas"
                      icon={Headphones}
                      iconColor="text-amber-600 dark:text-amber-400"
                      badgeColor="bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      contacts={opsContacts}
                      onAdd={() => openNewContact("operacoes")}
                      onEdit={openEditContact}
                      onDelete={handleDeleteContact}
                    />
                  </div>
                )}
              </TabsContent>

              <TabsContent value="emails" className="mt-4">
                <UnitEmailTemplatesTab unitId={selectedUnit.id} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Contact Section sub-component ───────────────────────────────
function ContactSection({
  title, description, icon: Icon, iconColor, badgeColor, contacts, onAdd, onEdit, onDelete,
}: {
  title: string;
  description: string;
  icon: any;
  iconColor: string;
  badgeColor: string;
  contacts: any[];
  onAdd: () => void;
  onEdit: (c: any) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Section header */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background shadow-sm border border-border`}>
            <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{title}</p>
            <p className="text-[11px] text-muted-foreground truncate">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary" className="text-[10px] px-1.5">{contacts.length}</Badge>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onAdd}>
            <Plus className="h-3 w-3 mr-1" />Adicionar
          </Button>
        </div>
      </div>

      {/* Contact cards */}
      {contacts.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <p className="text-xs text-muted-foreground">Nenhum contato nesta categoria</p>
          <Button variant="link" size="sm" className="text-xs mt-1 h-auto p-0" onClick={onAdd}>
            Adicionar contato
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {contacts.map((c: any) => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors group">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  {c.role && (
                    <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${badgeColor}`}>
                      {c.role}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 truncate">
                    <Mail className="h-3 w-3 shrink-0" />{c.email}
                  </span>
                  {c.phone && (
                    <span className="flex items-center gap-1 shrink-0">
                      <Phone className="h-3 w-3" />{c.phone}
                    </span>
                  )}
                  {c.position && (
                    <span className="flex items-center gap-1 shrink-0 hidden sm:flex">
                      <Briefcase className="h-3 w-3" />{c.position}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(c)}>
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(c.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Unit Email Templates Tab ───────────────────────────────
function UnitEmailTemplatesTab({ unitId }: { unitId: string }) {
  const { data: templates = [], isLoading } = useUnitEmailTemplates(unitId);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [localTemplates, setLocalTemplates] = useState<Record<string, { subject: string; body: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const map: Record<string, { subject: string; body: string }> = {};
    for (const t of templates) {
      map[t.action_type] = { subject: t.subject, body: t.body };
    }
    setLocalTemplates(map);
  }, [templates]);

  const getValue = (actionType: string, field: "subject" | "body") => {
    return localTemplates[actionType]?.[field] ?? "";
  };

  const setValue = (actionType: string, field: "subject" | "body", value: string) => {
    setLocalTemplates(prev => ({
      ...prev,
      [actionType]: { ...(prev[actionType] || { subject: "", body: "" }), [field]: value },
    }));
  };

  const handleSave = async (actionType: string) => {
    setSaving(actionType);
    try {
      const existing = templates.find(t => t.action_type === actionType);
      const payload = {
        unit_id: unitId,
        action_type: actionType,
        subject: localTemplates[actionType]?.subject || "",
        body: localTemplates[actionType]?.body || "",
        updated_at: new Date().toISOString(),
      };
      if (existing) {
        const { error } = await supabase.from("unit_email_templates" as any).update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("unit_email_templates" as any).insert(payload);
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ["unit_email_templates", unitId] });
      toast({ title: "Template salvo!" });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const insertPlaceholder = (actionType: string, field: "subject" | "body", tag: string) => {
    setValue(actionType, field, getValue(actionType, field) + tag);
  };

  if (isLoading) return <p className="text-sm text-muted-foreground py-4">Carregando...</p>;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Placeholders disponíveis</p>
            <div className="flex flex-wrap gap-1.5">
              {EMAIL_PLACEHOLDERS.map(p => (
                <Tooltip key={p.tag}>
                  <TooltipTrigger asChild>
                    <code className="text-[10px] bg-background border rounded px-1.5 py-0.5 font-mono cursor-help">
                      {p.tag}
                    </code>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    <p className="font-medium">{p.label}</p>
                    {"example" in p && <p className="text-muted-foreground">Ex: {(p as any).example}</p>}
                    {"description" in p && (p as any).description && <p className="text-muted-foreground">{(p as any).description}</p>}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
        </div>

        {EMAIL_ACTION_TYPES.map(action => (
          <div key={action.value} className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border">
              <div className="min-w-0">
                <p className="text-sm font-medium">{action.label}</p>
                <p className="text-[11px] text-muted-foreground">{action.description}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-xs shrink-0"
                disabled={saving === action.value}
                onClick={() => handleSave(action.value)}
              >
                <Save className="h-3 w-3 mr-1" />
                {saving === action.value ? "Salvando..." : "Salvar"}
              </Button>
            </div>
            <div className="p-4 space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Assunto</Label>
                  <div className="flex gap-0.5">
                    {EMAIL_PLACEHOLDERS.filter(p => p.tag !== "{{RESUMO_OPORTUNIDADE}}").map(p => (
                      <Tooltip key={p.tag}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => insertPlaceholder(action.value, "subject", p.tag)}
                            className="text-[9px] bg-muted hover:bg-accent border rounded px-1 py-0.5 font-mono transition-colors"
                          >
                            +{p.label.substring(0, 3)}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">Inserir {p.tag}</TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </div>
                <Input
                  value={getValue(action.value, "subject")}
                  onChange={(e) => setValue(action.value, "subject", e.target.value)}
                  placeholder={`Ex: [OPP {{NUMERO_OPORTUNIDADE}}] ${action.label}`}
                  className="text-sm font-mono"
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Texto do E-mail</Label>
                  <div className="flex gap-0.5 flex-wrap justify-end">
                    {EMAIL_PLACEHOLDERS.map(p => (
                      <Tooltip key={p.tag}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => insertPlaceholder(action.value, "body", p.tag)}
                            className="text-[9px] bg-muted hover:bg-accent border rounded px-1 py-0.5 font-mono transition-colors"
                          >
                            +{p.label.substring(0, 3)}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">Inserir {p.tag}</TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </div>
                <Textarea
                  value={getValue(action.value, "body")}
                  onChange={(e) => setValue(action.value, "body", e.target.value)}
                  placeholder="Texto padrão do e-mail. Use placeholders como {{NUMERO_OPORTUNIDADE}}, {{CLIENTE}} etc."
                  rows={4}
                  className="text-sm font-mono"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}
