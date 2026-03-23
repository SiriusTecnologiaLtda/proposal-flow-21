import { Link, useNavigate } from "react-router-dom";
import { Plus, Search, FileText, MoreHorizontal, Edit2, Trash2, Copy, Ban, Trophy, Eye, Loader2, CheckCircle2, XCircle, Info, FolderOpen, Star, FileCheck, Send, XSquare, ClipboardList, ShieldCheck, PenLine, MessageSquare, Mail, AlertTriangle, ExternalLink, Users, History, Calendar, SlidersHorizontal, CalendarRange, X, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import SendToSignatureDialog from "@/components/proposal/SendToSignatureDialog";
import SignatureMonitorDialog from "@/components/proposal/SignatureMonitorDialog";

interface LogEntry {
  step: string;
  status: "ok" | "error" | "info";
  message: string;
  timestamp: string;
}

const statusMap: Record<string, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "bg-muted text-muted-foreground" },
  proposta_gerada: { label: "Proposta Gerada", className: "bg-primary/15 text-primary" },
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

  // Find the rounding factor from the proposal type config
  const typeConfig = proposalTypes.find((pt: any) => pt.slug === proposal.type);
  const roundingFactor = typeConfig?.rounding_factor || 8;

  // Sum hours of included children (items with parent_id)
  const totalHours = roundUpFactor(
    scopeItems
      .filter((item: any) => item.included && item.parent_id)
      .reduce((sum: number, item: any) => sum + (item.hours || 0), 0),
    roundingFactor
  );

  const gpHours = roundUpFactor(Math.ceil(totalHours * (proposal.gp_percentage / 100)), roundingFactor);
  return (totalHours + gpHours) * proposal.hourly_rate;
}

function StatusIcon({ status }: { status: LogEntry["status"] }) {
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />;
  if (status === "error") return <XCircle className="h-4 w-4 text-red-400 shrink-0" />;
  return <Info className="h-4 w-4 text-blue-400 shrink-0" />;
}

