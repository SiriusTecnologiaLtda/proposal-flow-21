import { useState, useEffect, useCallback } from "react";

export type ImportEntity = "clients" | "templates" | "sales_team" | "sales_targets";

export type LogCategory =
  | "validation"   // structural validation
  | "relation"     // relational lookup (resolved/unresolved)
  | "filter"       // pre-filter applied
  | "insert"       // row inserted
  | "update"       // row updated
  | "skip"         // row skipped
  | "batch_error"  // batch-level error
  | "fallback"     // fallback to row-by-row
  | "system"       // general system messages
  | "summary";     // final summary

export interface ImportLogEntry {
  status: "ok" | "error" | "info" | "warning";
  message: string;
  timestamp: number;
  category?: LogCategory;
}

export interface ImportRun {
  id: string;
  entity: ImportEntity;
  fileName: string;
  status: "running" | "success" | "error" | "interrupted";
  totalRows: number;
  processed: number;
  imported: number;
  updated: number;
  errors: number;
  skipped: number;
  clearedBefore: boolean;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  logs: ImportLogEntry[];
  dbLogId?: string; // persisted log id
}

// ─── Global in-memory store (survives navigation) ───────────────
const activeImports = new Map<ImportEntity, ImportRun>();
const cancelSignals = new Map<ImportEntity, AbortController>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function requestCancelImport(entity: ImportEntity) {
  const ctrl = cancelSignals.get(entity);
  if (ctrl && !ctrl.signal.aborted) {
    ctrl.abort();
    const run = activeImports.get(entity);
    if (run?.status === "running") {
      run.logs.push({
        status: "info",
        message: "Solicitação de interrupção recebida. Finalizando o processamento atual...",
        timestamp: Date.now(),
      });
      notify();
    }
  }
}

export function getCancelSignal(entity: ImportEntity): AbortSignal | undefined {
  return cancelSignals.get(entity)?.signal;
}

export function getActiveImport(entity: ImportEntity): ImportRun | undefined {
  return activeImports.get(entity);
}

export function startImportRun(entity: ImportEntity, fileName: string, clearedBefore: boolean, dbLogId?: string): ImportRun {
  const controller = new AbortController();
  cancelSignals.set(entity, controller);
  const run: ImportRun = {
    id: crypto.randomUUID(),
    entity,
    fileName,
    status: "running",
    totalRows: 0,
    processed: 0,
    imported: 0,
    updated: 0,
    errors: 0,
    skipped: 0,
    clearedBefore,
    startedAt: Date.now(),
    logs: [],
    dbLogId,
  };
  activeImports.set(entity, run);
  notify();
  return run;
}

export function addImportLog(entity: ImportEntity, status: ImportLogEntry["status"], message: string) {
  const run = activeImports.get(entity);
  if (run) {
    run.logs.push({ status, message, timestamp: Date.now() });
    notify();
  }
}

export function updateImportStats(entity: ImportEntity, updates: Partial<Pick<ImportRun, "totalRows" | "processed" | "imported" | "updated" | "errors" | "skipped">>) {
  const run = activeImports.get(entity);
  if (run) {
    Object.assign(run, updates);
    notify();
  }
}

export function finishImportRun(entity: ImportEntity, status: "success" | "error" | "interrupted") {
  const run = activeImports.get(entity);
  if (run) {
    run.status = status;
    run.finishedAt = Date.now();
    run.durationMs = run.finishedAt - run.startedAt;
    cancelSignals.delete(entity);
    notify();
  }
}

export function forceFinishAllRunning() {
  for (const [entity, run] of activeImports.entries()) {
    if (run.status === "running") {
      const ctrl = cancelSignals.get(entity);
      if (ctrl && !ctrl.signal.aborted) ctrl.abort();
      run.status = "interrupted";
      run.finishedAt = Date.now();
      run.durationMs = run.finishedAt - run.startedAt;
      run.logs.push({ status: "info", message: "⛔ Importação forçadamente interrompida.", timestamp: Date.now() });
      cancelSignals.delete(entity);
    }
  }
  notify();
}

// ─── React hook ─────────────────────────────────────────────────
export function useImportStore() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  const getImport = useCallback((entity: ImportEntity) => activeImports.get(entity), []);
  const getAllImports = useCallback(() => Array.from(activeImports.values()), []);

  return { getImport, getAllImports };
}
