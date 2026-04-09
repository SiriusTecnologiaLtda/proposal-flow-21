import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { ALL_RESOURCES, type AppRole } from "@/lib/permissions";

export function useUserRole() {
  const { user } = useAuth();

  const { data: role, isLoading: roleLoading } = useQuery({
    queryKey: ["user-role", user?.id],
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      if (error || !data?.length) return null;
      // Prioritize admin role when user has multiple roles
      const PRIORITY: AppRole[] = ["admin", "dsn", "gsn", "arquiteto", "vendedor", "consulta"];
      const roles = data.map((r: any) => r.role as AppRole);
      return PRIORITY.find((p) => roles.includes(p)) || roles[0];
    },
  });

  const { data: allowedResources = [], isLoading: permsLoading } = useQuery({
    queryKey: ["role-permissions", role],
    enabled: role !== undefined,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      if (!role) return ["dashboard", "propostas"];
      if (role === "admin" || role === "dsn") return ALL_RESOURCES;
      if (role === "consulta") return ["propostas"];
      const { data, error } = await supabase
        .from("role_permissions")
        .select("resource")
        .eq("role", role);
      if (error || !data?.length) return ["dashboard", "propostas"];
      return data.map((r: any) => r.resource as string);
    },
  });

  return {
    role: role ?? null,
    allowedResources,
    isLoading: roleLoading || permsLoading,
  };
}
