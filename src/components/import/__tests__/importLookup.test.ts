import { describe, it, expect } from "vitest";
import { findInList, findInListWithAlias, type AliasStore } from "../importSchemas";

// ─── Test data ──────────────────────────────────────────────────

const salesTeam = [
  { id: "id-joao", code: "001", name: "joão silva" },
  { id: "id-maria", code: "002", name: "maria souza" },
  { id: "id-pedro", code: "0050", name: "pedro santos" },
];

const units = [
  { id: "id-sp", code: "sp", name: "são paulo" },
  { id: "id-rj", code: "rj", name: "rio de janeiro" },
];

const crmCodes = [
  { code: "crm001", sales_team_id: "id-joao" },
  { code: "0099", sales_team_id: "id-maria" },
  { code: "00500", sales_team_id: "id-pedro" },
];

// ─── findInList ─────────────────────────────────────────────────

describe("findInList", () => {
  it("returns null for empty search", () => {
    expect(findInList(salesTeam, "")).toBeNull();
  });

  it("returns null for whitespace-only search", () => {
    expect(findInList(salesTeam, "   ")).toBeNull();
    expect(findInList(salesTeam, "\t")).toBeNull();
  });

  it("finds by exact code match", () => {
    expect(findInList(salesTeam, "001")).toBe("id-joao");
    expect(findInList(salesTeam, "002")).toBe("id-maria");
  });

  it("finds by exact name match", () => {
    expect(findInList(salesTeam, "joão silva")).toBe("id-joao");
    expect(findInList(salesTeam, "Maria Souza")).toBe("id-maria"); // case insensitive
  });

  it("finds by code without leading zeros", () => {
    expect(findInList(salesTeam, "1")).toBe("id-joao"); // "001" → "1"
    expect(findInList(salesTeam, "50")).toBe("id-pedro"); // "0050" → "50"
  });

  it("finds by CRM code", () => {
    expect(findInList(salesTeam, "crm001", crmCodes)).toBe("id-joao");
  });

  it("finds by CRM code without leading zeros", () => {
    expect(findInList(salesTeam, "99", crmCodes)).toBe("id-maria"); // "0099" → "99"
    expect(findInList(salesTeam, "500", crmCodes)).toBe("id-pedro"); // "00500" → "500"
  });

  it("CRM code only resolves if member exists in list", () => {
    const shortList = [{ id: "id-joao", code: "001", name: "joão silva" }];
    // crm "0099" points to id-maria which is NOT in shortList
    expect(findInList(shortList, "0099", crmCodes)).toBeNull();
  });

  it("falls back to partial match", () => {
    expect(findInList(salesTeam, "silva")).toBe("id-joao"); // partial name
  });

  it("returns null when nothing matches", () => {
    expect(findInList(salesTeam, "xyz999")).toBeNull();
  });

  it("works with unit list", () => {
    expect(findInList(units, "sp")).toBe("id-sp");
    expect(findInList(units, "São Paulo")).toBe("id-sp");
    expect(findInList(units, "rio de janeiro")).toBe("id-rj");
  });
});

// ─── findInListWithAlias ────────────────────────────────────────

describe("findInListWithAlias", () => {
  const aliases: AliasStore = {
    "clients:esn_code": {
      "vendedor antigo": "id-joao",
    },
  };

  it("resolves from alias store first", () => {
    expect(findInListWithAlias(salesTeam, "vendedor antigo", "clients:esn_code", aliases)).toBe("id-joao");
  });

  it("alias only resolves if member exists in list", () => {
    const aliasesWithGhost: AliasStore = {
      "clients:esn_code": { "fantasma": "id-nonexistent" },
    };
    expect(findInListWithAlias(salesTeam, "fantasma", "clients:esn_code", aliasesWithGhost)).toBeNull();
  });

  it("falls back to findInList when no alias match", () => {
    expect(findInListWithAlias(salesTeam, "001", "clients:esn_code", aliases)).toBe("id-joao");
  });

  it("falls back to CRM codes when alias doesn't match", () => {
    expect(findInListWithAlias(salesTeam, "crm001", "clients:esn_code", aliases, crmCodes)).toBe("id-joao");
  });

  it("returns null for empty search", () => {
    expect(findInListWithAlias(salesTeam, "", "clients:esn_code", aliases)).toBeNull();
  });
});

// ─── Lookup priority chain ──────────────────────────────────────

describe("Lookup priority chain", () => {
  it("priority: exact code → exact name → stripped code → CRM → partial", () => {
    // When exact code matches, it takes priority
    const list = [
      { id: "id-a", code: "abc", name: "xyz" },
      { id: "id-b", code: "xyz", name: "abc" },
    ];
    expect(findInList(list, "abc")).toBe("id-a"); // exact code, not name
  });

  it("multiple CRM codes pointing to same member", () => {
    const multiCrm = [
      { code: "crm-a", sales_team_id: "id-joao" },
      { code: "crm-b", sales_team_id: "id-joao" },
    ];
    expect(findInList(salesTeam, "crm-a", multiCrm)).toBe("id-joao");
    expect(findInList(salesTeam, "crm-b", multiCrm)).toBe("id-joao");
  });

  it("import without CRM codes still works", () => {
    expect(findInList(salesTeam, "001")).toBe("id-joao");
    expect(findInList(salesTeam, "001", undefined)).toBe("id-joao");
  });
});
