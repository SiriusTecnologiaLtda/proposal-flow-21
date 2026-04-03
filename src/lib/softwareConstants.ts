/**
 * Shared constants for the Software Proposals module.
 * Used by Catalog, Proposal Detail, Extraction Rules, etc.
 */

export const RECURRENCE_OPTIONS = [
  { value: "one_time", label: "Único" },
  { value: "monthly", label: "Mensal" },
  { value: "annual", label: "Anual" },
  { value: "usage_based", label: "Sob demanda" },
  { value: "measurement", label: "Medição" },
] as const;

export const COST_CLASSIFICATION_OPTIONS = [
  { value: "opex", label: "Opex" },
  { value: "capex", label: "Capex" },
  { value: "other", label: "Outros" },
] as const;

export const getRecurrenceLabel = (value: string): string =>
  RECURRENCE_OPTIONS.find((r) => r.value === value)?.label || value;

export const getCostClassificationLabel = (value: string): string =>
  COST_CLASSIFICATION_OPTIONS.find((c) => c.value === value)?.label || value;
