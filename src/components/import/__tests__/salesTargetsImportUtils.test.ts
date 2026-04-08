import { describe, expect, it } from "vitest";
import { autoMapColumns, SALES_TARGETS_DB_FIELDS } from "../importSchemas";
import {
  collectSalesTargetUnitCandidates,
  getSalesTargetCrmAssociationDecision,
} from "../salesTargetsImportUtils";

describe("salesTargetsImportUtils", () => {
  it("prefers CÓD UNIDADE over NOME UNIDADE in automapping", () => {
    const headers = ["NOME UNIDADE", "CÓD UNIDADE", "DONO DA META", "CÓD DONO DA META"];
    const mapping = autoMapColumns(headers, SALES_TARGETS_DB_FIELDS);

    expect(mapping[1]).toBe("unit_code");
    expect(mapping[0]).not.toBe("unit_code");
  });

  it("collects unit candidates with code before name", () => {
    const headers = ["NOME UNIDADE", "CÓD UNIDADE", "DONO DA META", "CÓD DONO DA META"];
    const row = ["TOTVS ZONA DA MATA MINEIRA", "TSE104", "WAGNER FERNANDES ZANONI", "T18041"];
    const fieldToCol = { unit_code: 0 };

    expect(collectSalesTargetUnitCandidates(row, headers, fieldToCol)).toEqual([
      "TSE104",
      "TOTVS ZONA DA MATA MINEIRA",
    ]);
  });

  it("queues CRM association when member exists by name with a new code", () => {
    const decision = getSalesTargetCrmAssociationDecision({
      incomingCode: "T18041",
      resolvedMemberId: "wagner-id",
      resolvedSource: "name",
      crmCodes: [{ code: "T13544", sales_team_id: "wagner-id" }],
    });

    expect(decision).toEqual({ shouldCreate: true, hasConflict: false });
  });

  it("does not queue CRM association when the same link already exists", () => {
    const decision = getSalesTargetCrmAssociationDecision({
      incomingCode: "T18041",
      resolvedMemberId: "wagner-id",
      resolvedSource: "name",
      crmCodes: [{ code: "T18041", sales_team_id: "wagner-id" }],
    });

    expect(decision).toEqual({ shouldCreate: false, hasConflict: false });
  });

  it("flags CRM conflicts when the code belongs to another member", () => {
    const decision = getSalesTargetCrmAssociationDecision({
      incomingCode: "T18041",
      resolvedMemberId: "wagner-id",
      resolvedSource: "name",
      crmCodes: [{ code: "T18041", sales_team_id: "other-member" }],
    });

    expect(decision).toEqual({ shouldCreate: false, hasConflict: true });
  });
});