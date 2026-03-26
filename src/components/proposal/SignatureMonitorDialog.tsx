import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, RefreshCw, Mail, Clock, CheckCircle2, XCircle, AlertCircle, FileText, Copy, ChevronDown, ChevronRight, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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

const localStatusMap: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  pending: { label: "Pendente", className: "bg-muted text-muted-foreground", icon: Clock },
  sent: { label: "Enviado ao TAE", className: "bg-primary/15 text-primary", icon: Mail },
  completed: { label: "Finalizado", className: "bg-success/15 text-success", icon: CheckCircle2 },
  cancelled: { label: "Cancelado", className: "bg-destructive/15 text-destructive", icon: XCircle },
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
  const [taeStatuses, setTaeStatuses] = useState<Record<string, TaeStatus>>({});
  const [checkingTaeId, setCheckingTaeId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open && proposalId) {
      void loadSignatures();
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
      // Auto-expand latest
      if (data.length > 0) {
        setExpandedIds(new Set([data[0].id]));
      }
    }
    setLoading(false);
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

  // Count signed/total for summary
  function getSignerSummary(sig: SignatureRecord) {
    const signers = sig.proposal_signatories || [];
    const total = signers.length;
    const signed = signers.filter((s) => {
      const status = getSignerDisplayStatus(sig, s);
      return status === "Assinado";
    }).length;
    return { signed, total };
  }

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

        <div className="flex-1 overflow-y-auto space-y-3 py-2">
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
                    {/* Card header - always visible */}
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

                    {/* Expanded content */}
                    <CollapsibleContent>
                      <div className="border-t border-border px-4 py-3 space-y-3 bg-muted/20">
                        {/* Action bar */}
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

                        {/* Signatories list */}
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

                        {/* Completion/cancellation info */}
                        {sig.completed_at && (
                          <p className="text-xs text-green-600">
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

        <div className="flex justify-end pt-2 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
