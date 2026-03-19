import { useState, useEffect, useMemo } from "react";
import { Search, Plus, Building2, List, LayoutGrid, Edit2, ChevronLeft, Users, FileText, Trash2, Mail, Phone, UserCircle, Save, X, MapPin, Hash, MessageSquare, ArrowRightLeft } from "lucide-react";
import { useClients, useCreateClient, useUpdateClient, useUnits, useSalesTeam } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";

interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string | null;
  department: string | null;
  position: string | null;
  notes: string | null;
  isNew?: boolean;
}

export default function ClientsList() {
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  const { data: clients = [] } = useClients();
  const { data: units = [] } = useUnits();
  const { data: salesTeam = [] } = useSalesTeam();
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin, user } = useAuth();
  const { role } = useUserRole();

  // Detail/edit panel state
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("dados");

  // Contacts state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null);
  const [savingContacts, setSavingContacts] = useState(false);
  const [transferClient, setTransferClient] = useState<any>(null);
  const [transferEsnId, setTransferEsnId] = useState("");
  const [transferSearch, setTransferSearch] = useState("");
  const [transferring, setTransferring] = useState(false);

  const emptyForm = {
    name: "", code: "", cnpj: "", contact: "", email: "", phone: "",
    address: "", state_registration: "", store_code: "",
    unit_id: "", esn_id: "", gsn_id: "",
  };
  const [form, setForm] = useState(emptyForm);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) || null,
    [clients, selectedClientId]
  );

  // Find the ESN member linked to current user (by email)
  const userEsnMemberId = useMemo(() => {
    if (role === "admin" || role === "gsn" || role === "arquiteto") return null;
    if (!user?.email) return null;
    const member = salesTeam.find((m) => m.role === "esn" && m.email?.toLowerCase() === user.email?.toLowerCase());
    return member?.id || null;
  }, [role, user, salesTeam]);

  const filtered = useMemo(() => {
    let list = clients;
    // ESN (vendedor) only sees their assigned clients
    if (role === "vendedor" && userEsnMemberId) {
      list = list.filter((c) => c.esn_id === userEsnMemberId);
    }
    return list.filter(
      (c) => c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.toLowerCase().includes(search.toLowerCase()) ||
        c.cnpj.includes(search)
    );
  }, [clients, search, role, userEsnMemberId]);


  const esnMembers = useMemo(() => salesTeam.filter((m) => m.role === "esn"), [salesTeam]);
  const gsnMembers = useMemo(() => salesTeam.filter((m) => m.role === "gsn"), [salesTeam]);

  // Load contacts when selecting a client
  useEffect(() => {
    if (!selectedClientId || isCreating) {
      setContacts([]);
      return;
    }
    loadContacts(selectedClientId);
  }, [selectedClientId]);

  async function loadContacts(clientId: string) {
    setContactsLoading(true);
    const { data, error } = await supabase
      .from("client_contacts")
      .select("*")
      .eq("client_id", clientId)
      .order("name");
    if (!error && data) {
      setContacts(data.map((c: any) => ({
        id: c.id, name: c.name, email: c.email,
        phone: c.phone, role: c.role,
        department: c.department || "",
        position: c.position || "",
        notes: c.notes || "",
      })));
    }
    setContactsLoading(false);
  }

  // Populate form when selecting existing client
  useEffect(() => {
    if (selectedClient && !isCreating) {
      setForm({
        name: selectedClient.name || "",
        code: selectedClient.code || "",
        cnpj: selectedClient.cnpj || "",
        contact: selectedClient.contact || "",
        email: selectedClient.email || "",
        phone: selectedClient.phone || "",
        address: selectedClient.address || "",
        state_registration: selectedClient.state_registration || "",
        store_code: (selectedClient as any).store_code || "",
        unit_id: selectedClient.unit_id || "",
        esn_id: selectedClient.esn_id || "",
        gsn_id: selectedClient.gsn_id || "",
      });
    }
  }, [selectedClient, isCreating]);

  function openNew() {
    setSelectedClientId(null);
    setIsCreating(true);
    setForm(emptyForm);
    setActiveTab("dados");
  }

  function openClient(client: any) {
    setIsCreating(false);
    setSelectedClientId(client.id);
    setActiveTab("dados");
  }

  function closeDetail() {
    setSelectedClientId(null);
    setIsCreating(false);
  }

  async function handleSave() {
    const missing: string[] = [];
    if (!form.name) missing.push("Razão Social");
    if (!form.code) missing.push("Código");
    if (!form.cnpj) missing.push("CNPJ");
    if (missing.length > 0) {
      toast({ title: "Campos obrigatórios", description: missing.join(", "), variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      unit_id: form.unit_id || null,
      esn_id: form.esn_id || null,
      gsn_id: form.gsn_id || null,
    };
    try {
      if (isCreating) {
        await new Promise<void>((resolve, reject) =>
          createClient.mutate(payload, {
            onSuccess: () => resolve(),
            onError: (e: any) => reject(e),
          })
        );
        toast({ title: "Cliente criado com sucesso!" });
        closeDetail();
      } else if (selectedClientId) {
        await new Promise<void>((resolve, reject) =>
          updateClient.mutate({ id: selectedClientId, ...payload }, {
            onSuccess: () => resolve(),
            onError: (e: any) => reject(e),
          })
        );
        toast({ title: "Cliente atualizado!" });
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  // Contact CRUD
  function addContact() {
    setContacts((prev) => [
      ...prev,
      { id: `new-${Date.now()}`, name: "", email: "", phone: "", role: "Signatário", department: "", position: "", notes: "", isNew: true },
    ]);
    setTimeout(() => {
      const el = document.getElementById("contact-name-last");
      if (el) el.focus();
    }, 100);
  }

  function updateContact(id: string, field: keyof Contact, value: string) {
    setContacts((prev) => prev.map((c) => c.id === id ? { ...c, [field]: value } : c));
  }

  async function handleDeleteContact() {
    if (!deleteContactId) return;
    const contact = contacts.find((c) => c.id === deleteContactId);
    if (contact?.isNew) {
      setContacts((prev) => prev.filter((c) => c.id !== deleteContactId));
    } else {
      const { error } = await supabase.from("client_contacts").delete().eq("id", deleteContactId);
      if (error) {
        toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      } else {
        setContacts((prev) => prev.filter((c) => c.id !== deleteContactId));
        toast({ title: "Contato excluído" });
      }
    }
    setDeleteContactId(null);
  }

  async function handleSaveContacts() {
    if (!selectedClientId) return;
    const invalid = contacts.filter((c) => !c.name || !c.email);
    if (invalid.length > 0) {
      toast({ title: "Preencha nome e email de todos os contatos", variant: "destructive" });
      return;
    }
    setSavingContacts(true);
    try {
      // Upsert: insert new, update existing
      for (const contact of contacts) {
        if (contact.isNew) {
          const { error } = await supabase.from("client_contacts").insert({
            client_id: selectedClientId,
            name: contact.name,
            email: contact.email,
            phone: contact.phone || null,
            role: contact.role || null,
            department: contact.department || "",
            position: contact.position || "",
            notes: contact.notes || "",
          });
          if (error) throw error;
        } else {
          const { error } = await supabase.from("client_contacts").update({
            name: contact.name,
            email: contact.email,
            phone: contact.phone || null,
            role: contact.role || null,
            department: contact.department || "",
            position: contact.position || "",
            notes: contact.notes || "",
          }).eq("id", contact.id);
          if (error) throw error;
        }
      }
      toast({ title: "Contatos salvos!" });
      await loadContacts(selectedClientId);
    } catch (err: any) {
      toast({ title: "Erro ao salvar contatos", description: err.message, variant: "destructive" });
    } finally {
      setSavingContacts(false);
    }
  }

  const getUnitName = (c: any) => c.unit_info?.name || "—";
  const getEsnName = (c: any) => c.esn?.name || "—";

  async function handleTransferClient() {
    if (!transferClient || !transferEsnId) return;
    setTransferring(true);
    try {
      const { error } = await supabase.from("clients").update({ esn_id: transferEsnId }).eq("id", transferClient.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Cliente transferido com sucesso!" });
      setTransferClient(null);
      setTransferEsnId("");
      setTransferSearch("");
    } catch (err: any) {
      toast({ title: "Erro ao transferir", description: err.message, variant: "destructive" });
    } finally {
      setTransferring(false);
    }
  }

  const filteredEsnForTransfer = useMemo(() => {
    return esnMembers.filter((m) => {
      if (transferClient && m.id === transferClient.esn_id) return false;
      if (!transferSearch) return true;
      const s = transferSearch.toLowerCase();
      return m.name.toLowerCase().includes(s) || m.code.toLowerCase().includes(s) || (m.email?.toLowerCase().includes(s));
    });
  }, [esnMembers, transferSearch, transferClient]);

  const showDetail = selectedClientId || isCreating;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Clientes</h1>
          <p className="text-sm text-muted-foreground">{clients.length} clientes cadastrados</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden">
            <button onClick={() => setViewMode("card")} className={`p-2 transition-colors ${viewMode === "card" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button onClick={() => setViewMode("list")} className={`p-2 transition-colors ${viewMode === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
              <List className="h-4 w-4" />
            </button>
          </div>
          <Button onClick={openNew} size="sm">
            <Plus className="mr-1.5 h-4 w-4" />Novo Cliente
          </Button>
        </div>
      </div>

      {/* Search */}
      {!showDetail && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, código ou CNPJ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* DETAIL / EDIT VIEW */}
      {showDetail ? (
        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
          {/* Back button & title */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={closeDetail} className="shrink-0">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-foreground truncate">
                {isCreating ? "Novo Cliente" : form.name || "Cliente"}
              </h2>
              {!isCreating && selectedClient && (
                <p className="text-xs text-muted-foreground">{selectedClient.code} · {selectedClient.cnpj}</p>
              )}
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start">
              <TabsTrigger value="dados" className="gap-1.5">
                <FileText className="h-3.5 w-3.5" />Dados Cadastrais
              </TabsTrigger>
              {!isCreating && (
                <TabsTrigger value="contatos" className="gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Contatos
                  {contacts.length > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5 text-xs">
                      {contacts.length}
                    </Badge>
                  )}
                </TabsTrigger>
              )}
            </TabsList>

            {/* TAB: Dados Cadastrais */}
            <TabsContent value="dados" className="mt-4">
              <div className="rounded-lg border border-border bg-card">
                {/* Identificação */}
                <div className="p-5">
                  <h3 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
                    <Hash className="h-4 w-4 text-primary" />Identificação
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <FormField id="name" label="Razão Social *" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
                    <FormField id="code" label="Código *" value={form.code} onChange={(v) => setForm((f) => ({ ...f, code: v }))} />
                    <FormField id="cnpj" label="CNPJ *" value={form.cnpj} onChange={(v) => setForm((f) => ({ ...f, cnpj: v }))} />
                    <FormField id="state_registration" label="Inscrição Estadual" value={form.state_registration} onChange={(v) => setForm((f) => ({ ...f, state_registration: v }))} />
                    <FormField id="store_code" label="Loja" value={form.store_code} onChange={(v) => setForm((f) => ({ ...f, store_code: v }))} />
                  </div>
                </div>

                <Separator />

                {/* Contato principal */}
                <div className="p-5">
                  <h3 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
                    <UserCircle className="h-4 w-4 text-primary" />Contato Principal
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <FormField id="contact" label="Nome do Contato" value={form.contact} onChange={(v) => setForm((f) => ({ ...f, contact: v }))} />
                    <FormField id="email" label="E-mail" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} type="email" />
                    <FormField id="phone" label="Telefone" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
                  </div>
                </div>

                <Separator />

                {/* Endereço */}
                <div className="p-5">
                  <h3 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />Endereço
                  </h3>
                  <div className="grid gap-4">
                    <FormField id="address" label="Endereço Completo" value={form.address} onChange={(v) => setForm((f) => ({ ...f, address: v }))} />
                  </div>
                </div>

                <Separator />

                {/* Vínculos */}
                <div className="p-5">
                  <h3 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />Vínculos
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Unidade</Label>
                      <Select value={form.unit_id} onValueChange={(v) => setForm((f) => ({ ...f, unit_id: v }))}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Executivo (ESN)</Label>
                      <Select value={form.esn_id} onValueChange={(v) => setForm((f) => ({ ...f, esn_id: v }))}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {esnMembers.map((m) => <SelectItem key={m.id} value={m.id}>{m.code} - {m.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Gerente (GSN)</Label>
                      <Select value={form.gsn_id} onValueChange={(v) => setForm((f) => ({ ...f, gsn_id: v }))}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {gsnMembers.map((m) => <SelectItem key={m.id} value={m.id}>{m.code} - {m.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
                  <Button variant="outline" onClick={closeDetail} size="sm">
                    <X className="mr-1.5 h-3.5 w-3.5" />Cancelar
                  </Button>
                  <Button onClick={handleSave} disabled={saving} size="sm">
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                    {saving ? "Salvando..." : isCreating ? "Criar Cliente" : "Salvar"}
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* TAB: Contatos (Signatários) */}
            {!isCreating && (
              <TabsContent value="contatos" className="mt-4">
                <div className="rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between p-4 border-b border-border">
                    <div>
                      <h3 className="text-sm font-medium text-foreground">Contatos / Signatários</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Contatos utilizados para envio de propostas para assinatura eletrônica (TAE)
                      </p>
                    </div>
                    <Button onClick={addContact} size="sm" variant="outline">
                      <Plus className="mr-1.5 h-3.5 w-3.5" />Novo Contato
                    </Button>
                  </div>

                  {contactsLoading ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">Carregando contatos...</div>
                  ) : contacts.length === 0 ? (
                    <div className="p-8 text-center">
                      <Users className="mx-auto h-10 w-10 text-muted-foreground/40" />
                      <p className="mt-2 text-sm text-muted-foreground">Nenhum contato cadastrado</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Adicione contatos que serão usados como signatários nas propostas
                      </p>
                      <Button onClick={addContact} size="sm" variant="outline" className="mt-4">
                        <Plus className="mr-1.5 h-3.5 w-3.5" />Adicionar Contato
                      </Button>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {contacts.map((contact, idx) => (
                        <div key={contact.id} className="p-4 hover:bg-muted/30 transition-colors">
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Nome *</Label>
                              <Input
                                id={idx === contacts.length - 1 ? "contact-name-last" : undefined}
                                value={contact.name}
                                onChange={(e) => updateContact(contact.id, "name", e.target.value)}
                                placeholder="Nome do contato"
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Email *</Label>
                              <Input
                                value={contact.email}
                                onChange={(e) => updateContact(contact.id, "email", e.target.value)}
                                placeholder="email@empresa.com"
                                type="email"
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Telefone</Label>
                              <Input
                                value={contact.phone || ""}
                                onChange={(e) => updateContact(contact.id, "phone", e.target.value)}
                                placeholder="(00) 00000-0000"
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Departamento</Label>
                              <Input
                                value={contact.department || ""}
                                onChange={(e) => updateContact(contact.id, "department", e.target.value)}
                                placeholder="Ex: TI, Comercial"
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Cargo</Label>
                              <Input
                                value={contact.position || ""}
                                onChange={(e) => updateContact(contact.id, "position", e.target.value)}
                                placeholder="Ex: Diretor, Gerente"
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="flex items-end gap-1">
                              <Select value={contact.role || ""} onValueChange={(v) => updateContact(contact.id, "role", v)}>
                                <SelectTrigger className="h-8 text-sm flex-1"><SelectValue placeholder="Papel" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Signatário">Signatário</SelectItem>
                                  <SelectItem value="Testemunha">Testemunha</SelectItem>
                                  <SelectItem value="Aprovador">Aprovador</SelectItem>
                                  <SelectItem value="Observador">Observador</SelectItem>
                                </SelectContent>
                              </Select>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`h-8 w-8 shrink-0 ${contact.notes ? "text-primary" : "text-muted-foreground"}`}
                                    title="Comentário"
                                  >
                                    <MessageSquare className="h-3.5 w-3.5" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-72" align="end">
                                  <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground">Comentário</Label>
                                    <Textarea
                                      value={contact.notes || ""}
                                      onChange={(e) => updateContact(contact.id, "notes", e.target.value)}
                                      placeholder="Observações sobre este contato..."
                                      className="min-h-[80px] text-sm"
                                    />
                                  </div>
                                </PopoverContent>
                              </Popover>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setDeleteContactId(contact.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          {contact.isNew && (
                            <Badge variant="secondary" className="mt-2 text-xs">Novo</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {contacts.length > 0 && (
                    <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
                      <Button
                        onClick={handleSaveContacts}
                        disabled={savingContacts}
                        size="sm"
                      >
                        <Save className="mr-1.5 h-3.5 w-3.5" />
                        {savingContacts ? "Salvando..." : "Salvar Contatos"}
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>
      ) : (
        <>
          {/* LIST VIEWS */}
          {viewMode === "card" && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((client) => (
                <div
                  key={client.id}
                  className="group cursor-pointer rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 min-w-0 flex-1" onClick={() => openClient(client)}>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{client.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{client.code} · {client.cnpj}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
                      title="Transferir ESN"
                      onClick={(e) => { e.stopPropagation(); setTransferClient(client); setTransferEsnId(""); setTransferSearch(""); }}
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="mt-3 space-y-1.5" onClick={() => openClient(client)}>
                    {client.email && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3 shrink-0" /><span className="truncate">{client.email}</span>
                      </div>
                    )}
                    {client.phone && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3 shrink-0" /><span className="truncate">{client.phone}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-3 w-3 shrink-0" /><span className="truncate">{getUnitName(client)}</span>
                      </div>
                      {client.esn && (
                        <span className="text-xs text-muted-foreground truncate ml-2">ESN: {client.esn.code}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="col-span-full py-12 text-center text-sm text-muted-foreground">
                  Nenhum cliente encontrado.
                </div>
              )}
            </div>
          )}

          {viewMode === "list" && (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="hidden border-b border-border bg-muted/50 px-4 py-2.5 md:grid md:grid-cols-6 md:gap-4">
                <span className="text-xs font-medium text-muted-foreground col-span-2">Cliente</span>
                <span className="text-xs font-medium text-muted-foreground">Unidade</span>
                <span className="text-xs font-medium text-muted-foreground">ESN</span>
                <span className="text-xs font-medium text-muted-foreground">Email</span>
                <span className="text-xs font-medium text-muted-foreground">Telefone</span>
              </div>
              <div className="divide-y divide-border">
                {filtered.map((client) => (
                  <div
                    key={client.id}
                    onClick={() => openClient(client)}
                    className="cursor-pointer flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-accent/50 md:grid md:grid-cols-6 md:items-center md:gap-4"
                  >
                    <div className="col-span-2 flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Building2 className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{client.name}</p>
                        <p className="text-xs text-muted-foreground">{client.code} · {client.cnpj}</p>
                      </div>
                    </div>
                    <p className="text-sm text-foreground truncate">{getUnitName(client)}</p>
                    <p className="text-sm text-foreground truncate">{getEsnName(client)}</p>
                    <p className="text-sm text-muted-foreground truncate">{client.email || "—"}</p>
                    <p className="text-sm text-muted-foreground truncate">{client.phone || "—"}</p>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div className="px-4 py-12 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Delete contact confirmation */}
      <AlertDialog open={!!deleteContactId} onOpenChange={(open) => !open && setDeleteContactId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contato?</AlertDialogTitle>
            <AlertDialogDescription>
              Este contato será removido permanentemente. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteContact} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Reusable form field component
function FormField({ id, label, value, onChange, type = "text" }: {
  id: string; label: string; value: string;
  onChange: (v: string) => void; type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label.replace(" *", "")}
        className="h-9"
      />
    </div>
  );
}
