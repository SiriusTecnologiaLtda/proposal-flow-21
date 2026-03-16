import { useState, useMemo, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Search, Plus, Trash2, ChevronDown, ChevronRight, Layers, Library, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClients, useSalesTeam, useScopeTemplates, useProducts, useCreateProposal, useUpdateProposal, useProposal } from "@/hooks/useSupabaseData";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

// Two-level scope item for proposal
interface ScopeChild {
  id: string;
  description: string;
  hours: number;
  included: boolean;
}

interface ScopeProcess {
  id: string;
  description: string;
  included: boolean;
  children: ScopeChild[];
  templateId?: string; // track origin template for reference only
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
  const { toast } = useToast();
  const { data: clients = [] } = useClients();
  const { data: salesTeam = [] } = useSalesTeam();
  const { data: scopeTemplates = [] } = useScopeTemplates();
  const { data: productsList = [] } = useProducts();
  const createProposal = useCreateProposal();
  const updateProposal = useUpdateProposal();
  const { data: existingProposal, isLoading: loadingProposal } = useProposal(isEditing ? id : duplicateId || undefined);

  const [loaded, setLoaded] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [proposalNumber, setProposalNumber] = useState("");
  const [proposalType, setProposalType] = useState<string>("");
  const [product, setProduct] = useState<string>("");
  const [clientId, setClientId] = useState<string>("");
  const [clientSearch, setClientSearch] = useState("");
  const [esnId, setEsnId] = useState<string>("");
  const [arquitetoId, setArquitetoId] = useState<string>("");
  const [scopeType, setScopeType] = useState<string>("detalhado");
  const [hourlyRate, setHourlyRate] = useState(250);
  const [gpPercentage, setGpPercentage] = useState(20);
  const [payments, setPayments] = useState<PaymentCondition[]>([{ installment: 1, dueDate: "", amount: 0 }]);
  const [paymentMode, setPaymentMode] = useState<"linear" | "custom">("linear");
  const [numInstallments, setNumInstallments] = useState(1);
  const [firstDueDate, setFirstDueDate] = useState("");
  const [negotiation, setNegotiation] = useState("");
  const [description, setDescription] = useState("");

  // Scope state: flat list of processes with children
  const [scopeProcesses, setScopeProcesses] = useState<ScopeProcess[]>([]);
  const [expandedProcessIds, setExpandedProcessIds] = useState<Set<string>>(new Set());

