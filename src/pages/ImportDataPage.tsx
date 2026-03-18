import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Download, Upload, Users, LayoutTemplate, Loader2, CheckCircle2, XCircle, Trash2, UserCog, FileSpreadsheet, Clock, BarChart3, History, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { useAuth } from "@/contexts/AuthContext";

// ─── Template generation ────────────────────────────────────────

function generateClientTemplate(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const headers = ["Código*","Nome*","CNPJ*","Loja","Inscrição Estadual","Contato","Email","Telefone","Endereço","Código Unidade","Código ESN","Código GSN"];
  const exampleRow = ["CLI001","Empresa Exemplo LTDA","12.345.678/0001-90","01","123456789","João Silva","joao@empresa.com","(11) 99999-0000","Rua Exemplo, 123 - São Paulo/SP","","",""];
  const instructions = ["INSTRUÇÕES:","- Campos com * são obrigatórios","- Remova esta linha e o exemplo antes de importar"];
  const data = [headers, exampleRow, [], instructions];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{wch:12},{wch:35},{wch:22},{wch:8},{wch:18},{wch:20},{wch:28},{wch:18},{wch:40},{wch:16},{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(wb, ws, "Clientes");
  return wb;
}

function generateTemplateTemplate(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const headers = ["Nome Template*","Produto*","Categoria*","Tipo (P=Processo / S=Sub-item)*","Descrição Item*","Horas Padrão","Processo Pai (descrição, se Sub-item)"];
  const examples = [
    ["Implantação RM","RM","Implantação","P","Cadastros Básicos",8,""],
    ["Implantação RM","RM","Implantação","S","Cadastro de Fornecedores",4,"Cadastros Básicos"],
  ];
  const data = [headers, ...examples];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{wch:25},{wch:15},{wch:18},{wch:28},{wch:35},{wch:14},{wch:30}];
  XLSX.utils.book_append_sheet(wb, ws, "Templates de Escopo");
  return wb;
}

function generateSalesTeamTemplate(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const headers = ["Código*","Nome*","Unidade","Cargo*","Código GSN","GSN","E-mail","Telefone"];
  const examples = [
    ["T16593","ELAINE DOBRAWOLSKE","Espirito Santo","ESN","T25034","JOSÉ MARIA","elaine@totvs.com.br","27 99890-0868"],
  ];
  const data = [headers, ...examples];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{wch:12},{wch:40},{wch:22},{wch:20},{wch:14},{wch:35},{wch:32},{wch:18}];
  XLSX.utils.book_append_sheet(wb, ws, "Time de Vendas");
  return wb;
}

