/**
 * useScopeComparison — Phase 1 Dual-Read comparator
 *
 * Computes LEGACY scope (from sales_team.linked_gsn_id / unit_id)
 * vs NEW scope (from sales_team_assignments + get_visible_sales_ids_v2)
 * for every member of the sales team.
 *
 * Also computes a TARGET scope (legacy minus global EVs) to classify
 * divergences as "acceptable by design" vs "real issue".
 *
 * OBSERVATIONAL ONLY — consumed exclusively by the admin audit page.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSalesTeam } from "@/hooks/useSupabaseData";

export type DivergenceClassification = "match" | "acceptable" | "real_issue";

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

  /** Target scope: legacy minus global EVs (the intended future state) */
  targetIds: string[];

  /** IDs present in legacy but missing in new */
  missingInNew: string[];

  /** IDs present in new but not in legacy */
  extraInNew: string[];

  /** Whether both scopes produce the same set */
  match: boolean;

  /** Classification after applying business rules */
  classification: DivergenceClassification;

  /** Human-readable reasons for divergence */
  divergenceReasons: string[];

  /** Whether new scope matches the TARGET (post-rule-change) scope */
  matchesTarget: boolean;
}

/**
 * Compute legacy scope for a single member using the same logic
 * currently in Dashboard.tsx.
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
    const myEsns = salesTeam.filter(
      (m) => m.role === "esn" && m.linked_gsn_id === memberId
    );
    const allEvs = salesTeam.filter((m) => m.role === "arquiteto");
    return [memberId, ...myEsns.map((m) => m.id), ...allEvs.map((m) => m.id)];
  }

  return [memberId];
}

/**
 * Compute TARGET scope: same as legacy but WITHOUT global EV inclusion.
 * This represents the intended future behavior.
 */
function computeTargetScope(
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
    const myGsns = salesTeam.filter(
      (m) => m.role === "gsn" && m.linked_gsn_id === memberId
    );
    const myGsnIds = myGsns.map((m) => m.id);
    const myEsns = salesTeam.filter(
      (m) => m.role === "esn" && myGsnIds.includes(m.linked_gsn_id || "")
    );
    // NO global EVs — this is the key difference
    return [memberId, ...myGsnIds, ...myEsns.map((m) => m.id)];
  }

  if (role === "gsn") {
    const myEsns = salesTeam.filter(
      (m) => m.role === "esn" && m.linked_gsn_id === memberId
    );
    // NO global EVs
    return [memberId, ...myEsns.map((m) => m.id)];
  }

  return [memberId];
}

/**
 * Classify divergence between legacy, new, and target scopes.
 */
function classifyDivergence(
  legacyIds: string[],
  newIds: string[],
  targetIds: string[],
  evIds: Set<string>
): { classification: DivergenceClassification; reasons: string[] } {
  const legacySet = new Set(legacyIds);
  const newSet = new Set(newIds);
  const targetSet = new Set(targetIds);

  // Perfect match with legacy
  if (
    legacyIds.length === newIds.length &&
    legacyIds.every((id) => newSet.has(id))
  ) {
    return { classification: "match", reasons: [] };
  }

  const reasons: string[] = [];

  // Check if missing IDs are all EVs (acceptable — rule change)
  const missingInNew = legacyIds.filter((id) => !newSet.has(id));
  const missingEvs = missingInNew.filter((id) => evIds.has(id));
  const missingNonEvs = missingInNew.filter((id) => !evIds.has(id));

  if (missingEvs.length > 0) {
    reasons.push(
      `${missingEvs.length} EV(s) removido(s) do escopo global (regra corrigida)`
    );
  }

  // Check extra IDs in new (DSN expansion — acceptable)
  const extraInNew = newIds.filter((id) => !legacySet.has(id));
  if (extraInNew.length > 0) {
    reasons.push(
      `${extraInNew.length} membro(s) extra(s) por expansão correta da hierarquia`
    );
  }

  if (missingNonEvs.length > 0) {
    reasons.push(
      `${missingNonEvs.length} membro(s) não-EV ausente(s) no escopo novo (divergência real)`
    );
    return { classification: "real_issue", reasons };
  }

  // Check if new matches target
  const matchesTarget =
    targetIds.length === newIds.length &&
    targetIds.every((id) => newSet.has(id)) &&
    newIds.every((id) => targetSet.has(id));

  if (matchesTarget) {
    return { classification: "acceptable", reasons };
  }

  // New has more than target but no missing non-EVs — acceptable expansion
  if (missingNonEvs.length === 0) {
    return { classification: "acceptable", reasons };
  }

  return { classification: "real_issue", reasons };
}

