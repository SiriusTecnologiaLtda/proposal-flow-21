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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Upload, Wand2, ArrowRight, ArrowLeft, CheckCircle2, XCircle, Loader2,
  FileSpreadsheet, Clock, ChevronDown, ChevronUp, Play, Settings2, Eye, Save,
  Sparkles, Filter, Trash2, AlertTriangle, Link2, Target
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
import {
  type DbField,
  type EntityConfig,
  type RelationalFieldDef,
  type FilterRule,
  type SavedFilterPreset,
  type SavedLayout,
  type ValidationResult,
  type AliasStore,
  type UnresolvedRelation,
  ENTITY_CONFIGS,
  RELATIONAL_FIELDS,
  OPERATOR_LABELS,
  autoMapColumns,
  detectEntity,
  detectHeaderRow,
  getHeaderSignature,
  validateImportStructure,
  evaluateFilterRule,
  loadSavedLayouts,
  saveLayout,
  findMatchingLayout,
  loadSavedFilterPresets,
  saveFilterPreset,
  deleteFilterPreset,
  loadAliasStore,
  saveAliasStore,
  getAliasKey,
  formatDuration,
  normalize,
  findInList,
  findInListWithAlias,
  parseRole,
  buildClientPayload,
} from "./importSchemas";
import {
  collectSalesTargetUnitCandidates,
  getSalesTargetCrmAssociationDecision,
} from "./salesTargetsImportUtils";

// ─── CRM codes cache (loaded once per session) ─────────────────
let _crmCodesCache: { code: string; sales_team_id: string; unit_id: string | null }[] | null = null;

async function loadCrmCodes(): Promise<{ code: string; sales_team_id: string; unit_id: string | null }[]> {
  if (_crmCodesCache) return _crmCodesCache;
  const { data } = await supabase.from("sales_team_crm_codes").select("code, sales_team_id, unit_id");
  _crmCodesCache = (data || []).map(c => ({
    code: c.code.trim().toLowerCase(),
    sales_team_id: c.sales_team_id,
    unit_id: c.unit_id,
  }));
  return _crmCodesCache;
}

function invalidateCrmCache() { _crmCodesCache = null; }

// Lookup helpers are now imported from importSchemas.ts

// ─── Steps ──────────────────────────────────────────────────────
type Step = "upload" | "confirm" | "mapping" | "options" | "preview" | "running" | "done";

