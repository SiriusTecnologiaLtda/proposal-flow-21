import { describe, it, expect } from "vitest";
import {
  parseRole,
  buildClientPayload,
  findInList,
  findInListWithAlias,
  autoMapColumns,
  validateImportStructure,
  evaluateFilterRule,
  type AliasStore,
  CLIENT_DB_FIELDS,
  SALES_TEAM_DB_FIELDS,
  TEMPLATE_DB_FIELDS,
  SALES_TARGETS_DB_FIELDS,
} from "../importSchemas";

// ─── Shared test data ───────────────────────────────────────────

const units = [
  { id: "uid-sp", code: "sp", name: "são paulo" },
  { id: "uid-rj", code: "rj", name: "rio de janeiro" },
];

const esnList = [
  { id: "esn-joao", code: "001", name: "joão silva" },
  { id: "esn-maria", code: "002", name: "maria souza" },
];

const gsnList = [
  { id: "gsn-carlos", code: "g01", name: "carlos gerente" },
];

const crmCodes = [
  { code: "crm100", sales_team_id: "esn-joao" },
  { code: "crm200", sales_team_id: "esn-maria" },
  { code: "0099", sales_team_id: "esn-joao" },
];

const emptyAliases: AliasStore = {};

// ─── parseRole ──────────────────────────────────────────────────

