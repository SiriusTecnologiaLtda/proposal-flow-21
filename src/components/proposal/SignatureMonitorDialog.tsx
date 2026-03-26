import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, RefreshCw, Mail, Clock, CheckCircle2, XCircle, AlertCircle, FileText, Copy, ChevronDown, ChevronRight, Users, History, Send, Ban, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props {
  proposalId: string | null;
  proposalNumber?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readOnly?: boolean;
}

interface SignatureRecord {
  id: string;
  status: string;
  tae_document_id: string | null;
  tae_publication_id: string | null;
  sent_at: string;
  sent_by: string;
  completed_at: string | null;
  cancelled_at: string | null;
  notes: string | null;
  proposal_signatories: Array<{
    id: string;
    name: string;
    email: string;
    phone: string | null;
    role: string | null;
    status: string;
    signed_at: string | null;
  }>;
}

interface TaeStatus {
  taePublicationId: string;
  taeDocumentId: string;
  status: number;
  statusLabel: string;
  signers: Array<{
    email: string;
    name: string;
    statusLabel: string;
    signedAt: string | null;
    action?: string | null;
  }>;
}

interface SignatureEvent {
  id: string;
  event_type: string;
  title: string;
  description: string;
  created_at: string;
}

const localStatusMap: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  pending: { label: "Pendente", className: "bg-muted text-muted-foreground", icon: Clock },
  sent: { label: "Enviado ao TAE", className: "bg-primary/15 text-primary", icon: Mail },
  completed: { label: "Finalizado", className: "bg-success/15 text-success", icon: CheckCircle2 },
  cancelled: { label: "Cancelado", className: "bg-destructive/15 text-destructive", icon: XCircle },
};

const eventIconMap: Record<string, { icon: typeof CheckCircle2; className: string }> = {
  sent: { icon: Send, className: "text-primary" },
  success: { icon: CheckCircle2, className: "text-success" },
  rejected: { icon: XCircle, className: "text-destructive" },
  cancelled: { icon: Ban, className: "text-destructive" },
  info: { icon: AlertCircle, className: "text-muted-foreground" },
  warning: { icon: AlertTriangle, className: "text-warning" },
};

function SignerIcon({ status }: { status: string }) {
  if (status === "signed" || status === "Assinado") return <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />;
  if (status === "rejected" || status === "Rejeitado") return <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />;
  return <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
}

