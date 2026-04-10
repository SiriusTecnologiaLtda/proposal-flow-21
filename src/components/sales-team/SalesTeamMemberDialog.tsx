import { useState, useEffect } from "react";
import { Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import AssignmentsTab from "./AssignmentsTab";
import { useSalesTeam } from "@/hooks/useSupabaseData";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  member: any | null;
  units: any[];
  gsnMembers: any[];
}

const emptyForm = { name: "", code: "", email: "", phone: "", role: "", unit_id: "", linked_gsn_id: "", commission_pct: "" };

export default function SalesTeamMemberDialog({ open, onOpenChange, member, units, gsnMembers }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: allMembers = [] } = useSalesTeam();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("dados");

  const isEditing = !!member;

  useEffect(() => {
    if (member) {
      setForm({
        name: member.name || "",
        code: member.code || "",
        email: member.email || "",
        phone: member.phone || "",
        role: member.role || "",
        unit_id: member.unit_id || "",
        linked_gsn_id: member.linked_gsn_id || "",
        commission_pct: String(member.commission_pct ?? 3),
      });
      setActiveTab("dados");
    } else {
      setForm(emptyForm);
      setActiveTab("dados");
    }
  }, [member, open]);

  const handleSave = async () => {
    if (!form.name || !form.code || !form.role) {
      toast({ title: "Preencha Nome, Código e Função", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = {
      name: form.name,
      code: form.code,
      email: form.email || null,
      phone: form.phone || null,
      role: form.role as any,
      unit_id: form.unit_id || null,
      linked_gsn_id: form.linked_gsn_id || null,
      commission_pct: form.role === "esn" ? parseFloat(form.commission_pct) || 3 : form.role === "arquiteto" ? parseFloat(form.commission_pct) || 1.31 : 0,
    };
    const { error } = member
      ? await supabase.from("sales_team").update(payload).eq("id", member.id)
      : await supabase.from("sales_team").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: member ? "Membro atualizado!" : "Membro adicionado!" });
      qc.invalidateQueries({ queryKey: ["sales_team"] });
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">{isEditing ? "Editar Membro" : "Novo Membro"}</DialogTitle>
          <DialogDescription>Preencha os dados do membro do time de vendas.</DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
          <TabsList className="w-full">
            <TabsTrigger value="dados" className="flex-1">Dados Cadastrais</TabsTrigger>
            {isEditing && (
              <TabsTrigger value="vinculos" className="flex-1">Vínculos Comerciais</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="dados" className="space-y-4 mt-4">
            {/* Seção: Identificação */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identificação</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1">
                  <Label className="text-xs">Nome *</Label>
                  <Input placeholder="Nome completo" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Código *</Label>
                  <Input placeholder="Ex: ESN001" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Seção: Contato */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contato</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1">
                  <Label className="text-xs">E-mail</Label>
                  <Input type="email" placeholder="email@exemplo.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Celular (WhatsApp)</Label>
                  <Input type="tel" placeholder="+5511999999999" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Seção: Classificação */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Classificação</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1">
                  <Label className="text-xs">Função *</Label>
                  <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione a função" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dsn">Diretor de Vendas (DSN)</SelectItem>
                      <SelectItem value="esn">Executivo de Vendas (ESN)</SelectItem>
                      <SelectItem value="gsn">Gerente de Vendas (GSN)</SelectItem>
                      <SelectItem value="arquiteto">Engenheiro de Valor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Unidade</Label>
                  <Select value={form.unit_id} onValueChange={(v) => setForm((f) => ({ ...f, unit_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                    <SelectContent>
                      {units.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {form.role === "esn" && (
                  <div className="grid gap-1">
                    <Label className="text-xs">GSN vinculado</Label>
                    <Select value={form.linked_gsn_id} onValueChange={(v) => setForm((f) => ({ ...f, linked_gsn_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione o GSN" /></SelectTrigger>
                      <SelectContent>
                        {gsnMembers.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.code} - {m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {(form.role === "esn" || form.role === "arquiteto") && (
                  <div className="grid gap-1">
                    <Label className="text-xs">% Comissão</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      placeholder={form.role === "arquiteto" ? "1.31" : "3"}
                      value={form.commission_pct}
                      onChange={(e) => setForm((f) => ({ ...f, commission_pct: e.target.value }))}
                      className="w-32"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Footer: Salvar */}
            <div className="flex justify-end border-t border-border pt-4">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : <><Save className="mr-2 h-4 w-4" />Salvar</>}
              </Button>
            </div>
          </TabsContent>

          {isEditing && (
            <TabsContent value="vinculos">
              <AssignmentsTab
                memberId={member.id}
                memberName={member.name}
                units={units}
                allMembers={allMembers}
              />
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
