import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, AlertTriangle, CheckCircle2, Clock3, Search, User, FileText, Bug } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function ProposalLogsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["proposal-process-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposal_process_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data;
    },
  });

  const filteredLogs = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return logs;
    return logs.filter((log: any) =>
      [
        log.user_name,
        log.user_email,
        log.proposal_number,
        log.stage,
        log.error_message,
        log.action,
      ].some((value) => String(value || "").toLowerCase().includes(q))
    );
  }, [logs, search]);

  const stats = useMemo(() => ({
    total: logs.length,
    errors: logs.filter((l: any) => l.severity === "error").length,
    success: logs.filter((l: any) => l.stage?.includes("success")).length,
    pending: logs.filter((l: any) => l.stage?.includes("started")).length,
  }), [logs]);

  function severityBadge(severity: string) {
    if (severity === "error") return <Badge variant="destructive">Erro</Badge>;
    if (severity === "warn") return <Badge variant="secondary">Alerta</Badge>;
    return <Badge variant="outline">Info</Badge>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/configuracoes")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Logs de Propostas</h1>
          <p className="text-sm text-muted-foreground">Rastreie falhas e eventos do processo de criação/geração de propostas.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="flex items-center gap-3 p-4"><FileText className="h-8 w-8 text-primary" /><div><p className="text-xs text-muted-foreground">Total</p><p className="text-2xl font-semibold">{stats.total}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><AlertTriangle className="h-8 w-8 text-destructive" /><div><p className="text-xs text-muted-foreground">Erros</p><p className="text-2xl font-semibold">{stats.errors}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><CheckCircle2 className="h-8 w-8 text-primary" /><div><p className="text-xs text-muted-foreground">Sucesso</p><p className="text-2xl font-semibold">{stats.success}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><Clock3 className="h-8 w-8 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Iniciados</p><p className="text-2xl font-semibold">{stats.pending}</p></div></CardContent></Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por usuário, número, estágio ou erro..." className="pl-9" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Eventos recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando logs...</p>
          ) : filteredLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum log encontrado.</p>
          ) : (
            <div className="space-y-3">
              {filteredLogs.map((log: any) => (
                <button
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className="w-full rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-accent/40"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {severityBadge(log.severity)}
                        <Badge variant="outline">{log.stage}</Badge>
                        {log.proposal_number && <Badge variant="secondary">{log.proposal_number}</Badge>}
                      </div>
                      <p className="text-sm font-medium text-foreground">{log.error_message || "Evento registrado com sucesso"}</p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" />{log.user_name || log.user_email || "Usuário"}</span>
                        <span>{new Date(log.created_at).toLocaleString("pt-BR")}</span>
                        <span>{log.action}</span>
                      </div>
                    </div>
                    <Bug className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalhes do log</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <div><p className="text-xs text-muted-foreground">Usuário</p><p className="text-sm font-medium">{selectedLog.user_name || "—"}</p><p className="text-xs text-muted-foreground">{selectedLog.user_email || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Estágio</p><p className="text-sm font-medium">{selectedLog.stage}</p></div>
                <div><p className="text-xs text-muted-foreground">Ação</p><p className="text-sm font-medium">{selectedLog.action}</p></div>
                <div><p className="text-xs text-muted-foreground">Mensagem</p><p className="text-sm font-medium break-words">{selectedLog.error_message || "—"}</p></div>
              </div>
              <div className="space-y-3">
                <div><p className="text-xs text-muted-foreground">Número da proposta</p><p className="text-sm font-medium">{selectedLog.proposal_number || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Criado em</p><p className="text-sm font-medium">{new Date(selectedLog.created_at).toLocaleString("pt-BR")}</p></div>
                <div><p className="text-xs text-muted-foreground">Código do erro</p><p className="text-sm font-medium">{selectedLog.error_code || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Severity</p><div>{severityBadge(selectedLog.severity)}</div></div>
              </div>
              <div className="md:col-span-2 grid gap-3 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Payload</p>
                  <ScrollArea className="h-64 rounded-md border border-border bg-muted/30 p-3">
                    <pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(selectedLog.payload || {}, null, 2)}</pre>
                  </ScrollArea>
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Metadata / detalhes</p>
                  <ScrollArea className="h-64 rounded-md border border-border bg-muted/30 p-3">
                    <pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify({ error_details: selectedLog.error_details || {}, metadata: selectedLog.metadata || {} }, null, 2)}</pre>
                  </ScrollArea>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
