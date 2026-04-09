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
} as const;
