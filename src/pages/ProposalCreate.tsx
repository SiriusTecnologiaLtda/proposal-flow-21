import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Search, Plus, Trash2, ChevronDown, ChevronRight, Layers, Library, ChevronsDownUp, ChevronsUpDown, ChevronUp, MessageSquare, UserPlus, FolderKanban, Save, FileText, ClipboardList, Landmark, Sparkles, Users, UserRoundSearch, CalendarDays, Edit2, HardHat, Settings2, Loader2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem, CommandGroup } from "@/components/ui/command";
import { useClients, useSalesTeam, useScopeTemplates, useProducts, useCreateProposal, useUpdateProposal, useProposal, useUnits, useProposalDefaults } from "@/hooks/useSupabaseData";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import ClientValidationAlerts, { getClientWarnings } from "@/components/proposal/ClientValidationAlerts";
import QuickEditClientDialog from "@/components/proposal/QuickEditClientDialog";
import QuickCreateClientDialog from "@/components/proposal/QuickCreateClientDialog";
import { regenerateCommissionProjections } from "@/lib/commissionProjections";
import { useProposalServiceItems, type ProposalServiceItem } from "@/hooks/useProposalServiceItems";
// Two-level scope item for proposal
interface ScopeChild {
  id: string;
  description: string;
  hours: number;
  included: boolean;
  notes?: string; // comentário impresso no escopo detalhado
}

interface ScopeProcess {
  id: string;
  description: string;
  included: boolean;
  children: ScopeChild[];
  templateId?: string; // track origin template for reference only
  projectId?: string; // track origin project for reference only
  groupId?: string; // manual group id
  notes?: string; // comentário interno (comunicação arquiteto/ESN)
}

interface PaymentCondition {
  installment: number;
  dueDate: string;
  amount: number;
}

const steps = [
  { id: 1, label: "Dados Gerais", icon: FileText },
  { id: 2, label: "Escopo", icon: ClipboardList },
  { id: 3, label: "Financeiro", icon: Landmark },
  { id: 4, label: "Revisão", icon: Sparkles },
];

let idCounter = 0;
function localId() {
  return `local_${Date.now()}_${++idCounter}`;
}

function formatDateForInput(date: Date) {
  return date.toISOString().split("T")[0];
}

function getDefaultFirstDueDate() {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);
  return formatDateForInput(dueDate);
}

function addMonthsToDate(dateStr: string, months: number) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setMonth(date.getMonth() + months);
  return formatDateForInput(date);
}

function buildLinearPayments(count: number, total: number, startDate: string): PaymentCondition[] {
  if (count <= 0) return [];

  const perInstallment = Math.round((total / count) * 100) / 100;
  const remainder = Math.round((total - perInstallment * (count - 1)) * 100) / 100;

  return Array.from({ length: count }, (_, index) => ({
    installment: index + 1,
    dueDate: startDate ? addMonthsToDate(startDate, index) : "",
    amount: index === count - 1 ? remainder : perInstallment,
  }));
}

