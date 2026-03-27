import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Plus, Edit2, Trash2, UsersRound, Building, Shield, Search, Loader2 } from "lucide-react";
import { ROLE_LABELS, type AppRole } from "@/lib/permissions";

export default function UserGroupsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", role: "" });
  const [saving, setSaving] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["user_groups"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_groups" as any).select("*").order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: groupUnits = [] } = useQuery({
    queryKey: ["user_group_units"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_group_units" as any).select("*");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: groupMembers = [] } = useQuery({
    queryKey: ["user_group_members"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_group_members" as any).select("*");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: units = [] } = useQuery({
    queryKey: ["all-units"],
    queryFn: async () => {
      const { data, error } = await supabase.from("unit_info").select("id, name, code").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("display_name");
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    if (!search) return groups;
    const s = search.toLowerCase();
    return groups.filter((g: any) => g.name.toLowerCase().includes(s));
  }, [groups, search]);

  const openNew = () => {
    setEditId(null);
    setForm({ name: "", description: "", role: "" });
    setDialogOpen(true);
  };

  const openEdit = (g: any) => {
    setEditId(g.id);
    setForm({ name: g.name, description: g.description || "", role: g.role || "" });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        description: form.description.trim(),
        role: form.role || null,
        updated_at: new Date().toISOString(),
      };
      if (editId) {
        const { error } = await supabase.from("user_groups" as any).update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase.from("user_groups" as any).insert(payload).select().single() as any);
        if (error) throw error;
        setSelectedGroup(data);
      }
      qc.invalidateQueries({ queryKey: ["user_groups"] });
      setDialogOpen(false);
      toast({ title: editId ? "Grupo atualizado!" : "Grupo criado!" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase.from("user_groups" as any).delete().eq("id", deleteTarget.id);
      if (error) throw error;
      if (selectedGroup?.id === deleteTarget.id) setSelectedGroup(null);
      qc.invalidateQueries({ queryKey: ["user_groups"] });
      qc.invalidateQueries({ queryKey: ["user_group_units"] });
      qc.invalidateQueries({ queryKey: ["user_group_members"] });
      toast({ title: "Grupo excluído!" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  };

  const selectedGroupUnits = new Set(groupUnits.filter((gu: any) => gu.group_id === selectedGroup?.id).map((gu: any) => gu.unit_id));
  const selectedGroupMembers = new Set(groupMembers.filter((gm: any) => gm.group_id === selectedGroup?.id).map((gm: any) => gm.user_id));

  const toggleGroupUnit = async (unitId: string, enabled: boolean) => {
    if (!selectedGroup) return;
    if (enabled) {
      await supabase.from("user_group_units" as any).insert({ group_id: selectedGroup.id, unit_id: unitId });
    } else {
      await supabase.from("user_group_units" as any).delete().eq("group_id", selectedGroup.id).eq("unit_id", unitId);
    }
    qc.invalidateQueries({ queryKey: ["user_group_units"] });
  };

  const toggleGroupMember = async (userId: string, enabled: boolean) => {
    if (!selectedGroup) return;
    if (enabled) {
      await supabase.from("user_group_members" as any).insert({ group_id: selectedGroup.id, user_id: userId });
    } else {
      await supabase.from("user_group_members" as any).delete().eq("group_id", selectedGroup.id).eq("user_id", userId);
    }
    qc.invalidateQueries({ queryKey: ["user_group_members"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/configuracoes/usuarios")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Grupos de Usuários</h1>
            <p className="text-sm text-muted-foreground">{groups.length} grupo(s) cadastrado(s)</p>
          </div>
        </div>
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Novo Grupo</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
        {/* Left - Group list */}
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="p-3 border-b border-border bg-muted/30">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar grupo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>
          <ScrollArea className="h-[calc(100vh-320px)]">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum grupo encontrado</p>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((g: any) => {
                  const unitCount = groupUnits.filter((gu: any) => gu.group_id === g.id).length;
                  const memberCount = groupMembers.filter((gm: any) => gm.group_id === g.id).length;
                  return (
                    <div
                      key={g.id}
                      onClick={() => setSelectedGroup(g)}
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-accent/50 ${selectedGroup?.id === g.id ? "bg-accent" : ""}`}
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                        <UsersRound className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{g.name}</p>
                        <div className="flex gap-2 mt-0.5">
                          {g.role && <Badge variant="secondary" className="text-[10px] px-1.5 h-4">{ROLE_LABELS[g.role as AppRole] || g.role}</Badge>}
                          <span className="text-[10px] text-muted-foreground">{unitCount} unid. · {memberCount} memb.</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right - Detail panel */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          {!selectedGroup ? (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-320px)] text-muted-foreground gap-2">
              <UsersRound className="h-10 w-10 opacity-30" />
              <p className="text-sm">Selecione um grupo para gerenciar</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-5 py-4 bg-muted/30 border-b border-border">
                <div>
                  <h2 className="text-lg font-semibold">{selectedGroup.name}</h2>
                  {selectedGroup.description && <p className="text-xs text-muted-foreground mt-0.5">{selectedGroup.description}</p>}
                  {selectedGroup.role && (
                    <Badge variant="secondary" className="mt-1 text-xs">{ROLE_LABELS[selectedGroup.role as AppRole] || selectedGroup.role}</Badge>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(selectedGroup)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteTarget(selectedGroup)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <Tabs defaultValue="units" className="px-5 pt-4">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="units" className="text-xs gap-1.5">
                    <Building className="h-3.5 w-3.5" />Unidades
                  </TabsTrigger>
                  <TabsTrigger value="members" className="text-xs gap-1.5">
                    <UsersRound className="h-3.5 w-3.5" />Membros
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="units" className="mt-0">
                  <ScrollArea className="h-[calc(100vh-480px)]">
                    <div className="space-y-1 pb-4">
                      {units.map((unit) => (
                        <label key={unit.id} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-accent cursor-pointer transition-colors">
                          <Checkbox
                            checked={selectedGroupUnits.has(unit.id)}
                            onCheckedChange={(checked) => toggleGroupUnit(unit.id, !!checked)}
                          />
                          <span className="text-sm">{unit.name}</span>
                          {unit.code && <span className="text-xs text-muted-foreground">({unit.code})</span>}
                        </label>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="members" className="mt-0">
                  <ScrollArea className="h-[calc(100vh-480px)]">
                    <div className="space-y-1 pb-4">
                      {profiles.map((p) => (
                        <label key={p.user_id} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-accent cursor-pointer transition-colors">
                          <Checkbox
                            checked={selectedGroupMembers.has(p.user_id)}
                            onCheckedChange={(checked) => toggleGroupMember(p.user_id, !!checked)}
                          />
                          <div className="min-w-0">
                            <p className="text-sm truncate">{p.display_name}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{p.email || "—"}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </div>

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Grupo" : "Novo Grupo"}</DialogTitle>
            <DialogDescription>Defina o nome, perfil e descrição do grupo</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome do Grupo *</Label>
              <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Equipe Comercial SP" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Perfil de Acesso</Label>
              <Select value={form.role || "none"} onValueChange={(v) => setForm(f => ({ ...f, role: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum (definir individualmente)</SelectItem>
                  {(Object.entries(ROLE_LABELS) as [AppRole, string][]).map(([role, label]) => (
                    <SelectItem key={role} value={role}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição</Label>
              <Input value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descrição opcional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editId ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir Grupo</DialogTitle>
            <DialogDescription>Tem certeza que deseja excluir o grupo "{deleteTarget?.name}"? Os membros e unidades vinculadas serão desvinculados.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
