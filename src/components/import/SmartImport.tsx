import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Upload, Wand2, ArrowRight, ArrowLeft, CheckCircle2, XCircle, Loader2,
  FileSpreadsheet, Clock, ChevronDown, ChevronUp, Play, Settings2, Eye, Save,
  Sparkles, Filter, Trash2, Users, UserCog, LayoutTemplate, Target
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  type ImportEntity,
  type ImportRun,
  useImportStore,
  startImportRun,
  addImportLog,
  updateImportStats,
  finishImportRun,
  requestCancelImport,
  getCancelSignal,
} from "@/hooks/useImportStore";

// ─── DB field definitions per entity ────────────────────────────
interface DbField {
  key: string;
  label: string;
  required: boolean;
  aliases: string[];
}

const CLIENT_DB_FIELDS: DbField[] = [
  { key: "code", label: "Código", required: true, aliases: ["código", "codigo", "cod", "code", "cod.", "cód", "cód.", "a1_cod"] },
  { key: "name", label: "Nome / Razão Social", required: true, aliases: ["nome", "razão social", "razao social", "name", "empresa", "cliente", "a1_nome", "a1_nreduz", "nome fantasia"] },
  { key: "cnpj", label: "CNPJ", required: true, aliases: ["cnpj", "cnpj/cpf", "cpf/cnpj", "documento", "a1_cgc"] },
  { key: "store_code", label: "Loja", required: false, aliases: ["loja", "cod loja", "a1_loja", "store", "filial"] },
  { key: "state_registration", label: "Inscrição Estadual", required: false, aliases: ["inscrição estadual", "inscricao estadual", "ie", "insc. estadual", "a1_inscr"] },
  { key: "contact", label: "Contato", required: false, aliases: ["contato", "responsável", "responsavel", "a1_contato", "contact"] },
  { key: "email", label: "E-mail", required: false, aliases: ["email", "e-mail", "e_mail", "a1_email"] },
  { key: "phone", label: "Telefone", required: false, aliases: ["telefone", "fone", "tel", "phone", "a1_tel", "celular"] },
  { key: "address", label: "Endereço", required: false, aliases: ["endereço", "endereco", "address", "a1_end", "logradouro", "rua"] },
  { key: "unit_code", label: "Unidade (código/nome)", required: false, aliases: ["unidade", "cod unidade", "código unidade", "unit", "filial totvs"] },
  { key: "esn_code", label: "ESN (código/nome)", required: false, aliases: ["esn", "cod esn", "código esn", "vendedor", "executivo", "a1_vend"] },
  { key: "gsn_code", label: "GSN (código/nome)", required: false, aliases: ["gsn", "cod gsn", "código gsn", "gerente", "supervisor"] },
];

const SALES_TEAM_DB_FIELDS: DbField[] = [
  { key: "code", label: "Código", required: true, aliases: ["código", "codigo", "cod", "code", "cód", "cod."] },
  { key: "name", label: "Nome", required: true, aliases: ["nome", "name", "colaborador", "funcionário"] },
  { key: "unit_code", label: "Unidade (código/nome)", required: false, aliases: ["unidade", "cod unidade", "unit", "filial"] },
  { key: "role_text", label: "Cargo (ESN/GSN/Arquiteto)", required: true, aliases: ["cargo", "função", "funcao", "role", "tipo", "nivel", "nível", "perfil"] },
  { key: "gsn_code", label: "GSN (código)", required: false, aliases: ["código gsn", "cod gsn", "gsn código", "gsn cod"] },
  { key: "gsn_name", label: "GSN (nome)", required: false, aliases: ["gsn", "gsn nome", "nome gsn", "gerente", "supervisor"] },
  { key: "email", label: "E-mail", required: false, aliases: ["email", "e-mail", "e_mail"] },
  { key: "phone", label: "Telefone", required: false, aliases: ["telefone", "fone", "tel", "phone", "celular"] },
  { key: "commission_pct", label: "Comissão (%)", required: false, aliases: ["comissão", "comissao", "% comissão", "pct comissao"] },
];

const TEMPLATE_DB_FIELDS: DbField[] = [
  { key: "template_name", label: "Nome do Template", required: true, aliases: ["template", "nome template", "nome do template", "modelo"] },
  { key: "product", label: "Produto", required: true, aliases: ["produto", "product", "sistema"] },
  { key: "category", label: "Categoria", required: true, aliases: ["categoria", "category", "tipo template"] },
  { key: "item_type", label: "Tipo (P=Processo / S=Sub-item)", required: true, aliases: ["tipo", "type", "p/s", "processo/sub"] },
  { key: "description", label: "Descrição do Item", required: true, aliases: ["descrição", "descricao", "item", "atividade", "description", "escopo"] },
  { key: "hours", label: "Horas Padrão", required: false, aliases: ["horas", "hours", "horas padrão", "horas padrao", "hrs", "default hours"] },
  { key: "parent_desc", label: "Processo Pai (descrição)", required: false, aliases: ["processo pai", "parent", "pai", "grupo", "processo"] },
];

const SALES_TARGETS_DB_FIELDS: DbField[] = [
  { key: "esn_code", label: "Código ESN", required: true, aliases: ["código", "codigo", "cod", "code", "código esn", "cod esn"] },
  { key: "esn_name", label: "Nome ESN", required: false, aliases: ["nome", "name", "esn", "nome esn", "colaborador"] },
  { key: "month_1", label: "Janeiro", required: false, aliases: ["janeiro", "jan", "01", "1"] },
  { key: "month_2", label: "Fevereiro", required: false, aliases: ["fevereiro", "fev", "02", "2"] },
  { key: "month_3", label: "Março", required: false, aliases: ["março", "mar", "03", "3"] },
  { key: "month_4", label: "Abril", required: false, aliases: ["abril", "abr", "04", "4"] },
  { key: "month_5", label: "Maio", required: false, aliases: ["maio", "mai", "05", "5"] },
  { key: "month_6", label: "Junho", required: false, aliases: ["junho", "jun", "06", "6"] },
  { key: "month_7", label: "Julho", required: false, aliases: ["julho", "jul", "07", "7"] },
  { key: "month_8", label: "Agosto", required: false, aliases: ["agosto", "ago", "08", "8"] },
  { key: "month_9", label: "Setembro", required: false, aliases: ["setembro", "set", "09", "9"] },
  { key: "month_10", label: "Outubro", required: false, aliases: ["outubro", "out", "10"] },
  { key: "month_11", label: "Novembro", required: false, aliases: ["novembro", "nov", "11"] },
  { key: "month_12", label: "Dezembro", required: false, aliases: ["dezembro", "dez", "12"] },
];

const ENTITY_CONFIGS: Record<ImportEntity, {
  label: string;
  description: string;
  icon: any;
  dbFields: DbField[];
  queryKeys: string[];
}> = {
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
    description: "Metas mensais por ESN com valores por mês",
    icon: Target,
    dbFields: SALES_TARGETS_DB_FIELDS,
    queryKeys: ["sales_targets"],
  },
};

// ─── Filter rule types ─────────────────────────────────────────
interface FilterRule {
  field: string;
  operator: string;
  value?: string;
  description: string;
}

interface SavedFilterPreset {
  id: string;
  name: string;
  entity: ImportEntity;
  rules: FilterRule[];
  createdAt: number;
}

const LAYOUTS_STORAGE_KEY = "smart_import_saved_layouts_v2";
const FILTER_RULES_STORAGE_KEY = "smart_import_filter_rules_v2";

function loadSavedFilterPresets(entity?: ImportEntity): SavedFilterPreset[] {
  try {
    const raw = localStorage.getItem(FILTER_RULES_STORAGE_KEY);
    const all: SavedFilterPreset[] = raw ? JSON.parse(raw) : [];
    return entity ? all.filter(p => p.entity === entity) : all;
  } catch { return []; }
}