export default function SignatureMonitorDialog({ proposalId, proposalNumber, open, onOpenChange, readOnly = false }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [signatures, setSignatures] = useState<SignatureRecord[]>([]);
  const [events, setEvents] = useState<SignatureEvent[]>([]);
  const [taeStatuses, setTaeStatuses] = useState<Record<string, TaeStatus>>({});
  const [checkingTaeId, setCheckingTaeId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open && proposalId) {
      void loadSignatures();
      void loadEvents();
      setTaeStatuses({});
      setExpandedIds(new Set());
    }
  }, [open, proposalId]);

  async function loadSignatures() {
    if (!proposalId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("proposal_signatures")
      .select("*, proposal_signatories(*)")
      .eq("proposal_id", proposalId)
      .order("sent_at", { ascending: false });

    if (!error && data) {
      setSignatures(data as any);
      if (data.length > 0) {
        setExpandedIds(new Set([data[0].id]));
      }
    }
    setLoading(false);
  }

  async function loadEvents() {
    if (!proposalId) return;
    const { data } = await supabase
      .from("signature_events")
      .select("*")
      .eq("proposal_id", proposalId)
      .order("created_at", { ascending: false });
    setEvents((data as any) || []);
  }

  async function checkTaeStatus(sig: SignatureRecord) {
    setCheckingTaeId(sig.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tae-check-status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ signatureId: sig.id }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Erro ao consultar TAE", description: data.error || "Erro desconhecido", variant: "destructive" });
      } else {
        setTaeStatuses((prev) => ({ ...prev, [sig.id]: data }));
        await loadSignatures();
        await loadEvents();
      }
    } catch (err: any) {
      toast({ title: "Erro de rede", description: err.message, variant: "destructive" });
    }
    setCheckingTaeId(null);
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado!" });
  }

  function getSignerDisplayStatus(sig: SignatureRecord, signer: SignatureRecord["proposal_signatories"][number]) {
    const tae = taeStatuses[sig.id];
    const taeSigner = tae?.signers?.find((s) => s.email?.toLowerCase() === signer.email?.toLowerCase());
    if (taeSigner) return taeSigner.statusLabel;
    if (signer.status === "signed") return "Assinado";
    if (signer.status === "rejected") return "Rejeitado";
    return "Pendente";
  }

  function getSignerSignedAt(sig: SignatureRecord, signer: SignatureRecord["proposal_signatories"][number]) {
    const tae = taeStatuses[sig.id];
    const taeSigner = tae?.signers?.find((s) => s.email?.toLowerCase() === signer.email?.toLowerCase());
    return taeSigner?.signedAt || signer.signed_at;
  }

  function getSignerSummary(sig: SignatureRecord) {
    const signers = sig.proposal_signatories || [];
    const total = signers.length;
    const signed = signers.filter((s) => {
      const status = getSignerDisplayStatus(sig, s);
      return status === "Assinado";
    }).length;
    return { signed, total };
  }

  // Check if there's a rejection event to show a prominent alert
  const hasRejection = events.some(e => e.event_type === "rejected");
  const latestRejection = events.find(e => e.event_type === "rejected");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Monitor de Assinatura
          </DialogTitle>
          <DialogDescription>
            {proposalNumber ? `Proposta ${proposalNumber}` : "Acompanhe o status da assinatura"}
          </DialogDescription>
        </DialogHeader>

        {/* Rejection alert banner */}
        {hasRejection && latestRejection && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-start gap-3">
            <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-destructive">{latestRejection.title}</p>
              <p className="text-xs text-muted-foreground">{latestRejection.description}</p>
              <p className="text-[10px] text-muted-foreground/70">
                {new Date(latestRejection.created_at).toLocaleDateString("pt-BR")} às{" "}
                {new Date(latestRejection.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        )}

        <Tabs defaultValue="status" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="status" className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Status
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" /> Histórico
              {events.length > 0 && (
                <Badge variant="secondary" className="text-[10px] h-4 min-w-4 px-1">{events.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="status" className="flex-1 overflow-hidden mt-3">
            <ScrollArea className="h-[50vh]">
              <div className="space-y-3 pr-3">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : signatures.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhum envio de assinatura encontrado para esta proposta.
                  </p>
                ) : (
                  signatures.map((sig, idx) => {
                    const statusInfo = localStatusMap[sig.status] || localStatusMap.pending;
                    const StatusIconComp = statusInfo.icon;
                    const isExpanded = expandedIds.has(sig.id);
                    const tae = taeStatuses[sig.id];
                    const { signed, total } = getSignerSummary(sig);
                    const isLatest = idx === 0;

                    return (
                      <Collapsible key={sig.id} open={isExpanded} onOpenChange={() => toggleExpanded(sig.id)}>
                        <div className="rounded-lg border border-border overflow-hidden">
                          <CollapsibleTrigger asChild>
                            <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                              )}
                              <StatusIconComp className="h-4 w-4 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge className={statusInfo.className + " text-xs"}>
                                    {statusInfo.label}
                                  </Badge>
                                  {isLatest && signatures.length > 1 && (
                                    <Badge variant="outline" className="text-[10px]">Mais recente</Badge>
                                  )}
                                  {tae && (
                                    <Badge
                                      variant={tae.status === 2 ? "default" : tae.status === 4 || tae.status === 7 ? "destructive" : "secondary"}
                                      className="text-[10px]"
                                    >
                                      TAE: {tae.statusLabel}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {new Date(sig.sent_at).toLocaleDateString("pt-BR")} às{" "}
                                  {new Date(sig.sent_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground font-medium">
                                  {signed}/{total}
                                </span>
                              </div>
                            </button>
                          </CollapsibleTrigger>

                          <CollapsibleContent>
                            <div className="border-t border-border px-4 py-3 space-y-3 bg-muted/20">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  {sig.tae_document_id && (
                                    <button
                                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                                      onClick={() => copyToClipboard(sig.tae_document_id!)}
                                      title="Copiar Doc ID"
                                    >
                                      <FileText className="h-3 w-3" />
                                      <span className="font-mono">Doc: {sig.tae_document_id.substring(0, 8)}…</span>
                                      <Copy className="h-2.5 w-2.5" />
                                    </button>
                                  )}
                                  {sig.tae_publication_id && (
                                    <button
                                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                                      onClick={() => copyToClipboard(sig.tae_publication_id!)}
                                      title="Copiar Pub ID"
                                    >
                                      <FileText className="h-3 w-3" />
                                      <span className="font-mono">Pub: {sig.tae_publication_id.substring(0, 8)}…</span>
                                      <Copy className="h-2.5 w-2.5" />
                                    </button>
                                  )}
                                </div>

                                {!readOnly && (sig.tae_publication_id || sig.tae_document_id) && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={(e) => { e.stopPropagation(); checkTaeStatus(sig); }}
                                    disabled={checkingTaeId === sig.id}
                                  >
                                    {checkingTaeId === sig.id ? (
                                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                                    ) : (
                                      <RefreshCw className="mr-1.5 h-3 w-3" />
                                    )}
                                    Sincronizar TAE
                                  </Button>
                                )}

                                {!sig.tae_publication_id && !sig.tae_document_id && (
                                  <Badge variant="outline" className="text-xs">
                                    <AlertCircle className="mr-1 h-3 w-3" />
                                    Não enviado ao TAE
                                  </Badge>
                                )}
                              </div>

                              <div className="space-y-1.5">
                                <span className="text-xs font-medium text-muted-foreground">
                                  Signatários ({total})
                                </span>
                                <div className="space-y-1">
                                  {(sig.proposal_signatories || []).map((signer) => {
                                    const displayStatus = getSignerDisplayStatus(sig, signer);
                                    const signedAt = getSignerSignedAt(sig, signer);
                                    return (
                                      <div
                                        key={signer.id}
                                        className="flex items-center gap-2 text-xs rounded-md px-3 py-2 bg-background border border-border/50"
                                      >
                                        <SignerIcon status={displayStatus} />
                                        <div className="flex-1 min-w-0">
                                          <span className="font-medium text-foreground">{signer.name}</span>
                                          <span className="text-muted-foreground ml-1.5">{signer.email}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          {signer.role && (
                                            <Badge variant="outline" className="text-[10px]">{signer.role}</Badge>
                                          )}
                                          <Badge
                                            variant="outline"
                                            className={`text-[10px] ${
                                              displayStatus === "Assinado"
                                                ? "border-success/30 text-success"
                                                : displayStatus === "Rejeitado"
                                                ? "border-destructive/30 text-destructive"
                                                : ""
                                            }`}
                                          >
                                            {displayStatus}
                                          </Badge>
                                          {signedAt && (
                                            <span className="text-muted-foreground text-[10px]">
                                              {new Date(signedAt).toLocaleDateString("pt-BR")}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {sig.completed_at && (
                                <p className="text-xs text-success">
                                  ✅ Finalizado em {new Date(sig.completed_at).toLocaleDateString("pt-BR")} às{" "}
                                  {new Date(sig.completed_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                </p>
                              )}
                              {sig.cancelled_at && (
                                <p className="text-xs text-destructive">
                                  ❌ Cancelado em {new Date(sig.cancelled_at).toLocaleDateString("pt-BR")} às{" "}
                                  {new Date(sig.cancelled_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                </p>
                              )}
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="history" className="flex-1 overflow-hidden mt-3">
            <ScrollArea className="h-[50vh]">
              <div className="pr-3">
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhum evento registrado ainda.
                  </p>
                ) : (
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-[11px] top-3 bottom-3 w-px bg-border" />
                    <div className="space-y-0">
                      {events.map((evt) => {
                        const evtStyle = eventIconMap[evt.event_type] || eventIconMap.info;
                        const EvtIcon = evtStyle.icon;
                        return (
                          <div key={evt.id} className="flex gap-3 py-2.5 relative">
                            <div className={`shrink-0 z-10 w-6 h-6 rounded-full flex items-center justify-center bg-background border border-border ${evtStyle.className}`}>
                              <EvtIcon className="h-3 w-3" />
                            </div>
                            <div className="flex-1 min-w-0 pt-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground">{evt.title}</span>
                                <Badge variant="outline" className={`text-[10px] ${
                                  evt.event_type === "rejected" ? "border-destructive/30 text-destructive" :
                                  evt.event_type === "success" ? "border-success/30 text-success" :
                                  evt.event_type === "cancelled" ? "border-destructive/30 text-destructive" :
                                  ""
                                }`}>
                                  {evt.event_type === "sent" ? "Envio" :
                                   evt.event_type === "success" ? "Concluído" :
                                   evt.event_type === "rejected" ? "Rejeitado" :
                                   evt.event_type === "cancelled" ? "Cancelado" :
                                   "Info"}
                                </Badge>
                              </div>
                              {evt.description && (
                                <p className="text-xs text-muted-foreground mt-0.5">{evt.description}</p>
                              )}
                              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                                {new Date(evt.created_at).toLocaleDateString("pt-BR")} às{" "}
                                {new Date(evt.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end pt-2 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
