import { Link, useNavigate } from "react-router-dom";
import { Plus, Search, FileText, MoreHorizontal, Edit2, Trash2, Copy, Ban, Trophy, Eye, Loader2, CheckCircle2, XCircle, Info } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useProposals, useDeleteProposal, useUpdateProposalStatus } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

interface LogEntry {
  step: string;
  status: "ok" | "error" | "info";
  message: string;
  timestamp: string;
}

const statusMap: Record<string, { label: string; className: string }> = {
  rascunho: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  em_revisao: { label: "Em Revisão", className: "bg-warning/15 text-warning" },
  aprovada: { label: "Aprovada", className: "bg-success/15 text-success" },
  enviada: { label: "Enviada", className: "bg-primary/15 text-primary" },
  cancelada: { label: "Cancelada", className: "bg-destructive/15 text-destructive" },
  ganha: { label: "Ganha", className: "bg-success/15 text-success" },
};

const typeMap: Record<string, string> = {
  projeto: "Projeto",
  banco_de_horas: "Banco de Horas",
};

function StatusIcon({ status }: { status: LogEntry["status"] }) {
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />;
  if (status === "error") return <XCircle className="h-4 w-4 text-red-400 shrink-0" />;
  return <Info className="h-4 w-4 text-blue-400 shrink-0" />;
}

