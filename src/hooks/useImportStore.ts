import { useState, useEffect, useCallback } from "react";

export type ImportEntity = "clients" | "templates" | "sales_team" | "sales_targets";

export interface ImportLogEntry {
  status: "ok" | "error" | "info";
  message: string;
  timestamp: number;
}

export interface ImportRun {
  id: string;
  entity: ImportEntity;
  fileName: string;
  status: "running" | "success" | "error" | "interrupted";
  totalRows: number;
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
  if (ctrl) ctrl.abort();
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

export function updateImportStats(entity: ImportEntity, updates: Partial<Pick<ImportRun, "totalRows" | "imported" | "updated" | "errors" | "skipped">>) {
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
    notify();
  }
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
