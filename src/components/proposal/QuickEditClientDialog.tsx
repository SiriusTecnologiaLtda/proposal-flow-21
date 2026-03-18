import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUpdateClient, useUnits, useSalesTeam } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  client: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export default function QuickEditClientDialog({ client, open, onOpenChange, onSaved }: Props) {
  const { data: units = [] } = useUnits();
  const { data: salesTeam = [] } = useSalesTeam();
  const updateClient = useUpdateClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "", code: "", cnpj: "", contact: "", email: "", phone: "",
    address: "", state_registration: "", unit_id: "", esn_id: "", gsn_id: "",
  });

  useEffect(() => {
    if (client && open) {
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
    }
  }, [client, open]);

  const esnMembers = salesTeam.filter((m) => m.role === "esn");
  const gsnMembers = salesTeam.filter((m) => m.role === "gsn");

  const handleSave = async () => {
    const missing: string[] = [];
    if (!form.name) missing.push("Razão Social");
    if (!form.code) missing.push("Código");
    if (!form.cnpj) missing.push("CNPJ");

    if (missing.length > 0) {
      toast({ title: "Campos obrigatórios não preenchidos", description: missing.join(", "), variant: "destructive" });
      setTimeout(() => {
        const el = document.getElementById(missing[0] === "Razão Social" ? "qe-name" : missing[0] === "Código" ? "qe-code" : "qe-cnpj");
        if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus(); }
      }, 100);
      return;
    }

    setSaving(true);

    // Build changes diff for log
    const changes: Record<string, { from: any; to: any }> = {};
    const fields = Object.keys(form) as (keyof typeof form)[];
    for (const key of fields) {
      const oldVal = client[key] || "";
      const newVal = form[key] || "";
      if (oldVal !== newVal) {
        changes[key] = { from: oldVal, to: newVal };
      }
    }

    const payload = {
      id: client.id,
      ...form,
      unit_id: form.unit_id || null,
      esn_id: form.esn_id || null,
      gsn_id: form.gsn_id || null,
    };

    updateClient.mutate(payload, {
      onSuccess: async () => {
        // Log the edit
        if (Object.keys(changes).length > 0) {
          await supabase.from("client_edit_logs").insert({
            client_id: client.id,
            user_id: user?.id || "",
            changes,
            context: "proposal_create",
          });
        }

        toast({ title: "Cliente atualizado!" });
        onOpenChange(false);
        onSaved?.();
        setSaving(false);
      },
      onError: (err: any) => {
        toast({ title: "Erro", description: err.message, variant: "destructive" });
        setSaving(false);
      },
    });
  };

  const inputFields = [
    { id: "name", label: "Razão Social *" },
    { id: "code", label: "Código *" },
    { id: "cnpj", label: "CNPJ *" },
    { id: "contact", label: "Contato" },
    { id: "email", label: "E-mail" },
    { id: "phone", label: "Telefone" },
    { id: "address", label: "Endereço" },
    { id: "state_registration", label: "Inscrição Estadual" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edição Rápida de Cliente</DialogTitle>
          <DialogDescription>Ajuste os dados do cliente. As alterações serão registradas.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          {inputFields.map((field) => (
            <div key={field.id} className="grid gap-1">
              <Label htmlFor={`qe-${field.id}`} className="text-xs">{field.label}</Label>
              <Input
                id={`qe-${field.id}`}
                placeholder={field.label.replace(" *", "")}
                value={(form as any)[field.id]}
                onChange={(e) => setForm((f) => ({ ...f, [field.id]: e.target.value }))}
              />
            </div>
          ))}

          <div className="grid gap-1">
            <Label className="text-xs">Unidade</Label>
            <Select value={form.unit_id} onValueChange={(v) => setForm((f) => ({ ...f, unit_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
              <SelectContent>
                {units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1">
            <Label className="text-xs">Executivo de Vendas (ESN)</Label>
            <Select value={form.esn_id} onValueChange={(v) => setForm((f) => ({ ...f, esn_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecione o ESN" /></SelectTrigger>
              <SelectContent>
                {esnMembers.map((m) => <SelectItem key={m.id} value={m.id}>{m.code} - {m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1">
            <Label className="text-xs">Gerente de Vendas (GSN)</Label>
            <Select value={form.gsn_id} onValueChange={(v) => setForm((f) => ({ ...f, gsn_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecione o GSN" /></SelectTrigger>
              <SelectContent>
                {gsnMembers.map((m) => <SelectItem key={m.id} value={m.id}>{m.code} - {m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Button className="mt-2" onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
