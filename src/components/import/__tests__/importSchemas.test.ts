import { describe, it, expect } from "vitest";
import {
  normalize,
  autoMapColumns,
  detectEntity,
  detectHeaderRow,
  getHeaderSignature,
  validateImportStructure,
  evaluateFilterRule,
  formatDuration,
  CLIENT_DB_FIELDS,
  SALES_TEAM_DB_FIELDS,
  TEMPLATE_DB_FIELDS,
  SALES_TARGETS_DB_FIELDS,
  ENTITY_CONFIGS,
} from "../importSchemas";

// ─── normalize ──────────────────────────────────────────────────

describe("normalize", () => {
  it("lowercases and strips accents", () => {
    expect(normalize("Código")).toBe("codigo");
    expect(normalize("Razão Social")).toBe("razaosocial");
  });

  it("strips special characters", () => {
    expect(normalize("cod.")).toBe("cod");
    expect(normalize("a1_cod")).toBe("a1cod");
  });

  it("handles empty and whitespace", () => {
    expect(normalize("")).toBe("");
    expect(normalize("   ")).toBe("");
  });
});

// ─── autoMapColumns ─────────────────────────────────────────────

describe("autoMapColumns", () => {
  it("maps exact alias matches for clients", () => {
    const headers = ["código", "nome", "cnpj", "loja", "email"];
    const mapping = autoMapColumns(headers, CLIENT_DB_FIELDS);
    expect(mapping[0]).toBe("code");
    expect(mapping[1]).toBe("name");
    expect(mapping[2]).toBe("cnpj");
    expect(mapping[3]).toBe("store_code");
    expect(mapping[4]).toBe("email");
  });

  it("maps Protheus-style headers (a1_cod, a1_nome, a1_cgc)", () => {
    const headers = ["a1_cod", "a1_nome", "a1_cgc", "a1_loja"];
    const mapping = autoMapColumns(headers, CLIENT_DB_FIELDS);
    expect(mapping[0]).toBe("code");
    expect(mapping[1]).toBe("name");
    expect(mapping[2]).toBe("cnpj");
    expect(mapping[3]).toBe("store_code");
  });

  it("maps sales_team fields", () => {
    const headers = ["código", "nome", "cargo", "email", "comissão"];
    const mapping = autoMapColumns(headers, SALES_TEAM_DB_FIELDS);
    expect(mapping[0]).toBe("code");
    expect(mapping[1]).toBe("name");
    expect(mapping[2]).toBe("role_text");
    expect(mapping[3]).toBe("email");
    expect(mapping[4]).toBe("commission_pct");
  });

  it("maps template fields", () => {
    const headers = ["nome do template", "produto", "categoria", "tipo", "descrição", "horas"];
    const mapping = autoMapColumns(headers, TEMPLATE_DB_FIELDS);
    expect(mapping[0]).toBe("template_name");
    expect(mapping[1]).toBe("product");
    expect(mapping[2]).toBe("category");
    expect(mapping[3]).toBe("item_type");
    expect(mapping[4]).toBe("description");
    expect(mapping[5]).toBe("hours");
  });

  it("maps month columns for sales_targets", () => {
    const headers = ["código", "nome", "janeiro", "fevereiro", "março"];
    const mapping = autoMapColumns(headers, SALES_TARGETS_DB_FIELDS);
    expect(mapping[0]).toBe("esn_code");
    expect(mapping[1]).toBe("esn_name");
    expect(mapping[2]).toBe("month_1");
    expect(mapping[3]).toBe("month_2");
    expect(mapping[4]).toBe("month_3");
  });

  it("maps META YYYY - MM columns for sales_targets", () => {
    const headers = ["CÓD DONO DA META", "DONO DA META", "META 2026 - 01", "META 2026 - 02", "META 2026 - 03", "META 2026 - 12"];
    const mapping = autoMapColumns(headers, SALES_TARGETS_DB_FIELDS);
    expect(mapping[0]).toBe("esn_code");
    expect(mapping[1]).toBe("esn_name");
    expect(mapping[2]).toBe("month_1");
    expect(mapping[3]).toBe("month_2");
    expect(mapping[4]).toBe("month_3");
    expect(mapping[5]).toBe("month_12");
  });

  it("maps unit and segment columns for sales_targets", () => {
    const headers = ["CÓD DONO DA META", "NOME UNIDADE", "SEGMENTO", "CÓD SEGMENTO", "RECEITA"];
    const mapping = autoMapColumns(headers, SALES_TARGETS_DB_FIELDS);
    expect(mapping[0]).toBe("esn_code");
    expect(mapping[1]).toBe("unit_code");
    expect(mapping[2]).toBe("segment_name");
    expect(mapping[3]).toBe("segment_code");
    expect(mapping[4]).toBe("category_name");
  });

  it("does not duplicate field assignments", () => {
    const headers = ["código", "codigo", "nome"];
    const mapping = autoMapColumns(headers, CLIENT_DB_FIELDS);
    const values = Object.values(mapping);
    const unique = new Set(values);
    expect(values.length).toBe(unique.size);
  });

  it("handles empty headers gracefully", () => {
    const mapping = autoMapColumns([], CLIENT_DB_FIELDS);
    expect(Object.keys(mapping).length).toBe(0);
  });
});