// ─── Dry-run result ─────────────────────────────────────────────
export interface DryRunResult {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  toInsert: number;
  toUpdate: number;
  toSkip: number;
  blockers: string[];
  warnings: string[];
  unresolvedRelations: { field: string; value: string; count: number }[];
  details: { line: number; action: "insert" | "update" | "skip" | "error"; reason: string }[];
}

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
  const [targetCategoryId, setTargetCategoryId] = useState<string>("");
  const [targetSegmentId, setTargetSegmentId] = useState<string>("");
  const [targetRole, setTargetRole] = useState<string>("esn");
  const [clearExistingTargets, setClearExistingTargets] = useState(false);
  const [categoriesList, setCategoriesList] = useState<{ id: string; name: string }[]>([]);
  const [segmentsList, setSegmentsList] = useState<{ id: string; name: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { getImport } = useImportStore();
  const run = getImport(detectedEntity);

  // Relational resolution state
  const [showResolutionDialog, setShowResolutionDialog] = useState(false);
  const [unresolvedItems, setUnresolvedItems] = useState<UnresolvedRelation[]>([]);
  const [resolutionSelections, setResolutionSelections] = useState<Record<string, string>>({});
  const [lookupListsCache, setLookupListsCache] = useState<{
    unitList: { id: string; code: string; name: string }[];
    esnList: { id: string; code: string; name: string }[];
    gsnList: { id: string; code: string; name: string }[];
    salesTeamList: { id: string; code: string; name: string }[];
    categoryList: { id: string; code: string; name: string }[];
    segmentList: { id: string; code: string; name: string }[];
  }>({ unitList: [], esnList: [], gsnList: [], salesTeamList: [], categoryList: [], segmentList: [] });
  const [crmCodesCache, setCrmCodesCache] = useState<{ code: string; sales_team_id: string; unit_id: string | null }[]>([]);
  const [scanningRelations, setScanningRelations] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [aliasStore, setAliasStore] = useState<AliasStore>(loadAliasStore);

  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [dryRunLoading, setDryRunLoading] = useState(false);

  const entityConfig = ENTITY_CONFIGS[detectedEntity];
  const dbFields = entityConfig.dbFields;

  // Load categories and segments for sales_targets
  useEffect(() => {
    if (detectedEntity === "sales_targets") {
      supabase.from("categories").select("id, name").then(({ data }) => {
        setCategoriesList(data || []);
        if (data && data.length > 0 && !targetCategoryId) {
          const scs = data.find(c => c.name.toUpperCase() === "SCS");
          setTargetCategoryId(scs?.id || data[0].id);
        }
      });
      supabase.from("software_segments").select("id, name").then(({ data }) => {
        setSegmentsList(data || []);
        if (data && data.length > 0 && !targetSegmentId) {
          const servicos = data.find(s => s.name.toUpperCase() === "SERVICOS" || s.name.toUpperCase() === "SERVIÇOS");
          setTargetSegmentId(servicos?.id || data[0].id);
        }
      });
    }
  }, [detectedEntity]);

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

      const results = detectEntity(hdrs, wb.SheetNames);
      setDetectionResults(results);
      if (results.length > 0) setDetectedEntity(results[0].entity);

      setStep("confirm");
    } catch (err: any) {
      toast({ title: "Erro ao ler arquivo", description: err.message, variant: "destructive" });
    }
  }, [toast]);

  // ── When entity confirmed, apply mapping ──────────────────────
  const confirmEntity = useCallback((entity: ImportEntity) => {
    setDetectedEntity(entity);
    const fields = ENTITY_CONFIGS[entity].dbFields;

    // Use a local variable so layout matching uses the correct (possibly updated) headers
    let currentHeaders = headers;

    if (entity === "sales_targets" && rawWorkbook) {
      const specificSheet = rawWorkbook.SheetNames.find(s => s.includes("BASE DE DADOS") && s.includes("Time Comercial"));
      if (specificSheet) {
        const ws = rawWorkbook.Sheets[specificSheet];
        const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const hdrIdx = detectHeaderRow(raw);
        setHeaderRowIdx(hdrIdx);
        const hdrs = (raw[hdrIdx] || []).map((h: any) => String(h || "").trim());
        setHeaders(hdrs);
        currentHeaders = hdrs;
        const data = raw.slice(hdrIdx + 1).filter(r => r.some(c => c != null && c !== ""));
        setAllDataRows(data);
        setPreviewRows(data.slice(0, 5));
      }
    }

    const savedLayout = findMatchingLayout(currentHeaders, entity);
    let autoMap: Record<number, string>;
    if (savedLayout) {
      autoMap = savedLayout.mapping;
      setLayoutRestored(true);
      toast({ title: "Layout restaurado", description: `Mapeamento "${savedLayout.name}" aplicado automaticamente.` });
    } else {
      autoMap = autoMapColumns(currentHeaders, fields);
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

  // ── Pre-scan for unresolved relational values ─────────────────
  const preScanRelations = useCallback(async () => {
    try {
    const relFields = RELATIONAL_FIELDS[detectedEntity];
    if (!relFields || relFields.length === 0) return true; // no relational fields, proceed

    const fieldToCol: Record<string, number> = {};
    for (const [colStr, field] of Object.entries(mapping)) {
      fieldToCol[field] = Number(colStr);
    }

    // Check which relational fields are actually mapped
    const mappedRelFields = relFields.filter(rf => rf.fieldKey in fieldToCol);
    if (mappedRelFields.length === 0) return true;

    setScanningRelations(true);

    // Always invalidate CRM cache before pre-scan to ensure fresh data on re-imports
    invalidateCrmCache();

    // Load lookup lists + CRM codes
    const [{ data: units }, { data: salesTeam }, { data: categories }, { data: segments }, crmCodes] = await Promise.all([
      supabase.from("unit_info").select("id, code, name"),
      supabase.from("sales_team").select("id, code, name, role"),
      supabase.from("categories").select("id, name"),
      supabase.from("software_segments").select("id, name"),
      loadCrmCodes(),
    ]);
    setCrmCodesCache(crmCodes);
    const unitList = (units || []).map(u => ({ id: u.id, code: (u.code || "").trim().toLowerCase(), name: u.name.trim().toLowerCase() }));
    const allSalesTeam = (salesTeam || []).map(s => ({ id: s.id, code: s.code.toLowerCase(), name: s.name.toLowerCase(), role: s.role }));
    const esnList = allSalesTeam.filter(s => s.role === "esn").map(({ role, ...r }) => r);
    const gsnList = allSalesTeam.filter(s => s.role === "gsn").map(({ role, ...r }) => r);
    const salesTeamList = allSalesTeam.map(({ role, ...r }) => r);
    const categoryList = (categories || []).map(c => ({ id: c.id, code: "", name: c.name.trim().toLowerCase() }));
    const segmentList = (segments || []).map(s => ({ id: s.id, code: "", name: s.name.trim().toLowerCase() }));

    setLookupListsCache({ unitList, esnList, gsnList, salesTeamList, categoryList, segmentList });

    // Always purge stale aliases for the current entity: remove any alias
    // whose target ID no longer exists in the freshly-loaded lookup lists.
    const freshAliases = { ...loadAliasStore() };
    const entityPrefix = `${detectedEntity}:`;
    let purgedCount = 0;
    for (const aliasGroupKey of Object.keys(freshAliases)) {
      if (!aliasGroupKey.startsWith(entityPrefix)) continue;
      const aliasMap = freshAliases[aliasGroupKey];
      if (!aliasMap || typeof aliasMap !== "object") continue;
      // Determine which lookup list this alias group belongs to
      const fieldKey = aliasGroupKey.slice(entityPrefix.length);
      const rf = mappedRelFields.find(r => r.fieldKey === fieldKey);
      const listForAlias = rf
        ? (rf.listType === "units" ? unitList : rf.listType === "esn" ? esnList : rf.listType === "gsn" ? gsnList : rf.listType === "categories" ? categoryList : rf.listType === "segments" ? segmentList : salesTeamList)
        : salesTeamList;
      for (const [val, targetId] of Object.entries(aliasMap)) {
        if (!listForAlias.some(l => l.id === targetId)) {
          delete aliasMap[val];
          purgedCount++;
        }
      }
      // Remove empty alias groups
      if (Object.keys(aliasMap).length === 0) delete freshAliases[aliasGroupKey];
    }
    // Additionally clear ALL entity aliases when "clear existing data" is checked
    if (clearExistingTargets && detectedEntity === "sales_targets") {
      for (const k of Object.keys(freshAliases).filter(k => k.startsWith("sales_targets:"))) {
        purgedCount += Object.keys(freshAliases[k] || {}).length;
        delete freshAliases[k];
      }
    }
    if (purgedCount > 0) {
      saveAliasStore(freshAliases);
      setAliasStore(freshAliases);
      console.log(`[SmartImport] ${purgedCount} alias(es) obsoleto(s) removido(s) para ${detectedEntity}.`);
    }

    const currentAliases = freshAliases;

    // Collect unique values per relational field
    const unresolved: UnresolvedRelation[] = [];
    const seenKeys = new Set<string>();
    let aliasResolvedCount = 0;

    for (const rf of mappedRelFields) {
      const listForField = rf.listType === "units" ? unitList
        : rf.listType === "esn" ? esnList
        : rf.listType === "gsn" ? gsnList
        : rf.listType === "categories" ? categoryList
        : rf.listType === "segments" ? segmentList
        : salesTeamList;

      const aliasKey = getAliasKey(detectedEntity, rf.fieldKey);
      const crmForField = (rf.listType !== "units" && rf.listType !== "categories" && rf.listType !== "segments") ? crmCodes : undefined;
      const valueCountMap = new Map<string, { original: string; count: number }>();

      for (const row of allDataRows) {
        const candidateValues = detectedEntity === "sales_targets" && rf.fieldKey === "unit_code"
          ? collectSalesTargetUnitCandidates(row, headers, fieldToCol)
          : (() => {
              const value = extractValue(row, rf.fieldKey, fieldToCol);
              return value ? [value] : [];
            })();

        if (candidateValues.length === 0) continue;

        if (detectedEntity === "sales_targets" && rf.fieldKey === "unit_code") {
          const hasResolvedCandidate = candidateValues.some((candidate) =>
            !!findInListWithAlias(listForField, candidate, aliasKey, currentAliases, crmForField),
          );
          if (hasResolvedCandidate) continue;
        }

        const val = candidateValues[0];
        const lower = val.trim().toLowerCase();
        const existing = valueCountMap.get(lower);
        if (existing) { existing.count++; }
        else { valueCountMap.set(lower, { original: val.trim(), count: 1 }); }
      }

      for (const [lower, { original, count }] of valueCountMap) {
        // Check if resolved by normal lookup, alias, or CRM code
        const resolved = findInListWithAlias(listForField, original, aliasKey, currentAliases, crmForField);
        if (resolved) {
          // Log alias-resolved items for transparency
          const aliasMap = currentAliases[aliasKey];
          if (aliasMap && aliasMap[lower]) {
            aliasResolvedCount++;
            console.log(`[SmartImport] "${original}" resolvido via alias → membro ${resolved}`);
          }
          continue;
        }

        console.log(`[SmartImport] ❌ Não resolvido: campo=${rf.fieldKey} valor="${original}" (${count} ocorrência(s))`);

        const uniqueKey = `${rf.fieldKey}:${lower}`;
        if (seenKeys.has(uniqueKey)) continue;
        seenKeys.add(uniqueKey);

        unresolved.push({
          fieldKey: rf.fieldKey,
          fieldLabel: rf.label,
          value: original,
          valueLower: lower,
          occurrences: count,
          listType: rf.listType,
        });
      }
    }

    if (aliasResolvedCount > 0) {
      console.log(`[SmartImport] ${aliasResolvedCount} valor(es) resolvido(s) via aliases de importações anteriores.`);
    }
    console.log(`[SmartImport] Pré-varredura: ${unresolved.length} item(ns) não resolvido(s) de ${allDataRows.length} linhas.`);

    // ── Sales Targets: cross-resolve esn_code ↔ esn_name pairs ──
    // If esn_code resolves but esn_name doesn't (or vice-versa), and they
    // appear on the same row, remove the unresolved one since the resolved
    // partner already identifies the member.
    // Also: if BOTH are unresolved but paired on the same row, keep only
    // esn_code (the primary identifier) to avoid showing duplicate pending items.
    if (detectedEntity === "sales_targets") {
      // Build map of code→name and name→code from same rows
      const rowPairs = new Map<string, Set<string>>(); // code_lower → set of name_lowers
      const nameToCodes = new Map<string, Set<string>>();
      for (const row of allDataRows) {
        const codeVal = extractValue(row, "esn_code", fieldToCol)?.trim().toLowerCase() || "";
        const nameVal = extractValue(row, "esn_name", fieldToCol)?.trim().toLowerCase() || "";
        if (codeVal && nameVal) {
          if (!rowPairs.has(codeVal)) rowPairs.set(codeVal, new Set());
          rowPairs.get(codeVal)!.add(nameVal);
          if (!nameToCodes.has(nameVal)) nameToCodes.set(nameVal, new Set());
          nameToCodes.get(nameVal)!.add(codeVal);
        }
      }

      // Check which esn_code values are resolved
      const unresolvedCodes = new Set(unresolved.filter(u => u.fieldKey === "esn_code").map(u => u.valueLower));
      const unresolvedNames = new Set(unresolved.filter(u => u.fieldKey === "esn_name").map(u => u.valueLower));

      const toRemove = new Set<string>();

      // Remove unresolved names whose paired code IS resolved (not in unresolved)
      for (const nameVal of unresolvedNames) {
        const pairedCodes = nameToCodes.get(nameVal);
        if (pairedCodes) {
          for (const code of pairedCodes) {
            if (!unresolvedCodes.has(code)) {
              toRemove.add(`esn_name:${nameVal}`);
            }
          }
        }
      }
      // Remove unresolved codes whose paired name IS resolved
      for (const codeVal of unresolvedCodes) {
        const pairedNames = rowPairs.get(codeVal);
        if (pairedNames) {
          for (const name of pairedNames) {
            if (!unresolvedNames.has(name)) {
              toRemove.add(`esn_code:${codeVal}`);
            }
          }
        }
      }

      // When BOTH code and name are unresolved but paired on same row,
      // keep only esn_code to avoid duplicate pending items for the same person.
      // Enrich the esn_code entry with the paired name for better display.
      for (const codeVal of unresolvedCodes) {
        const pairedNames = rowPairs.get(codeVal);
        if (pairedNames) {
          for (const name of pairedNames) {
            if (unresolvedNames.has(name)) {
              // Both unresolved + same row → remove name, keep code
              toRemove.add(`esn_name:${name}`);
              // Enrich the code entry with the paired name
              const codeEntry = unresolved.find(u => u.fieldKey === "esn_code" && u.valueLower === codeVal);
              if (codeEntry) {
                const nameEntry = unresolved.find(u => u.fieldKey === "esn_name" && u.valueLower === name);
                if (nameEntry) {
                  codeEntry.pairedName = nameEntry.value;
                }
              }
            }
          }
        }
      }

      // Filter out cross-resolved items
      if (toRemove.size > 0) {
        const filtered = unresolved.filter(u => !toRemove.has(`${u.fieldKey}:${u.valueLower}`));
        unresolved.length = 0;
        unresolved.push(...filtered);
      }
    }

    setScanningRelations(false);

    if (unresolved.length === 0) return true; // all resolved

    // Show dialog
    setUnresolvedItems(unresolved);
    setResolutionSelections({});
    setShowResolutionDialog(true);
    return false; // don't proceed yet
    } catch (err) {
      console.error("[SmartImport] Erro na pré-varredura relacional:", err);
      setScanningRelations(false);
      toast({ title: "Erro na verificação de vínculos", description: "Ocorreu um erro ao verificar os vínculos relacionais. Tente novamente.", variant: "destructive" });
      return false;
    }
  }, [detectedEntity, mapping, allDataRows, extractValue, headers, clearExistingTargets]);

  // ── Save resolutions and proceed ──────────────────────────────
  const handleSaveResolutions = useCallback(async () => {
    const newAliases = { ...aliasStore };
    let savedCount = 0;
    let createdCount = 0;
    const alreadyCreatedForPair = new Map<string, string>(); // track created IDs for paired fields

    // For sales_targets, build row-level pairs: code↔name
    const rowPairMap = new Map<string, string>(); // "esn_code:<lower>" → esn_name value, and vice-versa
    if (detectedEntity === "sales_targets") {
      const fieldToCol: Record<string, number> = {};
      for (const [colStr, field] of Object.entries(mapping)) {
        fieldToCol[field] = Number(colStr);
      }
      for (const row of allDataRows) {
        const codeVal = extractValue(row, "esn_code", fieldToCol)?.trim() || "";
        const nameVal = extractValue(row, "esn_name", fieldToCol)?.trim() || "";
        if (codeVal && nameVal) {
          rowPairMap.set(`esn_code:${codeVal.toLowerCase()}`, nameVal);
          rowPairMap.set(`esn_name:${nameVal.toLowerCase()}`, codeVal);
        }
      }
    }

    for (const item of unresolvedItems) {
      const selectionKey = `${item.fieldKey}:${item.valueLower}`;
      const selectedId = resolutionSelections[selectionKey];
      if (!selectedId || selectedId === "__skip__") continue;

      // Handle "create new" for sales_team members
      if (selectedId === "__create__") {
        // Check if the paired field already created this member
        const pairKey = rowPairMap.get(`${item.fieldKey}:${item.valueLower}`);
        const pairedFieldKey = item.fieldKey === "esn_code" ? "esn_name" : item.fieldKey === "esn_name" ? "esn_code" : "";
        const pairedCreatedId = pairedFieldKey && pairKey
          ? alreadyCreatedForPair.get(`${pairedFieldKey}:${pairKey.toLowerCase()}`)
          : undefined;

        if (pairedCreatedId) {
          // Partner already created this member — just alias this field to the same ID
          const aliasKey = getAliasKey(detectedEntity, item.fieldKey);
          if (!newAliases[aliasKey]) newAliases[aliasKey] = {};
          newAliases[aliasKey][item.valueLower] = pairedCreatedId;

          // Also update the created member with the missing field
          const isCode = item.fieldKey.includes("code");
          if (isCode) {
            await supabase.from("sales_team").update({ code: item.value.toUpperCase() }).eq("id", pairedCreatedId);
          } else {
            await supabase.from("sales_team").update({ name: item.value.toUpperCase() }).eq("id", pairedCreatedId);
          }
          // Update lookup cache entry
          setLookupListsCache(prev => ({
            ...prev,
            salesTeamList: prev.salesTeamList.map(e => e.id === pairedCreatedId
              ? { ...e, ...(isCode ? { code: item.value.toLowerCase() } : { name: item.value.toLowerCase() }) }
              : e),
            esnList: prev.esnList.map(e => e.id === pairedCreatedId
              ? { ...e, ...(isCode ? { code: item.value.toLowerCase() } : { name: item.value.toLowerCase() }) }
              : e),
          }));
          savedCount++;
          continue;
        }

        // Build consolidated insert using paired row data
        const isCode = item.fieldKey.includes("code");
        const pairedValue = pairKey || "";

        // Resolve unit_id and role from the row data for the new member
        const fieldToColLocal: Record<string, number> = {};
        for (const [colStr, field] of Object.entries(mapping)) fieldToColLocal[field] = Number(colStr);
        let memberUnitId: string | null = null;
        let memberRole: string = "esn";
        // Find the first row with this member to extract unit and role
        for (const row of allDataRows) {
          const rowCode = (extractValue(row, "esn_code", fieldToColLocal) || "").trim().toLowerCase();
          const rowName = (extractValue(row, "esn_name", fieldToColLocal) || "").trim().toLowerCase();
          if ((isCode && rowCode === item.valueLower) || (!isCode && rowName === item.valueLower)) {
            // Resolve unit
            const rawUnit = (extractValue(row, "unit_code", fieldToColLocal) || "").trim();
            if (rawUnit) {
              const unitAliasKey = getAliasKey(detectedEntity, "unit_code");
              memberUnitId = findInListWithAlias(lookupListsCache.unitList, rawUnit, unitAliasKey, newAliases);
            }
            // Resolve role
            const rawRole = (extractValue(row, "role_name", fieldToColLocal) || "").trim().toLowerCase();
            if (rawRole) {
              const r = parseRole(rawRole);
              if (r) memberRole = r;
            }
            break;
          }
        }

        const insertData: any = {
          name: isCode ? (item.pairedName || pairedValue || item.value).toUpperCase() : item.value.toUpperCase(),
          code: isCode ? item.value.toUpperCase() : (pairedValue || `AUTO_${Date.now()}`).toUpperCase(),
          role: memberRole as any,
          commission_pct: 0,
          unit_id: memberUnitId,
        };
        const { data: created, error } = await supabase.from("sales_team").insert(insertData).select("id").single();
        if (created && !error) {
          const aliasKey = getAliasKey(detectedEntity, item.fieldKey);
          if (!newAliases[aliasKey]) newAliases[aliasKey] = {};
          newAliases[aliasKey][item.valueLower] = created.id;

          // Also alias the paired field if it exists
          if (pairedFieldKey && pairedValue) {
            const pairedAliasKey = getAliasKey(detectedEntity, pairedFieldKey);
            if (!newAliases[pairedAliasKey]) newAliases[pairedAliasKey] = {};
            newAliases[pairedAliasKey][pairedValue.toLowerCase()] = created.id;
          }

          // Track for dedup
          alreadyCreatedForPair.set(selectionKey, created.id);

          // Create CRM code entry for the new member
          const crmCode = insertData.code.trim().toUpperCase();
          if (crmCode && !crmCode.startsWith("AUTO_")) {
            await supabase.from("sales_team_crm_codes").upsert({
              code: crmCode, sales_team_id: created.id, unit_id: memberUnitId, description: "Criado via importação",
            }, { onConflict: "code,sales_team_id" });
          }

          const newEntry = { id: created.id, code: insertData.code.toLowerCase(), name: insertData.name.toLowerCase() };
          setLookupListsCache(prev => ({
            ...prev,
            salesTeamList: [...prev.salesTeamList, newEntry],
            esnList: [...prev.esnList, newEntry],
          }));
          createdCount++;
          savedCount++;
        } else {
          toast({ title: "Erro ao criar membro", description: error?.message || "Erro desconhecido", variant: "destructive" });
        }
        continue;
      }

      // Regular alias mapping — also alias paired field for sales_targets
      const aliasKey = getAliasKey(detectedEntity, item.fieldKey);
      if (!newAliases[aliasKey]) newAliases[aliasKey] = {};
      newAliases[aliasKey][item.valueLower] = selectedId;

      // If user selected an existing member for esn_code, also alias esn_name (and vice-versa)
      if (detectedEntity === "sales_targets" && (item.fieldKey === "esn_code" || item.fieldKey === "esn_name")) {
        const pairedFieldKey = item.fieldKey === "esn_code" ? "esn_name" : "esn_code";
        const pairKey = rowPairMap.get(`${item.fieldKey}:${item.valueLower}`);
        if (pairKey) {
          const pairedAliasKey = getAliasKey(detectedEntity, pairedFieldKey);
          if (!newAliases[pairedAliasKey]) newAliases[pairedAliasKey] = {};
          newAliases[pairedAliasKey][pairKey.toLowerCase()] = selectedId;
        }
      }

      savedCount++;
    }

    saveAliasStore(newAliases);
    setAliasStore(newAliases);
    setShowResolutionDialog(false);

    const parts: string[] = [];
    if (savedCount - createdCount > 0) parts.push(`${savedCount - createdCount} associação(ões) salva(s)`);
    if (createdCount > 0) parts.push(`${createdCount} membro(s) criado(s)`);
    toast({
      title: "Mapeamentos salvos",
      description: parts.length > 0 ? `${parts.join(", ")}. Serão reutilizados em futuras importações.` : "Nenhuma alteração.",
    });

    if (createdCount > 0) qc.invalidateQueries({ queryKey: ["sales_team"] });

    // Now proceed with import
    executeImport(newAliases);
  }, [unresolvedItems, resolutionSelections, aliasStore, detectedEntity, mapping, allDataRows, extractValue, toast, qc]);

  // ── Dry-run simulation ──────────────────────────────────────────
  const runDryRun = useCallback(async () => {
    const validation = validateImportStructure(detectedEntity, mapping, headers, dbFields, allDataRows);
    setValidationResult(validation);
    if (!validation.valid) {
      toast({ title: "Validação falhou", description: validation.errors.join("; "), variant: "destructive" });
      return;
    }

    setDryRunLoading(true);
    try {
      const fieldToCol: Record<string, number> = {};
      for (const [colStr, field] of Object.entries(mapping)) fieldToCol[field] = Number(colStr);
      const ev = (row: any[], key: string) => extractValue(row, key, fieldToCol);

      const result: DryRunResult = {
        totalRows: allDataRows.length,
        validRows: 0, invalidRows: 0,
        toInsert: 0, toUpdate: 0, toSkip: 0,
        blockers: [...validation.errors],
        warnings: [...validation.warnings],
        unresolvedRelations: [],
        details: [],
      };

      const [{ data: units }, { data: salesTeam }, crmCodes] = await Promise.all([
        supabase.from("unit_info").select("id, code, name"),
        supabase.from("sales_team").select("id, code, name, role, unit_id"),
        loadCrmCodes(),
      ]);
      const unitList = (units || []).map(u => ({ id: u.id, code: (u.code || "").trim().toLowerCase(), name: u.name.trim().toLowerCase() }));
      const allSalesTeam = (salesTeam || []).map(s => ({ id: s.id, code: s.code.trim().toLowerCase(), name: s.name.trim().toLowerCase(), role: s.role, unit_id: s.unit_id }));
      const esnList = allSalesTeam.filter(s => s.role === "esn");
      const gsnList = allSalesTeam.filter(s => s.role === "gsn");
      const currentAliases = aliasStore;
      const unresolvedMap = new Map<string, { field: string; value: string; count: number }>();

      if (detectedEntity === "clients") {
        // Business decision: clients.code is the sole unique key (store_code is NOT a uniqueness dimension)
        const dataRows = allDataRows.filter(r => ev(r, "code") && ev(r, "name") && ev(r, "cnpj"));
        result.invalidRows = allDataRows.length - dataRows.length;
        result.validRows = dataRows.length;
        const existingCodes = new Set<string>();
        let dbOff = 0;
        while (true) {
          const { data: chunk } = await supabase.from("clients").select("code").range(dbOff, dbOff + 999);
          if (!chunk || chunk.length === 0) break;
          for (const c of chunk) existingCodes.add((c.code || "").trim());
          if (chunk.length < 1000) break;
          dbOff += 1000;
        }
        for (let i = 0; i < dataRows.length; i++) {
          const row = dataRows[i];
          const code = ev(row, "code")!;
          const lineNum = i + 2;
          for (const { key: fk, list, label } of [
            { key: "unit_code", list: unitList, label: "Unidade" },
            { key: "esn_code", list: esnList, label: "ESN" },
            { key: "gsn_code", list: gsnList, label: "GSN" },
          ]) {
            const val = ev(row, fk);
            if (val && !findInListWithAlias(list, val, getAliasKey("clients", fk), currentAliases, crmCodes)) {
              const uKey = `${fk}:${val.toLowerCase()}`;
              const ex = unresolvedMap.get(uKey);
              if (ex) ex.count++; else unresolvedMap.set(uKey, { field: label, value: val, count: 1 });
            }
          }
          if (existingCodes.has(code)) {
            result.toUpdate++;
            result.details.push({ line: lineNum, action: "update", reason: `${code} já existe` });
          } else {
            result.toInsert++;
            result.details.push({ line: lineNum, action: "insert", reason: `Novo ${code}` });
          }
        }
      } else if (detectedEntity === "sales_team") {
        const dataRows = allDataRows.filter(r => ev(r, "code") && ev(r, "name"));
        result.invalidRows = allDataRows.length - dataRows.length;
        result.validRows = dataRows.length;
        const { data: existing } = await supabase.from("sales_team").select("id, code");
        const existingCodes = new Set((existing || []).map(e => e.code.trim().toLowerCase()));
        for (let i = 0; i < dataRows.length; i++) {
          const row = dataRows[i];
          const code = ev(row, "code")!;
          const roleText = ev(row, "role_text") || "";
          const lineNum = i + 2;
          const c = roleText.toLowerCase().trim();
          const validRole = ["esn","gsn","dsn","arquiteto","engenheiro de valor","ev","executivo","vendedor","gerente","diretor"].some(k => c.includes(k));
          if (!validRole) {
            result.details.push({ line: lineNum, action: "error", reason: `Cargo "${roleText}" não reconhecido` });
            result.invalidRows++; result.validRows--; continue;
          }
          const unitVal = ev(row, "unit_code");
          if (unitVal && !findInListWithAlias(unitList, unitVal, getAliasKey("sales_team", "unit_code"), currentAliases)) {
            const uKey = `unit_code:${unitVal.toLowerCase()}`;
            const ex = unresolvedMap.get(uKey);
            if (ex) ex.count++; else unresolvedMap.set(uKey, { field: "Unidade", value: unitVal, count: 1 });
          }
          if (existingCodes.has(code.trim().toLowerCase())) {
            result.toUpdate++;
            result.details.push({ line: lineNum, action: "update", reason: `${code} já existe` });
          } else {
            result.toInsert++;
            result.details.push({ line: lineNum, action: "insert", reason: `Novo ${code}` });
          }
        }
      } else if (detectedEntity === "sales_targets") {
        const year = Number(targetYear);
        const dataRows = allDataRows.filter(r => ev(r, "esn_code") || ev(r, "esn_name"));
        result.invalidRows = allDataRows.length - dataRows.length;
        result.validRows = dataRows.length;
        const memberMap = new Map<string, boolean>();
        for (const s of allSalesTeam) { memberMap.set(s.code, true); memberMap.set(s.name, true); }
        for (const crm of crmCodes) memberMap.set(crm.code, true);
        for (let i = 0; i < dataRows.length; i++) {
          const row = dataRows[i];
          const esnCode = (ev(row, "esn_code") || "").trim().toLowerCase();
          const esnName = (ev(row, "esn_name") || "").trim().toLowerCase();
          const label = ev(row, "esn_code") || ev(row, "esn_name") || "(vazio)";
          const lineNum = i + 2;
          if (!memberMap.has(esnCode) && !memberMap.has(esnName)) {
            const uKey = `esn:${esnCode || esnName}`;
            const ex = unresolvedMap.get(uKey);
            if (ex) ex.count++; else unresolvedMap.set(uKey, { field: "Dono da Meta", value: label, count: 1 });
            result.details.push({ line: lineNum, action: "error", reason: `"${label}" não encontrado` });
            continue;
          }
          let hasVal = false;
          for (let m = 1; m <= 12; m++) { if (Number(ev(row, `month_${m}`)) > 0) { hasVal = true; break; } }
          if (!hasVal) { result.toSkip++; result.details.push({ line: lineNum, action: "skip", reason: "Sem valores mensais" }); }
          else { result.toInsert++; result.details.push({ line: lineNum, action: "insert", reason: "Metas com valores" }); }
        }
     } else if (detectedEntity === "templates") {
        const dataRows = allDataRows.filter(r => ev(r, "template_name") && ev(r, "item_type") && ev(r, "description"));
        result.invalidRows = allDataRows.length - dataRows.length;
        result.validRows = dataRows.length;
        // Group by template name
        const tplGroups = new Map<string, { items: any[] }>();
        for (const row of dataRows) {
          const tplName = ev(row, "template_name")!;
          if (!tplGroups.has(tplName)) tplGroups.set(tplName, { items: [] });
          tplGroups.get(tplName)!.items.push(row);
        }
        // Check existing templates
        const { data: existingTpls } = await supabase.from("scope_templates").select("id, name");
        const existingNames = new Set((existingTpls || []).map(t => t.name.trim().toLowerCase()));
        let toInsert = 0, toUpdate = 0, toSkip = 0;
        for (const [tplName, group] of tplGroups) {
          const exists = existingNames.has(tplName.trim().toLowerCase());
          if (exists) {
            toUpdate++;
            result.details.push({ line: 0, action: "update", reason: `"${tplName}" já existe — itens serão substituídos (${group.items.length} linhas)` });
          } else {
            toInsert++;
            result.details.push({ line: 0, action: "insert", reason: `"${tplName}" — novo template (${group.items.length} linhas)` });
          }
          // Validate parent references for sub-items
          const processes = group.items.filter(r => (ev(r, "item_type") || "").toUpperCase() === "P");
          const processDescs = new Set(processes.map(r => (ev(r, "description") || "").toLowerCase()));
          const subs = group.items.filter(r => (ev(r, "item_type") || "").toUpperCase() === "S");
          for (const sub of subs) {
            const parentDesc = (ev(sub, "parent_desc") || "").toLowerCase();
            if (parentDesc && !processDescs.has(parentDesc)) {
              result.warnings.push(`Sub-item "${ev(sub, "description")}" referencia pai "${ev(sub, "parent_desc")}" não encontrado em "${tplName}"`);
            }
          }
        }
        result.toInsert = toInsert;
        result.toUpdate = toUpdate;
        result.toSkip = toSkip;
      }

      result.unresolvedRelations = Array.from(unresolvedMap.values());
      if (result.unresolvedRelations.length > 0) {
        result.warnings.push(`${result.unresolvedRelations.length} vínculo(s) relacional(is) não resolvido(s)`);
      }
      setDryRunResult(result);
      setStep("preview");
    } finally {
      setDryRunLoading(false);
    }
  }, [detectedEntity, mapping, headers, dbFields, allDataRows, extractValue, aliasStore, targetYear, toast]);

  // ── Run import (entry point) ──────────────────────────────────
  const runImport = useCallback(async () => {
    const validation = validateImportStructure(detectedEntity, mapping, headers, dbFields, allDataRows);
    setValidationResult(validation);
    if (!validation.valid) {
      toast({ title: "Validação falhou", description: validation.errors.join("; "), variant: "destructive" });
      return;
    }
    if (validation.warnings.length > 0) {
      for (const w of validation.warnings) addImportLog(detectedEntity, "warning", `Validação: ${w}`, "validation");
    }
    if (!layoutSaved && headers.length > 0) {
      saveLayout({ id: crypto.randomUUID(), name: file?.name || "Layout", entity: detectedEntity, headerSignature: getHeaderSignature(headers), mapping, headerNames: headers, createdAt: Date.now() });
    }
    const allResolved = await preScanRelations();
    if (!allResolved) return;
    executeImport(aliasStore);
  }, [file, allDataRows, mapping, updateFields, user, qc, headerRowIdx, headers, layoutSaved, filterRules, detectedEntity, dbFields, extractValue, targetYear, preScanRelations, aliasStore]);

  // ── Execute import (after resolution) ─────────────────────────
  const executeImport = useCallback(async (currentAliases: AliasStore) => {
    setStep("running");

    const fieldToCol: Record<string, number> = {};
    for (const [colStr, field] of Object.entries(mapping)) {
      fieldToCol[field] = Number(colStr);
    }

    const missing = dbFields.filter(f => f.required && !(f.key in fieldToCol));
    if (missing.length > 0) {
      addImportLog(detectedEntity, "error", `Campos obrigatórios não mapeados: ${missing.map(f => f.label).join(", ")}`, "validation");
      finishImportRun(detectedEntity, "error");
      setStep("done");
      return;
    }

    const ev = (row: any[], key: string) => extractValue(row, key, fieldToCol);

    switch (detectedEntity) {
      case "clients":
        await runClientImportMapped(fieldToCol, ev, currentAliases);
        break;
      case "sales_team":
        await runSalesTeamImportMapped(fieldToCol, ev, currentAliases);
        break;
      case "templates":
        await runTemplateImportMapped(fieldToCol, ev);
        break;
      case "sales_targets":
        await runSalesTargetsImportMapped(fieldToCol, ev, currentAliases);
        break;
    }

    setStep("done");
  }, [file, allDataRows, mapping, updateFields, user, qc, headerRowIdx, headers, filterRules, detectedEntity, dbFields, extractValue, targetYear]);

  // ── CLIENT import with mapped columns ─────────────────────────
  // Business decision: clients.code is the sole unique key. store_code is NOT a uniqueness dimension.
  async function runClientImportMapped(fieldToCol: Record<string, number>, ev: (row: any[], key: string) => any, currentAliases: AliasStore) {
    const entity: ImportEntity = "clients";
    const importRun = startImportRun(entity, file!.name, false);

    const dataRows = allDataRows.filter(r => ev(r, "code") && ev(r, "name") && ev(r, "cnpj"));
    const invalidRows = allDataRows.length - dataRows.length;
    updateImportStats(entity, { totalRows: allDataRows.length });
    addImportLog(entity, "info", `📊 ${allDataRows.length} linhas lidas | ${dataRows.length} válidas | ${invalidRows} sem campos obrigatórios`, "validation");

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
      addImportLog(entity, "error", "Nenhum registro válido encontrado.", "validation");
      finishImportRun(entity, "error");
      return;
    }

    const [{ data: units }, { data: salesTeam }, crmCodes] = await Promise.all([
      supabase.from("unit_info").select("id, code, name"),
      supabase.from("sales_team").select("id, code, name, role"),
      loadCrmCodes(),
    ]);
    const unitList = (units || []).map(u => ({ id: u.id, code: (u.code || "").trim().toLowerCase(), name: u.name.trim().toLowerCase() }));
    const esnList = (salesTeam || []).filter(s => s.role === "esn").map(s => ({ id: s.id, code: s.code.toLowerCase(), name: s.name.toLowerCase() }));
    const gsnList = (salesTeam || []).filter(s => s.role === "gsn").map(s => ({ id: s.id, code: s.code.toLowerCase(), name: s.name.toLowerCase() }));

    const unitAliasKey = getAliasKey(entity, "unit_code");
    const esnAliasKey = getAliasKey(entity, "esn_code");
    const gsnAliasKey = getAliasKey(entity, "gsn_code");

    // Pre-filter: valid unit (with aliases)
    const hasUnitMapping = "unit_code" in fieldToCol;
    let filteredRows = dataRows;
    let unitFilteredCount = 0;
    if (hasUnitMapping) {
      filteredRows = dataRows.filter(row => {
        const unitVal = ev(row, "unit_code");
        if (!unitVal) return false;
        return !!findInListWithAlias(unitList, unitVal, unitAliasKey, currentAliases);
      });
      unitFilteredCount = dataRows.length - filteredRows.length;
      if (unitFilteredCount > 0) addImportLog(entity, "warning", `${unitFilteredCount} registros descartados por Unidade inválida`, "filter");
    }

    // Custom filter rules
    let customFilteredCount = 0;
    if (filterRules.length > 0) {
      const lookupLists = { unitList, esnList, gsnList };
      const before = filteredRows.length;
      filteredRows = filteredRows.filter(row => filterRules.every(rule => evaluateFilterRule(rule, row, fieldToCol, lookupLists, findInList)));
      customFilteredCount = before - filteredRows.length;
      if (customFilteredCount > 0) addImportLog(entity, "info", `${customFilteredCount} registros removidos por filtros personalizados`, "filter");
    }

    if (filteredRows.length === 0) {
      addImportLog(entity, "error", "Nenhum registro após filtros.", "filter");
      finishImportRun(entity, "error");
      return;
    }

    const allMappedKeys = Object.values(mapping);
    const unresolvedWarnings: string[] = [];

    function buildPayload(row: any[], keys: string[], rowLabel?: string): Record<string, any> {
      const p: Record<string, any> = {};
      for (const key of keys) {
        const val = ev(row, key);
        if (key === "unit_code") {
          p.unit_id = findInListWithAlias(unitList, val || "", unitAliasKey, currentAliases);
          if (val && !p.unit_id) { unresolvedWarnings.push(`${rowLabel || ""}: Unidade "${val}" não encontrada.`); }
        } else if (key === "esn_code") {
          p.esn_id = findInListWithAlias(esnList, val || "", esnAliasKey, currentAliases, crmCodes);
          if (val && !p.esn_id) { unresolvedWarnings.push(`${rowLabel || ""}: ESN "${val}" não encontrado.`); }
        } else if (key === "gsn_code") {
          p.gsn_id = findInListWithAlias(gsnList, val || "", gsnAliasKey, currentAliases, crmCodes);
          if (val && !p.gsn_id) { unresolvedWarnings.push(`${rowLabel || ""}: GSN "${val}" não encontrado.`); }
        } else p[key] = val;
      }
      return p;
    }

    let imported = 0, updated = 0, skipped = 0, errors = 0;
    const cancelSignal = getCancelSignal("clients");
    const BATCH = 50;

    addImportLog(entity, "info", "Iniciando upsert por lote (chave: code)...", "system");

    for (let b = 0; b < filteredRows.length; b += BATCH) {
      if (cancelSignal?.aborted) { addImportLog(entity, "info", "⛔ Importação interrompida.", "system"); break; }
      const batch = filteredRows.slice(b, b + BATCH);
      const upsertRows: any[] = [];

      for (const row of batch) {
        const code = ev(row, "code");
        const rowLabel = `Cliente ${code}`;
        unresolvedWarnings.length = 0;
        const payload = buildPayload(row, allMappedKeys, rowLabel);
        for (const w of unresolvedWarnings) addImportLog(entity, "warning", w, "relation");
        payload.code = payload.code || code;
        payload.name = payload.name || ev(row, "name");
        payload.cnpj = ev(row, "cnpj") || "";
        // store_code can still come from the file, just not used as key
        if (!payload.store_code) payload.store_code = ev(row, "store_code") || "";
        // Remove undefined/null values that would cause issues
        const clean: Record<string, any> = {};
        for (const [k, v] of Object.entries(payload)) if (v != null) clean[k] = v;
        upsertRows.push(clean);
      }

      if (upsertRows.length > 0) {
        const { error: batchErr, data: upsertData } = await supabase
          .from("clients")
          .upsert(upsertRows, { onConflict: "code" })
          .select("id");

        if (batchErr) {
          addImportLog(entity, "warning", `Lote falhou, tentando registro a registro (${upsertRows.length} itens)...`, "fallback");
          for (const row of upsertRows) {
            const { error } = await supabase.from("clients").upsert(row, { onConflict: "code" });
            if (error) { errors++; addImportLog(entity, "error", `(${row.code}): ${error.message}`, "batch_error"); }
            else imported++;
          }
        } else {
          imported += upsertData?.length || upsertRows.length;
        }
      }
    }

    const totalSkipped = skipped + invalidRows + unitFilteredCount + customFilteredCount;
    const wasCancelled = cancelSignal?.aborted;
    const finalStatus = wasCancelled ? "interrupted" : (errors > 0 && imported === 0 && updated === 0 ? "error" : "success");
    finishImportRun(entity, finalStatus as any);
    const dur = Date.now() - importRun.startedAt;
    const warningCount = unresolvedWarnings.length;
    addImportLog(entity, finalStatus === "error" ? "error" : "ok",
      `${wasCancelled ? "⛔ Interrompido" : "✅ Concluído"} — ${allDataRows.length} linhas | Inseridos: ${imported} | Atualizados: ${updated} | Ignorados: ${totalSkipped} | Erros: ${errors}${warningCount > 0 ? ` | Alertas: ${warningCount}` : ""} | Tempo: ${formatDuration(dur)}`, "summary");
    if (imported > 0 || updated > 0) qc.invalidateQueries({ queryKey: ["clients"] });
    const errorMsgs = run?.logs.filter(l => l.status === "error").map(l => l.message).slice(0, 200) || [];
    if (dbLogId) {
      await supabase.from("import_logs").update({
        status: finalStatus, total_rows: allDataRows.length, imported, updated, errors,
        skipped: totalSkipped, finished_at: new Date().toISOString(),
        duration_ms: dur,
        summary: `${imported} inseridos, ${updated} atualizados, ${errors} erros, ${totalSkipped} ignorados${warningCount > 0 ? `, ${warningCount} alertas` : ""}`,
        error_details: errorMsgs,
      } as any).eq("id", dbLogId);
    }
  }

  // ── SALES TEAM import with mapped columns ─────────────────────
  async function runSalesTeamImportMapped(fieldToCol: Record<string, number>, ev: (row: any[], key: string) => any, currentAliases: AliasStore) {
    const entity: ImportEntity = "sales_team";
    const importRun = startImportRun(entity, file!.name, false);

    const dataRows = allDataRows.filter(r => ev(r, "code") && ev(r, "name"));
    updateImportStats(entity, { totalRows: dataRows.length });
    addImportLog(entity, "info", `📊 ${allDataRows.length} linhas lidas | ${dataRows.length} válidas | ${allDataRows.length - dataRows.length} sem campos obrigatórios`, "validation");

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
      addImportLog(entity, "error", "Nenhum registro válido.", "validation");
      finishImportRun(entity, "error");
      return;
    }

    const { data: units } = await supabase.from("unit_info").select("id, code, name");
    const unitList = (units || []).map(u => ({ id: u.id, code: (u.code || "").trim().toLowerCase(), name: u.name.trim().toLowerCase() }));
    const unitAliasKey = getAliasKey(entity, "unit_code");

    // parseRole is now imported from importSchemas

    // Pre-load existing sales_team by code for dedup
    const existingByCode = new Map<string, string>();
    const { data: allExisting } = await supabase.from("sales_team").select("id, code");
    for (const t of (allExisting || [])) existingByCode.set(t.code.trim().toLowerCase(), t.id);

    // Pre-load existing CRM codes for dedup: "code|sales_team_id" -> true
    const existingCrmSet = new Set<string>();
    const { data: allCrmCodes } = await supabase.from("sales_team_crm_codes").select("code, sales_team_id");
    for (const c of (allCrmCodes || [])) existingCrmSet.add(`${c.code.trim().toLowerCase()}|${c.sales_team_id}`);

    let imported = 0, updated = 0, errors = 0;
    const insertedCodeMap = new Map<string, string>();
    const cancelSignal = getCancelSignal(entity);
    const hasCrmCodesCol = "crm_codes" in fieldToCol;

    // Collect CRM codes to upsert after main loop
    const crmCodesToInsert: { code: string; sales_team_id: string; unit_id: string | null; description: string }[] = [];

    const BATCH = 50;
    for (let b = 0; b < dataRows.length; b += BATCH) {
      if (cancelSignal?.aborted) { addImportLog(entity, "info", "⛔ Interrompido.", "system"); break; }
      const batch = dataRows.slice(b, b + BATCH);

      for (let j = 0; j < batch.length; j++) {
        const i = b + j;
        const row = batch[j];
        const code = ev(row, "code")!;
        const name = ev(row, "name")!;
        const roleText = ev(row, "role_text") || "";
        const email = ev(row, "email");
        const phone = ev(row, "phone");
        const unitVal = ev(row, "unit_code");
        const commissionVal = ev(row, "commission_pct");

        const role = parseRole(roleText);
        if (!role) { errors++; addImportLog(entity, "error", `Linha ${i + 2} (${code}): Cargo "${roleText}" não reconhecido.`, "validation"); updateImportStats(entity, { errors }); continue; }

        const unit_id = unitVal ? findInListWithAlias(unitList, unitVal, unitAliasKey, currentAliases) : null;
        if (unitVal && !unit_id) {
          addImportLog(entity, "warning", `Linha ${i + 2} (${code}): Unidade "${unitVal}" não encontrada no cadastro.`, "relation");
        }

        const payload: any = { code, name, role, email, phone, unit_id };
        if (commissionVal) payload.commission_pct = parseFloat(commissionVal) || 3;

        let memberId: string | undefined;
        const existingId = existingByCode.get(code.trim().toLowerCase());

        // Use upsert with onConflict on code constraint
        const { data: upsertResult, error: upsertErr } = await supabase
          .from("sales_team")
          .upsert(payload, { onConflict: "code" })
          .select("id")
          .single();

        if (upsertErr) {
          errors++;
          addImportLog(entity, "error", `Linha ${i + 2} (${code}): ${upsertErr.message}`, "batch_error");
          updateImportStats(entity, { errors });
        } else if (upsertResult) {
          memberId = upsertResult.id;
          if (existingId) {
            updated++;
            addImportLog(entity, "info", `Linha ${i + 2} (${code}): Atualizado — ${name}${unit_id ? "" : unitVal ? " ⚠️ sem unidade" : ""}${!email ? " ⚠️ sem e-mail" : ""}`);
          } else {
            existingByCode.set(code.trim().toLowerCase(), upsertResult.id);
            imported++;
            addImportLog(entity, "info", `Linha ${i + 2} (${code}): Inserido — ${name}${unit_id ? "" : unitVal ? " ⚠️ sem unidade" : ""}${!email ? " ⚠️ sem e-mail" : ""}`);
          }
        }

        if (memberId) {
          insertedCodeMap.set(code.toLowerCase(), memberId);

          // Auto-sync: sempre gravar o código principal como CRM code
          const normalizedCode = code.trim().toUpperCase();
          const mainCrmKey = `${normalizedCode.toLowerCase()}|${memberId}`;
          if (!existingCrmSet.has(mainCrmKey)) {
            crmCodesToInsert.push({ code: normalizedCode, sales_team_id: memberId, unit_id: unit_id || null, description: `Código principal (importação)` });
            existingCrmSet.add(mainCrmKey);
          }

          // CRM codes adicionais da coluna dedicada
          if (hasCrmCodesCol) {
            const rawCrm = ev(row, "crm_codes") || "";
            if (rawCrm) {
              const codes = rawCrm.split(/[;,]/).map((c: string) => c.trim()).filter(Boolean);
              for (const rawCrmCode of codes) {
                const normalizedCrm = rawCrmCode.toUpperCase();
                const crmKey = `${normalizedCrm.toLowerCase()}|${memberId}`;
                if (!existingCrmSet.has(crmKey)) {
                  crmCodesToInsert.push({ code: normalizedCrm, sales_team_id: memberId, unit_id: unit_id || null, description: `CRM adicional (importação)` });
                  existingCrmSet.add(crmKey);
                }
              }
            }
          }
        }

        updateImportStats(entity, { imported, updated, errors });
      }
    }

    // Batch upsert CRM codes (onConflict on code+sales_team_id)
    if (crmCodesToInsert.length > 0) {
      addImportLog(entity, "info", `Gravando ${crmCodesToInsert.length} código(s) CRM...`, "system");
      const CRM_BATCH = 100;
      for (let b = 0; b < crmCodesToInsert.length; b += CRM_BATCH) {
        const batch = crmCodesToInsert.slice(b, b + CRM_BATCH);
        const { error } = await supabase.from("sales_team_crm_codes").upsert(batch, { onConflict: "code,sales_team_id" });
        if (error) {
          for (const item of batch) {
            const { error: rowErr } = await supabase.from("sales_team_crm_codes").upsert(item, { onConflict: "code,sales_team_id" });
            if (rowErr) addImportLog(entity, "error", `CRM "${item.code}" para ${item.sales_team_id}: ${rowErr.message}`, "batch_error");
          }
        }
      }
      addImportLog(entity, "ok", `${crmCodesToInsert.length} código(s) CRM gravados.`, "insert");
    }

    // Link GSNs
    addImportLog(entity, "info", "Vinculando GSNs...", "relation");
    const { data: allTeam } = await supabase.from("sales_team").select("id, code, name");
    const teamMap = new Map<string, string>();
    for (const t of (allTeam || [])) {
      teamMap.set(t.code.trim().toLowerCase(), t.id);
      teamMap.set(t.name.trim().toLowerCase(), t.id);
    }

    const gsnCodeAliasKey = getAliasKey(entity, "gsn_code");
    const gsnNameAliasKey = getAliasKey(entity, "gsn_name");
    const gsnCodeAliases = currentAliases[gsnCodeAliasKey] || {};
    const gsnNameAliases = currentAliases[gsnNameAliasKey] || {};

    let linked = 0, gsnNotFound = 0;
    for (const row of dataRows) {
      const code = (ev(row, "code") || "").toLowerCase();
      const gsnCode = (ev(row, "gsn_code") || "").toLowerCase();
      const gsnName = (ev(row, "gsn_name") || "").toLowerCase();
      const memberId = teamMap.get(code);
      if (!gsnCode && !gsnName) continue;
      const gsnId = (gsnCode && (teamMap.get(gsnCode) || gsnCodeAliases[gsnCode]))
        || (gsnName && (teamMap.get(gsnName) || gsnNameAliases[gsnName]));
      if (memberId && gsnId) {
        await supabase.from("sales_team").update({ linked_gsn_id: gsnId }).eq("id", memberId);
        linked++;
      } else if (memberId && !gsnId) {
        gsnNotFound++;
        addImportLog(entity, "warning", `GSN não encontrado para ${ev(row, "code")}: código="${ev(row, "gsn_code") || ""}" nome="${ev(row, "gsn_name") || ""}".`, "relation");
      }
    }
    addImportLog(entity, "info", `${linked} vínculos GSN resolvidos${gsnNotFound > 0 ? `, ${gsnNotFound} GSN(s) não encontrado(s)` : ""}.`, "relation");

    const finalStatus = errors > 0 && imported === 0 && updated === 0 ? "error" : "success";
    const actualStatus = cancelSignal?.aborted ? "interrupted" : finalStatus;
    finishImportRun(entity, actualStatus as any);
    const dur = Date.now() - importRun.startedAt;
    const warningCount = run?.logs.filter(l => l.status === "warning").length || 0;
    addImportLog(entity, actualStatus === "error" ? "error" : "ok",
      `${cancelSignal?.aborted ? "⛔ Interrompido" : "✅ Concluído"} — ${imported} inseridos, ${updated} atualizados, ${errors} erros${warningCount > 0 ? `, ${warningCount} alertas` : ""}${crmCodesToInsert.length > 0 ? `, ${crmCodesToInsert.length} CRM codes` : ""} | Tempo: ${formatDuration(dur)}`, "summary");
    if (imported > 0 || updated > 0) { qc.invalidateQueries({ queryKey: ["sales_team"] }); invalidateCrmCache(); }
    const errorMsgs = run?.logs.filter(l => l.status === "error").map(l => l.message).slice(0, 200) || [];
    if (dbLogId) await supabase.from("import_logs").update({
      status: actualStatus, total_rows: dataRows.length, imported, updated, errors,
      finished_at: new Date().toISOString(), duration_ms: dur,
      summary: `${imported} inseridos, ${updated} atualizados, ${errors} erros${warningCount > 0 ? `, ${warningCount} alertas` : ""}, ${crmCodesToInsert.length} CRM codes`,
      error_details: errorMsgs,
    } as any).eq("id", dbLogId);
  }

  // ── TEMPLATE import with mapped columns (BATCHED) ──────────────
  async function runTemplateImportMapped(fieldToCol: Record<string, number>, ev: (row: any[], key: string) => any) {
    const entity: ImportEntity = "templates";
    const importRun = startImportRun(entity, file!.name, false);

    const dataRows = allDataRows.filter(r => ev(r, "template_name") && ev(r, "item_type") && ev(r, "description"));
    updateImportStats(entity, { totalRows: dataRows.length });
    addImportLog(entity, "info", `📊 ${allDataRows.length} linhas lidas | ${dataRows.length} válidas`, "validation");

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
      addImportLog(entity, "error", "Nenhum registro válido.", "validation");
      finishImportRun(entity, "error");
      return;
    }

    // Group rows by template name
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

    // Pre-load existing templates for upsert logic
    const { data: existingTpls } = await supabase.from("scope_templates").select("id, name");
    const existingTplMap = new Map((existingTpls || []).map(t => [t.name.trim().toLowerCase(), t.id]));

    let imported = 0, updated = 0, errors = 0;

    for (const [tplName, group] of templateGroups) {
      try {
        const normalizedName = tplName.trim().toLowerCase();
        let templateId: string;
        let isUpdate = false;

        if (existingTplMap.has(normalizedName)) {
          // Update: reuse existing template, delete old items and re-insert
          templateId = existingTplMap.get(normalizedName)!;
          isUpdate = true;
          // Update template metadata
          await supabase.from("scope_templates").update({
            product: group.product, category: group.category, status: "em_revisao",
          }).eq("id", templateId);
          // Delete old items in one call
          await supabase.from("scope_template_items").delete().eq("template_id", templateId);
        } else {
          // Insert new template
          const { data: tpl, error: tplErr } = await supabase.from("scope_templates").insert({
            name: tplName, product: group.product, category: group.category,
          }).select("id").single();
          if (tplErr || !tpl) {
            errors++;
            addImportLog(entity, "error", `Template "${tplName}": ${tplErr?.message}`, "batch_error");
            updateImportStats(entity, { errors });
            continue;
          }
          templateId = tpl.id;
        }

        // Separate processes (P) and sub-items (S)
        const processes = group.items.filter(i => i.tipo === "P");
        const subItems = group.items.filter(i => i.tipo === "S");

        // BATCH insert all processes at once
        let sortOrder = 0;
        const processIdMap = new Map<string, string>();

        if (processes.length > 0) {
          const processRows = processes.map(proc => ({
            template_id: templateId,
            description: proc.desc,
            default_hours: proc.hours,
            sort_order: sortOrder++,
            parent_id: null,
          }));
          const { data: insertedProcs, error: procErr } = await supabase
            .from("scope_template_items")
            .insert(processRows)
            .select("id, description");
          if (procErr) {
            addImportLog(entity, "error", `Processos de "${tplName}": ${procErr.message}`, "batch_error");
          } else if (insertedProcs) {
            for (const p of insertedProcs) {
              processIdMap.set(p.description.toLowerCase(), p.id);
            }
          }
        }

        // BATCH insert all sub-items at once
        if (subItems.length > 0) {
          const subRows: any[] = [];
          for (const sub of subItems) {
            const parentId = processIdMap.get(sub.parentDesc.toLowerCase());
            if (!parentId) {
              addImportLog(entity, "warning", `Sub-item "${sub.desc}": pai "${sub.parentDesc}" não encontrado em "${tplName}".`, "relation");
              continue;
            }
            subRows.push({
              template_id: templateId,
              description: sub.desc,
              default_hours: sub.hours,
              sort_order: sortOrder++,
              parent_id: parentId,
            });
          }
          if (subRows.length > 0) {
            const { error: subErr } = await supabase.from("scope_template_items").insert(subRows);
            if (subErr) addImportLog(entity, "error", `Sub-itens de "${tplName}": ${subErr.message}`, "batch_error");
          }
        }

        if (isUpdate) {
          updated++;
          updateImportStats(entity, { updated });
          addImportLog(entity, "ok", `Template "${tplName}" atualizado (${processes.length} processos, ${subItems.length} sub-itens)`, "update");
        } else {
          imported++;
          updateImportStats(entity, { imported });
          addImportLog(entity, "ok", `Template "${tplName}" importado (${processes.length} processos, ${subItems.length} sub-itens)`, "insert");
        }
      } catch (err: any) {
        errors++;
        updateImportStats(entity, { errors });
        addImportLog(entity, "error", `Template "${tplName}": ${err.message}`, "batch_error");
      }
    }

    const finalStatus = errors > 0 && imported === 0 && updated === 0 ? "error" : "success";
    finishImportRun(entity, finalStatus);
    const dur = Date.now() - importRun.startedAt;
    addImportLog(entity, finalStatus === "error" ? "error" : "ok",
      `${finalStatus === "error" ? "❌ Falhou" : "✅ Concluído"} — ${imported} novos, ${updated} atualizados, ${errors} erros | Tempo: ${formatDuration(dur)}`, "summary");
    if (imported > 0 || updated > 0) { qc.invalidateQueries({ queryKey: ["scope_templates"] }); qc.invalidateQueries({ queryKey: ["scope_template_items"] }); }
    const errorMsgs = run?.logs.filter(l => l.status === "error").map(l => l.message).slice(0, 200) || [];
    if (dbLogId) await supabase.from("import_logs").update({
      status: finalStatus, total_rows: dataRows.length, imported, updated, errors,
      finished_at: new Date().toISOString(), duration_ms: dur,
      summary: `${imported} novos, ${updated} atualizados, ${errors} erros`,
      error_details: errorMsgs,
    } as any).eq("id", dbLogId);
  }

  // ── SALES TARGETS import with mapped columns ──────────────────
  async function runSalesTargetsImportMapped(fieldToCol: Record<string, number>, ev: (row: any[], key: string) => any, currentAliases: AliasStore) {
    const entity: ImportEntity = "sales_targets";
    const importRun = startImportRun(entity, file!.name, false);
    const year = Number(targetYear);
    const errorDetails: { line: number; owner: string; month?: number; message: string }[] = [];

    // Load categories and segments
    const { data: allCategories } = await supabase.from("categories").select("id, name");
    const { data: allSegments } = await supabase.from("software_segments").select("id, name");
    const catMap = new Map<string, string>();
    for (const c of (allCategories || [])) { catMap.set(normalize(c.name), c.id); }
    const segMap = new Map<string, string>();
    for (const s of (allSegments || [])) { segMap.set(normalize(s.name), s.id); }

    const hasCategoryCol = fieldToCol["category_name"] !== undefined || fieldToCol["category_code"] !== undefined;
    const hasSegmentCol = fieldToCol["segment_name"] !== undefined || fieldToCol["segment_code"] !== undefined;
    const hasRoleCol = fieldToCol["role_name"] !== undefined;
    const hasUnitCol = fieldToCol["unit_code"] !== undefined;

    const roleMap: Record<string, string> = {
      "esn": "esn", "executivo": "esn", "executivo de vendas": "esn",
      "gsn": "gsn", "gerente": "gsn", "gerente de vendas": "gsn",
      "dsn": "dsn", "diretor": "dsn", "diretor de vendas": "dsn",
      "arquiteto": "arquiteto", "engenheiro de valor": "arquiteto", "ev": "arquiteto",
    };

    const dataRows = allDataRows.filter(r => ev(r, "esn_code") || ev(r, "esn_name"));
    updateImportStats(entity, { totalRows: dataRows.length });

    const catLabel = hasCategoryCol ? "por coluna" : categoriesList.find(c => c.id === targetCategoryId)?.name || "—";
    const segLabel = hasSegmentCol ? "por coluna" : segmentsList.find(s => s.id === targetSegmentId)?.name || "—";
    const roleLabel = hasRoleCol ? "por coluna" : targetRole.toUpperCase();
    addImportLog(entity, "info", `📊 ${dataRows.length} linhas com dono da meta. Ano: ${year} | Nível: ${roleLabel} | Categoria: ${catLabel} | Segmento: ${segLabel}`, "validation");

    importRun.totalRows = dataRows.length;
    let dbLogId: string | undefined;
    try {
      const { data } = await supabase.from("import_logs").insert({
        entity, file_name: file!.name, status: "running",
        total_rows: dataRows.length, cleared_before: clearExistingTargets, user_id: user?.id || null,
      } as any).select("id").single();
      dbLogId = data?.id;
    } catch {}

    // Load units early (needed for clear scoping and later processing)
    const { data: units } = await supabase.from("unit_info").select("id, code, name");
    const unitList = (units || []).map(u => ({ id: u.id, code: (u.code || "").trim().toLowerCase(), name: u.name.trim().toLowerCase() }));

    // Clear existing targets for the year if requested — SCOPED to units found in the spreadsheet
    if (clearExistingTargets) {
      const unitAliasKeyForClear = getAliasKey(entity, "unit_code");
      const spreadsheetUnitIds = new Set<string>();
      for (const row of dataRows) {
        const candidates = hasUnitCol ? collectSalesTargetUnitCandidates(row, headers, fieldToCol) : [];
        for (const candidate of candidates) {
          const resolved = findInListWithAlias(unitList, candidate, unitAliasKeyForClear, currentAliases);
          if (resolved) { spreadsheetUnitIds.add(resolved); break; }
        }
      }

      if (spreadsheetUnitIds.size === 0) {
        addImportLog(entity, "warning", `⚠️ Nenhuma unidade identificada na planilha para escopo da limpeza. Limpeza não executada para evitar apagar dados de outras unidades.`, "system");
      } else {
        const unitNames = Array.from(spreadsheetUnitIds).map(uid => {
          const u = unitList.find(u => u.id === uid);
          return u ? `${u.code} (${u.name})`.toUpperCase() : uid;
        });
        addImportLog(entity, "info", `🗑️ Removendo metas existentes do ano ${year} para: ${unitNames.join(", ")}...`);
        let deletedCount = 0;
        let deleteError = false;
        const unitIdsArray = Array.from(spreadsheetUnitIds);
        while (true) {
          const { data: batch } = await supabase.from("sales_targets")
            .select("id")
            .eq("year", year)
            .in("unit_id", unitIdsArray)
            .limit(500);
          if (!batch || batch.length === 0) break;
          const ids = batch.map(r => r.id);
          const { error, count } = await supabase.from("sales_targets")
            .delete({ count: "exact" })
            .in("id", ids);
          if (error) {
            addImportLog(entity, "error", `Erro ao limpar metas: ${error.message}`);
            deleteError = true;
            break;
          }
          deletedCount += count || ids.length;
        }
        if (!deleteError) {
          addImportLog(entity, "ok", `✅ ${deletedCount} meta(s) existente(s) removida(s) do ano ${year} (escopo: ${unitNames.join(", ")}).`);
        }
      }
    }

    if (dataRows.length === 0) {
      addImportLog(entity, "error", "Nenhum dono de meta encontrado.");
      finishImportRun(entity, "error");
      if (dbLogId) {
        await supabase.from("import_logs").update({
          status: "error", total_rows: 0, finished_at: new Date().toISOString(),
          duration_ms: Date.now() - importRun.startedAt, summary: "Nenhum dono de meta encontrado.",
        } as any).eq("id", dbLogId);
      }
      return;
    }

    // Load all sales team members + CRM codes
    const [{ data: salesTeam }, crmCodes] = await Promise.all([
      supabase.from("sales_team").select("id, code, name, role, unit_id"),
      loadCrmCodes(),
    ]);
    type ResolvedMember = { id: string; role: string; unit_id: string | null; source: "crm" | "code" | "name" };
    const salesTeamById = new Map((salesTeam || []).map((member) => [member.id, member]));
    const salesTeamCodeMap = new Map<string, ResolvedMember>();
    const salesTeamNameMap = new Map<string, ResolvedMember>();
    const crmMembersByCode = new Map<string, ResolvedMember[]>();

    for (const s of (salesTeam || [])) {
      const codeLower = s.code.trim().toLowerCase();
      const nameLower = s.name.trim().toLowerCase();
      if (!salesTeamCodeMap.has(codeLower)) salesTeamCodeMap.set(codeLower, { id: s.id, role: s.role, unit_id: s.unit_id, source: "code" });
      if (!salesTeamNameMap.has(nameLower)) salesTeamNameMap.set(nameLower, { id: s.id, role: s.role, unit_id: s.unit_id, source: "name" });
    }

    for (const crm of crmCodes) {
      const member = salesTeamById.get(crm.sales_team_id);
      if (!member) continue;
      const key = crm.code.trim().toLowerCase();
      const current = crmMembersByCode.get(key) || [];
      if (!current.some((entry) => entry.id === member.id && entry.role === member.role && entry.unit_id === (crm.unit_id || member.unit_id))) {
        current.push({ id: member.id, role: member.role, unit_id: crm.unit_id || member.unit_id, source: "crm" });
        crmMembersByCode.set(key, current);
      }
    }

    const resolveCrmMember = (codeLower: string, rowUnitId: string | null, rowRoleHint: string | null): ResolvedMember | null => {
      const matches = crmMembersByCode.get(codeLower) || [];
      if (matches.length === 0) return null;

      const pickSingle = (items: ResolvedMember[]) => items.length === 1 ? items[0] : null;

      if (rowUnitId) {
        const unitMatches = matches.filter((entry) => entry.unit_id === rowUnitId);
        const unitRoleMatches = rowRoleHint ? unitMatches.filter((entry) => entry.role === rowRoleHint) : unitMatches;
        const picked = pickSingle(unitRoleMatches) || pickSingle(unitMatches);
        if (picked) return picked;
      }

      if (rowRoleHint) {
        const roleMatches = matches.filter((entry) => entry.role === rowRoleHint);
        const picked = pickSingle(roleMatches);
        if (picked) return picked;
      }

      return pickSingle(matches);
    };

    const esnCodeAliases = currentAliases[getAliasKey(entity, "esn_code")] || {};
    const esnNameAliases = currentAliases[getAliasKey(entity, "esn_name")] || {};

    // Track which members need CRM code creation (resolved via sales_team.code fallback)
    const crmCodesPendingCreation = new Map<string, { code: string; sales_team_id: string; unit_id: string | null }>();
    // Track which members need unit_id update
    const memberUnitUpdates = new Map<string, string>(); // member_id -> unit_id
    // Track which members need role update
    const memberRoleUpdates = new Map<string, string>(); // member_id -> role

    // No pre-load of existing targets needed — each row is inserted independently
    // Categories and segments are resolved via pre-scan (no auto-creation)

    let imported = 0, updated = 0, errors = 0, skipped = 0, processed = 0;
    const cancelSignal = getCancelSignal(entity);
    let interrupted = false;

    // Prepare all records to insert/update in bulk
    const toInsert: any[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      if (cancelSignal?.aborted) { interrupted = true; addImportLog(entity, "info", "⛔ Importação interrompida pelo usuário."); break; }

      const row = dataRows[i];
      const lineNum = i + 2;
      const esnCode = (ev(row, "esn_code") || "").trim().toLowerCase();
      const esnName = (ev(row, "esn_name") || "").trim().toLowerCase();
      const esnLabel = ev(row, "esn_code") || ev(row, "esn_name") || "(vazio)";
      const roleVal = (ev(row, "role_name") || "").trim().toLowerCase();
      const rowRoleHint = roleVal ? (roleMap[roleVal] || null) : null;

      // Resolve unit_id from file values first; only fall back to member unit when the row has no unit info.
      const unitAliasKey = getAliasKey(entity, "unit_code");
      const unitCandidates = hasUnitCol ? collectSalesTargetUnitCandidates(row, headers, fieldToCol) : [];
      const hasExplicitUnitInput = unitCandidates.length > 0;
      let rowUnitId: string | null = null;

      for (const candidate of unitCandidates) {
        const resolved = findInListWithAlias(unitList, candidate, unitAliasKey, currentAliases);
        if (resolved) {
          rowUnitId = resolved;
          break;
        }
      }

      if (!rowUnitId && !hasExplicitUnitInput) {
      } else if (!rowUnitId && hasExplicitUnitInput) {
        addImportLog(entity, "warning", `Linha ${lineNum}: Unidade informada (${unitCandidates.join(" / ")}) não encontrada; sem fallback automático para evitar gravar a meta na unidade errada.`, "relation");
      }

      const memberByCode = salesTeamCodeMap.get(esnCode);
      const memberByCrm = !memberByCode && esnCode ? resolveCrmMember(esnCode, rowUnitId, rowRoleHint) : null;
      const memberByName = salesTeamNameMap.get(esnName);
      const resolvedMember = memberByCode || memberByCrm || memberByName || null;
      const esnId = resolvedMember?.id || esnCodeAliases[esnCode] || esnNameAliases[esnName];
      const detectedMemberRole = resolvedMember?.role;
      const memberUnitId = resolvedMember?.unit_id || null;
      const resolvedSource = resolvedMember?.source || (esnId ? "name" : undefined);

      if (!rowUnitId && !hasExplicitUnitInput) {
        rowUnitId = memberUnitId;
      }

      if (!esnId) {
        errors++;
        const msg = `Linha ${lineNum}: Dono da meta "${esnLabel}" não encontrado no cadastro do Time de Vendas.`;
        addImportLog(entity, "error", msg);
        errorDetails.push({ line: lineNum, owner: esnLabel, message: "Não encontrado no cadastro do Time de Vendas" });
        processed++;
        continue;
      }

      const crmAssociationDecision = getSalesTargetCrmAssociationDecision({
        incomingCode: esnCode,
        resolvedMemberId: esnId,
        resolvedSource,
        crmCodes,
      });

      if (crmAssociationDecision.hasConflict) {
        addImportLog(entity, "warning", `Linha ${lineNum}: código CRM "${esnCode}" já pertence a outro membro do Time de Vendas; associação automática não realizada.`, "relation");
      }

      // Guard: don't create CRM code if this code is already a direct sales_team.code of another member
      const codeIsDirectOwned = salesTeamCodeMap.has(esnCode) && salesTeamCodeMap.get(esnCode)!.id !== esnId;
      if (esnCode && crmAssociationDecision.shouldCreate && !codeIsDirectOwned && !crmCodesPendingCreation.has(`${esnCode}|${esnId}`)) {
        crmCodesPendingCreation.set(`${esnCode}|${esnId}`, {
          code: esnCode.trim(),
          sales_team_id: esnId,
          unit_id: rowUnitId,
        });
      }

      // If member has no unit_id but row has one, track for update
      if (esnId && rowUnitId && !memberUnitId) {
        memberUnitUpdates.set(esnId, rowUnitId);
      }

      // If spreadsheet has role_name column and member's role differs, track for update
      if (hasRoleCol && esnId) {
        const mappedRole = rowRoleHint;
        if (mappedRole && detectedMemberRole && mappedRole !== detectedMemberRole) {
          memberRoleUpdates.set(esnId, mappedRole);
        }
      }

      // Resolve category (by name or code, including aliases from pre-scan)
      let rowCategoryId: string | null = targetCategoryId || null;
      if (hasCategoryCol) {
        const rawCatName = (ev(row, "category_name") || "").trim();
        const rawCatCode = (ev(row, "category_code") || "").trim();
        if (rawCatName) {
          rowCategoryId = catMap.get(normalize(rawCatName)) || null;
          // Check aliases from pre-scan resolution
          if (!rowCategoryId) {
            const catAliasKey = getAliasKey(entity, "category_name");
            const catAliases = currentAliases[catAliasKey];
            if (catAliases && catAliases[normalize(rawCatName)]) {
              rowCategoryId = catAliases[normalize(rawCatName)];
            }
          }
        }
        if (!rowCategoryId && rawCatCode) {
          const found = (allCategories || []).find(c => normalize(c.name) === normalize(rawCatCode) || c.id === rawCatCode);
          if (found) rowCategoryId = found.id;
        }
      }

      // Resolve segment (by name or code, including aliases from pre-scan)
      let rowSegmentId: string | null = targetSegmentId || null;
      if (hasSegmentCol) {
        const rawSegName = (ev(row, "segment_name") || "").trim();
        const rawSegCode = (ev(row, "segment_code") || "").trim();
        if (rawSegName) {
          rowSegmentId = segMap.get(normalize(rawSegName)) || null;
          // Check aliases from pre-scan resolution
          if (!rowSegmentId) {
            const segAliasKey = getAliasKey(entity, "segment_name");
            const segAliases = currentAliases[segAliasKey];
            if (segAliases && segAliases[normalize(rawSegName)]) {
              rowSegmentId = segAliases[normalize(rawSegName)];
            }
          }
        }
        if (!rowSegmentId && rawSegCode) {
          const found = (allSegments || []).find(s => normalize(s.name) === normalize(rawSegCode) || s.id === rawSegCode);
          if (found) rowSegmentId = found.id;
        }
      }

      // Resolve role
      let rowRole = targetRole || "esn";
      if (hasRoleCol) {
        if (roleVal) { rowRole = rowRoleHint || targetRole || "esn"; }
      } else if (detectedMemberRole) {
        rowRole = detectedMemberRole;
      }

      // Validação obrigatória: nunca inserir meta sem dono, categoria, segmento, nível ou unidade
      if (!rowCategoryId) {
        errors++;
        const msg = `Linha ${lineNum}: Categoria obrigatória não encontrada para "${esnLabel}".`;
        addImportLog(entity, "error", msg, "validation");
        errorDetails.push({ line: lineNum, owner: esnLabel, message: "Categoria obrigatória não encontrada" });
        processed++;
        continue;
      }
      if (!rowSegmentId) {
        errors++;
        const msg = `Linha ${lineNum}: Segmento obrigatório não encontrado para "${esnLabel}".`;
        addImportLog(entity, "error", msg, "validation");
        errorDetails.push({ line: lineNum, owner: esnLabel, message: "Segmento obrigatório não encontrado" });
        processed++;
        continue;
      }
      if (!rowRole) {
        errors++;
        const msg = `Linha ${lineNum}: Nível/Função obrigatório não definido para "${esnLabel}".`;
        addImportLog(entity, "error", msg, "validation");
        errorDetails.push({ line: lineNum, owner: esnLabel, message: "Nível/Função obrigatório não definido" });
        processed++;
        continue;
      }
      if (!rowUnitId) {
        errors++;
        const msg = `Linha ${lineNum}: Unidade obrigatória não resolvida para "${esnLabel}" — registro não será enviado ao banco.`;
        addImportLog(entity, "error", msg, "validation");
        errorDetails.push({ line: lineNum, owner: esnLabel, message: "Unidade obrigatória não resolvida (FK unit_id)" });
        processed++;
        continue;
      }

      // Insert each row/month directly without logical key dedup
      for (let m = 1; m <= 12; m++) {
        const val = ev(row, `month_${m}`);
        const amount = Math.round((Number(val) || 0) * 100) / 100;
        if (amount === 0) { skipped++; continue; }
        toInsert.push({
          esn_id: esnId,
          year,
          month: m,
          amount,
          role: rowRole,
          category_id: rowCategoryId,
          segment_id: rowSegmentId,
          unit_id: rowUnitId,
          _line: lineNum,
          _owner: String(esnLabel),
          _month: m,
        });
      }

      processed++;
      if (processed % 10 === 0) {
        updateImportStats(entity, { processed, imported, updated, errors, skipped });
      }
    }

    const totalWork = processed + toInsert.length;
    updateImportStats(entity, { totalRows: totalWork, processed, imported, updated, errors, skipped });
    addImportLog(entity, "info", `📋 ${dataRows.length} linhas lidas → ${toInsert.length} inserções pendentes`, "system");

    // Batch INSERT (plain insert, no logical key dedup)
    if (toInsert.length > 0 && !interrupted) {
      addImportLog(entity, "info", `Inserindo ${toInsert.length} registros em lote...`);
      const BATCH = 100;
      for (let b = 0; b < toInsert.length; b += BATCH) {
        if (cancelSignal?.aborted) { interrupted = true; break; }
        const batch = toInsert.slice(b, b + BATCH);
        const cleanBatch = batch.map(({ _line, _owner, _month, ...rest }) => rest);
        const { error: batchErr } = await supabase.from("sales_targets").insert(cleanBatch);
        if (batchErr) {
          for (let j = 0; j < cleanBatch.length; j++) {
            const { error } = await supabase.from("sales_targets").insert(cleanBatch[j]);
            if (error) {
              errors++;
              const item = batch[j];
              const msg = `Linha ${item._line} (${item._owner}) mês ${item._month}: ${error.message}`;
              addImportLog(entity, "error", msg);
              errorDetails.push({ line: item._line, owner: item._owner, month: item._month, message: error.message });
            } else {
              imported++;
            }
          }
        } else {
          imported += cleanBatch.length;
        }
        processed += cleanBatch.length;
        updateImportStats(entity, { processed, imported, updated, errors, skipped });
      }
    }

    // Post-processing: create CRM codes for members resolved via sales_team.code fallback
    if (crmCodesPendingCreation.size > 0 && !interrupted) {
      addImportLog(entity, "info", `Criando ${crmCodesPendingCreation.size} código(s) CRM para membros resolvidos por fallback...`, "system");
      const crmBatch = Array.from(crmCodesPendingCreation.values()).map(c => ({
        code: c.code.trim().toUpperCase(), sales_team_id: c.sales_team_id, unit_id: c.unit_id, description: "Criado automaticamente via importação de metas",
      }));
      for (let b = 0; b < crmBatch.length; b += 100) {
        const batch = crmBatch.slice(b, b + 100);
        await supabase.from("sales_team_crm_codes").upsert(batch, { onConflict: "code,sales_team_id" });
      }
      invalidateCrmCache();
      addImportLog(entity, "ok", `${crmCodesPendingCreation.size} código(s) CRM criados.`, "insert");
    }

    // Post-processing: update member unit_id where missing
    if (memberUnitUpdates.size > 0 && !interrupted) {
      addImportLog(entity, "info", `Atualizando unidade de ${memberUnitUpdates.size} membro(s) do time...`, "system");
      for (const [memberId, unitId] of memberUnitUpdates) {
        await supabase.from("sales_team").update({ unit_id: unitId }).eq("id", memberId);
      }
      addImportLog(entity, "ok", `${memberUnitUpdates.size} membro(s) com unidade atualizada.`, "update");
    }

    // Post-processing: update member role where spreadsheet differs from stored value
    if (memberRoleUpdates.size > 0 && !interrupted) {
      addImportLog(entity, "info", `Atualizando função/nível de ${memberRoleUpdates.size} membro(s) do time...`, "system");
      for (const [memberId, newRole] of memberRoleUpdates) {
        await supabase.from("sales_team").update({ role: newRole as any }).eq("id", memberId);
      }
      addImportLog(entity, "ok", `${memberRoleUpdates.size} membro(s) com função atualizada.`, "update");
    }

    const finalStatus = interrupted ? "interrupted" : (errors > 0 && imported === 0 && updated === 0 ? "error" : "success");
    finishImportRun(entity, finalStatus as any);
    const dur = Date.now() - importRun.startedAt;
    addImportLog(
      entity,
      finalStatus === "interrupted" ? "info" : "ok",
      `${finalStatus === "interrupted" ? "⛔ Interrompido" : "✅ Concluído"} — ${dataRows.length} linhas → ${imported} inseridos, ${updated} atualizados, ${skipped} ignorados, ${errors} erros | Tempo: ${formatDuration(dur)}`,
    );
    if (imported > 0 || updated > 0) qc.invalidateQueries({ queryKey: ["sales_targets"] });

    // Persist final state with error details
    if (dbLogId) {
      const truncatedErrors = errorDetails.slice(0, 200).map(e =>
        `L${e.line} ${e.owner}${e.month ? ` mês ${e.month}` : ""}: ${e.message}`
      );
      await supabase.from("import_logs").update({
        status: finalStatus, total_rows: totalWork, imported, updated, errors, skipped,
        finished_at: new Date().toISOString(), duration_ms: dur,
        summary: `${dataRows.length} linhas → ${imported} inseridos, ${updated} atualizados, ${errors} erros, ${skipped} ignorados`,
        error_details: truncatedErrors,
      } as any).eq("id", dbLogId);
    }
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
    setUnresolvedItems([]);
    setResolutionSelections({});
    setValidationResult(null);
    setDryRunResult(null);
    invalidateCrmCache();
  };

  // ── Helper to get lookup list for a relational field ──────────
  function getListForType(listType: "units" | "esn" | "gsn" | "sales_team" | "categories" | "segments") {
    switch (listType) {
      case "units": return lookupListsCache.unitList;
      case "esn": return lookupListsCache.esnList;
      case "gsn": return lookupListsCache.gsnList;
      case "sales_team": return lookupListsCache.salesTeamList;
      case "categories": return lookupListsCache.categoryList;
      case "segments": return lookupListsCache.segmentList;
    }
  }

  const mappedCount = Object.keys(mapping).length;
  const requiredMapped = dbFields.filter(f => f.required).every(f => Object.values(mapping).includes(f.key));
  const isRunning = run?.status === "running";
  const EntityIcon = entityConfig.icon;

  // Count how many unresolved items were assigned
  const resolvedCount = unresolvedItems.filter(item => {
    const key = `${item.fieldKey}:${item.valueLower}`;
    const sel = resolutionSelections[key];
    return sel && sel !== "__skip__";
  }).length;

  // ── Render ────────────────────────────────────────────────────
  return (
    <>
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
            {(["upload", "confirm", "mapping", "options", "preview", "running"] as Step[]).map((s, i) => {
              const labels = ["Arquivo", "Tipo", "Mapeamento", "Opções", "Simulação", "Importação"];
              const icons = [Upload, Eye, Settings2, Filter, Target, Play];
              const Icon = icons[i];
              const allSteps = ["upload", "confirm", "mapping", "options", "preview", "running"];
              const isActive = step === s || (step === "done" && s === "running");
              const isPast = allSteps.indexOf(step) > i || step === "done";
              return (
                <div key={s} className="flex items-center gap-1 flex-1">
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors w-full justify-center
                    ${isActive ? "bg-primary text-primary-foreground" : isPast ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                    <Icon className="h-3 w-3 shrink-0" />
                    <span className="hidden sm:inline truncate">{labels[i]}</span>
                  </div>
                  {i < 5 && <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                </div>
              );
            })}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* ── STEP: Upload ───────────────────────────────────── */}
          {step === "upload" && (
            <div
              className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all group"
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("border-primary", "bg-primary/5"); }}
              onDragLeave={e => { e.currentTarget.classList.remove("border-primary", "bg-primary/5"); }}
              onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove("border-primary", "bg-primary/5"); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            >
              <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-2xl bg-primary/10 mb-4 group-hover:bg-primary/15 transition-colors">
                <Upload className="h-7 w-7 text-primary/60 group-hover:text-primary transition-colors" />
              </div>
              <p className="text-sm font-medium">Arraste uma planilha ou clique para selecionar</p>
              <p className="text-xs text-muted-foreground mt-1.5">.xlsx ou .xls — Clientes, Time de Vendas, Templates ou Metas</p>
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

              {/* Year / Category / Segment selector for sales_targets */}
              {detectedEntity === "sales_targets" && (
                <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Configuração de Metas</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">Ano:</Label>
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

                    {/* Category — hidden if mapped from column */}
                    {!Object.values(mapping).includes("category_name") && (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground whitespace-nowrap">Categoria:</Label>
                        <Select value={targetCategoryId} onValueChange={setTargetCategoryId}>
                          <SelectTrigger className="w-[160px] h-8 text-sm">
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {categoriesList.map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {Object.values(mapping).includes("category_name") && (
                      <Badge variant="outline" className="text-xs">Categoria: via coluna mapeada</Badge>
                    )}

                    {/* Segment — hidden if mapped from column */}
                    {!Object.values(mapping).includes("segment_name") && (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground whitespace-nowrap">Segmento:</Label>
                        <Select value={targetSegmentId} onValueChange={setTargetSegmentId}>
                          <SelectTrigger className="w-[160px] h-8 text-sm">
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {segmentsList.map(s => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {Object.values(mapping).includes("segment_name") && (
                      <Badge variant="outline" className="text-xs">Segmento: via coluna mapeada</Badge>
                    )}

                    {/* Role — hidden if mapped from column */}
                    {!Object.values(mapping).includes("role_name") && (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground whitespace-nowrap">Nível:</Label>
                        <Select value={targetRole} onValueChange={setTargetRole}>
                          <SelectTrigger className="w-[180px] h-8 text-sm">
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="esn">Executivo de Vendas (ESN)</SelectItem>
                            <SelectItem value="gsn">Gerente de Vendas (GSN)</SelectItem>
                            <SelectItem value="dsn">Diretor de Vendas (DSN)</SelectItem>
                            <SelectItem value="arquiteto">Engenheiro de Valor</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {Object.values(mapping).includes("role_name") && (
                      <Badge variant="outline" className="text-xs">Nível: via coluna mapeada</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Se a planilha possuir colunas de Categoria/Segmento/Nível mapeadas, os valores serão usados por linha. Categorias e segmentos ausentes serão criados automaticamente; caso contrário, o valor selecionado acima será aplicado a todos os registros.
                  </p>
                  <Separator className="my-2" />
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="clearExistingTargets"
                      checked={clearExistingTargets}
                      onCheckedChange={(v) => setClearExistingTargets(!!v)}
                    />
                    <Label htmlFor="clearExistingTargets" className="text-xs cursor-pointer">
                      Limpar metas existentes do ano <strong>{targetYear}</strong> antes de importar
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground ml-6">
                    Remove todas as metas do ano selecionado antes de inserir os novos registros. Use ao reimportar planilhas corrigidas.
                  </p>
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
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1">
                  <div className="flex items-center gap-2 text-xs font-medium text-primary">
                    <Link2 className="h-3.5 w-3.5 shrink-0" />
                    Campos relacionais detectados
                  </div>
                  <p className="text-xs text-muted-foreground">
                    O sistema verificará vínculos de Unidade, ESN e GSN antes de importar. Valores não encontrados serão apresentados para que você indique a correspondência correta.
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

              {/* Validation results */}
              {validationResult && (
                <div className="space-y-2">
                  {validationResult.errors.length > 0 && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                      {validationResult.errors.map((e, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-destructive">
                          <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>{e}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {validationResult.warnings.length > 0 && (
                    <div className="rounded-md border border-warning/30 bg-warning/5 p-3 space-y-1">
                      {validationResult.warnings.map((w, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-warning" />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 justify-between">
                <Button variant="outline" size="sm" onClick={() => { setStep("mapping"); setValidationResult(null); }}>
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Voltar
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={runDryRun} disabled={dryRunLoading || scanningRelations}>
                    {dryRunLoading ? (
                      <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Simulando...</>
                    ) : (
                      <><Eye className="mr-1.5 h-3.5 w-3.5" /> Simular</>
                    )}
                  </Button>
                  <Button size="sm" onClick={runImport} disabled={scanningRelations || dryRunLoading}>
                    {scanningRelations ? (
                      <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Verificando vínculos...</>
                    ) : (
                      <><Play className="mr-1.5 h-3.5 w-3.5" /> Importar Direto</>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* ── STEP: Preview (Dry-Run) ────────────────────────── */}
          {step === "preview" && dryRunResult && (
            <div className="space-y-4">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <Target className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <span className="text-sm font-semibold">Resultado da Simulação</span>
                      <p className="text-[11px] text-muted-foreground">Nenhum dado foi gravado no banco</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">Dry-run</Badge>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {[
                    { label: "Lidas", value: dryRunResult.totalRows, color: "border-border bg-background", textColor: "text-foreground" },
                    { label: "Válidas", value: dryRunResult.validRows, color: "border-border bg-background", textColor: "text-foreground" },
                    { label: "Inválidas", value: dryRunResult.invalidRows, color: "border-destructive/20 bg-destructive/5", textColor: "text-destructive" },
                    { label: "Inserções", value: dryRunResult.toInsert, color: "border-success/20 bg-success/5", textColor: "text-success" },
                    { label: "Atualizações", value: dryRunResult.toUpdate, color: "border-primary/20 bg-primary/5", textColor: "text-primary" },
                    { label: "Ignorados", value: dryRunResult.toSkip, color: "border-border bg-background", textColor: "text-muted-foreground" },
                  ].map(s => (
                    <div key={s.label} className={`rounded-lg border p-2.5 text-center ${s.color}`}>
                      <div className={`text-xl font-bold tabular-nums ${s.textColor}`}>{s.value}</div>
                      <div className="text-[10px] text-muted-foreground">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Blockers */}
              {dryRunResult.blockers.length > 0 && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-destructive">
                    <XCircle className="h-3.5 w-3.5" /> Erros bloqueantes ({dryRunResult.blockers.length})
                  </div>
                  {dryRunResult.blockers.map((b, i) => (
                    <div key={i} className="text-xs text-destructive pl-5">• {b}</div>
                  ))}
                </div>
              )}

              {/* Unresolved relations */}
              {dryRunResult.unresolvedRelations.length > 0 && (
                <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-yellow-700 dark:text-yellow-400">
                    <AlertTriangle className="h-3.5 w-3.5" /> Vínculos não resolvidos ({dryRunResult.unresolvedRelations.length})
                  </div>
                  {dryRunResult.unresolvedRelations.map((ur, i) => (
                    <div key={i} className="text-xs text-muted-foreground pl-5">
                      • <span className="font-medium">{ur.field}:</span> "{ur.value}" — {ur.count} ocorrência(s)
                    </div>
                  ))}
                </div>
              )}

              {/* Warnings */}
              {dryRunResult.warnings.length > 0 && (
                <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-yellow-700 dark:text-yellow-400">
                    <AlertTriangle className="h-3.5 w-3.5" /> Alertas ({dryRunResult.warnings.length})
                  </div>
                  {dryRunResult.warnings.map((w, i) => (
                    <div key={i} className="text-xs text-muted-foreground pl-5">• {w}</div>
                  ))}
                </div>
              )}

              {/* Detail log (collapsible) */}
              {dryRunResult.details.length > 0 && dryRunResult.details.length <= 200 && (
                <details className="rounded-md border border-border">
                  <summary className="px-3 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                    Detalhes linha a linha ({dryRunResult.details.length} registros)
                  </summary>
                  <ScrollArea className="h-40 px-3 pb-2">
                    <div className="space-y-0.5 font-mono text-[11px]">
                      {dryRunResult.details.map((d, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          {d.action === "insert" && <CheckCircle2 className="h-3 w-3 text-success shrink-0 mt-0.5" />}
                          {d.action === "update" && <FileSpreadsheet className="h-3 w-3 text-primary shrink-0 mt-0.5" />}
                          {d.action === "skip" && <Clock className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />}
                          {d.action === "error" && <XCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />}
                          <span className={
                            d.action === "error" ? "text-destructive" :
                            d.action === "insert" ? "text-success" :
                            d.action === "update" ? "text-primary" : "text-muted-foreground"
                          }>
                            {d.line > 0 ? `L${d.line}: ` : ""}{d.reason}
                          </span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </details>
              )}
              {dryRunResult.details.length > 200 && (
                <div className="text-xs text-muted-foreground text-center">
                  {dryRunResult.details.length} detalhes — exibição resumida para performance.
                  Erros: {dryRunResult.details.filter(d => d.action === "error").length}
                </div>
              )}

              {dryRunResult.blockers.length > 0 ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-destructive">
                    <XCircle className="h-4 w-4" />
                    Importação bloqueada — corrija os erros listados acima antes de prosseguir.
                  </div>
                </div>
              ) : null}

              <div className="flex gap-2 justify-between">
                <Button variant="outline" size="sm" onClick={() => { setStep("options"); setDryRunResult(null); }}>
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Voltar às Opções
                </Button>
                <Button
                  size="sm"
                  onClick={runImport}
                  disabled={dryRunResult.blockers.length > 0}
                  className={dryRunResult.blockers.length === 0 ? "bg-success hover:bg-success/90 text-success-foreground" : ""}
                >
                  <Play className="mr-1.5 h-3.5 w-3.5" /> Confirmar e Importar
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP: Running / Done ───────────────────────────── */}
          {(step === "running" || step === "done") && run && (
            <RunningView run={run} onReset={reset} isDone={step === "done"} />
          )}
        </CardContent>
      </Card>

      {/* ── Relational Resolution Dialog ───────────────────────── */}
      <Dialog open={showResolutionDialog} onOpenChange={(open) => {
        if (!open) setShowResolutionDialog(false);
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Resolver Vínculos Relacionais
            </DialogTitle>
            <DialogDescription>
              {unresolvedItems.length} valor(es) da planilha não foram encontrados no cadastro.
              Selecione a correspondência correta para cada um. Essa associação será salva para futuras importações.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-3 py-2">
              {/* Group by field */}
              {(() => {
                const groups = new Map<string, UnresolvedRelation[]>();
                for (const item of unresolvedItems) {
                  const key = item.fieldKey;
                  if (!groups.has(key)) groups.set(key, []);
                  groups.get(key)!.push(item);
                }
                return Array.from(groups.entries()).map(([fieldKey, items]) => (
                  <div key={fieldKey} className="rounded-lg border border-border overflow-hidden">
                    <div className="px-3 py-2 bg-muted/50 flex items-center gap-2">
                      <Link2 className="h-3.5 w-3.5 text-primary" />
                      <span className="text-sm font-medium">{items[0].fieldLabel}</span>
                      <Badge variant="outline" className="text-[10px]">{items.length} não resolvido(s)</Badge>
                    </div>
                    <div className="divide-y divide-border">
                      {items.map((item) => {
                        const selKey = `${item.fieldKey}:${item.valueLower}`;
                        const list = getListForType(item.listType);
                        return (
                          <div key={selKey} className="px-3 py-2.5 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-destructive truncate">
                                "{item.value}"{item.pairedName ? ` — ${item.pairedName}` : ""}
                              </div>
                              <div className="text-[11px] text-muted-foreground">{item.occurrences} registro(s) na planilha</div>
                            </div>
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <Select
                              value={resolutionSelections[selKey] || "__skip__"}
                              onValueChange={val => {
                                setResolutionSelections(prev => ({ ...prev, [selKey]: val }));
                              }}
                            >
                              <SelectTrigger className="w-[220px] text-xs h-8 shrink-0">
                                <SelectValue placeholder="Ignorar" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__skip__">— Ignorar (não vincular) —</SelectItem>
                                {(item.listType === "sales_team" || item.listType === "esn" || item.listType === "gsn") && (
                                  <SelectItem value="__create__" className="text-primary font-medium">
                                    ＋ Incluir "{item.value}{item.pairedName ? ` — ${item.pairedName}` : ""}" no cadastro
                                  </SelectItem>
                                )}
                                {list.map(item => (
                                  <SelectItem key={item.id} value={item.id}>
                                    {item.code ? `${item.code} — ` : ""}{item.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </ScrollArea>

          <DialogFooter className="flex-row justify-between sm:justify-between gap-2 pt-3 border-t">
            <div className="text-xs text-muted-foreground self-center">
              {resolvedCount} de {unresolvedItems.length} resolvido(s)
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => {
                setShowResolutionDialog(false);
                // Proceed anyway with current aliases (unresolved will be null)
                executeImport(aliasStore);
              }}>
                Pular e Importar
              </Button>
              <Button size="sm" onClick={handleSaveResolutions}>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                Salvar e Importar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Running/Done sub-component ──────────────────────────────────
function RunningView({ run, onReset, isDone }: { run: ImportRun; onReset: () => void; isDone: boolean }) {
  const [showLog, setShowLog] = useState(false);
  const [logFilter, setLogFilter] = useState<"all" | "error" | "warning" | "ok">("all");
  const isRunning = run.status === "running";
  const processedCount = run.totalRows > 0
    ? Math.min(run.totalRows, Math.max(run.processed || 0, run.imported + run.updated + run.errors + run.skipped))
    : 0;
  const progress = run.totalRows > 0 ? (processedCount / run.totalRows * 100) : 0;

  const warningCount = run.logs.filter(l => l.status === "warning").length;
  const errorCount = run.logs.filter(l => l.status === "error").length;
  const okCount = run.logs.filter(l => l.status === "ok").length;

  const filteredLogs = logFilter === "all" ? run.logs : run.logs.filter(l => l.status === logFilter);

  // Use actual processed count as denominator to avoid stale totalRows issues
  const actualProcessed = run.imported + run.updated + run.errors + run.skipped;
  const successRate = actualProcessed > 0
    ? Math.min(100, (run.imported + run.updated + run.skipped) / actualProcessed * 100)
    : 0;

  const entityConfig = ENTITY_CONFIGS[run.entity];
  const EntityIcon = entityConfig.icon;

  // Export errors as text
  const exportErrors = useCallback(() => {
    const errorLogs = run.logs.filter(l => l.status === "error" || l.status === "warning");
    if (errorLogs.length === 0) return;
    const lines = errorLogs.map(l => `[${l.status.toUpperCase()}]${l.category ? ` [${l.category}]` : ""} ${l.message}`);
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-report-${run.entity}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [run]);

  // Status config
  const statusConfig = run.status === "success" && run.errors === 0
    ? { icon: <CheckCircle2 className="h-5 w-5" />, label: "Importação concluída com sucesso", cls: "border-success/30 bg-success/5 text-success", ringColor: "text-success" }
    : run.status === "success" && run.errors > 0
    ? { icon: <AlertTriangle className="h-5 w-5" />, label: "Concluída com alertas", cls: "border-yellow-500/30 bg-yellow-500/5 text-yellow-700 dark:text-yellow-400", ringColor: "text-yellow-500" }
    : run.status === "interrupted"
    ? { icon: <AlertTriangle className="h-5 w-5" />, label: "Importação interrompida", cls: "border-yellow-500/30 bg-yellow-500/5 text-yellow-700 dark:text-yellow-400", ringColor: "text-yellow-500" }
    : run.status === "error"
    ? { icon: <XCircle className="h-5 w-5" />, label: "Importação falhou", cls: "border-destructive/30 bg-destructive/5 text-destructive", ringColor: "text-destructive" }
    : null;

  return (
    <div className="space-y-4">
      {/* ── Running state ── */}
      {isRunning && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Importando {entityConfig.label}</span>
                <Badge variant="outline" className="text-[10px] animate-pulse">Em andamento</Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate">{run.fileName}</p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-2xl font-bold text-primary tabular-nums">{progress.toFixed(0)}%</div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Progress value={progress} className="h-2.5" />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>{processedCount.toLocaleString("pt-BR")} de {run.totalRows.toLocaleString("pt-BR")} registros</span>
              <span className="tabular-nums">{formatDuration(Date.now() - run.startedAt)}</span>
            </div>
          </div>

          {/* Live mini-stats */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Inseridos", value: run.imported, color: "text-success" },
              { label: "Atualizados", value: run.updated, color: "text-primary" },
              { label: "Erros", value: run.errors, color: "text-destructive" },
              { label: "Ignorados", value: run.skipped, color: "text-muted-foreground" },
            ].map(s => (
              <div key={s.label} className="rounded-md border border-border bg-muted/20 p-2 text-center">
                <div className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>

          <Button variant="destructive" size="sm" className="w-full" onClick={() => requestCancelImport(run.entity)}>
            <XCircle className="mr-1.5 h-3.5 w-3.5" /> Interromper Importação
          </Button>
        </div>
      )}

      {/* ── Done state ── */}
      {!isRunning && statusConfig && (
        <div className="space-y-4">
          {/* Hero banner */}
          <div className={`flex items-center gap-3 rounded-lg border p-4 ${statusConfig.cls}`}>
            {statusConfig.icon}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">{statusConfig.label}</div>
              <div className="text-xs opacity-80">{entityConfig.label} — {run.fileName}</div>
            </div>
            {run.durationMs && (
              <div className="flex items-center gap-1 text-xs opacity-70 shrink-0">
                <Clock className="h-3 w-3" />
                {formatDuration(run.durationMs)}
              </div>
            )}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "Inseridos", value: run.imported, color: "border-success/30 bg-success/5", textColor: "text-success" },
              { label: "Atualizados", value: run.updated, color: "border-primary/30 bg-primary/5", textColor: "text-primary" },
              { label: "Erros", value: run.errors, color: "border-destructive/30 bg-destructive/5", textColor: "text-destructive" },
              { label: "Ignorados", value: run.skipped, color: "border-border bg-muted/20", textColor: "text-muted-foreground" },
            ].map(s => (
              <div key={s.label} className={`rounded-lg border p-3 text-center ${s.color}`}>
                <div className={`text-2xl font-bold tabular-nums ${s.textColor}`}>{s.value}</div>
                <div className="text-[11px] text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Success rate + warnings summary */}
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Taxa de êxito</span>
              <div className="flex items-center gap-2">
                <Progress value={successRate} className="h-2 w-24" />
                <span className="text-sm font-bold tabular-nums">{successRate.toFixed(1)}%</span>
              </div>
            </div>
            {(warningCount > 0 || errorCount > 0) && (
              <>
                <Separator />
                <div className="flex items-center gap-3 text-xs">
                  {errorCount > 0 && (
                    <div className="flex items-center gap-1 text-destructive">
                      <XCircle className="h-3 w-3" />
                      <span>{errorCount} erro(s) no log</span>
                    </div>
                  )}
                  {warningCount > 0 && (
                    <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                      <AlertTriangle className="h-3 w-3" />
                      <span>{warningCount} alerta(s)</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={onReset}>
              <Upload className="mr-1.5 h-3.5 w-3.5" /> Nova Importação
            </Button>
            {(errorCount > 0 || warningCount > 0) && (
              <Button variant="outline" size="sm" onClick={exportErrors}>
                <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" /> Exportar Relatório
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Log area (both states) ── */}
      {run.logs.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => setShowLog(!showLog)}
            className="flex items-center justify-between w-full px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Log de execução ({run.logs.length} {run.logs.length === 1 ? "entrada" : "entradas"})
            </div>
            <div className="flex items-center gap-2">
              {!showLog && errorCount > 0 && (
                <Badge variant="destructive" className="text-[10px] h-4 px-1.5">{errorCount}</Badge>
              )}
              {!showLog && warningCount > 0 && (
                <Badge className="text-[10px] h-4 px-1.5 bg-yellow-500/80 text-yellow-950 border-0">{warningCount}</Badge>
              )}
              {showLog ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            </div>
          </button>

          {showLog && (
            <>
              {/* Filter tabs */}
              <div className="flex items-center gap-1 px-3 py-1.5 border-t border-b border-border bg-background">
                {[
                  { key: "all" as const, label: "Todos", count: run.logs.length },
                  ...(errorCount > 0 ? [{ key: "error" as const, label: "Erros", count: errorCount }] : []),
                  ...(warningCount > 0 ? [{ key: "warning" as const, label: "Alertas", count: warningCount }] : []),
                  ...(okCount > 0 ? [{ key: "ok" as const, label: "Sucesso", count: okCount }] : []),
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setLogFilter(tab.key)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                      logFilter === tab.key
                        ? tab.key === "error" ? "bg-destructive text-destructive-foreground"
                          : tab.key === "warning" ? "bg-yellow-500 text-yellow-950"
                          : tab.key === "ok" ? "bg-success text-success-foreground"
                          : "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    {tab.label} ({tab.count})
                  </button>
                ))}
              </div>

              <ScrollArea className="h-48 px-3 py-2">
                <div className="space-y-0.5 font-mono text-[11px]">
                  {filteredLogs.map((entry, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      {entry.status === "ok" && <CheckCircle2 className="h-3 w-3 text-success shrink-0 mt-0.5" />}
                      {entry.status === "error" && <XCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />}
                      {entry.status === "warning" && <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0 mt-0.5" />}
                      {entry.status === "info" && <FileSpreadsheet className="h-3 w-3 text-primary shrink-0 mt-0.5" />}
                      <span className={
                        entry.status === "ok" ? "text-success" :
                        entry.status === "error" ? "text-destructive" :
                        entry.status === "warning" ? "text-yellow-600 dark:text-yellow-400" :
                        "text-muted-foreground"
                      }>
                        {entry.category && <span className="text-muted-foreground/60">[{entry.category}] </span>}
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
