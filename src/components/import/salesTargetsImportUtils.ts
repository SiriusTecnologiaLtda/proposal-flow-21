import { normalize } from "./importSchemas";

type MatchSource = "crm" | "code" | "name" | null | undefined;

const UNIT_CODE_HEADERS = new Set(["codunidade", "codigounidade"]);
const UNIT_NAME_HEADERS = new Set(["nomeunidade", "unidade", "unit"]);

const getCellString = (row: any[], index: number | undefined): string => {
  if (index == null || index < 0 || index >= row.length) return "";
  const value = row[index];
  return value == null ? "" : String(value).trim();
};

const getUnitHeaderPriority = (header: string): number | null => {
  const normalized = normalize(header || "");
  if (UNIT_CODE_HEADERS.has(normalized)) return 0;
  if (UNIT_NAME_HEADERS.has(normalized)) return 2;
  return null;
};

export function collectSalesTargetUnitCandidates(
  row: any[],
  headers: string[],
  fieldToCol: Record<string, number>,
): string[] {
  const mappedUnitIndex = fieldToCol["unit_code"];
  const candidates: { index: number; priority: number; value: string }[] = [];
  const seen = new Set<string>();

  const pushCandidate = (value: string, priority: number, index: number) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ value: trimmed, priority, index });
  };

  if (mappedUnitIndex !== undefined) {
    const mappedValue = getCellString(row, mappedUnitIndex);
    const mappedPriority = getUnitHeaderPriority(headers[mappedUnitIndex] || "") ?? 1;
    pushCandidate(mappedValue, mappedPriority, mappedUnitIndex);
  }

  headers.forEach((header, index) => {
    if (index === mappedUnitIndex) return;
    const priority = getUnitHeaderPriority(header);
    if (priority == null) return;
    pushCandidate(getCellString(row, index), priority, index);
  });

  return candidates
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .map((candidate) => candidate.value);
}

export function getSalesTargetCrmAssociationDecision(params: {
  incomingCode: string;
  resolvedMemberId: string | null | undefined;
  resolvedSource: MatchSource;
  crmCodes: { code: string; sales_team_id: string }[];
}): { hasConflict: boolean; shouldCreate: boolean } {
  const normalizedCode = params.incomingCode.trim().toLowerCase();

  if (!normalizedCode || !params.resolvedMemberId) {
    return { shouldCreate: false, hasConflict: false };
  }

  if (params.resolvedSource === "crm") {
    return { shouldCreate: false, hasConflict: false };
  }

  const sameMemberAssociation = params.crmCodes.some((crm) =>
    crm.sales_team_id === params.resolvedMemberId && crm.code.trim().toLowerCase() === normalizedCode,
  );

  if (sameMemberAssociation) {
    return { shouldCreate: false, hasConflict: false };
  }

  const conflictingAssociation = params.crmCodes.some((crm) =>
    crm.sales_team_id !== params.resolvedMemberId && crm.code.trim().toLowerCase() === normalizedCode,
  );

  if (conflictingAssociation) {
    return { shouldCreate: false, hasConflict: true };
  }

  return { shouldCreate: true, hasConflict: false };
}