// ─── detectEntity ───────────────────────────────────────────────

describe("detectEntity", () => {
  it("detects clients when cnpj header present", () => {
    const results = detectEntity(["código", "nome", "cnpj", "email"], []);
    expect(results[0].entity).toBe("clients");
    expect(results[0].confidence).toBeGreaterThanOrEqual(40);
  });

  it("detects sales_team when cargo/função present without cnpj", () => {
    const results = detectEntity(["código", "nome", "cargo", "comissão"], []);
    expect(results[0].entity).toBe("sales_team");
  });

  it("detects templates when template keywords present", () => {
    const results = detectEntity(["template", "produto", "categoria", "tipo", "descrição", "horas padrão", "processo pai"], []);
    expect(results[0].entity).toBe("templates");
  });

  it("detects sales_targets by month columns", () => {
    const results = detectEntity(["código", "nome", "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho"], []);
    const targetsResult = results.find(r => r.entity === "sales_targets");
    expect(targetsResult).toBeDefined();
    expect(targetsResult!.confidence).toBeGreaterThanOrEqual(50);
  });

  it("detects sales_targets by sheet name pattern", () => {
    const results = detectEntity(["col1"], ["BASE DE DADOS - Time Comercial"]);
    const targetsResult = results.find(r => r.entity === "sales_targets");
    expect(targetsResult).toBeDefined();
    expect(targetsResult!.confidence).toBeGreaterThanOrEqual(50);
  });

  it("returns empty array for unrecognizable headers", () => {
    const results = detectEntity(["xyz", "abc", "123"], []);
    expect(results.length).toBe(0);
  });

  it("detects sales_targets by META YYYY - MM pattern", () => {
    const headers = ["OPERAÇÃO", "NOME UNIDADE", "CÓD UNIDADE", "DONO DA META", "CÓD DONO DA META", "NÍVEL", "RECEITA", "SEGMENTO", "TOTAL META", "META 2026 - 01", "META 2026 - 02", "META 2026 - 03", "META 2026 - 04", "META 2026 - 05", "META 2026 - 06", "META 2026 - 07", "META 2026 - 08", "META 2026 - 09", "META 2026 - 10", "META 2026 - 11", "META 2026 - 12"];
    const results = detectEntity(headers, []);
    expect(results[0].entity).toBe("sales_targets");
    expect(results[0].confidence).toBeGreaterThanOrEqual(70);
  });
});

// ─── detectHeaderRow ────────────────────────────────────────────

describe("detectHeaderRow", () => {
  it("picks the row with most non-empty cells", () => {
    const raw = [
      [null, null],
      ["código", "nome", "cnpj", "email", "telefone"],
      ["001", "Empresa A", "12345678000100", "a@b.com", "11999"],
    ];
    expect(detectHeaderRow(raw)).toBe(1);
  });

  it("returns 0 for single-row data", () => {
    expect(detectHeaderRow([["a", "b", "c"]])).toBe(0);
  });

  it("handles empty input", () => {
    expect(detectHeaderRow([])).toBe(0);
  });
});

