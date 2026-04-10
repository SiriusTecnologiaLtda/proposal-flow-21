/**
 * Shared revenue classification logic for Dashboard KPIs.
 *
 * Official segregation rules:
 * - SCS, RRF, NRF are individualised KPIs
 * - Produção must NOT absorb SCS, RRF or NRF
 * - Recorrente must NOT absorb RRF or SCS
 * - Não Recorrente must NOT absorb NRF
 */

export const PRODUCTION_DIVISOR = 21.82;

export type RevenueLineTotals = {
  producao: number;
  recorrente: number;
  nao_recorrente: number;
  servico: number;
  rrf: number;
  nrf: number;
};

export function createEmptyLineTotals(): RevenueLineTotals {
  return { producao: 0, recorrente: 0, nao_recorrente: 0, servico: 0, rrf: 0, nrf: 0 };
}

export function normalizeCategoryName(name?: string | null): string {
  return (name || "").trim().toUpperCase();
}

/**
 * Classify a single item's value into the correct revenue line.
 * Returns which line(s) received the value and how much was added to
 * eligible capex/opex (for Produção calculation).
 */
export interface ClassifiedItem {
  line: "rrf" | "nrf" | "recorrente" | "nao_recorrente" | "skip";
  /** Amount eligible for Produção opex bucket (1:1) */
  eligibleOpex: number;
  /** Amount eligible for Produção capex bucket (/21.82) */
  eligibleCapex: number;
}

export function classifyRevenueItem(
  categoryName: string,
  costClassification: string | null,
  recurrence: string | null,
  price: number,
): ClassifiedItem {
  // RRF → individual KPI, NOT eligible for Produção
  if (categoryName === "RRF") {
    return { line: "rrf", eligibleOpex: 0, eligibleCapex: 0 };
  }

  // NRF / RNF → individual KPI, NOT eligible for Produção
  if (categoryName === "NRF" || categoryName === "RNF") {
    return { line: "nrf", eligibleOpex: 0, eligibleCapex: 0 };
  }

  // SCS is handled via service proposals, never via software items
  // If for some reason a SW item has category SCS, skip it from SW lines
  if (categoryName === "SCS") {
    return { line: "skip", eligibleOpex: 0, eligibleCapex: 0 };
  }

  // Regular item → eligible for Produção
  const eligibleOpex = costClassification === "opex" ? price : 0;
  const eligibleCapex = costClassification === "capex" ? price : 0;

  if (recurrence && ["monthly", "annual"].includes(recurrence)) {
    return { line: "recorrente", eligibleOpex, eligibleCapex };
  }

  if (recurrence === "one_time") {
    return { line: "nao_recorrente", eligibleOpex, eligibleCapex };
  }

  // No recurrence → skip Recorrente/Não Recorrente but still eligible for Produção
  return { line: "skip", eligibleOpex, eligibleCapex };
}

/**
 * Build revenue line totals from a set of software proposal items.
 *
 * @param items - Array of software_proposal_items with total_price, cost_classification, recurrence, catalog_item_id
 * @param catalogCategoryMap - Map<catalog_item_id, category_id>
 * @param categoryById - Map<category_id, {name, cost_classification}>
 * @param selectedCategoryId - "all" or a specific category ID filter
 */
export function buildSoftwareLineTotals(
  items: any[],
  catalogCategoryMap: Map<string, string | null>,
  categoryById: Map<string, { id: string; name: string; cost_classification: string }>,
  selectedCategoryId: string,
): RevenueLineTotals {
  const totals = createEmptyLineTotals();
  let eligibleCapex = 0;
  let eligibleOpex = 0;

  for (const item of items) {
    const categoryId = item.catalog_item_id ? catalogCategoryMap.get(item.catalog_item_id) ?? null : null;
    if (selectedCategoryId !== "all" && categoryId !== selectedCategoryId) continue;

    const category = categoryId ? categoryById.get(categoryId) : null;
    const categoryName = normalizeCategoryName(category?.name);
    const costClassification = item.cost_classification || category?.cost_classification || null;
    const price = Number(item.total_price) || 0;
    if (!price) continue;

    const classified = classifyRevenueItem(categoryName, costClassification, item.recurrence, price);

    // Add to the specific line
    if (classified.line !== "skip") {
      totals[classified.line] += price;
    }

    // Accumulate eligible amounts for Produção (excludes RRF, NRF, SCS)
    eligibleCapex += classified.eligibleCapex;
    eligibleOpex += classified.eligibleOpex;
  }

  // Produção = eligible Opex (1:1) + eligible Capex (/21.82)
  totals.producao = eligibleOpex + (eligibleCapex / PRODUCTION_DIVISOR);

  return totals;
}

/**
 * Add a sales target amount to the correct revenue line totals.
 * Used for META calculation.
 *
 * Respects the same segregation: RRF/NRF/SCS are individual and
 * do NOT flow into Produção.
 */
export function addTargetAmountToLines(
  lines: RevenueLineTotals,
  amount: number,
  category?: { name?: string | null; cost_classification?: string | null } | null,
): void {
  const categoryName = normalizeCategoryName(category?.name);
  const costClassification = category?.cost_classification || null;

  // SCS → servico only
  if (categoryName === "SCS") {
    lines.servico += amount;
    return;
  }

  // RRF → rrf only (NOT Produção)
  if (categoryName === "RRF") {
    lines.rrf += amount;
    return;
  }

  // NRF/RNF → nrf only (NOT Produção)
  if (categoryName === "NRF" || categoryName === "RNF") {
    lines.nrf += amount;
    return;
  }

  // Regular opex → Recorrente + Produção
  if (costClassification === "opex") {
    lines.recorrente += amount;
    lines.producao += amount;
    return;
  }

  // Regular capex → Não Recorrente + Produção(/21.82)
  if (costClassification === "capex") {
    lines.nao_recorrente += amount;
    lines.producao += amount / PRODUCTION_DIVISOR;
  }
}
