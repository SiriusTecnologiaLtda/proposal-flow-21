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
import { ArrowLeft, Shield, ShieldCheck, Loader2 } from "lucide-react";
import { ROLE_LABELS, ALL_RESOURCES, RESOURCE_LABELS, type AppRole } from "@/lib/permissions";

export default function UserManagementPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);
  const [savingPerm, setSavingPerm] = useState(false);

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

  const { data: rolePermissions = [], isLoading: loadingPerms } = useQuery({
    queryKey: ["all-role-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("role_permissions").select("*");
      if (error) throw error;
      return data;
    },
  });

  const roleMap = new Map(userRoles.map((r) => [r.user_id, r]));

  // Build a set of "role:resource" for quick lookup
  const permSet = new Set(rolePermissions.map((p: any) => `${p.role}:${p.resource}`));

  async function handleRoleChange(userId: string, newRole: string) {
    setSaving(userId);
    try {
      const existing = roleMap.get(userId);
      if (newRole === "none") {
        if (existing) {
          const { error } = await supabase.from("user_roles").delete().eq("id", existing.id);
          if (error) throw error;
        }
      } else if (existing) {
        const { error } = await supabase.from("user_roles").update({ role: newRole as AppRole }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole as AppRole });
        if (error) throw error;
      }
      await qc.invalidateQueries({ queryKey: ["all-user-roles"] });
      await qc.invalidateQueries({ queryKey: ["user-role"] });
      toast({ title: "Perfil atualizado com sucesso" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setSaving(null);
  }

  async function togglePermission(role: AppRole, resource: string, currentlyEnabled: boolean) {
    setSavingPerm(true);
    try {
      if (currentlyEnabled) {
        const { error } = await supabase
          .from("role_permissions")
          .delete()
          .eq("role", role)
          .eq("resource", resource);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("role_permissions")
          .insert({ role, resource });
        if (error) throw error;
      }
      await qc.invalidateQueries({ queryKey: ["all-role-permissions"] });
      await qc.invalidateQueries({ queryKey: ["role-permissions"] });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setSavingPerm(false);
  }

  const nonAdminRoles = (Object.keys(ROLE_LABELS) as AppRole[]).filter((r) => r !== "admin");
  const isLoading = loadingProfiles || loadingRoles || loadingPerms;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/configuracoes")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Usuários e Acessos</h1>
          <p className="text-sm text-muted-foreground">Gerencie perfis e permissões de acesso</p>
        </div>
      </div>

      {/* Permissions matrix */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Permissões por Perfil
          </CardTitle>
          <p className="text-xs text-muted-foreground">Marque os recursos que cada perfil pode acessar. Administradores sempre têm acesso total.</p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Recurso</TableHead>
                  {nonAdminRoles.map((role) => (
                    <TableHead key={role} className="text-center w-[140px]">
                      {ROLE_LABELS[role]}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ALL_RESOURCES.map((resource) => (
                  <TableRow key={resource}>
                    <TableCell className="font-medium">{RESOURCE_LABELS[resource]}</TableCell>
                    {nonAdminRoles.map((role) => {
                      const enabled = permSet.has(`${role}:${resource}`);
                      return (
                        <TableCell key={role} className="text-center">
                          <Checkbox
                            checked={enabled}
                            disabled={savingPerm}
                            onCheckedChange={() => togglePermission(role, resource, enabled)}
                          />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Users table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            Usuários cadastrados
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((profile) => {
                  const currentRole = roleMap.get(profile.user_id)?.role as AppRole | undefined;
                  const roleValue = currentRole || "none";
                  const userResources = currentRole === "admin"
                    ? ALL_RESOURCES
                    : currentRole
                      ? rolePermissions.filter((p: any) => p.role === currentRole).map((p: any) => p.resource)
                      : [];

                  return (
                    <TableRow key={profile.id}>
                      <TableCell className="font-medium">{profile.display_name}</TableCell>
                      <TableCell className="text-muted-foreground">{profile.email || "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Select
                            value={roleValue}
                            onValueChange={(v) => handleRoleChange(profile.user_id, v)}
                            disabled={saving === profile.user_id}
                          >
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
                          ) : userResources.length > 0 ? (
                            userResources.map((r: string) => (
                              <Badge key={r} variant="outline" className="text-xs">{RESOURCE_LABELS[r] || r}</Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
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
    </div>
  );
}
