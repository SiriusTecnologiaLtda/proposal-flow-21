import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useCreateClient, useUnits, useSalesTeam } from "@/hooks/useSupabaseData";
import { useQueryClient } from "@tanstack/react-query";
import { Building, User, MapPin, Users, Save, Loader2 } from "lucide-react";

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
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto p-0">
        {/* Header com gradiente similar à oportunidade */}
        <div className="rounded-t-lg bg-gradient-to-r from-[hsl(215,28%,17%)] via-[hsl(217,33%,22%)] to-[hsl(217,91%,40%)] px-6 py-5 text-white">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-lg font-semibold text-white">Novo Cliente</DialogTitle>
            <DialogDescription className="text-sm text-white/70">
              Preencha os dados para cadastrar e vincular à oportunidade.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-5 px-6 pb-6 pt-4">
          {/* ── Identificação ──────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Building className="h-3.5 w-3.5" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Identificação</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">Razão Social *</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nome completo da empresa" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Código *</Label>
                <Input placeholder="Ex: CLI001" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">CNPJ *</Label>
                <Input placeholder="00.000.000/0000-00" value={form.cnpj} onChange={(e) => setForm((f) => ({ ...f, cnpj: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Inscrição Estadual</Label>
                <Input value={form.state_registration} onChange={(e) => setForm((f) => ({ ...f, state_registration: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Cód. Loja</Label>
                <Input value={form.store_code} onChange={(e) => setForm((f) => ({ ...f, store_code: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* ── Contato Principal ──────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <User className="h-3.5 w-3.5" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Contato Principal</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Nome do Contato</Label>
                <Input value={form.contact} onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} placeholder="Nome completo" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">E-mail</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="email@empresa.com" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Telefone</Label>
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="(00) 00000-0000" />
              </div>
            </div>
          </div>

          {/* ── Endereço ──────────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <MapPin className="h-3.5 w-3.5" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Endereço</h3>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Endereço Completo</Label>
              <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Rua, número, bairro, cidade - UF" />
            </div>
          </div>

          {/* ── Vínculos ──────────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Users className="h-3.5 w-3.5" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Vínculos</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Unidade</Label>
                <Select value={form.unit_id} onValueChange={(v) => setForm((f) => ({ ...f, unit_id: v }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">ESN</Label>
                <Select value={form.esn_id} onValueChange={(v) => setForm((f) => ({ ...f, esn_id: v }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {esnMembers.map((m) => <SelectItem key={m.id} value={m.id}>{m.code} - {m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">GSN</Label>
                <Select value={form.gsn_id} onValueChange={(v) => setForm((f) => ({ ...f, gsn_id: v }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {gsnMembers.map((m) => <SelectItem key={m.id} value={m.id}>{m.code} - {m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ── Ação ──────────────────────────────────────────────── */}
          <Separator />
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} className="gap-2 px-6">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Salvando..." : "Salvar e Selecionar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