  // Template search/selection
  const [templateSearch, setTemplateSearch] = useState("");
  const [addedTemplateIds, setAddedTemplateIds] = useState<Set<string>>(new Set());
  const [expandedTemplateIds, setExpandedTemplateIds] = useState<Set<string>>(new Set());
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [avulsoGroupName, setAvulsoGroupName] = useState("Itens Avulsos");

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
      setNegotiation(existingProposal.negotiation || "");
      setDescription(existingProposal.description || "");

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
        setPayments(pays.map((p: any) => ({ installment: p.installment, dueDate: p.due_date || "", amount: p.amount })));
      }

      setLoaded(true);
    }
  }, [existingProposal, loaded, isDuplicating]);

  const selectedEsn = salesTeam.find((m) => m.id === esnId);
  const autoGsn = selectedEsn?.linked_gsn_id ? salesTeam.find((m) => m.id === selectedEsn.linked_gsn_id) : null;
  const selectedClient = clients.find((c) => c.id === clientId);

  const filteredClients = clients.filter((c) =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase()) || c.code.includes(clientSearch)
  );

  const availableTemplates = useMemo(() => {
    let templates = scopeTemplates;
    if (product) {
      templates = templates.filter((t) => t.product.toLowerCase() === product.toLowerCase() || t.product === "TOTVS");
    }
    if (templateSearch) {
      const q = templateSearch.toLowerCase();
      templates = templates.filter((t) => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
    }
    return templates;
  }, [product, scopeTemplates, templateSearch]);

  // Calculate total hours from included children only
  const totalHours = useMemo(() => {
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
      groups.push({
        templateId: tid,
        templateName: tmpl?.name || "Template",
        category: tmpl?.category || "",
        processes: procs,
      });
    }

    if (noTemplate.length > 0) {
      groups.push({ templateId: undefined, templateName: avulsoGroupName, category: "", processes: noTemplate });
    }

    return groups;
  }, [scopeProcesses, scopeTemplates]);

  function toggleTemplateExpand(templateId: string) {
    setExpandedTemplateIds((prev) => {
      const next = new Set(prev);
      if (next.has(templateId)) next.delete(templateId);
      else next.add(templateId);
      return next;
    });
  }

  const gpHours = Math.ceil(totalHours * (gpPercentage / 100));
  const totalValue = (totalHours + gpHours) * hourlyRate;

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

  // Update child description
  function updateChildDescription(processId: string, childId: string, desc: string) {
    setScopeProcesses((prev) =>
      prev.map((p) => {
        if (p.id !== processId) return p;
        return { ...p, children: p.children.map((c) => c.id === childId ? { ...c, description: desc } : c) };
      })
    );
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
  const prevTotalValueRef = useMemo(() => totalValue, [totalValue]);
  useEffect(() => {
    if (paymentMode === "linear" && numInstallments > 0) {
      generateLinearPayments(numInstallments, totalValue, firstDueDate);
    }
  }, [totalValue]);

  async function handleSave(status: "rascunho" | "enviada") {
    if (!proposalNumber || !clientId || !product || !proposalType) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }

    // Flatten scope to save: parents + children with parent_id reference
    const allScopeItems: any[] = [];
    let sortOrder = 0;
    for (const proc of scopeProcesses) {
      const parentSortOrder = sortOrder++;
      // Save parent as a scope item with hours = sum
      allScopeItems.push({
        description: proc.description,
        included: proc.included,
        hours: processHours(proc),
        phase: 1,
        notes: "",
        sort_order: parentSortOrder,
        template_id: proc.templateId || null,
        parent_id: null,
        _local_id: proc.id, // for linking children
      });

      for (const child of proc.children) {
        allScopeItems.push({
          description: child.description,
          included: child.included,
          hours: child.hours,
          phase: 1,
          notes: "",
          sort_order: sortOrder++,
          template_id: proc.templateId || null,
          parent_id: proc.id, // will be resolved server-side
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

    const proposalData = {
      number: proposalNumber,
      type: proposalType as any,
      product,
      status,
      scope_type: scopeType as any,
      client_id: clientId,
      esn_id: esnId || null,
      gsn_id: autoGsn?.id || null,
      arquiteto_id: arquitetoId || null,
      hourly_rate: hourlyRate,
      gp_percentage: gpPercentage,
      negotiation,
      description,
      scopeItems: allScopeItems,
      payments: paymentRows,
    };

    try {
      if (isEditing) {
        await updateProposal.mutateAsync({ id, ...proposalData });
        toast({ title: "Proposta atualizada!" });
      } else {
        await createProposal.mutateAsync({ ...proposalData, created_by: user!.id });
        toast({ title: status === "rascunho" ? "Rascunho salvo!" : "Proposta gerada!" });
      }
      navigate("/propostas");
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    }
  }

  const isSaving = createProposal.isPending || updateProposal.isPending;

  if ((isEditing || isDuplicating) && loadingProposal) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Carregando proposta...</p>
      </div>
    );
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
              <Input placeholder="OPP-2025-XXX" value={proposalNumber} onChange={(e) => setProposalNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de Proposta</Label>
              <Select value={proposalType} onValueChange={setProposalType}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="projeto">Projeto</SelectItem>
                  <SelectItem value="banco_de_horas">Banco de Horas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Produto</Label>
              <Select value={product} onValueChange={setProduct}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
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
          <div className="space-y-1.5">
            <Label className="text-xs">Descrição do Projeto</Label>
            <Input placeholder="Descreva brevemente o projeto" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          {/* Client */}
          <div className="space-y-3">
            <Label className="text-xs">Cliente</Label>
            {selectedClient ? (
              <div className="flex items-center justify-between rounded-md border border-border bg-accent/50 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{selectedClient.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedClient.code} · {selectedClient.cnpj}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setClientId("")}>Alterar</Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Buscar cliente..." value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} className="pl-9" />
                </div>
                {clientSearch.length >= 2 && (
                  <div className="max-h-48 overflow-auto rounded-md border border-border bg-card">
                    {filteredClients.map((c) => (
                      <button key={c.id} onClick={() => { setClientId(c.id); setClientSearch(""); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent">
                        <span className="font-medium text-foreground">{c.name}</span>
                        <span className="text-xs text-muted-foreground">{c.code}</span>
                      </button>
                    ))}
                    {filteredClients.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum cliente encontrado.</p>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sales Team */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Executivo de Vendas (ESN)</Label>
              <Select value={esnId} onValueChange={setEsnId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {salesTeam.filter((m) => m.role === "esn").map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.code} - {m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Gerente de Vendas (GSN)</Label>
              <div className="flex h-9 items-center rounded-md border border-border bg-muted px-3 text-sm text-muted-foreground">
                {autoGsn ? `${autoGsn.code} - ${autoGsn.name}` : "Vinculado ao ESN"}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Arquiteto de Solução</Label>
              <Select value={arquitetoId} onValueChange={setArquitetoId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {salesTeam.filter((m) => m.role === "arquiteto").map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.code} - {m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

          {/* Scope items - grouped by template */}
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
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Layers className="h-4 w-4" />
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
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (group.templateId) {
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
                                <Switch checked={proc.included} onCheckedChange={() => toggleProcess(proc.id)} />
                                <button onClick={() => removeProcess(proc.id)} className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>

                              {/* Children (Level 2) */}
                              {isExpanded && (
                                <div className="bg-muted/20">
                                  {proc.children.map((child, childIdx) => (
                                    <div key={child.id} className={`flex items-center gap-2 border-t border-border/50 px-3 py-1.5 pl-14 transition-colors ${child.included && proc.included ? "" : "opacity-60"}`}>
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
                                      <Switch
                                        checked={child.included}
                                        onCheckedChange={() => toggleChild(proc.id, child.id)}
                                        disabled={!proc.included}
                                      />
                                      <button onClick={() => removeChild(proc.id, child.id)} className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive">
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
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
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor Hora (R$)</Label>
              <Input type="number" value={hourlyRate} onChange={(e) => setHourlyRate(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">% Horas GP</Label>
              <Input type="number" value={gpPercentage} onChange={(e) => setGpPercentage(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Qtde Empresas</Label>
              <Input type="number" defaultValue={1} />
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/50 p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Resumo Financeiro</h3>
            <div className="grid gap-2 text-sm md:grid-cols-2">
              <div className="flex justify-between"><span className="text-muted-foreground">Horas Analista:</span><span className="font-medium text-foreground">{totalHours}h</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Horas GP ({gpPercentage}%):</span><span className="font-medium text-foreground">{gpHours}h</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total de Horas:</span><span className="font-medium text-foreground">{totalHours + gpHours}h</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Valor Líquido:</span><span className="font-semibold text-foreground">R$ {totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></div>
            </div>
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
                  <p><span className="text-muted-foreground">Tipo:</span> <span className="font-medium">{proposalType === "projeto" ? "Projeto" : proposalType === "banco_de_horas" ? "Banco de Horas" : "—"}</span></p>
                  <p><span className="text-muted-foreground">Produto:</span> <span className="font-medium">{product || "—"}</span></p>
                  <p><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{selectedClient?.name || "—"}</span></p>
                  <p><span className="text-muted-foreground">Descrição:</span> <span className="font-medium">{description || "—"}</span></p>
                  <p><span className="text-muted-foreground">ESN:</span> <span className="font-medium">{selectedEsn?.name || "—"}</span></p>
                  <p><span className="text-muted-foreground">GSN:</span> <span className="font-medium">{autoGsn?.name || "—"}</span></p>
                </div>
              </div>

              <div className="rounded-md border border-border p-4">
                <h3 className="mb-2 text-sm font-semibold text-foreground">Escopo</h3>
                <div className="space-y-1 text-sm">
                  {scopeProcesses.filter((p) => p.included).map((proc) => (
                    <div key={proc.id} className="flex justify-between">
                      <span className="text-muted-foreground">{proc.description || "(sem nome)"}</span>
                      <span className="font-medium">{proc.children.filter((c) => c.included).length} itens · {processHours(proc)}h</span>
                    </div>
                  ))}
                  {scopeProcesses.filter((p) => p.included).length === 0 && <p className="text-muted-foreground">Nenhum item de escopo incluído</p>}
                </div>
              </div>

              <div className="rounded-md border border-border bg-primary/5 p-4">
                <h3 className="mb-2 text-sm font-semibold text-foreground">Financeiro</h3>
                <div className="grid gap-1 text-sm md:grid-cols-2">
                  <p><span className="text-muted-foreground">Total Horas:</span> <span className="font-semibold">{totalHours + gpHours}h</span></p>
                  <p><span className="text-muted-foreground">Valor Hora:</span> <span className="font-semibold">R$ {hourlyRate.toFixed(2)}</span></p>
                  <p><span className="text-muted-foreground">Valor Total:</span> <span className="text-lg font-bold text-primary">R$ {totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></p>
                  <p><span className="text-muted-foreground">Parcelas:</span> <span className="font-semibold">{payments.length}x</span></p>
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
        <div className="flex gap-2">
          {currentStep === 4 ? (
            <>
              <Button variant="outline" onClick={() => handleSave("rascunho")} disabled={isSaving}>
                Salvar Rascunho
              </Button>
              <Button onClick={() => handleSave("enviada")} disabled={isSaving}>
                <Check className="mr-2 h-4 w-4" />{isEditing ? "Salvar Proposta" : "Gerar Proposta"}
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