export default function ProposalsList() {
  const [search, setSearch] = useState("");
  const { data: proposals = [] } = useProposals();
  const deleteProposal = useDeleteProposal();
  const updateStatus = useUpdateProposalStatus();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [winId, setWinId] = useState<string | null>(null);

  // Console dialog state
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<LogEntry[]>([]);
  const [consoleLoading, setConsoleLoading] = useState(false);
  const [consoleDocUrl, setConsoleDocUrl] = useState<string | null>(null);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [consoleLogs]);

  async function handleGenerateDoc(proposalId: string) {
    setConsoleLogs([]);
    setConsoleDocUrl(null);
    setConsoleLoading(true);
    setConsoleOpen(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-proposal-pdf`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Authorization": `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({ proposalId }),
        }
      );

      const data = await response.json();

      if (data?.logs) {
        setConsoleLogs(data.logs);
      }

      if (response.ok && data?.docUrl) {
        setConsoleDocUrl(data.docUrl);
      } else if (!data?.logs) {
        setConsoleLogs([{ step: "Erro", status: "error", message: data?.error || "Erro desconhecido", timestamp: new Date().toISOString() }]);
      }
    } catch (err: any) {
      setConsoleLogs(prev => [...prev, { step: "Erro de rede", status: "error", message: err.message, timestamp: new Date().toISOString() }]);
    }
    setConsoleLoading(false);
  }

  const filtered = proposals.filter((p) => {
    const clientName = (p as any).clients?.name || "";
    const desc = (p as any).description || "";
    return (
      p.number.toLowerCase().includes(search.toLowerCase()) ||
      clientName.toLowerCase().includes(search.toLowerCase()) ||
      desc.toLowerCase().includes(search.toLowerCase())
    );
  });

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await deleteProposal.mutateAsync(deleteId);
      toast({ title: "Proposta excluída com sucesso" });
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    }
    setDeleteId(null);
  }

  async function handleCancel() {
    if (!cancelId) return;
    try {
      await updateStatus.mutateAsync({ id: cancelId, status: "cancelada" });
      toast({ title: "Proposta cancelada" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setCancelId(null);
  }

  async function handleWin() {
    if (!winId) return;
    try {
      await updateStatus.mutateAsync({ id: winId, status: "ganha" });
      toast({ title: "Proposta encerrada como ganha!" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setWinId(null);
  }

  function handleDuplicate(proposal: any) {
    navigate(`/propostas/nova?duplicar=${proposal.id}`);
  }

  const isCancelled = (status: string) => status === "cancelada";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Propostas</h1>
          <p className="text-sm text-muted-foreground">{proposals.length} propostas cadastradas</p>
        </div>
        <Button asChild>
          <Link to="/propostas/nova">
            <Plus className="mr-2 h-4 w-4" />
            Nova Proposta
          </Link>
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar por número, cliente ou descrição..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="hidden border-b border-border bg-muted/50 px-4 py-2.5 md:grid md:grid-cols-8 md:gap-4">
          <span className="text-xs font-medium text-muted-foreground col-span-2">Cliente / Proposta</span>
          <span className="text-xs font-medium text-muted-foreground">Descrição</span>
          <span className="text-xs font-medium text-muted-foreground">Tipo</span>
          <span className="text-xs font-medium text-muted-foreground">Produto</span>
          <span className="text-xs font-medium text-muted-foreground text-right">Valor Total</span>
          <span className="text-xs font-medium text-muted-foreground text-right">Status</span>
          <span className="text-xs font-medium text-muted-foreground text-right">Ações</span>
        </div>
        <div className="divide-y divide-border">
          {filtered.map((p) => {
            const status = statusMap[p.status] || statusMap.rascunho;
            const clientName = (p as any).clients?.name || "—";
            const description = (p as any).description || "";
            const totalValue = typeof (p as any).total_value === "number" ? (p as any).total_value : null;
            const cancelled = isCancelled(p.status);
            return (
              <div
                key={p.id}
                className={`flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-accent/50 md:grid md:grid-cols-8 md:items-center md:gap-4 ${cancelled ? "opacity-60" : ""}`}
              >
                <Link to={`/propostas/${p.id}`} className="col-span-2 flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <FileText className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{clientName}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.number}</p>
                  </div>
                </Link>
                <p className="text-sm text-muted-foreground truncate">{description || "—"}</p>
                <p className="text-sm text-foreground">{typeMap[p.type] || p.type}</p>
                <p className="text-sm text-foreground">{p.product}</p>
                <p className="text-sm font-medium text-foreground text-right">
                  {totalValue != null ? `R$ ${totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
                </p>
                <div className="text-right">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
                    {status.label}
                  </span>
                </div>
                <div className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleGenerateDoc(p.id)}>
                        <Eye className="mr-2 h-3.5 w-3.5" />
                        Gerar Proposta
                      </DropdownMenuItem>
                      {!cancelled && (
                        <DropdownMenuItem onClick={() => navigate(`/propostas/${p.id}`)}>
                          <Edit2 className="mr-2 h-3.5 w-3.5" />Editar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => handleDuplicate(p)}>
                        <Copy className="mr-2 h-3.5 w-3.5" />Duplicar
                      </DropdownMenuItem>
                      {!cancelled && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setWinId(p.id)}>
                            <Trophy className="mr-2 h-3.5 w-3.5" />Encerrar como Ganha
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setCancelId(p.id)} className="text-destructive focus:text-destructive">
                            <Ban className="mr-2 h-3.5 w-3.5" />Cancelar Proposta
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDeleteId(p.id)} className="text-destructive focus:text-destructive">
                            <Trash2 className="mr-2 h-3.5 w-3.5" />Excluir
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma proposta encontrada.</div>
          )}
        </div>
      </div>

      {/* Generation console dialog */}
      <Dialog open={consoleOpen} onOpenChange={setConsoleOpen}>
        <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-3">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Gerar Proposta — Console de Execução
            </DialogTitle>
          </DialogHeader>
          <div className="bg-zinc-950 mx-4 mb-4 rounded-lg border border-zinc-800 overflow-hidden">
            <ScrollArea className="h-80">
              <div className="p-4 font-mono text-sm space-y-2">
                {consoleLogs.map((entry, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <StatusIcon status={entry.status} />
                    <div className="min-w-0 flex-1">
                      <span className="text-zinc-400 text-xs mr-2">
                        {new Date(entry.timestamp).toLocaleTimeString("pt-BR")}
                      </span>
                      <span className="text-zinc-200 font-semibold">{entry.step}</span>
                      <span className="text-zinc-400 mx-1">—</span>
                      <span className={
                        entry.status === "error" ? "text-red-400" :
                        entry.status === "ok" ? "text-green-400" :
                        "text-blue-400"
                      }>
                        {entry.message}
                      </span>
                    </div>
                  </div>
                ))}
                {consoleLoading && (
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Processando...</span>
                  </div>
                )}
                <div ref={consoleEndRef} />
              </div>
            </ScrollArea>
          </div>
          {!consoleLoading && consoleLogs.length > 0 && (
            <div className="px-6 pb-4 flex gap-2 justify-end">
              {consoleDocUrl && (
                <Button onClick={() => window.open(consoleDocUrl, "_blank")}>
                  <Eye className="mr-2 h-4 w-4" />
                  Abrir Documento
                </Button>
              )}
              <Button variant="outline" onClick={() => setConsoleOpen(false)}>
                Fechar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir proposta?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. A proposta e todos os dados relacionados serão removidos permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel confirmation */}
      <AlertDialog open={!!cancelId} onOpenChange={(open) => !open && setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar proposta?</AlertDialogTitle>
            <AlertDialogDescription>A proposta será marcada como cancelada e não poderá mais ser editada ou excluída.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Confirmar Cancelamento</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Win confirmation */}
      <AlertDialog open={!!winId} onOpenChange={(open) => !open && setWinId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar como ganha?</AlertDialogTitle>
            <AlertDialogDescription>A proposta será marcada como ganha.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleWin}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