export function useScopeComparison() {
  const { data: salesTeam = [] } = useSalesTeam();

  // Fetch all assignments in a single query
  const { data: allAssignments = [] } = useQuery({
    queryKey: ["scope-audit-all-assignments"],
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sales_team_assignments")
        .select(
          "id, member_id, unit_id, role, reports_to_id, is_primary, active"
        )
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

  // Batch-fetch visible IDs for all members via individual RPC calls
  const memberIds = salesTeam.map((m) => m.id);

  const { data: newScopeMap = {} } = useQuery({
    queryKey: ["scope-audit-visible-ids", memberIds.sort().join(",")],
    enabled: memberIds.length > 0,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const result: Record<string, string[]> = {};
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

  // EV IDs set for classification
  const evIds = useMemo(
    () => new Set(salesTeam.filter((m) => m.role === "arquiteto").map((m) => m.id)),
    [salesTeam]
  );

  // Orphaned ESNs (no reports_to in assignments)
  const orphanedEsnIds = useMemo(() => {
    const esnsInAssignments = allAssignments.filter((a) => a.role === "esn");
    return new Set(
      esnsInAssignments
        .filter((a) => !a.reports_to_id)
        .map((a) => a.member_id)
    );
  }, [allAssignments]);

  // Build comparison for each member
  const comparisons = useMemo((): MemberScopeComparison[] => {
    if (salesTeam.length === 0) return [];

    return salesTeam.map((member) => {
      const legacyIds = computeLegacyScope(member.id, salesTeam).sort();
      const newIds = (newScopeMap[member.id] || [member.id]).sort();
      const targetIds = computeTargetScope(member.id, salesTeam).sort();

      const legacySet = new Set(legacyIds);
      const newSet = new Set(newIds);
      const targetSet = new Set(targetIds);

      const missingInNew = legacyIds.filter((id) => !newSet.has(id));
      const extraInNew = newIds.filter((id) => !legacySet.has(id));

      const match = missingInNew.length === 0 && extraInNew.length === 0;

      const matchesTarget =
        targetIds.every((id) => newSet.has(id)) &&
        newIds.every((id) => targetSet.has(id));

      const { classification, reasons } = classifyDivergence(
        legacyIds,
        newIds,
        targetIds,
        evIds
      );

      return {
        memberId: member.id,
        memberName: member.name,
        memberCode: member.code,
        memberRole: member.role,
        unitName: (member as any).unit_info?.name || null,
        legacyIds,
        newIds,
        targetIds,
        missingInNew,
        extraInNew,
        match,
        classification,
        divergenceReasons: reasons,
        matchesTarget,
      };
    });
  }, [salesTeam, newScopeMap, evIds]);

  // Summary stats
  const summary = useMemo(() => {
    const total = comparisons.length;
    const matches = comparisons.filter((c) => c.match).length;
    const mismatches = comparisons.filter((c) => !c.match).length;
    const acceptable = comparisons.filter(
      (c) => c.classification === "acceptable"
    ).length;
    const realIssues = comparisons.filter(
      (c) => c.classification === "real_issue"
    ).length;
    const matchesTarget = comparisons.filter((c) => c.matchesTarget).length;
    return { total, matches, mismatches, acceptable, realIssues, matchesTarget };
  }, [comparisons]);

  return { comparisons, summary, salesTeam, orphanedEsnIds };
}
