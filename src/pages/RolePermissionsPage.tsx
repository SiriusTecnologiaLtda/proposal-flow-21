import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { ROLE_LABELS, ALL_RESOURCES, RESOURCE_LABELS, type AppRole } from "@/lib/permissions";
import { useState } from "react";

export default function RolePermissionsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: rolePermissions = [] } = useQuery({
    queryKey: ["all-role-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("role_permissions").select("*");
      if (error) throw error;
      return data;
    },
  });

  const permSet = new Set(rolePermissions.map((p: any) => `${p.role}:${p.resource}`));
  const nonAdminRoles = (Object.keys(ROLE_LABELS) as AppRole[]).filter((r) => r !== "admin" && r !== "consulta");

  async function togglePermission(role: AppRole, resource: string, currentlyEnabled: boolean) {
    setSaving(true);
    try {
      if (currentlyEnabled) {
        const { error } = await supabase.from("role_permissions").delete().eq("role", role).eq("resource", resource);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("role_permissions").insert({ role, resource });
        if (error) throw error;
      }
      await qc.invalidateQueries({ queryKey: ["all-role-permissions"] });
      await qc.invalidateQueries({ queryKey: ["role-permissions"] });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/configuracoes/usuarios")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Permissões por Perfil</h1>
          <p className="text-sm text-muted-foreground">Marque os recursos que cada perfil pode acessar. Administradores sempre têm acesso total.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Matriz de Permissões
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Recurso</TableHead>
                  {nonAdminRoles.map((role) => (
                    <TableHead key={role} className="text-center w-[140px]">{ROLE_LABELS[role]}</TableHead>
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
                          <Checkbox checked={enabled} disabled={saving} onCheckedChange={() => togglePermission(role, resource, enabled)} />
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
    </div>
  );
}
