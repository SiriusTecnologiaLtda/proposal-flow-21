import { useState, useEffect, useRef, useMemo } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

import {
  Plus, Trash2, UserPlus, Users, Send, Lock, Building,
  FileText, Paperclip, ChevronRight, AlertTriangle,
  BookOpen, ExternalLink, Eye, FileQuestion, CheckCircle2,
  Check, Mail, ClipboardList, ArrowLeft, ArrowRight, Sparkles, X
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

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
  driveFileId?: string;
}

interface Props {
  proposal: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ROLES = ["Signatário", "Testemunha", "Aprovador", "Observador"];

const STEPS = [
  { id: 0, key: "signatarios", label: "Signatários", icon: Users },
  { id: 1, key: "mensagem", label: "Mensagem", icon: Mail },
  { id: 2, key: "documentos", label: "Documentos", icon: FileText },
  { id: 3, key: "revisao", label: "Revisão", icon: Sparkles },
];

let localCounter = 0;
function newLocalId() {
  return `sig_${Date.now()}_${++localCounter}`;
}

function extractDriveFileId(url: string | undefined): string | null {
  if (!url) return null;
  let match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  match = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  return null;
}

function buildPreviewUrl(doc: EnvelopeDoc): string | null {
  const fileId = doc.driveFileId;
  if (!fileId) return null;
  if (doc.origin === "Proposta" && doc.fileUrl?.includes("docs.google.com/document")) {
    return `https://docs.google.com/document/d/${fileId}/preview`;
  }
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

export default function SendToSignatureDialog({ proposal, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Wizard step
  const [currentStep, setCurrentStep] = useState(0);

  // Shared state
  const [contacts, setContacts] = useState<any[]>([]);
  const [signatories, setSignatories] = useState<Signatory[]>([]);
  const [sending, setSending] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [loadingUnitContacts, setLoadingUnitContacts] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);

  // Email
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  // Envelope documents
  const [envelopeDocs, setEnvelopeDocs] = useState<EnvelopeDoc[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [projectInfo, setProjectInfo] = useState<any>(null);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);

  const clientName = (proposal as any)?.clients?.name || "Cliente";

  // Scroll to new signatory
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

  // Reset wizard when dialog opens
  useEffect(() => {
    if (open && clientId) {
      setCurrentStep(0);
      loadContacts();
      loadPreviousSignatories();
      loadEnvelopeDocuments();
      setActiveDocId(null);

      // Set default email content
      const proposalNum = proposal?.number || "";
      const desc = proposal?.description || "";
      const subjectDefault = `Proposta ${proposalNum}${desc ? ` - ${desc}` : ""}`.substring(0, 60);
      setEmailSubject(subjectDefault);
      setEmailBody(
        `Prezado(a),\n\nSegue envelope para assinatura eletrônica referente à proposta ${proposalNum}.\n\nSolicitamos a gentileza de revisar os documentos e proceder com a assinatura.\n\nAtenciosamente.`
      );
    }
  }, [open, clientId]);

  // Auto-select first doc for preview
  useEffect(() => {
    if (envelopeDocs.length > 0 && !activeDocId) {
      setActiveDocId(envelopeDocs[0].id);
    }
  }, [envelopeDocs, activeDocId]);

  // ─── Data Loading (preserved logic) ──────────────────────────────
  async function loadEnvelopeDocuments() {
    if (!proposal?.id) return;
    setLoadingDocs(true);
    const docs: EnvelopeDoc[] = [];

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
      const driveFileId = extractDriveFileId(officialDoc.doc_url) || officialDoc.doc_id;
      docs.push({
        id: `proposal_${officialDoc.id}`,
        name: `${officialDoc.file_name} (v${officialDoc.version})`,
        origin: "Proposta",
        mandatory: true,
        selected: true,
        fileUrl: officialDoc.doc_url,
        driveFileId,
      });
    }

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
          const driveFileId = extractDriveFileId(att.file_url);
          docs.push({
            id: `attach_${att.id}`,
            name: att.file_name,
            origin: "Anexo do Projeto",
            mandatory: false,
            selected: true,
            hasWarning: !hasUrl,
            warningMessage: !hasUrl ? "Arquivo não acessível no Drive" : undefined,
            fileUrl: att.file_url,
            driveFileId: driveFileId || undefined,
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

  // ─── Step validation ──────────────────────────────────────────────
  function canAdvance(step: number): boolean {
    switch (step) {
      case 0: // Signatários
        return signatories.length > 0 && signatories.every((s) => s.name && s.email);
      case 1: // Mensagem
        return emailSubject.trim().length > 0 && emailSubject.length <= 60;
      case 2: // Documentos
        return envelopeDocs.some((d) => d.origin === "Proposta" && d.selected);
      default:
        return true;
    }
  }

  function getStepError(step: number): string | null {
    switch (step) {
      case 0:
        if (signatories.length === 0) return "Adicione ao menos um signatário";
        if (signatories.some((s) => !s.name || !s.email)) return "Preencha nome e e-mail de todos os signatários";
        return null;
      case 1:
        if (!emailSubject.trim()) return "Informe o assunto do e-mail";
        if (emailSubject.length > 60) return "O assunto deve ter no máximo 60 caracteres";
        return null;
      case 2:
        if (!envelopeDocs.some((d) => d.origin === "Proposta" && d.selected)) return "Proposta principal é obrigatória";
        return null;
      default:
        return null;
    }
  }

  function handleNext() {
    const error = getStepError(currentStep);
    if (error) {
      toast({ title: error, variant: "destructive" });
      return;
    }
    setCurrentStep((s) => Math.min(s + 1, 3));
  }

  function handlePrev() {
    setCurrentStep((s) => Math.max(s - 1, 0));
  }

  // ─── Send (preserved logic + email fields) ────────────────────────
  async function handleSend() {
    // Final validations
    for (let i = 0; i < 3; i++) {
      const error = getStepError(i);
      if (error) {
        toast({ title: error, variant: "destructive" });
        setCurrentStep(i);
        return;
      }
    }

    setSending(true);
    try {
      // 1. Save new contacts (upsert by email)
      const newSignatories = signatories.filter((s) => s.isNew && s.name && s.email);
      const contactIdMap = new Map<string, string>();

      for (const sig of newSignatories) {
        const { data: existing } = await supabase
          .from("client_contacts")
          .select("id")
          .eq("client_id", clientId)
          .ilike("email", sig.email.trim())
          .limit(1);

        if (existing && existing.length > 0) {
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
            emailSubject: emailSubject.trim(),
            emailBody: emailBody.trim(),
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

  const selectedDocsCount = envelopeDocs.filter((d) => d.selected).length;
  const activeDoc = envelopeDocs.find((d) => d.id === activeDocId) || null;
  const previewUrl = activeDoc ? buildPreviewUrl(activeDoc) : null;

  // ─── Stepper ──────────────────────────────────────────────────────
  function renderStepper() {
    return (
      <div className="flex items-center justify-center gap-0 px-4">
        {STEPS.map((step, idx) => {
          const StepIcon = step.icon;
          const isCompleted = idx < currentStep;
          const isCurrent = idx === currentStep;

          return (
            <div key={step.key} className="flex items-center">
              {idx > 0 && (
                <div className={cn(
                  "w-12 h-[2px] mx-1",
                  isCompleted ? "bg-primary" : "bg-border"
                )} />
              )}
              <button
                type="button"
                onClick={() => {
                  // Allow navigating to completed or current steps
                  if (idx <= currentStep) setCurrentStep(idx);
                }}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg transition-all",
                  isCurrent && "bg-primary/10",
                  idx <= currentStep ? "cursor-pointer" : "cursor-default"
                )}
              >
                <div className={cn(
                  "flex items-center justify-center h-7 w-7 rounded-full text-xs font-semibold transition-all shrink-0",
                  isCompleted && "bg-primary text-primary-foreground",
                  isCurrent && "bg-primary text-primary-foreground",
                  !isCompleted && !isCurrent && "border border-border text-muted-foreground bg-muted/30"
                )}>
                  {isCompleted ? <Check className="h-3.5 w-3.5" /> : <StepIcon className="h-3.5 w-3.5" />}
                </div>
                <span className={cn(
                  "text-xs font-medium hidden sm:inline",
                  isCurrent ? "text-foreground" : "text-muted-foreground"
                )}>
                  {step.label}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  // ─── Step 1: Signatários ──────────────────────────────────────────
  function renderSignatarios() {
    return (
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="p-6 space-y-5 max-w-3xl mx-auto">
          <div>
            <h3 className="text-base font-semibold text-foreground mb-1">Quem irá assinar?</h3>
            <p className="text-sm text-muted-foreground">
              Defina os participantes do processo de assinatura. Ao menos um signatário é obrigatório.
            </p>
          </div>

          {/* Contact selection */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <Label className="text-xs font-medium text-muted-foreground">Adicionar participantes</Label>
            <div className="flex gap-2">
              <Select onValueChange={addSignatoryFromContact}>
                <SelectTrigger className="flex-1 h-9 text-sm">
                  <SelectValue placeholder={loadingContacts ? "Carregando..." : contacts.length === 0 ? "Nenhum contato cadastrado" : "Selecionar contato do cliente"} />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} — {c.email} {c.role ? `(${c.role})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-9 px-2.5" onClick={addNewSignatory} title="Adicionar novo">
                <UserPlus className="h-4 w-4" />
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5 h-8 text-xs"
              onClick={loadUnitContacts}
              disabled={loadingUnitContacts}
            >
              <Building className="h-3.5 w-3.5" />
              {loadingUnitContacts ? "Carregando..." : "Carregar Signatários Internos da Unidade"}
            </Button>
          </div>

          {/* Signatory list */}
          {signatories.length > 0 ? (
            <div className="space-y-3">
              {signatories.map((sig, idx) => (
                <div
                  key={sig.id}
                  data-sig-id={sig.id}
                  className={cn(
                    "rounded-lg border p-4 space-y-3",
                    sig.isLoggedUser
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-card"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      {sig.isLoggedUser ? (
                        <span className="flex items-center gap-1 text-primary">
                          <Lock className="h-3 w-3" /> Você (visibilidade no TAE)
                        </span>
                      ) : (
                        <>#{idx + 1} {sig.isNew && <span className="text-primary ml-1">(novo)</span>}</>
                      )}
                    </span>
                    {!sig.isLoggedUser && (
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
                  <div className="grid gap-3 grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Nome *</Label>
                      <Input
                        value={sig.name}
                        onChange={(e) => updateSignatory(sig.id, "name", e.target.value)}
                        placeholder="Nome completo"
                        readOnly={!sig.isNew || sig.isLoggedUser}
                        className={cn("h-9 text-sm", (!sig.isNew || sig.isLoggedUser) && "bg-muted")}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">E-mail *</Label>
                      <Input
                        value={sig.email}
                        onChange={(e) => updateSignatory(sig.id, "email", e.target.value)}
                        placeholder="email@empresa.com"
                        readOnly={!sig.isNew || sig.isLoggedUser}
                        className={cn("h-9 text-sm", (!sig.isNew || sig.isLoggedUser) && "bg-muted")}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Celular</Label>
                      <Input
                        value={sig.phone}
                        onChange={(e) => updateSignatory(sig.id, "phone", e.target.value)}
                        placeholder="(00) 00000-0000"
                        readOnly={!sig.isNew}
                        className={cn("h-9 text-sm", !sig.isNew && "bg-muted")}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Função</Label>
                      <Select
                        value={sig.role}
                        onValueChange={(v) => updateSignatory(sig.id, "role", v)}
                      >
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
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
          ) : (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum signatário adicionado</p>
              <Button variant="outline" size="sm" className="mt-3 h-8 text-xs" onClick={addNewSignatory}>
                <Plus className="mr-1.5 h-3 w-3" />
                Adicionar Signatário
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    );
  }

  // ─── Step 2: Mensagem ─────────────────────────────────────────────
  function renderMensagem() {
    return (
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6 max-w-2xl mx-auto">
          <div>
            <h3 className="text-base font-semibold text-foreground mb-1">Conteúdo da comunicação</h3>
            <p className="text-sm text-muted-foreground">
              Defina o assunto e a mensagem que será enviada junto ao envelope de assinatura.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-5 space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Assunto do e-mail *</Label>
                <span className={cn(
                  "text-[10px] font-mono",
                  emailSubject.length > 60 ? "text-destructive" : "text-muted-foreground"
                )}>
                  {emailSubject.length}/60
                </span>
              </div>
              <Input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Assunto do e-mail"
                maxLength={60}
                className="text-sm"
              />
              {emailSubject.length > 60 && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  O assunto deve ter no máximo 60 caracteres (exigência do TAE)
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Corpo da mensagem</Label>
              <Textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                placeholder="Mensagem que acompanha o envelope..."
                rows={8}
                className="text-sm resize-none"
              />
              <p className="text-[11px] text-muted-foreground">
                Esta mensagem será enviada aos destinatários junto com o link para assinatura.
              </p>
            </div>
          </div>
        </div>
      </ScrollArea>
    );
  }

  // ─── Step 3: Documentos (split view) ──────────────────────────────
  function renderDocumentos() {
    return (
      <div className="flex-1 min-h-0 flex">
        {/* Left: document list */}
        <div className="w-[42%] min-w-[320px] border-r border-border flex flex-col">
          <div className="px-5 pt-5 pb-3">
            <h3 className="text-base font-semibold text-foreground mb-1">Documentos do envelope</h3>
            <p className="text-xs text-muted-foreground">
              Confira os documentos que serão enviados. A proposta é obrigatória.
            </p>
          </div>
          <ScrollArea className="flex-1">
            <div className="px-5 pb-5 space-y-2">
              {loadingDocs ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center">
                  <p className="text-sm text-muted-foreground">Carregando documentos...</p>
                </div>
              ) : envelopeDocs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center">
                  <FileQuestion className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm font-medium text-muted-foreground">Nenhum documento encontrado</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Gere a proposta primeiro.</p>
                </div>
              ) : (
                envelopeDocs.map((doc) => {
                  const isActive = doc.id === activeDocId;
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => setActiveDocId(doc.id)}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-lg border px-3.5 py-3 transition-all text-left group",
                        doc.hasWarning
                          ? "border-destructive/40 bg-destructive/5"
                          : isActive
                          ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                          : doc.selected
                          ? "border-border bg-card hover:border-primary/30 hover:bg-primary/[0.02]"
                          : "border-border bg-muted/30 opacity-60 hover:opacity-80"
                      )}
                    >
                      <div onClick={(e) => { e.stopPropagation(); toggleDocSelected(doc.id); }}>
                        <Checkbox
                          checked={doc.selected}
                          disabled={doc.mandatory}
                          className={doc.mandatory ? "opacity-60" : ""}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {doc.origin === "Proposta" ? (
                            <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
                          ) : (
                            <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          )}
                          <span className="text-sm font-medium text-foreground truncate">{doc.name}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-muted-foreground">{doc.origin}</span>
                          {doc.mandatory && (
                            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                              <Lock className="h-2.5 w-2.5" /> Obrigatório
                            </span>
                          )}
                        </div>
                        {doc.hasWarning && (
                          <div className="flex items-center gap-1 mt-1">
                            <AlertTriangle className="h-3 w-3 text-destructive" />
                            <span className="text-[11px] text-destructive">{doc.warningMessage}</span>
                          </div>
                        )}
                      </div>
                      {isActive ? (
                        <Eye className="h-4 w-4 text-primary shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground transition-colors" />
                      )}
                    </button>
                  );
                })
              )}

              {!loadingDocs && !projectInfo && envelopeDocs.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
                  <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    Nenhum projeto vinculado a esta oportunidade. Anexos de escopo não serão incluídos.
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right: preview */}
        <div className="flex-1 flex flex-col bg-muted/20">
          {activeDoc && (
            <div className="shrink-0 px-5 py-3 border-b border-border bg-card/50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Eye className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-medium text-foreground truncate">{activeDoc.name}</span>
                <Badge
                  variant={activeDoc.origin === "Proposta" ? "default" : "outline"}
                  className="text-[10px] px-1.5 py-0 shrink-0"
                >
                  {activeDoc.origin}
                </Badge>
              </div>
              {activeDoc.fileUrl && (
                <a href={activeDoc.fileUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                    <ExternalLink className="h-3 w-3" />
                    Abrir
                  </Button>
                </a>
              )}
            </div>
          )}
          <div className="flex-1 min-h-0">
            {!activeDoc ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <FileText className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Selecione um documento para visualizar</p>
                </div>
              </div>
            ) : previewUrl ? (
              <iframe
                key={activeDocId}
                src={previewUrl}
                className="w-full h-full border-0"
                title={`Preview: ${activeDoc.name}`}
                sandbox="allow-scripts allow-same-origin allow-popups"
              />
            ) : (
              <div className="h-full flex items-center justify-center p-8">
                <div className="text-center max-w-sm">
                  <div className="mx-auto mb-4 h-16 w-16 rounded-xl bg-muted/50 flex items-center justify-center">
                    <FileQuestion className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">Preview indisponível</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Não foi possível gerar a pré-visualização deste documento.
                  </p>
                  {activeDoc.fileUrl && (
                    <a href={activeDoc.fileUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Abrir no Drive
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Step 4: Revisão ──────────────────────────────────────────────
  function renderRevisao() {
    const selectedDocs = envelopeDocs.filter((d) => d.selected);

    return (
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-5 max-w-3xl mx-auto">
          <div>
            <h3 className="text-base font-semibold text-foreground mb-1">Conferência final</h3>
            <p className="text-sm text-muted-foreground">
              Revise todas as informações antes de enviar o envelope para assinatura eletrônica.
            </p>
          </div>

          {/* Context */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Oportunidade</h4>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">Proposta</span>
                <p className="font-medium text-foreground">{proposal?.number}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Cliente</span>
                <p className="font-medium text-foreground">{clientName}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Projeto</span>
                <p className="font-medium text-foreground">{projectInfo?.product || "—"}</p>
              </div>
            </div>
          </div>

          {/* Signatories - BEFORE message, matching step order */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Signatários ({signatories.length})
              </h4>
              <Button variant="ghost" size="sm" className="h-6 text-xs text-primary" onClick={() => setCurrentStep(0)}>
                Editar
              </Button>
            </div>
            <div className="space-y-1.5">
              {signatories.map((sig) => (
                <div key={sig.id} className="flex items-center gap-3 text-sm">
                  <div className={cn(
                    "h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0",
                    sig.isLoggedUser ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  )}>
                    {sig.name.charAt(0).toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{sig.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{sig.email}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">{sig.role}</Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Email */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mensagem</h4>
              <Button variant="ghost" size="sm" className="h-6 text-xs text-primary" onClick={() => setCurrentStep(1)}>
                Editar
              </Button>
            </div>
            <div className="text-sm">
              <p className="text-muted-foreground text-xs">Assunto</p>
              <p className="font-medium text-foreground">{emailSubject}</p>
            </div>
            <div className="text-sm">
              <p className="text-muted-foreground text-xs">Corpo</p>
              <p className="text-foreground text-xs whitespace-pre-line line-clamp-3">{emailBody}</p>
            </div>
          </div>

          {/* Documents */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Documentos ({selectedDocs.length})
              </h4>
              <Button variant="ghost" size="sm" className="h-6 text-xs text-primary" onClick={() => setCurrentStep(2)}>
                Editar
              </Button>
            </div>
            <div className="space-y-1.5">
              {selectedDocs.map((doc) => (
                <div key={doc.id} className="flex items-center gap-2 text-sm">
                  {doc.origin === "Proposta" ? (
                    <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
                  ) : (
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-foreground truncate">{doc.name}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 ml-auto">{doc.origin}</Badge>
                  {doc.mandatory && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[95vw] w-[1100px] max-h-[92vh] flex flex-col gap-0 p-0">
        {/* Header */}
        <div className="shrink-0 px-6 pt-5 pb-4 space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-lg">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
                <Send className="h-4 w-4 text-primary" />
              </div>
              Enviar para Assinatura
            </DialogTitle>
            <DialogDescription className="text-sm mt-1">
              Proposta <span className="font-medium text-foreground">{proposal?.number}</span> · {clientName}
            </DialogDescription>
          </DialogHeader>

          {/* Stepper */}
          {renderStepper()}
        </div>

        <Separator />

        {/* Step Content */}
        <div className="flex-1 min-h-0 flex flex-col">
          {currentStep === 0 && renderSignatarios()}
          {currentStep === 1 && renderMensagem()}
          {currentStep === 2 && renderDocumentos()}
          {currentStep === 3 && renderRevisao()}
        </div>

        {/* Footer */}
        <Separator />
        <div className="shrink-0 flex items-center justify-between px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <div className="flex gap-2">
            {currentStep > 0 && (
              <Button variant="outline" onClick={handlePrev}>
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Anterior
              </Button>
            )}
            {currentStep < 3 ? (
              <Button onClick={handleNext}>
                Próximo
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleSend} disabled={sending}>
                <Send className="mr-2 h-4 w-4" />
                {sending ? "Enviando..." : "Enviar para Assinatura"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
