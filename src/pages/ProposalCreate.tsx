import { useState, useMemo, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Search, Plus, Trash2, ChevronDown, ChevronRight, Layers, Library, ChevronsDownUp, ChevronsUpDown, ChevronUp, MessageSquare, UserPlus, FolderKanban } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
  notes?: string; // comentário interno (comunicação arquiteto/ESN)
}

interface PaymentCondition {
  installment: number;
  dueDate: string;
  amount: number;
}

const steps = [
  { id: 1, label: "Dados Gerais" },
  { id: 2, label: "Escopo" },
  { id: 3, label: "Financeiro" },
  { id: 4, label: "Revisão" },
];

let idCounter = 0;
function localId() {
  return `local_${Date.now()}_${++idCounter}`;
}

export default function ProposalCreate() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const duplicateId = searchParams.get("duplicar");
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
  const [currentStep, setCurrentStep] = useState(1);
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
  const [avulsoGroupName, setAvulsoGroupName] = useState("Itens Avulsos");
  const [groupNotes, setGroupNotes] = useState<Record<string, string>>({});

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
    if (existingProposal && !loaded) {
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
      setGroupNotes((existingProposal as any).group_notes || {});
      setDefaultsLoaded(true);

      // Rebuild two-level hierarchy from flat proposal_scope_items
      const items = (existingProposal as any).proposal_scope_items || [];
      // Items with parent_id=null are processes, others are children
      // But currently proposal_scope_items doesn't have parent_id...
      // We stored them flat with template_id. Let's rebuild from sort_order grouping.
      // For backward compat: treat items with hours=0 that have children after them as parents.
      // Better approach: we'll need to store parent/child in proposal_scope_items too.
      // For now, load them as flat processes (each item = process with no children)
      // After migration, this will work properly.
      
      const processes: ScopeProcess[] = [];
      const parentMap = new Map<string, ScopeProcess>();
      
      // Group by: items without parent are L1, items with parent are L2
      // We need parent_id column on proposal_scope_items - let's handle both cases
      const parentItems = items.filter((i: any) => !i.parent_id);
      const childItems = items.filter((i: any) => i.parent_id);
      
      if (parentItems.length === 0 && childItems.length === 0) {
        // No items
      } else if (childItems.length === 0) {
        // Old flat data - each item becomes a process
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
        // New hierarchical data
        for (const item of parentItems) {
          const proc: ScopeProcess = {
            id: item.id,
            description: item.description,
            included: item.included,
            templateId: item.template_id || undefined,
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

      // Track which templates were already added
      const tids = new Set<string>();
      items.forEach((i: any) => { if (i.template_id) tids.add(i.template_id); });
      setAddedTemplateIds(tids);

      // Load payments
      const pays = (existingProposal as any).payment_conditions || [];
      if (pays.length > 0) {
        const loadedPayments = pays.map((p: any) => ({ installment: p.installment, dueDate: p.due_date || "", amount: p.amount }));
        setPayments(loadedPayments);
        setNumInstallments(loadedPayments.length);
        if (loadedPayments[0]?.dueDate) setFirstDueDate(loadedPayments[0].dueDate);
        // Detect if amounts are equal (linear) or not (custom)
        const amounts = loadedPayments.map((p: any) => p.amount);
        const allEqual = amounts.every((a: number) => Math.abs(a - amounts[0]) < 0.02);
        setPaymentMode(allEqual ? "linear" : "custom");
      }

      setLoaded(true);
    }
  }, [existingProposal, loaded, isDuplicating]);

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

      // Default first payment due date = 30 days from today
      const due30 = new Date();
      due30.setDate(due30.getDate() + 30);
      const due30Str = due30.toISOString().split("T")[0];
      setFirstDueDate(due30Str);

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
    let templates = scopeTemplates;
    if (templateSearch) {
      const q = templateSearch.toLowerCase();
      templates = templates.filter((t) => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q) || t.product.toLowerCase().includes(q));
    }
    return templates;
  }, [scopeTemplates, templateSearch]);

  // Fetch projects for current client (with scope items)
  const { data: clientProjects = [] } = useQuery({
    queryKey: ["client_projects", clientId],
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, product, status, created_at, project_scope_items(id, description, hours, included, parent_id, template_id, notes, sort_order, phase)")
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
      (p.product || "").toLowerCase().includes(q) || (p.status || "").toLowerCase().includes(q)
    );
  }, [clientProjects, projectSearch]);

  // Import project scope items into proposal scope
  function addProjectToScope(project: any) {
    if (addedProjectIds.has(project.id)) return;
    const items = project.project_scope_items || [];
    const parentItems = items.filter((i: any) => !i.parent_id).sort((a: any, b: any) => a.sort_order - b.sort_order);
    const childrenMap = new Map<string, any[]>();
    items.filter((i: any) => i.parent_id).forEach((i: any) => {
      if (!childrenMap.has(i.parent_id)) childrenMap.set(i.parent_id, []);
      childrenMap.get(i.parent_id)!.push(i);
    });

    const projectGroupKey = `_project_${project.id}`;
    const newProcesses: ScopeProcess[] = parentItems.map((parent: any) => {
      const kids = (childrenMap.get(parent.id) || []).sort((a: any, b: any) => a.sort_order - b.sort_order);
      return {
        id: localId(),
        description: parent.description,
        included: parent.included,
        templateId: projectGroupKey,
        notes: parent.notes || "",
        children: kids.map((kid: any) => ({
          id: localId(),
          description: kid.description,
          hours: kid.hours || 0,
          included: kid.included,
          notes: kid.notes || "",
        })),
      };
    });

    // If flat items only
    if (parentItems.length === 0 && items.length > 0) {
      for (const item of items.sort((a: any, b: any) => a.sort_order - b.sort_order)) {
        newProcesses.push({
          id: localId(),
          description: item.description,
          included: item.included,
          templateId: projectGroupKey,
          children: [{
            id: localId(),
            description: item.description,
            hours: item.hours || 0,
            included: item.included,
          }],
        });
      }
    }

    setScopeProcesses((prev) => [...prev, ...newProcesses]);
    setAddedProjectIds((prev) => new Set([...prev, project.id]));
    setAddedTemplateIds((prev) => new Set([...prev, projectGroupKey]));
    setExpandedTemplateIds((prev) => new Set([...prev, projectGroupKey]));
    setExpandedProcessIds((prev) => {
      const next = new Set(prev);
      newProcesses.forEach((p) => next.add(p.id));
      return next;
    });
  }

  function removeProjectFromScope(projectId: string) {
    const projectGroupKey = `_project_${projectId}`;
    setScopeProcesses((prev) => prev.filter((p) => p.templateId !== projectGroupKey));
    setAddedProjectIds((prev) => {
      const next = new Set(prev);
      next.delete(projectId);
      return next;
    });
    setAddedTemplateIds((prev) => {
      const next = new Set(prev);
      next.delete(projectGroupKey);
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

  // Round up to nearest multiple of rounding factor
  function roundUpFactor(val: number) {
    return Math.ceil(val / roundingFactor) * roundingFactor;
  }

  // Calculate total hours from included children only (rounded to multiple of 8)
  const totalHours = useMemo(() => {
    let total = 0;
    for (const proc of scopeProcesses) {
      if (proc.included) {
        for (const child of proc.children) {
          if (child.included) total += child.hours;
        }
      }
    }
    return roundUpFactor(total);
  }, [scopeProcesses, roundingFactor]);

  // Group scope processes by template for grouped display
  const groupedScope = useMemo(() => {
    const groups: { templateId: string | undefined; templateName: string; category: string; processes: ScopeProcess[] }[] = [];
    const templateGroups = new Map<string, ScopeProcess[]>();
    const noTemplate: ScopeProcess[] = [];

    for (const proc of scopeProcesses) {
      if (proc.templateId) {
        if (!templateGroups.has(proc.templateId)) templateGroups.set(proc.templateId, []);
        templateGroups.get(proc.templateId)!.push(proc);
      } else {
        noTemplate.push(proc);
      }
    }

    for (const [tid, procs] of templateGroups) {
      const tmpl = scopeTemplates.find((t) => t.id === tid);
      // Check if this is a project group
      const isProjectGroup = tid.startsWith("_project_");
      const projectId = isProjectGroup ? tid.replace("_project_", "") : null;
      const project = projectId ? clientProjects.find((p: any) => p.id === projectId) : null;
      groups.push({
        templateId: tid,
        templateName: isProjectGroup ? `Projeto: ${project?.product || "Projeto"}` : (tmpl?.name || "Template"),
        category: isProjectGroup ? "Projeto" : (tmpl?.category || ""),
        processes: procs,
      });
    }

    if (noTemplate.length > 0) {
      groups.push({ templateId: undefined, templateName: avulsoGroupName, category: "", processes: noTemplate });
    }

    return groups;
  }, [scopeProcesses, scopeTemplates, clientProjects]);

  function toggleTemplateExpand(templateId: string) {
    setExpandedTemplateIds((prev) => {
      const next = new Set(prev);
      if (next.has(templateId)) next.delete(templateId);
      else next.add(templateId);
      return next;
    });
  }

  const gpHours = roundUpFactor(Math.ceil(totalHours * (gpPercentage / 100)));
  const totalValue = (totalHours + gpHours) * hourlyRate;

  // Get tax factor from client's unit
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
    // Build hierarchy: parents (no parent_id) and children
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
        children: kids.map((kid: any) => ({
          id: localId(),
          description: kid.description,
          hours: kid.default_hours || 0,
          included: true,
        })),
      };
    });

    // If template has no hierarchy (flat items), treat each as a process
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
    setAddedTemplateIds((prev) => new Set([...prev, templateId]));
    setExpandedTemplateIds((prev) => new Set([...prev, templateId]));
    // Auto-expand all new processes
    setExpandedProcessIds((prev) => {
      const next = new Set(prev);
      newProcesses.forEach((p) => next.add(p.id));
      return next;
    });
  }

  // Remove a template's processes from scope
  function removeTemplateFromScope(templateId: string) {
    setScopeProcesses((prev) => prev.filter((p) => p.templateId !== templateId));
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

  // Add new process
  function addProcess() {
    const newProc: ScopeProcess = {
      id: localId(),
      description: "",
      included: true,
      children: [{ id: localId(), description: "", hours: 0, included: true }],
    };
    setScopeProcesses((prev) => [...prev, newProc]);
    setExpandedProcessIds((prev) => new Set([...prev, newProc.id]));
    setExpandedTemplateIds((prev) => new Set([...prev, "_avulso"]));
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
    const perInstallment = Math.round((total / count) * 100) / 100;
    const remainder = Math.round((total - perInstallment * (count - 1)) * 100) / 100;
    const newPayments: PaymentCondition[] = [];
    for (let i = 0; i < count; i++) {
      let dueDate = "";
      if (startDate) {
        const d = new Date(startDate + "T00:00:00");
        d.setMonth(d.getMonth() + i);
        dueDate = d.toISOString().split("T")[0];
      }
      newPayments.push({
        installment: i + 1,
        dueDate,
        amount: i === count - 1 ? remainder : perInstallment,
      });
    }
    setPayments(newPayments);
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
  }, [totalValue]);

  async function handleSave(status: string) {
    const missing: string[] = [];
    if (!proposalNumber) missing.push("Número da Proposta");
    if (!clientId) missing.push("Cliente");
    if (!product) missing.push("Produto");
    if (!proposalType) missing.push("Tipo de Proposta");

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
      return;
    }

    // Flatten scope to save: parents + children with parent_id reference
    const allScopeItems: any[] = [];
    let sortOrder = 0;
    for (const proc of scopeProcesses) {
      const parentSortOrder = sortOrder++;
      allScopeItems.push({
        description: proc.description,
        included: proc.included,
        hours: processHours(proc),
        phase: 1,
        notes: proc.notes || "",
        sort_order: parentSortOrder,
        template_id: proc.templateId || null,
        parent_id: null,
        _local_id: proc.id,
      });

      for (const child of proc.children) {
        allScopeItems.push({
          description: child.description,
          included: child.included,
          hours: child.hours,
          phase: 1,
          notes: child.notes || "",
          sort_order: sortOrder++,
          template_id: proc.templateId || null,
          parent_id: proc.id,
          _local_id: child.id,
          _parent_local_id: proc.id,
        });
      }
    }

    const paymentRows = payments.filter((p) => p.amount > 0).map((p) => ({
      installment: p.installment,
      due_date: p.dueDate || null,
      amount: p.amount,
    }));

    // When editing, never downgrade status. If not generating, keep existing status.
    const existingStatus = existingProposal?.status;
    const effectiveStatus = isEditing && status === "pendente" && existingStatus && existingStatus !== "pendente"
      ? existingStatus
      : status;

    // Set needs_regen flag: true when editing an already-generated proposal without regenerating
    const needsRegen = isEditing && status === "pendente" && existingStatus && existingStatus !== "pendente";

    const proposalData = {
      number: proposalNumber,
      type: proposalType as any,
      product,
      status: effectiveStatus,
      needs_regen: needsRegen ? true : (status === "proposta_gerada" ? false : undefined),
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
      additional_analyst_rate: additionalAnalystRate,
      additional_gp_rate: additionalGpRate,
      negotiation,
      description,
      expected_close_date: expectedCloseDate || null,
      group_notes: groupNotes,
      scopeItems: allScopeItems,
      payments: paymentRows,
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

      // Regenerate commission projections
      if (savedId) {
        regenerateCommissionProjections(savedId).catch(() => {});
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

  const isSaving = createProposal.isPending || updateProposal.isPending || isGenerating;

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
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/propostas")} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {isEditing ? "Editar Proposta" : isDuplicating ? "Duplicar Proposta" : "Nova Proposta"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isEditing ? "Altere as informações da proposta" : "Preencha as informações da proposta comercial"}
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {steps.map((step, i) => (
          <div key={step.id} className="flex items-center gap-2">
            <button
              onClick={() => setCurrentStep(step.id)}
              className={`flex h-8 items-center gap-2 rounded-full px-3 text-xs font-medium transition-colors ${
                currentStep === step.id ? "bg-primary text-primary-foreground" : currentStep > step.id ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
              }`}
            >
              {currentStep > step.id ? <Check className="h-3 w-3" /> : <span>{step.id}</span>}
              <span className="hidden sm:inline">{step.label}</span>
            </button>
            {i < steps.length - 1 && <div className="h-px w-4 bg-border sm:w-8" />}
          </div>
        ))}
      </div>

      {/* Step 1 */}
      {currentStep === 1 && (
        <div className="space-y-6 rounded-lg border border-border bg-card p-4 md:p-6">
          <h2 className="text-base font-semibold text-foreground">Dados Gerais</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Número da Proposta (OPP)</Label>
              <Input id="proposalNumber" placeholder="OPP-2025-XXX" value={proposalNumber} onChange={(e) => setProposalNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de Proposta</Label>
              <Select value={proposalType} onValueChange={setProposalType}>
                <SelectTrigger id="proposalType"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {proposalTypes.map((pt: any) => (
                    <SelectItem key={pt.slug} value={pt.slug}>{pt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Produto</Label>
              <Select value={product} onValueChange={setProduct}>
                <SelectTrigger id="product"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {productsList.map((p) => (
                    <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Escopo</Label>
              <Select value={scopeType} onValueChange={setScopeType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="detalhado">Detalhado</SelectItem>
                  <SelectItem value="macro">Macro Escopo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição do Projeto</Label>
              <Input placeholder="Descreva brevemente o projeto" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data Prevista de Fechamento</Label>
              <Input type="date" value={expectedCloseDate} onChange={(e) => setExpectedCloseDate(e.target.value)} />
            </div>
          </div>

          {/* Client */}
          <div className="space-y-3">
            <Label className="text-xs">Cliente</Label>
            {selectedClient ? (
              <>
                <div className="flex items-center justify-between rounded-md border border-border bg-accent/50 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">{selectedClient.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedClient.code} · {selectedClient.cnpj}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setClientId("")}>Alterar</Button>
                </div>
                <ClientValidationAlerts warnings={clientWarnings} onEditClient={() => setQuickEditOpen(true)} />
                <QuickEditClientDialog
                  client={selectedClient}
                  open={quickEditOpen}
                  onOpenChange={setQuickEditOpen}
                  onSaved={() => queryClient.invalidateQueries({ queryKey: ["clients"] })}
                />
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="relative flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="clientSearch" placeholder="Buscar cliente..." value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} className="pl-9" />
                    </div>
                    <Button variant="outline" size="icon" onClick={() => setQuickCreateClientOpen(true)} title="Cadastrar novo cliente">
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  </div>
                  {clientSearch.length >= 2 && (
                    <div className="max-h-48 overflow-auto rounded-md border border-border bg-card">
                      {filteredClients.map((c) => (
                        <button key={c.id} onClick={() => { setClientId(c.id); setClientSearch(""); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent">
                          <span className="font-medium text-foreground">{c.name}</span>
                          <span className="text-xs text-muted-foreground">{c.code}</span>
                        </button>
                      ))}
                      {filteredClients.length === 0 && (
                        <p className="px-3 py-3 text-center text-xs text-muted-foreground">Nenhum cliente encontrado.</p>
                      )}
                    </div>
                  )}
                </div>
                <QuickCreateClientDialog
                  open={quickCreateClientOpen}
                  onOpenChange={setQuickCreateClientOpen}
                  onClientCreated={(newId) => {
                    setClientId(newId);
                    setClientSearch("");
                  }}
                  initialSearch={clientSearch}
                />
              </>
            )}
          </div>


          {/* Sales Team */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Executivo de Vendas (ESN)</Label>
              <Popover open={esnPopoverOpen} onOpenChange={setEsnPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-10">
                    {esnId ? (() => { const m = salesTeam.find(s => s.id === esnId); return m ? `${m.code} - ${m.name}` : "Selecione"; })() : "Selecione"}
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
            <div className="space-y-1.5">
              <Label className="text-xs">Gerente de Vendas (GSN)</Label>
              <div className="flex h-10 items-center rounded-md border border-border bg-muted px-3 text-sm text-muted-foreground">
                {autoGsn ? `${autoGsn.code} - ${autoGsn.name}` : "Vinculado ao ESN"}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Arquiteto de Solução</Label>
              <Popover open={arquitetoPopoverOpen} onOpenChange={setArquitetoPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-10">
                    {arquitetoId ? (() => { const m = salesTeam.find(s => s.id === arquitetoId); return m ? `${m.code} - ${m.name}` : "Selecione"; })() : "Selecione"}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Pesquisar Arquiteto..." value={arquitetoSearch} onValueChange={setArquitetoSearch} />
                    <CommandList>
                      <CommandEmpty>Nenhum Arquiteto encontrado.</CommandEmpty>
                      <CommandGroup>
                        {(() => {
                          // Determine unit to filter architects: client's unit > logged user's sales_team unit
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
      )}

      {/* Step 2: Escopo */}
      {currentStep === 2 && (
        <div className="space-y-4">
          {/* Scope header with actions */}
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Escopo da Proposta</h2>
            <div className="flex items-center gap-2">
              {clientId && (
                <Button variant="outline" size="sm" onClick={() => { setProjectSearch(""); setProjectDialogOpen(true); }}>
                  <FolderKanban className="mr-1 h-3.5 w-3.5" /> Incluir Projeto
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => { setTemplateSearch(""); setTemplateDialogOpen(true); }}>
                <Library className="mr-1 h-3.5 w-3.5" /> Adicionar Template
              </Button>
              <Button variant="outline" size="sm" onClick={addProcess}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Novo Processo
              </Button>
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
                    const statusLabel = project.status === "concluido" ? "Concluído" : project.status === "em_revisao" ? "Em Revisão" : "Rascunho";
                    return (
                      <div
                        key={project.id}
                        className={`flex items-center justify-between rounded-md border px-3 py-2 transition-colors ${
                          isAdded ? "border-primary/30 bg-primary/5" : "border-border hover:bg-accent/50"
                        }`}
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">{project.product || "Projeto"}</p>
                          <p className="text-xs text-muted-foreground">
                            {statusLabel} · {scopeCount} itens · {totalHrs}h
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
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setNotesDialogOpen(false)}>Cancelar</Button>
                <Button onClick={saveNotesDialog}>Salvar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {scopeProcesses.length > 0 ? (
            <div className="space-y-3">

              {groupedScope.map((group) => {
                const groupKey = group.templateId || "_avulso";
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
                        {!group.templateId ? (
                          <Input
                            value={avulsoGroupName}
                            onChange={(e) => setAvulsoGroupName(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-7 border-0 bg-transparent px-1 text-sm font-semibold shadow-none focus-visible:ring-0"
                            placeholder="Nome do grupo"
                          />
                        ) : (
                          <p className="text-sm font-semibold text-foreground">{group.templateName}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {groupItemCount} itens{group.category ? ` · ${group.category}` : ""} · {groupHours}h
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
                            const pid = group.templateId.replace("_project_", "");
                            removeProjectFromScope(pid);
                          } else if (group.templateId) {
                            removeTemplateFromScope(group.templateId);
                          } else {
                            setScopeProcesses((prev) => prev.filter((p) => p.templateId));
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
                                <Switch checked={proc.included} onCheckedChange={() => toggleProcess(proc.id)} />
                                <button onClick={() => removeProcess(proc.id)} className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
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
                                        />
                                        <Input
                                          type="number"
                                          min={0}
                                          value={child.hours}
                                          onChange={(e) => updateChildHours(proc.id, child.id, Number(e.target.value))}
                                          className="h-7 w-16 text-center text-xs"
                                          disabled={!child.included || !proc.included}
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
                                          disabled={!proc.included}
                                        />
                                        <button onClick={() => removeChild(proc.id, child.id)} className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive">
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                  <button
                                    onClick={() => addChild(proc.id)}
                                    className="flex w-full items-center gap-1 border-t border-border/50 px-3 py-2 pl-14 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50"
                                  >
                                    <Plus className="h-3 w-3" /> Adicionar item
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Summary */}
              <div className="flex items-center justify-end gap-4 rounded-lg border border-border bg-card px-4 py-3 text-sm">
                <span className="text-muted-foreground">Total de Horas:</span>
                <span className="font-semibold text-foreground">{totalHours}h</span>
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

          {/* Parâmetros Financeiros - Collapsible */}
          <Collapsible defaultOpen={true}>
            <div className="rounded-md border border-border bg-muted/50">
              <CollapsibleTrigger className="flex w-full items-center justify-between p-4 hover:bg-accent/50 transition-colors rounded-md">
                <h3 className="text-sm font-semibold text-foreground">Parâmetros Financeiros</h3>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4 space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Valor Hora (R$)</Label>
                      <Input type="number" value={hourlyRate} onChange={(e) => setHourlyRate(Number(e.target.value))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">% Hrs Projeto GP</Label>
                      <Input type="number" value={gpPercentage} onChange={(e) => setGpPercentage(Number(e.target.value))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">% Acomp. Analista</Label>
                      <div className="flex items-center gap-2">
                        <Input type="number" value={accompAnalyst} onChange={(e) => setAccompAnalyst(Number(e.target.value))} className="flex-1" />
                        <span className="text-xs text-muted-foreground whitespace-nowrap bg-accent/50 rounded px-2 py-1.5 border border-border">
                          = {roundUpFactor(Math.ceil(totalHours * (accompAnalyst / 100)))}h
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">% Acomp. GP</Label>
                      <div className="flex items-center gap-2">
                        <Input type="number" value={accompGP} onChange={(e) => setAccompGP(Number(e.target.value))} className="flex-1" />
                        <span className="text-xs text-muted-foreground whitespace-nowrap bg-accent/50 rounded px-2 py-1.5 border border-border">
                          = {roundUpFactor(Math.ceil(totalHours * (accompGP / 100)))}h
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          <div className="rounded-md border border-border bg-muted/50 p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Resumo Financeiro</h3>
            <div className="overflow-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 px-3 text-left font-medium text-muted-foreground">Descritivo</th>
                    <th className="py-2 px-3 text-center font-medium text-muted-foreground">Horas</th>
                    <th className="py-2 px-3 text-right font-medium text-muted-foreground">R$ Unitário</th>
                    <th className="py-2 px-3 text-right font-medium text-muted-foreground">Valor Líquido</th>
                    <th className="py-2 px-3 text-right font-medium text-muted-foreground">Valor Bruto</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/50">
                    <td className="py-2 px-3 text-foreground">{analystLabel}</td>
                    <td className="py-2 px-3 text-center text-foreground">{totalHours}</td>
                    <td className="py-2 px-3 text-right text-foreground">R$ {hourlyRate.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right text-foreground">R$ {(totalHours * hourlyRate).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right font-medium text-foreground">R$ {(totalHours * hourlyRate * (1 + taxFactor / 100)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 px-3 text-foreground">{gpLabel}</td>
                    <td className="py-2 px-3 text-center text-foreground">{gpHours}</td>
                    <td className="py-2 px-3 text-right text-foreground">R$ {hourlyRate.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right text-foreground">R$ {(gpHours * hourlyRate).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right font-medium text-foreground">R$ {(gpHours * hourlyRate * (1 + taxFactor / 100)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-accent/30">
                    <td className="py-2 px-3 font-semibold text-foreground">Total</td>
                    <td className="py-2 px-3 text-center font-semibold text-foreground">{totalHours + gpHours}</td>
                    <td className="py-2 px-3 text-right text-foreground">R$ {hourlyRate.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right font-semibold text-foreground">R$ {totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right font-bold text-foreground">R$ {totalValueGross.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
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
                      <tr className="border-b border-border/50">
                        <td className="py-2 px-3 text-foreground">Valor Hora Adicional/Avulso Analista (R$)</td>
                        <td className="py-1 px-3 text-right">
                          <Input type="number" min={0} value={additionalAnalystRate} onChange={(e) => setAdditionalAnalystRate(Number(e.target.value))} className="h-7 w-24 text-right text-xs ml-auto" />
                        </td>
                      </tr>
                      <tr className="border-b border-border/50">
                        <td className="py-2 px-3 text-foreground">Valor Hora Adicional/Avulso GP (R$)</td>
                        <td className="py-1 px-3 text-right">
                          <Input type="number" min={0} value={additionalGpRate} onChange={(e) => setAdditionalGpRate(Number(e.target.value))} className="h-7 w-24 text-right text-xs ml-auto" />
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
                </div>
              </div>

              <div className="rounded-md border border-border p-4">
                <h3 className="mb-2 text-sm font-semibold text-foreground">Escopo</h3>
                {groupedScope.filter(g => g.processes.some(p => p.included)).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum item de escopo incluído</p>
                ) : (
                  <div className="space-y-2">
                    {groupedScope.filter(g => g.processes.some(p => p.included)).map((group) => {
                      const groupKey = group.templateId || "_avulso";
                      const groupHours = group.processes.reduce((sum, p) => sum + (p.included ? processHours(p) : 0), 0);
                      const groupItemCount = group.processes.reduce((sum, p) => sum + p.children.filter(c => c.included).length, 0);

                      return (
                        <Collapsible key={groupKey} defaultOpen={false}>
                          <div className="rounded-lg border border-border bg-card overflow-hidden">
                            <CollapsibleTrigger className="flex w-full items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <Layers className="h-4 w-4" />
                              </div>
                              <div className="flex-1 min-w-0 text-left">
                                <p className="text-sm font-semibold text-foreground">{group.templateId ? group.templateName : avulsoGroupName || "Itens Avulsos"}</p>
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
                  <p><span className="text-muted-foreground">Total Horas:</span> <span className="font-semibold">{totalHours + gpHours}h</span></p>
                  <p><span className="text-muted-foreground">Valor Hora:</span> <span className="font-semibold">R$ {hourlyRate.toFixed(2)}</span></p>
                  <p><span className="text-muted-foreground">Valor Líquido:</span> <span className="font-semibold">R$ {totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></p>
                  <p><span className="text-muted-foreground">Valor Bruto:</span> <span className="text-lg font-bold text-primary">R$ {totalValueGross.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></p>
                  <p><span className="text-muted-foreground">Parcelas:</span> <span className="font-semibold">{payments.length}x</span></p>
                  {taxFactor > 0 && <p><span className="text-muted-foreground">Fator Imposto:</span> <span className="font-medium">{Number(taxFactor).toFixed(4)}</span></p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => setCurrentStep((s) => Math.max(1, s - 1))} disabled={currentStep === 1}>
          <ArrowLeft className="mr-2 h-4 w-4" />Anterior
        </Button>
        <div className="flex items-center gap-3">
          {isConsulta ? (
            <Button variant="outline" onClick={() => navigate("/propostas")}>
              Voltar para lista
            </Button>
          ) : currentStep === 4 ? (
            <>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
                <Switch checked={generateOnSave} onCheckedChange={setGenerateOnSave} />
                Gerar Proposta?
              </label>
              <Button onClick={() => handleSave(generateOnSave ? "proposta_gerada" : "pendente")} disabled={isSaving}>
                <Check className="mr-2 h-4 w-4" />
                {isGenerating ? "Gerando documento..." : isSaving ? "Salvando..." : "Confirmar"}
              </Button>
            </>
          ) : (
            <Button onClick={() => setCurrentStep((s) => Math.min(4, s + 1))}>
              Próximo<ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
