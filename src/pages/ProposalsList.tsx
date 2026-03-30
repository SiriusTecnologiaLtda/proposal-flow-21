import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Search, FileText, MoreHorizontal, Edit2, Trash2, Copy, Ban, Trophy, Eye, Loader2, CheckCircle2, XCircle, Info, FolderOpen, Star, FileCheck, Send, XSquare, ClipboardList, ShieldCheck, PenLine, MessageSquare, Mail, AlertTriangle, ExternalLink, Users, History, Calendar, SlidersHorizontal, CalendarRange, X, ChevronDown, ChevronUp, HardHat, UserPlus, Paperclip, Upload, Download } from "lucide-react";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear, isWithinInterval, parseISO } from "date-fns";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useProposals, useDeleteProposal, useUpdateProposalStatus, useUnits } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import SendToSignatureDialog from "@/components/proposal/SendToSignatureDialog";
import SignatureMonitorDialog from "@/components/proposal/SignatureMonitorDialog";
import DocumentManagementDialog from "@/components/proposal/DocumentManagementDialog";

const statusMap: Record<string, { label: string; className: string; icon?: React.ReactNode }> = {
  pendente: { label: "Pendente", className: "bg-muted text-muted-foreground" },
  em_analise_ev: { label: "Em Revisão", className: "bg-warning/15 text-warning", icon: <HardHat className="h-3.5 w-3.5" /> },
  analise_ev_concluida: { label: "Revisado", className: "bg-success/15 text-success", icon: <HardHat className="h-3.5 w-3.5" /> },
  proposta_gerada: { label: "Pendente", className: "bg-muted text-muted-foreground" },
  em_assinatura: { label: "Em Assinatura", className: "bg-warning/15 text-warning" },
  ganha: { label: "Ganha", className: "bg-success/15 text-success" },
  cancelada: { label: "Cancelada", className: "bg-destructive/15 text-destructive" },
};

const typeMap: Record<string, string> = {
  projeto: "Projeto",
  banco_de_horas: "Banco de Horas",
};

function roundUpFactor(val: number, factor: number): number {
  if (factor <= 0) return val;
  return Math.ceil(val / factor) * factor;
}

function computeNetValue(proposal: any, units: any[], proposalTypes: any[]): number | null {
  const scopeItems = proposal.proposal_scope_items;
  if (!scopeItems || scopeItems.length === 0) return null;

  const typeConfig = proposalTypes.find((pt: any) => pt.slug === proposal.type);
  const roundingFactor = typeConfig?.rounding_factor || 8;

  const totalHours = roundUpFactor(
    scopeItems
      .filter((item: any) => item.included && item.parent_id)
      .reduce((sum: number, item: any) => sum + (item.hours || 0), 0),
    roundingFactor
  );

  const gpHours = roundUpFactor(Math.ceil(totalHours * (proposal.gp_percentage / 100)), roundingFactor);
  return (totalHours + gpHours) * proposal.hourly_rate;
}


