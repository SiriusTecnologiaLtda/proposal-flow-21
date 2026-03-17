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
import { ArrowLeft, Shield, ShieldCheck, Loader2 } from "lucide-react";
import { ROLE_LABELS, getAllowedResources, RESOURCE_LABELS, type AppRole } from "@/lib/permissions";

export default function UserManagementPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);

  // Fetch all profiles
  const { data: profiles = [], isLoading: loadingProfiles } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("display_name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch all user_roles
  const { data: userRoles = [], isLoading: loadingRoles } = useQuery({
    queryKey: ["all-user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("*");
      if (error) throw error;
      return data;
    },
  });

  const roleMap = new Map(userRoles.map((r) => [r.user_id, r]));

  async function handleRoleChange(userId: string, newRole: string) {
    setSaving(userId);
    try {
      const existing = roleMap.get(userId);

      if (newRole === "none") {
        if (existing) {
          const { error } = await supabase
            .from("user_roles")
            .delete()
            .eq("id", existing.id);
          if (error) throw error;
        }
      } else if (existing) {
        const { error } = await supabase
          .from("user_roles")
          .update({ role: newRole as AppRole })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: userId, role: newRole as AppRole });
        if (error) throw error;
      }

      await qc.invalidateQueries({ queryKey: ["all-user-roles"] });
      toast({ title: "Perfil atualizado com sucesso" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setSaving(null);
  }

  const isLoading = loadingProfiles || loadingRoles;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/configuracoes")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Usuários e Acessos</h1>
          <p className="text-sm text-muted-foreground">Gerencie perfis de acesso dos usuários</p>
        </div>
      </div>

      {/* Legend */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Perfis disponíveis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.entries(ROLE_LABELS) as [AppRole, string][]).map(([role, label]) => {
              const resources = getAllowedResources(role);
              return (
                <div key={role} className="rounded-md border border-border p-3">
                  <div className="flex items-center gap-2 mb-2">
                    {role === "admin" ? (
                      <ShieldCheck className="h-4 w-4 text-primary" />
                    ) : (
                      <Shield className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium text-foreground">{label}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {role === "admin" ? (
                      <Badge variant="secondary" className="text-xs">Acesso total</Badge>
                    ) : (
                      resources.map((r) => (
                        <Badge key={r} variant="outline" className="text-xs">
                          {RESOURCE_LABELS[r] || r}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Users table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Usuários cadastrados</CardTitle>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((profile) => {
                  const currentRole = roleMap.get(profile.user_id)?.role || "none";
                  return (
                    <TableRow key={profile.id}>
                      <TableCell className="font-medium">{profile.display_name}</TableCell>
                      <TableCell className="text-muted-foreground">{profile.email || "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Select
                            value={currentRole}
                            onValueChange={(v) => handleRoleChange(profile.user_id, v)}
                            disabled={saving === profile.user_id}
                          >
                            <SelectTrigger className="h-8 w-[180px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sem perfil</SelectItem>
                              {(Object.entries(ROLE_LABELS) as [AppRole, string][]).map(([role, label]) => (
                                <SelectItem key={role} value={role}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {saving === profile.user_id && (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
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
