import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Plus, Trash2, UserPlus, Users, Send, Lock, Building } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface Signatory {
  id: string;
  contact_id: string | null;
  name: string;
  email: string;
  phone: string;
  role: string;
  isNew: boolean;
  isLoggedUser?: boolean;
}

interface Props {
  proposal: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ROLES = ["Signatário", "Testemunha", "Aprovador", "Observador"];

let localCounter = 0;
function newLocalId() {
  return `sig_${Date.now()}_${++localCounter}`;
}

export default function SendToSignatureDialog({ proposal, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [contacts, setContacts] = useState<any[]>([]);
  const [signatories, setSignatories] = useState<Signatory[]>([]);
  const [sending, setSending] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [loadingUnitContacts, setLoadingUnitContacts] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);

  useEffect(() => {
    if (pendingScrollId && scrollRef.current) {
      const el = scrollRef.current.querySelector(`[data-sig-id="${pendingScrollId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setPendingScrollId(null);
      }
    }
  }, [signatories, pendingScrollId]);

  const clientId = proposal?.client_id;

  useEffect(() => {
    if (open && clientId) {
      loadContacts();
      loadPreviousSignatories();
    }
  }, [open, clientId]);

  async function loadContacts() {
    setLoadingContacts(true);
    const { data, error } = await supabase
      .from("client_contacts")
      .select("*")
      .eq("client_id", clientId)
      .order("name");
    if (!error) setContacts(data || []);
    setLoadingContacts(false);
  }

  async function loadPreviousSignatories() {
    if (!proposal?.id) return;
    const { data: lastSig } = await supabase
      .from("proposal_signatures")
      .select("id, proposal_signatories(*)")
      .eq("proposal_id", proposal.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastSig?.proposal_signatories?.length) {
      const prev = (lastSig.proposal_signatories as any[]).map((s: any) => ({
        id: newLocalId(),
        contact_id: s.contact_id || null,
        name: s.name,
        email: s.email,
        phone: s.phone || "",
        role: s.role || "Signatário",
        isNew: false,
        isLoggedUser: user?.email ? s.email.toLowerCase() === user.email.toLowerCase() : false,
      }));
      setSignatories(prev);
      // Ensure logged user is always present
      ensureLoggedUser(prev);
    } else {
      ensureLoggedUser([]);
    }
  }

  function ensureLoggedUser(existing: Signatory[]) {
    if (!user?.email) return;
    const alreadyPresent = existing.some((s) => s.email.toLowerCase() === user.email!.toLowerCase());
    if (alreadyPresent) return;
    const loggedUserEntry: Signatory = {
      id: newLocalId(),
      contact_id: null,
      name: user.user_metadata?.display_name || user.email || "",
      email: user.email || "",
      phone: "",
      role: "Testemunha",
      isNew: true,
      isLoggedUser: true,
    };
    setSignatories((prev) => [loggedUserEntry, ...prev]);
  }

  function addSignatoryFromContact(contactId: string) {
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) return;
    if (signatories.some((s) => s.contact_id === contactId)) {
      toast({ title: "Contato já adicionado", variant: "destructive" });
      return;
    }
    const id = newLocalId();
    setSignatories((prev) => [
      ...prev,
      {
        id,
        contact_id: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone || "",
        role: contact.role || "Signatário",
        isNew: false,
      },
    ]);
    setPendingScrollId(id);
  }

  function addNewSignatory() {
    const id = newLocalId();
    setSignatories((prev) => [
      ...prev,
      {
        id,
        contact_id: null,
        name: "",
        email: "",
        phone: "",
        role: "Signatário",
        isNew: true,
      },
    ]);
    setPendingScrollId(id);
  }

  function removeSignatory(id: string) {
    setSignatories((prev) => prev.filter((s) => s.id !== id || s.isLoggedUser));
  }

  function updateSignatory(id: string, field: string, value: string) {
    setSignatories((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  }

  async function handleSend() {
    if (signatories.length === 0) {
      toast({ title: "Adicione ao menos um signatário", variant: "destructive" });
      return;
    }

    const missing = signatories.filter((s) => !s.name || !s.email);
    if (missing.length > 0) {
      toast({ title: "Preencha nome e e-mail de todos os signatários", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      // 1. Save new contacts to client_contacts for future use
      const newSignatories = signatories.filter((s) => s.isNew && s.name && s.email);
      const contactIdMap = new Map<string, string>();

      for (const sig of newSignatories) {
        const { data, error } = await supabase.from("client_contacts").insert({
          client_id: clientId,
          name: sig.name,
          email: sig.email,
          phone: sig.phone || null,
          role: sig.role || "Signatário",
        }).select().single();
        if (!error && data) {
          contactIdMap.set(sig.id, data.id);
        }
      }

      // 2. Create proposal_signatures record
      const { data: sigRecord, error: sigError } = await supabase
        .from("proposal_signatures")
        .insert({
          proposal_id: proposal.id,
          sent_by: user!.id,
          status: "pending",
        } as any)
        .select()
        .single();
      if (sigError) throw sigError;

      // 3. Insert signatories
      const signatoryRows = signatories.map((s) => ({
        signature_id: sigRecord.id,
        contact_id: s.contact_id || contactIdMap.get(s.id) || null,
        name: s.name,
        email: s.email,
        phone: s.phone || null,
        role: s.role,
      }));

      const { error: signatoryError } = await supabase
        .from("proposal_signatories")
        .insert(signatoryRows as any);
      if (signatoryError) throw signatoryError;

      // 4. Call TAE edge function to actually send to TAE
      toast({ title: "Enviando ao TAE..." });
      const { data: { session } } = await supabase.auth.getSession();
      const taeRes = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tae-send-signature`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ signatureId: sigRecord.id }),
        }
      );
      const taeData = await taeRes.json();

      if (!taeRes.ok || taeData.logs?.some((l: any) => l.status === "error")) {
        // TAE failed — cancel signature record, do NOT change proposal status
        await supabase.from("proposal_signatures")
          .update({ status: "cancelled", cancelled_at: new Date().toISOString() } as any)
          .eq("id", sigRecord.id);

        const errorMsg = taeData.logs?.filter((l: any) => l.status === "error").map((l: any) => l.message).join("; ")
          || "Erro ao enviar para o TAE";
        toast({
          title: "Falha no envio ao TAE",
          description: errorMsg,
          variant: "destructive",
        });
      } else {
        // TAE succeeded — now update proposal status
        await supabase
          .from("proposals")
          .update({ status: "em_assinatura" } as any)
          .eq("id", proposal.id);
        toast({ title: "Proposta enviada para assinatura no TAE com sucesso!" });
      }

      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      onOpenChange(false);
      setSignatories([]);
    } catch (err: any) {
      toast({ title: "Erro ao enviar", description: err.message, variant: "destructive" });
    }
    setSending(false);
  }

  const clientName = (proposal as any)?.clients?.name || "Cliente";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Enviar para Assinatura
          </DialogTitle>
          <DialogDescription>
            Proposta {proposal?.number} — {clientName}
          </DialogDescription>
        </DialogHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 space-y-4 py-2 -mx-6 px-6">
          {/* Select from existing contacts */}
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Contatos do Cliente
            </Label>
            <div className="flex gap-2">
              <Select onValueChange={addSignatoryFromContact}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={loadingContacts ? "Carregando..." : contacts.length === 0 ? "Nenhum contato cadastrado" : "Selecione um contato existente"} />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} — {c.email} {c.role ? `(${c.role})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={addNewSignatory} title="Adicionar novo signatário">
                <UserPlus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Signatories list */}
          {signatories.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs">Signatários ({signatories.length})</Label>
              <div className="space-y-3">
                {signatories.map((sig, idx) => (
                  <div
                    key={sig.id}
                    data-sig-id={sig.id}
                    className={`rounded-lg border p-3 space-y-2 ${sig.isLoggedUser ? "border-primary/40 bg-primary/5" : "border-border"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        {sig.isLoggedUser ? (
                          <span className="flex items-center gap-1 text-primary">
                            <Lock className="h-3 w-3" /> Você (obrigatório)
                          </span>
                        ) : (
                          <>Signatário {idx + 1} {sig.isNew && <span className="text-primary ml-1">(novo)</span>}</>
                        )}
                      </span>
                      {sig.isLoggedUser ? (
                        <Lock className="h-4 w-4 text-muted-foreground/50" />
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => removeSignatory(sig.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Nome *</Label>
                        <Input
                          value={sig.name}
                          onChange={(e) => updateSignatory(sig.id, "name", e.target.value)}
                          placeholder="Nome completo"
                          readOnly={!sig.isNew || sig.isLoggedUser}
                          className={!sig.isNew || sig.isLoggedUser ? "bg-muted" : ""}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">E-mail *</Label>
                        <Input
                          value={sig.email}
                          onChange={(e) => updateSignatory(sig.id, "email", e.target.value)}
                          placeholder="email@empresa.com"
                          readOnly={!sig.isNew || sig.isLoggedUser}
                          className={!sig.isNew || sig.isLoggedUser ? "bg-muted" : ""}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Celular</Label>
                        <Input
                          value={sig.phone}
                          onChange={(e) => updateSignatory(sig.id, "phone", e.target.value)}
                          placeholder="(00) 00000-0000"
                          readOnly={!sig.isNew}
                          className={!sig.isNew ? "bg-muted" : ""}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Função</Label>
                        <Select
                          value={sig.role}
                          onValueChange={(v) => updateSignatory(sig.id, "role", v)}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => (
                              <SelectItem key={r} value={r}>{r}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {signatories.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <Users className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Selecione contatos existentes ou adicione novos signatários</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={addNewSignatory}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Adicionar Signatário
              </Button>
            </div>
          )}
        </div>

        <div className="shrink-0 flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSend} disabled={sending || signatories.length === 0}>
            <Send className="mr-2 h-4 w-4" />
            {sending ? "Enviando..." : "Enviar para Assinatura"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}