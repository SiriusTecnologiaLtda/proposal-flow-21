import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, RefreshCw, Mail, Clock, CheckCircle2, XCircle, AlertCircle, FileText, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  proposalId: string | null;
  proposalNumber?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  }>;
}

const localStatusMap: Record<string, { label: string; className: string }> = {
  pending: { label: "Pendente (local)", className: "bg-muted text-muted-foreground" },
  sent: { label: "Enviado ao TAE", className: "bg-primary/15 text-primary" },
  completed: { label: "Finalizado", className: "bg-green-500/15 text-green-600" },
  cancelled: { label: "Cancelado", className: "bg-destructive/15 text-destructive" },
};

export default function SignatureMonitorDialog({ proposalId, proposalNumber, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [signatures, setSignatures] = useState<SignatureRecord[]>([]);
  const [taeStatus, setTaeStatus] = useState<TaeStatus | null>(null);
  const [checkingTae, setCheckingTae] = useState(false);

  useEffect(() => {
    if (open && proposalId) {
      loadSignatures();
      setTaeStatus(null);
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
    if (!error) setSignatures((data || []) as any);
    setLoading(false);
  }

  async function checkTaeStatus(signatureId: string) {
    setCheckingTae(true);
    setTaeStatus(null);
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
          body: JSON.stringify({ signatureId }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Erro ao consultar TAE", description: data.error || "Erro desconhecido", variant: "destructive" });
      } else {
        setTaeStatus(data);
        // Refresh local data
        await loadSignatures();
      }
    } catch (err: any) {
      toast({ title: "Erro de rede", description: err.message, variant: "destructive" });
    }
    setCheckingTae(false);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado!" });
  }

  const latestSig = signatures[0];

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

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : signatures.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum envio de assinatura encontrado para esta proposta.
            </p>
          ) : (
            signatures.map((sig) => {
              const statusInfo = localStatusMap[sig.status] || localStatusMap.pending;
              return (
                <div key={sig.id} className="rounded-lg border border-border p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
                        {sig.tae_publication_id && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            PUB: {sig.tae_publication_id}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Enviado em {new Date(sig.sent_at).toLocaleDateString("pt-BR")} às{" "}
                        {new Date(sig.sent_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {sig.tae_document_id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Copiar ID do documento TAE"
                          onClick={() => copyToClipboard(sig.tae_document_id!)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {sig.tae_publication_id && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => checkTaeStatus(sig.id)}
                          disabled={checkingTae}
                        >
                          {checkingTae ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Atualizar Status
                        </Button>
                      )}
                      {!sig.tae_publication_id && sig.status === "pending" && (
                        <Badge variant="outline" className="text-xs">
                          <AlertCircle className="mr-1 h-3 w-3" />
                          Não enviado ao TAE
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* TAE IDs */}
                  {(sig.tae_document_id || sig.tae_publication_id) && (
                    <div className="grid gap-2 sm:grid-cols-2 text-xs">
                      {sig.tae_document_id && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <FileText className="h-3 w-3 shrink-0" />
                          <span>Doc ID: <span className="font-mono text-foreground">{sig.tae_document_id}</span></span>
                        </div>
                      )}
                      {sig.tae_publication_id && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <FileText className="h-3 w-3 shrink-0" />
                          <span>Pub ID: <span className="font-mono text-foreground">{sig.tae_publication_id}</span></span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAE live status */}
                  {taeStatus && taeStatus.taePublicationId === sig.tae_publication_id && (
                    <div className="rounded-md bg-accent/50 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">Status TAE:</span>
                        <Badge variant={taeStatus.status === 2 ? "default" : taeStatus.status === 7 || taeStatus.status === 4 ? "destructive" : "secondary"}>
                          {taeStatus.statusLabel}
                        </Badge>
                      </div>
                      {taeStatus.signers.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-xs font-medium text-muted-foreground">Signatários no TAE:</span>
                          {taeStatus.signers.map((s, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              {s.statusLabel === "Assinado" ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                              ) : s.statusLabel === "Rejeitado" ? (
                                <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                              ) : (
                                <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              )}
                              <span className="text-foreground">{s.name || s.email}</span>
                              <span className="text-muted-foreground">({s.email})</span>
                              <Badge variant="outline" className="text-[10px] ml-auto">
                                {s.statusLabel}
                              </Badge>
                              {s.signedAt && (
                                <span className="text-muted-foreground text-[10px]">
                                  {new Date(s.signedAt).toLocaleDateString("pt-BR")}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Local signatories */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      Signatários ({sig.proposal_signatories?.length || 0})
                    </span>
                    <ScrollArea className="max-h-48">
                      <div className="space-y-1">
                        {(sig.proposal_signatories || []).map((s) => (
                          <div key={s.id} className="flex items-center gap-2 text-xs rounded-md px-2 py-1.5 bg-muted/50">
                            <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="font-medium text-foreground">{s.name}</span>
                            <span className="text-muted-foreground">{s.email}</span>
                            {s.role && (
                              <Badge variant="outline" className="text-[10px] ml-auto">
                                {s.role}
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
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
