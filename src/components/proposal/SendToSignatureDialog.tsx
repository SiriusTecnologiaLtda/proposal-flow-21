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
  Check, Mail, ClipboardList, ArrowLeft, ArrowRight, Sparkles, X,
  ZoomIn, ZoomOut, Maximize2, Minimize2
} from "lucide-react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
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
        .eq("contact_type", "tae")
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

        // Log failure event
        await supabase.from("signature_events" as any).insert({
          signature_id: sigRecord.id,
          proposal_id: proposal.id,
          event_type: "cancelled",
          title: "Falha no envio ao TAE",
          description: taeData.logs?.filter((l: any) => l.status === "error").map((l: any) => l.message).join("; ") || "Erro desconhecido",
        });

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

        // Log sent event
        await supabase.from("signature_events" as any).insert({
          signature_id: sigRecord.id,
          proposal_id: proposal.id,
          event_type: "sent",
          title: "Enviado para assinatura",
          description: `Envelope enviado ao TAE com ${signatories.length} signatário(s) e ${selectedDocsCount} documento(s).`,
        });

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

  const progress = useMemo(() => ((currentStep + 1) / STEPS.length) * 100, [currentStep]);

  // ─── Step 1: Signatários ──────────────────────────────────────────
  function renderSignatariosPage() {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm overflow-hidden">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Users className="h-3.5 w-3.5 text-primary" />
            </div>
            Quem irá assinar?
          </div>
          <p className="text-sm text-muted-foreground mb-5">
            Defina os participantes do processo de assinatura. Ao menos um signatário é obrigatório.
          </p>

          {/* Contact selection */}
          <div className="rounded-xl border border-border bg-gradient-to-r from-accent/50 to-transparent p-4 space-y-3 mb-5">
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
            <div ref={scrollRef} className="space-y-3">
              {signatories.map((sig, idx) => (
                <div
                  key={sig.id}
                  data-sig-id={sig.id}
                  className={cn(
                    "rounded-xl border p-4 space-y-3",
                    sig.isLoggedUser
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-gradient-to-r from-accent/30 to-transparent"
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
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeSignatory(sig.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-3 grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Nome *</Label>
                      <Input value={sig.name} onChange={(e) => updateSignatory(sig.id, "name", e.target.value)} placeholder="Nome completo" readOnly={!sig.isNew || sig.isLoggedUser} className={cn("h-9 text-sm", (!sig.isNew || sig.isLoggedUser) && "bg-muted")} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">E-mail *</Label>
                      <Input value={sig.email} onChange={(e) => updateSignatory(sig.id, "email", e.target.value)} placeholder="email@empresa.com" readOnly={!sig.isNew || sig.isLoggedUser} className={cn("h-9 text-sm", (!sig.isNew || sig.isLoggedUser) && "bg-muted")} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Celular</Label>
                      <Input value={sig.phone} onChange={(e) => updateSignatory(sig.id, "phone", e.target.value)} placeholder="(00) 00000-0000" readOnly={!sig.isNew} className={cn("h-9 text-sm", !sig.isNew && "bg-muted")} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Função</Label>
                      <Select value={sig.role} onValueChange={(v) => updateSignatory(sig.id, "role", v)}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum signatário adicionado</p>
              <Button variant="outline" size="sm" className="mt-3 h-8 text-xs" onClick={addNewSignatory}>
                <Plus className="mr-1.5 h-3 w-3" /> Adicionar Signatário
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Step 2: Mensagem ─────────────────────────────────────────────
  function renderMensagemPage() {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm overflow-hidden">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Mail className="h-3.5 w-3.5 text-primary" />
            </div>
            Conteúdo da comunicação
          </div>
          <p className="text-sm text-muted-foreground mb-5">
            Defina o assunto e a mensagem que será enviada junto ao envelope de assinatura.
          </p>

          <div className="space-y-5">
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
                className="text-sm resize-y"
              />
              <p className="text-[11px] text-muted-foreground">
                Esta mensagem será enviada aos destinatários junto com o link para assinatura.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const [previewZoom, setPreviewZoom] = useState(100);
  const [previewDialogDoc, setPreviewDialogDoc] = useState<EnvelopeDoc | null>(null);
  const [previewDialogSize, setPreviewDialogSize] = useState<"default" | "full">("default");

  function openDocPreview(doc: EnvelopeDoc) {
    setPreviewZoom(100);
    setPreviewDialogSize("default");
    setPreviewDialogDoc(doc);
  }

  function renderDocumentosPage() {
    const zoomIn = () => setPreviewZoom((z) => Math.min(z + 25, 200));
    const zoomOut = () => setPreviewZoom((z) => Math.max(z - 25, 50));
    const zoomReset = () => setPreviewZoom(100);

    const pDoc = previewDialogDoc;
    const pUrl = pDoc ? buildPreviewUrl(pDoc) : null;

    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 pt-5 pb-3 shrink-0">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                </div>
                Documentos do envelope
              </div>
              <p className="text-sm text-muted-foreground">
                Confira os documentos que serão enviados. A proposta é obrigatória. Clique no ícone de visualização para pré-visualizar.
              </p>
            </div>
          </div>

          <div className="border-t border-border">
            <ScrollArea className="max-h-[calc(100vh-480px)]">
              <div className="p-4 space-y-2">
                {loadingDocs ? (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center">
                    <p className="text-sm text-muted-foreground">Carregando documentos...</p>
                  </div>
                ) : envelopeDocs.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center">
                    <FileQuestion className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm font-medium text-muted-foreground">Nenhum documento encontrado</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Gere a proposta primeiro.</p>
                  </div>
                ) : (
                  envelopeDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-all text-left",
                        doc.hasWarning
                          ? "border-destructive/40 bg-destructive/5"
                          : doc.selected
                          ? "border-border bg-gradient-to-r from-accent/30 to-transparent"
                          : "border-border bg-muted/30 opacity-60"
                      )}
                    >
                      <div onClick={(e) => { e.stopPropagation(); toggleDocSelected(doc.id); }}>
                        <Checkbox checked={doc.selected} disabled={doc.mandatory} className={doc.mandatory ? "opacity-60" : ""} />
                      </div>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {doc.origin === "Proposta" ? (
                            <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
                          ) : (
                            <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          )}
                          <span className="text-sm font-medium text-foreground truncate min-w-0">{doc.name}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary"
                        onClick={() => openDocPreview(doc)}
                        title="Visualizar documento"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}

                {!loadingDocs && !projectInfo && envelopeDocs.length > 0 && (
                  <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3">
                    <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">
                      Nenhum projeto vinculado a esta oportunidade. Anexos de escopo não serão incluídos.
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Preview Dialog */}
        {pDoc && (
          <div
            className={cn(
              "fixed inset-0 z-[60] flex items-center justify-center bg-black/60",
              previewDialogSize === "full" ? "" : ""
            )}
            onClick={() => setPreviewDialogDoc(null)}
          >
            <div
              className={cn(
                "bg-background border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden",
                previewDialogSize === "full"
                  ? "w-[calc(100vw-40px)] h-[calc(100vh-40px)]"
                  : "w-[80vw] max-w-4xl h-[75vh]"
              )}
              onClick={(e) => e.stopPropagation()}
              style={{ resize: previewDialogSize === "default" ? "both" : undefined, minWidth: 400, minHeight: 300 }}
            >
              {/* Toolbar */}
              <div className="shrink-0 px-4 py-2.5 border-b border-border bg-card flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Eye className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm font-medium text-foreground truncate">{pDoc.name}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomOut} title="Diminuir zoom">
                    <ZoomOut className="h-3.5 w-3.5" />
                  </Button>
                  <button onClick={zoomReset} className="text-[11px] font-medium text-muted-foreground hover:text-foreground min-w-[40px] text-center transition-colors">
                    {previewZoom}%
                  </button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomIn} title="Aumentar zoom">
                    <ZoomIn className="h-3.5 w-3.5" />
                  </Button>
                  <Separator orientation="vertical" className="h-4 mx-1" />
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => setPreviewDialogSize(previewDialogSize === "full" ? "default" : "full")}
                    title={previewDialogSize === "full" ? "Restaurar" : "Maximizar"}
                  >
                    {previewDialogSize === "full" ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                  </Button>
                  {pDoc.fileUrl && (
                    <a href={pDoc.fileUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Abrir externamente">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                  )}
                  <Separator orientation="vertical" className="h-4 mx-1" />
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPreviewDialogDoc(null)} title="Fechar">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {/* Content */}
              <div className="flex-1 min-h-0 overflow-auto bg-muted/20">
                {pUrl ? (
                  <iframe
                    key={pDoc.id}
                    src={pUrl}
                    className="border-0 w-full h-full"
                    style={{ minWidth: `${previewZoom}%`, minHeight: `${previewZoom}%` }}
                    title={`Preview: ${pDoc.name}`}
                    sandbox="allow-scripts allow-same-origin allow-popups"
                  />
                ) : (
                  <div className="h-full flex items-center justify-center p-8">
                    <div className="text-center max-w-sm">
                      <div className="mx-auto mb-4 h-16 w-16 rounded-xl bg-muted/50 flex items-center justify-center">
                        <FileQuestion className="h-8 w-8 text-muted-foreground/40" />
                      </div>
                      <p className="text-sm font-medium text-foreground mb-1">Preview indisponível</p>
                      <p className="text-xs text-muted-foreground mb-4">Não foi possível gerar a pré-visualização.</p>
                      {pDoc.fileUrl && (
                        <a href={pDoc.fileUrl} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm" className="gap-1.5">
                            <ExternalLink className="h-3.5 w-3.5" /> Abrir no Drive
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Step 4: Revisão ──────────────────────────────────────────────
  function renderRevisaoPage() {
    const selectedDocs = envelopeDocs.filter((d) => d.selected);

    return (
      <div className="space-y-5">
        {/* Context */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm overflow-hidden">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            </div>
            Conferência final
          </div>
          <p className="text-sm text-muted-foreground mb-5">
            Revise todas as informações antes de enviar o envelope para assinatura eletrônica.
          </p>

          <div className="rounded-xl border border-border bg-gradient-to-r from-accent/50 to-transparent p-4">
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
        </div>

        {/* Signatories */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <Users className="h-3.5 w-3.5 text-primary" />
              </div>
              Signatários ({signatories.length})
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={() => setCurrentStep(0)}>
              Editar
            </Button>
          </div>
          <div className="space-y-2">
            {signatories.map((sig) => (
              <div key={sig.id} className="flex items-center gap-3 text-sm rounded-xl border border-border bg-gradient-to-r from-accent/30 to-transparent px-3 py-2.5">
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
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <Mail className="h-3.5 w-3.5 text-primary" />
              </div>
              Mensagem
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={() => setCurrentStep(1)}>
              Editar
            </Button>
          </div>
          <div className="space-y-3">
            <div className="text-sm">
              <p className="text-muted-foreground text-xs mb-0.5">Assunto</p>
              <p className="font-medium text-foreground">{emailSubject}</p>
            </div>
            <div className="text-sm">
              <p className="text-muted-foreground text-xs mb-0.5">Corpo</p>
              <p className="text-foreground text-xs whitespace-pre-line line-clamp-4">{emailBody}</p>
            </div>
          </div>
        </div>

        {/* Documents */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="h-3.5 w-3.5 text-primary" />
              </div>
              Documentos ({selectedDocs.length})
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={() => setCurrentStep(2)}>
              Editar
            </Button>
          </div>
          <div className="space-y-2">
            {selectedDocs.map((doc) => (
              <div key={doc.id} className="flex items-center gap-2 text-sm rounded-xl border border-border bg-gradient-to-r from-accent/30 to-transparent px-3 py-2.5">
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
    );
  }

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[92vw] lg:max-w-[80vw] xl:max-w-[70vw] p-0 flex flex-col gap-0 overflow-hidden [&>button]:hidden">
        {/* Scrollable content area */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="mx-auto max-w-5xl space-y-5 p-5 pb-28">
            {/* ─── Hero Header (same as ProposalCreate) ──────────────── */}
            <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-r from-[hsl(var(--hero-from))] via-[hsl(var(--hero-via))] to-[hsl(var(--hero-to))] p-5 text-white shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => onOpenChange(false)}
                    className="mt-1 rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight">
                      Enviar para Assinatura
                    </h1>
                    <p className="mt-1 text-sm text-white/70">
                      {proposal?.number || ""}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[
                    ["Proposta", proposal?.number || "—"],
                    ["Cliente", clientName],
                    ["Projeto", projectInfo?.product || "—"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-white/10 px-3 py-2 backdrop-blur-sm">
                      <div className="text-[10px] font-medium uppercase tracking-wider text-white/50">{label}</div>
                      <div className="mt-0.5 truncate text-sm font-semibold">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ─── Step Navigator (same as ProposalCreate) ───────────── */}
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Etapa <span className="font-semibold text-foreground">{currentStep + 1}</span> de {STEPS.length}
                </div>
                <Badge variant="secondary" className="rounded-full text-xs">
                  {Math.round(progress)}% concluído
                </Badge>
              </div>
              <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {STEPS.map((step) => {
                  const Icon = step.icon;
                  const active = step.id === currentStep;
                  const completed = step.id < currentStep;
                  return (
                    <button
                      key={step.id}
                      onClick={() => { if (step.id <= currentStep) setCurrentStep(step.id); }}
                      className={cn(
                        "group flex items-center gap-3 rounded-xl border p-3 text-left transition-all duration-200",
                        active
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : completed
                          ? "border-primary/20 bg-primary/5 text-foreground hover:border-primary/40 cursor-pointer"
                          : "border-border bg-card text-muted-foreground cursor-default"
                      )}
                    >
                      <div className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                        active ? "bg-white/20" : completed ? "bg-primary/10" : "bg-muted"
                      )}>
                        {completed ? <Check className="h-4 w-4 text-primary" /> : <Icon className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{step.label}</div>
                        <div className={cn("text-[11px]", active ? "text-white/70" : "text-muted-foreground")}>
                          {active ? "Etapa atual" : completed ? "Concluída" : "Pendente"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ─── Step Content ───────────────────────────────────────── */}
            {currentStep === 0 && renderSignatariosPage()}
            {currentStep === 1 && renderMensagemPage()}
            {currentStep === 3 && renderRevisaoPage()}
          </div>
          {/* Documents step rendered outside max-w-5xl for full width */}
          {currentStep === 2 && (
            <div className="px-5 pb-28">
              {renderDocumentosPage()}
            </div>
          )}
        </ScrollArea>

        {/* ─── Fixed Footer ──────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-border bg-card px-6 py-4 flex items-center justify-between">
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
      </SheetContent>
    </Sheet>
  );
}
