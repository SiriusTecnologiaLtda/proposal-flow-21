/**
 * useCommercialScope — Dual-read hook (Phase 1)
 *
 * Derives commercial visibility scope from the NEW `sales_team_assignments` table.
 *
 * Resolution chain:
 *   1. auth.user (Supabase Auth)
 *   2. profiles.sales_team_member_id (links auth user to sales_team)
 *   3. sales_team_assignments (role, unit_id, reports_to_id per unit)
 *   4. get_visible_sales_ids_v2() SQL function (hierarchical expansion)
 *
 * This hook is OBSERVATIONAL ONLY — it does NOT replace any existing logic.
 * It is consumed exclusively by the scope-audit admin page.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface CommercialScope {
  /** The sales_team.id linked to the authenticated user */
  memberId: string | null;
  /** Role(s) found in assignments */
  roles: string[];
  /** Unit IDs where this member has active assignments */
  unitIds: string[];
  /** All member IDs this user can see (hierarchical expansion) */
  visibleMemberIds: string[];
  /** Whether this user has unrestricted access (admin or not in sales_team) */
  isUnrestricted: boolean;
}

const EMPTY_SCOPE: CommercialScope = {
  memberId: null,
  roles: [],
  unitIds: [],
  visibleMemberIds: [],
  isUnrestricted: true,
};

/**
 * Derives scope for the CURRENT authenticated user from assignments.
 */
export function useCommercialScope() {
  const { user } = useAuth();

  // Step 1-2: auth user → profile → sales_team_member_id
  const { data: profile } = useQuery({
    queryKey: ["commercial-scope-profile", user?.id],
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

  // Step 3: sales_team_assignments for this member
  const { data: assignments = [] } = useQuery({
    queryKey: ["commercial-scope-assignments", memberId],
    enabled: !!memberId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sales_team_assignments")
        .select("id, member_id, unit_id, role, reports_to_id, is_primary, active")
        .eq("member_id", memberId!)
        .eq("active", true);
      if (error) throw error;
      return (data || []) as unknown as Array<{
        id: string;
        member_id: string;
        unit_id: string;
        role: string;
        reports_to_id: string | null;
        is_primary: boolean;
        active: boolean;
      }>;
    },
  });

  // Step 4: get_visible_sales_ids_v2 (SQL function)
  const { data: visibleIds = [] } = useQuery({
    queryKey: ["commercial-scope-visible", memberId],
    enabled: !!memberId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_visible_sales_ids_v2", {
        _member_id: memberId!,
      });
      if (error) throw error;
      return (data as string[]) || [];
    },
  });

  // Build scope object
  const scope: CommercialScope = !memberId
    ? EMPTY_SCOPE
    : {
        memberId,
        roles: [...new Set(assignments.map((a) => a.role))],
        unitIds: [...new Set(assignments.map((a) => a.unit_id))],
        visibleMemberIds: visibleIds.length > 0 ? visibleIds : [memberId],
        isUnrestricted: false,
      };

  return scope;
}

/**
 * Derives scope for ANY member (used by audit page to compare all members).
 * Does NOT depend on the current authenticated user.
 */
export function useCommercialScopeForMember(memberId: string | null) {
  const { data: assignments = [] } = useQuery({
    queryKey: ["commercial-scope-assignments", memberId],
    enabled: !!memberId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sales_team_assignments")
        .select("id, member_id, unit_id, role, reports_to_id, is_primary, active")
        .eq("member_id", memberId!)
        .eq("active", true);
      if (error) throw error;
      return (data || []) as unknown as Array<{
        id: string;
        member_id: string;
        unit_id: string;
        role: string;
        reports_to_id: string | null;
        is_primary: boolean;
        active: boolean;
      }>;
    },
  });

  const { data: visibleIds = [] } = useQuery({
    queryKey: ["commercial-scope-visible", memberId],
    enabled: !!memberId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_visible_sales_ids_v2", {
        _member_id: memberId!,
      });
      if (error) throw error;
      return (data as string[]) || [];
    },
  });

  if (!memberId) return null;

  return {
    memberId,
    roles: [...new Set(assignments.map((a) => a.role))],
    unitIds: [...new Set(assignments.map((a) => a.unit_id))],
    visibleMemberIds: visibleIds.length > 0 ? visibleIds : [memberId],
    isUnrestricted: false,
  } as CommercialScope;
}
