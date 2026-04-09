/**
 * Feature flags for progressive activation of new commercial scope.
 *
 * When a flag is `false`, the legacy scope logic is used.
 * When `true`, the new scope from `sales_team_assignments` + `get_visible_sales_ids_v2` is used.
 *
 * Rollback: set the flag back to `false` — no migration or deploy needed.
 */
export const FEATURE_FLAGS = {
  /**
   * Dashboard: use new scope (sales_team_assignments) instead of legacy (linked_gsn_id).
   * Affects: hierarchyScopedIds in Dashboard.tsx
   */
  useNewScopeDashboard: true,

  /**
   * Sales Targets: use new scope to filter visible members.
   * Affects: member visibility in SalesTargetsPage.tsx
   */
  useNewScopeSalesTargets: true,

  /**
   * Clients: use new scope to filter visible clients.
   * Rule: client visible if esn_id OR gsn_id in visibleIds.
   * Unassigned clients (no esn_id AND no gsn_id) visible to users with functional access.
   * Affects: filtering in ClientsList.tsx
   */
  useNewScopeClients: true,
} as const;
