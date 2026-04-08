// ─── Import Schema Definitions ──────────────────────────────────
// Centralized entity definitions for the Smart Import engine.
// All field mappings, aliases, validation rules, and relational
// config live here — SmartImport.tsx consumes these declaratively.

import { Users, UserCog, LayoutTemplate, Target } from "lucide-react";
import type { ImportEntity } from "@/hooks/useImportStore";

// ─── DbField ────────────────────────────────────────────────────
export interface DbField {
  key: string;
  label: string;
  required: boolean;
  aliases: string[];
  /** Optional format validator applied during structural validation */
  format?: "cnpj_cpf" | "email" | "numeric";
}

// ─── Field definitions per entity ───────────────────────────────

export const CLIENT_DB_FIELDS: DbField[] = [
  { key: "code", label: "Código", required: true, aliases: ["código", "codigo", "cod", "code", "cod.", "cód", "cód.", "a1_cod"] },
  { key: "name", label: "Nome / Razão Social", required: true, aliases: ["nome", "razão social", "razao social", "name", "empresa", "cliente", "a1_nome", "a1_nreduz", "nome fantasia"] },
  { key: "cnpj", label: "CNPJ", required: true, aliases: ["cnpj", "cnpj/cpf", "cpf/cnpj", "documento", "a1_cgc"], format: "cnpj_cpf" },
  { key: "store_code", label: "Loja", required: false, aliases: ["loja", "cod loja", "a1_loja", "store", "filial"] },
  { key: "state_registration", label: "Inscrição Estadual", required: false, aliases: ["inscrição estadual", "inscricao estadual", "ie", "insc. estadual", "a1_inscr"] },
  { key: "contact", label: "Contato", required: false, aliases: ["contato", "responsável", "responsavel", "a1_contato", "contact"] },
  { key: "email", label: "E-mail", required: false, aliases: ["email", "e-mail", "e_mail", "a1_email"], format: "email" },
  { key: "phone", label: "Telefone", required: false, aliases: ["telefone", "fone", "tel", "phone", "a1_tel", "celular"] },
  { key: "address", label: "Endereço", required: false, aliases: ["endereço", "endereco", "address", "a1_end", "logradouro", "rua"] },
  { key: "unit_code", label: "Unidade (código/nome)", required: false, aliases: ["unidade", "cod unidade", "código unidade", "unit", "filial totvs"] },
  { key: "esn_code", label: "ESN (código/nome)", required: false, aliases: ["esn", "cod esn", "código esn", "vendedor", "executivo", "a1_vend", "código crm", "cod crm", "crm"] },
  { key: "gsn_code", label: "GSN (código/nome)", required: false, aliases: ["gsn", "cod gsn", "código gsn", "gerente", "supervisor", "código crm gsn"] },
];

export const SALES_TEAM_DB_FIELDS: DbField[] = [
  { key: "code", label: "Código", required: true, aliases: ["código", "codigo", "cod", "code", "cód", "cod."] },
  { key: "name", label: "Nome", required: true, aliases: ["nome", "name", "colaborador", "funcionário"] },
  { key: "unit_code", label: "Unidade (código/nome)", required: false, aliases: ["unidade", "cod unidade", "unit", "filial"] },
  { key: "role_text", label: "Cargo (ESN/GSN/Arquiteto)", required: true, aliases: ["cargo", "função", "funcao", "role", "tipo", "nivel", "nível", "perfil"] },
  { key: "gsn_code", label: "GSN (código)", required: false, aliases: ["código gsn", "cod gsn", "gsn código", "gsn cod"] },
  { key: "gsn_name", label: "GSN (nome)", required: false, aliases: ["gsn", "gsn nome", "nome gsn", "gerente", "supervisor"] },
  { key: "email", label: "E-mail", required: false, aliases: ["email", "e-mail", "e_mail"], format: "email" },
  { key: "phone", label: "Telefone", required: false, aliases: ["telefone", "fone", "tel", "phone", "celular"] },
  { key: "commission_pct", label: "Comissão (%)", required: false, aliases: ["comissão", "comissao", "% comissão", "pct comissao"], format: "numeric" },
];

