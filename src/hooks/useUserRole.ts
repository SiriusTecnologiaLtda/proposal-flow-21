import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { ALL_RESOURCES, type AppRole } from "@/lib/permissions";

export function useUserRole() {
  const { user } = useAuth();

  const { data: role, isLoading: roleLoading } = useQuery({
    queryKey: ["user-role", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error || !data) return null;
      return data.role as AppRole;
    },
  });

  const { data: allowedResources = [], isLoading: permsLoading } = useQuery({
    queryKey: ["role-permissions", role],
    enabled: role !== undefined,
    queryFn: async () => {
      if (!role) return ["dashboard", "propostas"];
      if (role === "admin") return ALL_RESOURCES;
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
