import { useState } from "react";
import { Search, Plus, Building2 } from "lucide-react";
import { useClients, useCreateClient } from "@/hooks/useSupabaseData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function ClientsList() {
  const [search, setSearch] = useState("");
  const { data: clients = [] } = useClients();
  const createClient = useCreateClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const [form, setForm] = useState({ name: "", code: "", cnpj: "", contact: "", email: "", phone: "", address: "" });

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code.includes(search) ||
      c.cnpj.includes(search)
  );

  const handleSave = async () => {
    if (!form.name || !form.code || !form.cnpj) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    try {
      await createClient.mutateAsync(form);
      toast({ title: "Cliente criado com sucesso!" });
      setDialogOpen(false);
      setForm({ name: "", code: "", cnpj: "", contact: "", email: "", phone: "", address: "" });
    } catch (err: any) {
      toast({ title: "Erro ao criar cliente", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Clientes</h1>
          <p className="text-sm text-muted-foreground">{clients.length} clientes cadastrados</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Novo Cliente</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>Novo Cliente</DialogTitle></DialogHeader>
            <div className="grid gap-3 py-2">
              {[
                { id: "name", label: "Razão Social *" },
                { id: "code", label: "Código *" },
                { id: "cnpj", label: "CNPJ *" },
                { id: "contact", label: "Contato" },
                { id: "email", label: "E-mail" },
                { id: "phone", label: "Telefone" },
                { id: "address", label: "Endereço" },
              ].map((field) => (
                <div key={field.id} className="grid gap-1">
                  <Label htmlFor={field.id} className="text-xs">{field.label}</Label>
                  <Input
                    id={field.id}
                    placeholder={field.label.replace(" *", "")}
                    value={(form as any)[field.id]}
                    onChange={(e) => setForm((f) => ({ ...f, [field.id]: e.target.value }))}
                  />
                </div>
              ))}
              <Button className="mt-2" onClick={handleSave} disabled={createClient.isPending}>
                {createClient.isPending ? "Salvando..." : "Salvar Cliente"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar por nome, código ou CNPJ..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((client) => (
          <div key={client.id} className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/30">
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
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