// ─── validateImportStructure ────────────────────────────────────

describe("validateImportStructure", () => {
  it("reports missing required fields as errors", () => {
    const mapping = { 0: "name" }; // code and cnpj missing
    const result = validateImportStructure("clients", mapping, ["nome"], CLIENT_DB_FIELDS, [["Empresa"]]);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Código");
    expect(result.errors[0]).toContain("CNPJ");
  });

  it("passes with all required fields mapped", () => {
    const mapping = { 0: "code", 1: "name", 2: "cnpj" };
    const result = validateImportStructure(
      "clients", mapping, ["código", "nome", "cnpj"], CLIENT_DB_FIELDS,
      [["001", "Empresa A", "12345678000100"]],
    );
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("warns about invalid CNPJ format", () => {
    const mapping = { 0: "code", 1: "name", 2: "cnpj" };
    const result = validateImportStructure(
      "clients", mapping, ["código", "nome", "cnpj"], CLIENT_DB_FIELDS,
      [["001", "Empresa A", "123"]], // invalid cnpj
    );
    expect(result.valid).toBe(true); // format issues are warnings, not errors
    expect(result.warnings.some(w => w.includes("formato inválido"))).toBe(true);
  });

  it("warns about invalid email format", () => {
    const mapping = { 0: "code", 1: "name", 2: "cnpj", 3: "email" };
    const result = validateImportStructure(
      "clients", mapping, ["código", "nome", "cnpj", "email"], CLIENT_DB_FIELDS,
      [["001", "Empresa A", "12345678000100", "not-an-email"]],
    );
    expect(result.warnings.some(w => w.includes("formato inválido") && w.includes("E-mail"))).toBe(true);
  });

  it("warns about empty required cells in sample", () => {
    const mapping = { 0: "code", 1: "name", 2: "cnpj" };
    const result = validateImportStructure(
      "clients", mapping, ["código", "nome", "cnpj"], CLIENT_DB_FIELDS,
      [["001", "", "12345678000100"]], // empty name
    );
    expect(result.warnings.some(w => w.includes("obrigatória(s) vazia(s)"))).toBe(true);
  });

  it("warns about unmapped columns", () => {
    const mapping = { 0: "code", 1: "name", 2: "cnpj" };
    const result = validateImportStructure(
      "clients", mapping, ["código", "nome", "cnpj", "coluna_extra"], CLIENT_DB_FIELDS,
      [["001", "A", "12345678000100", "x"]],
    );
    expect(result.warnings.some(w => w.includes("não mapeada(s)"))).toBe(true);
  });

  it("validates numeric format for sales targets", () => {
    const mapping = { 0: "esn_code", 1: "month_1" };
    const result = validateImportStructure(
      "sales_targets", mapping,
      ["código", "janeiro"], SALES_TARGETS_DB_FIELDS,
      [["001", "abc"]], // non-numeric
    );
    expect(result.warnings.some(w => w.includes("formato inválido"))).toBe(true);
  });

  it("validates sales_team required fields", () => {
    const mapping = { 0: "code", 1: "name" }; // role_text missing
    const result = validateImportStructure(
      "sales_team", mapping, ["código", "nome"], SALES_TEAM_DB_FIELDS,
      [["001", "João"]],
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Cargo");
  });
});

// ─── evaluateFilterRule ─────────────────────────────────────────

describe("evaluateFilterRule", () => {
  const fieldToCol = { code: 0, name: 1, email: 2 };

  it("equals operator", () => {
    const rule = { field: "code", operator: "equals", value: "001", description: "" };
    expect(evaluateFilterRule(rule, ["001", "A", "a@b.com"], fieldToCol)).toBe(true);
    expect(evaluateFilterRule(rule, ["002", "B", "b@c.com"], fieldToCol)).toBe(false);
  });

  it("contains operator (case-insensitive)", () => {
    const rule = { field: "name", operator: "contains", value: "empresa", description: "" };
    expect(evaluateFilterRule(rule, ["001", "Empresa ABC", ""], fieldToCol)).toBe(true);
    expect(evaluateFilterRule(rule, ["001", "Outro", ""], fieldToCol)).toBe(false);
  });

  it("is_empty operator", () => {
    const rule = { field: "email", operator: "is_empty", description: "" };
    expect(evaluateFilterRule(rule, ["001", "A", ""], fieldToCol)).toBe(true);
    expect(evaluateFilterRule(rule, ["001", "A", "a@b.com"], fieldToCol)).toBe(false);
  });

  it("is_not_empty operator", () => {
    const rule = { field: "email", operator: "is_not_empty", description: "" };
    expect(evaluateFilterRule(rule, ["001", "A", "a@b.com"], fieldToCol)).toBe(true);
  });

  it("greater_than operator", () => {
    const rule = { field: "code", operator: "greater_than", value: "5", description: "" };
    expect(evaluateFilterRule(rule, ["10", "A", ""], fieldToCol)).toBe(true);
    expect(evaluateFilterRule(rule, ["3", "A", ""], fieldToCol)).toBe(false);
  });

  it("regex operator", () => {
    const rule = { field: "code", operator: "regex", value: "^00\\d$", description: "" };
    expect(evaluateFilterRule(rule, ["001", "A", ""], fieldToCol)).toBe(true);
    expect(evaluateFilterRule(rule, ["100", "A", ""], fieldToCol)).toBe(false);
  });

  it("returns true for unmapped field", () => {
    const rule = { field: "unknown", operator: "equals", value: "x", description: "" };
    expect(evaluateFilterRule(rule, ["001"], fieldToCol)).toBe(true);
  });
});

// ─── getHeaderSignature ─────────────────────────────────────────

describe("getHeaderSignature", () => {
  it("creates sorted, normalized signature", () => {
    const sig = getHeaderSignature(["Nome", "Código", "CNPJ"]);
    expect(sig).toBe("cnpj|codigo|nome");
  });

  it("ignores empty headers", () => {
    const sig = getHeaderSignature(["Nome", "", "Código"]);
    expect(sig).toBe("codigo|nome");
  });
});

// ─── formatDuration ─────────────────────────────────────────────

describe("formatDuration", () => {
  it("formats milliseconds", () => {
    expect(formatDuration(500)).toBe("500ms");
  });

  it("formats seconds", () => {
    expect(formatDuration(5000)).toBe("5s");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(125000)).toBe("2min 5s");
  });
});

// ─── Entity config completeness ─────────────────────────────────

describe("ENTITY_CONFIGS", () => {
  it("defines all four entities", () => {
    expect(Object.keys(ENTITY_CONFIGS)).toEqual(["clients", "sales_team", "templates", "sales_targets"]);
  });

  it("each entity has required properties", () => {
    for (const [key, config] of Object.entries(ENTITY_CONFIGS)) {
      expect(config.label).toBeTruthy();
      expect(config.dbFields.length).toBeGreaterThan(0);
      expect(config.queryKeys.length).toBeGreaterThan(0);
    }
  });

  it("clients has code, name, cnpj as required", () => {
    const required = CLIENT_DB_FIELDS.filter(f => f.required).map(f => f.key);
    expect(required).toContain("code");
    expect(required).toContain("name");
    expect(required).toContain("cnpj");
  });

  it("store_code is NOT required (business decision)", () => {
    const storeCode = CLIENT_DB_FIELDS.find(f => f.key === "store_code");
    expect(storeCode?.required).toBe(false);
  });

  it("sales_team requires code, name, role_text", () => {
    const required = SALES_TEAM_DB_FIELDS.filter(f => f.required).map(f => f.key);
    expect(required).toContain("code");
    expect(required).toContain("name");
    expect(required).toContain("role_text");
  });

  it("sales_team has crm_codes field", () => {
    const crmField = SALES_TEAM_DB_FIELDS.find(f => f.key === "crm_codes");
    expect(crmField).toBeDefined();
    expect(crmField?.required).toBe(false);
  });

  it("sales_targets has 12 month fields", () => {
    const months = SALES_TARGETS_DB_FIELDS.filter(f => f.key.startsWith("month_"));
    expect(months.length).toBe(12);
    months.forEach(m => {
      expect(m.format).toBe("numeric");
      expect(m.required).toBe(false);
    });
  });
});
