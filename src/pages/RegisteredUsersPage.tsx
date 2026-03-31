import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, Shield, Loader2, Settings2, FolderKey, FolderSync, Search,
  Users, Building, ChevronRight, UserCircle2
} from "lucide-react";
import { ROLE_LABELS, ALL_RESOURCES, RESOURCE_LABELS, type AppRole } from "@/lib/permissions";
import { useSalesTeam } from "@/hooks/useSupabaseData";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

export default function RegisteredUsersPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);
  const [grantingAccess, setGrantingAccess] = useState<string | null>(null);
  const [grantingAll, setGrantingAll] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { data: salesTeam = [] } = useSalesTeam();

  const { data: profiles = [], isLoading: loadingProfiles } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, user_id, display_name, email, phone, avatar_url, sales_team_member_id, is_cra, created_at, updated_at").order("display_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: userRoles = [], isLoading: loadingRoles } = useQuery({
    queryKey: ["all-user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: rolePermissions = [] } = useQuery({
    queryKey: ["all-role-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("role_permissions").select("*");
      if (error) throw error;
      return data;
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

  const { data: userUnitAccess = [] } = useQuery({
    queryKey: ["all-user-unit-access"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_unit_access").select("*");
      if (error) throw error;
      return data;
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

  const { data: groups = [] } = useQuery({
    queryKey: ["user_groups"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_groups" as any).select("*");
      if (error) throw error;
      return data as any[];
    },
  });

  const roleMap = new Map(userRoles.map((r) => [r.user_id, r]));
  const isLoading = loadingProfiles || loadingRoles;

  const filteredProfiles = useMemo(() => {
    if (!search) return profiles;
    const s = search.toLowerCase();
    return profiles.filter((p) =>
      p.display_name.toLowerCase().includes(s) ||
      (p.email || "").toLowerCase().includes(s)
    );
  }, [profiles, search]);

  const selectedProfile = profiles.find((p) => p.user_id === selectedUserId);
  const selectedRole = selectedUserId ? (roleMap.get(selectedUserId)?.role as AppRole | undefined) : undefined;
  const selectedUserUnits = new Set(userUnitAccess.filter((u) => u.user_id === selectedUserId).map((u) => u.unit_id));
  const selectedUserGroups = groupMembers.filter((gm: any) => gm.user_id === selectedUserId);

  async function handleRoleChange(userId: string, newRole: string) {
    setSaving(userId);
    try {
      const existing = roleMap.get(userId);
      if (newRole === "none") {
        if (existing) {
          const { error } = await supabase.from("user_roles").delete().eq("id", existing.id);
          if (error) throw error;
        }
        await supabase.from("user_unit_access").delete().eq("user_id", userId);
      } else if (existing) {
        const { error } = await supabase.from("user_roles").update({ role: newRole as AppRole }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole as AppRole });
        if (error) throw error;
      }
      if (newRole !== "consulta") {
        await supabase.from("user_unit_access").delete().eq("user_id", userId);
      }
      await qc.invalidateQueries({ queryKey: ["all-user-roles"] });
      await qc.invalidateQueries({ queryKey: ["user-role"] });
      await qc.invalidateQueries({ queryKey: ["all-user-unit-access"] });
      toast({ title: "Perfil atualizado com sucesso" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setSaving(null);
  }

  async function handleCraToggle(userId: string, checked: boolean) {
    const { error } = await supabase.from("profiles").update({ is_cra: checked }).eq("user_id", userId);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      await qc.invalidateQueries({ queryKey: ["all-profiles"] });
      toast({ title: checked ? "Marcado como CRA" : "Desmarcado CRA" });
    }
  }

  async function handleSalesTeamLink(userId: string, memberId: string) {
    setSaving(userId);
    try {
      const value = memberId === "none" ? null : memberId;
      const { error } = await supabase.from("profiles").update({ sales_team_member_id: value }).eq("user_id", userId);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["all-profiles"] });
      toast({ title: value ? "Vínculo atualizado" : "Vínculo removido" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setSaving(null);
  }

  async function grantDriveFolderAccess(emails: string[], loadingKey?: string) {
    if (loadingKey) setGrantingAccess(loadingKey);
    else setGrantingAll(true);
    try {
      const { data, error } = await supabase.functions.invoke("grant-drive-folder-access", {
        body: { emails },
      });
      if (error) throw error;
      const results = data?.results || [];
      const ok = results.filter((r: any) => r.status === "ok").length;
      const already = results.filter((r: any) => r.status === "already").length;
      const failed = results.filter((r: any) => r.status === "error").length;
      const parts: string[] = [];
      if (ok > 0) parts.push(`${ok} acesso(s) concedido(s)`);
      if (already > 0) parts.push(`${already} já possuía(m) acesso`);
      if (failed > 0) parts.push(`${failed} falha(s)`);
      toast({
        title: failed > 0 ? "Concluído com erros" : "Permissões atualizadas",
        description: parts.join(", "),
        variant: failed > 0 ? "destructive" : "default",
      });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setGrantingAccess(null);
    setGrantingAll(false);
  }

  async function toggleUnitAccess(unitId: string, enabled: boolean) {
    if (!selectedUserId) return;
    if (enabled) {
      await supabase.from("user_unit_access").insert({ user_id: selectedUserId, unit_id: unitId });
    } else {
      await supabase.from("user_unit_access").delete().eq("user_id", selectedUserId).eq("unit_id", unitId);
    }
    await qc.invalidateQueries({ queryKey: ["all-user-unit-access"] });
  }

  const usersWithRole = profiles.filter((p) => roleMap.has(p.user_id) && p.email);

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/configuracoes/usuarios")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Usuários Cadastrados</h1>
              <p className="text-sm text-muted-foreground">{profiles.length} usuário(s) registrado(s)</p>
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={grantingAll || usersWithRole.length === 0}
                onClick={() => grantDriveFolderAccess(usersWithRole.map((p) => p.email!))}
              >
                {grantingAll ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FolderSync className="h-4 w-4 mr-2" />}
                Atualizar Permissões Drive
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Concede acesso à pasta de propostas do Google Drive para todos os usuários com perfil</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Master-Detail Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
          {/* Left - User list */}
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="p-3 border-b border-border bg-muted/30">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou e-mail..."
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
              ) : filteredProfiles.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum usuário encontrado</p>
              ) : (
                <div className="divide-y divide-border">
                  {filteredProfiles.map((profile) => {
                    const currentRole = roleMap.get(profile.user_id)?.role as AppRole | undefined;
                    return (
                      <div
                        key={profile.id}
                        onClick={() => setSelectedUserId(profile.user_id)}
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-accent/50 ${selectedUserId === profile.user_id ? "bg-accent" : ""}`}
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                          <UserCircle2 className="h-5 w-5" />
                        </div>
                         <div className="flex-1 min-w-0">
                           <p className="text-sm font-medium truncate">{profile.display_name}</p>
                           <p className="text-[11px] text-muted-foreground truncate">{profile.email || "—"}</p>
                           {profile.phone && <p className="text-[10px] text-muted-foreground/70 truncate">📱 {profile.phone}</p>}
                         </div>
                        {currentRole && (
                          <Badge variant={currentRole === "admin" ? "default" : "secondary"} className="text-[10px] px-1.5 h-5 shrink-0">
                            {ROLE_LABELS[currentRole] || currentRole}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Right - Detail panel */}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            {!selectedProfile ? (
              <div className="flex flex-col items-center justify-center h-[calc(100vh-320px)] text-muted-foreground gap-2">
                <Users className="h-10 w-10 opacity-30" />
                <p className="text-sm">Selecione um usuário para configurar</p>
              </div>
            ) : (
              <>
                {/* User header */}
                <div className="px-5 py-4 bg-muted/30 border-b border-border">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <UserCircle2 className="h-7 w-7" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-lg font-semibold truncate">{selectedProfile.display_name}</h2>
                      <p className="text-xs text-muted-foreground truncate">{selectedProfile.email || "—"}</p>
                    </div>
                    {selectedProfile.email && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="shrink-0"
                            disabled={grantingAccess === selectedProfile.user_id}
                            onClick={() => grantDriveFolderAccess([selectedProfile.email!], selectedProfile.user_id)}
                          >
                            {grantingAccess === selectedProfile.user_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <FolderKey className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Conceder acesso à pasta de propostas</p></TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>

                <Tabs defaultValue="config" className="px-5 pt-4">
                  <TabsList className="grid w-full grid-cols-3 mb-4">
                    <TabsTrigger value="config" className="text-xs gap-1.5">
                      <Shield className="h-3.5 w-3.5" />Perfil
                    </TabsTrigger>
                    <TabsTrigger value="units" className="text-xs gap-1.5">
                      <Building className="h-3.5 w-3.5" />Unidades
                    </TabsTrigger>
                    <TabsTrigger value="groups" className="text-xs gap-1.5">
                      <Users className="h-3.5 w-3.5" />Grupos
                    </TabsTrigger>
                  </TabsList>

                  {/* Tab: Perfil */}
                  <TabsContent value="config" className="mt-0 space-y-5 pb-6">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">Telefone / WhatsApp</label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="+5527999999999"
                          value={selectedProfile.phone || ""}
                          onChange={(e) => {
                            // Optimistic local update
                            const newPhone = e.target.value;
                            qc.setQueryData(["all-profiles"], (old: any[]) =>
                              old?.map((p) => p.user_id === selectedProfile.user_id ? { ...p, phone: newPhone } : p)
                            );
                          }}
                          onBlur={async (e) => {
                            const newPhone = e.target.value.trim();
                            await supabase.from("profiles").update({ phone: newPhone || null }).eq("user_id", selectedProfile.user_id);
                            toast({ title: "Telefone atualizado" });
                          }}
                          className="h-9"
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Usado para identificação automática via WhatsApp. Formato: +55DDDNUMERO
                      </p>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">Perfil de Acesso</label>
                      <Select
                        value={selectedRole || "none"}
                        onValueChange={(v) => handleRoleChange(selectedProfile.user_id, v)}
                        disabled={saving === selectedProfile.user_id}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem perfil</SelectItem>
                          {(Object.entries(ROLE_LABELS) as [AppRole, string][]).map(([role, label]) => (
                            <SelectItem key={role} value={role}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">Vínculo Time de Vendas</label>
                      <Select
                        value={selectedProfile.sales_team_member_id || "none"}
                        onValueChange={(v) => handleSalesTeamLink(selectedProfile.user_id, v)}
                        disabled={saving === selectedProfile.user_id}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Sem vínculo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem vínculo</SelectItem>
                          {salesTeam.map((m: any) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name} ({m.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedRole === "consulta" && (
                      <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                        <div>
                          <p className="text-sm font-medium">CRA</p>
                          <p className="text-[11px] text-muted-foreground">Marcar como CRA (Consultor de Resultado)</p>
                        </div>
                        <Switch
                          checked={!!(selectedProfile as any).is_cra}
                          onCheckedChange={(checked) => handleCraToggle(selectedProfile.user_id, checked)}
                        />
                      </div>
                    )}

                    <Separator />

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">Permissões Ativas</label>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedRole === "admin" ? (
                          <Badge variant="secondary" className="text-xs">Acesso total</Badge>
                        ) : selectedRole === "consulta" ? (
                          <Badge variant="outline" className="text-xs">Propostas Ganhas (somente leitura)</Badge>
                        ) : selectedRole ? (
                          rolePermissions
                            .filter((p: any) => p.role === selectedRole)
                            .map((p: any) => (
                              <Badge key={p.resource} variant="outline" className="text-xs">{RESOURCE_LABELS[p.resource] || p.resource}</Badge>
                            ))
                        ) : (
                          <span className="text-xs text-muted-foreground">Nenhum perfil atribuído</span>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  {/* Tab: Unidades */}
                  <TabsContent value="units" className="mt-0">
                    <p className="text-xs text-muted-foreground mb-3">
                      Selecione as unidades que este usuário poderá acessar.
                    </p>
                    <ScrollArea className="h-[calc(100vh-520px)]">
                      <div className="space-y-1 pb-4">
                        {units.map((unit) => (
                          <label key={unit.id} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-accent cursor-pointer transition-colors">
                            <Checkbox
                              checked={selectedUserUnits.has(unit.id)}
                              onCheckedChange={(checked) => toggleUnitAccess(unit.id, !!checked)}
                            />
                            <span className="text-sm">{unit.name}</span>
                            {unit.code && <span className="text-xs text-muted-foreground">({unit.code})</span>}
                          </label>
                        ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  {/* Tab: Grupos */}
                  <TabsContent value="groups" className="mt-0">
                    <p className="text-xs text-muted-foreground mb-3">
                      Grupos aos quais este usuário pertence.
                    </p>
                    <ScrollArea className="h-[calc(100vh-520px)]">
                      <div className="space-y-2 pb-4">
                        {groups.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum grupo cadastrado</p>
                        ) : groups.map((g: any) => {
                          const isMember = selectedUserGroups.some((gm: any) => gm.group_id === g.id);
                          return (
                            <label key={g.id} className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-accent cursor-pointer transition-colors border border-border">
                              <Checkbox
                                checked={isMember}
                                onCheckedChange={async (checked) => {
                                  if (checked) {
                                    await supabase.from("user_group_members" as any).insert({ group_id: g.id, user_id: selectedProfile.user_id });
                                  } else {
                                    await supabase.from("user_group_members" as any).delete().eq("group_id", g.id).eq("user_id", selectedProfile.user_id);
                                  }
                                  qc.invalidateQueries({ queryKey: ["user_group_members"] });
                                }}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium">{g.name}</p>
                                {g.description && <p className="text-[11px] text-muted-foreground">{g.description}</p>}
                              </div>
                              {g.role && (
                                <Badge variant="secondary" className="text-[10px] shrink-0">{ROLE_LABELS[g.role as AppRole] || g.role}</Badge>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              </>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