function saveFilterPreset(preset: SavedFilterPreset) {
  try {
    const raw = localStorage.getItem(FILTER_RULES_STORAGE_KEY);
    const all: SavedFilterPreset[] = raw ? JSON.parse(raw) : [];
    const idx = all.findIndex(p => p.id === preset.id);
    if (idx >= 0) all[idx] = preset; else all.push(preset);
    if (all.length > 50) all.splice(0, all.length - 50);
    localStorage.setItem(FILTER_RULES_STORAGE_KEY, JSON.stringify(all));
  } catch {}
}

function deleteFilterPreset(id: string) {
  try {
    const raw = localStorage.getItem(FILTER_RULES_STORAGE_KEY);
    const all: SavedFilterPreset[] = raw ? JSON.parse(raw) : [];
    localStorage.setItem(FILTER_RULES_STORAGE_KEY, JSON.stringify(all.filter(p => p.id !== id)));
  } catch {}
}

// ─── Filter evaluation ─────────────────────────────────────────
const OPERATOR_LABELS: Record<string, string> = {
  equals: "igual a", not_equals: "diferente de", contains: "contém", not_contains: "não contém",
  starts_with: "começa com", ends_with: "termina com", is_empty: "está vazio", is_not_empty: "não está vazio",
  exists_in_system: "existe no cadastro", not_exists_in_system: "não existe no cadastro",
  greater_than: "maior que", less_than: "menor que", regex: "regex",
};

function evaluateFilterRule(
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
interface SavedLayout {
  id: string;
  name: string;
  entity: ImportEntity;
  headerSignature: string;
  mapping: Record<number, string>;
  headerNames: string[];
  createdAt: number;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "").trim();
}

function getHeaderSignature(headers: string[]): string {
  return headers.filter(h => h).map(h => normalize(h)).sort().join("|");
}

