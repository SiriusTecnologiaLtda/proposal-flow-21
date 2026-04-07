import { useState } from "react";
import { Search, X, Filter } from "lucide-react";
import { UserCog, Plus, Edit2, Trash2, ArrowRightLeft, Percent } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import BatchCommissionDialog from "@/components/sales-team/BatchCommissionDialog";
import TransferAccountsDialog from "@/components/sales-team/TransferAccountsDialog";
import TransferGsnDialog from "@/components/sales-team/TransferGsnDialog";
import SalesTeamMemberDialog from "@/components/sales-team/SalesTeamMemberDialog";
import { useSalesTeam, useUnits } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const roleLabels: Record<string, string> = {
  dsn: "Diretor de Vendas (DSN)",
  esn: "Executivo de Vendas (ESN)",
  gsn: "Gerente de Vendas (GSN)",
  arquiteto: "Engenheiro de Valor",
};

const roleColors: Record<string, string> = {
  esn: "bg-primary/10 text-primary",
  gsn: "bg-success/15 text-success",
  arquiteto: "bg-warning/15 text-warning",
};

export default function SalesTeamPage() {
  const { data: salesTeam = [] } = useSalesTeam();
  const [search, setSearch] = useState("");
  const [filterRoles, setFilterRoles] = useState<string[]>([]);
  const [filterUnitIds, setFilterUnitIds] = useState<string[]>([]);
  const [filterGsnIds, setFilterGsnIds] = useState<string[]>([]);
  const { data: units = [] } = useUnits();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<any>(null);
  const [transferMember, setTransferMember] = useState<any>(null);
  const [transferGsnMember, setTransferGsnMember] = useState<any>(null);
  const [batchCommissionOpen, setBatchCommissionOpen] = useState(false);

  const gsnMembers = salesTeam.filter((m) => m.role === "gsn");

  const openNew = () => {
    setEditingMember(null);
    setDialogOpen(true);
  };

  const openEdit = (member: any) => {
    setEditingMember(member);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Deseja realmente excluir "${name}"?`)) return;
    const { error } = await supabase.from("sales_team").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Membro excluído!" });
      qc.invalidateQueries({ queryKey: ["sales_team"] });
    }
  };

  const activeFilterCount = [filterRoles.length, filterUnitIds.length, filterGsnIds.length].filter((n) => n > 0).length;

  const filteredTeam = salesTeam.filter((m) => {
    if (search) {
      const q = search.toLowerCase();
      if (!m.name.toLowerCase().includes(q) && !m.code.toLowerCase().includes(q)) return false;
    }
    if (filterRoles.length > 0 && !filterRoles.includes(m.role)) return false;
    if (filterUnitIds.length > 0 && (!m.unit_id || !filterUnitIds.includes(m.unit_id))) return false;
    if (filterGsnIds.length > 0) {
      if (m.role === "esn" && (!m.linked_gsn_id || !filterGsnIds.includes(m.linked_gsn_id))) return false;
      if (m.role === "gsn" && !filterGsnIds.includes(m.id)) return false;
      if (m.role === "arquiteto") return false;
    }
    return true;
  });

  const grouped = filteredTeam.reduce<Record<string, typeof salesTeam>>((acc, m) => {
    (acc[m.role] = acc[m.role] || []).push(m);
    return acc;
  }, {});

  const clearFilters = () => { setFilterRoles([]); setFilterUnitIds([]); setFilterGsnIds([]); };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Time de Vendas</h1>
          <p className="text-sm text-muted-foreground">{salesTeam.length} membros cadastrados{filteredTeam.length !== salesTeam.length ? ` · ${filteredTeam.length} exibidos` : ""}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBatchCommissionOpen(true)}>
            <Percent className="mr-2 h-4 w-4" />Comissão em Lote
          </Button>
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />Novo Membro
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3 overflow-hidden">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Filter className="h-4 w-4" />
          <span>Filtros</span>
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="text-xs">{activeFilterCount} ativo{activeFilterCount > 1 ? "s" : ""}</Badge>
          )}
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-3 w-3" /> Limpar filtros
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Pesquisar por nome ou código..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <MultiSelectCombobox
            options={[
              { value: "dsn", label: "Diretor de Vendas (DSN)" },
              { value: "esn", label: "Executivo de Vendas (ESN)" },
              { value: "gsn", label: "Gerente de Vendas (GSN)" },
              { value: "arquiteto", label: "Engenheiro de Valor" },
            ]}
            selected={filterRoles}
            onChange={setFilterRoles}
            placeholder="Classificação"
            searchPlaceholder="Pesquisar classificação..."
          />
          <MultiSelectCombobox
            options={units.map((u) => ({ value: u.id, label: u.name }))}
            selected={filterUnitIds}
            onChange={setFilterUnitIds}
            placeholder="Unidade"
            searchPlaceholder="Pesquisar unidade..."
          />
          <MultiSelectCombobox
            options={gsnMembers.map((m) => ({ value: m.id, label: `${m.code} - ${m.name}` }))}
            selected={filterGsnIds}
            onChange={setFilterGsnIds}
            placeholder="GSN vinculado"
            searchPlaceholder="Pesquisar GSN..."
          />
        </div>
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
              <Label className="text-xs">Celular (WhatsApp)</Label>
              <Input type="tel" placeholder="+5511999999999" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
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
            {(form.role === "esn" || form.role === "arquiteto") && (
              <div className="grid gap-1">
                <Label className="text-xs">% Comissão</Label>
                <Input type="number" step="0.01" min="0" max="100" placeholder={form.role === "arquiteto" ? "1.31" : "3"} value={form.commission_pct} onChange={(e) => setForm((f) => ({ ...f, commission_pct: e.target.value }))} className="w-32" />
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
                         <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{member.name}</p>
                          <p className="text-xs text-muted-foreground">{member.code}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {(role === "esn" || role === "gsn") && (
                          <button
                            className="rounded p-1 text-muted-foreground hover:text-primary"
                            title={role === "gsn" ? "Transferir contas e ESNs" : "Transferir contas"}
                            onClick={() => role === "gsn" ? setTransferGsnMember(member) : setTransferMember(member)}
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button className="rounded p-1 text-muted-foreground hover:text-foreground" onClick={() => openEdit(member)}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button className="rounded p-1 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(member.id, member.name)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground overflow-hidden">
                      {member.email && <p className="truncate">📧 {member.email}</p>}
                      {(member as any).phone && <p className="truncate">📱 {(member as any).phone}</p>}
                      {linkedGsn && <p className="truncate">🔗 GSN: {linkedGsn.name}</p>}
                      {unitName && <p className="truncate">🏢 {unitName}</p>}
                      {(role === "esn" || role === "arquiteto") && <p>💰 Comissão: {(member as any).commission_pct ?? (role === "arquiteto" ? 1.31 : 3)}%</p>}
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
      {transferMember && (
        <TransferAccountsDialog
          member={transferMember}
          open={!!transferMember}
          onOpenChange={(v) => !v && setTransferMember(null)}
        />
      )}
      {transferGsnMember && (
        <TransferGsnDialog
          member={transferGsnMember}
          open={!!transferGsnMember}
          onOpenChange={(v) => !v && setTransferGsnMember(null)}
        />
      )}
      <BatchCommissionDialog
        open={batchCommissionOpen}
        onOpenChange={setBatchCommissionOpen}
        esnMembers={salesTeam.filter((m) => m.role === "esn" || m.role === "arquiteto")}
        units={units}
      />
    </div>
  );
}