export default function ProposalsList() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [periodFilter, setPeriodFilter] = useState<string>("este_ano");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const { data: proposals = [] } = useProposals();
  const { data: units = [] } = useUnits();

  const { data: proposalTypes = [] } = useQuery({
    queryKey: ["proposal_types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("proposal_types").select("slug, rounding_factor");
      if (error) throw error;
      return data;
    },
  });
  const { user } = useAuth();
  const { role: userRole } = useUserRole();
  const queryClient = useQueryClient();
  const deleteProposal = useDeleteProposal();
  const updateStatus = useUpdateProposalStatus();
  const navigate = useNavigate();
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
  const [notifSending, setNotifSending] = useState(false);

  function openNotifDialog(proposal: any, type: "solicitar_ajuste" | "notificar_esn") {
    setNotifProposal(proposal);
    setNotifType(type);
    setNotifMessage("");
    setNotifDialogOpen(true);
  }

  // CRA notification state
  const [craDialogOpen, setCraDialogOpen] = useState(false);
  const [craProposal, setCraProposal] = useState<any>(null);
  const [craMessage, setCraMessage] = useState("");
  const [craSending, setCraSending] = useState(false);
  const [craSelectedUserIds, setCraSelectedUserIds] = useState<string[]>([]);

  // Load CRA users (profiles with is_cra=true and consulta role)
  const { data: craUsers = [] } = useQuery({
    queryKey: ["cra-users"],
    queryFn: async () => {
      // Get all profiles marked as CRA
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, email, is_cra")
        .eq("is_cra", true);
      if (!profiles?.length) return [];
      // Get their unit access
      const userIds = profiles.map(p => p.user_id);
      const { data: unitAccess } = await supabase
        .from("user_unit_access")
        .select("user_id, unit_id")
        .in("user_id", userIds);
      return profiles.map(p => ({
        ...p,
        unitIds: (unitAccess || []).filter(u => u.user_id === p.user_id).map(u => u.unit_id),
      }));
    },
  });

  function openCraDialog(proposal: any) {
    setCraProposal(proposal);
    setCraMessage("");
    setCraSelectedUserIds([]);
    setCraDialogOpen(true);
  }

  async function handleSendCraNotification() {
    if (!craProposal || craSelectedUserIds.length === 0) return;
    setCraSending(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const selectedEmails = craUsers
        .filter(u => craSelectedUserIds.includes(u.user_id))
        .map(u => ({ email: u.email!, name: u.display_name }));

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
            proposalId: craProposal.id,
            type: "comunicar_cra",
            message: craMessage,
            proposalLink: `${window.location.origin}/propostas/${craProposal.id}`,
            recipients: selectedEmails,
          }),
        }
      );
      const data = await res.json();
      if (data.error === "gmail_not_authorized") {
        toast({ title: "Autorização necessária", description: "Autorize o envio de emails pela sua conta Google.", variant: "destructive" });
        setCraSending(false);
        return;
      }
      if (res.ok && data.success) {
        toast({ title: "Comunicado CRA enviado", description: `Enviado para ${selectedEmails.length} destinatário(s)` });
        setCraDialogOpen(false);
      } else {
        toast({ title: "Erro ao enviar", description: data.error || "Erro desconhecido", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setCraSending(false);
    }
  }

  async function handleSendNotification() {
    if (!notifProposal) return;
    setNotifSending(true);
    try {
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
            proposalId: notifProposal.id,
            type: notifType,
            message: notifMessage,
            proposalLink: `${window.location.origin}/propostas/${notifProposal.id}`,
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
        setNotifSending(false);
        return;
      }
      if (res.ok && data.success) {
        toast({
          title: "Email enviado com sucesso",
          description: `Enviado de ${data.senderEmail} para ${data.recipientName} (${data.recipientEmail})`,
        });
        setNotifDialogOpen(false);
      } else {
        toast({ title: "Erro ao enviar email", description: data.error || "Erro desconhecido", variant: "destructive" });
        setNotifDialogOpen(false);
      }
    } catch (err: any) {
      toast({ title: "Erro ao enviar", description: err.message, variant: "destructive" });
    } finally {
      setNotifSending(false);
    }
  }

  // Console dialog state
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<LogEntry[]>([]);
  const [consoleLoading, setConsoleLoading] = useState(false);
  const [consoleDocUrl, setConsoleDocUrl] = useState<string | null>(null);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Versions dialog state
  interface ProposalDoc {
    id: string;
    doc_id: string;
    doc_url: string;
    file_name: string;
    version: number;
    is_official: boolean;
    created_at: string;
    doc_type: string;
  }
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionsProposalId, setVersionsProposalId] = useState<string | null>(null);
  const [versionsDocType, setVersionsDocType] = useState<string>("proposta");
  const [versions, setVersions] = useState<ProposalDoc[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [consoleLogs]);

  async function handleGenerateDoc(proposalId: string, docType: "proposta" | "mit" = "proposta") {
    setConsoleLogs([]);
    setConsoleDocUrl(null);
    setConsoleLoading(true);
    setConsoleOpen(true);

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

      if (data?.logs) {
        setConsoleLogs(data.logs);
      }

      if (response.ok && data?.docUrl) {
        setConsoleDocUrl(data.docUrl);
        // Clear needs_regen flag after successful generation
        await supabase.from("proposals").update({ needs_regen: false } as any).eq("id", proposalId);
        queryClient.invalidateQueries({ queryKey: ["proposals"] });
      } else if (!data?.logs) {
        setConsoleLogs([{ step: "Erro", status: "error", message: data?.error || "Erro desconhecido", timestamp: new Date().toISOString() }]);
      }
    } catch (err: any) {
      setConsoleLogs(prev => [...prev, { step: "Erro de rede", status: "error", message: err.message, timestamp: new Date().toISOString() }]);
    }
    setConsoleLoading(false);
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

  const filtered = proposals.filter((p) => {
    // Consulta role: only ganha proposals from allowed units
    if (isConsulta) {
      if (p.status !== "ganha") return false;
      const esnUnitId = (p as any).sales_team?.unit_id;
      if (esnUnitId && userUnitIds.length > 0 && !userUnitIds.includes(esnUnitId)) return false;
      if (!esnUnitId && userUnitIds.length > 0) return false;
    }
    // Status filter
    if (statusFilter.length > 0 && !statusFilter.includes(p.status)) return false;
    // Period filter by expected_close_date
    if (periodRange) {
      const closeDate = (p as any).expected_close_date;
      if (!closeDate) return false;
      try {
        const d = parseISO(closeDate);
        if (!isWithinInterval(d, { start: periodRange.start, end: periodRange.end })) return false;
      } catch { return false; }
    }
    const q = search.toLowerCase();
    const clientName = (p as any).clients?.name || "";
    const desc = (p as any).description || "";
    const esnName = (p as any).sales_team?.name || "";
    return (
      p.number.toLowerCase().includes(q) ||
      clientName.toLowerCase().includes(q) ||
      desc.toLowerCase().includes(q) ||
      esnName.toLowerCase().includes(q)
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
      await updateStatus.mutateAsync({ id: cancelSignatureId, status: "proposta_gerada" });
      // Update signature record
      await supabase
        .from("proposal_signatures")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() } as any)
        .eq("proposal_id", cancelSignatureId)
        .eq("status", "pending");
      toast({ title: "Processo de assinatura cancelado. Status voltou para Proposta Gerada." });
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

  async function loadVersions(proposalId: string, docType: string = "proposta") {
    setVersionsProposalId(proposalId);
    setVersionsDocType(docType);
    setVersionsLoading(true);
    setVersionsOpen(true);
    try {
      const { data, error } = await supabase
        .from("proposal_documents")
        .select("*")
        .eq("proposal_id", proposalId)
        .eq("doc_type", docType)
        .order("version", { ascending: false });
      if (error) throw error;
      setVersions((data || []) as any);
    } catch (err: any) {
      toast({ title: "Erro ao carregar versões", description: err.message, variant: "destructive" });
      setVersions([]);
    }
    setVersionsLoading(false);
  }

  async function toggleOfficial(docId: string, currentOfficial: boolean) {
    try {
      if (!currentOfficial && versionsProposalId) {
        await supabase.from("proposal_documents").update({ is_official: false }).eq("proposal_id", versionsProposalId).eq("doc_type", versionsDocType);
      }
      await supabase.from("proposal_documents").update({ is_official: !currentOfficial }).eq("id", docId);
      if (versionsProposalId) await loadVersions(versionsProposalId, versionsDocType);
      toast({ title: currentOfficial ? "Versão desmarcada como oficial" : "Versão definida como oficial" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
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
            <h1 className="text-2xl font-semibold text-foreground">Minhas Propostas</h1>
            <p className="text-sm text-muted-foreground">
              {isConsulta ? `${filtered.length} propostas ganhas` : `${filtered.length} de ${proposals.length} propostas`}
            </p>
          </div>
          {!isConsulta && (
            <Button asChild>
              <Link to="/propostas/nova">
                <Plus className="mr-2 h-4 w-4" />
                Nova Proposta
              </Link>
            </Button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por número, cliente ou descrição..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground mr-1">Status:</span>
          {Object.entries(statusMap).map(([key, { label, className }]) => {
            const active = statusFilter.includes(key);
            return (
              <button
                key={key}
                onClick={() =>
                  setStatusFilter((prev) =>
                    active ? prev.filter((s) => s !== key) : [...prev, key]
                  )
                }
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-all border ${
                  active
                    ? `${className} border-current ring-1 ring-current/30`
                    : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted"
                }`}
              >
                {label}
              </button>
            );
          })}
          {statusFilter.length > 0 && (
            <button
              onClick={() => setStatusFilter([])}
              className="text-xs text-muted-foreground hover:text-foreground underline ml-1"
            >
              Limpar
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground mr-1">PERÍODO</span>
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
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-all border ${
                periodFilter === key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
          {periodFilter === "personalizado" && (
            <div className="flex items-center gap-1.5 ml-1">
              <Input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-7 w-[130px] text-xs"
              />
              <span className="text-xs text-muted-foreground">até</span>
              <Input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-7 w-[130px] text-xs"
              />
            </div>
          )}
          {periodFilter && periodFilter !== "este_ano" && (
            <button
              onClick={() => { setPeriodFilter(""); setCustomStart(""); setCustomEnd(""); }}
              className="text-xs text-muted-foreground hover:text-foreground underline ml-1"
            >
              Limpar
            </button>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="hidden border-b border-border bg-muted/50 px-4 py-2.5 md:grid md:grid-cols-11 md:gap-4">
            <span className="text-xs font-medium text-muted-foreground col-span-2">Cliente / Proposta</span>
            <span className="text-xs font-medium text-muted-foreground">Descrição</span>
            <span className="text-xs font-medium text-muted-foreground">Tipo</span>
            <span className="text-xs font-medium text-muted-foreground">Produto</span>
            <span className="text-xs font-medium text-muted-foreground">ESN</span>
            <span className="text-xs font-medium text-muted-foreground text-right">Valor Líquido</span>
            <span className="text-xs font-medium text-muted-foreground text-center">Prev. Fechamento</span>
            <span className="text-xs font-medium text-muted-foreground text-right">Status</span>
            <span className="text-xs font-medium text-muted-foreground text-center">Docs</span>
            <span className="text-xs font-medium text-muted-foreground text-right">Ações</span>
          </div>
          <div className="divide-y divide-border">
            {filtered.map((p) => {
              const status = statusMap[p.status] || statusMap.pendente;
              const clientName = (p as any).clients?.name || "—";
              const description = (p as any).description || "";
              const netValue = computeNetValue(p, units, proposalTypes);
              const locked = isLocked(p.status);
              const { propostas: propostaCount, mits: mitCount } = getDocCounts(p);
              return (
                <div
                  key={p.id}
                  className={`flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-accent/50 md:grid md:grid-cols-11 md:items-center md:gap-4 ${locked ? "opacity-60" : ""}`}
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
                  <p className="text-sm text-muted-foreground truncate">{(p as any).sales_team?.name || "—"}</p>
                  <p className="text-sm font-medium text-foreground text-right">
                    {netValue != null ? `R$ ${netValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground text-center">
                    {p.expected_close_date
                      ? new Date(p.expected_close_date + "T00:00:00").toLocaleDateString("pt-BR")
                      : "—"}
                  </p>
                  <div className="flex items-center justify-end gap-1.5">
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
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 text-green-600 px-2 py-0.5 text-xs font-medium">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              {status.label}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Assinatura eletrônica via TAE concluída</TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 text-green-600 px-2 py-0.5 text-xs font-medium">
                              <PenLine className="h-3.5 w-3.5" />
                              {status.label}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Encerrada manualmente (sem assinatura eletrônica)</TooltipContent>
                        </Tooltip>
                      );
                    })()}
                    {p.status !== "ganha" && (
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
                        {status.label}
                      </span>
                    )}
                  </div>
                  {/* Document indicator icons */}
                  <div className="flex items-center justify-center gap-1.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          disabled={propostaCount === 0}
                          onClick={() => propostaCount > 0 && loadVersions(p.id, "proposta")}
                          className={`inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors ${
                            propostaCount > 0
                              ? "bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                              : "bg-muted text-muted-foreground/40 cursor-not-allowed"
                          }`}
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {propostaCount > 0
                          ? `${propostaCount} proposta(s) gerada(s)`
                          : "Nenhuma proposta gerada"}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          disabled={mitCount === 0}
                          onClick={() => mitCount > 0 && loadVersions(p.id, "mit")}
                          className={`inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors ${
                            mitCount > 0
                              ? "bg-accent text-accent-foreground hover:bg-accent/80 cursor-pointer"
                              : "bg-muted text-muted-foreground/40 cursor-not-allowed"
                          }`}
                        >
                          <FileCheck className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {mitCount > 0
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
                                  <Users className="mr-2 h-3.5 w-3.5" />Comunicar CRA
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
                                <DropdownMenuItem onClick={() => handleGenerateDoc(p.id, "proposta")}>
                                  <Eye className="mr-2 h-3.5 w-3.5" />
                                  Gerar Proposta
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleGenerateDoc(p.id, "mit")}>
                                  <FileCheck className="mr-2 h-3.5 w-3.5" />
                                  Gerar MIT-065
                                </DropdownMenuItem>
                              </>
                            )}
                            {p.arquiteto_id && !isArquiteto && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => openNotifDialog(p, "solicitar_ajuste")}>
                                  <MessageSquare className="mr-2 h-3.5 w-3.5" />Enviar para Eng. Valor
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
        </div>

        {/* Generation console dialog */}
        <Dialog open={consoleOpen} onOpenChange={setConsoleOpen}>
          <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
            <DialogHeader className="px-6 pt-6 pb-3">
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Gerar Documento — Console de Execução
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

        {/* Versions dialog */}
        <Dialog open={versionsOpen} onOpenChange={setVersionsOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5" />
                {versionsDocType === "mit" ? "MIT-065 Gerados" : "Propostas Geradas"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              {versionsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : versions.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Nenhum documento gerado ainda.</p>
              ) : (
                <ScrollArea className="max-h-80">
                  <div className="space-y-2 pr-2">
                    {versions.map((doc, idx) => (
                      <div
                        key={doc.id}
                        className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-colors ${
                          doc.is_official
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-accent/50"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground truncate">{doc.file_name}</p>
                            {doc.is_official && (
                              <Badge variant="default" className="text-[10px] px-1.5 py-0">
                                Oficial
                              </Badge>
                            )}
                            {idx === 0 && !doc.is_official && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                Mais recente
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            v{doc.version} · {new Date(doc.created_at).toLocaleDateString("pt-BR")} às {new Date(doc.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title={doc.is_official ? "Desmarcar como oficial" : "Definir como oficial"}
                            onClick={() => toggleOfficial(doc.id, doc.is_official)}
                          >
                            <Star className={`h-4 w-4 ${doc.is_official ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Abrir documento"
                            onClick={() => window.open(doc.doc_url, "_blank")}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </DialogContent>
        </Dialog>

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

        {/* Notification dialog (Arquiteto ↔ ESN) */}
        <Dialog open={notifDialogOpen} onOpenChange={setNotifDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {notifType === "solicitar_ajuste" ? (
                  <><MessageSquare className="h-5 w-5" /> Enviar para Eng. Valor</>
                ) : (
                  <><Mail className="h-5 w-5" /> Notificar ESN — Ajuste Concluído</>
                )}
              </DialogTitle>
            </DialogHeader>

            {/* Gmail auth warning */}
            {gmailAuthorized === false && (
              <Alert variant="destructive" className="border-warning bg-warning/10">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="space-y-2">
                  <p className="text-sm font-medium">Autorização de email necessária</p>
                  <p className="text-xs text-muted-foreground">
                    Para enviar notificações, você precisa autorizar o sistema a enviar emails pela sua conta Google ({user?.email}).
                    O email será enviado em seu nome.
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
              <div className="space-y-4">
                <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
                  <p><span className="font-medium text-muted-foreground">Proposta:</span> {notifProposal.number}</p>
                  <p><span className="font-medium text-muted-foreground">Cliente:</span> {(notifProposal as any).clients?.name}</p>
                  <p><span className="font-medium text-muted-foreground">Produto:</span> {notifProposal.product}</p>
                  <p><span className="font-medium text-muted-foreground">Remetente:</span> {user?.email}</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Mensagem (opcional)</Label>
                  <Textarea
                    value={notifMessage}
                    onChange={(e) => setNotifMessage(e.target.value)}
                    placeholder={notifType === "solicitar_ajuste"
                      ? "Descreva o resumo e observações para a engenharia de valor..."
                      : "Descreva o que foi ajustado e observações relevantes..."}
                    rows={4}
                    className="text-sm"
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setNotifDialogOpen(false)} disabled={notifSending}>
                Cancelar
              </Button>
              <Button onClick={handleSendNotification} disabled={notifSending || !gmailAuthorized}>
                {notifSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Enviar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* CRA Notification dialog */}
        <Dialog open={craDialogOpen} onOpenChange={setCraDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" /> Comunicar CRA
              </DialogTitle>
            </DialogHeader>

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
              <div className="space-y-4">
                <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
                  <p><span className="font-medium text-muted-foreground">Proposta:</span> {craProposal.number}</p>
                  <p><span className="font-medium text-muted-foreground">Cliente:</span> {(craProposal as any).clients?.name}</p>
                  <p><span className="font-medium text-muted-foreground">Produto:</span> {craProposal.product}</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium">Selecione os destinatários CRA</Label>
                  {craUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum usuário CRA cadastrado.</p>
                  ) : (
                    <ScrollArea className="max-h-48">
                      <div className="space-y-1">
                        {craUsers.map(u => (
                          <label key={u.user_id} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-accent cursor-pointer">
                            <Checkbox
                              checked={craSelectedUserIds.includes(u.user_id)}
                              onCheckedChange={(checked) => {
                                setCraSelectedUserIds(prev =>
                                  checked ? [...prev, u.user_id] : prev.filter(id => id !== u.user_id)
                                );
                              }}
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{u.display_name}</p>
                              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                              {u.unitIds.length > 0 && (
                                <p className="text-xs text-muted-foreground">{u.unitIds.length} unidade(s)</p>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Mensagem (opcional)</Label>
                  <Textarea
                    value={craMessage}
                    onChange={(e) => setCraMessage(e.target.value)}
                    placeholder="Escreva uma mensagem para o CRA..."
                    rows={3}
                    className="text-sm"
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setCraDialogOpen(false)} disabled={craSending}>Cancelar</Button>
              <Button onClick={handleSendCraNotification} disabled={craSending || !gmailAuthorized || craSelectedUserIds.length === 0}>
                {craSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Enviar ({craSelectedUserIds.length})
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
