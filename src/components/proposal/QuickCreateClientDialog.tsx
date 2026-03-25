import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCreateClient, useUnits, useSalesTeam } from "@/hooks/useSupabaseData";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClientCreated: (clientId: string) => void;
  initialSearch?: string;
}

const emptyForm = {
  name: "", code: "", cnpj: "", contact: "", email: "", phone: "",
  address: "", unit_id: "", esn_id: "", gsn_id: "", state_registration: "", store_code: "",
};

export default function QuickCreateClientDialog({ open, onOpenChange, onClientCreated, initialSearch }: Props) {
  const { toast } = useToast();
  const createClient = useCreateClient();
  const { data: units = [] } = useUnits();
  const { data: salesTeam = [] } = useSalesTeam();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ ...emptyForm, name: initialSearch || "" });
  const [saving, setSaving] = useState(false);

  const esnMembers = salesTeam.filter((m) => m.role === "esn");
  const gsnMembers = salesTeam.filter((m) => m.role === "gsn");

  const handleSave = async () => {
    const missing: string[] = [];
    if (!form.name) missing.push("Razão Social");
    if (!form.code) missing.push("Código");
    if (!form.cnpj) missing.push("CNPJ");
    if (missing.length > 0) {
      toast({ title: "Campos obrigatórios", description: missing.join(", "), variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        unit_id: form.unit_id || null,
        esn_id: form.esn_id || null,
        gsn_id: form.gsn_id || null,
      };
      await new Promise<void>((resolve, reject) =>
        createClient.mutate(payload, {
          onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["clients"] });
            // Find the newly created client by code+cnpj
            const { data } = await (await import("@/integrations/supabase/client")).supabase
              .from("clients")
              .select("id")
              .eq("code", form.code)
              .eq("cnpj", form.cnpj)
              .order("created_at", { ascending: false })
              .limit(1);
            const newId = data?.[0]?.id;
            if (newId) onClientCreated(newId);
            resolve();
          },
          onError: (e: any) => reject(e),
        })
      );
      toast({ title: "Cliente criado com sucesso!" });
      setForm(emptyForm);
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) setForm(emptyForm);
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Cliente</DialogTitle>
          <DialogDescription>Preencha os dados do cliente para continuar com a proposta.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1 sm:col-span-2">
              <Label className="text-xs">Razão Social *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Código *</Label>
              <Input placeholder="Ex: CLI001" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">CNPJ *</Label>
              <Input value={form.cnpj} onChange={(e) => setForm((f) => ({ ...f, cnpj: e.target.value }))} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label className="text-xs">Contato Principal</Label>
              <Input value={form.contact} onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label className="text-xs">Telefone</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Inscrição Estadual</Label>
              <Input value={form.state_registration} onChange={(e) => setForm((f) => ({ ...f, state_registration: e.target.value }))} />
            </div>
          </div>

          <div className="grid gap-1">
            <Label className="text-xs">Endereço</Label>
            <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label className="text-xs">Cód. Loja</Label>
              <Input value={form.store_code} onChange={(e) => setForm((f) => ({ ...f, store_code: e.target.value }))} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Unidade</Label>
              <Select value={form.unit_id} onValueChange={(v) => setForm((f) => ({ ...f, unit_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label className="text-xs">ESN</Label>
              <Select value={form.esn_id} onValueChange={(v) => setForm((f) => ({ ...f, esn_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {esnMembers.map((m) => <SelectItem key={m.id} value={m.id}>{m.code} - {m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">GSN</Label>
              <Select value={form.gsn_id} onValueChange={(v) => setForm((f) => ({ ...f, gsn_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {gsnMembers.map((m) => <SelectItem key={m.id} value={m.id}>{m.code} - {m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button className="mt-2" onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar e Selecionar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