export default function ProposalCreate() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const duplicateId = searchParams.get("duplicar");
  const initialStep = searchParams.get("step");
  const isEditing = !!id;
  const isDuplicating = !!duplicateId;

  const { user } = useAuth();
  const { role: userRole } = useUserRole();
  const isConsulta = userRole === "consulta";
  const { toast } = useToast();
  const { data: clients = [] } = useClients();
  const { data: salesTeam = [] } = useSalesTeam();
  const { data: scopeTemplates = [] } = useScopeTemplates();
  const { data: productsList = [] } = useProducts();
  const { data: units = [] } = useUnits();
  const { data: proposalDefaults } = useProposalDefaults();
  const { data: proposalTypes = [] } = useQuery({
    queryKey: ["proposal_types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("proposal_types").select("*").order("name");
      if (error) throw error;
      return data as any[];
    },
    staleTime: 5 * 60 * 1000,
  });
  const createProposal = useCreateProposal();
  const updateProposal = useUpdateProposal();
  const { data: existingProposal, isLoading: loadingProposal, error: proposalError } = useProposal(isEditing ? id : duplicateId || undefined);

  const [loaded, setLoaded] = useState(false);
  const [lastHydratedAt, setLastHydratedAt] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(initialStep ? parseInt(initialStep, 10) : 1);
  const [maxUnlockedStep, setMaxUnlockedStep] = useState(isEditing ? 4 : (initialStep ? parseInt(initialStep, 10) : 1));
  const [proposalNumber, setProposalNumber] = useState("");
  const [proposalType, setProposalType] = useState<string>("");
  const [product, setProduct] = useState<string>("");
  const [clientId, setClientId] = useState<string>("");
  const [clientSearch, setClientSearch] = useState("");
  const [esnId, setEsnId] = useState<string>("");
  const [arquitetoId, setArquitetoId] = useState<string>("");
  const [esnSearch, setEsnSearch] = useState("");
  const [arquitetoSearch, setArquitetoSearch] = useState("");
  const [esnPopoverOpen, setEsnPopoverOpen] = useState(false);
  const [arquitetoPopoverOpen, setArquitetoPopoverOpen] = useState(false);
  const [scopeType, setScopeType] = useState<string>("detalhado");
  const [hourlyRate, setHourlyRate] = useState(250);
  const [gpPercentage, setGpPercentage] = useState(20);
  const [accompAnalyst, setAccompAnalyst] = useState(15);
  const [accompGP, setAccompGP] = useState(10);
  const [payments, setPayments] = useState<PaymentCondition[]>([{ installment: 1, dueDate: "", amount: 0 }]);
  const [paymentMode, setPaymentMode] = useState<"linear" | "custom">("linear");
  const [numInstallments, setNumInstallments] = useState(1);
  const [firstDueDate, setFirstDueDate] = useState("");
  const [negotiation, setNegotiation] = useState("");
  const [description, setDescription] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [dateValidity, setDateValidity] = useState("");
  const [travelLocalHours, setTravelLocalHours] = useState(1);
  const [travelTripHours, setTravelTripHours] = useState(4);
  const [travelHourlyRate, setTravelHourlyRate] = useState(250);
  const [additionalAnalystRate, setAdditionalAnalystRate] = useState(280);
  const [additionalGpRate, setAdditionalGpRate] = useState(300);
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);
  const [generateOnSave, setGenerateOnSave] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Scope state: flat list of processes with children
  const [scopeProcesses, setScopeProcesses] = useState<ScopeProcess[]>([]);
  const [expandedProcessIds, setExpandedProcessIds] = useState<Set<string>>(new Set());

  // Notes dialog state (replaces inline notesOpenIds)
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [notesDialogValue, setNotesDialogValue] = useState("");
  const [notesDialogTarget, setNotesDialogTarget] = useState<{ type: "process" | "child" | "group"; processId?: string; childId?: string; groupKey?: string } | null>(null);
  const [notesDialogLabel, setNotesDialogLabel] = useState("");

  // Template search/selection
  const [templateSearch, setTemplateSearch] = useState("");
  const [addedTemplateIds, setAddedTemplateIds] = useState<Set<string>>(new Set());
  const [expandedTemplateIds, setExpandedTemplateIds] = useState<Set<string>>(new Set());
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [addedProjectIds, setAddedProjectIds] = useState<Set<string>>(new Set());
  const [quickEditOpen, setQuickEditOpen] = useState(false);
  const [quickCreateClientOpen, setQuickCreateClientOpen] = useState(false);
  const queryClient = useQueryClient();
  const [manualGroupNames, setManualGroupNames] = useState<Record<string, string>>({});
  const [groupNotes, setGroupNotes] = useState<Record<string, string>>({});
  const [groupOrder, setGroupOrder] = useState<string[]>([]);
  // Solicitar EV dialog state
  const [solicitarEvDialogOpen, setSolicitarEvDialogOpen] = useState(false);
  const [solicitarEvMessage, setSolicitarEvMessage] = useState("");
  const [solicitarEvSending, setSolicitarEvSending] = useState(false);

  // Service item inline edit dialog
  const [editServiceItemOpen, setEditServiceItemOpen] = useState(false);
  const [editingServiceItem, setEditingServiceItem] = useState<ProposalServiceItem | null>(null);

  // Type change confirmation
  const [pendingTypeChange, setPendingTypeChange] = useState<string | null>(null);
  const [isTypeChangeProcessing, setIsTypeChangeProcessing] = useState(false);

  function handleProposalTypeChange(newType: string) {
    // If editing and service items already exist, ask for confirmation
    if (isEditing && hasServiceItems && newType !== proposalType) {
      setPendingTypeChange(newType);
      return;
    }
    setProposalType(newType);
  }

  function confirmTypeChange() {
    if (!pendingTypeChange) return;
    setIsTypeChangeProcessing(true);
    setProposalType(pendingTypeChange);
    resetServiceItemsToTemplate();
    setPendingTypeChange(null);
    // Small delay for visual feedback
    setTimeout(() => setIsTypeChangeProcessing(false), 600);
  }

  async function writeProposalLog(entry: {
    stage: string;
    severity?: "info" | "error" | "warn";
    action?: string;
    proposalId?: string | null;
    errorMessage?: string | null;
    errorCode?: string | null;
    payload?: Record<string, any>;
    metadata?: Record<string, any>;
  }) {
    const session = (await supabase.auth.getSession()).data.session;
    const authUser = session?.user;
    if (!authUser) return;

    await supabase.from("proposal_process_logs").insert({
      stage: entry.stage,
      severity: entry.severity || "info",
      action: entry.action || (isEditing ? "proposal_update" : "proposal_create"),
      proposal_id: entry.proposalId || null,
      client_id: clientId || null,
      user_id: authUser.id,
      user_email: authUser.email || user?.email || null,
      user_name: (user?.user_metadata?.display_name as string | undefined) || authUser.email || null,
      proposal_number: proposalNumber || null,
      error_message: entry.errorMessage || null,
      error_code: entry.errorCode || null,
      payload: entry.payload || {},
      metadata: entry.metadata || {},
      error_details: {
        route: window.location.pathname,
        is_editing: isEditing,
        is_duplicating: isDuplicating,
        generate_on_save: generateOnSave,
      },
    });
  }

  // Load existing proposal data for editing or duplicating
  useEffect(() => {
    const proposalUpdatedAt = (existingProposal as any)?.updated_at;
    const needsRehydration = loaded && proposalUpdatedAt && proposalUpdatedAt !== lastHydratedAt;
    if (!existingProposal || (loaded && !isDuplicating && !needsRehydration)) return;

    setProposalNumber(isDuplicating ? "" : existingProposal.number);
    setProposalType(existingProposal.type);
    setProduct(existingProposal.product);
    setClientId(existingProposal.client_id);
    setEsnId(existingProposal.esn_id || "");
    setArquitetoId(existingProposal.arquiteto_id || "");
    setScopeType(existingProposal.scope_type);
    setHourlyRate(existingProposal.hourly_rate);
    setGpPercentage(existingProposal.gp_percentage);
    setAccompAnalyst(existingProposal.accomp_analyst);
    setAccompGP(existingProposal.accomp_gp);
    setNegotiation(existingProposal.negotiation || "");
    setDescription(existingProposal.description || "");
    setTravelLocalHours(existingProposal.travel_local_hours);
    setTravelTripHours(existingProposal.travel_trip_hours);
    setTravelHourlyRate(existingProposal.travel_hourly_rate);
    setAdditionalAnalystRate(existingProposal.additional_analyst_rate);
    setAdditionalGpRate(existingProposal.additional_gp_rate);
    setExpectedCloseDate(existingProposal.expected_close_date || "");
    setDateValidity(existingProposal.date_validity || "");
    const loadedGroupNotes = (existingProposal as any).group_notes || {};
    setGroupNotes(loadedGroupNotes);
    const loadedManualGroups: Record<string, string> = loadedGroupNotes._manual_groups || {};
    if (Object.keys(loadedManualGroups).length > 0) {
      setManualGroupNames(loadedManualGroups);
    } else if (loadedGroupNotes._avulso_name) {
      const legacyGid = localId();
      setManualGroupNames({ [legacyGid]: loadedGroupNotes._avulso_name });
    } else {
      setManualGroupNames({});
    }
    setDefaultsLoaded(true);

    const items = (existingProposal as any).proposal_scope_items || [];
    const processes: ScopeProcess[] = [];
    const parentMap = new Map<string, ScopeProcess>();
    const parentItems = items.filter((i: any) => !i.parent_id);
    const childItems = items.filter((i: any) => i.parent_id);

    if (childItems.length === 0) {
      for (const item of items) {
        processes.push({
          id: item.id,
          description: item.description,
          included: item.included,
          templateId: item.template_id || undefined,
          children: [{
            id: localId(),
            description: item.description,
            hours: item.hours,
            included: item.included,
          }],
        });
      }
    } else {
      const processGroupMap: Record<string, string> = loadedGroupNotes._process_group_map || {};
      for (const item of parentItems) {
        const mappedGroupId = processGroupMap[item.id] || undefined;
        let templateId = item.template_id || undefined;
        let projectId: string | undefined = undefined;
        if (item.project_id) {
          projectId = item.project_id;
          templateId = item.template_id ? `_project_${item.project_id}_${item.template_id}` : undefined;
        }
        const proc: ScopeProcess = {
          id: item.id,
          description: item.description,
          included: item.included,
          templateId,
          projectId,
          groupId: mappedGroupId,
          notes: item.notes || "",
          children: [],
        };
        parentMap.set(item.id, proc);
        processes.push(proc);
      }
      for (const child of childItems) {
        const parent = parentMap.get(child.parent_id);
        if (parent) {
          parent.children.push({
            id: child.id,
            description: child.description,
            hours: child.hours,
            included: child.included,
            notes: child.notes || "",
          });
        }
      }
    }

    setScopeProcesses(processes);
    setExpandedProcessIds(new Set());
    setExpandedTemplateIds(new Set());

    const tids = new Set<string>();
    const pids = new Set<string>();
    const inferredGroupOrder: string[] = [];
    for (const proc of processes) {
      if (proc.templateId) tids.add(proc.templateId);
      if (proc.projectId) pids.add(proc.projectId);
      const groupKey = proc.templateId || proc.groupId;
      if (groupKey && !inferredGroupOrder.includes(groupKey)) inferredGroupOrder.push(groupKey);
    }
    for (const gid of Object.keys(loadedManualGroups)) {
      if (!inferredGroupOrder.includes(gid)) inferredGroupOrder.push(gid);
    }
    const savedGroupOrder = Array.isArray(loadedGroupNotes._group_order) ? loadedGroupNotes._group_order : [];
    setGroupOrder(savedGroupOrder.length > 0
      ? [...savedGroupOrder.filter((key: string) => inferredGroupOrder.includes(key)), ...inferredGroupOrder.filter((key) => !savedGroupOrder.includes(key))]
      : inferredGroupOrder
    );
    setAddedTemplateIds(tids);
    setAddedProjectIds(pids);

    const pays = (existingProposal as any).payment_conditions || [];
    if (pays.length > 0) {
      const loadedPayments = pays.map((p: any) => ({ installment: p.installment, dueDate: p.due_date || "", amount: p.amount }));
      setPayments(loadedPayments);
      setNumInstallments(loadedPayments.length);
      setFirstDueDate(loadedPayments[0]?.dueDate || getDefaultFirstDueDate());
      const amounts = loadedPayments.map((p: any) => p.amount);
      const allEqual = amounts.every((a: number) => Math.abs(a - amounts[0]) < 0.02);
      setPaymentMode(allEqual ? "linear" : "custom");
    } else {
      setPayments([]);
      setFirstDueDate(getDefaultFirstDueDate());
    }

    setLoaded(true);
    setMaxUnlockedStep(4); // all steps unlocked for editing/duplicating
    setLastHydratedAt((existingProposal as any)?.updated_at || null);
  }, [existingProposal, loaded, isDuplicating, lastHydratedAt]);

  // Load defaults for new proposals
  useEffect(() => {
    if (!isEditing && !isDuplicating && proposalDefaults && !defaultsLoaded) {
      setHourlyRate(proposalDefaults.hourly_rate);
      setGpPercentage(proposalDefaults.gp_percentage);
      setAccompAnalyst((proposalDefaults as any).accomp_analyst_percentage ?? 15);
      setAccompGP((proposalDefaults as any).accomp_gp_percentage ?? 10);
      setTravelLocalHours(proposalDefaults.travel_local_hours);
      setTravelTripHours(proposalDefaults.travel_trip_hours);
      setTravelHourlyRate(proposalDefaults.travel_hourly_rate);
      setAdditionalAnalystRate(proposalDefaults.additional_analyst_rate);
      setAdditionalGpRate(proposalDefaults.additional_gp_rate);

      // Default expected close date = last day of current month
      const now = new Date();
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setExpectedCloseDate(lastDay.toISOString().split("T")[0]);

      // Default date validity = today + 30 days
      const validity = new Date();
      validity.setDate(validity.getDate() + 30);
      setDateValidity(formatDateForInput(validity));

      // Default first payment due date = 30 days from today
      setFirstDueDate(getDefaultFirstDueDate());

      setDefaultsLoaded(true);
    }
  }, [proposalDefaults, isEditing, isDuplicating, defaultsLoaded]);

  // Auto-detect ESN from logged user email for new proposals
  useEffect(() => {
    if (!isEditing && !isDuplicating && !esnId && user?.email && salesTeam.length > 0) {
      const match = salesTeam.find(
        (m) => m.role === "esn" && m.email && m.email.toLowerCase() === user.email!.toLowerCase()
      );
      if (match) setEsnId(match.id);
    }
  }, [user?.email, salesTeam, isEditing, isDuplicating, esnId]);

  const selectedEsn = salesTeam.find((m) => m.id === esnId);
  const autoGsn = selectedEsn?.linked_gsn_id ? salesTeam.find((m) => m.id === selectedEsn.linked_gsn_id) : null;
  const selectedClient = clients.find((c) => c.id === clientId);
  const clientWarnings = useMemo(() => {
    if (!selectedClient) return [];
    return getClientWarnings(selectedClient, salesTeam, user?.email || undefined);
  }, [selectedClient, salesTeam, user?.email]);

  const filteredClients = clients.filter((c) =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase()) || c.code.includes(clientSearch)
  );

  const availableTemplates = useMemo(() => {
    // Only show approved templates in proposals
    let templates = scopeTemplates.filter((t: any) => (t as any).status === "aprovado");
    if (templateSearch) {
      const q = templateSearch.toLowerCase();
      templates = templates.filter((t) => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q) || t.product.toLowerCase().includes(q));
    }
    return templates;
  }, [scopeTemplates, templateSearch]);

  // Fetch projects for current client (with scope items)
  const { data: clientProjects = [], refetch: refetchProjects } = useQuery({
    queryKey: ["client_projects", clientId],
    enabled: !!clientId,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, product, status, created_at, description, group_notes, proposal_id, proposal_number, sales_team!projects_arquiteto_id_fkey(name), project_scope_items(id, description, hours, included, parent_id, template_id, notes, sort_order, phase)")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const filteredProjects = useMemo(() => {
    if (!projectSearch) return clientProjects;
    const q = projectSearch.toLowerCase();
    return clientProjects.filter((p: any) =>
      (p.product || "").toLowerCase().includes(q) ||
      (p.status || "").toLowerCase().includes(q) ||
      (p.description || "").toLowerCase().includes(q) ||
      (p.sales_team?.name || "").toLowerCase().includes(q)
    );
  }, [clientProjects, projectSearch]);

  // Import project scope items into proposal scope — grouped by original template
  function addProjectToScope(project: any) {
    if (addedProjectIds.has(project.id)) return;
    const items = project.project_scope_items || [];
    const projectGroupNotes = project.group_notes || {};
    const processGroupMap: Record<string, string> = projectGroupNotes._process_group_map || {};
    const projectManualGroups: Record<string, string> = projectGroupNotes._manual_groups || {};

    const parentItems = items.filter((i: any) => !i.parent_id).sort((a: any, b: any) => a.sort_order - b.sort_order);
    const childrenMap = new Map<string, any[]>();
    items.filter((i: any) => i.parent_id).forEach((i: any) => {
      if (!childrenMap.has(i.parent_id)) childrenMap.set(i.parent_id, []);
      childrenMap.get(i.parent_id)!.push(i);
    });

    const groupProcessesMap = new Map<string, any[]>();

    for (const parent of parentItems) {
      const origGroupId = processGroupMap[parent.id];
      let groupKey: string;

      if (origGroupId && projectManualGroups[origGroupId]) {
        groupKey = `_project_${project.id}_manual_${origGroupId}`;
      } else if (parent.template_id) {
        groupKey = `_project_${project.id}_${parent.template_id}`;
      } else {
        groupKey = `_project_${project.id}_ungrouped`;
      }

      if (!groupProcessesMap.has(groupKey)) groupProcessesMap.set(groupKey, []);
      groupProcessesMap.get(groupKey)!.push(parent);
    }

    if (parentItems.length === 0 && items.length > 0) {
      const groupKey = `_project_${project.id}_ungrouped`;
      for (const item of items.sort((a: any, b: any) => a.sort_order - b.sort_order)) {
        if (!groupProcessesMap.has(groupKey)) groupProcessesMap.set(groupKey, []);
        groupProcessesMap.get(groupKey)!.push({ ...item, _flat: true });
      }
    }

    const newProcesses: ScopeProcess[] = [];
    const newGroupKeys: string[] = [];
    const newManualGroupNames: Record<string, string> = {};

    for (const [groupKey, parents] of groupProcessesMap) {
      newGroupKeys.push(groupKey);
      const manualMatch = groupKey.match(/_project_[^_]+_manual_(.+)/);
      if (manualMatch) {
        const origGid = manualMatch[1];
        newManualGroupNames[groupKey] = projectManualGroups[origGid] || "Grupo";
      }

      for (const parent of parents) {
        if (parent._flat) {
          newProcesses.push({
            id: localId(),
            description: parent.description,
            included: parent.included,
            templateId: manualMatch ? undefined : groupKey,
            groupId: manualMatch ? groupKey : undefined,
            projectId: project.id,
            children: [{
              id: localId(),
              description: parent.description,
              hours: parent.hours || 0,
              included: parent.included,
            }],
          });
        } else {
          const kids = (childrenMap.get(parent.id) || []).sort((a: any, b: any) => a.sort_order - b.sort_order);
          newProcesses.push({
            id: localId(),
            description: parent.description,
            included: parent.included,
            templateId: manualMatch ? undefined : groupKey,
            groupId: manualMatch ? groupKey : undefined,
            projectId: project.id,
            notes: parent.notes || "",
            children: kids.map((kid: any) => ({
              id: localId(),
              description: kid.description,
              hours: kid.hours || 0,
              included: kid.included,
              notes: kid.notes || "",
            })),
          });
        }
      }
    }

    setScopeProcesses((prev) => [...prev, ...newProcesses]);
    setManualGroupNames((prev) => ({ ...prev, ...newManualGroupNames }));
    setGroupOrder((prev) => [...prev, ...newGroupKeys.filter((key) => !prev.includes(key))]);
    setAddedProjectIds((prev) => new Set([...prev, project.id]));
    setAddedTemplateIds((prev) => {
      const next = new Set(prev);
      newGroupKeys.forEach((k) => next.add(k));
      return next;
    });
  }

  function removeProjectFromScope(projectId: string) {
    const prefix = `_project_${projectId}_`;
    setScopeProcesses((prev) => prev.filter((p) => !p.templateId?.startsWith(prefix) && !p.groupId?.startsWith(prefix)));
    setManualGroupNames((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !key.startsWith(prefix))));
    setGroupOrder((prev) => prev.filter((key) => !key.startsWith(prefix)));
    setAddedProjectIds((prev) => {
      const next = new Set(prev);
      next.delete(projectId);
      return next;
    });
    setAddedTemplateIds((prev) => {
      const next = new Set(prev);
      for (const k of next) {
        if (k.startsWith(prefix)) next.delete(k);
      }
      return next;
    });
  }

  // Get the current proposal type config for labels and rounding
  const currentProposalTypeConfig = useMemo(() => {
    return proposalTypes.find((pt: any) => pt.slug === proposalType) || null;
  }, [proposalType, proposalTypes]);

  const analystLabel = currentProposalTypeConfig?.analyst_label || "Analista de Implantação";
  const gpLabel = currentProposalTypeConfig?.gp_label || "Coordenador de Projeto";
  const roundingFactor = currentProposalTypeConfig?.rounding_factor || 8;

   // Lock scope editing when projects are linked (any user/status)
   const isAdmin = userRole === "admin";
   const hasLinkedProject = addedProjectIds.size > 0;
   // Find the project linked via proposal_id (the primary linked project)
   const linkedProject = useMemo(() => {
     if (!isEditing || !id) return null;
     return clientProjects.find((p: any) => p.id && (addedProjectIds.has(p.id) || p.proposal_id === id)) || null;
   }, [clientProjects, addedProjectIds, isEditing, id]);
   const scopeLocked = hasLinkedProject || !!linkedProject;
   const proposalStatus = (existingProposal as any)?.status || "pendente";
   const evAlreadyRequested = !!(existingProposal as any)?.ev_requested;
   const hideIncluirProjeto = isEditing && proposalStatus !== "pendente";

  // Round up to nearest multiple of rounding factor
  function roundUpFactor(val: number) {
    return Math.ceil(val / roundingFactor) * roundingFactor;
  }

  // Raw scope hours for UI summary
  const rawScopeHours = useMemo(() => {
    let total = 0;
    for (const proc of scopeProcesses) {
      if (proc.included) {
        for (const child of proc.children) {
          if (child.included) total += child.hours;
        }
      }
    }
    return total;
  }, [scopeProcesses]);

  // Financial hours keep the configured rounding rule
  const totalHours = useMemo(() => {
    return roundUpFactor(rawScopeHours);
  }, [rawScopeHours, roundingFactor]);

  // Service items hook - dynamic service items per proposal
  const {
    items: serviceItems,
    totalServiceHours,
    totalServiceValue,
    goLiveItems,
    updateItem: updateServiceItem,
    getItemsForSave: getServiceItemsForSave,
    hasItems: hasServiceItems,
    resetToTemplate: resetServiceItemsToTemplate,
  } = useProposalServiceItems(proposalType, id, isEditing, rawScopeHours);

   // Group scope processes by template for grouped display
  const groupedScope = useMemo(() => {
    const groupsByKey = new Map<string, { templateId: string | undefined; groupId?: string; templateName: string; category: string; processes: ScopeProcess[] }>();
    const templateGroups = new Map<string, ScopeProcess[]>();
    const manualGroups = new Map<string, ScopeProcess[]>();

    for (const proc of scopeProcesses) {
      if (proc.templateId) {
        if (!templateGroups.has(proc.templateId)) templateGroups.set(proc.templateId, []);
        templateGroups.get(proc.templateId)!.push(proc);
      } else if (proc.groupId) {
        if (!manualGroups.has(proc.groupId)) manualGroups.set(proc.groupId, []);
        manualGroups.get(proc.groupId)!.push(proc);
      }
    }

    for (const [tid, procs] of templateGroups) {
      const isProjectGroup = tid.startsWith("_project_");
      if (isProjectGroup) {
        const parts = tid.replace("_project_", "").split("_");
        const origTemplateId = parts.slice(1).join("_");
        const tmpl = origTemplateId && origTemplateId !== "_no_template_"
          ? scopeTemplates.find((t) => t.id === origTemplateId)
          : null;
        groupsByKey.set(tid, {
          templateId: tid,
          templateName: tmpl?.name || "Itens Avulsos",
          category: tmpl?.category || "Projeto",
          processes: procs,
        });
      } else {
        const tmpl = scopeTemplates.find((t) => t.id === tid);
        groupsByKey.set(tid, {
          templateId: tid,
          templateName: tmpl?.name || "Template",
          category: tmpl?.category || "",
          processes: procs,
        });
      }
    }

    for (const gid of Object.keys(manualGroupNames)) {
      groupsByKey.set(gid, {
        templateId: undefined,
        groupId: gid,
        templateName: manualGroupNames[gid] || "Novo Grupo",
        category: "",
        processes: manualGroups.get(gid) || [],
      });
    }

    const orderedKeys = [...groupOrder.filter((key) => groupsByKey.has(key)), ...Array.from(groupsByKey.keys()).filter((key) => !groupOrder.includes(key))];
    return orderedKeys.map((key) => groupsByKey.get(key)!).filter(Boolean);
  }, [scopeProcesses, scopeTemplates, manualGroupNames, groupOrder]);

  function toggleTemplateExpand(templateId: string) {
    setExpandedTemplateIds((prev) => {
      const next = new Set(prev);
      if (next.has(templateId)) next.delete(templateId);
      else next.add(templateId);
      return next;
    });
  }

  // Use service items for financial calculations when available, fallback to legacy
  const gpHours = hasServiceItems ? 0 : roundUpFactor(Math.ceil(totalHours * (gpPercentage / 100)));
  const totalValue = hasServiceItems ? totalServiceValue : (totalHours + gpHours) * hourlyRate;

  const clientUnit = useMemo(() => {
    if (!selectedClient?.unit_id) return null;
    return units.find((u) => u.id === selectedClient.unit_id) || null;
  }, [selectedClient, units]);
  const taxFactor = clientUnit?.tax_factor || 0;
  const totalValueGross = taxFactor > 0 ? totalValue / taxFactor : totalValue;

  // Add template to proposal scope (copy its items)
  function addTemplateToScope(templateId: string) {
    if (addedTemplateIds.has(templateId)) return;
    const template = scopeTemplates.find((t) => t.id === templateId);
    if (!template) return;

    const allItems = (template as any).scope_template_items || [];
    const parents = allItems.filter((i: any) => !i.parent_id).sort((a: any, b: any) => a.sort_order - b.sort_order);
    const childrenMap = new Map<string, any[]>();
    allItems.filter((i: any) => i.parent_id).forEach((i: any) => {
      if (!childrenMap.has(i.parent_id)) childrenMap.set(i.parent_id, []);
      childrenMap.get(i.parent_id)!.push(i);
    });

    const newProcesses: ScopeProcess[] = parents.map((parent: any) => {
      const kids = (childrenMap.get(parent.id) || []).sort((a: any, b: any) => a.sort_order - b.sort_order);
      return {
        id: localId(),
        description: parent.description,
        included: true,
        templateId,
        notes: parent.notes || undefined,
        children: kids.map((kid: any) => ({
          id: localId(),
          description: kid.description,
          hours: kid.default_hours || 0,
          included: true,
          notes: kid.notes || undefined,
        })),
      };
    });

    if (parents.length === 0 && allItems.length > 0) {
      for (const item of allItems.sort((a: any, b: any) => a.sort_order - b.sort_order)) {
        newProcesses.push({
          id: localId(),
          description: item.description,
          included: true,
          templateId,
          children: [],
        });
      }
    }

    setScopeProcesses((prev) => [...prev, ...newProcesses]);
    setGroupOrder((prev) => (prev.includes(templateId) ? prev : [...prev, templateId]));
    setAddedTemplateIds((prev) => new Set([...prev, templateId]));
  }

  // Remove a template's processes from scope
  function removeTemplateFromScope(templateId: string) {
    setScopeProcesses((prev) => prev.filter((p) => p.templateId !== templateId));
    setGroupOrder((prev) => prev.filter((key) => key !== templateId));
    setAddedTemplateIds((prev) => {
      const next = new Set(prev);
      next.delete(templateId);
      return next;
    });
  }

  // Toggle process included (cascade to children)
  function toggleProcess(processId: string) {
    setScopeProcesses((prev) =>
      prev.map((p) => {
        if (p.id !== processId) return p;
        const newIncluded = !p.included;
        return {
          ...p,
          included: newIncluded,
          children: p.children.map((c) => ({ ...c, included: newIncluded })),
        };
      })
    );
  }

  // Toggle child included
  function toggleChild(processId: string, childId: string) {
    setScopeProcesses((prev) =>
      prev.map((p) => {
        if (p.id !== processId) return p;
        const newChildren = p.children.map((c) =>
          c.id === childId ? { ...c, included: !c.included } : c
        );
        return { ...p, children: newChildren };
      })
    );
  }

  // Update child hours
  function updateChildHours(processId: string, childId: string, hours: number) {
    setScopeProcesses((prev) =>
      prev.map((p) => {
        if (p.id !== processId) return p;
        return {
          ...p,
          children: p.children.map((c) => (c.id === childId ? { ...c, hours } : c)),
        };
      })
    );
  }

  // Update process description
  function updateProcessDescription(processId: string, desc: string) {
    setScopeProcesses((prev) => prev.map((p) => p.id === processId ? { ...p, description: desc } : p));
  }

  // Update process notes (internal comment)
  function updateProcessNotes(processId: string, notes: string) {
    setScopeProcesses((prev) => prev.map((p) => p.id === processId ? { ...p, notes } : p));
  }

  // Update child description
  function updateChildDescription(processId: string, childId: string, desc: string) {
    setScopeProcesses((prev) =>
      prev.map((p) => {
        if (p.id !== processId) return p;
        return { ...p, children: p.children.map((c) => c.id === childId ? { ...c, description: desc } : c) };
      })
    );
  }

  // Update child notes (printable comment)
  function updateChildNotes(processId: string, childId: string, notes: string) {
    setScopeProcesses((prev) =>
      prev.map((p) => {
        if (p.id !== processId) return p;
        return { ...p, children: p.children.map((c) => c.id === childId ? { ...c, notes } : c) };
      })
    );
  }

  // Notes dialog helpers
  function openNotesDialog(target: typeof notesDialogTarget, currentValue: string, label: string) {
    setNotesDialogTarget(target);
    setNotesDialogValue(currentValue);
    setNotesDialogLabel(label);
    setNotesDialogOpen(true);
  }

  function saveNotesDialog() {
    if (!notesDialogTarget) return;
    const { type, processId, childId, groupKey } = notesDialogTarget;
    if (type === "process" && processId) {
      updateProcessNotes(processId, notesDialogValue);
    } else if (type === "child" && processId && childId) {
      updateChildNotes(processId, childId, notesDialogValue);
    } else if (type === "group" && groupKey) {
      setGroupNotes((prev) => ({ ...prev, [groupKey]: notesDialogValue }));
    }
    setNotesDialogOpen(false);
  }

  // Add new manual group
  function addGroup() {
    const gid = localId();
    const newProc: ScopeProcess = {
      id: localId(),
      description: "",
      included: true,
      groupId: gid,
      children: [{ id: localId(), description: "", hours: 0, included: true }],
    };
    setManualGroupNames((prev) => ({ ...prev, [gid]: "Novo Grupo" }));
    setGroupOrder((prev) => [...prev, gid]);
    setScopeProcesses((prev) => [...prev, newProc]);
    setExpandedTemplateIds((prev) => new Set([...prev, gid]));
    setExpandedProcessIds((prev) => new Set([...prev, newProc.id]));
  }

  // Add process to a group (manual or template)
  function addProcessToGroup(groupIdOrTemplateId: string) {
    const isTemplate = addedTemplateIds.has(groupIdOrTemplateId);
    const newProc: ScopeProcess = {
      id: localId(),
      description: "",
      included: true,
      templateId: isTemplate ? groupIdOrTemplateId : undefined,
      groupId: isTemplate ? undefined : groupIdOrTemplateId,
      children: [{ id: localId(), description: "", hours: 0, included: true }],
    };
    setScopeProcesses((prev) => [...prev, newProc]);
    setExpandedProcessIds((prev) => new Set([...prev, newProc.id]));
  }

  // Add child to process
  function addChild(processId: string) {
    setScopeProcesses((prev) =>
      prev.map((p) => {
        if (p.id !== processId) return p;
        return { ...p, children: [...p.children, { id: localId(), description: "", hours: 0, included: true }] };
      })
    );
  }

  // Remove process
  function removeProcess(processId: string) {
    setScopeProcesses((prev) => prev.filter((p) => p.id !== processId));
  }

  // Remove child
  function removeChild(processId: string, childId: string) {
    setScopeProcesses((prev) =>
      prev.map((p) => {
        if (p.id !== processId) return p;
        return { ...p, children: p.children.filter((c) => c.id !== childId) };
      })
    );
  }

  // Toggle expand
  function toggleExpand(processId: string) {
    setExpandedProcessIds((prev) => {
      const next = new Set(prev);
      if (next.has(processId)) next.delete(processId);
      else next.add(processId);
      return next;
    });
  }

  // Process hours = sum of included children
  function processHours(proc: ScopeProcess) {
    return proc.children.filter((c) => c.included).reduce((s, c) => s + c.hours, 0);
  }

  function addPayment() {
    setPayments((prev) => [...prev, { installment: prev.length + 1, dueDate: "", amount: 0 }]);
  }

  function removePayment(index: number) {
    setPayments((prev) => prev.filter((_, i) => i !== index).map((p, i) => ({ ...p, installment: i + 1 })));
  }

  function generateLinearPayments(count: number, total: number, startDate: string) {
    if (count <= 0) return;
    const effectiveStartDate = startDate || getDefaultFirstDueDate();
    if (!startDate) setFirstDueDate(effectiveStartDate);
    setPayments(buildLinearPayments(count, total, effectiveStartDate));
  }

  function handleNumInstallmentsChange(val: number) {
    setNumInstallments(val);
    if (paymentMode === "linear") generateLinearPayments(val, totalValue, firstDueDate);
  }

  function handleFirstDueDateChange(val: string) {
    setFirstDueDate(val);
    if (paymentMode === "linear") generateLinearPayments(numInstallments, totalValue, val);
  }

  function handlePaymentModeChange(mode: "linear" | "custom") {
    setPaymentMode(mode);
    if (mode === "linear") {
      generateLinearPayments(numInstallments, totalValue, firstDueDate);
    }
  }

  // Recalculate linear payments when totalValue changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (paymentMode === "linear" && numInstallments > 0) {
      generateLinearPayments(numInstallments, totalValue, firstDueDate);
    }
  }, [totalValue, firstDueDate]);

  async function handleSave(status: string, opts?: { stayOnPage?: boolean }): Promise<string | undefined> {
    const missing: string[] = [];
    if (!proposalNumber) missing.push("Número da Proposta");
    if (!clientId) missing.push("Cliente");
    if (!product) missing.push("Produto");
    if (!proposalType) missing.push("Tipo de Proposta");
    if (!esnId) missing.push("ESN (Executivo de Vendas)");


    if (missing.length > 0) {
      toast({
        title: "Campos obrigatórios não preenchidos",
        description: missing.join(", "),
        variant: "destructive",
      });
      // Navigate to step 1 where these fields are
      setCurrentStep(1);
      // Focus first missing field
      setTimeout(() => {
        const fieldMap: Record<string, string> = {
          "Número da Proposta": "proposalNumber",
          "Cliente": "clientSearch",
          "Produto": "product",
          "Tipo de Proposta": "proposalType",
        };
        const firstMissing = missing[0];
        const elId = fieldMap[firstMissing];
        if (elId) {
          const el = document.getElementById(elId);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.focus();
          }
        }
      }, 100);
      return undefined;
    }

    // Flatten scope to save: parents + children with parent_id reference
    const allScopeItems: any[] = [];
    let sortOrder = 0;
    for (const proc of scopeProcesses) {
      const parentSortOrder = sortOrder++;
      // Extract real template_id and project_id from composite key
      let realTemplateId: string | null = proc.templateId || null;
      let projectId: string | null = proc.projectId || null;
      if (proc.templateId?.startsWith("_project_")) {
        const parts = proc.templateId.replace("_project_", "").split("_");
        projectId = parts[0];
        const origTid = parts.slice(1).join("_");
        realTemplateId = origTid === "_no_template_" ? null : origTid;
      }
      allScopeItems.push({
        description: proc.description,
        included: proc.included,
        hours: processHours(proc),
        phase: 1,
        notes: proc.notes || "",
        sort_order: parentSortOrder,
        template_id: realTemplateId,
        project_id: projectId,
        parent_id: null,
        _local_id: proc.id,
        _groupId: proc.groupId || null,
      });

      for (const child of proc.children) {
        allScopeItems.push({
          description: child.description,
          included: child.included,
          hours: child.hours,
          phase: 1,
          notes: child.notes || "",
          sort_order: sortOrder++,
          template_id: realTemplateId,
          project_id: projectId,
          parent_id: proc.id,
          _local_id: child.id,
          _parent_local_id: proc.id,
        });
      }
    }

    const hasCalculatedFinancials = rawScopeHours > 0 && totalValue > 0;
    const effectiveFirstDueDate = firstDueDate || payments.find((p) => p.dueDate)?.dueDate || getDefaultFirstDueDate();

    const normalizedPayments = paymentMode === "linear"
      ? buildLinearPayments(Math.max(1, numInstallments), totalValue, effectiveFirstDueDate)
      : (payments.length > 0
          ? payments.map((payment, index) => ({
              ...payment,
              installment: payment.installment || index + 1,
              dueDate: payment.dueDate || addMonthsToDate(effectiveFirstDueDate, index),
            }))
          : (hasCalculatedFinancials ? buildLinearPayments(Math.max(1, numInstallments), totalValue, effectiveFirstDueDate) : []));

    const paymentRows = normalizedPayments
      .filter((payment) => Number.isFinite(payment.amount) && payment.amount > 0)
      .map((payment, index) => ({
        installment: payment.installment || index + 1,
        due_date: payment.dueDate || addMonthsToDate(effectiveFirstDueDate, index),
        amount: Math.round(payment.amount * 100) / 100,
      }));

    if (hasCalculatedFinancials && paymentRows.length === 0) {
      paymentRows.push({
        installment: 1,
        due_date: effectiveFirstDueDate,
        amount: Math.round(totalValue * 100) / 100,
      });
    }

    if (hasCalculatedFinancials && !paymentRows[0]?.due_date) {
      toast({
        title: "Data do primeiro vencimento inválida",
        description: "Não foi possível definir a data automaticamente para as parcelas.",
        variant: "destructive",
      });
      setCurrentStep(3);
      return undefined;
    }

    // When editing, never downgrade status. If not generating, keep existing status.
    const existingStatus = existingProposal?.status;
    const effectiveStatus = isEditing && status === "pendente" && existingStatus && existingStatus !== "pendente"
      ? existingStatus
      : status;

    const proposalData = {
      number: proposalNumber,
      type: proposalType as any,
      product,
      status: effectiveStatus,
      scope_type: scopeType as any,
      client_id: clientId,
      esn_id: esnId || null,
      gsn_id: autoGsn?.id || null,
      arquiteto_id: arquitetoId || null,
      hourly_rate: hourlyRate,
      gp_percentage: gpPercentage,
      accomp_analyst: accompAnalyst,
      accomp_gp: accompGP,
      travel_local_hours: travelLocalHours,
      travel_trip_hours: travelTripHours,
      travel_hourly_rate: travelHourlyRate,
      additional_analyst_rate: serviceItems.find(i => i.is_base_scope)?.hourly_rate ?? 280,
      additional_gp_rate: serviceItems.find(i => !i.is_base_scope)?.hourly_rate ?? 300,
      negotiation,
      description,
      expected_close_date: expectedCloseDate || formatDateForInput(new Date()),
      date_validity: dateValidity || null,
      group_notes: { ...groupNotes, _manual_groups: manualGroupNames, _group_order: groupOrder },
      scopeItems: allScopeItems,
      payments: paymentRows,
      serviceItems: [],
      ...(effectiveStatus === "em_analise_ev" ? { ev_requested: true } : {}),
    };

    try {
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      if (!freshSession?.user) {
        toast({ title: "Sessão expirada", description: "Faça login novamente para salvar.", variant: "destructive" });
        return;
      }

      const authenticatedUserId = freshSession.user.id;
      const generatedProposalId = !isEditing ? crypto.randomUUID() : undefined;
      const logPayload = {
        number: proposalNumber,
        type: proposalType,
        product,
        status,
        client_id: clientId || null,
        esn_id: esnId || null,
        gsn_id: autoGsn?.id || null,
        arquiteto_id: arquitetoId || null,
        scope_items_count: allScopeItems.length,
        payment_rows_count: paymentRows.length,
      };

      await writeProposalLog({
        stage: isEditing ? "save_started" : "create_started",
        proposalId: generatedProposalId,
        payload: logPayload,
        metadata: {
          authenticated_user_id: authenticatedUserId,
          context_user_id: user?.id || null,
          using_client_generated_ids: !isEditing,
          effective_first_due_date: effectiveFirstDueDate,
          auto_generated_payments: hasCalculatedFinancials,
        },
      });

      let savedId: string | undefined;
      if (isEditing) {
        await updateProposal.mutateAsync({ id, ...proposalData });
        savedId = id;
        await writeProposalLog({ stage: "save_success", proposalId: savedId, payload: logPayload });
        toast({ title: status === "proposta_gerada" ? "Proposta atualizada! Gerando documento..." : "Proposta atualizada!" });
      } else {
        const result = await createProposal.mutateAsync({
          ...proposalData,
          id: generatedProposalId,
          created_by: authenticatedUserId,
        });
        savedId = (result as any)?.id || generatedProposalId;
        await writeProposalLog({ stage: "create_success", proposalId: savedId, payload: logPayload });
        toast({ title: status === "proposta_gerada" ? "Proposta salva! Gerando documento..." : "Proposta salva!" });
      }

      // Persist service items
      if (savedId && hasServiceItems) {
        try {
          const siRows = getServiceItemsForSave(savedId);
          // Clear existing service items for this proposal
          await supabase.from("proposal_service_items").update({ related_item_id: null }).eq("proposal_id", savedId);
          await supabase.from("proposal_service_items").delete().eq("proposal_id", savedId);
          if (siRows.length > 0) {
            await supabase.from("proposal_service_items").insert(siRows as any);
          }
        } catch (e: any) {
          console.error("Failed to save service items:", e);
        }
      }

      // Regenerate commission projections
      if (savedId) {
        regenerateCommissionProjections(savedId).catch(() => {});
      }

      // Auto-create project when scope exists but no project is linked
      if (savedId && allScopeItems.length > 0 && addedProjectIds.size === 0) {
        try {
          const projectId = crypto.randomUUID();
          await supabase.from("projects").insert({
            id: projectId,
            client_id: clientId,
            product,
            description: description || "",
            arquiteto_id: arquitetoId || null,
            created_by: (await supabase.auth.getSession()).data.session!.user.id,
            status: "em_revisao",
            proposal_id: savedId,
            proposal_number: proposalNumber,
          } as any);

          // Read the saved proposal_scope_items to get real IDs
          const { data: savedItems } = await supabase
            .from("proposal_scope_items")
            .select("*")
            .eq("proposal_id", savedId);

          if (savedItems && savedItems.length > 0) {
            const idMap = new Map<string, string>();
            for (const item of savedItems) {
              idMap.set(item.id, crypto.randomUUID());
            }

            const parents = savedItems.filter(i => !i.parent_id);
            const children = savedItems.filter(i => i.parent_id);

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

            await supabase.from("project_scope_items").insert(projectItems);

            // Copy group_notes to the project with remapped IDs
            const savedGroupNotes: any = proposalData.group_notes || {};

            // Read real IDs from the saved proposal to remap
            const { data: savedProposal } = await supabase.from("proposals").select("group_notes").eq("id", savedId).single();
            const realPGM: Record<string, string> = (savedProposal?.group_notes as any)?._process_group_map || (savedGroupNotes._process_group_map || {});
            const newPGM: Record<string, string> = {};
            for (const [oldId, groupKey] of Object.entries(realPGM)) {
              const newId = idMap.get(oldId);
              if (newId) newPGM[newId] = groupKey;
            }

            await supabase.from("projects").update({
              group_notes: {
                _manual_groups: savedGroupNotes._manual_groups || {},
                _group_order: savedGroupNotes._group_order || [],
                _process_group_map: newPGM,
              },
            }).eq("id", projectId);

            // Set project_id on proposal_scope_items
            for (const item of savedItems) {
              await supabase.from("proposal_scope_items")
                .update({ project_id: projectId })
                .eq("id", item.id);
            }
          }
        } catch (projErr) {
          console.error("Failed to auto-create project:", projErr);
        }
      }

      // Handle Solicitar EV flow after save
      if (status === "em_analise_ev" && savedId) {
        try {
          // Check if a project was already created (via scope auto-create)
          const { data: linkedProjects } = await supabase
            .from("projects")
            .select("id")
            .eq("proposal_id", savedId);
          
          if (linkedProjects && linkedProjects.length > 0) {
            await supabase.from("projects").update({ status: "em_revisao" }).eq("id", linkedProjects[0].id);
          } else {
            // No project exists (no scope was added) — create an empty project for the EV
            const evProjectId = crypto.randomUUID();
            const currentSession = (await supabase.auth.getSession()).data.session;
            await supabase.from("projects").insert({
              id: evProjectId,
              client_id: clientId,
              product,
              description: description || "",
              arquiteto_id: arquitetoId || null,
              created_by: currentSession!.user.id,
              status: "em_revisao",
              proposal_id: savedId,
              proposal_number: proposalNumber,
            } as any);
          }

          // Send notification
          const notifSession = (await supabase.auth.getSession()).data.session;
          await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-proposal-notification`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${notifSession?.access_token}`,
              },
              body: JSON.stringify({
                proposalId: savedId,
                type: "solicitar_ajuste",
                message: "Solicitação de revisão técnica do escopo.",
                proposalLink: `${window.location.origin}/propostas/${savedId}`,
                _origin: window.location.origin,
              }),
            }
          );

          queryClient.invalidateQueries({ queryKey: ["proposals"] });
          queryClient.invalidateQueries({ queryKey: ["projects"] });
          toast({ title: "Solicitação enviada", description: "O Engenheiro de Valor foi notificado." });
        } catch (evErr) {
          console.error("Failed to send EV notification:", evErr);
          toast({ title: "Oportunidade salva, mas notificação falhou", variant: "destructive" });
        }
        navigate("/propostas");
        return;
      }

      // If stayOnPage, return savedId without navigating
      if (opts?.stayOnPage) {
        // Refresh queries so linked project data is available
        queryClient.invalidateQueries({ queryKey: ["proposals"] });
        queryClient.invalidateQueries({ queryKey: ["projects"] });
        return savedId;
      }

      // Navigate to list — if generating, pass query param so list opens the console dialog
      if (status === "proposta_gerada" && savedId) {
        navigate(`/propostas?generate=${savedId}`);
      } else {
        navigate("/propostas");
      }
    } catch (err: any) {
      await writeProposalLog({
        stage: isEditing ? "save_error" : "create_error",
        severity: "error",
        errorMessage: err.message,
        errorCode: err.code,
        payload: {
          number: proposalNumber,
          type: proposalType,
          product,
          status,
          client_id: clientId || null,
          esn_id: esnId || null,
          gsn_id: autoGsn?.id || null,
          arquiteto_id: arquitetoId || null,
          scope_items_count: allScopeItems.length,
          payment_rows_count: paymentRows.length,
        },
        metadata: {
          auth_context_user_id: user?.id || null,
          error_name: err.name || null,
        },
      });
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    }
  }

  const [isAutoSaving, setIsAutoSaving] = useState(false);

  async function handleNext() {
    const next = Math.min(4, currentStep + 1);

    // When going from Escopo (2) to Financeiro (3), validate scope and auto-save
    if (currentStep === 2 && next === 3) {
      // Check if scope has items
      const hasScope = scopeProcesses.length > 0 && scopeProcesses.some(p => 
        p.children.some(c => c.included)
      );

      if (!hasScope) {
        toast({
          title: "Escopo obrigatório",
          description: "Adicione pelo menos um item ao escopo antes de prosseguir para o Financeiro.",
          variant: "destructive",
        });
        return;
      }

      // Auto-save the opportunity to create/update the project
      setIsAutoSaving(true);
      try {
        const savedId = await handleSave("pendente", { stayOnPage: true });
        if (!savedId) {
          setIsAutoSaving(false);
          return; // handleSave already showed error toast
        }

        // If this was a new proposal, redirect to edit mode so subsequent saves work correctly
        if (!isEditing) {
          navigate(`/propostas/${savedId}?step=3`, { replace: true });
          setIsAutoSaving(false);
          return;
        }

        // Refresh data to get the linked project and service items
        await Promise.all([
          queryClient.refetchQueries({ queryKey: ["proposal", savedId] }),
          queryClient.refetchQueries({ queryKey: ["projects"] }),
          queryClient.refetchQueries({ queryKey: ["proposal-service-items", savedId] }),
        ]);

        toast({ title: "Oportunidade salva", description: "Prosseguindo para o Financeiro..." });
      } catch (err: any) {
        toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
        setIsAutoSaving(false);
        return;
      }
      setIsAutoSaving(false);
    }

    setMaxUnlockedStep((prev) => Math.max(prev, next));
    setCurrentStep(next);
  }

  const isSaving = createProposal.isPending || updateProposal.isPending || isGenerating || isAutoSaving;

  const progress = useMemo(() => (currentStep / steps.length) * 100, [currentStep]);

  const statusLabel = useMemo(() => {
    if (!isEditing) return "Novo";
    const s = (existingProposal as any)?.status;
    const map: Record<string, string> = { pendente: "Pendente", em_analise_ev: "Em Revisão", analise_ev_concluida: "Revisado", proposta_gerada: "Pendente", em_assinatura: "Em Assinatura", ganha: "Ganha", cancelada: "Cancelada" };
    return map[s] || s || "—";
  }, [isEditing, existingProposal]);

  if ((isEditing || isDuplicating) && loadingProposal) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Carregando proposta...</p>
      </div>
    );
  }

  if ((isEditing || isDuplicating) && proposalError) {
    console.error("[ProposalCreate] Erro ao carregar proposta:", proposalError);
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-destructive font-medium">Erro ao carregar proposta</p>
        <p className="text-sm text-muted-foreground max-w-md text-center">
          {(proposalError as any)?.message || "Não foi possível carregar os dados da proposta. Verifique sua conexão e permissões."}
        </p>
        <Button variant="outline" onClick={() => navigate("/propostas")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para Propostas
        </Button>
      </div>
    );
  }

  // Debug: log proposal load state
  if (isEditing && !loaded && existingProposal) {
    console.log("[ProposalCreate] Proposta carregada:", { id, scopeItemsCount: (existingProposal as any)?.proposal_scope_items?.length, status: existingProposal.status });
  }
  if (isEditing && !loaded && !loadingProposal && !existingProposal && !proposalError) {
    console.warn("[ProposalCreate] Proposta não encontrada (sem erro):", { id, loadingProposal, proposalError });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* ─── Hero Header ─────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-r from-[hsl(var(--hero-from))] via-[hsl(var(--hero-via))] to-[hsl(var(--hero-to))] p-5 text-white shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-3">
            <button onClick={() => navigate("/propostas")} className="mt-1 rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {isEditing ? "Editar Oportunidade" : isDuplicating ? "Duplicar Oportunidade" : "Nova Oportunidade"}
              </h1>
              <p className="mt-1 text-sm text-white/70">
                {proposalNumber ? `${proposalNumber}` : "Preencha as informações da oportunidade comercial"}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Cliente", selectedClient?.name || "—"],
              ["Produto", product || "—"],
              ["Tipo", proposalTypes.find((pt: any) => pt.slug === proposalType)?.name || "—"],
              ["Status", statusLabel],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-white/10 px-3 py-2 backdrop-blur-sm">
                <div className="text-[10px] font-medium uppercase tracking-wider text-white/50">{label}</div>
                <div className="mt-0.5 truncate text-sm font-semibold">{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Auto-save overlay ───────────────────────────────────── */}
      {isAutoSaving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-8 shadow-xl">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-base font-semibold text-foreground">Sincronizando escopo e projeto...</p>
            <p className="text-sm text-muted-foreground">Aguarde enquanto preparamos o Financeiro.</p>
          </div>
        </div>
      )}

      {/* ─── Type change processing overlay ──────────────────────── */}
      {isTypeChangeProcessing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-8 shadow-xl">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-base font-semibold text-foreground">Atualizando itens de serviço...</p>
            <p className="text-sm text-muted-foreground">Carregando parâmetros do novo tipo de oportunidade.</p>
          </div>
        </div>
      )}

      {/* ─── Type change confirmation dialog ─────────────────────── */}
      <AlertDialog open={!!pendingTypeChange} onOpenChange={(open) => { if (!open) setPendingTypeChange(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar Tipo de Oportunidade?</AlertDialogTitle>
            <AlertDialogDescription>
              O tipo de oportunidade possui parâmetros de itens de serviço próprios (valores hora, arredondamento, percentuais, Go-Live).
              Ao confirmar, os itens de serviço atuais serão <strong>substituídos</strong> pelos itens padrão do novo tipo selecionado.
              <br /><br />
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmTypeChange}>Confirmar Alteração</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Step Navigator ──────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Etapa <span className="font-semibold text-foreground">{currentStep}</span> de {steps.length}
          </div>
          <Badge variant="secondary" className="rounded-full text-xs">
            {Math.round(progress)}% concluído
          </Badge>
        </div>
        <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {steps.map((step) => {
            const Icon = step.icon;
            const active = step.id === currentStep;
            const completed = step.id < currentStep;
            return (
              <button
                key={step.id}
                onClick={() => {
                  if (step.id > maxUnlockedStep) return;
                  // Block jumping to Financeiro+ from Escopo without scope
                  if (currentStep === 2 && step.id >= 3) {
                    const hasScope = scopeProcesses.length > 0 && scopeProcesses.some(p => p.children.some(c => c.included));
                    if (!hasScope) {
                      toast({ title: "Escopo obrigatório", description: "Adicione itens ao escopo antes de prosseguir.", variant: "destructive" });
                      return;
                    }
                    handleNext();
                    return;
                  }
                  setCurrentStep(step.id);
                }}
                disabled={step.id > maxUnlockedStep}
                className={`group flex items-center gap-3 rounded-xl border p-3 text-left transition-all duration-200 ${
                  step.id > maxUnlockedStep
                    ? "border-border bg-muted/50 text-muted-foreground/50 cursor-not-allowed opacity-60"
                    : active
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : completed
                    ? "border-primary/20 bg-primary/5 text-foreground hover:border-primary/40"
                    : "border-border bg-card text-muted-foreground hover:border-border hover:bg-accent/50"
                }`}
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  step.id > maxUnlockedStep ? "bg-muted/30" : active ? "bg-white/20" : completed ? "bg-primary/10" : "bg-muted"
                }`}>
                  {completed && step.id <= maxUnlockedStep ? <Check className="h-4 w-4 text-primary" /> : <Icon className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{step.label}</div>
                  <div className={`text-[11px] ${step.id > maxUnlockedStep ? "text-muted-foreground/50" : active ? "text-white/70" : "text-muted-foreground"}`}>
                    {step.id > maxUnlockedStep ? "Bloqueada" : active ? "Etapa atual" : completed ? "Concluída" : "Pendente"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ Step 1: Dados Gerais ═══════════════════════════════════ */}
      {currentStep === 1 && (
        <div className="space-y-5">
          {/* ── Contexto do Cliente ─────────────────────────────────── */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm overflow-hidden">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <UserRoundSearch className="h-3.5 w-3.5 text-primary" />
              </div>
              Contexto do Cliente
            </div>

            {selectedClient ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-border bg-gradient-to-r from-accent/50 to-transparent p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Cliente selecionado</div>
                      <div className="mt-1 text-lg font-semibold text-foreground tracking-tight">{selectedClient.name}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-[11px] font-normal">{selectedClient.code}</Badge>
                        <Badge variant="outline" className="text-[11px] font-normal">{selectedClient.cnpj}</Badge>
                        {selectedClient.unit_id && units.find((u: any) => u.id === selectedClient.unit_id) && (
                          <Badge variant="outline" className="text-[11px] font-normal">
                            {(units.find((u: any) => u.id === selectedClient.unit_id) as any)?.name}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setClientId("")} className="shrink-0">Alterar</Button>
                  </div>
                </div>
                <ClientValidationAlerts warnings={clientWarnings} onEditClient={() => setQuickEditOpen(true)} />
                <QuickEditClientDialog
                  client={selectedClient}
                  open={quickEditOpen}
                  onOpenChange={setQuickEditOpen}
                  onSaved={() => queryClient.invalidateQueries({ queryKey: ["clients"] })}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="clientSearch" placeholder="Buscar cliente por nome, código ou CNPJ..." value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} className="h-10 pl-9" />
                  </div>
                  <Button variant="outline" size="icon" onClick={() => setQuickCreateClientOpen(true)} title="Cadastrar novo cliente" className="h-10 w-10">
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </div>
                {clientSearch.length >= 2 && (
                  <div className="max-h-48 overflow-auto rounded-xl border border-border bg-card shadow-md">
                    {filteredClients.map((c) => (
                      <button key={c.id} onClick={() => { setClientId(c.id); setClientSearch(""); }} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-accent/50 transition-colors border-b border-border/50 last:border-b-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                          {c.name.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-foreground truncate block">{c.name}</span>
                          <span className="text-xs text-muted-foreground">{c.code} · {c.cnpj}</span>
                        </div>
                      </button>
                    ))}
                    {filteredClients.length === 0 && (
                      <p className="px-4 py-4 text-center text-xs text-muted-foreground">Nenhum cliente encontrado.</p>
                    )}
                  </div>
                )}
                <QuickCreateClientDialog
                  open={quickCreateClientOpen}
                  onOpenChange={setQuickCreateClientOpen}
                  onClientCreated={(newId) => {
                    setClientId(newId);
                    setClientSearch("");
                  }}
                  initialSearch={clientSearch}
                />
              </div>
            )}
          </div>

          {/* ── Informações da Proposta ─────────────────────────────── */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm overflow-hidden">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="h-3.5 w-3.5 text-primary" />
              </div>
              Informações da Oportunidade
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Número da Proposta (OPP)</Label>
                <Input id="proposalNumber" placeholder="OPP-2025-XXX" value={proposalNumber} onChange={(e) => setProposalNumber(e.target.value)} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Tipo de Oportunidade</Label>
                <Select value={proposalType} onValueChange={handleProposalTypeChange}>
                  <SelectTrigger id="proposalType" className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {proposalTypes.map((pt: any) => (
                      <SelectItem key={pt.slug} value={pt.slug}>{pt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Produto</Label>
                <Select value={product} onValueChange={setProduct}>
                  <SelectTrigger id="product" className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {productsList.map((p) => (
                      <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Nível do Escopo</Label>
                <Select value={scopeType} onValueChange={setScopeType}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="detalhado">Detalhado</SelectItem>
                    <SelectItem value="macro">Macro Escopo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-xs text-muted-foreground">Descrição do Projeto</Label>
                <Textarea placeholder="Descreva o objetivo central da oportunidade e o valor esperado para o cliente..." value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[80px] resize-none" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Data Prevista de Fechamento</Label>
                <Input type="date" value={expectedCloseDate} onChange={(e) => setExpectedCloseDate(e.target.value)} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Data de Validade</Label>
                <Input type="date" value={dateValidity} onChange={(e) => setDateValidity(e.target.value)} className="h-10" />
              </div>
            </div>
          </div>

          {/* ── Time Responsável ────────────────────────────────────── */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm overflow-hidden">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <Users className="h-3.5 w-3.5 text-primary" />
              </div>
              Time Responsável
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {/* ESN */}
              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs text-muted-foreground">Executivo de Vendas (ESN)</Label>
                <Popover open={esnPopoverOpen} onOpenChange={setEsnPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-10 min-w-0">
                      <span className="truncate min-w-0">{esnId ? (() => { const m = salesTeam.find(s => s.id === esnId); return m ? `${m.code} - ${m.name}` : "Selecione"; })() : "Selecione"}</span>
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Pesquisar ESN..." value={esnSearch} onValueChange={setEsnSearch} />
                      <CommandList>
                        <CommandEmpty>Nenhum ESN encontrado.</CommandEmpty>
                        <CommandGroup>
                          {salesTeam.filter((m) => m.role === "esn" && (`${m.code} ${m.name} ${m.email || ""}`).toLowerCase().includes(esnSearch.toLowerCase())).map((m) => (
                            <CommandItem key={m.id} value={`${m.code} ${m.name}`} onSelect={() => { setEsnId(m.id); setEsnPopoverOpen(false); setEsnSearch(""); }}>
                              <Check className={`mr-2 h-4 w-4 ${esnId === m.id ? "opacity-100" : "opacity-0"}`} />
                              {m.code} - {m.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* GSN (read-only) */}
              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs text-muted-foreground">Gerente de Vendas (GSN)</Label>
                <div className="flex h-10 items-center rounded-md border border-border bg-muted/50 px-3 text-sm text-muted-foreground min-w-0">
                  <span className="truncate min-w-0">{autoGsn ? `${autoGsn.code} - ${autoGsn.name}` : "Vinculado ao ESN"}</span>
                </div>
              </div>

              {/* Engenheiro de Valor */}
              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs text-muted-foreground">Engenheiro de Valor</Label>
                <Popover open={arquitetoPopoverOpen} onOpenChange={setArquitetoPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-10 min-w-0">
                      <span className="truncate min-w-0">{arquitetoId ? (() => { const m = salesTeam.find(s => s.id === arquitetoId); return m ? `${m.code} - ${m.name}` : "Selecione"; })() : "Selecione"}</span>
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Pesquisar Eng. Valor..." value={arquitetoSearch} onValueChange={setArquitetoSearch} />
                      <CommandList>
                        <CommandEmpty>Nenhum Eng. Valor encontrado.</CommandEmpty>
                        <CommandGroup>
                          {(() => {
                            const clientUnitId = selectedClient?.unit_id;
                            const loggedUserMember = salesTeam.find(
                              (m) => m.email && user?.email && m.email.toLowerCase() === user.email.toLowerCase()
                            );
                            const filterUnitId = clientUnitId || loggedUserMember?.unit_id || null;
                            
                            const filtered = salesTeam.filter((m) => {
                              if (m.role !== "arquiteto") return false;
                              if (!(`${m.code} ${m.name} ${m.email || ""}`).toLowerCase().includes(arquitetoSearch.toLowerCase())) return false;
                              if (filterUnitId && m.unit_id) return m.unit_id === filterUnitId;
                              return true;
                            });
                            
                            return filtered.map((m) => (
                              <CommandItem key={m.id} value={`${m.code} ${m.name}`} onSelect={() => { setArquitetoId(m.id); setArquitetoPopoverOpen(false); setArquitetoSearch(""); }}>
                                <Check className={`mr-2 h-4 w-4 ${arquitetoId === m.id ? "opacity-100" : "opacity-0"}`} />
                                {m.code} - {m.name}
                              </CommandItem>
                            ));
                          })()}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Escopo */}
      {currentStep === 2 && (
        <div className="space-y-4">
          {/* Linked project banner */}
          {linkedProject && (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <FolderKanban className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">Projeto Vinculado</p>
                  <p className="text-xs text-muted-foreground">
                    {linkedProject.description || linkedProject.product || "Projeto"} ·{" "}
                    {linkedProject.status === "concluido" ? "Concluído" : linkedProject.status === "em_revisao" ? "Em Revisão" : linkedProject.status === "cancelado" ? "Cancelado" : "Pendente"} ·{" "}
                    {(linkedProject.project_scope_items || []).filter((i: any) => i.parent_id).length} itens
                  </p>
                </div>
                <Badge variant={
                  linkedProject.status === "concluido" ? "default" : 
                  linkedProject.status === "em_revisao" ? "secondary" : 
                  linkedProject.status === "cancelado" ? "destructive" : "outline"
                } className="shrink-0">
                  {linkedProject.status === "concluido" ? "Concluído" : linkedProject.status === "em_revisao" ? "Em Revisão" : linkedProject.status === "cancelado" ? "Cancelado" : "Pendente"}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => navigate(`/projetos/${linkedProject.id}?step=2`)}>
                  <Edit2 className="mr-1.5 h-3.5 w-3.5" /> Editar Escopo
                </Button>
                {arquitetoId && !evAlreadyRequested && (proposalStatus === "pendente" || proposalStatus === "proposta_gerada" || proposalStatus === "analise_ev_concluida") && (
                  <Button variant="outline" size="sm" onClick={() => {
                    // Open notification dialog for Solicitar EV
                    setSolicitarEvDialogOpen(true);
                  }}>
                    <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> Solicitar Revisão EV
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Scope header with actions */}
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Escopo da Proposta</h2>
            <div className="flex items-center gap-2">
              {!scopeLocked && (
                <>
                  <Button variant="outline" size="sm" onClick={() => { setTemplateSearch(""); setTemplateDialogOpen(true); }}>
                    <Library className="mr-1 h-3.5 w-3.5" /> Adicionar Template
                  </Button>
                  <Button variant="outline" size="sm" onClick={addGroup}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Novo Grupo
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Template search dialog */}
          <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Adicionar Templates de Escopo</DialogTitle>
              </DialogHeader>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar templates por nome ou categoria..."
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="max-h-72 overflow-auto space-y-1">
                {availableTemplates.map((template) => {
                  const isAdded = addedTemplateIds.has(template.id);
                  const itemCount = ((template as any).scope_template_items || []).length;
                  return (
                    <div
                      key={template.id}
                      className={`flex items-center justify-between rounded-md border px-3 py-2 transition-colors ${
                        isAdded ? "border-primary/30 bg-primary/5" : "border-border hover:bg-accent/50"
                      }`}
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{template.name}</p>
                        <p className="text-xs text-muted-foreground">{template.product} · {template.category} · {itemCount} itens</p>
                      </div>
                      {isAdded ? (
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => removeTemplateFromScope(template.id)}>
                          <Trash2 className="mr-1 h-3.5 w-3.5" /> Remover
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => addTemplateToScope(template.id)}>
                          <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
                        </Button>
                      )}
                    </div>
                  );
                })}
                {availableTemplates.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">Nenhum template encontrado.</p>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Project import dialog */}
          <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Incluir Projeto no Escopo</DialogTitle>
              </DialogHeader>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar projetos por produto ou status..."
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {clientProjects.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Nenhum projeto encontrado para este cliente.</p>
              ) : (
                <div className="max-h-72 overflow-auto space-y-1">
                  {filteredProjects.map((project: any) => {
                    const isAdded = addedProjectIds.has(project.id);
                    const scopeCount = (project.project_scope_items || []).length;
                    const totalHrs = (project.project_scope_items || [])
                      .filter((i: any) => i.included && !i.parent_id)
                      .reduce((s: number, i: any) => s + Number(i.hours || 0), 0);
                    const statusLabel = project.status === "concluido" ? "Concluído" : project.status === "em_revisao" ? "Em Revisão" : "Pendente";
                    return (
                      <div
                        key={project.id}
                        className={`flex items-center justify-between rounded-md border px-3 py-2 transition-colors ${
                          isAdded ? "border-primary/30 bg-primary/5" : "border-border hover:bg-accent/50"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{project.description || "Projeto"}</p>
                          <p className="text-xs text-muted-foreground">
                            {statusLabel} · {scopeCount} itens · {totalHrs}h
                            {project.sales_team?.name ? ` · E.V: ${project.sales_team.name}` : ""}
                            {project.created_at ? ` · ${new Date(project.created_at).toLocaleDateString("pt-BR")}` : ""}
                          </p>
                        </div>
                        {isAdded ? (
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => removeProjectFromScope(project.id)}>
                            <Trash2 className="mr-1 h-3.5 w-3.5" /> Remover
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => addProjectToScope(project)}>
                            <Plus className="mr-1 h-3.5 w-3.5" /> Incluir
                          </Button>
                        )}
                      </div>
                    );
                  })}
                  {filteredProjects.length === 0 && (
                    <p className="py-4 text-center text-sm text-muted-foreground">Nenhum projeto encontrado.</p>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Notes dialog */}
          <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{notesDialogLabel}</DialogTitle>
              </DialogHeader>
              <Textarea
                value={notesDialogValue}
                onChange={(e) => setNotesDialogValue(e.target.value)}
                placeholder="Digite o comentário..."
                className="min-h-[100px]"
                rows={4}
                readOnly={scopeLocked}
                disabled={scopeLocked}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setNotesDialogOpen(false)}>Cancelar</Button>
                {!scopeLocked && <Button onClick={saveNotesDialog}>Salvar</Button>}
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {scopeProcesses.length > 0 ? (
            <div className="space-y-3">

              {groupedScope.map((group) => {
                const groupKey = group.templateId || group.groupId || "_unknown";
                const isTemplateExpanded = expandedTemplateIds.has(groupKey);
                const groupHours = group.processes.reduce((sum, p) => sum + (p.included ? processHours(p) : 0), 0);
                const groupItemCount = group.processes.reduce((sum, p) => sum + p.children.length, 0);

                return (
                  <div key={groupKey} className="rounded-lg border border-border bg-card overflow-hidden">
                    {/* Template header */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors"
                      onClick={() => toggleTemplateExpand(groupKey)}
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${groupKey.startsWith("_project_") ? "bg-accent text-accent-foreground" : "bg-primary/10 text-primary"}`}>
                        {groupKey.startsWith("_project_") ? <FolderKanban className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        {group.groupId ? (
                          groupKey.startsWith("_project_") ? (
                            <p className="text-sm font-semibold text-foreground">{manualGroupNames[group.groupId] || "Grupo"}</p>
                          ) : (
                            scopeLocked ? (
                              <p className="text-sm font-semibold text-foreground">{manualGroupNames[group.groupId] || "Grupo"}</p>
                            ) : (
                              <Input
                                value={manualGroupNames[group.groupId] || ""}
                                onChange={(e) => setManualGroupNames((prev) => ({ ...prev, [group.groupId!]: e.target.value }))}
                                onClick={(e) => e.stopPropagation()}
                                className="h-7 border-0 bg-transparent px-1 text-sm font-semibold shadow-none focus-visible:ring-0"
                                placeholder="Nome do grupo"
                              />
                            )
                          )
                        ) : (
                          <p className="text-sm font-semibold text-foreground">{group.templateName}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {groupItemCount} itens{group.category ? ` · ${group.category}` : ""}{groupKey.startsWith("_project_") && !group.category ? " · Projeto" : ""} · {groupHours}h
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openNotesDialog(
                            { type: "group", groupKey },
                            groupNotes[groupKey] || "",
                            "📌 Comentário interno do grupo (não será impresso na proposta)"
                          );
                        }}
                        className={`shrink-0 rounded p-1 transition-colors ${groupNotes[groupKey] ? "text-primary" : "text-muted-foreground"} hover:text-primary`}
                        title="Comentário interno do grupo (uso interno)"
                      >
                        <MessageSquare className="h-4 w-4" />
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (group.templateId?.startsWith("_project_")) {
                            const gid = group.templateId;
                            setScopeProcesses((prev) => prev.filter((p) => p.templateId !== gid));
                            setGroupOrder((prev) => prev.filter((key) => key !== gid));
                            setAddedTemplateIds((prev) => {
                              const next = new Set(prev);
                              next.delete(gid);
                              return next;
                            });
                            const projectId = gid.replace("_project_", "").split("_")[0];
                            const remainingProjectGroups = scopeProcesses.filter(
                              (p) => (p.templateId?.startsWith(`_project_${projectId}_`) || p.groupId?.startsWith(`_project_${projectId}_`)) && p.templateId !== gid
                            );
                            if (remainingProjectGroups.length === 0) {
                              setAddedProjectIds((prev) => {
                                const next = new Set(prev);
                                next.delete(projectId);
                                return next;
                              });
                            }
                          } else if (group.templateId) {
                            removeTemplateFromScope(group.templateId);
                          } else if (group.groupId) {
                            setScopeProcesses((prev) => prev.filter((p) => p.groupId !== group.groupId));
                            setGroupOrder((prev) => prev.filter((key) => key !== group.groupId));
                            setManualGroupNames((prev) => { const next = { ...prev }; delete next[group.groupId!]; return next; });
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      {isTemplateExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                    </div>



                    {/* Processes inside this template */}
                    {isTemplateExpanded && (
                      <div className="border-t border-border">
                        {/* Expand/Collapse all processes in this group */}
                        <div className="flex items-center justify-end gap-1 px-3 py-1.5 bg-muted/30 border-b border-border">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs text-muted-foreground"
                            onClick={() => {
                              const ids = group.processes.map((p) => p.id);
                              setExpandedProcessIds((prev) => {
                                const next = new Set(prev);
                                ids.forEach((id) => next.add(id));
                                return next;
                              });
                            }}
                          >
                            <ChevronsUpDown className="mr-1 h-3 w-3" /> Expandir todos
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs text-muted-foreground"
                            onClick={() => {
                              const ids = group.processes.map((p) => p.id);
                              setExpandedProcessIds((prev) => {
                                const next = new Set(prev);
                                ids.forEach((id) => next.delete(id));
                                return next;
                              });
                            }}
                          >
                            <ChevronsDownUp className="mr-1 h-3 w-3" /> Recolher todos
                          </Button>
                        </div>
                        {group.processes.map((proc, procIdx) => {
                          const isExpanded = expandedProcessIds.has(proc.id);
                          const hours = processHours(proc);

                          return (
                            <div key={proc.id} className={`${procIdx > 0 ? "border-t border-border" : ""}`}>
                              {/* Process row (Level 1) */}
                              <div className={`flex items-center gap-2 px-3 py-2 pl-6 transition-colors ${proc.included ? "bg-card" : "bg-muted/50"}`}>
                                <button onClick={() => toggleExpand(proc.id)} className="shrink-0 text-muted-foreground hover:text-foreground">
                                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </button>
                                <span className="shrink-0 text-xs font-medium text-muted-foreground w-6">{procIdx + 1}.</span>
                                <Input
                                  value={proc.description}
                                  onChange={(e) => updateProcessDescription(proc.id, e.target.value)}
                                  placeholder="Nome do processo"
                                  className="h-7 flex-1 border-0 bg-transparent px-1 text-sm font-semibold shadow-none focus-visible:ring-0"
                                  readOnly={scopeLocked}
                                />
                                <span className="shrink-0 text-xs text-muted-foreground w-12 text-right">{hours}h</span>
                                <button
                                  onClick={() => openNotesDialog(
                                    { type: "process", processId: proc.id },
                                    proc.notes || "",
                                    "📝 Comentário do processo (impresso no escopo detalhado)"
                                  )}
                                  className={`shrink-0 rounded p-1 transition-colors ${proc.notes ? "text-primary" : "text-muted-foreground"} hover:text-primary`}
                                  title="Comentário do processo (impresso no escopo detalhado)"
                                >
                                  <MessageSquare className="h-3.5 w-3.5" />
                                </button>
                                <Switch checked={proc.included} onCheckedChange={() => toggleProcess(proc.id)} disabled={scopeLocked} />
                                {!scopeLocked && (
                                  <button onClick={() => removeProcess(proc.id)} className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>

                              {/* Children (Level 2) */}
                              {isExpanded && (
                                <div className="bg-muted/20">
                                  {proc.children.map((child, childIdx) => (
                                    <div key={child.id}>
                                      <div className={`flex items-center gap-2 border-t border-border/50 px-3 py-1.5 pl-14 transition-colors ${child.included && proc.included ? "" : "opacity-60"}`}>
                                        <span className="shrink-0 text-xs text-muted-foreground w-6">{procIdx + 1}.{childIdx + 1}</span>
                                        <Input
                                          value={child.description}
                                          onChange={(e) => updateChildDescription(proc.id, child.id, e.target.value)}
                                          placeholder="Descrição do item"
                                          className="h-7 flex-1 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
                                          readOnly={scopeLocked}
                                        />
                                        <Input
                                          type="number"
                                          min={0}
                                          value={child.hours}
                                          onChange={(e) => updateChildHours(proc.id, child.id, Number(e.target.value))}
                                          className="h-7 w-16 text-center text-xs"
                                          disabled={!child.included || !proc.included || scopeLocked}
                                        />
                                        <button
                                          onClick={() => openNotesDialog(
                                            { type: "child", processId: proc.id, childId: child.id },
                                            child.notes || "",
                                            "📝 Comentário do item (impresso no escopo detalhado)"
                                          )}
                                          className={`shrink-0 rounded p-1 transition-colors ${child.notes ? "text-primary" : "text-muted-foreground"} hover:text-primary`}
                                          title="Comentário (impresso no escopo)"
                                        >
                                          <MessageSquare className="h-3.5 w-3.5" />
                                        </button>
                                        <Switch
                                          checked={child.included}
                                          onCheckedChange={() => toggleChild(proc.id, child.id)}
                                          disabled={!proc.included || scopeLocked}
                                        />
                                        {!scopeLocked && (
                                          <button onClick={() => removeChild(proc.id, child.id)} className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive">
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                  {!scopeLocked && (
                                    <button
                                      onClick={() => addChild(proc.id)}
                                      className="flex w-full items-center gap-1 border-t border-border/50 px-3 py-2 pl-14 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50"
                                    >
                                      <Plus className="h-3 w-3" /> Adicionar item
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {!scopeLocked && (
                          <button
                            onClick={() => {
                              const gid = group.groupId || group.templateId;
                              if (gid) addProcessToGroup(gid);
                            }}
                            className="flex w-full items-center gap-1 border-t border-border px-3 py-2 pl-6 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50"
                          >
                            <Plus className="h-3 w-3" /> Adicionar Processo
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Summary */}
              <div className="flex items-center justify-end gap-4 rounded-lg border border-border bg-card px-4 py-3 text-sm">
                <span className="text-muted-foreground">Total de Horas:</span>
                <span className="font-semibold text-foreground">{rawScopeHours}h</span>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
              <Layers className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum escopo adicionado ainda.</p>
              <p className="text-xs text-muted-foreground mt-1">Clique em "Adicionar Template" para começar.</p>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Financeiro */}
      {currentStep === 3 && (
        <div className="space-y-6 rounded-lg border border-border bg-card p-4 md:p-6">
          <h2 className="text-base font-semibold text-foreground">Informações Financeiras</h2>

          {/* Resumo Financeiro — Itens de Serviço */}
          <div className="rounded-md border border-border bg-muted/50 p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Resumo Financeiro</h3>
            {!hasServiceItems ? (
              <p className="text-sm text-muted-foreground">
                Nenhum item de serviço configurado para o tipo de oportunidade selecionado.
                Configure os itens em Cadastros → Tipos de Oportunidade.
              </p>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-2 px-3 text-left font-medium text-muted-foreground">Item de Serviço</th>
                      <th className="py-2 px-3 text-center font-medium text-muted-foreground">Horas</th>
                      <th className="py-2 px-3 text-right font-medium text-muted-foreground">R$ Unitário</th>
                      <th className="py-2 px-3 text-right font-medium text-muted-foreground">Valor Líquido</th>
                      <th className="py-2 px-3 text-right font-medium text-muted-foreground">Valor Bruto</th>
                      <th className="py-2 px-3 text-center font-medium text-muted-foreground w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {serviceItems.map((item) => {
                      const itemNetValue = item.calculated_hours * item.hourly_rate;
                      const itemGrossValue = taxFactor > 0 ? itemNetValue / taxFactor : itemNetValue;
                      return (
                        <tr key={item.id} className="border-b border-border/50">
                          <td className="py-2 px-3 text-foreground">
                            <div className="flex items-center gap-1.5">
                              <span>{item.label}</span>
                              {item.is_base_scope && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Base</span>
                              )}
                              {!item.is_base_scope && item.additional_pct > 0 && (
                                <span className="text-[10px] text-muted-foreground">({item.additional_pct}%)</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-center text-foreground">{item.calculated_hours}</td>
                          <td className="py-2 px-3 text-right text-foreground">R$ {item.hourly_rate.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-right text-foreground">R$ {itemNetValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-right font-medium text-foreground">R$ {itemGrossValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                          <td className="py-2 px-3 text-center">
                            <button
                              onClick={() => { setEditingServiceItem(item); setEditServiceItemOpen(true); }}
                              className="rounded p-1 text-muted-foreground hover:text-primary transition-colors"
                              title="Editar parâmetros"
                            >
                              <Settings2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-accent/30">
                      <td className="py-2 px-3 font-semibold text-foreground">Total</td>
                      <td className="py-2 px-3 text-center font-semibold text-foreground">{totalServiceHours}</td>
                      <td className="py-2 px-3 text-right text-foreground">—</td>
                      <td className="py-2 px-3 text-right font-semibold text-foreground">R$ {totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                      <td className="py-2 px-3 text-right font-bold text-foreground">R$ {totalValueGross.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            {goLiveItems.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">Acompanhamento Pós Go-Live</p>
                <div className="space-y-1">
                  {goLiveItems.map((item) => (
                    <div key={`golive-${item.id}`} className="flex justify-between text-xs text-muted-foreground">
                      <span>{item.label} ({item.golive_pct}%)</span>
                      <span>{item.golive_hours}h</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {taxFactor > 0 && (
              <p className="mt-2 text-xs text-muted-foreground text-right">
                Fator imposto: {taxFactor}% ({clientUnit?.name || "Unidade"})
              </p>
            )}
            {!selectedClient?.unit_id && (
              <p className="mt-2 text-xs text-destructive text-right">
                Cliente sem unidade vinculada — fator imposto não aplicado.
              </p>
            )}
          </div>


          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Condições de Pagamento</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePaymentModeChange("linear")}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${paymentMode === "linear" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}
                >
                  Linear
                </button>
                <button
                  onClick={() => handlePaymentModeChange("custom")}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${paymentMode === "custom" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}
                >
                  Personalizado
                </button>
              </div>
            </div>

            {paymentMode === "linear" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Quantidade de Parcelas</Label>
                    <Input type="number" min={1} value={numInstallments} onChange={(e) => handleNumInstallmentsChange(Math.max(1, Number(e.target.value)))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Data do Primeiro Vencimento</Label>
                    <Input type="date" value={firstDueDate} onChange={(e) => handleFirstDueDateChange(e.target.value)} />
                  </div>
                </div>
                {payments.length > 0 && totalValue > 0 && (
                  <div className="rounded-md border border-border bg-muted/50 p-3 text-center text-sm font-medium text-foreground">
                    {numInstallments}x de <span className="font-bold">R$ {(totalValue / numInstallments).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {payments.map((payment, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <span className="w-8 text-xs text-muted-foreground text-right">{payment.installment}ª</span>
                    <Input type="date" value={payment.dueDate} onChange={(e) => { const u = [...payments]; u[index] = { ...u[index], dueDate: e.target.value }; setPayments(u); }} className="h-8 text-xs" />
                    <Input type="number" placeholder="Valor" value={payment.amount || ""} onChange={(e) => { const u = [...payments]; u[index] = { ...u[index], amount: Number(e.target.value) }; setPayments(u); }} className="h-8 text-xs" />
                    {payments.length > 1 && <button onClick={() => removePayment(index)} className="rounded p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <Button variant="outline" size="sm" onClick={addPayment}><Plus className="mr-1 h-3 w-3" /> Parcela</Button>
                  <span className="text-xs text-muted-foreground">
                    Total: R$ {payments.reduce((s, p) => s + p.amount, 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    {Math.abs(payments.reduce((s, p) => s + p.amount, 0) - totalValue) > 0.01 && (
                      <span className="ml-1 text-destructive">(diferença: R$ {(totalValue - payments.reduce((s, p) => s + p.amount, 0)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })})</span>
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Negociação Específica (opcional)</Label>
            <Textarea placeholder="Descreva condições especiais..." rows={3} value={negotiation} onChange={(e) => setNegotiation(e.target.value)} />
          </div>

          {/* Outros Parâmetros - Collapsible */}
          <Collapsible defaultOpen={false}>
            <div className="rounded-md border border-border bg-muted/50">
              <CollapsibleTrigger className="flex w-full items-center justify-between p-4 hover:bg-accent/50 transition-colors rounded-md">
                <h3 className="text-sm font-semibold text-foreground">Outros Parâmetros</h3>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="overflow-auto px-4 pb-4">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-2 px-3 text-left font-medium text-muted-foreground">Item</th>
                        <th className="py-2 px-3 text-right font-medium text-muted-foreground">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border/50">
                        <td className="py-2 px-3 text-foreground">Qtde Horas Traslado Local</td>
                        <td className="py-1 px-3 text-right">
                          <Input type="number" min={0} value={travelLocalHours} onChange={(e) => setTravelLocalHours(Number(e.target.value))} className="h-7 w-24 text-right text-xs ml-auto" />
                        </td>
                      </tr>
                      <tr className="border-b border-border/50">
                        <td className="py-2 px-3 text-foreground">Qtde Horas Traslado Viagem</td>
                        <td className="py-1 px-3 text-right">
                          <Input type="number" min={0} value={travelTripHours} onChange={(e) => setTravelTripHours(Number(e.target.value))} className="h-7 w-24 text-right text-xs ml-auto" />
                        </td>
                      </tr>
                      <tr className="border-b border-border/50">
                        <td className="py-2 px-3 text-foreground">Valor Hora Traslado (R$)</td>
                        <td className="py-1 px-3 text-right">
                          <Input type="number" min={0} value={travelHourlyRate} onChange={(e) => setTravelHourlyRate(Number(e.target.value))} className="h-7 w-24 text-right text-xs ml-auto" />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        </div>
      )}

      {/* Step 4: Revisão */}
      {currentStep === 4 && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 md:p-6">
            <h2 className="mb-4 text-base font-semibold text-foreground">Revisão da Proposta</h2>
            <div className="space-y-4">
              <div className="rounded-md border border-border p-4">
                <h3 className="mb-2 text-sm font-semibold text-foreground">Dados Gerais</h3>
                <div className="grid gap-1 text-sm md:grid-cols-2">
                  <p><span className="text-muted-foreground">Nº Proposta:</span> <span className="font-medium">{proposalNumber || "—"}</span></p>
                  <p><span className="text-muted-foreground">Tipo:</span> <span className="font-medium">{currentProposalTypeConfig?.name || proposalType || "—"}</span></p>
                  <p><span className="text-muted-foreground">Produto:</span> <span className="font-medium">{product || "—"}</span></p>
                  <p><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{selectedClient?.name || "—"}</span></p>
                  <p><span className="text-muted-foreground">Descrição:</span> <span className="font-medium">{description || "—"}</span></p>
                  <p><span className="text-muted-foreground">ESN:</span> <span className="font-medium">{selectedEsn?.name || "—"}</span></p>
                  <p><span className="text-muted-foreground">GSN:</span> <span className="font-medium">{autoGsn?.name || "—"}</span></p>
                  <p><span className="text-muted-foreground">Previsão de Fechamento:</span> <span className="font-medium">{expectedCloseDate ? new Date(expectedCloseDate + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</span></p>
                  <p><span className="text-muted-foreground">Data de Validade:</span> <span className="font-medium">{dateValidity ? new Date(dateValidity + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</span></p>
                </div>
              </div>

              <div className="rounded-md border border-border p-4">
                <h3 className="mb-2 text-sm font-semibold text-foreground">Escopo</h3>
                {groupedScope.filter(g => g.processes.some(p => p.included)).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum item de escopo incluído</p>
                ) : (
                  <div className="space-y-2">
                    {groupedScope.filter(g => g.processes.some(p => p.included)).map((group) => {
                      const groupKey = group.templateId || group.groupId || "_unknown";
                      const groupHours = group.processes.reduce((sum, p) => sum + (p.included ? processHours(p) : 0), 0);
                      const groupItemCount = group.processes.reduce((sum, p) => sum + p.children.filter(c => c.included).length, 0);

                      return (
                        <Collapsible key={groupKey} defaultOpen={false}>
                          <div className="rounded-lg border border-border bg-card overflow-hidden">
                            <CollapsibleTrigger className="flex w-full items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors">
                              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${groupKey.startsWith("_project_") ? "bg-accent text-accent-foreground" : "bg-primary/10 text-primary"}`}>
                                {groupKey.startsWith("_project_") ? <FolderKanban className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
                              </div>
                              <div className="flex-1 min-w-0 text-left">
                                <p className="text-sm font-semibold text-foreground">{group.templateName || "Grupo"}</p>
                                <p className="text-xs text-muted-foreground">
                                  {groupItemCount} itens{group.category ? ` · ${group.category}` : ""} · {groupHours}h
                                </p>
                              </div>
                              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180 shrink-0" />
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="border-t border-border">
                                {group.processes.filter(p => p.included).map((proc, procIdx) => {
                                  const hours = processHours(proc);
                                  const includedChildren = proc.children.filter(c => c.included);
                                  return (
                                    <Collapsible key={proc.id} defaultOpen={false}>
                                      <div className={`${procIdx > 0 ? "border-t border-border" : ""}`}>
                                        <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 pl-6 hover:bg-accent/20 transition-colors">
                                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180 shrink-0" />
                                          <span className="shrink-0 text-xs font-medium text-muted-foreground w-6">{procIdx + 1}.</span>
                                          <span className="flex-1 text-sm font-semibold text-foreground text-left">{proc.description || "(sem nome)"}</span>
                                          <span className="shrink-0 text-xs text-muted-foreground">{hours}h</span>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent>
                                          <div className="bg-muted/20">
                                            {includedChildren.map((child, childIdx) => (
                                              <div key={child.id} className="flex items-center gap-2 border-t border-border/50 px-3 py-1.5 pl-14 text-sm">
                                                <span className="shrink-0 text-xs text-muted-foreground w-6">{procIdx + 1}.{childIdx + 1}</span>
                                                <span className="flex-1 text-foreground">{child.description}</span>
                                                <span className="shrink-0 text-xs text-muted-foreground">{child.hours}h</span>
                                              </div>
                                            ))}
                                          </div>
                                        </CollapsibleContent>
                                      </div>
                                    </Collapsible>
                                  );
                                })}
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-md border border-border bg-primary/5 p-4">
                <h3 className="mb-2 text-sm font-semibold text-foreground">Financeiro</h3>
                <div className="grid gap-1 text-sm md:grid-cols-2">
                  <p><span className="text-muted-foreground">Total Horas:</span> <span className="font-semibold">{hasServiceItems ? totalServiceHours : (totalHours + gpHours)}h</span></p>
                  <p><span className="text-muted-foreground">Valor Líquido:</span> <span className="font-semibold">R$ {totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></p>
                  <p><span className="text-muted-foreground">Valor Bruto:</span> <span className="text-lg font-bold text-primary">R$ {totalValueGross.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></p>
                  <p><span className="text-muted-foreground">Parcelas:</span> <span className="font-semibold">{payments.length}x</span></p>
                  {taxFactor > 0 && <p><span className="text-muted-foreground">Fator Imposto:</span> <span className="font-medium">{Number(taxFactor).toFixed(4)}</span></p>}
                </div>
                {hasServiceItems && (
                  <div className="mt-2 pt-2 border-t border-border space-y-0.5">
                    {serviceItems.map((item) => (
                      <p key={item.id} className="text-xs text-muted-foreground">
                        {item.label}: {item.calculated_hours}h × R$ {item.hourly_rate.toFixed(2)} = R$ {(item.calculated_hours * item.hourly_rate).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </p>
                    ))}
                  </div>
                )}
                {goLiveItems.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Acompanhamento Pós Go-Live</p>
                    {goLiveItems.map((item) => (
                      <p key={`rev-golive-${item.id}`} className="text-xs text-muted-foreground">
                        {item.label} ({item.golive_pct}%): {item.golive_hours}h
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Solicitar EV Dialog */}
      <Dialog open={solicitarEvDialogOpen} onOpenChange={setSolicitarEvDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardHat className="h-5 w-5 text-primary" /> Solicitar Revisão EV
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              O escopo será enviado ao Engenheiro de Valor para revisão técnica.
              O status da oportunidade será alterado para "Em Revisão".
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Mensagem (opcional)</Label>
              <Textarea
                value={solicitarEvMessage}
                onChange={(e) => setSolicitarEvMessage(e.target.value)}
                placeholder="Observações para o Engenheiro de Valor..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSolicitarEvDialogOpen(false)}>Cancelar</Button>
            <Button
              disabled={solicitarEvSending}
              onClick={async () => {
                setSolicitarEvSending(true);
                try {
                  let proposalId = id;

                  // If proposal not yet saved, save it first
                  if (!isEditing) {
                    const savedId = await handleSave("em_analise_ev");
                    if (!savedId) {
                      setSolicitarEvSending(false);
                      return;
                    }
                    proposalId = savedId;
                  } else {
                    // Update existing proposal status
                    await supabase.from("proposals").update({ status: "em_analise_ev", ev_requested: true } as any).eq("id", proposalId);

                    // Update linked project status if exists
                    if (linkedProject) {
                      await supabase.from("projects").update({ status: "em_revisao" }).eq("id", linkedProject.id);
                    } else {
                      const { data: linkedProjects } = await supabase
                        .from("projects")
                        .select("id")
                        .eq("proposal_id", proposalId!);
                      if (linkedProjects && linkedProjects.length > 0) {
                        await supabase.from("projects").update({ status: "em_revisao" }).eq("id", linkedProjects[0].id);
                      }
                    }
                  }

                  // Send notification
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
                        proposalId,
                        type: "solicitar_ajuste",
                        message: solicitarEvMessage || "Solicitação de revisão técnica do escopo.",
                        proposalLink: `${window.location.origin}/propostas/${proposalId}`,
                        _origin: window.location.origin,
                      }),
                    }
                  );

                  queryClient.invalidateQueries({ queryKey: ["proposals"] });
                  queryClient.invalidateQueries({ queryKey: ["projects"] });
                  queryClient.invalidateQueries({ queryKey: ["client_projects", clientId] });
                  toast({ title: "Solicitação enviada", description: "O Engenheiro de Valor foi notificado." });
                  setSolicitarEvDialogOpen(false);
                  navigate("/propostas");
                } catch (err: any) {
                  toast({ title: "Erro", description: err.message, variant: "destructive" });
                } finally {
                  setSolicitarEvSending(false);
                }
              }}
            >
              {solicitarEvSending ? "Enviando..." : "Enviar Solicitação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Service Item Edit Dialog */}
      <Dialog open={editServiceItemOpen} onOpenChange={(open) => { if (!open) { setEditServiceItemOpen(false); setEditingServiceItem(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" /> Editar Parâmetros — {editingServiceItem?.label}
            </DialogTitle>
          </DialogHeader>
          {editingServiceItem && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor Hora (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={editingServiceItem.hourly_rate}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setEditingServiceItem({ ...editingServiceItem, hourly_rate: val });
                    updateServiceItem(editingServiceItem.id, { hourly_rate: val });
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fator de Arredondamento (horas)</Label>
                <Select
                  value={String(editingServiceItem.rounding_factor)}
                  onValueChange={(v) => {
                    const val = Number(v);
                    setEditingServiceItem({ ...editingServiceItem, rounding_factor: val });
                    updateServiceItem(editingServiceItem.id, { rounding_factor: val });
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 hora</SelectItem>
                    <SelectItem value="2">2 horas</SelectItem>
                    <SelectItem value="4">4 horas</SelectItem>
                    <SelectItem value="8">8 horas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">% Go Live</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={editingServiceItem.golive_pct}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setEditingServiceItem({ ...editingServiceItem, golive_pct: val });
                    updateServiceItem(editingServiceItem.id, { golive_pct: val });
                  }}
                />
              </div>
              {!editingServiceItem.is_base_scope && (
                <div className="space-y-1.5">
                  <Label className="text-xs">% Adicional</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={editingServiceItem.additional_pct}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setEditingServiceItem({ ...editingServiceItem, additional_pct: val });
                      updateServiceItem(editingServiceItem.id, { additional_pct: val });
                    }}
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditServiceItemOpen(false); setEditingServiceItem(null); }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating Navigation Bar */}
      <div className="sticky bottom-0 z-30 -mx-4 md:-mx-6 mt-6">
        <div className="border-t border-border bg-card/95 backdrop-blur-sm px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_12px_rgba(0,0,0,0.3)]">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
             <Button variant="outline" onClick={() => setCurrentStep((s) => Math.max(1, s - 1))} disabled={currentStep === 1}>
              <ArrowLeft className="mr-2 h-4 w-4" />Anterior
            </Button>
            <div className="flex items-center gap-3">
              {isConsulta ? (
                <Button variant="outline" onClick={() => navigate("/propostas")}>
                  Voltar para lista
                </Button>
              ) : (
                <>
                   {/* Solicitar Análise EV — visible on step 1, hidden if already requested */}
                   {currentStep === 1 && !isConsulta && !evAlreadyRequested && (
                     <Button
                       variant="outline"
                       className="border-amber-500/50 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                       onClick={() => setSolicitarEvDialogOpen(true)}
                       disabled={isSaving || !clientId || !proposalNumber || !arquitetoId}
                     >
                       <HardHat className="mr-2 h-4 w-4" />Solicitar Análise EV
                     </Button>
                   )}
                  {currentStep === 4 && (
                    <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
                      <Switch checked={generateOnSave} onCheckedChange={setGenerateOnSave} />
                      Gerar Proposta?
                    </label>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => handleSave(currentStep === 4 && generateOnSave ? "proposta_gerada" : "pendente")}
                    disabled={isSaving}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {isGenerating ? "Gerando documento..." : isSaving ? "Salvando..." : "Salvar"}
                  </Button>
                  {currentStep < 4 && (
                    <Button onClick={handleNext} disabled={isSaving}>
                      {isAutoSaving ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Preparando...</>
                      ) : (
                        <>Próximo<ArrowRight className="ml-2 h-4 w-4" /></>
                      )}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
