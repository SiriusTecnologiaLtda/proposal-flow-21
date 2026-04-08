import { useEffect } from "react";
import SmartImport from "@/components/import/SmartImport";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, History, Loader2, CheckCircle2, XCircle, AlertTriangle, Clock, ChevronDown, ChevronUp, FileSpreadsheet } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState } from "react";
import { forceFinishAllRunning } from "@/hooks/useImportStore";

// ─── Reconcile stale "running" logs on load ─────────────────────
const STALE_MINUTES = 30;

async function reconcileStaleLogs() {
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();
  await supabase.from("import_logs").update({
    status: "interrupted",
    finished_at: new Date().toISOString(),
    summary: "Execução interrompida (timeout — navegador fechado ou perda de conexão)",
  } as any).eq("status", "running").lt("started_at", cutoff);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}min ${s % 60}s`;
}

// ─── History Dialog ─────────────────────────────────────────────

function ImportHistory() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  async function loadHistory() {
    setLoading(true);
    const { data } = await supabase.from("import_logs").select("*").order("created_at", { ascending: false }).limit(30);
    setLogs(data || []);
    setLoading(false);
  }

  const entityLabel: Record<string, string> = { clients: "Clientes", templates: "Templates", sales_team: "Time de Vendas", sales_targets: "Metas de Vendas" };
  const statusIcon = (s: string) => {
    if (s === "success") return <CheckCircle2 className="h-4 w-4 text-success" />;
    if (s === "error") return <XCircle className="h-4 w-4 text-destructive" />;
    if (s === "running") return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    return <AlertTriangle className="h-4 w-4 text-warning" />;
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" onClick={loadHistory}>
          <History className="mr-1.5 h-3.5 w-3.5" /> Histórico
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" /> Histórico de Importações
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[65vh]">
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : logs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhuma importação registrada.</p>
          ) : (
            <div className="space-y-3 pr-4">
              {logs.map((log: any) => {
                const hasErrors = log.errors > 0;
                const errorList: string[] = Array.isArray(log.error_details) ? log.error_details : [];
                const isExpanded = expandedLogId === log.id;

                return (
                  <div key={log.id} className="rounded-lg border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {statusIcon(log.status)}
                        <span className="font-medium text-sm">{entityLabel[log.entity] || log.entity}</span>
                        <span className="text-xs text-muted-foreground">— {log.file_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {log.status === "running" && (
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-6 text-[11px] px-2"
                            onClick={async () => {
                              forceFinishAllRunning();
                              await supabase.from("import_logs").update({
                                status: "interrupted",
                                finished_at: new Date().toISOString(),
                                summary: "Importação interrompida manualmente pelo usuário",
                              } as any).eq("id", log.id);
                              loadHistory();
                            }}
                          >
                            <XCircle className="mr-1 h-3 w-3" /> Interromper
                          </Button>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(log.created_at).toLocaleString("pt-BR")}
                        </span>
                      </div>
                    </div>
                    {log.summary && <p className="text-xs text-muted-foreground">{log.summary}</p>}
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div><span className="text-muted-foreground">Total:</span> <span className="font-medium">{log.total_rows}</span></div>
                      <div><span className="text-muted-foreground">Inseridos:</span> <span className="font-medium text-success">{log.imported}</span></div>
                      <div><span className="text-muted-foreground">Atualizados:</span> <span className="font-medium text-primary">{log.updated}</span></div>
                      <div><span className="text-muted-foreground">Erros:</span> <span className="font-medium text-destructive">{log.errors}</span></div>
                    </div>
                    {log.duration_ms && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {formatDuration(log.duration_ms)}
                        {log.cleared_before && <Badge variant="outline" className="text-[10px] ml-2">Base limpa</Badge>}
                      </div>
                    )}

                    {hasErrors && errorList.length > 0 && (
                      <div>
                        <button
                          onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                          className="flex items-center gap-1.5 text-xs text-destructive hover:text-destructive/80 transition-colors"
                        >
                          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          <AlertTriangle className="h-3 w-3" />
                          Ver {errorList.length} erro(s) detalhado(s)
                        </button>
                        {isExpanded && (
                          <ScrollArea className="mt-2 max-h-48 rounded-md border border-destructive/20 bg-destructive/5 p-2">
                            <div className="space-y-0.5 font-mono text-[11px]">
                              {errorList.map((err: string, idx: number) => (
                                <div key={idx} className="flex items-start gap-1.5 text-destructive/90">
                                  <XCircle className="h-3 w-3 shrink-0 mt-0.5" />
                                  <span>{err}</span>
                                </div>
                              ))}
                              {errorList.length < log.errors && (
                                <div className="text-muted-foreground mt-1">
                                  ... e mais {log.errors - errorList.length} erro(s) não exibido(s)
                                </div>
                              )}
                            </div>
                          </ScrollArea>
                        )}
                      </div>
                    )}
                    {hasErrors && errorList.length === 0 && (
                      <p className="text-[11px] text-muted-foreground italic">
                        {log.errors} erro(s) ocorreram mas os detalhes não foram registrados nesta execução.
                      </p>
                    )}
                  </div>
                );
              })}
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

  useEffect(() => {
    reconcileStaleLogs();
    forceFinishAllRunning();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/configuracoes")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Importação Inteligente</h1>
            <p className="text-sm text-muted-foreground">Importe clientes, time de vendas, templates e metas via Excel</p>
          </div>
        </div>
        <ImportHistory />
      </div>

      <SmartImport />
    </div>
  );
}