function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}min ${s % 60}s`;
}

// ─── Reconcile stale "running" logs on load ─────────────────────
// If a log has been "running" for more than 30 min, mark it as interrupted
const STALE_MINUTES = 30;

async function reconcileStaleLogs() {
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();
  await supabase.from("import_logs").update({
    status: "interrupted",
    finished_at: new Date().toISOString(),
    summary: "Execução interrompida (timeout — navegador fechado ou perda de conexão)",
  } as any).eq("status", "running").lt("started_at", cutoff);
}

// ─── Clear helpers ──────────────────────────────────────────────

async function clearClients(entity: ImportEntity) {
  addImportLog(entity, "info", "Limpando base de clientes...");
  await supabase.from("payment_conditions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("proposal_scope_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("proposal_macro_scope").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("proposal_documents").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("proposals").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  const { error } = await supabase.from("clients").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) { addImportLog(entity, "error", `Erro: ${error.message}`); return false; }
  addImportLog(entity, "ok", "Base limpa.");
  return true;
}

async function clearTemplates(entity: ImportEntity) {
  addImportLog(entity, "info", "Limpando base de templates...");
  await supabase.from("scope_template_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  const { error } = await supabase.from("scope_templates").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) { addImportLog(entity, "error", `Erro: ${error.message}`); return false; }
  addImportLog(entity, "ok", "Base limpa.");
  return true;
}

async function clearSalesTeam(entity: ImportEntity) {
  addImportLog(entity, "info", "Limpando base de time de vendas...");
  await supabase.from("sales_team").update({ linked_gsn_id: null }).neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("clients").update({ esn_id: null }).neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("clients").update({ gsn_id: null }).neq("id", "00000000-0000-0000-0000-000000000000");
  const { error } = await supabase.from("sales_team").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) { addImportLog(entity, "error", `Erro: ${error.message}`); return false; }
  addImportLog(entity, "ok", "Base limpa.");
  return true;
}

// ─── Persist to DB ──────────────────────────────────────────────

async function createDbLog(run: ImportRun, userId?: string): Promise<string | undefined> {
  const { data } = await supabase.from("import_logs").insert({
    entity: run.entity,
    file_name: run.fileName,
    status: "running",
    total_rows: run.totalRows,
    cleared_before: run.clearedBefore,
    user_id: userId || null,
  } as any).select("id").single();
  return data?.id;
}

async function updateDbLog(dbLogId: string, run: ImportRun) {
  const successRate = run.totalRows > 0 ? ((run.imported + run.updated) / run.totalRows * 100).toFixed(1) : "0";
  const summary = `${run.imported} inseridos, ${run.updated} atualizados, ${run.errors} erros, ${run.skipped} ignorados | Taxa: ${successRate}% | Tempo: ${formatDuration(run.durationMs || 0)}`;
  
  await supabase.from("import_logs").update({
    status: run.status,
    total_rows: run.totalRows,
    imported: run.imported,
    updated: run.updated,
    errors: run.errors,
    skipped: run.skipped,
    finished_at: run.finishedAt ? new Date(run.finishedAt).toISOString() : null,
    duration_ms: run.durationMs || null,
    summary,
    error_details: run.logs.filter(l => l.status === "error").slice(0, 50).map(l => l.message),
  } as any).eq("id", dbLogId);
}

// ─── Import handlers ────────────────────────────────────────────

async function runClientImport(file: File, clearBefore: boolean, qc: any, userId?: string) {
  const entity: ImportEntity = "clients";
  const run = startImportRun(entity, file.name, clearBefore);
  let dbLogId: string | undefined;

  if (clearBefore) {
    const ok = await clearClients(entity);
    if (!ok) { finishImportRun(entity, "error"); return; }
  }

  dbLogId = await createDbLog(run, userId);

  addImportLog(entity, "info", `Lendo "${file.name}"...`);
  try {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const dataRows = rows.slice(1).filter(r => r[0] && r[1] && r[2]);
    updateImportStats(entity, { totalRows: dataRows.length });
    addImportLog(entity, "info", `${dataRows.length} registros encontrados.`);

    if (dataRows.length === 0) {
      addImportLog(entity, "error", "Nenhum registro válido encontrado na planilha.");
      finishImportRun(entity, "error");
      if (dbLogId) await updateDbLog(dbLogId, { ...run, status: "error", totalRows: 0, finishedAt: Date.now(), durationMs: Date.now() - run.startedAt } as ImportRun);
      return;
    }

    const { data: units } = await supabase.from("unit_info").select("id, code, name");
    const { data: salesTeam } = await supabase.from("sales_team").select("id, code, role");
    const unitList = (units || []).map(u => ({ id: u.id, code: (u.code || "").trim().toLowerCase(), name: u.name.trim().toLowerCase() }));
    function findUnitId(search: string): string | null {
      if (!search) return null;
      const s = search.trim().toLowerCase();
      const exact = unitList.find(u => u.code === s || u.name === s);
      if (exact) return exact.id;
      const partial = unitList.find(u => (u.code && (u.code.includes(s) || s.includes(u.code))) || (u.name && (u.name.includes(s) || s.includes(u.name))));
      return partial ? partial.id : null;
    }
    const esnMap = new Map((salesTeam || []).filter(s => s.role === "esn").map(s => [s.code.toLowerCase(), s.id]));
    const gsnMap = new Map((salesTeam || []).filter(s => s.role === "gsn").map(s => [s.code.toLowerCase(), s.id]));

    let imported = 0, errors = 0;
    const BATCH_SIZE = 50;
    const DB_LOG_INTERVAL = 100; // update DB log every N rows

    for (let batchStart = 0; batchStart < dataRows.length; batchStart += BATCH_SIZE) {
      const batch = dataRows.slice(batchStart, batchStart + BATCH_SIZE);
      const validPayloads: any[] = [];

      for (let j = 0; j < batch.length; j++) {
        const r = batch[j];
        const lineNum = batchStart + j + 2;
        const code = String(r[0] || "").trim();
        const name = String(r[1] || "").trim();
        const cnpj = String(r[2] || "").trim();
        if (!code || !name || !cnpj) { errors++; addImportLog(entity, "error", `Linha ${lineNum}: campos obrigatórios ausentes.`); continue; }

        const storeCode = String(r[3] || "").trim();
        validPayloads.push({
          code, name, cnpj,
          store_code: storeCode || "",
          state_registration: String(r[4] || "").trim() || null,
          contact: String(r[5] || "").trim() || null,
          email: String(r[6] || "").trim() || null,
          phone: String(r[7] || "").trim() || null,
          address: String(r[8] || "").trim() || null,
          unit_id: findUnitId(String(r[9] || "")),
          esn_id: r[10] ? (esnMap.get(String(r[10]).trim().toLowerCase()) || null) : null,
          gsn_id: r[11] ? (gsnMap.get(String(r[11]).trim().toLowerCase()) || null) : null,
        });
      }

      if (validPayloads.length > 0) {
        const { error: batchErr, data: insData } = await supabase.from("clients").insert(validPayloads).select("id");
        if (batchErr) {
          // Fallback: try row by row
          addImportLog(entity, "info", `Lote ${Math.floor(batchStart / BATCH_SIZE) + 1} falhou em batch, tentando individual...`);
          for (const payload of validPayloads) {
            const { error } = await supabase.from("clients").insert(payload);
            if (error) { errors++; addImportLog(entity, "error", `(${payload.code}/${payload.store_code}): ${error.message}`); }
            else { imported++; }
          }
        } else {
          imported += insData?.length || validPayloads.length;
        }
      }

      updateImportStats(entity, { imported, errors });

      // Periodically persist progress to DB
      if (dbLogId && (batchStart + BATCH_SIZE) % DB_LOG_INTERVAL < BATCH_SIZE) {
        const progressRun = { ...run, imported, errors, totalRows: dataRows.length, status: "running" as const, durationMs: Date.now() - run.startedAt } as ImportRun;
        await updateDbLog(dbLogId, progressRun).catch(() => {});
      }
    }

    const finalStatus = errors > 0 && imported === 0 ? "error" : "success";
    finishImportRun(entity, finalStatus);
    const finalRun = { ...run, imported, errors, totalRows: dataRows.length, status: finalStatus as any, finishedAt: Date.now(), durationMs: Date.now() - run.startedAt };
    addImportLog(entity, "ok", buildSummaryMessage(finalRun));
    if (imported > 0) qc.invalidateQueries({ queryKey: ["clients"] });
    if (dbLogId) await updateDbLog(dbLogId, { ...finalRun, durationMs: Date.now() - run.startedAt } as ImportRun);
  } catch (err: any) {
    addImportLog(entity, "error", `Erro fatal: ${err.message}`);
    finishImportRun(entity, "error");
    // CRITICAL: persist error state to DB
    if (dbLogId) {
      const errorRun = { ...run, status: "error" as const, finishedAt: Date.now(), durationMs: Date.now() - run.startedAt } as ImportRun;
      await updateDbLog(dbLogId, errorRun).catch(() => {});
    }
  }
}

async function runTemplateImport(file: File, clearBefore: boolean, qc: any, userId?: string) {
  const entity: ImportEntity = "templates";
  const run = startImportRun(entity, file.name, clearBefore);

  if (clearBefore) { const ok = await clearTemplates(entity); if (!ok) { finishImportRun(entity, "error"); return; } }
  const dbLogId = await createDbLog(run, userId);

  addImportLog(entity, "info", `Lendo "${file.name}"...`);
  try {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const dataRows = rows.slice(1).filter(r => r[0] && r[3] && r[4]);
    updateImportStats(entity, { totalRows: dataRows.length });
    addImportLog(entity, "info", `${dataRows.length} linhas de dados.`);

    const templateGroups = new Map<string, { product: string; category: string; items: any[] }>();
    for (const r of dataRows) {
      const tplName = String(r[0] || "").trim();
      const product = String(r[1] || "").trim();
      const category = String(r[2] || "").trim();
      const tipo = String(r[3] || "").trim().toUpperCase();
      const desc = String(r[4] || "").trim();
      const hours = Number(r[5]) || 0;
      const parentDesc = String(r[6] || "").trim();
      if (!tplName || !desc) continue;
      if (!templateGroups.has(tplName)) templateGroups.set(tplName, { product, category, items: [] });
      templateGroups.get(tplName)!.items.push({ tipo, desc, hours, parentDesc });
    }

    let imported = 0, errors = 0;
    for (const [tplName, group] of templateGroups) {
      const { data: tpl, error: tplErr } = await supabase.from("scope_templates").insert({ name: tplName, product: group.product, category: group.category }).select("id").single();
      if (tplErr || !tpl) { errors++; addImportLog(entity, "error", `Template "${tplName}": ${tplErr?.message}`); updateImportStats(entity, { errors }); continue; }

      const processes = group.items.filter(i => i.tipo === "P");
      const processIdMap = new Map<string, string>();
      let sortOrder = 0;
      for (const proc of processes) {
        const { data: ins, error } = await supabase.from("scope_template_items").insert({ template_id: tpl.id, description: proc.desc, default_hours: proc.hours, sort_order: sortOrder++, parent_id: null }).select("id").single();
        if (error) addImportLog(entity, "error", `Item "${proc.desc}": ${error.message}`);
        else if (ins) processIdMap.set(proc.desc.toLowerCase(), ins.id);
      }
      for (const sub of group.items.filter(i => i.tipo === "S")) {
        const parentId = processIdMap.get(sub.parentDesc.toLowerCase());
        if (!parentId) { addImportLog(entity, "error", `Sub-item "${sub.desc}": pai "${sub.parentDesc}" não encontrado.`); continue; }
        await supabase.from("scope_template_items").insert({ template_id: tpl.id, description: sub.desc, default_hours: sub.hours, sort_order: sortOrder++, parent_id: parentId });
      }
      imported++;
      updateImportStats(entity, { imported });
      addImportLog(entity, "ok", `Template "${tplName}" importado.`);
    }

    finishImportRun(entity, "success");
    const finalRun = { ...run, imported, errors, totalRows: dataRows.length, finishedAt: Date.now(), durationMs: Date.now() - run.startedAt, status: "success" as const };
    addImportLog(entity, "ok", buildSummaryMessage(finalRun));
    if (imported > 0) { qc.invalidateQueries({ queryKey: ["scope_templates"] }); qc.invalidateQueries({ queryKey: ["scope_template_items"] }); }
    if (dbLogId) await updateDbLog(dbLogId, finalRun);
  } catch (err: any) {
    addImportLog(entity, "error", `Erro fatal: ${err.message}`);
    finishImportRun(entity, "error");
    if (dbLogId) {
      const errorRun = { ...run, status: "error" as const, finishedAt: Date.now(), durationMs: Date.now() - run.startedAt } as ImportRun;
      await updateDbLog(dbLogId, errorRun).catch(() => {});
    }
  }
}

async function runSalesTeamImport(file: File, clearBefore: boolean, qc: any, userId?: string) {
  const entity: ImportEntity = "sales_team";
  const run = startImportRun(entity, file.name, clearBefore);

  if (clearBefore) { const ok = await clearSalesTeam(entity); if (!ok) { finishImportRun(entity, "error"); return; } }
  const dbLogId = await createDbLog(run, userId);

  addImportLog(entity, "info", `Lendo "${file.name}"...`);
  try {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const dataRows = rows.slice(1).filter(r => r[0] && r[1]);
    updateImportStats(entity, { totalRows: dataRows.length });
    addImportLog(entity, "info", `${dataRows.length} registros.`);

    const { data: units } = await supabase.from("unit_info").select("id, code, name");
    const unitMap = new Map<string, string>();
    for (const u of (units || [])) { if (u.code) unitMap.set(u.code.trim().toLowerCase(), u.id); unitMap.set(u.name.trim().toLowerCase(), u.id); }

    function parseRole(cargo: string): "esn" | "gsn" | "arquiteto" | null {
      const c = cargo.toLowerCase().trim();
      if (c.includes("arquiteto")) return "arquiteto";
      if (c.includes("gsn")) return "gsn";
      if (c.includes("esn")) return "esn";
      return null;
    }

    let imported = 0, updated = 0, errors = 0;
    const insertedCodeMap = new Map<string, string>();

    for (let i = 0; i < dataRows.length; i++) {
      const r = dataRows[i];
      const code = String(r[0] || "").trim();
      const name = String(r[1] || "").trim();
      const unidade = String(r[2] || "").trim().toLowerCase();
      const cargo = String(r[3] || "").trim();
      const email = String(r[6] || "").trim() || null;
      if (!code || !name) { errors++; addImportLog(entity, "error", `Linha ${i+2}: Código e Nome obrigatórios.`); updateImportStats(entity, { errors }); continue; }

      const role = parseRole(cargo);
      if (!role) { errors++; addImportLog(entity, "error", `Linha ${i+2} (${code}): Cargo "${cargo}" não reconhecido.`); updateImportStats(entity, { errors }); continue; }

      const unit_id = unidade ? (unitMap.get(unidade) || null) : null;
      const payload: any = { code, name, role, email, unit_id };

      const { data: existing } = await supabase.from("sales_team").select("id").eq("code", code).maybeSingle();
      if (existing) {
        const { error } = await supabase.from("sales_team").update(payload).eq("id", existing.id);
        if (error) { errors++; addImportLog(entity, "error", `Linha ${i+2}: ${error.message}`); }
        else { insertedCodeMap.set(code.toLowerCase(), existing.id); updated++; }
      } else {
        const { data: ins, error } = await supabase.from("sales_team").insert(payload).select("id").single();
        if (error) { errors++; addImportLog(entity, "error", `Linha ${i+2}: ${error.message}`); }
        else if (ins) { insertedCodeMap.set(code.toLowerCase(), ins.id); imported++; }
      }
      updateImportStats(entity, { imported, updated, errors });
    }

    addImportLog(entity, "info", "Vinculando GSNs...");
    const { data: allTeam } = await supabase.from("sales_team").select("id, code");
    const teamCodeMap = new Map<string, string>();
    for (const t of (allTeam || [])) teamCodeMap.set(t.code.trim().toLowerCase(), t.id);

    let linked = 0;
    for (const r of dataRows) {
      const code = String(r[0] || "").trim().toLowerCase();
      const gsnCode = String(r[4] || "").trim().toLowerCase();
      if (!gsnCode || !code) continue;
      const memberId = teamCodeMap.get(code);
      const gsnId = teamCodeMap.get(gsnCode);
      if (memberId && gsnId) { await supabase.from("sales_team").update({ linked_gsn_id: gsnId }).eq("id", memberId); linked++; }
    }

    addImportLog(entity, "info", `${linked} vínculos GSN resolvidos.`);
    finishImportRun(entity, "success");
    const finalRun = { ...run, imported, updated, errors, totalRows: dataRows.length, finishedAt: Date.now(), durationMs: Date.now() - run.startedAt, status: "success" as const };
    addImportLog(entity, "ok", buildSummaryMessage(finalRun));
    if (imported > 0 || updated > 0) qc.invalidateQueries({ queryKey: ["sales_team"] });
    if (dbLogId) await updateDbLog(dbLogId, finalRun);
  } catch (err: any) {
    addImportLog(entity, "error", `Erro fatal: ${err.message}`);
    finishImportRun(entity, "error");
    if (dbLogId) {
      const errorRun = { ...run, status: "error" as const, finishedAt: Date.now(), durationMs: Date.now() - run.startedAt } as ImportRun;
      await updateDbLog(dbLogId, errorRun).catch(() => {});
    }
  }
}

function buildSummaryMessage(run: Pick<ImportRun, "totalRows" | "imported" | "updated" | "errors" | "durationMs">): string {
  const total = run.imported + run.updated;
  const rate = run.totalRows > 0 ? (total / run.totalRows * 100).toFixed(1) : "0";
  return `✅ Concluído — ${run.imported} inseridos, ${run.updated} atualizados, ${run.errors} erros | Êxito: ${rate}% | Tempo: ${formatDuration(run.durationMs || 0)}`;
}

// ─── Import Card Component ──────────────────────────────────────

function ImportCard({
  entity, icon: Icon, title, description, templateFn, templateFilename, clearFn, importFn,
}: {
  entity: ImportEntity;
  icon: any;
  title: string;
  description: string;
  templateFn: () => XLSX.WorkBook;
  templateFilename: string;
  clearFn: (e: ImportEntity) => Promise<boolean>;
  importFn: (file: File, clear: boolean) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [clearBefore, setClearBefore] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const { getImport } = useImportStore();
  const run = getImport(entity);

  const isRunning = run?.status === "running";
  const isFinished = run && run.status !== "running";
  const progress = run && run.totalRows > 0 ? ((run.imported + run.updated + run.errors) / run.totalRows * 100) : 0;

  // Auto-expand log when import starts
  useEffect(() => {
    if (isRunning) setShowLog(true);
  }, [isRunning]);

  const statusBadge = () => {
    if (!run) return null;
    if (run.status === "running") return <Badge variant="secondary" className="gap-1 text-xs animate-pulse"><Loader2 className="h-3 w-3 animate-spin" />Processando</Badge>;
    if (run.status === "success") return <Badge className="gap-1 text-xs bg-emerald-500/15 text-emerald-600 border-emerald-200 hover:bg-emerald-500/20"><CheckCircle2 className="h-3 w-3" />Concluído</Badge>;
    if (run.status === "error") return <Badge variant="destructive" className="gap-1 text-xs"><XCircle className="h-3 w-3" />Erro</Badge>;
    if (run.status === "interrupted") return <Badge variant="outline" className="gap-1 text-xs text-amber-600 border-amber-300"><AlertTriangle className="h-3 w-3" />Interrompido</Badge>;
    return null;
  };

  return (
    <Card className={`transition-all duration-300 ${isRunning ? "ring-2 ring-primary/30 shadow-lg" : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${isRunning ? "bg-primary text-primary-foreground" : "bg-primary/10"}`}>
              {isRunning ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5 text-primary" />}
            </div>
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          {statusBadge()}
        </div>
        {isRunning && run && (
          <div className="mt-3 space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{run.imported + run.updated + run.errors} / {run.totalRows} registros</span>
              <span>{progress.toFixed(0)}%</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Analytics summary when finished */}
        {isFinished && run && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">Inseridos:</span>
                <span className="font-medium">{run.imported}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
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

        <div className="flex items-center gap-2">
          <Checkbox id={`clear-${entity}`} checked={clearBefore} onCheckedChange={(v) => setClearBefore(!!v)} disabled={isRunning} />
          <Label htmlFor={`clear-${entity}`} className="text-xs text-destructive flex items-center gap-1 cursor-pointer">
            <Trash2 className="h-3 w-3" /> Limpar base antes
          </Label>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadWorkbook(templateFn(), templateFilename)} disabled={isRunning}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Modelo
          </Button>
          <Button size="sm" disabled={isRunning} onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1.5 h-3.5 w-3.5" /> Importar
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importFn(file, clearBefore);
            e.target.value = "";
          }} />
        </div>

        {/* Collapsible log */}
        {run && run.logs.length > 0 && (
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
                      {entry.status === "ok" && <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />}
                      {entry.status === "error" && <XCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />}
                      {entry.status === "info" && <FileSpreadsheet className="h-3 w-3 text-primary shrink-0 mt-0.5" />}
                      <span className={entry.status === "ok" ? "text-emerald-600 dark:text-emerald-400" : entry.status === "error" ? "text-destructive" : "text-muted-foreground"}>
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
      </CardContent>
    </Card>
  );
}

// ─── History Dialog ─────────────────────────────────────────────

function ImportHistory() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadHistory() {
    setLoading(true);
    const { data } = await supabase.from("import_logs").select("*").order("created_at", { ascending: false }).limit(30);
    setLogs(data || []);
    setLoading(false);
  }

  const entityLabel: Record<string, string> = { clients: "Clientes", templates: "Templates", sales_team: "Time de Vendas" };
  const statusIcon = (s: string) => {
    if (s === "success") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    if (s === "error") return <XCircle className="h-4 w-4 text-destructive" />;
    if (s === "running") return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" onClick={loadHistory}>
          <History className="mr-1.5 h-3.5 w-3.5" /> Histórico
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" /> Histórico de Importações
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : logs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhuma importação registrada.</p>
          ) : (
            <div className="space-y-3 pr-4">
              {logs.map((log: any) => (
                <div key={log.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {statusIcon(log.status)}
                      <span className="font-medium text-sm">{entityLabel[log.entity] || log.entity}</span>
                      <span className="text-xs text-muted-foreground">— {log.file_name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  {log.summary && <p className="text-xs text-muted-foreground">{log.summary}</p>}
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div><span className="text-muted-foreground">Total:</span> <span className="font-medium">{log.total_rows}</span></div>
                    <div><span className="text-muted-foreground">Inseridos:</span> <span className="font-medium text-emerald-600">{log.imported}</span></div>
                    <div><span className="text-muted-foreground">Atualizados:</span> <span className="font-medium text-blue-600">{log.updated}</span></div>
                    <div><span className="text-muted-foreground">Erros:</span> <span className="font-medium text-destructive">{log.errors}</span></div>
                  </div>
                  {log.duration_ms && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {formatDuration(log.duration_ms)}
                      {log.cleared_before && <Badge variant="outline" className="text-[10px] ml-2">Base limpa</Badge>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ──────────────────────────────────────────────────

export default function ImportDataPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/configuracoes")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Importar Dados</h1>
            <p className="text-sm text-muted-foreground">Importe clientes, time de vendas e templates via Excel</p>
          </div>
        </div>
        <ImportHistory />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <ImportCard
          entity="clients"
          icon={Users}
          title="Clientes"
          description="Importar cadastro de clientes"
          templateFn={generateClientTemplate}
          templateFilename="modelo_clientes.xlsx"
          clearFn={clearClients}
          importFn={(file, clear) => runClientImport(file, clear, qc, user?.id)}
        />
        <ImportCard
          entity="templates"
          icon={LayoutTemplate}
          title="Templates de Escopo"
          description="Templates com processos e sub-itens"
          templateFn={generateTemplateTemplate}
          templateFilename="modelo_templates_escopo.xlsx"
          clearFn={clearTemplates}
          importFn={(file, clear) => runTemplateImport(file, clear, qc, user?.id)}
        />
        <ImportCard
          entity="sales_team"
          icon={UserCog}
          title="Time de Vendas"
          description="ESN, GSN e Arquitetos"
          templateFn={generateSalesTeamTemplate}
          templateFilename="modelo_time_vendas.xlsx"
          clearFn={clearSalesTeam}
          importFn={(file, clear) => runSalesTeamImport(file, clear, qc, user?.id)}
        />
      </div>
    </div>
  );
}
