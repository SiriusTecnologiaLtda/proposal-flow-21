import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Shield, Loader2, Settings2, Link2 } from "lucide-react";
import { ROLE_LABELS, ALL_RESOURCES, RESOURCE_LABELS, type AppRole } from "@/lib/permissions";
import { useSalesTeam } from "@/hooks/useSupabaseData";

export default function RegisteredUsersPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);
  const [configUserId, setConfigUserId] = useState<string | null>(null);
  const { data: salesTeam = [] } = useSalesTeam();

  const { data: profiles = [], isLoading: loadingProfiles } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("display_name");
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

  const roleMap = new Map(userRoles.map((r) => [r.user_id, r]));
  const isLoading = loadingProfiles || loadingRoles;

  async function handleRoleChange(userId: string, newRole: string) {
    setSaving(userId);
    try {
      const existing = roleMap.get(userId);
      if (newRole === "none") {
        if (existing) {
          const { error } = await supabase.from("user_roles").delete().eq("id", existing.id);
          if (error) throw error;
        }
        // Also clear unit access
        await supabase.from("user_unit_access").delete().eq("user_id", userId);
      } else if (existing) {
        const { error } = await supabase.from("user_roles").update({ role: newRole as AppRole }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole as AppRole });
        if (error) throw error;
      }
      // If changing away from consulta, clear unit access
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

  // Consulta unit config dialog
  const configProfile = configUserId ? profiles.find((p) => p.user_id === configUserId) : null;
  const configUnitIds = new Set(userUnitAccess.filter((u) => u.user_id === configUserId).map((u) => u.unit_id));

  async function toggleUnitAccess(unitId: string, enabled: boolean) {
    if (!configUserId) return;
    if (enabled) {
      await supabase.from("user_unit_access").insert({ user_id: configUserId, unit_id: unitId });
    } else {
      await supabase.from("user_unit_access").delete().eq("user_id", configUserId).eq("unit_id", unitId);
    }
    await qc.invalidateQueries({ queryKey: ["all-user-unit-access"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/configuracoes/usuarios")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Usuários Cadastrados</h1>
          <p className="text-sm text-muted-foreground">Gerencie perfis de acesso dos usuários</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            Usuários
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : profiles.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nenhum usuário encontrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-[200px]">Perfil de Acesso</TableHead>
                  <TableHead>Permissões</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((profile) => {
                  const currentRole = roleMap.get(profile.user_id)?.role as AppRole | undefined;
                  const roleValue = currentRole || "none";
                  const userResources = currentRole === "admin"
                    ? ALL_RESOURCES
                    : currentRole === "consulta"
                      ? ["propostas"]
                      : currentRole
                        ? rolePermissions.filter((p: any) => p.role === currentRole).map((p: any) => p.resource)
                        : [];

                  const userUnits = userUnitAccess.filter((u) => u.user_id === profile.user_id);

                  return (
                    <TableRow key={profile.id}>
                      <TableCell className="font-medium">{profile.display_name}</TableCell>
                      <TableCell className="text-muted-foreground">{profile.email || "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Select value={roleValue} onValueChange={(v) => handleRoleChange(profile.user_id, v)} disabled={saving === profile.user_id}>
                            <SelectTrigger className="h-8 w-[180px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sem perfil</SelectItem>
                              {(Object.entries(ROLE_LABELS) as [AppRole, string][]).map(([role, label]) => (
                                <SelectItem key={role} value={role}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {saving === profile.user_id && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {currentRole === "admin" ? (
                            <Badge variant="secondary" className="text-xs">Acesso total</Badge>
                          ) : currentRole === "consulta" ? (
                            <>
                              <Badge variant="outline" className="text-xs">Propostas Ganhas (somente leitura)</Badge>
                              {userUnits.length > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  {userUnits.length} unidade{userUnits.length > 1 ? "s" : ""}
                                </Badge>
                              )}
                              {!!(profile as any).is_cra && (
                                <Badge variant="default" className="text-xs">CRA</Badge>
                              )}
                            </>
                          ) : userResources.length > 0 ? (
                            userResources.map((r: string) => (
                              <Badge key={r} variant="outline" className="text-xs">{RESOURCE_LABELS[r] || r}</Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {currentRole === "consulta" && (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => setConfigUserId(profile.user_id)} title="Configurar unidades">
                                <Settings2 className="h-4 w-4" />
                              </Button>
                              <Switch
                                checked={!!(profile as any).is_cra}
                                onCheckedChange={(checked) => handleCraToggle(profile.user_id, checked)}
                                title="Marcar como CRA"
                              />
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Unit access config dialog for consulta role */}
      <Dialog open={!!configUserId} onOpenChange={(open) => !open && setConfigUserId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Unidades com Acesso — {configProfile?.display_name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Selecione as unidades cujas propostas ganhas este usuário poderá visualizar.</p>
          <div className="space-y-2 max-h-60 overflow-auto">
            {units.map((unit) => (
              <label key={unit.id} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-accent cursor-pointer">
                <Checkbox
                  checked={configUnitIds.has(unit.id)}
                  onCheckedChange={(checked) => toggleUnitAccess(unit.id, !!checked)}
                />
                <span className="text-sm">{unit.name}</span>
                {unit.code && <span className="text-xs text-muted-foreground">({unit.code})</span>}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigUserId(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
