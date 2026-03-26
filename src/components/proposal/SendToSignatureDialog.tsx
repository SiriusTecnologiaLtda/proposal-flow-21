import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";

import {
  Plus, Trash2, UserPlus, Users, Send, Lock, Building,
  FileText, Paperclip, ChevronDown, ChevronRight, AlertTriangle,
  File, BookOpen
} from "lucide-react";
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

interface EnvelopeDoc {
  id: string;
  name: string;
  origin: "Proposta" | "Anexo do Projeto";
  mandatory: boolean;
  selected: boolean;
  hasWarning?: boolean;
  warningMessage?: string;
  fileUrl?: string;
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

  // Envelope documents
  const [envelopeDocs, setEnvelopeDocs] = useState<EnvelopeDoc[]>([]);
  const [docsOpen, setDocsOpen] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(false);

  // Project info
  const [projectInfo, setProjectInfo] = useState<any>(null);

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
      loadEnvelopeDocuments();
    }
  }, [open, clientId]);

  // ─── Load envelope documents ──────────────────────────────────────
  async function loadEnvelopeDocuments() {
    if (!proposal?.id) return;
    setLoadingDocs(true);
    const docs: EnvelopeDoc[] = [];

    // 1. Official proposal document
    let { data: officialDoc } = await supabase
      .from("proposal_documents")
      .select("*")
      .eq("proposal_id", proposal.id)
      .eq("doc_type", "proposta")
      .eq("is_official", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!officialDoc) {
      const { data: latestDoc } = await supabase
        .from("proposal_documents")
        .select("*")
        .eq("proposal_id", proposal.id)
        .eq("doc_type", "proposta")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      officialDoc = latestDoc;
    }

    if (officialDoc) {
      docs.push({
        id: `proposal_${officialDoc.id}`,
        name: `${officialDoc.file_name} (v${officialDoc.version})`,
        origin: "Proposta",
        mandatory: true,
        selected: true,
        fileUrl: officialDoc.doc_url,
      });
    }

    // 2. Project attachments with is_scope = true
    // Find linked project
    const { data: project } = await supabase
      .from("projects")
      .select("id, product, clients(name)")
      .eq("proposal_id", proposal.id)
      .limit(1)
      .maybeSingle();

    setProjectInfo(project);

    if (project) {
      const { data: attachments } = await supabase
        .from("project_attachments")
        .select("*")
        .eq("project_id", project.id)
        .eq("is_scope", true)
        .order("created_at");

      if (attachments?.length) {
        for (const att of attachments) {
          const hasUrl = !!att.file_url;
          docs.push({
            id: `attach_${att.id}`,
            name: att.file_name,
            origin: "Anexo do Projeto",
            mandatory: false,
            selected: true,
            hasWarning: !hasUrl,
            warningMessage: !hasUrl ? "Arquivo não acessível no Drive" : undefined,
            fileUrl: att.file_url,
          });
        }
      }
    }

    setEnvelopeDocs(docs);
    setLoadingDocs(false);
  }

  function toggleDocSelected(docId: string) {
    setEnvelopeDocs((prev) =>
      prev.map((d) =>
        d.id === docId && !d.mandatory ? { ...d, selected: !d.selected } : d
      )
    );
  }

  // ─── Contacts & Signatories (existing logic preserved) ────────────
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

  async function loadUnitContacts() {
    if (!proposal?.esn_id) {
      toast({ title: "Proposta sem ESN vinculado", variant: "destructive" });
      return;
    }
    setLoadingUnitContacts(true);
    try {
      const { data: esn } = await supabase
        .from("sales_team")
        .select("unit_id")
        .eq("id", proposal.esn_id)
        .single();
      if (!esn?.unit_id) {
        toast({ title: "ESN não tem unidade vinculada", variant: "destructive" });
        return;
      }
      const { data: unitContacts, error } = await supabase
        .from("unit_contacts")
        .select("*")
        .eq("unit_id", esn.unit_id)
        .order("name");
      if (error) throw error;
      if (!unitContacts?.length) {
        toast({ title: "Nenhum contato cadastrado na unidade do ESN" });
        return;
      }
      let added = 0;
      const newSigs = [...signatories];
      for (const uc of unitContacts) {
        const alreadyExists = newSigs.some((s) => s.email.toLowerCase() === uc.email.toLowerCase());
        if (alreadyExists) continue;
        newSigs.push({
          id: newLocalId(),
          contact_id: null,
          name: uc.name,
          email: uc.email,
          phone: uc.phone || "",
          role: uc.role || "Signatário",
          isNew: false,
        });
        added++;
      }
      setSignatories(newSigs);
      toast({ title: `${added} contato(s) da unidade adicionado(s)${unitContacts.length - added > 0 ? ` (${unitContacts.length - added} já existiam)` : ""}` });
    } catch (err: any) {
      toast({ title: "Erro ao carregar contatos da unidade", description: err.message, variant: "destructive" });
    } finally {
      setLoadingUnitContacts(false);
    }
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

    const hasProposal = envelopeDocs.some((d) => d.origin === "Proposta" && d.selected);
    if (!hasProposal) {
      toast({ title: "Proposta principal é obrigatória no envelope", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      // 1. Save new contacts to client_contacts (upsert by email to avoid duplicates)
      const newSignatories = signatories.filter((s) => s.isNew && s.name && s.email);
      const contactIdMap = new Map<string, string>();

      for (const sig of newSignatories) {
        // Check if contact with same email already exists for this client
        const { data: existing } = await supabase
          .from("client_contacts")
          .select("id")
          .eq("client_id", clientId)
          .ilike("email", sig.email.trim())
          .limit(1);

        if (existing && existing.length > 0) {
          // Update existing contact fields if different
          await supabase.from("client_contacts").update({
            name: sig.name,
            phone: sig.phone || null,
            role: sig.role || "Signatário",
          }).eq("id", existing[0].id);
          contactIdMap.set(sig.id, existing[0].id);
        } else {
          const { data, error } = await supabase.from("client_contacts").insert({
            client_id: clientId,
            name: sig.name,
            email: sig.email.trim(),
            phone: sig.phone || null,
            role: sig.role || "Signatário",
          }).select().single();
          if (!error && data) {
            contactIdMap.set(sig.id, data.id);
          }
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

      // 4. Call TAE edge function
      toast({ title: "Enviando ao TAE..." });
      const { data: { session } } = await supabase.auth.getSession();

      // Build selected attachment IDs (exclude the proposal doc itself)
      const selectedAttachmentIds = envelopeDocs
        .filter((d) => d.origin === "Anexo do Projeto" && d.selected && !d.hasWarning)
        .map((d) => d.id.replace("attach_", ""));

      const taeRes = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tae-send-signature`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            signatureId: sigRecord.id,
            attachmentIds: selectedAttachmentIds,
          }),
        }
      );
      const taeData = await taeRes.json();

      if (!taeRes.ok || taeData.logs?.some((l: any) => l.status === "error")) {
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
  const selectedDocsCount = envelopeDocs.filter((d) => d.selected).length;
  const scopeDocsCount = envelopeDocs.filter((d) => d.origin === "Anexo do Projeto" && d.selected).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col gap-0">
        {/* ─── Header ─────────────────────────────────── */}
        <DialogHeader className="shrink-0 pb-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Send className="h-5 w-5 text-primary" />
            Enviar para Assinatura
          </DialogTitle>
          <DialogDescription className="text-sm">
            Proposta <span className="font-medium text-foreground">{proposal?.number}</span> — {clientName}
            {projectInfo && (
              <span className="text-muted-foreground"> · Projeto: {projectInfo.product}</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <Separator />

        <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 py-4 -mx-6 px-6 space-y-5">
          {/* ─── Context summary ─────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Documentos</p>
              <p className="text-xl font-semibold text-foreground mt-0.5">{selectedDocsCount}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Escopo</p>
              <p className="text-xl font-semibold text-foreground mt-0.5">{scopeDocsCount}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Signatários</p>
              <p className="text-xl font-semibold text-foreground mt-0.5">{signatories.length}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Projeto</p>
              <p className="text-sm font-medium text-foreground mt-1 truncate">{projectInfo ? "Sim" : "Não"}</p>
            </div>
          </div>

          {/* ─── Envelope Documents (collapsible, default closed) ── */}
          <Collapsible open={docsOpen} onOpenChange={setDocsOpen}>
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3 hover:bg-muted/40 transition-colors text-left">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">Documentos do Envelope</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {selectedDocsCount} de {envelopeDocs.length}
                  </Badge>
                </div>
                {docsOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              {loadingDocs ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <p className="text-sm text-muted-foreground">Carregando documentos...</p>
                </div>
              ) : envelopeDocs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <FileText className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum documento encontrado. Gere a proposta primeiro.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {envelopeDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                        doc.hasWarning
                          ? "border-destructive/40 bg-destructive/5"
                          : doc.selected
                          ? "border-primary/30 bg-primary/5"
                          : "border-border bg-background"
                      }`}
                    >
                      <Checkbox
                        checked={doc.selected}
                        disabled={doc.mandatory}
                        onCheckedChange={() => toggleDocSelected(doc.id)}
                        className={doc.mandatory ? "opacity-60" : ""}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {doc.origin === "Proposta" ? (
                            <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
                          ) : (
                            <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          )}
                          <span className="text-sm font-medium text-foreground truncate">{doc.name}</span>
                        </div>
                        {doc.hasWarning && (
                          <div className="flex items-center gap-1 mt-1">
                            <AlertTriangle className="h-3 w-3 text-destructive" />
                            <span className="text-[11px] text-destructive">{doc.warningMessage}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant={doc.origin === "Proposta" ? "default" : "outline"}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {doc.origin}
                        </Badge>
                        {doc.mandatory && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5">
                            <Lock className="h-2.5 w-2.5" />
                            Obrigatório
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          {/* ─── Signatories ─────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Users className="h-4 w-4 text-primary" />
                Signatários
              </Label>
            </div>

            {/* Contact selection row */}
            <div className="flex gap-2">
              <Select onValueChange={addSignatoryFromContact}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={loadingContacts ? "Carregando..." : contacts.length === 0 ? "Nenhum contato cadastrado" : "Selecione um contato do cliente"} />
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

            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={loadUnitContacts}
              disabled={loadingUnitContacts}
            >
              <Building className="h-3.5 w-3.5" />
              {loadingUnitContacts ? "Carregando..." : "Carregar Signatários Internos (Unidade)"}
            </Button>

            {signatories.length > 0 && (
              <div className="space-y-2">
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
        </div>

        {/* ─── Footer ────────────────────────────────── */}
        <Separator />
        <div className="shrink-0 flex justify-end gap-2 pt-4">
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
