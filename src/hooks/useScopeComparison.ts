/**
 * useScopeComparison — Phase 1 Dual-Read comparator
 *
 * Computes LEGACY scope (from sales_team.linked_gsn_id / unit_id)
 * vs NEW scope (from sales_team_assignments + get_visible_sales_ids_v2)
 * for every member of the sales team.
 *
 * OBSERVATIONAL ONLY — consumed exclusively by the admin audit page.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSalesTeam } from "@/hooks/useSupabaseData";

export interface MemberScopeComparison {
  memberId: string;
  memberName: string;
  memberCode: string;
  memberRole: string;
  unitName: string | null;

  /** Legacy scope: IDs this member can see via linked_gsn_id logic */
  legacyIds: string[];

  /** New scope: IDs from sales_team_assignments */
  newIds: string[];

  /** IDs present in legacy but missing in new */
  missingInNew: string[];

  /** IDs present in new but not in legacy */
  extraInNew: string[];

  /** Whether both scopes produce the same set */
  match: boolean;
}

/**
 * Compute legacy scope for a single member using the same logic
 * currently in Dashboard.tsx (lines 492-525).
 */
function computeLegacyScope(
  memberId: string,
  salesTeam: Array<{
    id: string;
    role: string;
    linked_gsn_id: string | null;
    unit_id: string | null;
    name: string;
    code: string;
  }>
): string[] {
  const member = salesTeam.find((m) => m.id === memberId);
  if (!member) return [memberId];

  const role = member.role;

  if (role === "dsn") {
    // DSN sees: themselves + their GSNs + ESNs linked to those GSNs + all EVs
    const myGsns = salesTeam.filter(
      (m) => m.role === "gsn" && m.linked_gsn_id === memberId
    );
    const myGsnIds = myGsns.map((m) => m.id);
    const myEsns = salesTeam.filter(
      (m) => m.role === "esn" && myGsnIds.includes(m.linked_gsn_id || "")
    );
    const allEvs = salesTeam.filter((m) => m.role === "arquiteto");
    return [
      memberId,
      ...myGsnIds,
      ...myEsns.map((m) => m.id),
      ...allEvs.map((m) => m.id),
    ];
  }

  if (role === "gsn") {
    // GSN sees: themselves + their linked ESNs + all EVs
    const myEsns = salesTeam.filter(
      (m) => m.role === "esn" && m.linked_gsn_id === memberId
    );
    const allEvs = salesTeam.filter((m) => m.role === "arquiteto");
    return [memberId, ...myEsns.map((m) => m.id), ...allEvs.map((m) => m.id)];
  }

  // ESN / Arquiteto: sees only self
  return [memberId];
}

export function useScopeComparison() {
  const { data: salesTeam = [] } = useSalesTeam();

  // Fetch all assignments in a single query
  const { data: allAssignments = [] } = useQuery({
    queryKey: ["scope-audit-all-assignments"],
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_team_assignments" as any)
        .select("id, member_id, unit_id, role, reports_to_id, is_primary, active")
        .eq("active", true);
      if (error) throw error;
      return (data || []) as Array<{
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

  // Batch-fetch visible IDs for all members via individual RPC calls
  // (the SQL function handles hierarchy per member)
  const memberIds = salesTeam.map((m) => m.id);

  const { data: newScopeMap = {} } = useQuery({
    queryKey: ["scope-audit-visible-ids", memberIds.sort().join(",")],
    enabled: memberIds.length > 0,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const result: Record<string, string[]> = {};
      // Process in parallel batches of 10
      const batches: string[][] = [];
      for (let i = 0; i < memberIds.length; i += 10) {
        batches.push(memberIds.slice(i, i + 10));
      }
      for (const batch of batches) {
        const promises = batch.map(async (mid) => {
          const { data } = await supabase.rpc("get_visible_sales_ids_v2", {
            _member_id: mid,
          });
          return { mid, ids: (data as string[]) || [mid] };
        });
        const results = await Promise.all(promises);
        for (const r of results) {
          result[r.mid] = r.ids;
        }
      }
      return result;
    },
  });

  // Build comparison for each member
  const comparisons = useMemo((): MemberScopeComparison[] => {
    if (salesTeam.length === 0) return [];

    return salesTeam.map((member) => {
      const legacyIds = computeLegacyScope(member.id, salesTeam).sort();
      const newIds = (newScopeMap[member.id] || [member.id]).sort();

      const legacySet = new Set(legacyIds);
      const newSet = new Set(newIds);

      const missingInNew = legacyIds.filter((id) => !newSet.has(id));
      const extraInNew = newIds.filter((id) => !legacySet.has(id));

      return {
        memberId: member.id,
        memberName: member.name,
        memberCode: member.code,
        memberRole: member.role,
        unitName: (member as any).unit_info?.name || null,
        legacyIds,
        newIds,
        missingInNew,
        extraInNew,
        match: missingInNew.length === 0 && extraInNew.length === 0,
      };
    });
  }, [salesTeam, newScopeMap]);

  // Summary stats
  const summary = useMemo(() => {
    const total = comparisons.length;
    const matches = comparisons.filter((c) => c.match).length;
    const mismatches = comparisons.filter((c) => !c.match).length;
    return { total, matches, mismatches };
  }, [comparisons]);

  return { comparisons, summary, salesTeam };
}