export const TEMPLATE_DB_FIELDS: DbField[] = [
  { key: "template_name", label: "Nome do Template", required: true, aliases: ["template", "nome template", "nome do template", "modelo"] },
  { key: "product", label: "Produto", required: true, aliases: ["produto", "product", "sistema"] },
  { key: "category", label: "Categoria", required: true, aliases: ["categoria", "category", "tipo template"] },
  { key: "item_type", label: "Tipo (P=Processo / S=Sub-item)", required: true, aliases: ["tipo", "type", "p/s", "processo/sub"] },
  { key: "description", label: "Descrição do Item", required: true, aliases: ["descrição", "descricao", "item", "atividade", "description", "escopo"] },
  { key: "hours", label: "Horas Padrão", required: false, aliases: ["horas", "hours", "horas padrão", "horas padrao", "hrs", "default hours"], format: "numeric" },
  { key: "parent_desc", label: "Processo Pai (descrição)", required: false, aliases: ["processo pai", "parent", "pai", "grupo", "processo"] },
];

export const SALES_TARGETS_DB_FIELDS: DbField[] = [
  { key: "esn_code", label: "Código Dono da Meta", required: true, aliases: ["código", "codigo", "cod", "code", "código esn", "cod esn", "cod dono", "cod dono da meta", "código dono da meta", "cod dsn", "cod gsn"] },
  { key: "esn_name", label: "Nome Dono da Meta", required: false, aliases: ["nome", "name", "esn", "nome esn", "colaborador", "dono da meta", "nome dono da meta", "dono", "nome dsn", "nome gsn"] },
  { key: "role_name", label: "Nível de Meta", required: false, aliases: ["nivel", "nível", "nivel meta", "nível de meta", "funcao", "função", "role", "tipo meta"] },
  { key: "category_name", label: "Categoria", required: false, aliases: ["categoria", "category", "cat", "tipo"] },
  { key: "segment_name", label: "Segmento", required: false, aliases: ["segmento", "segment", "seg", "linha"] },
  { key: "month_1", label: "Janeiro", required: false, aliases: ["janeiro", "jan", "01", "1"], format: "numeric" },
  { key: "month_2", label: "Fevereiro", required: false, aliases: ["fevereiro", "fev", "02", "2"], format: "numeric" },
  { key: "month_3", label: "Março", required: false, aliases: ["março", "mar", "03", "3"], format: "numeric" },
  { key: "month_4", label: "Abril", required: false, aliases: ["abril", "abr", "04", "4"], format: "numeric" },
  { key: "month_5", label: "Maio", required: false, aliases: ["maio", "mai", "05", "5"], format: "numeric" },
  { key: "month_6", label: "Junho", required: false, aliases: ["junho", "jun", "06", "6"], format: "numeric" },
  { key: "month_7", label: "Julho", required: false, aliases: ["julho", "jul", "07", "7"], format: "numeric" },
  { key: "month_8", label: "Agosto", required: false, aliases: ["agosto", "ago", "08", "8"], format: "numeric" },
  { key: "month_9", label: "Setembro", required: false, aliases: ["setembro", "set", "09", "9"], format: "numeric" },
  { key: "month_10", label: "Outubro", required: false, aliases: ["outubro", "out", "10"], format: "numeric" },
  { key: "month_11", label: "Novembro", required: false, aliases: ["novembro", "nov", "11"], format: "numeric" },
  { key: "month_12", label: "Dezembro", required: false, aliases: ["dezembro", "dez", "12"], format: "numeric" },
];

// ─── Entity configs ─────────────────────────────────────────────

export interface EntityConfig {
  label: string;
  description: string;
  icon: any;
  dbFields: DbField[];
  queryKeys: string[];
}

