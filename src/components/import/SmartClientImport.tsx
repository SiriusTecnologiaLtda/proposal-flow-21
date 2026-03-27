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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Upload, Wand2, ArrowRight, ArrowLeft, CheckCircle2, XCircle, Loader2,
  FileSpreadsheet, Clock, ChevronDown, ChevronUp, AlertTriangle, Play, Settings2, Eye
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
  aliases: string[]; // common header names that map to this field
}

const CLIENT_DB_FIELDS: DbField[] = [
  { key: "code",               label: "Código",              required: true,  aliases: ["código", "codigo", "cod", "code", "cod.", "cód", "cód.", "a1_cod"] },
  { key: "name",               label: "Nome / Razão Social", required: true,  aliases: ["nome", "razão social", "razao social", "name", "empresa", "cliente", "a1_nome", "a1_nreduz", "nome fantasia"] },
  { key: "cnpj",               label: "CNPJ",                required: true,  aliases: ["cnpj", "cnpj/cpf", "cpf/cnpj", "documento", "a1_cgc"] },
  { key: "store_code",         label: "Loja",                required: false, aliases: ["loja", "cod loja", "a1_loja", "store", "filial"] },
  { key: "state_registration", label: "Inscrição Estadual",  required: false, aliases: ["inscrição estadual", "inscricao estadual", "ie", "insc. estadual", "a1_inscr"] },
  { key: "contact",            label: "Contato",             required: false, aliases: ["contato", "responsável", "responsavel", "a1_contato", "contact"] },
  { key: "email",              label: "E-mail",              required: false, aliases: ["email", "e-mail", "e_mail", "a1_email"] },
  { key: "phone",              label: "Telefone",            required: false, aliases: ["telefone", "fone", "tel", "phone", "a1_tel", "celular"] },
  { key: "address",            label: "Endereço",            required: false, aliases: ["endereço", "endereco", "address", "a1_end", "logradouro", "rua"] },
  { key: "unit_code",          label: "Unidade (código/nome)", required: false, aliases: ["unidade", "cod unidade", "código unidade", "unit", "filial totvs"] },
  { key: "esn_code",           label: "ESN (código)",        required: false, aliases: ["esn", "cod esn", "código esn", "vendedor", "executivo"] },
  { key: "gsn_code",           label: "GSN (código)",        required: false, aliases: ["gsn", "cod gsn", "código gsn", "gerente", "supervisor"] },
];

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
  const [previewRows, setPreviewRows] = useState<any[][]>([]);
  const [allDataRows, setAllDataRows] = useState<any[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [updateFields, setUpdateFields] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { getImport } = useImportStore();
  const run = getImport("clients");

  // ── Step 1: Upload & parse headers ────────────────────────────
  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if (raw.length < 2) {
        toast({ title: "Planilha vazia", description: "A planilha não possui linhas de dados.", variant: "destructive" });
        return;
      }
      const hdrs = (raw[0] || []).map((h: any) => String(h || "").trim());
      setHeaders(hdrs);
      const data = raw.slice(1).filter(r => r.some(c => c != null && c !== ""));
      setAllDataRows(data);
      setPreviewRows(data.slice(0, 5));

      // Auto-map
      const autoMap = autoMapColumns(hdrs);
      setMapping(autoMap);

      // Pre-select all optional mapped fields for update
      const optionalMapped = Object.values(autoMap).filter(
        k => !CLIENT_DB_FIELDS.find(f => f.key === k)?.required
      );
      setUpdateFields(new Set(optionalMapped));

      setStep("mapping");
    } catch (err: any) {
      toast({ title: "Erro ao ler arquivo", description: err.message, variant: "destructive" });
    }
  }, [toast]);

  // ── Step 3: Run import ────────────────────────────────────────
  const runImport = useCallback(async () => {
    setStep("running");
    const entity: ImportEntity = "clients";
    const run = startImportRun(entity, file!.name, false);

    // Build reverse mapping: dbField -> colIndex
    const fieldToCol: Record<string, number> = {};
    for (const [colStr, field] of Object.entries(mapping)) {
      fieldToCol[field] = Number(colStr);
    }

    // Check required fields
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
    // Create DB log
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
      supabase.from("sales_team").select("id, code, role"),
    ]);
    const unitList = (units || []).map(u => ({ id: u.id, code: (u.code || "").trim().toLowerCase(), name: u.name.trim().toLowerCase() }));
    function findUnitId(search: string): string | null {
      if (!search) return null;
      const s = search.trim().toLowerCase();
      return unitList.find(u => u.code === s || u.name === s)?.id
        || unitList.find(u => (u.code && (u.code.includes(s) || s.includes(u.code))) || (u.name && (u.name.includes(s) || s.includes(u.name))))?.id
        || null;
    }
    const esnMap = new Map((salesTeam || []).filter(s => s.role === "esn").map(s => [s.code.toLowerCase(), s.id]));
    const gsnMap = new Map((salesTeam || []).filter(s => s.role === "gsn").map(s => [s.code.toLowerCase(), s.id]));

    // Load existing CNPJs + IDs for update
    addImportLog(entity, "info", "Carregando clientes existentes...");
    const existingMap = new Map<string, string>(); // cnpj -> id
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

    // ── Process rows in batches ─────────────────────────────────
    let imported = 0, updated = 0, skipped = 0, errors = 0;
    const BATCH_SIZE = 50;

    function extractValue(row: any[], dbKey: string): any {
      const colIdx = fieldToCol[dbKey];
      if (colIdx == null) return null;
      return String(row[colIdx] || "").trim() || null;
    }

    function buildPayload(row: any[], keys: string[]): Record<string, any> {
      const p: Record<string, any> = {};
      for (const key of keys) {
        const val = extractValue(row, key);
        if (key === "unit_code") p.unit_id = findUnitId(val || "");
        else if (key === "esn_code") p.esn_id = val ? (esnMap.get(val.toLowerCase()) || null) : null;
        else if (key === "gsn_code") p.gsn_id = val ? (gsnMap.get(val.toLowerCase()) || null) : null;
        else p[key] = val;
      }
      return p;
    }

    const allMappedKeys = Object.values(mapping);

    for (let batchStart = 0; batchStart < dataRows.length; batchStart += BATCH_SIZE) {
      const batch = dataRows.slice(batchStart, batchStart + BATCH_SIZE);
      const toInsert: any[] = [];
      const toUpdate: { id: string; data: Record<string, any> }[] = [];

      for (const row of batch) {
        const cnpj = extractValue(row, "cnpj");
        if (!cnpj) { errors++; continue; }

        const existingId = existingMap.get(cnpj);
        if (existingId) {
          if (willUpdate) {
            // Build update payload with only selected fields
            const updatePayload = buildPayload(row, updateFieldsArr);
            // Remove nulls to avoid overwriting with empty
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
          // New record - build full payload
          const payload = buildPayload(row, allMappedKeys);
          payload.code = payload.code || extractValue(row, "code");
          payload.name = payload.name || extractValue(row, "name");
          payload.cnpj = cnpj;
          if (!payload.store_code) payload.store_code = "";
          toInsert.push(payload);
        }
      }

      // Batch insert
      if (toInsert.length > 0) {
        const { error: batchErr, data: insData } = await supabase.from("clients").insert(toInsert).select("id");
        if (batchErr) {
          for (const payload of toInsert) {
            const { error } = await supabase.from("clients").insert(payload);
            if (error) { errors++; addImportLog(entity, "error", `(${payload.code}): ${error.message}`); }
            else { imported++; existingMap.set(payload.cnpj, "new"); }
          }
        } else {
          imported += insData?.length || toInsert.length;
          for (const p of toInsert) existingMap.set(p.cnpj, "new");
        }
      }

      // Batch update (row by row for now, upsert isn't ideal here)
      for (const upd of toUpdate) {
        const { error } = await supabase.from("clients").update(upd.data).eq("id", upd.id);
        if (error) { errors++; addImportLog(entity, "error", `Update ${upd.id}: ${error.message}`); }
        else { updated++; }
      }

      updateImportStats(entity, { imported, updated, errors, skipped: skipped + invalidRows });

      if (dbLogId && (batchStart + BATCH_SIZE) % 200 < BATCH_SIZE) {
        const progressRun = { ...run, imported, updated, errors, skipped: skipped + invalidRows, totalRows: allDataRows.length, status: "running" as const, durationMs: Date.now() - run.startedAt } as ImportRun;
        try {
          await supabase.from("import_logs").update({
            status: "running", imported, updated, errors, skipped: skipped + invalidRows,
            duration_ms: Date.now() - run.startedAt,
          } as any).eq("id", dbLogId);
        } catch {}
      }
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
        } as any).eq("id", dbLogId);
      } catch {}
    }

    setStep("done");
  }, [file, allDataRows, mapping, updateFields, user, qc]);

  // ── Reset ─────────────────────────────────────────────────────
  const reset = () => {
    setStep("upload");
    setFile(null);
    setHeaders([]);
    setPreviewRows([]);
    setAllDataRows([]);
    setMapping({});
    setUpdateFields(new Set());
  };

  const mappedCount = Object.keys(mapping).length;
  const requiredMapped = CLIENT_DB_FIELDS.filter(f => f.required).every(f => Object.values(mapping).includes(f.key));
  const isRunning = run?.status === "running";

  // ── Render ────────────────────────────────────────────────────
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
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
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="font-medium">{file?.name}</span>
                <span className="text-muted-foreground ml-2">({allDataRows.length} linhas)</span>
              </div>
              <Badge variant={requiredMapped ? "default" : "destructive"} className="text-xs">
                {mappedCount} de {headers.length} colunas mapeadas
              </Badge>
            </div>

            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {headers.map((header, colIdx) => (
                  <div key={colIdx} className="flex items-center gap-3 rounded-lg border border-border p-2.5 bg-card hover:bg-muted/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{header || `(Coluna ${colIdx + 1})`}</div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">
                        Ex: {previewRows.slice(0, 2).map(r => String(r[colIdx] ?? "")).filter(Boolean).join(" | ") || "—"}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Select
                      value={mapping[colIdx] || "__none__"}
                      onValueChange={val => {
                        setMapping(prev => {
                          const next = { ...prev };
                          if (val === "__none__") { delete next[colIdx]; }
                          else {
                            // Remove previous use of this field
                            for (const [k, v] of Object.entries(next)) {
                              if (v === val) delete next[Number(k)];
                            }
                            next[colIdx] = val;
                          }
                          return next;
                        });
                      }}
                    >
                      <SelectTrigger className="w-[200px] shrink-0">
                        <SelectValue placeholder="Ignorar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Ignorar —</SelectItem>
                        {CLIENT_DB_FIELDS.map(f => {
                          const usedByOther = Object.entries(mapping).some(([k, v]) => v === f.key && Number(k) !== colIdx);
                          return (
                            <SelectItem key={f.key} value={f.key} disabled={usedByOther}>
                              {f.label} {f.required && "*"} {usedByOther && "(já mapeado)"}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Preview table */}
            {previewRows.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="text-xs font-medium px-3 py-1.5 bg-muted/50 text-muted-foreground">
                  Prévia (primeiras {previewRows.length} linhas)
                </div>
                <ScrollArea className="max-h-[150px]">
                  <div className="overflow-x-auto">
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
                </ScrollArea>
              </div>
            )}

            <div className="flex gap-2 justify-between">
              <Button variant="outline" size="sm" onClick={reset}>
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Voltar
              </Button>
              <Button size="sm" disabled={!requiredMapped} onClick={() => setStep("options")}>
                Próximo <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
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

            {/* Summary */}
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
              <div className="text-sm font-medium flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" /> Resumo da importação
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">Arquivo:</span> <span className="font-medium">{file?.name}</span></div>
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