function loadSavedLayouts(): SavedLayout[] {
  try {
    const raw = localStorage.getItem(LAYOUTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLayout(layout: SavedLayout) {
  const layouts = loadSavedLayouts();
  const idx = layouts.findIndex(l => l.headerSignature === layout.headerSignature && l.entity === layout.entity);
  if (idx >= 0) layouts[idx] = layout; else layouts.push(layout);
  if (layouts.length > 40) layouts.splice(0, layouts.length - 40);
  localStorage.setItem(LAYOUTS_STORAGE_KEY, JSON.stringify(layouts));
}

function findMatchingLayout(headers: string[], entity: ImportEntity): SavedLayout | null {
  const sig = getHeaderSignature(headers);
  return loadSavedLayouts().find(l => l.headerSignature === sig && l.entity === entity) || null;
}

// ─── Auto-mapping ───────────────────────────────────────────────
function autoMapColumns(headers: string[], fields: DbField[]): Record<number, string> {
  const mapping: Record<number, string> = {};
  const usedFields = new Set<string>();
  for (let i = 0; i < headers.length; i++) {
    const h = normalize(headers[i] || "");
    if (!h) continue;
    for (const field of fields) {
      if (usedFields.has(field.key)) continue;
      const match = field.aliases.some(alias => {
        const na = normalize(alias);
        return h === na || h.includes(na) || na.includes(h);
      });
      if (match) { mapping[i] = field.key; usedFields.add(field.key); break; }
    }
  }
  return mapping;
}

function detectHeaderRow(raw: any[][]): number {
  let bestRow = 0, bestCount = 0;
  const limit = Math.min(raw.length, 15);
  for (let i = 0; i < limit; i++) {
    const count = (raw[i] || []).filter((c: any) => c != null && String(c).trim() !== "").length;
    if (count > bestCount) { bestCount = count; bestRow = i; }
  }
  return bestRow;
}

// ─── Entity auto-detection ──────────────────────────────────────
function detectEntity(headers: string[], sheetNames: string[]): { entity: ImportEntity; confidence: number }[] {
  const scores: { entity: ImportEntity; score: number }[] = [];

  // Check for sales_targets specific sheet
  if (sheetNames.some(s => s.includes("BASE DE DADOS") && s.includes("Time Comercial"))) {
    scores.push({ entity: "sales_targets", score: 90 });
  }

  const h = headers.map(h => normalize(h));
  const has = (keyword: string) => h.some(col => col.includes(normalize(keyword)));

  // Client indicators
  let clientScore = 0;
  if (has("cnpj")) clientScore += 40;
  if (has("razao social") || has("razão social")) clientScore += 20;
  if (has("inscricao estadual") || has("inscrição estadual")) clientScore += 20;
  if (has("loja")) clientScore += 10;
  if (has("endereco") || has("endereço")) clientScore += 5;
  if (has("a1_cod") || has("a1_nome") || has("a1_cgc")) clientScore += 30;
  scores.push({ entity: "clients", score: clientScore });

  // Sales team indicators
  let stScore = 0;
  if (has("cargo") || has("funcao") || has("função")) stScore += 35;
  if (has("esn") || has("gsn")) stScore += 25;
  if (has("comissao") || has("comissão")) stScore += 15;
  if ((has("codigo") || has("código")) && has("nome") && !has("cnpj")) stScore += 15;
  scores.push({ entity: "sales_team", score: stScore });

  // Template indicators
  let tplScore = 0;
  if (has("template") || has("modelo")) tplScore += 30;
  if (has("processo") && has("sub")) tplScore += 25;
  if (has("horas padrao") || has("horas padrão") || has("default hours")) tplScore += 20;
  if (has("categoria") && has("produto")) tplScore += 15;
  if (has("processo pai") || has("parent")) tplScore += 15;
  scores.push({ entity: "templates", score: tplScore });

  // Sales targets indicators (from headers if not detected by sheet)
  let targScore = scores.find(s => s.entity === "sales_targets")?.score || 0;
  const monthKeywords = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const monthMatches = monthKeywords.filter(m => has(m)).length;
  if (monthMatches >= 6) targScore += 50;
  if (monthMatches >= 3) targScore += 25;
  if (!scores.find(s => s.entity === "sales_targets")) {
    scores.push({ entity: "sales_targets", score: targScore });
  } else {
    scores.find(s => s.entity === "sales_targets")!.score = Math.max(scores.find(s => s.entity === "sales_targets")!.score, targScore);
  }

  return scores
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(s => ({ entity: s.entity, confidence: Math.min(s.score, 100) }));
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}min ${s % 60}s`;
}

// ─── Lookup helpers ─────────────────────────────────────────────
function findInList(list: { id: string; code: string; name: string }[], search: string): string | null {
  if (!search) return null;
  const s = search.trim().toLowerCase();
  const byCode = list.find(u => u.code === s);
  if (byCode) return byCode.id;
  const byName = list.find(u => u.name === s);
  if (byName) return byName.id;
  const sNum = s.replace(/^0+/, "");
  if (sNum) {
    const byPaddedCode = list.find(u => u.code.replace(/^0+/, "") === sNum);
    if (byPaddedCode) return byPaddedCode.id;
  }
  const partial = list.find(u =>
    (u.code && (u.code.includes(s) || s.includes(u.code))) ||
    (u.name && (u.name.includes(s) || s.includes(u.name)))
  );
  return partial ? partial.id : null;
}

// ─── Steps ──────────────────────────────────────────────────────
type Step = "upload" | "confirm" | "mapping" | "options" | "running" | "done";

export default function SmartImport() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [detectedEntity, setDetectedEntity] = useState<ImportEntity>("clients");
  const [detectionResults, setDetectionResults] = useState<{ entity: ImportEntity; confidence: number }[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [headerRowIdx, setHeaderRowIdx] = useState(0);
  const [previewRows, setPreviewRows] = useState<any[][]>([]);
  const [allDataRows, setAllDataRows] = useState<any[][]>([]);
  const [rawWorkbook, setRawWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [updateFields, setUpdateFields] = useState<Set<string>>(new Set());
  const [layoutRestored, setLayoutRestored] = useState(false);
  const [layoutSaved, setLayoutSaved] = useState(false);
  const [filterRules, setFilterRules] = useState<FilterRule[]>([]);
  const [filterPrompt, setFilterPrompt] = useState("");
  const [filterLoading, setFilterLoading] = useState(false);
  const [savedPresets, setSavedPresets] = useState<SavedFilterPreset[]>([]);
  const [targetYear, setTargetYear] = useState(String(new Date().getFullYear()));
  const fileRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { getImport } = useImportStore();
  const run = getImport(detectedEntity);

  const entityConfig = ENTITY_CONFIGS[detectedEntity];
  const dbFields = entityConfig.dbFields;

  // ── Step 1: Upload & detect ───────────────────────────────────
  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setLayoutRestored(false);
    setLayoutSaved(false);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf);
      setRawWorkbook(wb);
      setSheetNames(wb.SheetNames);

      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if (raw.length < 2) {
        toast({ title: "Planilha vazia", description: "A planilha não possui linhas de dados.", variant: "destructive" });
        return;
      }

      const hdrIdx = detectHeaderRow(raw);
      setHeaderRowIdx(hdrIdx);
      const hdrs = (raw[hdrIdx] || []).map((h: any) => String(h || "").trim());
      setHeaders(hdrs);
      const data = raw.slice(hdrIdx + 1).filter(r => r.some(c => c != null && c !== ""));
      setAllDataRows(data);
      setPreviewRows(data.slice(0, 5));

      // Auto-detect entity
      const results = detectEntity(hdrs, wb.SheetNames);
      setDetectionResults(results);
      if (results.length > 0) {
        setDetectedEntity(results[0].entity);
      }

      setStep("confirm");
    } catch (err: any) {
      toast({ title: "Erro ao ler arquivo", description: err.message, variant: "destructive" });
    }
  }, [toast]);

  // ── When entity confirmed, apply mapping ──────────────────────
  const confirmEntity = useCallback((entity: ImportEntity) => {
    setDetectedEntity(entity);
    const fields = ENTITY_CONFIGS[entity].dbFields;

    // For sales_targets with specific sheet, re-read correct sheet
    if (entity === "sales_targets" && rawWorkbook) {
      const specificSheet = rawWorkbook.SheetNames.find(s => s.includes("BASE DE DADOS") && s.includes("Time Comercial"));
      if (specificSheet) {
        const ws = rawWorkbook.Sheets[specificSheet];
        const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const hdrIdx = detectHeaderRow(raw);
        setHeaderRowIdx(hdrIdx);
        const hdrs = (raw[hdrIdx] || []).map((h: any) => String(h || "").trim());
        setHeaders(hdrs);
        const data = raw.slice(hdrIdx + 1).filter(r => r.some(c => c != null && c !== ""));
        setAllDataRows(data);
        setPreviewRows(data.slice(0, 5));
      }
    }

    // Try saved layout, then auto-map
    const savedLayout = findMatchingLayout(headers, entity);
    let autoMap: Record<number, string>;
    if (savedLayout) {
      autoMap = savedLayout.mapping;
      setLayoutRestored(true);
      toast({ title: "Layout restaurado", description: `Mapeamento "${savedLayout.name}" aplicado automaticamente.` });
    } else {
      autoMap = autoMapColumns(headers, fields);
    }
    setMapping(autoMap);

    const optionalMapped = Object.values(autoMap).filter(k => !fields.find(f => f.key === k)?.required);
    setUpdateFields(new Set(optionalMapped));
    setSavedPresets(loadSavedFilterPresets(entity));
    setFilterRules([]);

    setStep("mapping");
  }, [headers, rawWorkbook, toast]);

  // ── Save layout ───────────────────────────────────────────────
  const handleSaveLayout = useCallback(() => {
    if (headers.length === 0) return;
    saveLayout({
      id: crypto.randomUUID(),
      name: file?.name || "Layout",
      entity: detectedEntity,
      headerSignature: getHeaderSignature(headers),
      mapping,
      headerNames: headers,
      createdAt: Date.now(),
    });
    setLayoutSaved(true);
    toast({ title: "Layout salvo", description: "O mapeamento será reutilizado em importações futuras com o mesmo formato." });
  }, [headers, mapping, file, detectedEntity, toast]);

  // ── Extract value helper ──────────────────────────────────────
  const extractValue = useCallback((row: any[], dbKey: string, fieldToCol: Record<string, number>): any => {
    const colIdx = fieldToCol[dbKey];
    if (colIdx == null) return null;
    return String(row[colIdx] || "").trim() || null;
  }, []);

  // ── Run import ────────────────────────────────────────────────
  const runImport = useCallback(async () => {
    if (!layoutSaved && headers.length > 0) {
      saveLayout({
        id: crypto.randomUUID(),
        name: file?.name || "Layout",
        entity: detectedEntity,
        headerSignature: getHeaderSignature(headers),
        mapping,
        headerNames: headers,
        createdAt: Date.now(),
      });
    }

    setStep("running");

    const fieldToCol: Record<string, number> = {};
    for (const [colStr, field] of Object.entries(mapping)) {
      fieldToCol[field] = Number(colStr);
    }

    const missing = dbFields.filter(f => f.required && !(f.key in fieldToCol));
    if (missing.length > 0) {
      addImportLog(detectedEntity, "error", `Campos obrigatórios não mapeados: ${missing.map(f => f.label).join(", ")}`);
      finishImportRun(detectedEntity, "error");
      setStep("done");
      return;
    }

    const ev = (row: any[], key: string) => extractValue(row, key, fieldToCol);

    switch (detectedEntity) {
      case "clients":
        await runClientImportMapped(fieldToCol, ev);
        break;
      case "sales_team":
        await runSalesTeamImportMapped(fieldToCol, ev);
        break;
      case "templates":
        await runTemplateImportMapped(fieldToCol, ev);
        break;
      case "sales_targets":
        await runSalesTargetsImportMapped(fieldToCol, ev);
        break;
    }

    setStep("done");
  }, [file, allDataRows, mapping, updateFields, user, qc, headerRowIdx, headers, layoutSaved, filterRules, detectedEntity, dbFields, extractValue, targetYear]);

  // ── CLIENT import with mapped columns ─────────────────────────
  async function runClientImportMapped(fieldToCol: Record<string, number>, ev: (row: any[], key: string) => any) {
    const entity: ImportEntity = "clients";
    const importRun = startImportRun(entity, file!.name, false);

    const dataRows = allDataRows.filter(r => ev(r, "code") && ev(r, "name") && ev(r, "cnpj"));
    const invalidRows = allDataRows.length - dataRows.length;
    updateImportStats(entity, { totalRows: allDataRows.length });
    addImportLog(entity, "info", `${allDataRows.length} linhas, ${dataRows.length} válidas, ${invalidRows} sem campos obrigatórios.`);

    importRun.totalRows = allDataRows.length;
    let dbLogId: string | undefined;
    try {
      const { data } = await supabase.from("import_logs").insert({
        entity: "clients", file_name: file!.name, status: "running",
        total_rows: allDataRows.length, cleared_before: false, user_id: user?.id || null,
      } as any).select("id").single();
      dbLogId = data?.id;
    } catch {}

    if (dataRows.length === 0) {
      addImportLog(entity, "error", "Nenhum registro válido encontrado.");
      finishImportRun(entity, "error");
      return;
    }

    const [{ data: units }, { data: salesTeam }] = await Promise.all([
      supabase.from("unit_info").select("id, code, name"),
      supabase.from("sales_team").select("id, code, name, role"),
    ]);
    const unitList = (units || []).map(u => ({ id: u.id, code: (u.code || "").trim().toLowerCase(), name: u.name.trim().toLowerCase() }));
    const esnList = (salesTeam || []).filter(s => s.role === "esn").map(s => ({ id: s.id, code: s.code.toLowerCase(), name: s.name.toLowerCase() }));
    const gsnList = (salesTeam || []).filter(s => s.role === "gsn").map(s => ({ id: s.id, code: s.code.toLowerCase(), name: s.name.toLowerCase() }));

    // Pre-filter: valid unit
    const hasUnitMapping = "unit_code" in fieldToCol;
    let filteredRows = dataRows;
    let unitFilteredCount = 0;
    if (hasUnitMapping) {
      filteredRows = dataRows.filter(row => {
        const unitVal = ev(row, "unit_code");
        if (!unitVal) return false;
        return !!findInList(unitList, unitVal);
      });
      unitFilteredCount = dataRows.length - filteredRows.length;
      if (unitFilteredCount > 0) addImportLog(entity, "error", `⚠ ${unitFilteredCount} registros descartados por Unidade inválida.`);
    }

    // Custom filter rules
    let customFilteredCount = 0;
    if (filterRules.length > 0) {
      const lookupLists = { unitList, esnList, gsnList };
      const before = filteredRows.length;
      filteredRows = filteredRows.filter(row => filterRules.every(rule => evaluateFilterRule(rule, row, fieldToCol, lookupLists, findInList)));
      customFilteredCount = before - filteredRows.length;
      if (customFilteredCount > 0) addImportLog(entity, "info", `🔍 ${customFilteredCount} registros removidos por filtros.`);
    }

    if (filteredRows.length === 0) {
      addImportLog(entity, "error", "Nenhum registro após filtros.");
      finishImportRun(entity, "error");
      return;
    }

    // Load existing clients
    addImportLog(entity, "info", "Carregando clientes existentes...");
    const existingMap = new Map<string, string>();
    let dbOffset = 0;
    while (true) {
      const { data: chunk } = await supabase.from("clients").select("id, code, store_code").range(dbOffset, dbOffset + 999);
      if (!chunk || chunk.length === 0) break;
      for (const c of chunk) existingMap.set(`${(c.code || "").trim()}|${(c.store_code || "").trim()}`, c.id);
      if (chunk.length < 1000) break;
      dbOffset += 1000;
    }

    const updateFieldsArr = Array.from(updateFields);
    const willUpdate = updateFieldsArr.length > 0;
    const allMappedKeys = Object.values(mapping);

    function buildPayload(row: any[], keys: string[]): Record<string, any> {
      const p: Record<string, any> = {};
      for (const key of keys) {
        const val = ev(row, key);
        if (key === "unit_code") p.unit_id = findInList(unitList, val || "");
        else if (key === "esn_code") p.esn_id = findInList(esnList, val || "");
        else if (key === "gsn_code") p.gsn_id = findInList(gsnList, val || "");
        else p[key] = val;
      }
      return p;
    }

    let imported = 0, updated = 0, skipped = 0, errors = 0;
    const cancelSignal = getCancelSignal("clients");
    const BATCH = 50;

    for (let b = 0; b < filteredRows.length; b += BATCH) {
      if (cancelSignal?.aborted) { addImportLog(entity, "info", "⛔ Importação interrompida."); break; }
      const batch = filteredRows.slice(b, b + BATCH);
      const toInsert: any[] = [];
      const toUpdate: { id: string; data: Record<string, any> }[] = [];

      for (const row of batch) {
        const code = ev(row, "code");
        const storeCode = ev(row, "store_code") || "";
        const key = `${code}|${storeCode}`;
        const existingId = existingMap.get(key);

        if (existingId) {
          if (willUpdate) {
            const upd = buildPayload(row, updateFieldsArr);
            const clean: Record<string, any> = {};
            for (const [k, v] of Object.entries(upd)) if (v != null && v !== "") clean[k] = v;
            if (Object.keys(clean).length > 0) toUpdate.push({ id: existingId, data: clean });
            else skipped++;
          } else skipped++;
        } else {
          const payload = buildPayload(row, allMappedKeys);
          payload.code = payload.code || code;
          payload.name = payload.name || ev(row, "name");
          payload.cnpj = ev(row, "cnpj") || "";
          if (!payload.store_code) payload.store_code = storeCode;
          toInsert.push({ ...payload, _key: key });
        }
      }

      if (toInsert.length > 0) {
        const clean = toInsert.map(({ _key, ...rest }) => rest);
        const { error: batchErr, data: insData } = await supabase.from("clients").insert(clean).select("id");
        if (batchErr) {
          for (let i = 0; i < clean.length; i++) {
            const { error } = await supabase.from("clients").insert(clean[i]);
            if (error) { errors++; addImportLog(entity, "error", `(${clean[i].code}): ${error.message}`); }
            else { imported++; existingMap.set(toInsert[i]._key, "new"); }
          }
        } else {
          imported += insData?.length || clean.length;
          for (const item of toInsert) existingMap.set(item._key, "new");
        }
      }

      for (const upd of toUpdate) {
        const { error } = await supabase.from("clients").update(upd.data).eq("id", upd.id);
        if (error) { errors++; addImportLog(entity, "error", `Update: ${error.message}`); }
        else updated++;
      }

      const totalSkipped = skipped + invalidRows + unitFilteredCount + customFilteredCount;
      updateImportStats(entity, { imported, updated, errors, skipped: totalSkipped });
    }

    const totalSkipped = skipped + invalidRows + unitFilteredCount + customFilteredCount;
    const wasCancelled = cancelSignal?.aborted;
    const finalStatus = wasCancelled ? "interrupted" : (errors > 0 && imported === 0 && updated === 0 ? "error" : "success");
    finishImportRun(entity, finalStatus as any);
    addImportLog(entity, "ok", `✅ Concluído — ${allDataRows.length} linhas | Inseridos: ${imported} | Atualizados: ${updated} | Ignorados: ${totalSkipped} | Erros: ${errors} | Tempo: ${formatDuration(Date.now() - importRun.startedAt)}`);
    if (imported > 0 || updated > 0) qc.invalidateQueries({ queryKey: ["clients"] });
    if (dbLogId) {
      await supabase.from("import_logs").update({
        status: finalStatus, total_rows: allDataRows.length, imported, updated, errors,
        skipped: totalSkipped, finished_at: new Date().toISOString(),
        duration_ms: Date.now() - importRun.startedAt,
        summary: `${imported} inseridos, ${updated} atualizados, ${errors} erros, ${totalSkipped} ignorados`,
      } as any).eq("id", dbLogId);
    }
  }

  // ── SALES TEAM import with mapped columns ─────────────────────
  async function runSalesTeamImportMapped(fieldToCol: Record<string, number>, ev: (row: any[], key: string) => any) {
    const entity: ImportEntity = "sales_team";
    const importRun = startImportRun(entity, file!.name, false);

    const dataRows = allDataRows.filter(r => ev(r, "code") && ev(r, "name"));
    updateImportStats(entity, { totalRows: dataRows.length });
    addImportLog(entity, "info", `${dataRows.length} registros válidos.`);

    importRun.totalRows = dataRows.length;
    let dbLogId: string | undefined;
    try {
      const { data } = await supabase.from("import_logs").insert({
        entity, file_name: file!.name, status: "running",
        total_rows: dataRows.length, cleared_before: false, user_id: user?.id || null,
      } as any).select("id").single();
      dbLogId = data?.id;
    } catch {}

    if (dataRows.length === 0) {
      addImportLog(entity, "error", "Nenhum registro válido.");
      finishImportRun(entity, "error");
      return;
    }

    const { data: units } = await supabase.from("unit_info").select("id, code, name");
    const unitList = (units || []).map(u => ({ id: u.id, code: (u.code || "").trim().toLowerCase(), name: u.name.trim().toLowerCase() }));

    function parseRole(cargo: string): "esn" | "gsn" | "arquiteto" | null {
      const c = cargo.toLowerCase().trim();
      if (c.includes("arquiteto") || c.includes("engenheiro de valor") || c.includes("ev")) return "arquiteto";
      if (c.includes("gsn") || c.includes("gerente")) return "gsn";
      if (c.includes("esn") || c.includes("executivo") || c.includes("vendedor")) return "esn";
      return null;
    }

    let imported = 0, updated = 0, errors = 0;
    const insertedCodeMap = new Map<string, string>();
    const cancelSignal = getCancelSignal(entity);

    for (let i = 0; i < dataRows.length; i++) {
      if (cancelSignal?.aborted) { addImportLog(entity, "info", "⛔ Interrompido."); break; }
      const row = dataRows[i];
      const code = ev(row, "code")!;
      const name = ev(row, "name")!;
      const roleText = ev(row, "role_text") || "";
      const email = ev(row, "email");
      const phone = ev(row, "phone");
      const unitVal = ev(row, "unit_code");
      const commissionVal = ev(row, "commission_pct");

      const role = parseRole(roleText);
      if (!role) { errors++; addImportLog(entity, "error", `Linha ${i + 2} (${code}): Cargo "${roleText}" não reconhecido. Valores aceitos: ESN, GSN, Arquiteto/Engenheiro de Valor.`); updateImportStats(entity, { errors }); continue; }

      const unit_id = unitVal ? findInList(unitList, unitVal) : null;
      if (unitVal && !unit_id) {
        addImportLog(entity, "error", `Linha ${i + 2} (${code}): Unidade "${unitVal}" não encontrada no cadastro. Verifique se a unidade está cadastrada.`);
      }

      const payload: any = { code, name, role, email, phone, unit_id };
      if (commissionVal) payload.commission_pct = parseFloat(commissionVal) || 3;

      const { data: existing } = await supabase.from("sales_team").select("id").eq("code", code).maybeSingle();
      if (existing) {
        const { error } = await supabase.from("sales_team").update(payload).eq("id", existing.id);
        if (error) { errors++; addImportLog(entity, "error", `Linha ${i + 2} (${code}): Erro ao atualizar — ${error.message}`); }
        else { insertedCodeMap.set(code.toLowerCase(), existing.id); updated++; addImportLog(entity, "info", `Linha ${i + 2} (${code}): Atualizado — ${name}${unit_id ? "" : unitVal ? " ⚠️ sem unidade" : ""}${!email ? " ⚠️ sem e-mail" : ""}`); }
      } else {
        const { data: ins, error } = await supabase.from("sales_team").insert(payload).select("id").single();
        if (error) { errors++; addImportLog(entity, "error", `Linha ${i + 2} (${code}): Erro ao inserir — ${error.message}`); }
        else if (ins) { insertedCodeMap.set(code.toLowerCase(), ins.id); imported++; addImportLog(entity, "info", `Linha ${i + 2} (${code}): Inserido — ${name}${unit_id ? "" : unitVal ? " ⚠️ sem unidade" : ""}${!email ? " ⚠️ sem e-mail" : ""}`); }
      }
      updateImportStats(entity, { imported, updated, errors });
    }

    // Link GSNs
    addImportLog(entity, "info", "Vinculando GSNs...");
    const { data: allTeam } = await supabase.from("sales_team").select("id, code, name");
    const teamMap = new Map<string, string>();
    for (const t of (allTeam || [])) {
      teamMap.set(t.code.trim().toLowerCase(), t.id);
      teamMap.set(t.name.trim().toLowerCase(), t.id);
    }

    let linked = 0, gsnNotFound = 0;
    for (const row of dataRows) {
      const code = (ev(row, "code") || "").toLowerCase();
      const gsnCode = (ev(row, "gsn_code") || "").toLowerCase();
      const gsnName = (ev(row, "gsn_name") || "").toLowerCase();
      const memberId = teamMap.get(code);
      if (!gsnCode && !gsnName) continue; // no GSN info provided
      const gsnId = (gsnCode && teamMap.get(gsnCode)) || (gsnName && teamMap.get(gsnName));
      if (memberId && gsnId) {
        await supabase.from("sales_team").update({ linked_gsn_id: gsnId }).eq("id", memberId);
        linked++;
      } else if (memberId && !gsnId) {
        gsnNotFound++;
        addImportLog(entity, "error", `GSN não encontrado para ${ev(row, "code")}: código="${ev(row, "gsn_code") || ""}" nome="${ev(row, "gsn_name") || ""}". Verifique se o GSN está cadastrado.`);
      }
    }
    addImportLog(entity, "info", `${linked} vínculos GSN resolvidos${gsnNotFound > 0 ? `, ${gsnNotFound} GSN(s) não encontrado(s)` : ""}.`);

    const finalStatus = errors > 0 && imported === 0 && updated === 0 ? "error" : "success";
    finishImportRun(entity, cancelSignal?.aborted ? "interrupted" : finalStatus);
    const dur = Date.now() - importRun.startedAt;
    addImportLog(entity, "ok", `✅ Concluído — ${imported} inseridos, ${updated} atualizados, ${errors} erros | Tempo: ${formatDuration(dur)}`);
    if (imported > 0 || updated > 0) qc.invalidateQueries({ queryKey: ["sales_team"] });
    if (dbLogId) await supabase.from("import_logs").update({
      status: finalStatus, total_rows: dataRows.length, imported, updated, errors,
      finished_at: new Date().toISOString(), duration_ms: dur,
      summary: `${imported} inseridos, ${updated} atualizados, ${errors} erros`,
    } as any).eq("id", dbLogId);
  }

  // ── TEMPLATE import with mapped columns ───────────────────────
  async function runTemplateImportMapped(fieldToCol: Record<string, number>, ev: (row: any[], key: string) => any) {
    const entity: ImportEntity = "templates";
    const importRun = startImportRun(entity, file!.name, false);

    const dataRows = allDataRows.filter(r => ev(r, "template_name") && ev(r, "item_type") && ev(r, "description"));
    updateImportStats(entity, { totalRows: dataRows.length });
    addImportLog(entity, "info", `${dataRows.length} linhas de dados.`);

    importRun.totalRows = dataRows.length;
    let dbLogId: string | undefined;
    try {
      const { data } = await supabase.from("import_logs").insert({
        entity, file_name: file!.name, status: "running",
        total_rows: dataRows.length, cleared_before: false, user_id: user?.id || null,
      } as any).select("id").single();
      dbLogId = data?.id;
    } catch {}

    if (dataRows.length === 0) {
      addImportLog(entity, "error", "Nenhum registro válido.");
      finishImportRun(entity, "error");
      return;
    }

    // Group by template name
    const templateGroups = new Map<string, { product: string; category: string; items: any[] }>();
    for (const row of dataRows) {
      const tplName = ev(row, "template_name")!;
      const product = ev(row, "product") || "";
      const category = ev(row, "category") || "";
      const tipo = (ev(row, "item_type") || "").toUpperCase();
      const desc = ev(row, "description")!;
      const hours = Number(ev(row, "hours")) || 0;
      const parentDesc = ev(row, "parent_desc") || "";
      if (!templateGroups.has(tplName)) templateGroups.set(tplName, { product, category, items: [] });
      templateGroups.get(tplName)!.items.push({ tipo, desc, hours, parentDesc });
    }

    let imported = 0, errors = 0;
    for (const [tplName, group] of templateGroups) {
      const { data: tpl, error: tplErr } = await supabase.from("scope_templates").insert({
        name: tplName, product: group.product, category: group.category,
      }).select("id").single();
      if (tplErr || !tpl) { errors++; addImportLog(entity, "error", `Template "${tplName}": ${tplErr?.message}`); updateImportStats(entity, { errors }); continue; }

      const processes = group.items.filter(i => i.tipo === "P");
      const processIdMap = new Map<string, string>();
      let sortOrder = 0;
      for (const proc of processes) {
        const { data: ins, error } = await supabase.from("scope_template_items").insert({
          template_id: tpl.id, description: proc.desc, default_hours: proc.hours, sort_order: sortOrder++, parent_id: null,
        }).select("id").single();
        if (error) addImportLog(entity, "error", `Item "${proc.desc}": ${error.message}`);
        else if (ins) processIdMap.set(proc.desc.toLowerCase(), ins.id);
      }
      for (const sub of group.items.filter(i => i.tipo === "S")) {
        const parentId = processIdMap.get(sub.parentDesc.toLowerCase());
        if (!parentId) { addImportLog(entity, "error", `Sub-item "${sub.desc}": pai "${sub.parentDesc}" não encontrado.`); continue; }
        await supabase.from("scope_template_items").insert({
          template_id: tpl.id, description: sub.desc, default_hours: sub.hours, sort_order: sortOrder++, parent_id: parentId,
        });
      }
      imported++;
      updateImportStats(entity, { imported });
      addImportLog(entity, "ok", `Template "${tplName}" importado.`);
    }

    const finalStatus = errors > 0 && imported === 0 ? "error" : "success";
    finishImportRun(entity, finalStatus);
    const dur = Date.now() - importRun.startedAt;
    addImportLog(entity, "ok", `✅ Concluído — ${imported} templates, ${errors} erros | Tempo: ${formatDuration(dur)}`);
    if (imported > 0) { qc.invalidateQueries({ queryKey: ["scope_templates"] }); qc.invalidateQueries({ queryKey: ["scope_template_items"] }); }
    if (dbLogId) await supabase.from("import_logs").update({
      status: finalStatus, total_rows: dataRows.length, imported, errors,
      finished_at: new Date().toISOString(), duration_ms: dur,
      summary: `${imported} templates importados, ${errors} erros`,
    } as any).eq("id", dbLogId);
  }

  // ── SALES TARGETS import with mapped columns ──────────────────
  async function runSalesTargetsImportMapped(fieldToCol: Record<string, number>, ev: (row: any[], key: string) => any) {
    const entity: ImportEntity = "sales_targets";
    const importRun = startImportRun(entity, file!.name, false);
    const year = Number(targetYear);

    const dataRows = allDataRows.filter(r => ev(r, "esn_code"));
    updateImportStats(entity, { totalRows: dataRows.length });
    addImportLog(entity, "info", `${dataRows.length} linhas com código ESN. Ano: ${year}`);

    importRun.totalRows = dataRows.length;
    let dbLogId: string | undefined;
    try {
      const { data } = await supabase.from("import_logs").insert({
        entity, file_name: file!.name, status: "running",
        total_rows: dataRows.length, cleared_before: false, user_id: user?.id || null,
      } as any).select("id").single();
      dbLogId = data?.id;
    } catch {}

    if (dataRows.length === 0) {
      addImportLog(entity, "error", "Nenhum ESN encontrado.");
      finishImportRun(entity, "error");
      return;
    }

    // Load ESN map
    const { data: salesTeam } = await supabase.from("sales_team").select("id, code, name, role");
    const esnMap = new Map<string, string>();
    for (const s of (salesTeam || [])) {
      if (s.role === "esn") {
        esnMap.set(s.code.trim().toLowerCase(), s.id);
        esnMap.set(s.name.trim().toLowerCase(), s.id);
      }
    }

    let imported = 0, updated = 0, errors = 0, skipped = 0;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const esnCode = (ev(row, "esn_code") || "").trim().toLowerCase();
      const esnName = (ev(row, "esn_name") || "").trim().toLowerCase();
      const esnId = esnMap.get(esnCode) || esnMap.get(esnName);

      if (!esnId) {
        errors++;
        addImportLog(entity, "error", `Linha ${i + 2}: ESN "${ev(row, "esn_code")}" não encontrado.`);
        updateImportStats(entity, { errors });
        continue;
      }

      for (let m = 1; m <= 12; m++) {
        const val = ev(row, `month_${m}`);
        const amount = Number(val) || 0;
        if (amount === 0) { skipped++; continue; }

        const { data: existing } = await supabase.from("sales_targets").select("id")
          .eq("esn_id", esnId).eq("year", year).eq("month", m).maybeSingle();

        if (existing) {
          const { error } = await supabase.from("sales_targets").update({ amount }).eq("id", existing.id);
          if (error) { errors++; } else { updated++; }
        } else {
          const { error } = await supabase.from("sales_targets").insert({ esn_id: esnId, year, month: m, amount });
          if (error) { errors++; } else { imported++; }
        }
      }
      updateImportStats(entity, { imported, updated, errors, skipped });
    }

    const finalStatus = errors > 0 && imported === 0 && updated === 0 ? "error" : "success";
    finishImportRun(entity, finalStatus);
    const dur = Date.now() - importRun.startedAt;
    addImportLog(entity, "ok", `✅ Concluído — ${imported} inseridos, ${updated} atualizados, ${skipped} zerados, ${errors} erros | Tempo: ${formatDuration(dur)}`);
    if (imported > 0 || updated > 0) qc.invalidateQueries({ queryKey: ["sales_targets"] });
    if (dbLogId) await supabase.from("import_logs").update({
      status: finalStatus, total_rows: dataRows.length, imported, updated, errors, skipped,
      finished_at: new Date().toISOString(), duration_ms: dur,
      summary: `${imported} inseridos, ${updated} atualizados, ${errors} erros`,
    } as any).eq("id", dbLogId);
  }

  // ── AI Filter prompt ──────────────────────────────────────────
  const handleFilterPrompt = useCallback(async () => {
    if (!filterPrompt.trim()) return;
    setFilterLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-import-filter", {
        body: { prompt: filterPrompt.trim(), existingRules: filterRules },
      });
      if (error) throw error;
      if (data?.rules) {
        setFilterRules(data.rules);
        setFilterPrompt("");
        toast({ title: "Regras atualizadas", description: `${data.rules.length} regra(s) configurada(s).` });
      }
    } catch (err: any) {
      toast({ title: "Erro ao processar regra", description: err.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setFilterLoading(false);
    }
  }, [filterPrompt, filterRules, toast]);

  const handleSaveFilterPreset = useCallback(() => {
    if (filterRules.length === 0) return;
    const preset: SavedFilterPreset = {
      id: crypto.randomUUID(),
      name: `Filtro ${new Date().toLocaleDateString("pt-BR")}`,
      entity: detectedEntity,
      rules: filterRules,
      createdAt: Date.now(),
    };
    saveFilterPreset(preset);
    setSavedPresets(loadSavedFilterPresets(detectedEntity));
    toast({ title: "Preset salvo" });
  }, [filterRules, detectedEntity, toast]);

  // ── Reset ─────────────────────────────────────────────────────
  const reset = () => {
    setStep("upload");
    setFile(null);
    setSheetNames([]);
    setHeaders([]);
    setHeaderRowIdx(0);
    setPreviewRows([]);
    setAllDataRows([]);
    setRawWorkbook(null);
    setMapping({});
    setUpdateFields(new Set());
    setLayoutRestored(false);
    setLayoutSaved(false);
    setFilterRules([]);
    setFilterPrompt("");
    setDetectionResults([]);
  };

  const mappedCount = Object.keys(mapping).length;
  const requiredMapped = dbFields.filter(f => f.required).every(f => Object.values(mapping).includes(f.key));
  const isRunning = run?.status === "running";
  const EntityIcon = entityConfig.icon;

  // ── Render ────────────────────────────────────────────────────
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shrink-0">
            <Wand2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base truncate">Importação Inteligente</CardTitle>
            <CardDescription className="truncate">Carregue qualquer planilha — o sistema identifica os dados e mapeia automaticamente</CardDescription>
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1 mt-3">
          {(["upload", "confirm", "mapping", "options", "running"] as Step[]).map((s, i) => {
            const labels = ["Arquivo", "Tipo", "Mapeamento", "Opções", "Importação"];
            const icons = [Upload, Eye, Settings2, Filter, Play];
            const Icon = icons[i];
            const isActive = step === s || (step === "done" && s === "running");
            const isPast = ["upload", "confirm", "mapping", "options", "running"].indexOf(step) > i || step === "done";
            return (
              <div key={s} className="flex items-center gap-1 flex-1">
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors w-full justify-center
                  ${isActive ? "bg-primary text-primary-foreground" : isPast ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                  <Icon className="h-3 w-3 shrink-0" />
                  <span className="hidden sm:inline truncate">{labels[i]}</span>
                </div>
                {i < 4 && <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />}
              </div>
            );
          })}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── STEP: Upload ───────────────────────────────────── */}
        {step === "upload" && (
          <div
            className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm font-medium">Clique para selecionar ou arraste um arquivo</p>
            <p className="text-xs text-muted-foreground mt-1">.xlsx ou .xls — Clientes, Time de Vendas, Templates ou Metas</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }} />
          </div>
        )}

        {/* ── STEP: Confirm entity ───────────────────────────── */}
        {step === "confirm" && (
          <>
            <div className="text-sm mb-2">
              <span className="font-medium">{file?.name}</span>
              <span className="text-muted-foreground ml-2">({allDataRows.length} linhas · {sheetNames.length} aba(s))</span>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Tipo de dados detectado</span>
              </div>
              <p className="text-xs text-muted-foreground">
                O sistema analisou as colunas da planilha e identificou o tipo de dados. Confirme ou selecione o tipo correto:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(["clients", "sales_team", "templates", "sales_targets"] as ImportEntity[]).map(entity => {
                  const config = ENTITY_CONFIGS[entity];
                  const Icon = config.icon;
                  const detection = detectionResults.find(d => d.entity === entity);
                  const isSelected = detectedEntity === entity;
                  return (
                    <button
                      key={entity}
                      onClick={() => setDetectedEntity(entity)}
                      className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-all ${
                        isSelected
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-border hover:border-primary/30 hover:bg-muted/30"
                      }`}
                    >
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                        isSelected ? "bg-primary text-primary-foreground" : "bg-muted"
                      }`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{config.label}</span>
                          {detection && detection.confidence > 20 && (
                            <Badge variant={detection.confidence >= 50 ? "default" : "outline"} className="text-[10px]">
                              {detection.confidence}% match
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{config.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Preview */}
            {previewRows.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="text-xs font-medium px-3 py-1.5 bg-muted/50 text-muted-foreground">
                  Prévia das primeiras linhas
                </div>
                <ScrollArea className="max-h-[120px] w-full">
                  <div className="min-w-max">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          {headers.map((h, i) => (
                            <th key={i} className="px-2 py-1 text-left font-medium whitespace-nowrap text-muted-foreground">{h || `Col ${i + 1}`}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.slice(0, 3).map((row, ri) => (
                          <tr key={ri} className="border-b last:border-0">
                            {headers.map((_, ci) => (
                              <td key={ci} className="px-2 py-1 whitespace-nowrap max-w-[200px] truncate">{String(row[ci] ?? "")}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </div>
            )}

            <div className="flex gap-2 justify-between">
              <Button variant="outline" size="sm" onClick={reset}>
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Voltar
              </Button>
              <Button size="sm" onClick={() => confirmEntity(detectedEntity)}>
                Confirmar e Mapear <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          </>
        )}

        {/* ── STEP: Mapping ──────────────────────────────────── */}
        {step === "mapping" && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-sm min-w-0">
                <EntityIcon className="h-4 w-4 text-primary shrink-0" />
                <span className="font-medium truncate">{entityConfig.label}</span>
                <span className="text-muted-foreground">— {file?.name} ({allDataRows.length} linhas)</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {layoutRestored && (
                  <Badge variant="outline" className="text-xs border-green-500/50 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Layout restaurado
                  </Badge>
                )}
                <Badge variant={requiredMapped ? "default" : "destructive"} className="text-xs">
                  {mappedCount} colunas mapeadas
                </Badge>
              </div>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_minmax(160px,200px)] gap-x-2 items-center px-3 py-1.5 bg-muted/50 text-xs font-medium text-muted-foreground border-b">
                <span>Coluna da Planilha</span>
                <span></span>
                <span>Campo do Sistema</span>
              </div>
              <div className="max-h-[350px] overflow-y-auto">
                <div className="divide-y divide-border">
                  {headers.map((header, colIdx) => {
                    if (!header && !previewRows.some(r => r[colIdx] != null && String(r[colIdx]).trim() !== "")) return null;
                    const isMapped = !!mapping[colIdx];
                    return (
                      <div key={colIdx} className={`grid grid-cols-[1fr_auto_minmax(160px,200px)] gap-x-2 items-center px-3 py-2 transition-colors ${isMapped ? "bg-primary/5" : "hover:bg-muted/30"}`}>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{header || `(Coluna ${colIdx + 1})`}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {previewRows.slice(0, 2).map(r => String(r[colIdx] ?? "")).filter(Boolean).join(" · ") || "—"}
                          </div>
                        </div>
                        <ArrowRight className={`h-3.5 w-3.5 shrink-0 ${isMapped ? "text-primary" : "text-muted-foreground/40"}`} />
                        <Select
                          value={mapping[colIdx] || "__none__"}
                          onValueChange={val => {
                            setMapping(prev => {
                              const next = { ...prev };
                              if (val === "__none__") { delete next[colIdx]; }
                              else {
                                for (const [k, v] of Object.entries(next)) {
                                  if (v === val && Number(k) !== colIdx) delete next[Number(k)];
                                }
                                next[colIdx] = val;
                              }
                              return next;
                            });
                            setLayoutSaved(false);
                          }}
                        >
                          <SelectTrigger className="w-full text-xs h-8">
                            <SelectValue placeholder="Ignorar" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Ignorar —</SelectItem>
                            {dbFields.map(f => {
                              const usedByOther = Object.entries(mapping).some(([k, v]) => v === f.key && Number(k) !== colIdx);
                              return (
                                <SelectItem key={f.key} value={f.key} disabled={usedByOther}>
                                  {f.label} {f.required && "*"} {usedByOther && "(usado)"}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Preview table */}
            {previewRows.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="text-xs font-medium px-3 py-1.5 bg-muted/50 text-muted-foreground">
                  Prévia (primeiras {Math.min(previewRows.length, 5)} linhas)
                </div>
                <ScrollArea className="max-h-[150px] w-full">
                  <div className="min-w-max">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          {headers.map((h, i) => (
                            <th key={i} className="px-2 py-1 text-left font-medium whitespace-nowrap">
                              {mapping[i] ? (
                                <span className="text-primary">{dbFields.find(f => f.key === mapping[i])?.label || h}</span>
                              ) : (
                                <span className="text-muted-foreground line-through">{h}</span>
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.slice(0, 5).map((row, ri) => (
                          <tr key={ri} className="border-b last:border-0">
                            {headers.map((_, ci) => (
                              <td key={ci} className={`px-2 py-1 whitespace-nowrap max-w-[200px] truncate ${mapping[ci] ? "" : "text-muted-foreground/50"}`}>
                                {String(row[ci] ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </div>
            )}

            <div className="flex gap-2 justify-between flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setStep("confirm")}>
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Voltar
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleSaveLayout} disabled={layoutSaved}>
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  {layoutSaved ? "Salvo" : "Salvar Layout"}
                </Button>
                <Button size="sm" disabled={!requiredMapped} onClick={() => setStep("options")}>
                  Próximo <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}

        {/* ── STEP: Options ──────────────────────────────────── */}
        {step === "options" && (
          <>
            {/* Update fields (for clients & sales_team) */}
            {(detectedEntity === "clients" || detectedEntity === "sales_team") && (
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Campos para atualizar em registros existentes</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Quando um registro já existir na base, marque quais campos deseja sobrescrever.
                </p>
                <Separator />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {dbFields.filter(f => !f.required && Object.values(mapping).includes(f.key)).map(f => (
                    <div key={f.key} className="flex items-center gap-2">
                      <Checkbox
                        id={`upd-${f.key}`}
                        checked={updateFields.has(f.key)}
                        onCheckedChange={checked => {
                          setUpdateFields(prev => {
                            const next = new Set(prev);
                            if (checked) next.add(f.key); else next.delete(f.key);
                            return next;
                          });
                        }}
                      />
                      <Label htmlFor={`upd-${f.key}`} className="text-sm cursor-pointer">{f.label}</Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Year selector for sales_targets */}
            {detectedEntity === "sales_targets" && (
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Configuração de Metas</span>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Ano da meta:</Label>
                  <Select value={targetYear} onValueChange={setTargetYear}>
                    <SelectTrigger className="w-[100px] h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - 1 + i)).map(y => (
                        <SelectItem key={y} value={y}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* AI Filter Rules (for clients) */}
            {detectedEntity === "clients" && (
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Regras de Pré-filtro</span>
                  <Badge variant="outline" className="text-xs">{filterRules.length} regra(s)</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Descreva em linguagem natural quais registros devem ser importados.
                </p>
                <div className="flex gap-2">
                  <Textarea
                    placeholder='Ex: "Importar apenas clientes com unidade válida"'
                    value={filterPrompt}
                    onChange={e => setFilterPrompt(e.target.value)}
                    className="min-h-[60px] text-sm resize-none flex-1"
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleFilterPrompt(); } }}
                  />
                  <Button size="sm" onClick={handleFilterPrompt} disabled={!filterPrompt.trim() || filterLoading} className="self-end">
                    {filterLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  </Button>
                </div>

                {savedPresets.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-xs text-muted-foreground font-medium">Presets salvos:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {savedPresets.map(preset => (
                        <div key={preset.id} className="flex items-center gap-1">
                          <Button variant="outline" size="sm" className="text-xs h-7 px-2"
                            onClick={() => { setFilterRules(preset.rules); toast({ title: "Preset aplicado" }); }}>
                            <Filter className="h-3 w-3 mr-1" /> {preset.name} ({preset.rules.length})
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => { deleteFilterPreset(preset.id); setSavedPresets(loadSavedFilterPresets(detectedEntity)); }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {filterRules.length > 0 && (
                  <div className="space-y-1.5">
                    <Separator />
                    <div className="space-y-1">
                      {filterRules.map((rule, idx) => {
                        const fieldLabel = dbFields.find(f => f.key === rule.field)?.label || rule.field;
                        return (
                          <div key={idx} className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs">
                            <Filter className="h-3 w-3 text-primary shrink-0" />
                            <span className="flex-1 min-w-0">
                              <span className="font-medium">{fieldLabel}</span>{" "}
                              <span className="text-muted-foreground">{OPERATOR_LABELS[rule.operator] || rule.operator}</span>
                              {rule.value && <span className="font-medium text-primary"> "{rule.value}"</span>}
                              <span className="text-muted-foreground ml-2">— {rule.description}</span>
                            </span>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                              onClick={() => setFilterRules(prev => prev.filter((_, i) => i !== idx))}>
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="text-xs h-7" onClick={handleSaveFilterPreset}>
                        <Save className="h-3 w-3 mr-1" /> Salvar Preset
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs h-7 text-destructive" onClick={() => setFilterRules([])}>
                        <Trash2 className="h-3 w-3 mr-1" /> Limpar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Relationship warning */}
            {(Object.values(mapping).includes("unit_code") || Object.values(mapping).includes("esn_code") || Object.values(mapping).includes("gsn_code")) && (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-1">
                <div className="flex items-center gap-2 text-xs font-medium text-yellow-700 dark:text-yellow-400">
                  <XCircle className="h-3.5 w-3.5 shrink-0" />
                  Campos relacionais detectados
                </div>
                <p className="text-xs text-muted-foreground">
                  Os campos Unidade, ESN e GSN serão vinculados por código ou nome. Registros sem correspondência terão esses campos importados como vazio.
                </p>
              </div>
            )}

            {/* Summary */}
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
              <div className="text-sm font-medium flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" /> Resumo da importação
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">Tipo:</span> <span className="font-medium">{entityConfig.label}</span></div>
                <div><span className="text-muted-foreground">Arquivo:</span> <span className="font-medium truncate">{file?.name}</span></div>
                <div><span className="text-muted-foreground">Linhas:</span> <span className="font-medium">{allDataRows.length}</span></div>
                <div><span className="text-muted-foreground">Campos mapeados:</span> <span className="font-medium">{mappedCount}</span></div>
                {detectedEntity === "sales_targets" && (
                  <div><span className="text-muted-foreground">Ano:</span> <span className="font-medium">{targetYear}</span></div>
                )}
                {filterRules.length > 0 && (
                  <div><span className="text-muted-foreground">Filtros:</span> <span className="font-medium">{filterRules.length}</span></div>
                )}
              </div>
            </div>

            <div className="flex gap-2 justify-between">
              <Button variant="outline" size="sm" onClick={() => setStep("mapping")}>
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Voltar
              </Button>
              <Button size="sm" onClick={runImport}>
                <Play className="mr-1.5 h-3.5 w-3.5" /> Iniciar Importação
              </Button>
            </div>
          </>
        )}

        {/* ── STEP: Running / Done ───────────────────────────── */}
        {(step === "running" || step === "done") && run && (
          <RunningView run={run} onReset={reset} isDone={step === "done"} />
        )}
      </CardContent>
    </Card>
  );
}

// ── Running/Done sub-component ──────────────────────────────────
function RunningView({ run, onReset, isDone }: { run: ImportRun; onReset: () => void; isDone: boolean }) {
  const [showLog, setShowLog] = useState(true);
  const isRunning = run.status === "running";
  const progress = run.totalRows > 0 ? ((run.imported + run.updated + run.errors) / run.totalRows * 100) : 0;

  return (
    <div className="space-y-3">
      {isRunning && (
        <div className="space-y-2">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{run.imported + run.updated + run.errors} / {run.totalRows} registros</span>
              <span>{progress.toFixed(0)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
          <Button variant="destructive" size="sm" className="w-full" onClick={() => requestCancelImport(run.entity)}>
            <XCircle className="mr-1.5 h-3.5 w-3.5" /> Interromper Importação
          </Button>
        </div>
      )}

      {!isRunning && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-success" />
              <span className="text-muted-foreground">Inseridos:</span>
              <span className="font-medium">{run.imported}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-primary" />
              <span className="text-muted-foreground">Atualizados:</span>
              <span className="font-medium">{run.updated}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-destructive" />
              <span className="text-muted-foreground">Erros:</span>
              <span className="font-medium">{run.errors}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">Tempo:</span>
              <span className="font-medium">{formatDuration(run.durationMs || 0)}</span>
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Taxa de êxito</span>
            <div className="flex items-center gap-2">
              <Progress value={run.totalRows > 0 ? (run.imported + run.updated) / run.totalRows * 100 : 0} className="h-1.5 w-20" />
              <span className="font-semibold">{run.totalRows > 0 ? ((run.imported + run.updated) / run.totalRows * 100).toFixed(1) : 0}%</span>
            </div>
          </div>
        </div>
      )}

      {run.logs.length > 0 && (
        <div>
          <button onClick={() => setShowLog(!showLog)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full">
            {showLog ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Log ({run.logs.length} entradas)
          </button>
          {showLog && (
            <ScrollArea className="mt-2 h-40 rounded-md border border-border bg-muted/20 p-2">
              <div className="space-y-0.5 font-mono text-[11px]">
                {run.logs.map((entry, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    {entry.status === "ok" && <CheckCircle2 className="h-3 w-3 text-success shrink-0 mt-0.5" />}
                    {entry.status === "error" && <XCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />}
                    {entry.status === "info" && <FileSpreadsheet className="h-3 w-3 text-primary shrink-0 mt-0.5" />}
                    <span className={entry.status === "ok" ? "text-success" : entry.status === "error" ? "text-destructive" : "text-muted-foreground"}>
                      {entry.message}
                    </span>
                  </div>
                ))}
                {isRunning && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Processando...
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      )}

      {isDone && (
        <Button variant="outline" size="sm" onClick={onReset} className="w-full">
          Nova Importação
        </Button>
      )}
    </div>
  );
}

function formatDurationUtil(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}min ${s % 60}s`;
}