export const ENTITY_CONFIGS: Record<ImportEntity, EntityConfig> = {
  clients: {
    label: "Clientes",
    description: "Cadastro de clientes com vínculos a Unidade, ESN e GSN",
    icon: Users,
    dbFields: CLIENT_DB_FIELDS,
    queryKeys: ["clients"],
  },
  sales_team: {
    label: "Time de Vendas",
    description: "ESN, GSN e Engenheiros de Valor com vínculo a Unidade",
    icon: UserCog,
    dbFields: SALES_TEAM_DB_FIELDS,
    queryKeys: ["sales_team"],
  },
  templates: {
    label: "Templates de Escopo",
    description: "Templates com processos e sub-itens hierárquicos",
    icon: LayoutTemplate,
    dbFields: TEMPLATE_DB_FIELDS,
    queryKeys: ["scope_templates", "scope_template_items"],
  },
  sales_targets: {
    label: "Metas de Vendas",
    description: "Metas mensais por membro do time (ESN, GSN, DSN) com valores por mês",
    icon: Target,
    dbFields: SALES_TARGETS_DB_FIELDS,
    queryKeys: ["sales_targets"],
  },
};

// ─── Relational field definitions ───────────────────────────────

export interface RelationalFieldDef {
  fieldKey: string;
  label: string;
  listType: "units" | "esn" | "gsn" | "sales_team";
}

export const RELATIONAL_FIELDS: Record<ImportEntity, RelationalFieldDef[]> = {
  clients: [
    { fieldKey: "unit_code", label: "Unidade", listType: "units" },
    { fieldKey: "esn_code", label: "ESN", listType: "esn" },
    { fieldKey: "gsn_code", label: "GSN", listType: "gsn" },
  ],
  sales_team: [
    { fieldKey: "unit_code", label: "Unidade", listType: "units" },
    { fieldKey: "gsn_code", label: "GSN (código)", listType: "gsn" },
    { fieldKey: "gsn_name", label: "GSN (nome)", listType: "gsn" },
  ],
  templates: [],
  sales_targets: [
    { fieldKey: "esn_code", label: "Dono da Meta (código)", listType: "sales_team" },
    { fieldKey: "esn_name", label: "Dono da Meta (nome)", listType: "sales_team" },
  ],
};

