/**
 * useVisibleSalesScope — Resolves visible sales team member IDs
 * for the current authenticated user using the NEW assignment-based hierarchy.
 *
 * Resolution chain:
 *   1. auth.user (Supabase Auth) → useAuth()
 *   2. profiles.sales_team_member_id → links auth user to sales_team
 *   3. get_visible_sales_ids_v2() SQL function → hierarchical expansion via assignments
 *
 * Returns:
 *   - visibleIds: string[] | null  (null = unrestricted / admin)
 *   - memberId: string | null
 *   - isUnrestricted: boolean
 *   - isLoading: boolean
 *
 * This hook does NOT replace any existing logic by itself.
 * It is consumed by Dashboard and SalesTargets only when the corresponding
 * feature flag is enabled.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface VisibleSalesScope {
  /** The sales_team.id linked to the authenticated user, or null if not in sales team */
  memberId: string | null;
  /** Expanded list of visible member IDs, or null if unrestricted (admin) */
  visibleIds: string[] | null;
  /** Whether the user has full unrestricted access */
  isUnrestricted: boolean;
  /** Whether the scope is still loading */
  isLoading: boolean;
}

export function useVisibleSalesScope(): VisibleSalesScope {
  const { user, isAdmin } = useAuth();

  // Step 1-2: auth user → profile → sales_team_member_id
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["visible-scope-profile", user?.id],
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("sales_team_member_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const memberId = profile?.sales_team_member_id || null;

  // Admin or user not linked to sales team → unrestricted
  const isUnrestricted = isAdmin || !memberId;

  // Step 3: get_visible_sales_ids_v2 (only for sales team members)
  const { data: visibleIds, isLoading: scopeLoading } = useQuery({
    queryKey: ["visible-scope-ids", memberId],
    enabled: !!memberId && !isUnrestricted,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_visible_sales_ids_v2", {
        _member_id: memberId!,
      });
      if (error) throw error;
      return (data as string[]) || [memberId!];
    },
  });

  return useMemo(
    () => ({
      memberId,
      visibleIds: isUnrestricted ? null : (visibleIds ?? (memberId ? [memberId] : null)),
      isUnrestricted,
      isLoading: profileLoading || (!isUnrestricted && scopeLoading),
    }),
    [memberId, visibleIds, isUnrestricted, profileLoading, scopeLoading]
  );
}
