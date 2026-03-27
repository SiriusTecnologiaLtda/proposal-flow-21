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
import {
  Upload, Wand2, ArrowRight, ArrowLeft, CheckCircle2, XCircle, Loader2,
  FileSpreadsheet, Clock, ChevronDown, ChevronUp, Play, Settings2, Eye, Save
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
} from "@/hooks/useImportStore";

// ─── DB field definitions ───────────────────────────────────────
interface DbField {
  key: string;
  label: string;
  required: boolean;
  aliases: string[];
}

const CLIENT_DB_FIELDS: DbField[] = [
  { key: "code",               label: "Código",                required: true,  aliases: ["código", "codigo", "cod", "code", "cod.", "cód", "cód.", "a1_cod"] },
  { key: "name",               label: "Nome / Razão Social",   required: true,  aliases: ["nome", "razão social", "razao social", "name", "empresa", "cliente", "a1_nome", "a1_nreduz", "nome fantasia"] },
  { key: "cnpj",               label: "CNPJ",                  required: true,  aliases: ["cnpj", "cnpj/cpf", "cpf/cnpj", "documento", "a1_cgc"] },
  { key: "store_code",         label: "Loja",                  required: false, aliases: ["loja", "cod loja", "a1_loja", "store", "filial"] },
  { key: "state_registration", label: "Inscrição Estadual",    required: false, aliases: ["inscrição estadual", "inscricao estadual", "ie", "insc. estadual", "a1_inscr"] },
  { key: "contact",            label: "Contato",               required: false, aliases: ["contato", "responsável", "responsavel", "a1_contato", "contact"] },
  { key: "email",              label: "E-mail",                required: false, aliases: ["email", "e-mail", "e_mail", "a1_email"] },
  { key: "phone",              label: "Telefone",              required: false, aliases: ["telefone", "fone", "tel", "phone", "a1_tel", "celular"] },
  { key: "address",            label: "Endereço",              required: false, aliases: ["endereço", "endereco", "address", "a1_end", "logradouro", "rua"] },
  { key: "unit_code",          label: "Unidade (código/nome)", required: false, aliases: ["unidade", "cod unidade", "código unidade", "unit", "filial totvs"] },
  { key: "esn_code",           label: "ESN (código/nome)",     required: false, aliases: ["esn", "cod esn", "código esn", "vendedor", "executivo", "a1_vend"] },
  { key: "gsn_code",           label: "GSN (código/nome)",     required: false, aliases: ["gsn", "cod gsn", "código gsn", "gerente", "supervisor"] },
];

// ─── Saved layouts (localStorage) ───────────────────────────────
const LAYOUTS_STORAGE_KEY = "smart_import_saved_layouts";

interface SavedLayout {
  id: string;
  name: string;
  headerSignature: string; // sorted joined headers for matching
  mapping: Record<number, string>; // colIndex -> dbFieldKey
  headerNames: string[]; // original header names for display
  createdAt: number;
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
  // Replace existing with same signature or add new
  const idx = layouts.findIndex(l => l.headerSignature === layout.headerSignature);
  if (idx >= 0) layouts[idx] = layout;
  else layouts.push(layout);
  // Keep max 20 layouts
  if (layouts.length > 20) layouts.splice(0, layouts.length - 20);
  localStorage.setItem(LAYOUTS_STORAGE_KEY, JSON.stringify(layouts));
}

function findMatchingLayout(headers: string[]): SavedLayout | null {
  const sig = getHeaderSignature(headers);
  const layouts = loadSavedLayouts();
  return layouts.find(l => l.headerSignature === sig) || null;
}

// ─── Auto-mapping logic ─────────────────────────────────────────
function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "").trim();
}

function autoMapColumns(headers: string[]): Record<number, string> {
  const mapping: Record<number, string> = {};
  const usedFields = new Set<string>();

  for (let i = 0; i < headers.length; i++) {
    const h = normalize(headers[i] || "");
    if (!h) continue;

    for (const field of CLIENT_DB_FIELDS) {
      if (usedFields.has(field.key)) continue;
      const match = field.aliases.some(alias => {
        const na = normalize(alias);
        return h === na || h.includes(na) || na.includes(h);
      });
      if (match) {
        mapping[i] = field.key;
        usedFields.add(field.key);
        break;
      }
    }
  }
  return mapping;
}