// ─── Schema-driven structural validation ────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateImportStructure(
  entity: ImportEntity,
  mapping: Record<number, string>,
  headers: string[],
  dbFields: DbField[],
  dataRows: any[][],
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fieldToCol: Record<string, number> = {};
  for (const [colStr, field] of Object.entries(mapping)) fieldToCol[field] = Number(colStr);

  // 1. Required fields check
  const missingRequired = dbFields.filter(f => f.required && !(f.key in fieldToCol));
  if (missingRequired.length > 0) {
    errors.push(`Campos obrigatórios não mapeados: ${missingRequired.map(f => f.label).join(", ")}`);
  }

  // 2. Sample data validation (first 20 rows) — schema-driven via `format`
  const sampleSize = Math.min(dataRows.length, 20);
  let emptyRequiredCount = 0;
  const formatIssues: Record<string, number> = {};

  for (let i = 0; i < sampleSize; i++) {
    const row = dataRows[i];
    for (const f of dbFields) {
      const colIdx = fieldToCol[f.key];
      if (colIdx == null) continue;
      const val = String(row[colIdx] ?? "").trim();

      // Empty required check
      if (f.required && !val) {
        emptyRequiredCount++;
        continue;
      }

      if (!val || !f.format) continue;

      // Format-based validation
      let isValid = true;
      switch (f.format) {
        case "cnpj_cpf": {
          const digits = val.replace(/\D/g, "");
          isValid = digits.length === 11 || digits.length === 14;
          break;
        }
        case "email":
          isValid = EMAIL_REGEX.test(val);
          break;
        case "numeric":
          isValid = !isNaN(Number(val.replace(/[.,]/g, "")));
          break;
      }

      if (!isValid) {
        const key = `${f.label} (${f.format})`;
        formatIssues[key] = (formatIssues[key] || 0) + 1;
      }
    }
  }

  if (emptyRequiredCount > 0) {
    warnings.push(`${emptyRequiredCount} célula(s) obrigatória(s) vazia(s) nas primeiras ${sampleSize} linhas — linhas serão ignoradas.`);
  }

  for (const [label, count] of Object.entries(formatIssues)) {
    warnings.push(`${count} valor(es) com formato inválido em "${label}" nas primeiras ${sampleSize} linhas.`);
  }

  // 3. Unmapped columns warning
  const unmappedCols = headers.filter((_, i) => !mapping[i] && headers[i]?.trim());
  if (unmappedCols.length > 0) {
    warnings.push(`${unmappedCols.length} coluna(s) não mapeada(s): ${unmappedCols.slice(0, 5).join(", ")}${unmappedCols.length > 5 ? "..." : ""}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─── Auto-mapping helpers ───────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "").trim();
}

function isNumeric(s: string): boolean { return /^\d+$/.test(s); }

export function autoMapColumns(headers: string[], fields: DbField[]): Record<number, string> {
  const mapping: Record<number, string> = {};
  const usedFields = new Set<string>();

  // Pass 1: exact matches
  for (let i = 0; i < headers.length; i++) {
    const h = normalize(headers[i] || "");
    if (!h) continue;
    for (const field of fields) {
      if (usedFields.has(field.key)) continue;
      if (field.aliases.some(alias => normalize(alias) === h)) {
        mapping[i] = field.key;
        usedFields.add(field.key);
        break;
      }
    }
  }

  // Pass 2: substring matches
  for (let i = 0; i < headers.length; i++) {
    if (mapping[i]) continue;
    const h = normalize(headers[i] || "");
    if (!h) continue;
    for (const field of fields) {
      if (usedFields.has(field.key)) continue;
      const match = field.aliases.some(alias => {
        const na = normalize(alias);
        if (isNumeric(na) || isNumeric(h)) return false;
        return h.includes(na) || na.includes(h);
      });
      if (match) { mapping[i] = field.key; usedFields.add(field.key); break; }
    }
  }
  return mapping;
}

// ─── Entity auto-detection ──────────────────────────────────────

export function detectEntity(headers: string[], sheetNames: string[]): { entity: ImportEntity; confidence: number }[] {
  const scores: { entity: ImportEntity; score: number }[] = [];
  if (sheetNames.some(s => s.includes("BASE DE DADOS") && s.includes("Time Comercial"))) {
    scores.push({ entity: "sales_targets", score: 90 });
  }
  const h = headers.map(hdr => normalize(hdr));
  const has = (keyword: string) => h.some(col => col.includes(normalize(keyword)));

  let clientScore = 0;
  if (has("cnpj")) clientScore += 40;
  if (has("razao social") || has("razão social")) clientScore += 20;
  if (has("inscricao estadual") || has("inscrição estadual")) clientScore += 20;
  if (has("loja")) clientScore += 10;
  if (has("endereco") || has("endereço")) clientScore += 5;
  if (has("a1_cod") || has("a1_nome") || has("a1_cgc")) clientScore += 30;
  scores.push({ entity: "clients", score: clientScore });

  let stScore = 0;
  if (has("cargo") || has("funcao") || has("função")) stScore += 35;
  if (has("esn") || has("gsn")) stScore += 25;
  if (has("comissao") || has("comissão")) stScore += 15;
  if ((has("codigo") || has("código")) && has("nome") && !has("cnpj")) stScore += 15;
  scores.push({ entity: "sales_team", score: stScore });

  let tplScore = 0;
  if (has("template") || has("modelo")) tplScore += 30;
  if (has("processo") && has("sub")) tplScore += 25;
  if (has("horas padrao") || has("horas padrão") || has("default hours")) tplScore += 20;
  if (has("categoria") && has("produto")) tplScore += 15;
  if (has("processo pai") || has("parent")) tplScore += 15;
  scores.push({ entity: "templates", score: tplScore });

  let targScore = scores.find(s => s.entity === "sales_targets")?.score || 0;
  const monthKeywords = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const monthMatches = monthKeywords.filter(m => has(m)).length;
  if (monthMatches >= 6) targScore += 50;
  if (monthMatches >= 3) targScore += 25;
  const existing = scores.find(s => s.entity === "sales_targets");
  if (!existing) {
    scores.push({ entity: "sales_targets", score: targScore });
  } else {
    existing.score = Math.max(existing.score, targScore);
  }

  return scores
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(s => ({ entity: s.entity, confidence: Math.min(s.score, 100) }));
}

// ─── Header row detection ───────────────────────────────────────

export function detectHeaderRow(raw: any[][]): number {
  let bestRow = 0, bestCount = 0;
  const limit = Math.min(raw.length, 15);
  for (let i = 0; i < limit; i++) {
    const count = (raw[i] || []).filter((c: any) => c != null && String(c).trim() !== "").length;
    if (count > bestCount) { bestCount = count; bestRow = i; }
  }
  return bestRow;
}

// ─── Header signature for layout matching ───────────────────────

export function getHeaderSignature(headers: string[]): string {
  return headers.filter(h => h).map(h => normalize(h)).sort().join("|");
}

// ─── Filter rule types ──────────────────────────────────────────

export interface FilterRule {
  field: string;
  operator: string;
  value?: string;
  description: string;
}

export interface SavedFilterPreset {
  id: string;
  name: string;
  entity: ImportEntity;
  rules: FilterRule[];
  createdAt: number;
}

export const OPERATOR_LABELS: Record<string, string> = {
  equals: "igual a", not_equals: "diferente de", contains: "contém", not_contains: "não contém",
  starts_with: "começa com", ends_with: "termina com", is_empty: "está vazio", is_not_empty: "não está vazio",
  exists_in_system: "existe no cadastro", not_exists_in_system: "não existe no cadastro",
  greater_than: "maior que", less_than: "menor que", regex: "regex",
};

export function evaluateFilterRule(
  rule: FilterRule, row: any[], fieldToCol: Record<string, number>,
  lookupLists?: { unitList: any[]; esnList: any[]; gsnList: any[] },
  findFn?: (list: any[], search: string) => string | null,
): boolean {
  const colIdx = fieldToCol[rule.field];
  if (colIdx == null) return true;
  const cellVal = String(row[colIdx] ?? "").trim();
  switch (rule.operator) {
    case "equals": return cellVal.toLowerCase() === (rule.value || "").toLowerCase();
    case "not_equals": return cellVal.toLowerCase() !== (rule.value || "").toLowerCase();
    case "contains": return cellVal.toLowerCase().includes((rule.value || "").toLowerCase());
    case "not_contains": return !cellVal.toLowerCase().includes((rule.value || "").toLowerCase());
    case "starts_with": return cellVal.toLowerCase().startsWith((rule.value || "").toLowerCase());
    case "ends_with": return cellVal.toLowerCase().endsWith((rule.value || "").toLowerCase());
    case "is_empty": return !cellVal;
    case "is_not_empty": return !!cellVal;
    case "greater_than": return parseFloat(cellVal) > parseFloat(rule.value || "0");
    case "less_than": return parseFloat(cellVal) < parseFloat(rule.value || "0");
    case "regex": { try { return new RegExp(rule.value || "", "i").test(cellVal); } catch { return true; } }
    case "exists_in_system": {
      if (!findFn || !lookupLists || !cellVal) return false;
      const list = rule.field === "unit_code" ? lookupLists.unitList : rule.field === "esn_code" ? lookupLists.esnList : rule.field === "gsn_code" ? lookupLists.gsnList : [];
      return !!findFn(list, cellVal);
    }
    case "not_exists_in_system": {
      if (!findFn || !lookupLists || !cellVal) return true;
      const list = rule.field === "unit_code" ? lookupLists.unitList : rule.field === "esn_code" ? lookupLists.esnList : rule.field === "gsn_code" ? lookupLists.gsnList : [];
      return !findFn(list, cellVal);
    }
    default: return true;
  }
}

// ─── Layout persistence ─────────────────────────────────────────

export interface SavedLayout {
  id: string;
  name: string;
  entity: ImportEntity;
  headerSignature: string;
  mapping: Record<number, string>;
  headerNames: string[];
  createdAt: number;
}

const LAYOUTS_STORAGE_KEY = "smart_import_saved_layouts_v2";
const FILTER_RULES_STORAGE_KEY = "smart_import_filter_rules_v2";

export function loadSavedLayouts(): SavedLayout[] {
  try {
    const raw = localStorage.getItem(LAYOUTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveLayout(layout: SavedLayout) {
  const layouts = loadSavedLayouts();
  const idx = layouts.findIndex(l => l.headerSignature === layout.headerSignature && l.entity === layout.entity);
  if (idx >= 0) layouts[idx] = layout; else layouts.push(layout);
  if (layouts.length > 40) layouts.splice(0, layouts.length - 40);
  localStorage.setItem(LAYOUTS_STORAGE_KEY, JSON.stringify(layouts));
}

export function findMatchingLayout(headers: string[], entity: ImportEntity): SavedLayout | null {
  const sig = getHeaderSignature(headers);
  return loadSavedLayouts().find(l => l.headerSignature === sig && l.entity === entity) || null;
}

export function loadSavedFilterPresets(entity?: ImportEntity): SavedFilterPreset[] {
  try {
    const raw = localStorage.getItem(FILTER_RULES_STORAGE_KEY);
    const all: SavedFilterPreset[] = raw ? JSON.parse(raw) : [];
    return entity ? all.filter(p => p.entity === entity) : all;
  } catch { return []; }
}

export function saveFilterPreset(preset: SavedFilterPreset) {
  try {
    const raw = localStorage.getItem(FILTER_RULES_STORAGE_KEY);
    const all: SavedFilterPreset[] = raw ? JSON.parse(raw) : [];
    const idx = all.findIndex(p => p.id === preset.id);
    if (idx >= 0) all[idx] = preset; else all.push(preset);
    if (all.length > 50) all.splice(0, all.length - 50);
    localStorage.setItem(FILTER_RULES_STORAGE_KEY, JSON.stringify(all));
  } catch {}
}

export function deleteFilterPreset(id: string) {
  try {
    const raw = localStorage.getItem(FILTER_RULES_STORAGE_KEY);
    const all: SavedFilterPreset[] = raw ? JSON.parse(raw) : [];
    localStorage.setItem(FILTER_RULES_STORAGE_KEY, JSON.stringify(all.filter(p => p.id !== id)));
  } catch {}
}

// ─── Relational alias persistence ───────────────────────────────

const RELATIONAL_ALIASES_KEY = "smart_import_relational_aliases_v1";

export type AliasStore = Record<string, Record<string, string>>;

export function loadAliasStore(): AliasStore {
  try { return JSON.parse(localStorage.getItem(RELATIONAL_ALIASES_KEY) || "{}"); } catch { return {}; }
}

export function saveAliasStore(store: AliasStore) {
  try { localStorage.setItem(RELATIONAL_ALIASES_KEY, JSON.stringify(store)); } catch {}
}

export function getAliasKey(entity: ImportEntity, field: string): string {
  return `${entity}:${field}`;
}

// ─── Unresolved relation types ──────────────────────────────────

export interface UnresolvedRelation {
  fieldKey: string;
  fieldLabel: string;
  value: string;
  valueLower: string;
  occurrences: number;
  listType: "units" | "esn" | "gsn" | "sales_team";
  resolvedId?: string;
}

// ─── Utility ────────────────────────────────────────────────────

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}min ${s % 60}s`;
}