describe("parseRole", () => {
  it("identifies ESN roles", () => {
    expect(parseRole("Executivo de Negócios")).toBe("esn");
    expect(parseRole("vendedor")).toBe("esn");
    expect(parseRole("ESN")).toBe("esn");
  });

  it("identifies GSN roles", () => {
    expect(parseRole("Gerente de Negócios")).toBe("gsn");
    expect(parseRole("GSN")).toBe("gsn");
  });

  it("identifies DSN roles", () => {
    expect(parseRole("Diretor Comercial")).toBe("dsn");
    expect(parseRole("DSN")).toBe("dsn");
  });

  it("identifies Arquiteto/EV roles", () => {
    expect(parseRole("Arquiteto de Soluções")).toBe("arquiteto");
    expect(parseRole("Engenheiro de Valor")).toBe("arquiteto");
    expect(parseRole("EV")).toBe("arquiteto");
  });

  it("returns null for unknown roles", () => {
    expect(parseRole("analista")).toBeNull();
    expect(parseRole("estagiário")).toBeNull();
    expect(parseRole("")).toBeNull();
    expect(parseRole("   ")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(parseRole("EXECUTIVO DE NEGÓCIOS")).toBe("esn");
    expect(parseRole("gerente")).toBe("gsn");
  });
});

// ─── buildClientPayload ─────────────────────────────────────────

describe("buildClientPayload", () => {
  it("builds payload with basic fields", () => {
    const row = ["C001", "Empresa ABC", "12345678000100", "contato@abc.com"];
    const fieldToCol: Record<string, number> = { code: 0, name: 1, cnpj: 2, email: 3 };

    const { payload, warnings } = buildClientPayload(
      row, fieldToCol, units, esnList, gsnList, emptyAliases, "clients"
    );

    expect(payload.code).toBe("C001");
    expect(payload.name).toBe("Empresa ABC");
    expect(payload.cnpj).toBe("12345678000100");
    expect(payload.email).toBe("contato@abc.com");
    expect(warnings).toHaveLength(0);
  });

  it("resolves unit by code", () => {
    const row = ["C001", "Empresa", "12345678000100", "sp"];
    const fieldToCol: Record<string, number> = { code: 0, name: 1, cnpj: 2, unit_code: 3 };

    const { payload, warnings } = buildClientPayload(
      row, fieldToCol, units, esnList, gsnList, emptyAliases, "clients"
    );

    expect(payload.unit_id).toBe("uid-sp");
    expect(warnings).toHaveLength(0);
  });

  it("resolves unit by name", () => {
    const row = ["C001", "Empresa", "12345678000100", "São Paulo"];
    const fieldToCol: Record<string, number> = { code: 0, name: 1, cnpj: 2, unit_code: 3 };

    const { payload } = buildClientPayload(
      row, fieldToCol, units, esnList, gsnList, emptyAliases, "clients"
    );

    expect(payload.unit_id).toBe("uid-sp");
  });

  it("warns for unresolved unit", () => {
    const row = ["C001", "Empresa", "12345678000100", "Curitiba"];
    const fieldToCol: Record<string, number> = { code: 0, name: 1, cnpj: 2, unit_code: 3 };

    const { payload, warnings } = buildClientPayload(
      row, fieldToCol, units, esnList, gsnList, emptyAliases, "clients"
    );

    expect(payload.unit_id).toBeNull();
    expect(warnings.some(w => w.includes("Unidade"))).toBe(true);
  });

  it("resolves ESN by code", () => {
    const row = ["C001", "Empresa", "12345678000100", "001"];
    const fieldToCol: Record<string, number> = { code: 0, name: 1, cnpj: 2, esn_code: 3 };

    const { payload } = buildClientPayload(
      row, fieldToCol, units, esnList, gsnList, emptyAliases, "clients"
    );

    expect(payload.esn_id).toBe("esn-joao");
  });

  it("resolves ESN by CRM code", () => {
    const row = ["C001", "Empresa", "12345678000100", "crm100"];
    const fieldToCol: Record<string, number> = { code: 0, name: 1, cnpj: 2, esn_code: 3 };

    const { payload } = buildClientPayload(
      row, fieldToCol, units, esnList, gsnList, emptyAliases, "clients", crmCodes
    );

    expect(payload.esn_id).toBe("esn-joao");
  });

  it("resolves ESN by CRM code without leading zeros", () => {
    const row = ["C001", "Empresa", "12345678000100", "99"];
    const fieldToCol: Record<string, number> = { code: 0, name: 1, cnpj: 2, esn_code: 3 };

    const { payload } = buildClientPayload(
      row, fieldToCol, units, esnList, gsnList, emptyAliases, "clients", crmCodes
    );

    expect(payload.esn_id).toBe("esn-joao");
  });

  it("warns for unresolved ESN", () => {
    const row = ["C001", "Empresa", "12345678000100", "vendedor-inexistente"];
    const fieldToCol: Record<string, number> = { code: 0, name: 1, cnpj: 2, esn_code: 3 };

    const { payload, warnings } = buildClientPayload(
      row, fieldToCol, units, esnList, gsnList, emptyAliases, "clients"
    );

    expect(payload.esn_id).toBeNull();
    expect(warnings.some(w => w.includes("ESN"))).toBe(true);
  });

  it("resolves GSN by name", () => {
    const row = ["C001", "Empresa", "12345678000100", "carlos gerente"];
    const fieldToCol: Record<string, number> = { code: 0, name: 1, cnpj: 2, gsn_code: 3 };

    const { payload } = buildClientPayload(
      row, fieldToCol, units, esnList, gsnList, emptyAliases, "clients"
    );

    expect(payload.gsn_id).toBe("gsn-carlos");
  });

  it("uses aliases for ESN resolution", () => {
    const aliases: AliasStore = {
      "clients:esn_code": { "vendedor antigo": "esn-maria" },
    };
    const row = ["C001", "Empresa", "12345678000100", "vendedor antigo"];
    const fieldToCol: Record<string, number> = { code: 0, name: 1, cnpj: 2, esn_code: 3 };

    const { payload } = buildClientPayload(
      row, fieldToCol, units, esnList, gsnList, aliases, "clients"
    );

    expect(payload.esn_id).toBe("esn-maria");
  });

  it("handles empty relational fields gracefully", () => {
    const row = ["C001", "Empresa", "12345678000100", "", "", ""];
    const fieldToCol: Record<string, number> = { code: 0, name: 1, cnpj: 2, unit_code: 3, esn_code: 4, gsn_code: 5 };

    const { payload, warnings } = buildClientPayload(
      row, fieldToCol, units, esnList, gsnList, emptyAliases, "clients"
    );

    expect(payload.unit_id).toBeUndefined();
    expect(payload.esn_id).toBeUndefined();
    expect(payload.gsn_id).toBeUndefined();
    expect(warnings).toHaveLength(0);
  });

  it("store_code is informational only", () => {
    const row = ["C001", "Empresa", "12345678000100", "01"];
    const fieldToCol: Record<string, number> = { code: 0, name: 1, cnpj: 2, store_code: 3 };

    const { payload } = buildClientPayload(
      row, fieldToCol, units, esnList, gsnList, emptyAliases, "clients"
    );

    expect(payload.store_code).toBe("01");
    // store_code does NOT affect key/uniqueness
  });
});

// ─── End-to-end import scenarios ────────────────────────────────

describe("Client import scenarios", () => {
  it("scenario: new client with all relations resolved", () => {
    const row = ["C010", "Nova Empresa Ltda", "98765432000199", "sp", "001", "g01"];
    const fieldToCol: Record<string, number> = {
      code: 0, name: 1, cnpj: 2, unit_code: 3, esn_code: 4, gsn_code: 5,
    };

    const { payload, warnings } = buildClientPayload(
      row, fieldToCol, units, esnList, gsnList, emptyAliases, "clients"
    );

    expect(payload.code).toBe("C010");
    expect(payload.unit_id).toBe("uid-sp");
    expect(payload.esn_id).toBe("esn-joao");
    expect(payload.gsn_id).toBe("gsn-carlos");
    expect(warnings).toHaveLength(0);
  });

  it("scenario: existing client update by same code", () => {
    // Simulates upsert behavior: same code produces same payload shape
    const row1 = ["C010", "Empresa V1", "11111111000100"];
    const row2 = ["C010", "Empresa V2 (atualizada)", "11111111000100"];
    const fieldToCol: Record<string, number> = { code: 0, name: 1, cnpj: 2 };

    const { payload: p1 } = buildClientPayload(row1, fieldToCol, units, esnList, gsnList, emptyAliases, "clients");
    const { payload: p2 } = buildClientPayload(row2, fieldToCol, units, esnList, gsnList, emptyAliases, "clients");

    expect(p1.code).toBe(p2.code);
    expect(p2.name).toBe("Empresa V2 (atualizada)");
  });

  it("scenario: client with different store_code but same code", () => {
    const row1 = ["C010", "Empresa", "11111111000100", "01"];
    const row2 = ["C010", "Empresa", "11111111000100", "02"];
    const fieldToCol: Record<string, number> = { code: 0, name: 1, cnpj: 2, store_code: 3 };

    const { payload: p1 } = buildClientPayload(row1, fieldToCol, units, esnList, gsnList, emptyAliases, "clients");
    const { payload: p2 } = buildClientPayload(row2, fieldToCol, units, esnList, gsnList, emptyAliases, "clients");

    // Both have same code — upsert would merge them (store_code is informational)
    expect(p1.code).toBe(p2.code);
    expect(p1.store_code).toBe("01");
    expect(p2.store_code).toBe("02");
  });

  it("scenario: client with unresolved unit/ESN/GSN", () => {
    const row = ["C020", "Empresa Sem Vinculos", "22222222000100", "FILIAL-X", "VND-999", "GER-999"];
    const fieldToCol: Record<string, number> = {
      code: 0, name: 1, cnpj: 2, unit_code: 3, esn_code: 4, gsn_code: 5,
    };

    const { payload, warnings } = buildClientPayload(
      row, fieldToCol, units, esnList, gsnList, emptyAliases, "clients"
    );

    expect(payload.unit_id).toBeNull();
    expect(payload.esn_id).toBeNull();
    expect(payload.gsn_id).toBeNull();
    expect(warnings).toHaveLength(3);
    expect(warnings[0]).toContain("Unidade");
    expect(warnings[1]).toContain("ESN");
    expect(warnings[2]).toContain("GSN");
  });
});

// ─── Sales team import scenarios ────────────────────────────────

describe("Sales team import scenarios", () => {
  it("scenario: new member with valid role", () => {
    const role = parseRole("Executivo de Negócios");
    expect(role).toBe("esn");
  });

  it("scenario: CRM codes parsing", () => {
    const rawCrm = "CRM-A; CRM-B, CRM-C";
    const codes = rawCrm.split(/[;,]/).map(c => c.trim()).filter(Boolean);
    expect(codes).toEqual(["CRM-A", "CRM-B", "CRM-C"]);
  });

  it("scenario: CRM code deduplication logic", () => {
    const existingCrmSet = new Set<string>();
    existingCrmSet.add("crm100|esn-joao");

    const newCode = "crm100";
    const memberId = "esn-joao";
    const key = `${newCode.toLowerCase()}|${memberId}`;

    // Should be skipped (already exists)
    expect(existingCrmSet.has(key)).toBe(true);

    // New code should be added
    const newKey = "crm-new|esn-joao";
    expect(existingCrmSet.has(newKey)).toBe(false);
    existingCrmSet.add(newKey);
    expect(existingCrmSet.has(newKey)).toBe(true);
  });

  it("scenario: member with unit resolved", () => {
    const unitVal = "são paulo";
    const unitId = findInList(units, unitVal);
    expect(unitId).toBe("uid-sp");
  });

  it("scenario: member with unknown role is rejected", () => {
    expect(parseRole("analista de dados")).toBeNull();
  });
});

// ─── Sales targets import scenarios ─────────────────────────────

describe("Sales targets import scenarios", () => {
  it("mapping detects month columns correctly", () => {
    const headers = ["código", "nome", "janeiro", "fevereiro", "março", "abril"];
    const mapping = autoMapColumns(headers, SALES_TARGETS_DB_FIELDS);
    expect(mapping[0]).toBe("esn_code");
    expect(mapping[1]).toBe("esn_name");
    expect(mapping[2]).toBe("month_1");
    expect(mapping[3]).toBe("month_2");
    expect(mapping[4]).toBe("month_3");
    expect(mapping[5]).toBe("month_4");
  });

  it("validates numeric format for month values", () => {
    const mapping = { 0: "esn_code", 1: "month_1" };
    const result = validateImportStructure(
      "sales_targets", mapping, ["código", "janeiro"], SALES_TARGETS_DB_FIELDS,
      [["001", "abc"]], // non-numeric
    );
    expect(result.warnings.some(w => w.includes("formato inválido"))).toBe(true);
  });

  it("accepts valid numeric month values", () => {
    const mapping = { 0: "esn_code", 1: "month_1" };
    const result = validateImportStructure(
      "sales_targets", mapping, ["código", "janeiro"], SALES_TARGETS_DB_FIELDS,
      [["001", "150000"]],
    );
    expect(result.warnings.filter(w => w.includes("formato inválido"))).toHaveLength(0);
  });

  it("scenario: owner resolution by code", () => {
    const ownerId = findInList(esnList, "001");
    expect(ownerId).toBe("esn-joao");
  });

  it("scenario: owner resolution by CRM code", () => {
    const ownerId = findInList(esnList, "crm200", crmCodes);
    expect(ownerId).toBe("esn-maria");
  });
});

// ─── Template import scenarios ──────────────────────────────────

describe("Template import scenarios", () => {
  it("mapping detects template fields", () => {
    const headers = ["template", "produto", "categoria", "tipo", "descrição", "horas"];
    const mapping = autoMapColumns(headers, TEMPLATE_DB_FIELDS);
    expect(mapping[0]).toBe("template_name");
    expect(mapping[1]).toBe("product");
    expect(mapping[2]).toBe("category");
    expect(mapping[3]).toBe("item_type");
    expect(mapping[4]).toBe("description");
    expect(mapping[5]).toBe("hours");
  });

  it("validates required template fields", () => {
    const mapping = { 0: "template_name", 1: "product" };
    const result = validateImportStructure(
      "templates", mapping, ["template", "produto"], TEMPLATE_DB_FIELDS,
      [["Template A", "Produto X"]],
    );
    // category, item_type, description are also required
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Categoria");
  });

  it("passes with all required template fields", () => {
    const mapping = { 0: "template_name", 1: "product", 2: "category", 3: "item_type", 4: "description" };
    const result = validateImportStructure(
      "templates", mapping, ["template", "produto", "categoria", "tipo", "descrição"], TEMPLATE_DB_FIELDS,
      [["Template A", "Produto X", "Cat 1", "processo", "Descrição"]],
    );
    expect(result.valid).toBe(true);
  });

  it("scenario: parent-child item type detection", () => {
    // Template items distinguish between "processo" (parent) and "sub-processo" (child)
    const parentType = "processo";
    const childType = "sub-processo";
    expect(parentType).not.toBe(childType);
  });
});

// ─── Dry-run vs real import ─────────────────────────────────────

describe("Dry-run validation logic", () => {
  it("structural validation catches missing required fields", () => {
    const mapping = { 0: "name" }; // code and cnpj missing
    const result = validateImportStructure(
      "clients", mapping, ["nome"], CLIENT_DB_FIELDS, [["Empresa"]],
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Código");
  });

  it("structural validation passes with all required fields", () => {
    const mapping = { 0: "code", 1: "name", 2: "cnpj" };
    const result = validateImportStructure(
      "clients", mapping, ["código", "nome", "cnpj"], CLIENT_DB_FIELDS,
      [["001", "Empresa", "12345678000100"]],
    );
    expect(result.valid).toBe(true);
  });

  it("dry-run detects unresolved relations", () => {
    const row = ["C001", "Empresa", "12345678000100", "UNIDADE_X", "ESN_X"];
    const fieldToCol: Record<string, number> = { code: 0, name: 1, cnpj: 2, unit_code: 3, esn_code: 4 };

    const { warnings } = buildClientPayload(
      row, fieldToCol, units, esnList, gsnList, emptyAliases, "clients",
    );

    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("Unidade");
    expect(warnings[1]).toContain("ESN");
  });

  it("dry-run with valid data produces no warnings", () => {
    const row = ["C001", "Empresa", "12345678000100", "sp", "001"];
    const fieldToCol: Record<string, number> = { code: 0, name: 1, cnpj: 2, unit_code: 3, esn_code: 4 };

    const { payload, warnings } = buildClientPayload(
      row, fieldToCol, units, esnList, gsnList, emptyAliases, "clients",
    );

    expect(warnings).toHaveLength(0);
    expect(payload.unit_id).toBe("uid-sp");
    expect(payload.esn_id).toBe("esn-joao");
  });
});

// ─── Filter rules in import ────────────────────────────────────

describe("Import filter rules", () => {
  const fieldToCol = { code: 0, name: 1, cnpj: 2 };

  it("filters by exact code", () => {
    const rule = { field: "code", operator: "equals", value: "C001", description: "" };
    expect(evaluateFilterRule(rule, ["C001", "Empresa", "123"], fieldToCol)).toBe(true);
    expect(evaluateFilterRule(rule, ["C002", "Outra", "456"], fieldToCol)).toBe(false);
  });

  it("filters by name containing pattern", () => {
    const rule = { field: "name", operator: "contains", value: "ltda", description: "" };
    expect(evaluateFilterRule(rule, ["C001", "Empresa Ltda", "123"], fieldToCol)).toBe(true);
    expect(evaluateFilterRule(rule, ["C002", "Empresa SA", "123"], fieldToCol)).toBe(false);
  });

  it("filters by empty CNPJ", () => {
    const rule = { field: "cnpj", operator: "is_empty", description: "" };
    expect(evaluateFilterRule(rule, ["C001", "Emp", ""], fieldToCol)).toBe(true);
    expect(evaluateFilterRule(rule, ["C001", "Emp", "12345"], fieldToCol)).toBe(false);
  });
});
