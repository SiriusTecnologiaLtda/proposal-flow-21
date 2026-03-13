import { useState } from "react";
import { UserCog, Plus, Edit2 } from "lucide-react";
import { useSalesTeam, useUnits } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const roleLabels: Record<string, string> = {
  esn: "Executivo de Vendas (ESN)",
  gsn: "Gerente de Vendas (GSN)",
  arquiteto: "Arquiteto de Soluções",
};

const roleColors: Record<string, string> = {
  esn: "bg-primary/10 text-primary",
  gsn: "bg-success/15 text-success",
  arquiteto: "bg-warning/15 text-warning",
};

const emptyForm = { name: "", code: "", email: "", role: "", unit_id: "", linked_gsn_id: "" };

export default function SalesTeamPage() {
  const { data: salesTeam = [] } = useSalesTeam();
  const { data: units = [] } = useUnits();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const gsnMembers = salesTeam.filter((m) => m.role === "gsn");

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (member: any) => {
    setEditingId(member.id);
    setForm({
      name: member.name || "",
      code: member.code || "",
      email: member.email || "",
      role: member.role || "",
      unit_id: member.unit_id || "",
      linked_gsn_id: member.linked_gsn_id || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.code || !form.role) {
      toast({ title: "Preencha Nome, Código e Função", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name,
      code: form.code,
      email: form.email || null,
      role: form.role as any,
      unit_id: form.unit_id || null,
      linked_gsn_id: form.linked_gsn_id || null,
    };
    const { error } = editingId
      ? await supabase.from("sales_team").update(payload).eq("id", editingId)
      : await supabase.from("sales_team").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editingId ? "Membro atualizado!" : "Membro adicionado!" });
      qc.invalidateQueries({ queryKey: ["sales_team"] });
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
    }
  };

  const grouped = salesTeam.reduce<Record<string, typeof salesTeam>>((acc, m) => {
    (acc[m.role] = acc[m.role] || []).push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Time de Vendas</h1>
          <p className="text-sm text-muted-foreground">{salesTeam.length} membros cadastrados</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />Novo Membro
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Membro" : "Novo Membro"}</DialogTitle>
            <DialogDescription>Preencha os dados do membro do time de vendas.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label className="text-xs">Nome *</Label>
              <Input placeholder="Nome completo" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Código *</Label>
              <Input placeholder="Ex: ESN001" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">E-mail</Label>
              <Input type="email" placeholder="email@exemplo.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Função *</Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione a função" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="esn">Executivo de Vendas (ESN)</SelectItem>
                  <SelectItem value="gsn">Gerente de Vendas (GSN)</SelectItem>
                  <SelectItem value="arquiteto">Arquiteto de Soluções</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Unidade</Label>
              <Select value={form.unit_id} onValueChange={(v) => setForm((f) => ({ ...f, unit_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                <SelectContent>
                  {units.map((u) => (<SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            {form.role === "esn" && (
              <div className="grid gap-1">
                <Label className="text-xs">GSN vinculado</Label>
                <Select value={form.linked_gsn_id} onValueChange={(v) => setForm((f) => ({ ...f, linked_gsn_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o GSN" /></SelectTrigger>
                  <SelectContent>
                    {gsnMembers.map((m) => (<SelectItem key={m.id} value={m.id}>{m.code} - {m.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button className="mt-2" onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {(["gsn", "esn", "arquiteto"] as const).map((role) => {
        const members = grouped[role] || [];
        return (
          <div key={role}>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {roleLabels[role]}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((member) => {
                const linkedGsn = member.linked_gsn_id
                  ? salesTeam.find((m) => m.id === member.linked_gsn_id)
                  : null;
                const unitName = (member as any).unit_info?.name;
                return (
                  <div key={member.id} className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${roleColors[role]}`}>
                          <UserCog className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{member.name}</p>
                          <p className="text-xs text-muted-foreground">{member.code}</p>
                        </div>
                      </div>
                      <button className="rounded p-1 text-muted-foreground hover:text-foreground" onClick={() => openEdit(member)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {member.email && <p>📧 {member.email}</p>}
                      {linkedGsn && <p>🔗 GSN: {linkedGsn.name}</p>}
                      {unitName && <p>🏢 {unitName}</p>}
                    </div>
                  </div>
                );
              })}
              {members.length === 0 && (
                <p className="text-sm text-muted-foreground col-span-full">Nenhum membro neste grupo.</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