export default function ProposalsList() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);
  const [visibleCount, setVisibleCount] = useState(50);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [periodFilter, setPeriodFilter] = useState<string>("este_ano");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { data: proposals = [] } = useProposals();
  const { data: units = [] } = useUnits();

  const { data: proposalTypes = [] } = useQuery({
    queryKey: ["proposal_types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("proposal_types").select("*").order("name");
      if (error) throw error;
      return data as any[];
    },
    staleTime: 5 * 60 * 1000,
  });
  const { user } = useAuth();
  const { role: userRole } = useUserRole();
  const queryClient = useQueryClient();
  const deleteProposal = useDeleteProposal();
  const updateStatus = useUpdateProposalStatus();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const isConsulta = userRole === "consulta";
  const isArquiteto = userRole === "arquiteto";

  // For consulta role: load allowed unit IDs
  const { data: userUnitIds = [] } = useQuery({
    queryKey: ["my-unit-access", user?.id],
    enabled: isConsulta && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("user_unit_access").select("unit_id").eq("user_id", user!.id);
      return (data || []).map((r: any) => r.unit_id as string);
    },
  });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelEvId, setCancelEvId] = useState<string | null>(null);
  const [cancelEvLoading, setCancelEvLoading] = useState(false);
  const [winId, setWinId] = useState<string | null>(null);
  const [winCloseDate, setWinCloseDate] = useState("");
  const [signatureProposal, setSignatureProposal] = useState<any>(null);
  const [cancelSignatureId, setCancelSignatureId] = useState<string | null>(null);
  const [monitorProposal, setMonitorProposal] = useState<any>(null);
  const [changeLogOpen, setChangeLogOpen] = useState(false);
  const [changeLogProposalId, setChangeLogProposalId] = useState<string | null>(null);
  const [editDatesProposal, setEditDatesProposal] = useState<any>(null);
  const [editDateValidity, setEditDateValidity] = useState("");
  const [editExpectedClose, setEditExpectedClose] = useState("");
  const [changeLogEntries, setChangeLogEntries] = useState<any[]>([]);
  const [changeLogLoading, setChangeLogLoading] = useState(false);

  // Track which proposals are currently generating docs (proposalId -> docType)
  const [generatingDocs, setGeneratingDocs] = useState<Record<string, "proposta" | "mit">>({});

  // Gmail auth state
  const [gmailAuthorized, setGmailAuthorized] = useState<boolean | null>(null);
  const [gmailAuthLoading, setGmailAuthLoading] = useState(false);

  // Check Gmail authorization on mount
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("gmail_refresh_token")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        setGmailAuthorized(!!data?.gmail_refresh_token);
      });
  }, [user]);

  // Realtime: subscribe to proposals & proposal_signatures changes
  useEffect(() => {
    const statusLabels: Record<string, string> = {
      ganha: "Ganha",
      cancelada: "Cancelada",
      em_assinatura: "Em Assinatura",
      proposta_gerada: "Pendente",
      pendente: "Pendente",
      em_analise_ev: "Em Revisão",
      analise_ev_concluida: "Revisado",
    };

    const channel = supabase
      .channel("proposals-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "proposals" },
        (payload) => {
          const oldStatus = (payload.old as any)?.status;
          const newStatus = (payload.new as any)?.status;
          const number = (payload.new as any)?.number || "";
          if (oldStatus && newStatus && oldStatus !== newStatus) {
            toast({
              title: `Oportunidade ${number} atualizada`,
              description: `Status alterado para: ${statusLabels[newStatus] || newStatus}`,
            });
          }
          queryClient.invalidateQueries({ queryKey: ["proposals"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "proposal_signatures" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["proposals"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, toast]);

  // Listen for Gmail OAuth callback
  const handleGmailOAuthMessage = useCallback(
    async (event: MessageEvent) => {
      if (event.data?.type !== "google-oauth-callback" || event.data?.flow !== "user-gmail") return;
      const { code, error } = event.data;
      if (error || !code) {
        toast({ title: "Autorização cancelada", description: error || "Nenhum código recebido", variant: "destructive" });
        setGmailAuthLoading(false);
        return;
      }
      try {
        setGmailAuthLoading(true);
        const session = (await supabase.auth.getSession()).data.session;
        const OAUTH_CALLBACK_PATH = "/oauth/google/callback";
        const redirectUri = `${window.location.origin}${OAUTH_CALLBACK_PATH}`;
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/user-gmail-oauth-exchange`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({ code, redirectUri }),
          }
        );
        const data = await res.json();
        if (res.ok && data.success) {
          setGmailAuthorized(true);
          toast({ title: "Email autorizado!", description: data.message });
        } else {
          toast({ title: "Erro na autorização", description: data.error, variant: "destructive" });
        }
      } catch (err: any) {
        toast({ title: "Erro", description: err.message, variant: "destructive" });
      } finally {
        setGmailAuthLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    window.addEventListener("message", handleGmailOAuthMessage);
    return () => window.removeEventListener("message", handleGmailOAuthMessage);
  }, [handleGmailOAuthMessage]);

  function startUserGmailAuth() {
    setGmailAuthLoading(true);
    // Use the same OAuth client from default google integration
    supabase
      .from("google_integrations")
      .select("oauth_client_id")
      .eq("is_default", true)
      .single()
      .then(({ data, error }) => {
        if (error || !data?.oauth_client_id) {
          toast({ title: "Erro", description: "Integração Google OAuth2 padrão não configurada.", variant: "destructive" });
          setGmailAuthLoading(false);
          return;
        }
        const OAUTH_CALLBACK_PATH = "/oauth/google/callback";
        const redirectUri = `${window.location.origin}${OAUTH_CALLBACK_PATH}`;
        const statePayload = btoa(JSON.stringify({ flow: "user-gmail", openerOrigin: window.location.origin }));
        const params = new URLSearchParams({
          client_id: data.oauth_client_id,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: "https://www.googleapis.com/auth/gmail.send",
          access_type: "offline",
          prompt: "consent",
          state: statePayload,
          login_hint: user?.email || "",
        });
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        const popup = window.open(authUrl, "gmail-user-oauth", `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`);
        if (!popup) {
          window.open(authUrl, "_blank");
          toast({ title: "Popup bloqueado", description: "Autorize na nova aba e volte.", variant: "default" });
        }
      });
  }

  // Notification dialog state
  const [notifDialogOpen, setNotifDialogOpen] = useState(false);
  const [notifType, setNotifType] = useState<"solicitar_ajuste" | "notificar_esn">("solicitar_ajuste");
  const [notifProposal, setNotifProposal] = useState<any>(null);
  const [notifMessage, setNotifMessage] = useState("");
  const [notifSubject, setNotifSubject] = useState("");
  const [notifSending, setNotifSending] = useState(false);
  const [notifCcEmails, setNotifCcEmails] = useState<string[]>([]);
  const [notifCcInput, setNotifCcInput] = useState("");

  async function openNotifDialog(proposal: any, type: "solicitar_ajuste" | "notificar_esn") {
    setNotifProposal(proposal);
    setNotifType(type);
    setNotifMessage("");
    setNotifSubject("");
    setNotifCcEmails([]);
    setNotifCcInput("");
    setNotifDialogOpen(true);

    // Load unit email template
    const unitId = (proposal as any).clients?.unit_id || (proposal as any).sales_team?.unit_id;
    if (unitId) {
      const actionType = type === "solicitar_ajuste" ? "solicitar_ev" : "concluir_revisao";
      const { fetchUnitEmailTemplate, replacePlaceholders } = await import("@/hooks/useUnitEmailTemplates");
      const tmpl = await fetchUnitEmailTemplate(unitId, actionType);
      if (tmpl && (tmpl.subject || tmpl.body)) {
        const unitName = units.find((u: any) => u.id === unitId)?.name || "";
        const values = {
          numero: proposal.number,
          cliente: (proposal as any).clients?.name || "",
          unidade: unitName,
          esn: (proposal as any).sales_team?.name || "",
          ev: (proposal as any).arquiteto?.name || "",
          gsn: "", // GSN loaded from proposal if available
          produto: proposal.product || "",
        };
        if (tmpl.subject) setNotifSubject(replacePlaceholders(tmpl.subject, values));
        if (tmpl.body) setNotifMessage(replacePlaceholders(tmpl.body, values));
      }
    }
  }

  function addNotifCcEmail() {
    const email = notifCcInput.trim().toLowerCase();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !notifCcEmails.includes(email)) {
      setNotifCcEmails([...notifCcEmails, email]);
      setNotifCcInput("");
    }
  }

  // Operations notification state (formerly CRA)
  const [craDialogOpen, setCraDialogOpen] = useState(false);
  const [craProposal, setCraProposal] = useState<any>(null);
  const [craMessage, setCraMessage] = useState("");
  const [craSubject, setCraSubject] = useState("");
  const [craSending, setCraSending] = useState(false);
  const [opsRecipients, setOpsRecipients] = useState<Array<{ id?: string; name: string; email: string; fromDb: boolean }>>([]);
  const [opsManualName, setOpsManualName] = useState("");
  const [opsManualEmail, setOpsManualEmail] = useState("");
  const [opsAttachments, setOpsAttachments] = useState<Array<{ name: string; base64: string; mimeType: string }>>([]);
  const [opsAttachSignedDoc, setOpsAttachSignedDoc] = useState(true);
  const [opsAttachMit, setOpsAttachMit] = useState(false);
  const opsFileInputRef = useRef<HTMLInputElement>(null);

  // Load unit operations contacts for the proposal's unit
  async function openCraDialog(proposal: any) {
    setCraProposal(proposal);
    setCraMessage("");
    setCraSubject("");
    setOpsRecipients([]);
    setOpsAttachments([]);
    setOpsManualName("");
    setOpsManualEmail("");
    // Check if signed doc exists
    const latestSigForInit = (proposal as any).proposal_signatures
      ?.filter((s: any) => s.status === "completed" && s.tae_document_id)
      ?.sort((a: any, b: any) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())?.[0];
    setOpsAttachSignedDoc(!!latestSigForInit);
    setOpsAttachMit(false);
    setCraDialogOpen(true);

    // Load operations contacts from the unit
    const unitId = (proposal as any).clients?.unit_id || (proposal as any).sales_team?.unit_id;
    if (unitId) {
      supabase
        .from("unit_contacts")
        .select("id, name, email, phone, contact_type")
        .eq("unit_id", unitId)
        .eq("contact_type", "operacoes")
        .then(({ data }) => {
          if (data && data.length > 0) {
            setOpsRecipients(data.map(c => ({ id: c.id, name: c.name, email: c.email, fromDb: true })));
          }
        });

      // Load email template
      const { fetchUnitEmailTemplate, replacePlaceholders } = await import("@/hooks/useUnitEmailTemplates");
      const tmpl = await fetchUnitEmailTemplate(unitId, "enviar_operacoes");
      if (tmpl && (tmpl.subject || tmpl.body)) {
        const unitName = units.find((u: any) => u.id === unitId)?.name || "";
        const values = {
          numero: proposal.number,
          cliente: (proposal as any).clients?.name || "",
          unidade: unitName,
          esn: (proposal as any).sales_team?.name || "",
          ev: (proposal as any).arquiteto?.name || "",
          gsn: "",
          produto: proposal.product || "",
        };
        if (tmpl.subject) setCraSubject(replacePlaceholders(tmpl.subject, values));
        if (tmpl.body) setCraMessage(replacePlaceholders(tmpl.body, values));
      }
    }
  }

  function addOpsManualRecipient() {
    const email = opsManualEmail.trim();
    const name = opsManualName.trim() || email;
    if (!email || !/\S+@\S+\.\S+/.test(email)) return;
    if (opsRecipients.some(r => r.email.toLowerCase() === email.toLowerCase())) return;
    setOpsRecipients(prev => [...prev, { name, email, fromDb: false }]);
    setOpsManualName("");
    setOpsManualEmail("");
  }

  function removeOpsRecipient(email: string) {
    setOpsRecipients(prev => prev.filter(r => r.email !== email));
  }

  async function handleOpsFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: "Arquivo muito grande", description: `${file.name} excede 10MB`, variant: "destructive" });
        continue;
      }
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(file);
      });
      setOpsAttachments(prev => [...prev, { name: file.name, base64, mimeType: file.type || "application/octet-stream" }]);
    }
    e.target.value = "";
  }

  async function handleSendCraNotification() {
    if (!craProposal || opsRecipients.length === 0) return;

    // Capture state
    const capturedProposal = craProposal;
    const capturedMessage = craMessage;
    const capturedSubject = craSubject;
    const capturedRecipients = [...opsRecipients];
    const capturedAttachments = [...opsAttachments];
    const wantSignedDoc = opsAttachSignedDoc;
    const wantMit = opsAttachMit;

    // Close immediately - background processing
    setCraDialogOpen(false);
    toast({ title: "Processando...", description: "O envio está sendo executado em background. Você será avisado ao concluir." });

    try {
      const session = (await supabase.auth.getSession()).data.session;
      const selectedEmails = capturedRecipients.map(r => ({ email: r.email, name: r.name }));

      // Save new manual recipients to unit_contacts as 'operacoes'
      const unitId = (capturedProposal as any).clients?.unit_id || (capturedProposal as any).sales_team?.unit_id;
      const newManualRecipients = capturedRecipients.filter(r => !r.fromDb);
      if (unitId && newManualRecipients.length > 0) {
        const { data: existing } = await supabase
          .from("unit_contacts")
          .select("email")
          .eq("unit_id", unitId)
          .eq("contact_type", "operacoes");
        const existingEmails = new Set((existing || []).map(e => e.email.toLowerCase()));
        const toInsert = newManualRecipients.filter(r => !existingEmails.has(r.email.toLowerCase()));
        if (toInsert.length > 0) {
          await supabase.from("unit_contacts").insert(
            toInsert.map(r => ({ unit_id: unitId, name: r.name, email: r.email, contact_type: "operacoes", role: "Operações" }))
          );
        }
      }

      // Resolve TAE signed document ID if user wants it
      let taeDocId: string | undefined;
      if (wantSignedDoc) {
        const latestSig = (capturedProposal as any).proposal_signatures
          ?.filter((s: any) => s.status === "completed")
          ?.sort((a: any, b: any) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())?.[0];
        taeDocId = latestSig?.tae_document_id || undefined;
      }

      // Handle MIT-065 if user wants it
      let mitGoogleDocId: string | undefined;
      if (wantMit) {
        // Check if MIT already exists
        const { data: existingMitDocs } = await supabase
          .from("proposal_documents")
          .select("doc_id, doc_url, file_name")
          .eq("proposal_id", capturedProposal.id)
          .eq("doc_type", "mit")
          .order("version", { ascending: false })
          .limit(1);

        let mitDocUrl = existingMitDocs?.[0]?.doc_url;
        let mitDocId = existingMitDocs?.[0]?.doc_id;

        // If no MIT exists, generate it
        if (!mitDocUrl) {
          const mitRes = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-mit-doc`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${session?.access_token}`,
              },
              body: JSON.stringify({ proposalId: capturedProposal.id }),
            }
          );
          const mitData = await mitRes.json();
          if (mitRes.ok && mitData?.docUrl) {
            mitDocUrl = mitData.docUrl;
            queryClient.invalidateQueries({ queryKey: ["proposals"] });
          }
        }

        // Extract Google Doc ID from URL
        if (mitDocUrl) {
          const docIdMatch = mitDocUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
          mitGoogleDocId = docIdMatch?.[1] || mitDocId;
        } else if (mitDocId) {
          mitGoogleDocId = mitDocId;
        }
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-proposal-notification`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            proposalId: capturedProposal.id,
            type: "comunicar_cra",
            message: capturedMessage,
            subject: capturedSubject || undefined,
            proposalLink: `${window.location.origin}/propostas/${capturedProposal.id}`,
            recipients: selectedEmails,
            attachments: capturedAttachments.length > 0 ? capturedAttachments : undefined,
            taeDocumentId: taeDocId,
            mitGoogleDocId,
          }),
        }
      );
      const data = await res.json();
      if (data.error === "gmail_not_authorized") {
        toast({ title: "Autorização necessária", description: "Autorize o envio de emails pela sua conta Google.", variant: "destructive" });
        return;
      }
      if (res.ok && data.success) {
        toast({ title: "Enviado para Operações", description: `Enviado para ${selectedEmails.length} destinatário(s)` });
      } else {
        toast({ title: "Erro ao enviar", description: data.error || "Erro desconhecido", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  }

  const [downloadingTae, setDownloadingTae] = useState<string | null>(null);

  async function handleDownloadTaeSigned(proposal: any) {
    const sigs = (proposal as any).proposal_signatures || [];
    const latestSig = sigs
      .filter((s: any) => s.status === "completed" && s.tae_document_id)
      .sort((a: any, b: any) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())[0];
    if (!latestSig) {
      toast({ title: "Erro", description: "Nenhum documento assinado encontrado", variant: "destructive" });
      return;
    }

    setDownloadingTae(proposal.id);
    toast({ title: "Baixando documento assinado...", description: "Aguarde o download do TAE" });

    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tae-download-signed`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ signatureId: latestSig.id }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao baixar documento");
      }

      // Convert base64 to blob and trigger download
      const byteChars = atob(data.base64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `proposta_${proposal.number}_assinada.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ title: "Download concluído", description: `Documento assinado da proposta ${proposal.number} baixado com sucesso` });
    } catch (err: any) {
      toast({ title: "Erro ao baixar", description: err.message, variant: "destructive" });
    } finally {
      setDownloadingTae(null);
    }
  }

  async function handleSendNotification() {
    if (!notifProposal) return;

    // Capture state before closing
    const capturedProposal = notifProposal;
    const capturedType = notifType;
    const capturedMessage = notifMessage;
    const capturedSubject = notifSubject;
    const capturedCcEmails = [...notifCcEmails];

    // Close immediately and show background toast
    setNotifDialogOpen(false);
    setNotifSending(false);
    toast({ title: "Processando...", description: "A solicitação está sendo executada em background. Você será avisado ao concluir." });

    try {
      // For solicitar_ajuste, create/reopen project BEFORE sending email so edge function can find it
      if (capturedType === "solicitar_ajuste") {
        await supabase.from("proposals").update({ status: "em_analise_ev" } as any).eq("id", capturedProposal.id);

        const { data: existingProjects } = await supabase
          .from("projects")
          .select("id, status, proposal_id, proposal_number")
          .or(`proposal_id.eq.${capturedProposal.id},proposal_number.eq.${capturedProposal.number}`);

        if (existingProjects && existingProjects.length > 0) {
          for (const proj of existingProjects) {
            // Reopen cancelled projects back to em_revisao, skip concluido
            if (proj.status !== "concluido") {
              await supabase
                .from("projects")
                .update({ status: "em_revisao", proposal_id: capturedProposal.id, proposal_number: capturedProposal.number })
                .eq("id", proj.id);
            }
          }
        } else {
          const projectId = crypto.randomUUID();
          await supabase.from("projects").insert({
            id: projectId,
            client_id: capturedProposal.client_id,
            product: capturedProposal.product,
            description: capturedProposal.description || "",
            arquiteto_id: capturedProposal.arquiteto_id,
            created_by: user!.id,
            status: "pendente",
            proposal_id: capturedProposal.id,
            proposal_number: capturedProposal.number,
          } as any);

          // Copy opportunity scope items to the new project so the EV can see and refine them
          try {
            const { data: proposalItems } = await supabase
              .from("proposal_scope_items")
              .select("*")
              .eq("proposal_id", capturedProposal.id);

            if (proposalItems && proposalItems.length > 0) {
              // Build ID mapping (old proposal item ID → new project item ID)
              const idMap = new Map<string, string>();
              for (const item of proposalItems) {
                idMap.set(item.id, crypto.randomUUID());
              }

              // Insert parents first, then children
              const parents = proposalItems.filter(i => !i.parent_id);
              const children = proposalItems.filter(i => i.parent_id);

              const projectItems = [...parents, ...children].map(item => ({
                id: idMap.get(item.id)!,
                project_id: projectId,
                template_id: item.template_id || null,
                parent_id: item.parent_id ? (idMap.get(item.parent_id) || null) : null,
                description: item.description,
                included: item.included,
                hours: item.hours || 0,
                phase: item.phase || 1,
                sort_order: item.sort_order || 0,
                notes: item.notes || "",
              }));

              if (projectItems.length > 0) {
                await supabase.from("project_scope_items").insert(projectItems);
              }

              // Copy group_notes from the proposal to the project, remapping IDs
              const { data: proposalData } = await supabase
                .from("proposals")
                .select("group_notes")
                .eq("id", capturedProposal.id)
                .single();

              const groupNotes = (proposalData?.group_notes as any) || {};
              const oldProcessGroupMap: Record<string, string> = groupNotes._process_group_map || {};
              const oldManualGroups: Record<string, string> = groupNotes._manual_groups || {};
              const oldGroupOrder: string[] = groupNotes._group_order || [];

              // Remap process_group_map keys (old item IDs → new item IDs)
              const newProcessGroupMap: Record<string, string> = {};
              for (const [oldItemId, groupKey] of Object.entries(oldProcessGroupMap)) {
                const newItemId = idMap.get(oldItemId);
                if (newItemId) {
                  newProcessGroupMap[newItemId] = groupKey;
                }
              }

              const projectGroupNotes: Record<string, any> = {
                _manual_groups: oldManualGroups,
                _group_order: oldGroupOrder,
                _process_group_map: newProcessGroupMap,
              };

              await supabase.from("projects").update({ group_notes: projectGroupNotes }).eq("id", projectId);

              // Remove original ESN scope from the opportunity (now lives in the project)
              await supabase.from("proposal_scope_items").delete()
                .eq("proposal_id", capturedProposal.id)
                .is("project_id", null);

              // Clear group_notes from the proposal (scope is now managed by the project)
              await supabase.from("proposals").update({
                group_notes: { _manual_groups: {}, _group_order: [], _process_group_map: {} },
              }).eq("id", capturedProposal.id);
            }
          } catch (scopeCopyErr) {
            console.error("Failed to copy scope to project:", scopeCopyErr);
          }
        }
        queryClient.invalidateQueries({ queryKey: ["projects"] });
      }

      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-proposal-notification`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            proposalId: capturedProposal.id,
            type: capturedType,
            message: capturedMessage,
            subject: capturedSubject || undefined,
            proposalLink: `${window.location.origin}/propostas/${capturedProposal.id}`,
            cc: capturedCcEmails.length > 0 ? capturedCcEmails : undefined,
            _origin: window.location.origin,
          }),
        }
      );
      const data = await res.json();
      if (data.error === "gmail_not_authorized") {
        toast({
          title: "Autorização necessária",
          description: "Você precisa autorizar o envio de emails pela sua conta Google.",
          variant: "destructive",
        });
        return;
      }
      if (res.ok && data.success) {
        if (capturedType === "notificar_esn") {
          await supabase.from("proposals").update({ status: "analise_ev_concluida" } as any).eq("id", capturedProposal.id);
        }
        queryClient.invalidateQueries({ queryKey: ["proposals"] });
        queryClient.invalidateQueries({ queryKey: ["proposal", capturedProposal.id] });
        
        toast({
          title: "Email enviado com sucesso",
          description: `Enviado de ${data.senderEmail} para ${data.recipientName} (${data.recipientEmail})`,
        });
      } else {
        toast({ title: "Erro ao enviar email", description: data.error || "Erro desconhecido", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Erro ao enviar", description: err.message, variant: "destructive" });
    }
  }

  // Console state removed — generation now uses background toasts

  // Versions dialog state
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionsProposalId, setVersionsProposalId] = useState<string | null>(null);
  const [versionsDocType, setVersionsDocType] = useState<string>("proposta");


  // Auto-trigger generation when navigating from ProposalCreate with ?generate=<id>
  useEffect(() => {
    const generateId = searchParams.get("generate");
    if (generateId) {
      searchParams.delete("generate");
      setSearchParams(searchParams, { replace: true });
      handleGenerateDoc(generateId, "proposta");
    }
  }, []);

  async function handleGenerateDoc(proposalId: string, docType: "proposta" | "mit" = "proposta") {
    const docLabel = docType === "mit" ? "MIT-065" : "Proposta";
    
    // Mark as generating
    setGeneratingDocs(prev => ({ ...prev, [proposalId]: docType }));
    
    // Show background processing toast that auto-closes after 4 seconds
    toast({
      title: `Gerando ${docLabel}...`,
      description: "O processo será executado em background. Você será avisado ao concluir.",
      duration: 4000,
    });

    const endpoint = docType === "mit" ? "generate-mit-doc" : "generate-proposal-pdf";

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${endpoint}`,
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

      if (response.ok && data?.docUrl) {
        // Clear needs_regen flag after generating document (no longer changes status)
        const updateFields: Record<string, any> = { needs_regen: false };
        await supabase.from("proposals").update(updateFields as any).eq("id", proposalId);
        queryClient.invalidateQueries({ queryKey: ["proposals"] });
        queryClient.invalidateQueries({ queryKey: ["proposal", proposalId] });

        toast({
          title: `${docLabel} gerada com sucesso!`,
          description: "Clique para abrir o documento.",
          duration: 8000,
          action: (
            <ToastAction altText="Abrir" onClick={() => window.open(data.docUrl, "_blank")}>
              Abrir
            </ToastAction>
          ),
        });
      } else {
        const errorMsg = data?.logs?.find((l: any) => l.status === "error")?.message || data?.error || "Erro desconhecido";
        toast({
          title: `Erro ao gerar ${docLabel}`,
          description: errorMsg,
          variant: "destructive",
          duration: 10000,
        });
      }
    } catch (err: any) {
      toast({
        title: `Erro ao gerar ${docLabel}`,
        description: err.message,
        variant: "destructive",
        duration: 10000,
      });
    } finally {
      setGeneratingDocs(prev => {
        const next = { ...prev };
        delete next[proposalId];
        return next;
      });
    }
  }

  const periodRange = useMemo(() => {
    const now = new Date();
    switch (periodFilter) {
      case "este_mes": return { start: startOfMonth(now), end: endOfMonth(now) };
      case "ultimo_mes": { const prev = subMonths(now, 1); return { start: startOfMonth(prev), end: endOfMonth(prev) }; }
      case "este_trimestre": return { start: startOfQuarter(now), end: endOfQuarter(now) };
      case "este_ano": return { start: startOfYear(now), end: endOfYear(now) };
      case "personalizado": {
        if (customStart && customEnd) return { start: parseISO(customStart), end: parseISO(customEnd) };
        return null;
      }
      default: return null;
    }
  }, [periodFilter, customStart, customEnd]);

  const filtered = useMemo(() => proposals.filter((p) => {
    if (isConsulta) {
      if (p.status !== "ganha") return false;
      const esnUnitId = (p as any).sales_team?.unit_id;
      if (esnUnitId && userUnitIds.length > 0 && !userUnitIds.includes(esnUnitId)) return false;
      if (!esnUnitId && userUnitIds.length > 0) return false;
    }
    if (statusFilter.length > 0 && !statusFilter.includes(p.status)) return false;
    if (periodRange) {
      const closeDate = (p as any).expected_close_date;
      if (!closeDate) return false;
      try {
        const d = parseISO(closeDate);
        if (!isWithinInterval(d, { start: periodRange.start, end: periodRange.end })) return false;
      } catch { return false; }
    }
    if (!debouncedSearch) return true;
    const q = debouncedSearch.toLowerCase();
    const clientName = (p as any).clients?.name || "";
    const desc = (p as any).description || "";
    const esnName = (p as any).sales_team?.name || "";
    return (
      p.number.toLowerCase().includes(q) ||
      clientName.toLowerCase().includes(q) ||
      desc.toLowerCase().includes(q) ||
      esnName.toLowerCase().includes(q)
    );
  }), [proposals, debouncedSearch, statusFilter, periodRange, isConsulta, userUnitIds]);

  // Reset visible count when filters change
  useEffect(() => { setVisibleCount(50); }, [debouncedSearch, statusFilter, periodFilter]);

  const visibleProposals = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMoreProposals = visibleCount < filtered.length;

  // Check for linked projects when deleting
  const deleteProposalData = deleteId ? proposals.find((p: any) => p.id === deleteId) : null;
  const [linkedProjects, setLinkedProjects] = useState<any[]>([]);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (!deleteId) { setLinkedProjects([]); return; }
    supabase
      .from("projects")
      .select("id, product, status, clients(name)")
      .eq("proposal_id", deleteId)
      .then(({ data }) => setLinkedProjects(data || []));
  }, [deleteId]);

  async function handleDelete() {
    if (!deleteId) return;
    setDeleteLoading(true);
    try {
      // Delete linked projects first
      for (const proj of linkedProjects) {
        await supabase.from("project_scope_items").delete().eq("project_id", proj.id);
        await supabase.from("project_attachments").delete().eq("project_id", proj.id);
        await supabase.from("projects").delete().eq("id", proj.id);
      }
      await deleteProposal.mutateAsync(deleteId);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast({ title: "Oportunidade excluída", description: linkedProjects.length > 0 ? `${linkedProjects.length} projeto(s) vinculado(s) também removido(s).` : undefined });
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    }
    setDeleteLoading(false);
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

  async function handleCancelEv() {
    if (!cancelEvId) return;
    setCancelEvLoading(true);
    try {
      const proposal = proposals.find((p: any) => p.id === cancelEvId);
      if (!proposal) throw new Error("Oportunidade não encontrada");

      // Always revert to pendente when cancelling EV
      const newStatus = "pendente";

      // Update proposal status
      await supabase.from("proposals").update({ status: newStatus } as any).eq("id", cancelEvId);

      // Revert active projects back to 'pendente' so the creator can continue editing
      const { data: linkedProjects } = await supabase
        .from("projects")
        .select("id, status")
        .eq("proposal_id", cancelEvId);
      
      if (linkedProjects) {
        for (const proj of linkedProjects) {
          if (proj.status === "pendente" || proj.status === "em_revisao" || proj.status === "concluido") {
            await supabase.from("projects").update({ status: "pendente" }).eq("id", proj.id);
          }
        }
      }

      // Send notification to EV (arquiteto)
      try {
        const session = (await supabase.auth.getSession()).data.session;
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-proposal-notification`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({
              proposalId: cancelEvId,
              type: "cancelar_ev",
              message: "A solicitação de Análise E.V. foi cancelada pelo ESN.",
              proposalLink: `${window.location.origin}/propostas/${cancelEvId}`,
              _origin: window.location.origin,
            }),
          }
        );
      } catch (emailErr) {
        console.error("Falha ao enviar notificação:", emailErr);
      }

      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast({
        title: "Solicitação E.V. cancelada",
        description: "Status revertido para Pendente. Projetos revertidos para Pendente.",
      });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setCancelEvLoading(false);
    setCancelEvId(null);
  }

  async function handleWin() {
    if (!winId || !winCloseDate) return;
    try {
      const { error } = await supabase.from("proposals").update({
        status: "ganha" as any,
        expected_close_date: winCloseDate,
      }).eq("id", winId);
      if (error) throw error;
      await supabase
        .from("commission_projections")
        .update({ proposal_status: "ganha" } as any)
        .eq("proposal_id", winId);
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      toast({ title: "Proposta encerrada como ganha!" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setWinId(null);
    setWinCloseDate("");
  }

  function openEditDates(proposal: any) {
    setEditDatesProposal(proposal);
    setEditDateValidity(proposal.date_validity || "");
    setEditExpectedClose(proposal.expected_close_date || "");
  }

  async function handleSaveDates() {
    if (!editDatesProposal) return;
    try {
      const { error } = await supabase
        .from("proposals")
        .update({
          date_validity: editDateValidity || null,
          expected_close_date: editExpectedClose || null,
        })
        .eq("id", editDatesProposal.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      toast({ title: "Datas atualizadas com sucesso!" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setEditDatesProposal(null);
  }

  async function handleCancelSignature() {
    if (!cancelSignatureId) return;
    try {
      toast({ title: "Cancelando assinatura no TAE..." });
      const { data: { session } } = await supabase.auth.getSession();

      const taeRes = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tae-cancel-signature`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ proposalId: cancelSignatureId }),
        }
      );
      const taeData = await taeRes.json();

      if (!taeRes.ok || taeData.logs?.some((l: any) => l.status === "error")) {
        const errorMsg = taeData.logs?.filter((l: any) => l.status === "error").map((l: any) => l.message).join("; ")
          || "Erro ao cancelar no TAE";
        toast({ title: "Falha no cancelamento", description: errorMsg, variant: "destructive" });
      } else {
        const taeStatus = taeData.taeStatus === "cancelled_in_tae"
          ? "Cancelamento realizado no TAE e localmente."
          : "Cancelamento local realizado. TAE pode requerer cancelamento manual.";
        toast({ title: "Processo de assinatura cancelado", description: taeStatus });
      }

      queryClient.invalidateQueries({ queryKey: ["proposals"] });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setCancelSignatureId(null);
  }

  // queryClient already declared above

  function handleDuplicate(proposal: any) {
    navigate(`/propostas/nova?duplicar=${proposal.id}`);
  }

  async function openChangeLog(proposalId: string) {
    setChangeLogProposalId(proposalId);
    setChangeLogLoading(true);
    setChangeLogOpen(true);
    try {
      const { data, error } = await supabase
        .from("proposal_process_logs")
        .select("*")
        .eq("proposal_id", proposalId)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      setChangeLogEntries(data || []);
    } catch (err: any) {
      toast({ title: "Erro ao carregar log", description: err.message, variant: "destructive" });
      setChangeLogEntries([]);
    }
    setChangeLogLoading(false);
  }



  const isLocked = (status: string) => ["em_assinatura", "ganha", "cancelada"].includes(status);

  function getDocCounts(proposal: any) {
    const docs = (proposal as any).proposal_documents || [];
    const propostas = docs.filter((d: any) => d.doc_type === "proposta").length;
    const mits = docs.filter((d: any) => d.doc_type === "mit").length;
    return { propostas, mits };
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Minhas Oportunidades</h1>
            <p className="text-sm text-muted-foreground">
              {isConsulta ? `${filtered.length} oportunidades ganhas` : `${filtered.length} de ${proposals.length} oportunidades`}
            </p>
          </div>
          {!isConsulta && (
            <Button asChild>
              <Link to="/propostas/nova">
                <Plus className="mr-2 h-4 w-4" />
                Nova Oportunidade
              </Link>
            </Button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por número, cliente ou descrição..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {/* ─── Collapsible Filter Bar ──────────────────────────────── */}
        {(() => {
          const activeFilterCount =
            (statusFilter.length > 0 ? 1 : 0) +
            (periodFilter && periodFilter !== "este_ano" ? 1 : 0);
          return (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <button
                onClick={() => setFiltersOpen(!filtersOpen)}
                className="flex w-full items-center gap-3 bg-accent/30 px-4 py-2.5 transition-colors hover:bg-accent/50"
              >
                <div className="flex items-center gap-2 text-muted-foreground">
                  <SlidersHorizontal className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Filtros</span>
                </div>
                {activeFilterCount > 0 && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {activeFilterCount}
                  </span>
                )}
                <div className="flex-1" />
                {activeFilterCount > 0 && (
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setStatusFilter([]);
                      setPeriodFilter("este_ano");
                      setCustomStart("");
                      setCustomEnd("");
                    }}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="h-3 w-3" />
                    Limpar tudo
                  </span>
                )}
                {filtersOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {filtersOpen && (
                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:flex-wrap sm:items-start">
                  {/* Period */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <CalendarRange className="h-3.5 w-3.5" />
                      <span className="text-[11px] font-medium uppercase tracking-wider">Período</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {([
                        { key: "este_mes", label: "Este mês" },
                        { key: "ultimo_mes", label: "Último mês" },
                        { key: "este_trimestre", label: "Este trimestre" },
                        { key: "este_ano", label: "Este ano" },
                        { key: "personalizado", label: "Personalizado" },
                      ] as const).map(({ key, label }) => (
                        <button
                          key={key}
                          onClick={() => setPeriodFilter(periodFilter === key && key !== "este_ano" ? "" : key)}
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                            periodFilter === key
                              ? "border-primary bg-primary text-primary-foreground shadow-sm"
                              : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {periodFilter === "personalizado" && (
                      <div className="flex items-center gap-2 pt-1">
                        <Input
                          type="date"
                          value={customStart}
                          onChange={(e) => setCustomStart(e.target.value)}
                          className="h-8 w-36 text-xs"
                        />
                        <span className="text-xs text-muted-foreground">até</span>
                        <Input
                          type="date"
                          value={customEnd}
                          onChange={(e) => setCustomEnd(e.target.value)}
                          className="h-8 w-36 text-xs"
                        />
                      </div>
                    )}
                  </div>

                  {/* Divider */}
                  <div className="hidden h-16 w-px self-center bg-border sm:block" />

                  {/* Status */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" />
                      <span className="text-[11px] font-medium uppercase tracking-wider">Status</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(statusMap).filter(([key]) => key !== "proposta_gerada").map(([key, { label, className: statusClassName }]) => {
                        const active = statusFilter.includes(key);
                        return (
                          <button
                            key={key}
                            onClick={() =>
                              setStatusFilter((prev) =>
                                active ? prev.filter((s) => s !== key) : [...prev, key]
                              )
                            }
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                              active
                                ? `${statusClassName} border-current ring-1 ring-current/30`
                                : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="hidden border-b border-border bg-muted/50 px-4 py-2.5 md:grid md:grid-cols-[2fr_1.5fr_auto_auto_1fr_auto_auto_auto_auto_auto] md:gap-3">
            <span className="text-xs font-medium text-muted-foreground">Cliente / Proposta</span>
            <span className="text-xs font-medium text-muted-foreground">Descrição</span>
            <span className="text-xs font-medium text-muted-foreground">Tipo</span>
            <span className="text-xs font-medium text-muted-foreground">Produto</span>
            <span className="text-xs font-medium text-muted-foreground">ESN</span>
            <span className="text-xs font-medium text-muted-foreground text-right">Valor Líquido</span>
            <span className="text-xs font-medium text-muted-foreground text-center">Prev. Fech.</span>
            <span className="text-xs font-medium text-muted-foreground text-right">Status</span>
            <span className="text-xs font-medium text-muted-foreground text-center">Docs</span>
            <span className="text-xs font-medium text-muted-foreground text-right">Ações</span>
          </div>
          <div className="divide-y divide-border">
            {visibleProposals.map((p) => {
              const status = statusMap[p.status] || statusMap.pendente;
              const clientName = (p as any).clients?.name || "—";
              const description = (p as any).description || "";
              const netValue = computeNetValue(p, units, proposalTypes);
              const locked = isLocked(p.status);
              const { propostas: propostaCount, mits: mitCount } = getDocCounts(p);
              return (
                <div
                  key={p.id}
                  className={`flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-accent/50 md:grid md:grid-cols-[2fr_1.5fr_auto_auto_1fr_auto_auto_auto_auto_auto] md:items-center md:gap-3 ${locked ? "opacity-60" : ""}`}
                >
                  <Link to={`/propostas/${p.id}`} className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <FileText className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{clientName}</p>
                      <p className="text-xs text-muted-foreground truncate">{p.number}</p>
                    </div>
                  </Link>
                  <p className="text-sm text-muted-foreground truncate min-w-0">{description || "—"}</p>
                  <p className="text-sm text-foreground whitespace-nowrap">{typeMap[p.type] || p.type}</p>
                  <p className="text-sm text-foreground whitespace-nowrap">{p.product}</p>
                  <p className="text-sm text-muted-foreground truncate min-w-0">{(p as any).sales_team?.name || "—"}</p>
                  <p className="text-sm font-medium text-foreground text-right whitespace-nowrap">
                    {netValue != null ? `R$ ${netValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground text-center whitespace-nowrap">
                    {p.expected_close_date
                      ? new Date(p.expected_close_date + "T00:00:00").toLocaleDateString("pt-BR")
                      : "—"}
                  </p>
                  <div className="flex items-center justify-end gap-1.5">
                    {/* EV HardHat icon: orange for Em Revisão, green for Revisado */}
                    {(p.status === "em_analise_ev" || p.status === "analise_ev_concluida") && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={`inline-flex items-center justify-center h-5 w-5 rounded-full ${
                            p.status === "em_analise_ev" ? "bg-warning/15 text-warning" : "bg-success/15 text-success"
                          }`}>
                            <HardHat className="h-3.5 w-3.5" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{p.status === "em_analise_ev" ? "Em Revisão pelo E.V." : "Revisado pelo E.V."}</TooltipContent>
                      </Tooltip>
                    )}
                    {(p as any).needs_regen && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-warning/15 text-warning">
                            <AlertTriangle className="h-3.5 w-3.5" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Proposta editada — documento precisa ser regerado</TooltipContent>
                      </Tooltip>
                    )}
                    {p.status === "ganha" && (() => {
                      const sigs = (p as any).proposal_signatures || [];
                      const hasTae = sigs.some((s: any) => s.status === "completed" && (s.tae_publication_id || s.tae_document_id));
                      return hasTae ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 text-success px-2 py-0.5 text-xs font-medium">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              {status.label}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Assinatura eletrônica via TAE concluída</TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 text-success px-2 py-0.5 text-xs font-medium">
                              <PenLine className="h-3.5 w-3.5" />
                              {status.label}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Encerrada manualmente (sem assinatura eletrônica)</TooltipContent>
                        </Tooltip>
                      );
                    })()}
                    {p.status !== "ganha" && (
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
                        {status.label}
                      </span>
                    )}
                  </div>
                  {/* Document indicator icons */}
                  <div className="flex items-center justify-center gap-1.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          disabled={propostaCount === 0 && generatingDocs[p.id] !== "proposta"}
                          onClick={() => { if (propostaCount > 0) { setVersionsProposalId(p.id); setVersionsDocType("proposta"); setVersionsOpen(true); } }}
                          className={`relative inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors ${
                            generatingDocs[p.id] === "proposta"
                              ? "bg-primary/10 text-primary"
                              : propostaCount > 0
                                ? "bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                                : "bg-muted text-muted-foreground/40 cursor-not-allowed"
                          }`}
                        >
                          {generatingDocs[p.id] === "proposta" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <FileText className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {generatingDocs[p.id] === "proposta"
                          ? "Gerando proposta..."
                          : propostaCount > 0
                            ? `${propostaCount} proposta(s) gerada(s)`
                            : "Nenhuma proposta gerada"}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          disabled={mitCount === 0 && generatingDocs[p.id] !== "mit"}
                          onClick={() => { if (mitCount > 0) { setVersionsProposalId(p.id); setVersionsDocType("mit"); setVersionsOpen(true); } }}
                          className={`relative inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors ${
                            generatingDocs[p.id] === "mit"
                              ? "bg-accent text-accent-foreground"
                              : mitCount > 0
                                ? "bg-accent text-accent-foreground hover:bg-accent/80 cursor-pointer"
                                : "bg-muted text-muted-foreground/40 cursor-not-allowed"
                          }`}
                        >
                          {generatingDocs[p.id] === "mit" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <FileCheck className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {generatingDocs[p.id] === "mit"
                          ? "Gerando MIT-065..."
                          : mitCount > 0
                            ? `${mitCount} MIT-065 gerado(s)`
                            : "Nenhum MIT-065 gerado"}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="text-right">
                    {!isConsulta && <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {/* Cancelada: somente Duplicar + Log */}
                        {p.status === "cancelada" ? (
                          <>
                            <DropdownMenuItem onClick={() => handleDuplicate(p)}>
                              <Copy className="mr-2 h-3.5 w-3.5" />Duplicar
                            </DropdownMenuItem>
                            {userRole === "admin" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setDeleteId(p.id)} className="text-destructive focus:text-destructive">
                                  <Trash2 className="mr-2 h-3.5 w-3.5" />Excluir (Admin)
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openChangeLog(p.id)}>
                              <History className="mr-2 h-3.5 w-3.5" />Log de Alterações
                            </DropdownMenuItem>
                          </>
                        ) : p.status === "ganha" ? (
                          <>
                            {/* Ganha: Gerar MIT, Duplicar, Monitor, Log — exceto Arquiteto não gera MIT */}
                            {!isArquiteto && (
                              <DropdownMenuItem onClick={() => handleGenerateDoc(p.id, "mit")}>
                                <FileCheck className="mr-2 h-3.5 w-3.5" />
                                Gerar MIT-065
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleDuplicate(p)}>
                              <Copy className="mr-2 h-3.5 w-3.5" />Duplicar
                            </DropdownMenuItem>
                            {(() => {
                              const sigs = (p as any).proposal_signatures || [];
                              const hasTaeSigned = sigs.some((s: any) => s.status === "completed" && s.tae_document_id);
                              return hasTaeSigned ? (
                                <DropdownMenuItem onClick={() => handleDownloadTaeSigned(p)} disabled={downloadingTae === p.id}>
                                  {downloadingTae === p.id ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-2 h-3.5 w-3.5" />}
                                  Baixar Documento Assinado
                                </DropdownMenuItem>
                              ) : null;
                            })()}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setMonitorProposal(p)}>
                              <ClipboardList className="mr-2 h-3.5 w-3.5" />Monitor de Assinatura
                            </DropdownMenuItem>
                            {!isArquiteto && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => openEditDates(p)}>
                                  <Edit2 className="mr-2 h-3.5 w-3.5" />Alterar Datas
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openCraDialog(p)}>
                                  <Users className="mr-2 h-3.5 w-3.5" />Enviar para Operações
                                </DropdownMenuItem>
                              </>
                            )}
                            {userRole === "admin" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setDeleteId(p.id)} className="text-destructive focus:text-destructive">
                                  <Trash2 className="mr-2 h-3.5 w-3.5" />Excluir (Admin)
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openChangeLog(p.id)}>
                              <History className="mr-2 h-3.5 w-3.5" />Log de Alterações
                            </DropdownMenuItem>
                          </>
                        ) : (
                          <>
                            {/* Pendente, proposta_gerada, em_assinatura */}
                            {p.status !== "em_assinatura" && !isArquiteto && (
                              <>
                                <DropdownMenuItem
                                  disabled={!p.proposal_scope_items || p.proposal_scope_items.length === 0}
                                  onClick={() => handleGenerateDoc(p.id, "proposta")}
                                >
                                  <Eye className="mr-2 h-3.5 w-3.5" />
                                  Gerar Proposta
                                </DropdownMenuItem>
                              </>
                            )}
                            {p.arquiteto_id && !isArquiteto && (p.status === "pendente" || p.status === "proposta_gerada" || p.status === "analise_ev_concluida") && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => openNotifDialog(p, "solicitar_ajuste")}>
                                  <MessageSquare className="mr-2 h-3.5 w-3.5" />Solicitar Revisão EV
                                </DropdownMenuItem>
                              </>
                            )}
                            {p.status === "em_analise_ev" && !isArquiteto && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setCancelEvId(p.id)} className="text-destructive focus:text-destructive">
                                  <XSquare className="mr-2 h-3.5 w-3.5" />Cancelar Solicitação EV
                                </DropdownMenuItem>
                              </>
                            )}
                            {isArquiteto && p.esn_id && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => openNotifDialog(p, "notificar_esn")}>
                                  <Mail className="mr-2 h-3.5 w-3.5" />Notificar ESN (Ajuste Concluído)
                                </DropdownMenuItem>
                              </>
                            )}


                            <DropdownMenuSeparator />
                            {!locked && (
                              <DropdownMenuItem onClick={() => navigate(`/propostas/${p.id}`)}>
                                <Edit2 className="mr-2 h-3.5 w-3.5" />Editar
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleDuplicate(p)}>
                              <Copy className="mr-2 h-3.5 w-3.5" />Duplicar
                            </DropdownMenuItem>
                            {p.status === "proposta_gerada" && !isArquiteto && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setSignatureProposal(p)}>
                                  <Send className="mr-2 h-3.5 w-3.5" />Enviar para Assinatura
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setMonitorProposal(p)}>
                                  <ClipboardList className="mr-2 h-3.5 w-3.5" />Monitor de Assinatura
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setWinId(p.id); setWinCloseDate(new Date().toISOString().substring(0, 10)); }}>
                                  <Trophy className="mr-2 h-3.5 w-3.5" />Encerrar como Ganha
                                </DropdownMenuItem>
                              </>
                            )}
                            {p.status === "proposta_gerada" && isArquiteto && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setMonitorProposal(p)}>
                                  <ClipboardList className="mr-2 h-3.5 w-3.5" />Monitor de Assinatura
                                </DropdownMenuItem>
                              </>
                            )}
                            {p.status === "em_assinatura" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setMonitorProposal(p)}>
                                  <ClipboardList className="mr-2 h-3.5 w-3.5" />Monitor de Assinatura
                                </DropdownMenuItem>
                                {!isArquiteto && (
                                  <DropdownMenuItem onClick={() => setCancelSignatureId(p.id)} className="text-destructive focus:text-destructive">
                                    <XSquare className="mr-2 h-3.5 w-3.5" />Cancelar Assinatura
                                  </DropdownMenuItem>
                                )}
                              </>
                            )}
                            {!locked && !isArquiteto && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setCancelId(p.id)} className="text-destructive focus:text-destructive">
                                  <Ban className="mr-2 h-3.5 w-3.5" />Encerrar Perdida
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setDeleteId(p.id)} className="text-destructive focus:text-destructive">
                                  <Trash2 className="mr-2 h-3.5 w-3.5" />Excluir
                                </DropdownMenuItem>
                              </>
                            )}
                            {locked && userRole === "admin" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setDeleteId(p.id)} className="text-destructive focus:text-destructive">
                                  <Trash2 className="mr-2 h-3.5 w-3.5" />Excluir (Admin)
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openChangeLog(p.id)}>
                              <History className="mr-2 h-3.5 w-3.5" />Log de Alterações
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma proposta encontrada.</div>
            )}
          </div>

          {/* Footer totals */}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between border-t border-border bg-accent/30 px-4 py-2.5">
              <span className="text-sm font-medium text-muted-foreground">
                Exibindo {visibleProposals.length} de {filtered.length} {filtered.length === 1 ? "proposta" : "propostas"}
                {hasMoreProposals && (
                  <Button variant="link" size="sm" className="ml-2 h-auto p-0 text-xs" onClick={() => setVisibleCount((c) => c + 50)}>
                    Carregar mais
                  </Button>
                )}
              </span>
              <span className="text-sm font-semibold text-foreground">
                Total: R${" "}
                {filtered
                  .reduce((sum, p) => sum + (computeNetValue(p, units, proposalTypes) || 0), 0)
                  .toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </div>

        {/* Generation console removed — now uses background toast notifications */}

        {/* Delete confirmation with linked projects warning */}
        <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
          <AlertDialogContent className="sm:max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Excluir oportunidade?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p>Esta ação não pode ser desfeita. A oportunidade e todos os dados relacionados (escopo, parcelas, documentos) serão removidos permanentemente.</p>
                  {linkedProjects.length > 0 && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                      <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
                        <HardHat className="h-4 w-4" />
                        {linkedProjects.length} projeto(s) vinculado(s) será(ão) excluído(s):
                      </p>
                      <ul className="text-xs space-y-1 text-muted-foreground">
                        {linkedProjects.map((proj) => (
                          <li key={proj.id} className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-destructive/50 shrink-0" />
                            <span className="font-medium">{proj.product}</span>
                            <span>— {(proj as any).clients?.name || "—"}</span>
                            <Badge variant="outline" className="text-[10px] ml-auto">{proj.status}</Badge>
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-destructive/80">
                        Todos os itens de escopo e anexos desses projetos também serão removidos.
                      </p>
                    </div>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteLoading}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} disabled={deleteLoading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleteLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Excluir {linkedProjects.length > 0 ? "Tudo" : ""}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Cancel confirmation */}
        <AlertDialog open={!!cancelId} onOpenChange={(open) => !open && setCancelId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Encerrar proposta como perdida?</AlertDialogTitle>
              <AlertDialogDescription>A proposta será marcada como perdida e não poderá mais ser editada ou excluída.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Voltar</AlertDialogCancel>
              <AlertDialogAction onClick={handleCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Confirmar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Win confirmation with date picker */}
        <Dialog open={!!winId} onOpenChange={(open) => { if (!open) { setWinId(null); setWinCloseDate(""); } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-success" />
                Encerrar como Ganha
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">Informe a data de fechamento desta proposta:</p>
              <div className="space-y-1.5">
                <Label htmlFor="win-close-date">Data de Fechamento</Label>
                <Input
                  id="win-close-date"
                  type="date"
                  value={winCloseDate}
                  onChange={(e) => setWinCloseDate(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setWinId(null); setWinCloseDate(""); }}>Voltar</Button>
              <Button onClick={handleWin} disabled={!winCloseDate}>Confirmar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>


        {/* Edit Dates dialog */}
        <Dialog open={!!editDatesProposal} onOpenChange={(open) => !open && setEditDatesProposal(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Alterar Datas da Proposta</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Data de Previsão (Validade)</Label>
                <Input type="date" value={editDateValidity} onChange={(e) => setEditDateValidity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Data de Fechamento</Label>
                <Input type="date" value={editExpectedClose} onChange={(e) => setEditExpectedClose(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDatesProposal(null)}>Cancelar</Button>
              <Button onClick={handleSaveDates}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Document Management Dialog */}
        <DocumentManagementDialog
          open={versionsOpen}
          onOpenChange={setVersionsOpen}
          proposalId={versionsProposalId}
          docType={versionsDocType}
        />

        {/* Send to Signature dialog */}
        <SendToSignatureDialog
          proposal={signatureProposal}
          open={!!signatureProposal}
          onOpenChange={(open) => !open && setSignatureProposal(null)}
        />

        {/* Signature Monitor dialog */}
        <SignatureMonitorDialog
          proposalId={monitorProposal?.id || null}
          proposalNumber={monitorProposal?.number}
          open={!!monitorProposal}
          onOpenChange={(open) => !open && setMonitorProposal(null)}
          readOnly={monitorProposal?.status === "ganha" || monitorProposal?.status === "cancelada"}
        />
        {/* Cancel Signature confirmation */}
        <AlertDialog open={!!cancelSignatureId} onOpenChange={(open) => !open && setCancelSignatureId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar processo de assinatura?</AlertDialogTitle>
              <AlertDialogDescription>O processo de assinatura será cancelado e o status da proposta voltará para "Proposta Gerada".</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Voltar</AlertDialogCancel>
              <AlertDialogAction onClick={handleCancelSignature} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Confirmar Cancelamento
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Cancel EV Request confirmation */}
        <AlertDialog open={!!cancelEvId} onOpenChange={(open) => !open && setCancelEvId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <AlertDialogTitle>Cancelar Solicitação E.V.?</AlertDialogTitle>
              </div>
              <AlertDialogDescription className="space-y-3 pt-2">
                <span className="block">
                  Ao cancelar a solicitação de Análise E.V., as seguintes ações serão realizadas:
                </span>
                <span className="block rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
                  <ul className="list-disc pl-5 space-y-1">
                    <li>O status da oportunidade voltará para <strong>"Pendente"</strong> ou <strong>"Proposta Gerada"</strong></li>
                    <li>Projetos ativos vinculados serão <strong>cancelados</strong></li>
                    <li>O Engenheiro de Valor será <strong>notificado</strong> por e-mail</li>
                    <li>O escopo dos projetos será <strong>preservado</strong> para reuso futuro</li>
                  </ul>
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={cancelEvLoading}>Voltar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleCancelEv}
                disabled={cancelEvLoading}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {cancelEvLoading ? "Cancelando..." : "Confirmar Cancelamento"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Sheet open={notifDialogOpen} onOpenChange={setNotifDialogOpen}>
          <SheetContent side="right" className="w-full sm:max-w-xl md:max-w-2xl p-0 flex flex-col gap-0 [&>button]:hidden">
            {/* Hero Header */}
            <div className="bg-gradient-to-r from-[hsl(var(--hero-from))] via-[hsl(var(--hero-via))] to-[hsl(var(--hero-to))] px-6 py-5 shrink-0">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-white/10 p-2">
                  {notifType === "solicitar_ajuste" ? (
                    <MessageSquare className="h-5 w-5 text-white" />
                  ) : (
                    <Mail className="h-5 w-5 text-white" />
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    {notifType === "solicitar_ajuste" ? "Solicitar Revisão EV" : "Notificar ESN — Ajuste Concluído"}
                  </h2>
                  <p className="text-sm text-white/70">
                    {notifType === "solicitar_ajuste" ? "Envie a solicitação de revisão para o Engenheiro de Valor" : "Notifique o ESN sobre o ajuste concluído"}
                  </p>
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="p-6 space-y-5">
                {/* Gmail auth warning */}
                {gmailAuthorized === false && (
                  <Alert variant="destructive" className="border-warning bg-warning/10">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="space-y-2">
                      <p className="text-sm font-medium">Autorização de email necessária</p>
                      <p className="text-xs text-muted-foreground">
                        Para enviar notificações, você precisa autorizar o sistema a enviar emails pela sua conta Google ({user?.email}).
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={startUserGmailAuth}
                        disabled={gmailAuthLoading}
                        className="mt-1"
                      >
                        {gmailAuthLoading ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <ExternalLink className="mr-2 h-3 w-3" />}
                        Autorizar envio de email
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

                {notifProposal && gmailAuthorized && (
                  <>
                    {/* Section: Dados da Oportunidade */}
                    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                        <FileText className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold text-foreground">Dados da Oportunidade</h3>
                      </div>
                      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground font-medium">Oportunidade</p>
                          <p className="text-sm font-medium text-foreground truncate">{notifProposal.number}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground font-medium">Produto</p>
                          <p className="text-sm font-medium text-foreground truncate">{notifProposal.product}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground font-medium">Cliente</p>
                          <p className="text-sm font-medium text-foreground truncate">{(notifProposal as any).clients?.name}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground font-medium">Destinatário</p>
                          <p className="text-sm font-medium text-foreground truncate">
                            {notifType === "solicitar_ajuste"
                              ? `${(notifProposal as any).arquiteto?.name || "—"}`
                              : `${(notifProposal as any).sales_team?.name || "—"}`
                            }
                            <span className="text-muted-foreground font-normal ml-1">
                              ({notifType === "solicitar_ajuste"
                                ? ((notifProposal as any).arquiteto?.email || "sem email")
                                : ((notifProposal as any).sales_team?.email || "sem email")
                              })
                            </span>
                          </p>
                        </div>
                        <div className="sm:col-span-2">
                          <p className="text-xs text-muted-foreground font-medium">Remetente</p>
                          <p className="text-sm font-medium text-foreground truncate">{user?.email}</p>
                        </div>
                      </div>
                    </div>

                    {/* Section: Cópia (CC) */}
                    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                        <UserPlus className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold text-foreground">Cópia (CC)</h3>
                      </div>
                      <div className="p-4 space-y-3">
                        <div className="flex gap-2">
                          <Input
                            value={notifCcInput}
                            onChange={(e) => setNotifCcInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNotifCcEmail())}
                            placeholder="email@exemplo.com"
                            className="text-sm"
                          />
                          <Button type="button" size="sm" variant="outline" onClick={addNotifCcEmail} className="h-10 px-3 shrink-0">
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        {notifCcEmails.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {notifCcEmails.map((email) => (
                              <Badge key={email} variant="secondary" className="text-xs gap-1 pr-1">
                                {email}
                                <button onClick={() => setNotifCcEmails(notifCcEmails.filter(e => e !== email))} className="ml-0.5 hover:text-destructive">
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Section: Assunto */}
                    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                        <Mail className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold text-foreground">Assunto do E-mail</h3>
                      </div>
                      <div className="p-4">
                        <Input
                          value={notifSubject}
                          onChange={(e) => setNotifSubject(e.target.value)}
                          placeholder={notifType === "solicitar_ajuste"
                            ? `[Proposta ${notifProposal?.number}] Envio para Engenharia de Valor`
                            : `[Proposta ${notifProposal?.number}] Ajuste de Escopo Concluído`}
                          className="text-sm"
                        />
                      </div>
                    </div>

                    {/* Section: Mensagem */}
                    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                        <MessageSquare className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold text-foreground">Mensagem (opcional)</h3>
                      </div>
                      <div className="p-4">
                        <Textarea
                          value={notifMessage}
                          onChange={(e) => setNotifMessage(e.target.value)}
                          placeholder={notifType === "solicitar_ajuste"
                            ? "Descreva o resumo e observações para a engenharia de valor..."
                            : "Descreva o que foi ajustado e observações relevantes..."}
                          rows={5}
                          className="text-sm"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="border-t border-border bg-card px-6 py-4 flex items-center justify-end gap-3 shrink-0">
              <Button variant="outline" onClick={() => setNotifDialogOpen(false)} disabled={notifSending}>
                Cancelar
              </Button>
              <Button onClick={handleSendNotification} disabled={notifSending || !gmailAuthorized}>
                {notifSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Enviar
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        {/* Operations Notification dialog */}
        <Sheet open={craDialogOpen} onOpenChange={setCraDialogOpen}>
          <SheetContent side="right" className="w-full sm:max-w-xl md:max-w-2xl p-0 flex flex-col gap-0 [&>button]:hidden">
            {/* Hero Header */}
            <div className="bg-gradient-to-r from-[hsl(var(--hero-from))] via-[hsl(var(--hero-via))] to-[hsl(var(--hero-to))] px-6 py-5 shrink-0">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-white/10 p-2">
                  <Send className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Enviar para Operações</h2>
                  <p className="text-sm text-white/70">Selecione os destinatários, anexos e envie a comunicação</p>
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="p-6 space-y-5">
                {gmailAuthorized === false && (
                  <Alert variant="destructive" className="border-warning bg-warning/10">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="space-y-2">
                      <p className="text-sm font-medium">Autorização de email necessária</p>
                      <p className="text-xs text-muted-foreground">Autorize o envio pela sua conta Google.</p>
                      <Button size="sm" variant="outline" onClick={startUserGmailAuth} disabled={gmailAuthLoading} className="mt-1">
                        {gmailAuthLoading ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <ExternalLink className="mr-2 h-3 w-3" />}
                        Autorizar envio de email
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

                {craProposal && gmailAuthorized && (
                  <>
                    {/* Section: Dados da Proposta */}
                    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                        <FileText className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold text-foreground">Dados da Proposta</h3>
                      </div>
                      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground font-medium">Proposta</p>
                          <p className="text-sm font-medium text-foreground truncate">{craProposal.number}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground font-medium">Produto</p>
                          <p className="text-sm font-medium text-foreground truncate">{craProposal.product}</p>
                        </div>
                        <div className="sm:col-span-2">
                          <p className="text-xs text-muted-foreground font-medium">Cliente</p>
                          <p className="text-sm font-medium text-foreground truncate">{(craProposal as any).clients?.name}</p>
                        </div>
                      </div>
                    </div>

                    {/* Section: Destinatários Operações */}
                    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                        <Users className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold text-foreground">Destinatários Operações</h3>
                      </div>
                      <div className="p-4 space-y-3">
                        {opsRecipients.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Nenhum contato de Operações cadastrado para esta unidade.</p>
                        ) : (
                          <ScrollArea className="max-h-40">
                            <div className="space-y-1">
                              {opsRecipients.map(r => (
                                <div key={r.email} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-accent transition-colors">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">{r.name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {!r.fromDb && <Badge variant="outline" className="text-[10px]">Manual</Badge>}
                                    <button onClick={() => removeOpsRecipient(r.email)} className="text-muted-foreground hover:text-destructive transition-colors">
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        )}
                        {/* Add manual recipient */}
                        <div className="border-t border-border pt-3 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">Adicionar destinatário</p>
                          <div className="flex gap-2">
                            <Input
                              value={opsManualName}
                              onChange={(e) => setOpsManualName(e.target.value)}
                              placeholder="Nome"
                              className="text-sm flex-1"
                            />
                            <Input
                              value={opsManualEmail}
                              onChange={(e) => setOpsManualEmail(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOpsManualRecipient())}
                              placeholder="email@exemplo.com"
                              className="text-sm flex-1"
                            />
                            <Button type="button" size="sm" variant="outline" onClick={addOpsManualRecipient} className="h-10 px-3 shrink-0">
                              <UserPlus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section: Documentos do Sistema */}
                    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                        <FileCheck className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold text-foreground">Documentos para Anexar</h3>
                      </div>
                      <div className="p-4 space-y-3">
                        {/* Signed doc checkbox */}
                        {(() => {
                          const latestSig = (craProposal as any).proposal_signatures
                            ?.filter((s: any) => s.status === "completed" && s.tae_document_id)
                            ?.sort((a: any, b: any) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())?.[0];
                          return latestSig ? (
                            <label className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent transition-colors cursor-pointer">
                              <Checkbox checked={opsAttachSignedDoc} onCheckedChange={(v) => setOpsAttachSignedDoc(!!v)} />
                              <div className="min-w-0">
                                <p className="text-sm font-medium">Documento Assinado (TAE)</p>
                                <p className="text-xs text-muted-foreground">Contrato assinado eletronicamente</p>
                              </div>
                            </label>
                          ) : (
                            <label className="flex items-center gap-3 rounded-lg px-3 py-2.5 opacity-50 cursor-not-allowed">
                              <Checkbox checked={false} disabled />
                              <div className="min-w-0">
                                <p className="text-sm font-medium">Documento Assinado (TAE)</p>
                                <p className="text-xs text-muted-foreground">Nenhum documento assinado disponível</p>
                              </div>
                            </label>
                          );
                        })()}

                        {/* MIT-065 checkbox */}
                        {(() => {
                          const docs = (craProposal as any).proposal_documents || [];
                          const hasMit = docs.some((d: any) => d.doc_type === "mit");
                          return (
                            <label className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent transition-colors cursor-pointer">
                              <Checkbox checked={opsAttachMit} onCheckedChange={(v) => setOpsAttachMit(!!v)} />
                              <div className="min-w-0">
                                <p className="text-sm font-medium">MIT-065 - Transição Comercial</p>
                                <p className="text-xs text-muted-foreground">
                                  {hasMit ? "Documento já gerado — será exportado como PDF" : "Será gerado automaticamente durante o envio"}
                                </p>
                              </div>
                            </label>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Section: Anexos Manuais */}
                    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                        <Paperclip className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold text-foreground">Outros Anexos</h3>
                      </div>
                      <div className="p-4 space-y-3">
                        {opsAttachments.length > 0 && (
                          <div className="space-y-1">
                            {opsAttachments.map((att, idx) => (
                              <div key={idx} className="flex items-center justify-between rounded-lg px-3 py-2 bg-muted/50">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <span className="text-sm truncate">{att.name}</span>
                                </div>
                                <button onClick={() => setOpsAttachments(prev => prev.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <input ref={opsFileInputRef} type="file" multiple className="hidden" onChange={handleOpsFileSelect} />
                        <Button type="button" variant="outline" size="sm" onClick={() => opsFileInputRef.current?.click()}>
                          <Upload className="mr-2 h-3.5 w-3.5" />
                          Anexar arquivo
                        </Button>
                      </div>
                    </div>

                    {/* Section: Assunto */}
                    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                        <Mail className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold text-foreground">Assunto do E-mail</h3>
                      </div>
                      <div className="p-4">
                        <Input
                          value={craSubject}
                          onChange={(e) => setCraSubject(e.target.value)}
                          placeholder={`[Proposta ${craProposal?.number}] Envio para Operações`}
                          className="text-sm"
                        />
                      </div>
                    </div>

                    {/* Section: Mensagem */}
                    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                        <MessageSquare className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold text-foreground">Mensagem (opcional)</h3>
                      </div>
                      <div className="p-4">
                        <Textarea
                          value={craMessage}
                          onChange={(e) => setCraMessage(e.target.value)}
                          placeholder="Escreva uma mensagem para Operações..."
                          rows={4}
                          className="text-sm"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="border-t border-border bg-card px-6 py-4 flex items-center justify-end gap-3 shrink-0">
              <Button variant="outline" onClick={() => setCraDialogOpen(false)} disabled={craSending}>Cancelar</Button>
              <Button onClick={handleSendCraNotification} disabled={craSending || !gmailAuthorized || opsRecipients.length === 0}>
                {craSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Enviar ({opsRecipients.length})
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        {/* Change Log dialog */}
        <Dialog open={changeLogOpen} onOpenChange={setChangeLogOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Log de Alterações
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              {changeLogLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : changeLogEntries.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Nenhum registro de alteração encontrado.</p>
              ) : (
                <div className="space-y-3 pr-2">
                  {changeLogEntries.map((log: any) => {
                    const severityColors: Record<string, string> = {
                      info: "border-l-primary",
                      warning: "border-l-warning",
                      error: "border-l-destructive",
                      success: "border-l-success",
                    };
                    return (
                      <div
                        key={log.id}
                        className={`rounded-lg border border-border border-l-4 ${severityColors[log.severity] || "border-l-primary"} bg-card p-3`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-foreground">{log.action}</span>
                              <Badge variant="outline" className="text-[10px]">{log.stage}</Badge>
                              <Badge
                                variant={log.severity === "error" ? "destructive" : "secondary"}
                                className="text-[10px]"
                              >
                                {log.severity}
                              </Badge>
                            </div>
                            {log.user_name && (
                              <p className="text-xs text-muted-foreground mt-1">
                                <span className="font-medium">{log.user_name}</span>
                                {log.user_email && <span className="ml-1">({log.user_email})</span>}
                              </p>
                            )}
                            {log.error_message && (
                              <p className="text-xs text-destructive mt-1">{log.error_message}</p>
                            )}
                          </div>
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                            {new Date(log.occurred_at).toLocaleDateString("pt-BR")} {new Date(log.occurred_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