/** Detect the header row — the row with the most non-empty cells in the first 15 rows */
function detectHeaderRow(raw: any[][]): number {
  let bestRow = 0;
  let bestCount = 0;
  const limit = Math.min(raw.length, 15);
  for (let i = 0; i < limit; i++) {
    const row = raw[i] || [];
    const count = row.filter((c: any) => c != null && String(c).trim() !== "").length;
    if (count > bestCount) {
      bestCount = count;
      bestRow = i;
    }
  }
  return bestRow;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}min ${s % 60}s`;
}

// ─── Steps ──────────────────────────────────────────────────────
type Step = "upload" | "mapping" | "options" | "running" | "done";

export default function SmartClientImport() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [headerRowIdx, setHeaderRowIdx] = useState(0);
  const [previewRows, setPreviewRows] = useState<any[][]>([]);
  const [allDataRows, setAllDataRows] = useState<any[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [updateFields, setUpdateFields] = useState<Set<string>>(new Set());
  const [layoutRestored, setLayoutRestored] = useState(false);
  const [layoutSaved, setLayoutSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { getImport } = useImportStore();
  const run = getImport("clients");

  // ── Step 1: Upload & parse headers ────────────────────────────
  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setLayoutRestored(false);
    setLayoutSaved(false);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf);
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

      // Try to restore saved layout first, then auto-map
      const savedLayout = findMatchingLayout(hdrs);
      let autoMap: Record<number, string>;
      if (savedLayout) {
        autoMap = savedLayout.mapping;
        setLayoutRestored(true);
        toast({ title: "Layout restaurado", description: `Mapeamento "${savedLayout.name}" aplicado automaticamente.` });
      } else {
        autoMap = autoMapColumns(hdrs);
      }
      setMapping(autoMap);

      const optionalMapped = Object.values(autoMap).filter(
        k => !CLIENT_DB_FIELDS.find(f => f.key === k)?.required
      );
      setUpdateFields(new Set(optionalMapped));

      setStep("mapping");
    } catch (err: any) {
      toast({ title: "Erro ao ler arquivo", description: err.message, variant: "destructive" });
    }
  }, [toast]);

  // ── Save current layout ───────────────────────────────────────
  const handleSaveLayout = useCallback(() => {
    if (headers.length === 0) return;
    const layout: SavedLayout = {
      id: crypto.randomUUID(),
      name: file?.name || "Layout",
      headerSignature: getHeaderSignature(headers),
      mapping,
      headerNames: headers,
      createdAt: Date.now(),
    };
    saveLayout(layout);
    setLayoutSaved(true);
    toast({ title: "Layout salvo", description: "O mapeamento será reutilizado em importações futuras com o mesmo formato." });
  }, [headers, mapping, file, toast]);

  // ── Step 3: Run import ────────────────────────────────────────
  const runImport = useCallback(async () => {
    // Auto-save layout before running
    if (!layoutSaved && headers.length > 0) {
      const layout: SavedLayout = {
        id: crypto.randomUUID(),
        name: file?.name || "Layout",
        headerSignature: getHeaderSignature(headers),
        mapping,
        headerNames: headers,
        createdAt: Date.now(),
      };
      saveLayout(layout);
    }

    setStep("running");
    const entity: ImportEntity = "clients";
    const run = startImportRun(entity, file!.name, false);

    const fieldToCol: Record<string, number> = {};
    for (const [colStr, field] of Object.entries(mapping)) {
      fieldToCol[field] = Number(colStr);
    }

    const missing = CLIENT_DB_FIELDS.filter(f => f.required && !(f.key in fieldToCol));
    if (missing.length > 0) {
      addImportLog(entity, "error", `Campos obrigatórios não mapeados: ${missing.map(f => f.label).join(", ")}`);
      finishImportRun(entity, "error");
      setStep("done");
      return;
    }

    const dataRows = allDataRows.filter(r => {
      const code = fieldToCol.code != null ? String(r[fieldToCol.code] || "").trim() : "";
      const name = fieldToCol.name != null ? String(r[fieldToCol.name] || "").trim() : "";
      const cnpj = fieldToCol.cnpj != null ? String(r[fieldToCol.cnpj] || "").trim() : "";
      return code && name && cnpj;
    });
    const invalidRows = allDataRows.length - dataRows.length;

    updateImportStats(entity, { totalRows: allDataRows.length });
    addImportLog(entity, "info", `Planilha: ${allDataRows.length} linhas, ${dataRows.length} válidas, ${invalidRows} sem campos obrigatórios.`);

    run.totalRows = allDataRows.length;
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
      setStep("done");
      return;
    }

    // Load lookup maps
    const [{ data: units }, { data: salesTeam }] = await Promise.all([
      supabase.from("unit_info").select("id, code, name"),
      supabase.from("sales_team").select("id, code, name, role"),
    ]);
    const unitList = (units || []).map(u => ({ id: u.id, code: (u.code || "").trim().toLowerCase(), name: u.name.trim().toLowerCase() }));
    const esnList = (salesTeam || []).filter(s => s.role === "esn").map(s => ({ id: s.id, code: s.code.toLowerCase(), name: s.name.toLowerCase() }));
    const gsnList = (salesTeam || []).filter(s => s.role === "gsn").map(s => ({ id: s.id, code: s.code.toLowerCase(), name: s.name.toLowerCase() }));

    // Enhanced lookup: exact code match first, then exact name, then partial
    function findInList(list: { id: string; code: string; name: string }[], search: string): string | null {
      if (!search) return null;
      const s = search.trim().toLowerCase();
      // 1. Exact code match
      const byCode = list.find(u => u.code === s);
      if (byCode) return byCode.id;
      // 2. Exact name match
      const byName = list.find(u => u.name === s);
      if (byName) return byName.id;
      // 3. Code-only: try numeric-padded match (e.g. "1" matches "001")
      const sNum = s.replace(/^0+/, "");
      if (sNum) {
        const byPaddedCode = list.find(u => u.code.replace(/^0+/, "") === sNum);
        if (byPaddedCode) return byPaddedCode.id;
      }
      // 4. Partial match (code contains or name contains)
      const partial = list.find(u =>
        (u.code && (u.code.includes(s) || s.includes(u.code))) ||
        (u.name && (u.name.includes(s) || s.includes(u.name)))
      );
      if (partial) return partial.id;
      return null;
    }

    const relationMisses = { unit: new Set<string>(), esn: new Set<string>(), gsn: new Set<string>() };

    addImportLog(entity, "info", "Carregando clientes existentes...");
    const existingMap = new Map<string, string>();
    let dbOffset = 0;
    const DB_PAGE = 1000;
    while (true) {
      const { data: chunk } = await supabase.from("clients").select("id, cnpj").range(dbOffset, dbOffset + DB_PAGE - 1);
      if (!chunk || chunk.length === 0) break;
      for (const c of chunk) { if (c.cnpj) existingMap.set(c.cnpj.trim(), c.id); }
      if (chunk.length < DB_PAGE) break;
      dbOffset += DB_PAGE;
    }
    addImportLog(entity, "info", `${existingMap.size} clientes já cadastrados.`);

    const updateFieldsArr = Array.from(updateFields);
    const willUpdate = updateFieldsArr.length > 0;

    let imported = 0, updated = 0, skipped = 0, errors = 0;
    let relSkippedUnit = 0, relSkippedEsn = 0, relSkippedGsn = 0;
    const BATCH_SIZE = 50;
    const errorDetails: { row: number; code: string; reason: string }[] = [];

    function extractValue(row: any[], dbKey: string): any {
      const colIdx = fieldToCol[dbKey];
      if (colIdx == null) return null;
      return String(row[colIdx] || "").trim() || null;
    }

    function buildPayload(row: any[], keys: string[], rowNum: number): Record<string, any> {
      const p: Record<string, any> = {};
      for (const key of keys) {
        const val = extractValue(row, key);
        if (key === "unit_code") {
          const uid = findInList(unitList, val || "");
          p.unit_id = uid;
          if (val && !uid) { relationMisses.unit.add(val); relSkippedUnit++; }
        } else if (key === "esn_code") {
          const eid = findInList(esnList, val || "");
          p.esn_id = eid;
          if (val && !eid) { relationMisses.esn.add(val); relSkippedEsn++; }
        } else if (key === "gsn_code") {
          const gid = findInList(gsnList, val || "");
          p.gsn_id = gid;
          if (val && !gid) { relationMisses.gsn.add(val); relSkippedGsn++; }
        } else {
          p[key] = val;
        }
      }
      return p;
    }

    const allMappedKeys = Object.values(mapping);

    for (let batchStart = 0; batchStart < dataRows.length; batchStart += BATCH_SIZE) {
      const batch = dataRows.slice(batchStart, batchStart + BATCH_SIZE);
      const toInsert: any[] = [];
      const toUpdate: { id: string; data: Record<string, any> }[] = [];

      for (let bi = 0; bi < batch.length; bi++) {
        const row = batch[bi];
        const rowNum = batchStart + bi + headerRowIdx + 2;
        const cnpj = extractValue(row, "cnpj");
        if (!cnpj) { errors++; errorDetails.push({ row: rowNum, code: "?", reason: "CNPJ vazio" }); continue; }

        const existingId = existingMap.get(cnpj);
        if (existingId) {
          if (willUpdate) {
            const updatePayload = buildPayload(row, updateFieldsArr, rowNum);
            const cleanPayload: Record<string, any> = {};
            for (const [k, v] of Object.entries(updatePayload)) {
              if (v != null && v !== "") cleanPayload[k] = v;
            }
            if (Object.keys(cleanPayload).length > 0) {
              toUpdate.push({ id: existingId, data: cleanPayload });
            } else {
              skipped++;
            }
          } else {
            skipped++;
          }
        } else {
          const payload = buildPayload(row, allMappedKeys, rowNum);
          payload.code = payload.code || extractValue(row, "code");
          payload.name = payload.name || extractValue(row, "name");
          payload.cnpj = cnpj;
          if (!payload.store_code) payload.store_code = "";
          toInsert.push(payload);
        }
      }

      if (toInsert.length > 0) {
        const { error: batchErr, data: insData } = await supabase.from("clients").insert(toInsert).select("id");
        if (batchErr) {
          for (const payload of toInsert) {
            const { error } = await supabase.from("clients").insert(payload);
            if (error) {
              errors++;
              errorDetails.push({ row: 0, code: payload.code || "?", reason: error.message });
              addImportLog(entity, "error", `(${payload.code}): ${error.message}`);
            } else {
              imported++;
              existingMap.set(payload.cnpj, "new");
            }
          }
        } else {
          imported += insData?.length || toInsert.length;
          for (const p of toInsert) existingMap.set(p.cnpj, "new");
        }
      }

      for (const upd of toUpdate) {
        const { error } = await supabase.from("clients").update(upd.data).eq("id", upd.id);
        if (error) {
          errors++;
          errorDetails.push({ row: 0, code: upd.id, reason: error.message });
          addImportLog(entity, "error", `Update ${upd.id}: ${error.message}`);
        } else {
          updated++;
        }
      }

      updateImportStats(entity, { imported, updated, errors, skipped: skipped + invalidRows });

      if (dbLogId && (batchStart + BATCH_SIZE) % 200 < BATCH_SIZE) {
        try {
          await supabase.from("import_logs").update({
            status: "running", imported, updated, errors, skipped: skipped + invalidRows,
            duration_ms: Date.now() - run.startedAt,
          } as any).eq("id", dbLogId);
        } catch {}
      }
    }

    if (relationMisses.unit.size > 0) {
      const vals = Array.from(relationMisses.unit).slice(0, 10).join(", ");
      addImportLog(entity, "error", `⚠ ${relSkippedUnit} registros com Unidade não encontrada: ${vals}${relationMisses.unit.size > 10 ? ` (+${relationMisses.unit.size - 10})` : ""}`);
    }
    if (relationMisses.esn.size > 0) {
      const vals = Array.from(relationMisses.esn).slice(0, 10).join(", ");
      addImportLog(entity, "error", `⚠ ${relSkippedEsn} registros com ESN não encontrado: ${vals}${relationMisses.esn.size > 10 ? ` (+${relationMisses.esn.size - 10})` : ""}`);
    }
    if (relationMisses.gsn.size > 0) {
      const vals = Array.from(relationMisses.gsn).slice(0, 10).join(", ");
      addImportLog(entity, "error", `⚠ ${relSkippedGsn} registros com GSN não encontrado: ${vals}${relationMisses.gsn.size > 10 ? ` (+${relationMisses.gsn.size - 10})` : ""}`);
    }

    const totalSkipped = skipped + invalidRows;
    const finalStatus = errors > 0 && imported === 0 && updated === 0 ? "error" : "success";
    finishImportRun(entity, finalStatus as any);

    const dur = Date.now() - run.startedAt;
    addImportLog(entity, "ok",
      `✅ Concluído — ${allDataRows.length} linhas | Inseridos: ${imported} | Atualizados: ${updated} | Ignorados: ${totalSkipped} | Erros: ${errors} | Tempo: ${formatDuration(dur)}`
    );

    if (imported > 0 || updated > 0) qc.invalidateQueries({ queryKey: ["clients"] });

    if (dbLogId) {
      const successRate = allDataRows.length > 0 ? ((imported + updated) / allDataRows.length * 100).toFixed(1) : "0";
      try {
        await supabase.from("import_logs").update({
          status: finalStatus, total_rows: allDataRows.length, imported, updated, errors,
          skipped: totalSkipped, finished_at: new Date().toISOString(),
          duration_ms: dur,
          summary: `${imported} inseridos, ${updated} atualizados, ${errors} erros, ${totalSkipped} ignorados | Taxa: ${successRate}% | Tempo: ${formatDuration(dur)}`,
          error_details: errorDetails.length > 0 ? errorDetails.slice(0, 200) : [],
        } as any).eq("id", dbLogId);
      } catch {}
    }

    setStep("done");
  }, [file, allDataRows, mapping, updateFields, user, qc, headerRowIdx, headers, layoutSaved]);

  // ── Reset ─────────────────────────────────────────────────────
  const reset = () => {
    setStep("upload");
    setFile(null);
    setHeaders([]);
    setHeaderRowIdx(0);
    setPreviewRows([]);
    setAllDataRows([]);
    setMapping({});
    setUpdateFields(new Set());
    setLayoutRestored(false);
    setLayoutSaved(false);
  };

  const mappedCount = Object.keys(mapping).length;
  const requiredMapped = CLIENT_DB_FIELDS.filter(f => f.required).every(f => Object.values(mapping).includes(f.key));
  const isRunning = run?.status === "running";

  // ── Render ────────────────────────────────────────────────────
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shrink-0">
            <Wand2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base truncate">Importação Inteligente de Clientes</CardTitle>
            <CardDescription className="truncate">Carregue qualquer planilha — o sistema mapeia os campos automaticamente</CardDescription>
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1 mt-3">
          {(["upload", "mapping", "options", "running"] as Step[]).map((s, i) => {
            const labels = ["Arquivo", "Mapeamento", "Opções", "Importação"];
            const icons = [Upload, Settings2, Eye, Play];
            const Icon = icons[i];
            const isActive = step === s || (step === "done" && s === "running");
            const isPast = ["upload", "mapping", "options", "running"].indexOf(step) > i || step === "done";
            return (
              <div key={s} className="flex items-center gap-1 flex-1">
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors w-full justify-center
                  ${isActive ? "bg-primary text-primary-foreground" : isPast ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                  <Icon className="h-3 w-3 shrink-0" />
                  <span className="hidden sm:inline truncate">{labels[i]}</span>
                </div>
                {i < 3 && <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />}
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
            <p className="text-xs text-muted-foreground mt-1">.xlsx ou .xls — qualquer formato de planilha de clientes</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }} />
          </div>
        )}

        {/* ── STEP: Mapping ──────────────────────────────────── */}
        {step === "mapping" && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm min-w-0">
                <span className="font-medium truncate">{file?.name}</span>
                <span className="text-muted-foreground ml-2">({allDataRows.length} linhas)</span>
                {headerRowIdx > 0 && (
                  <span className="text-xs text-muted-foreground ml-2">(cabeçalho detectado na linha {headerRowIdx + 1})</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {layoutRestored && (
                  <Badge variant="outline" className="text-xs border-green-500/50 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Layout restaurado
                  </Badge>
                )}
                <Badge variant={requiredMapped ? "default" : "destructive"} className="text-xs">
                  {mappedCount} de {headers.filter(h => h).length} colunas mapeadas
                </Badge>
              </div>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_minmax(160px,200px)] gap-x-2 items-center px-3 py-1.5 bg-muted/50 text-xs font-medium text-muted-foreground border-b">
                <span>Coluna da Planilha</span>
                <span></span>
                <span>Campo do Sistema</span>
              </div>
              <ScrollArea className="max-h-[350px] w-full">
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
                            {CLIENT_DB_FIELDS.map(f => {
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
              </ScrollArea>
            </div>

            {/* Preview table with horizontal scroll */}
            {previewRows.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="text-xs font-medium px-3 py-1.5 bg-muted/50 text-muted-foreground">
                  Prévia (primeiras {previewRows.length} linhas)
                </div>
                <ScrollArea className="max-h-[150px] w-full">
                  <div className="min-w-max">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          {headers.map((h, i) => (
                            <th key={i} className="px-2 py-1 text-left font-medium whitespace-nowrap">
                              {mapping[i] ? (
                                <span className="text-primary">{CLIENT_DB_FIELDS.find(f => f.key === mapping[i])?.label || h}</span>
                              ) : (
                                <span className="text-muted-foreground line-through">{h}</span>
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, ri) => (
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
              <Button variant="outline" size="sm" onClick={reset}>
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

        {/* ── STEP: Options (update fields) ──────────────────── */}
        {step === "options" && (
          <>
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Campos para atualizar em registros existentes</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Quando um CNPJ já existir na base, marque quais campos deseja sobrescrever com os dados da planilha. Campos desmarcados serão mantidos como estão.
              </p>
              <Separator />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {CLIENT_DB_FIELDS.filter(f => !f.required && Object.values(mapping).includes(f.key)).map(f => (
                  <div key={f.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`upd-${f.key}`}
                      checked={updateFields.has(f.key)}
                      onCheckedChange={checked => {
                        setUpdateFields(prev => {
                          const next = new Set(prev);
                          if (checked) next.add(f.key);
                          else next.delete(f.key);
                          return next;
                        });
                      }}
                    />
                    <Label htmlFor={`upd-${f.key}`} className="text-sm cursor-pointer">{f.label}</Label>
                  </div>
                ))}
              </div>
              {Object.values(mapping).filter(k => !CLIENT_DB_FIELDS.find(f => f.key === k)?.required).length === 0 && (
                <p className="text-xs text-muted-foreground italic">Nenhum campo opcional foi mapeado.</p>
              )}
            </div>

            {/* Relationship warning */}
            {(Object.values(mapping).includes("unit_code") || Object.values(mapping).includes("esn_code") || Object.values(mapping).includes("gsn_code")) && (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-1">
                <div className="flex items-center gap-2 text-xs font-medium text-yellow-700 dark:text-yellow-400">
                  <XCircle className="h-3.5 w-3.5 shrink-0" />
                  Campos relacionais detectados
                </div>
                <p className="text-xs text-muted-foreground">
                  Os campos Unidade, ESN e GSN serão vinculados por código ou nome. Códigos numéricos com zeros à esquerda (ex: "001") são tratados automaticamente. Registros cujo valor não corresponda a nenhum cadastro existente terão esses campos importados como vazio, e os casos serão registrados no log.
                </p>
              </div>
            )}

            {/* Summary */}
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
              <div className="text-sm font-medium flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" /> Resumo da importação
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="min-w-0"><span className="text-muted-foreground">Arquivo:</span> <span className="font-medium truncate">{file?.name}</span></div>
                <div><span className="text-muted-foreground">Linhas:</span> <span className="font-medium">{allDataRows.length}</span></div>
                <div><span className="text-muted-foreground">Campos mapeados:</span> <span className="font-medium">{mappedCount}</span></div>
                <div><span className="text-muted-foreground">Campos p/ atualizar:</span> <span className="font-medium">{updateFields.size}</span></div>
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
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{run.imported + run.updated + run.errors} / {run.totalRows} registros</span>
            <span>{progress.toFixed(0)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
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

      {/* Log */}
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
