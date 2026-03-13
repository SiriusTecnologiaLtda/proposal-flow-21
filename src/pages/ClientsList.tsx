import { useState } from "react";
import { Search, Plus, Building2, List, LayoutGrid, Edit2 } from "lucide-react";
import { useClients, useCreateClient, useUpdateClient, useUnits, useSalesTeam } from "@/hooks/useSupabaseData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

export default function ClientsList() {
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  const { data: clients = [] } = useClients();
  const { data: units = [] } = useUnits();
  const { data: salesTeam = [] } = useSalesTeam();
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { toast } = useToast();

  const emptyForm = {
    name: "",
    code: "",
    cnpj: "",
    contact: "",
    email: "",
    phone: "",
    address: "",
    state_registration: "",
    unit_id: "",
    esn_id: "",
    gsn_id: "",
  };
  const [form, setForm] = useState(emptyForm);

  const filtered = clients.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.code.includes(search) || c.cnpj.includes(search)
  );

  const esnMembers = salesTeam.filter((m) => m.role === "esn");
  const gsnMembers = salesTeam.filter((m) => m.role === "gsn");

  const openNewDialog = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEditDialog = (client: any) => {
    setEditingId(client.id);
    setForm({
      name: client.name || "",
      code: client.code || "",
      cnpj: client.cnpj || "",
      contact: client.contact || "",
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
      state_registration: client.state_registration || "",
      unit_id: client.unit_id || "",
      esn_id: client.esn_id || "",
      gsn_id: client.gsn_id || "",
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name || !form.code || !form.cnpj) {
      toast({ title: "Preencha campos obrigatórios", variant: "destructive" });
      return;
    }

    setSaving(true);
    const payload = {
      ...form,
      unit_id: form.unit_id || null,
      esn_id: form.esn_id || null,
      gsn_id: form.gsn_id || null,
    };

    const done = () => setSaving(false);

    if (editingId) {
      updateClient.mutate(
        { id: editingId, ...payload },
        {
          onSuccess: () => {
            toast({ title: "Cliente atualizado!" });
            setDialogOpen(false);
            setForm(emptyForm);
            setEditingId(null);
            done();
          },
          onError: (err: any) => {
            toast({ title: "Erro", description: err.message, variant: "destructive" });
            done();
          },
        }
      );
      return;
    }

    createClient.mutate(payload, {
      onSuccess: () => {
        toast({ title: "Cliente criado!" });
        setDialogOpen(false);
        setForm(emptyForm);
        done();
      },
      onError: (err: any) => {
        toast({ title: "Erro", description: err.message, variant: "destructive" });
        done();
      },
    });
  };

  const getUnitName = (c: any) => c.unit_info?.name || "—";
  const getEsnName = (c: any) => c.esn?.name || "—";
  const getGsnName = (c: any) => c.gsn?.name || "—";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Clientes</h1>
          <p className="text-sm text-muted-foreground">{clients.length} clientes cadastrados</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border">
            <button onClick={() => setViewMode("card")} className={`p-1.5 ${viewMode === "card" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button onClick={() => setViewMode("list")} className={`p-1.5 ${viewMode === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
              <List className="h-4 w-4" />
            </button>
          </div>
          <Button onClick={openNewDialog}>
            <Plus className="mr-2 h-4 w-4" />Novo Cliente
          </Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Atualize os dados do cliente." : "Preencha os dados do novo cliente."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {[
              { id: "name", label: "Razão Social *" },
              { id: "code", label: "Código *" },
              { id: "cnpj", label: "CNPJ *" },
              { id: "contact", label: "Contato" },
              { id: "email", label: "E-mail" },
              { id: "phone", label: "Telefone" },
              { id: "address", label: "Endereço" },
              { id: "state_registration", label: "Inscrição Estadual" },
            ].map((field) => (
              <div key={field.id} className="grid gap-1">
                <Label htmlFor={field.id} className="text-xs">{field.label}</Label>
                <Input id={field.id} placeholder={field.label.replace(" *", "")} value={(form as any)[field.id]} onChange={(e) => setForm((f) => ({ ...f, [field.id]: e.target.value }))} />
              </div>
            ))}

            <div className="grid gap-1">
              <Label className="text-xs">Unidade</Label>
              <Select value={form.unit_id} onValueChange={(v) => setForm((f) => ({ ...f, unit_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                <SelectContent>
                  {units.map((u) => (<SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1">
              <Label className="text-xs">Executivo de Vendas (ESN)</Label>
              <Select value={form.esn_id} onValueChange={(v) => setForm((f) => ({ ...f, esn_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o ESN" /></SelectTrigger>
                <SelectContent>
                  {esnMembers.map((m) => (<SelectItem key={m.id} value={m.id}>{m.code} - {m.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1">
              <Label className="text-xs">Gerente de Vendas (GSN)</Label>
              <Select value={form.gsn_id} onValueChange={(v) => setForm((f) => ({ ...f, gsn_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o GSN" /></SelectTrigger>
                <SelectContent>
                  {gsnMembers.map((m) => (<SelectItem key={m.id} value={m.id}>{m.code} - {m.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>

            <Button className="mt-2" onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Salvar Cliente"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar por nome, código ou CNPJ..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {viewMode === "card" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((client) => (
            <div
              key={client.id}
              onClick={() => openEditDialog(client)}
              className="cursor-pointer rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/30"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Building2 className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{client.name}</p>
                  <p className="text-xs text-muted-foreground">{client.code} · {client.cnpj}</p>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {client.email && <p>📧 {client.email}</p>}
                {client.phone && <p>📞 {client.phone}</p>}
                {client.contact && <p>👤 {client.contact}</p>}
                <p>🏢 {getUnitName(client)}</p>
                <p>📊 ESN: {getEsnName(client)} · GSN: {getGsnName(client)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewMode === "list" && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="hidden border-b border-border bg-muted/50 px-4 py-2.5 md:grid md:grid-cols-6 md:gap-4">
            <span className="text-xs font-medium text-muted-foreground col-span-2">Cliente</span>
            <span className="text-xs font-medium text-muted-foreground">Unidade</span>
            <span className="text-xs font-medium text-muted-foreground">ESN</span>
            <span className="text-xs font-medium text-muted-foreground">GSN</span>
            <span className="text-xs font-medium text-muted-foreground">Contato</span>
          </div>
          <div className="divide-y divide-border">
            {filtered.map((client) => (
              <div
                key={client.id}
                onClick={() => openEditDialog(client)}
                className="cursor-pointer flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-accent/50 md:grid md:grid-cols-6 md:items-center md:gap-4"
              >
                <div className="col-span-2 flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Building2 className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{client.name}</p>
                    <p className="text-xs text-muted-foreground">{client.code} · {client.cnpj}</p>
                  </div>
                </div>
                <p className="text-sm text-foreground truncate">{getUnitName(client)}</p>
                <p className="text-sm text-foreground truncate">{getEsnName(client)}</p>
                <p className="text-sm text-foreground truncate">{getGsnName(client)}</p>
                <p className="text-sm text-muted-foreground truncate">{client.email || "—"}</p>
              </div>
            ))}
            {filtered.length === 0 && <div className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
