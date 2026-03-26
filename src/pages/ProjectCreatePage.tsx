import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save, Plus, Trash2, Upload, FileIcon, X, Paperclip, Library, Search, Layers, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, MessageSquare, Check, FileText, ClipboardList, FolderKanban, UserRoundSearch, Users, Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useProject, useCreateProject, useUpdateProject } from "@/hooks/useProjects";
import { useClients, useSalesTeam, useProducts, useCategories, useScopeTemplates, useUnits } from "@/hooks/useSupabaseData";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface ScopeChild {
  id: string;
  description: string;
  hours: number;
  included: boolean;
  notes?: string;
}

interface ScopeProcess {
  id: string;
  description: string;
  included: boolean;
  children: ScopeChild[];
  templateId?: string;
  groupId?: string;
  notes?: string;
}

let idCounter = 0;
function localId() {
  return `local_${Date.now()}_${++idCounter}`;
}

const STATUS_MAP: Record<string, string> = {
  rascunho: "Rascunho",
  em_revisao: "Em Revisão",
  concluido: "Concluído",
};

const steps = [
  { id: 1, label: "Dados do Projeto", icon: FileText },
  { id: 2, label: "Escopo", icon: ClipboardList },
  { id: 3, label: "Anexos", icon: Paperclip },
];

export default function ProjectCreatePage() {
  const { id } = useParams();
  const isEditing = !!id;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: existingProject, isLoading: loadingProject } = useProject(id);
  const { data: clients = [] } = useClients();
  const { data: salesTeam = [] } = useSalesTeam();
  const { data: products = [] } = useProducts();
  const { data: categories = [] } = useCategories();
  const { data: templates = [] } = useScopeTemplates();
  const { data: units = [] } = useUnits();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();

  const arquitetos = useMemo(() => salesTeam.filter((m: any) => m.role === "arquiteto"), [salesTeam]);

  const [currentStep, setCurrentStep] = useState(1);
  const [form, setForm] = useState({
    client_id: "",
    arquiteto_id: "",
    product: "",
    description: "",
  });

  const selectedClient = useMemo(() => clients.find((c: any) => c.id === form.client_id), [clients, form.client_id]);
  const clientEsn = useMemo(() => salesTeam.find((m: any) => m.id === selectedClient?.esn_id), [salesTeam, selectedClient]);
  const clientGsn = useMemo(() => salesTeam.find((m: any) => m.id === selectedClient?.gsn_id), [salesTeam, selectedClient]);
  const clientUnit = useMemo(() => units.find((u: any) => u.id === selectedClient?.unit_id), [units, selectedClient]);
  const selectedArquiteto = useMemo(() => salesTeam.find((m: any) => m.id === form.arquiteto_id), [salesTeam, form.arquiteto_id]);

  const [scopeProcesses, setScopeProcesses] = useState<ScopeProcess[]>([]);
  const [expandedProcessIds, setExpandedProcessIds] = useState<Set<string>>(new Set());
  const [expandedTemplateIds, setExpandedTemplateIds] = useState<Set<string>>(new Set());
  const [addedTemplateIds, setAddedTemplateIds] = useState<Set<string>>(new Set());
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [clientPopoverOpen, setClientPopoverOpen] = useState(false);
  const [arquitetoPopoverOpen, setArquitetoPopoverOpen] = useState(false);

  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [notesDialogValue, setNotesDialogValue] = useState("");
  const [notesDialogTarget, setNotesDialogTarget] = useState<{ type: "process" | "child" | "group"; processId?: string; childId?: string; groupKey?: string } | null>(null);
  const [notesDialogLabel, setNotesDialogLabel] = useState("");

  const [groupNotes, setGroupNotes] = useState<Record<string, string>>({});
  const [manualGroupNames, setManualGroupNames] = useState<Record<string, string>>({});

  // Load existing project data
  useEffect(() => {
    if (existingProject && !loaded) {
      setForm({
        client_id: existingProject.client_id,
        arquiteto_id: existingProject.arquiteto_id || "",
        product: existingProject.product,
        description: existingProject.description || "",
      });

      const flat = existingProject.project_scope_items || [];
      const parents = flat.filter((i: any) => !i.parent_id).sort((a: any, b: any) => a.sort_order - b.sort_order);
      const processes: ScopeProcess[] = [];
      const templateIds = new Set<string>();

      const loadedGroupNotes = (existingProject as any).group_notes || {};
      const loadedManualGroups: Record<string, string> = loadedGroupNotes._manual_groups || {};
      const processGroupMapping: Record<string, string> = loadedGroupNotes._process_group_map || {};

      parents.forEach((p: any) => {
        const pid = localId();
        const children = flat
          .filter((c: any) => c.parent_id === p.id)
          .sort((a: any, b: any) => a.sort_order - b.sort_order)
          .map((c: any) => ({
            id: localId(),
            description: c.description,
            hours: c.hours,
            included: c.included,
            notes: c.notes || "",
          }));
        let groupId: string | undefined;
        if (!p.template_id) {
          groupId = processGroupMapping[p.id];
          if (!groupId) {
            const existingGroupIds = Object.keys(loadedManualGroups);
            if (existingGroupIds.length > 0) {
              groupId = existingGroupIds[0];
            } else {
              const defaultGid = localId();
              loadedManualGroups[defaultGid] = loadedGroupNotes._avulso_name || "Itens Avulsos";
              groupId = defaultGid;
            }
          }
        }
        processes.push({
          id: pid,
          _dbId: p.id,
          description: p.description,
          included: p.included,
          templateId: p.template_id || undefined,
          groupId,
          notes: p.notes || "",
          children,
        } as any);
        if (p.template_id) {
          templateIds.add(p.template_id);
        }
      });

      setScopeProcesses(processes);
      setAddedTemplateIds(templateIds);
      setExpandedProcessIds(new Set());
      setExpandedTemplateIds(new Set());
      setAttachments(existingProject.project_attachments || []);
      setGroupNotes(loadedGroupNotes);
      setManualGroupNames(loadedManualGroups);
      setLoaded(true);
    }
  }, [existingProject, loaded]);

  const availableTemplates = useMemo(() => {
    const search = templateSearch.toLowerCase();
    return templates.filter((t: any) =>
      (t.name || "").toLowerCase().includes(search) ||
      (t.category || "").toLowerCase().includes(search) ||
      (t.product || "").toLowerCase().includes(search)
    );
  }, [templates, templateSearch]);

  const groupedScope = useMemo(() => {
    const groups: { templateId: string | undefined; groupId?: string; templateName: string; category: string; processes: ScopeProcess[] }[] = [];
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
      const tmpl = templates.find((t: any) => t.id === tid);
      groups.push({
        templateId: tid,
        templateName: tmpl?.name || "Template",
        category: (tmpl as any)?.category || "",
        processes: procs,
      });
    }

    for (const gid of Object.keys(manualGroupNames)) {
      groups.push({
        templateId: undefined,
        groupId: gid,
        templateName: manualGroupNames[gid] || "Novo Grupo",
        category: "",
        processes: manualGroups.get(gid) || [],
      });
    }

    return groups;
  }, [scopeProcesses, templates, manualGroupNames]);

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

  const progress = useMemo(() => {
    let filled = 0;
    if (form.client_id) filled++;
    if (form.product) filled++;
    if (scopeProcesses.length > 0) filled++;
    return Math.round((filled / 3) * 100);
  }, [form.client_id, form.product, scopeProcesses.length]);

  // ── Scope operations ──────────────────────────────────────────
  function addTemplateToScope(templateId: string) {
    if (addedTemplateIds.has(templateId)) return;
    const template = templates.find((t: any) => t.id === templateId);
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
        children: kids.map((kid: any) => ({
          id: localId(),
          description: kid.description,
          hours: kid.default_hours || 0,
          included: true,
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
    setAddedTemplateIds((prev) => new Set([...prev, templateId]));
  }

  function removeTemplateFromScope(templateId: string) {
    setScopeProcesses((prev) => prev.filter((p) => p.templateId !== templateId));
    setAddedTemplateIds((prev) => { const next = new Set(prev); next.delete(templateId); return next; });
  }

  function toggleProcess(processId: string) {
    setScopeProcesses((prev) =>
      prev.map((p) => {
        if (p.id !== processId) return p;
        const newIncluded = !p.included;
        return { ...p, included: newIncluded, children: p.children.map((c) => ({ ...c, included: newIncluded })) };
      })
    );
  }

  function toggleChild(processId: string, childId: string) {
    setScopeProcesses((prev) =>
      prev.map((p) => {
        if (p.id !== processId) return p;
        return { ...p, children: p.children.map((c) => c.id === childId ? { ...c, included: !c.included } : c) };
      })
    );
  }

  function updateChildHours(processId: string, childId: string, hours: number) {
    setScopeProcesses((prev) =>
      prev.map((p) => {
        if (p.id !== processId) return p;
        return { ...p, children: p.children.map((c) => c.id === childId ? { ...c, hours } : c) };
      })
    );
  }

  function updateProcessDescription(processId: string, desc: string) {
    setScopeProcesses((prev) => prev.map((p) => p.id === processId ? { ...p, description: desc } : p));
  }

  function updateChildDescription(processId: string, childId: string, desc: string) {
    setScopeProcesses((prev) =>
      prev.map((p) => {
        if (p.id !== processId) return p;
        return { ...p, children: p.children.map((c) => c.id === childId ? { ...c, description: desc } : c) };
      })
    );
  }

  function addGroup() {
    const gid = localId();
    setManualGroupNames((prev) => ({ ...prev, [gid]: "Novo Grupo" }));
    setExpandedTemplateIds((prev) => new Set([...prev, gid]));
  }

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

  function addChild(processId: string) {
    setScopeProcesses((prev) =>
      prev.map((p) => {
        if (p.id !== processId) return p;
        return { ...p, children: [...p.children, { id: localId(), description: "", hours: 0, included: true }] };
      })
    );
  }

  function removeProcess(processId: string) {
    setScopeProcesses((prev) => prev.filter((p) => p.id !== processId));
  }

  function removeChild(processId: string, childId: string) {
    setScopeProcesses((prev) =>
      prev.map((p) => {
        if (p.id !== processId) return p;
        return { ...p, children: p.children.filter((c) => c.id !== childId) };
      })
    );
  }

  function toggleExpand(processId: string) {
    setExpandedProcessIds((prev) => {
      const next = new Set(prev);
      if (next.has(processId)) next.delete(processId); else next.add(processId);
      return next;
    });
  }

  function toggleTemplateExpand(templateId: string) {
    setExpandedTemplateIds((prev) => {
      const next = new Set(prev);
      if (next.has(templateId)) next.delete(templateId); else next.add(templateId);
      return next;
    });
  }

  function processHours(proc: ScopeProcess) {
    return proc.children.filter((c) => c.included).reduce((s, c) => s + c.hours, 0);
  }

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
      setScopeProcesses((prev) => prev.map((p) => p.id === processId ? { ...p, notes: notesDialogValue } : p));
    } else if (type === "child" && processId && childId) {
      setScopeProcesses((prev) =>
        prev.map((p) => {
          if (p.id !== processId) return p;
          return { ...p, children: p.children.map((c) => c.id === childId ? { ...c, notes: notesDialogValue } : c) };
        })
      );
    } else if (type === "group" && groupKey) {
      setGroupNotes((prev) => ({ ...prev, [groupKey]: notesDialogValue }));
    }
    setNotesDialogOpen(false);
  }

  function flattenScope(): any[] {
    const allItems: any[] = [];
    let sortOrder = 0;
    for (const proc of scopeProcesses) {
      const parentSortOrder = sortOrder++;
      allItems.push({
        description: proc.description,
        included: proc.included,
        hours: processHours(proc),
        phase: 1,
        notes: proc.notes || "",
        sort_order: parentSortOrder,
        template_id: proc.templateId || null,
        parent_id: null,
        _local_id: proc.id,
        _groupId: proc.groupId || null,
      });
      for (const child of proc.children) {
        allItems.push({
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
    return allItems;
  }

  // File upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !user) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const path = `${id || "new"}/${crypto.randomUUID()}_${file.name}`;
        const { error: uploadError } = await supabase.storage.from("project-attachments").upload(path, file);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("project-attachments").getPublicUrl(path);
        if (id) {
          await supabase.from("project_attachments").insert({
            project_id: id, file_name: file.name, file_url: urlData.publicUrl,
            file_size: file.size, mime_type: file.type, uploaded_by: user.id,
          });
        }
        setAttachments((prev) => [...prev, {
          id: crypto.randomUUID(), file_name: file.name, file_url: urlData.publicUrl,
          file_size: file.size, mime_type: file.type, _isNew: !id,
        }]);
      }
      toast({ title: "Arquivo(s) anexado(s)" });
    } catch (err: any) {
      toast({ title: "Erro no upload", description: err.message, variant: "destructive" });
    }
    setUploading(false);
    e.target.value = "";
  };

  const removeAttachment = async (att: any) => {
    if (att.id && !att._isNew) {
      await supabase.from("project_attachments").delete().eq("id", att.id);
    }
    setAttachments((prev) => prev.filter((a) => a.id !== att.id));
  };

  // Save
  const handleSave = async () => {
    if (!form.client_id || !form.product) {
      toast({ title: "Preencha Cliente e Produto", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const flatScope = flattenScope();
      const savedGroupNotes = { ...groupNotes, _manual_groups: manualGroupNames };
      if (isEditing) {
        await updateProject.mutateAsync({ id, ...form, group_notes: savedGroupNotes, scopeItems: flatScope });
      } else {
        const projectId = crypto.randomUUID();
        await createProject.mutateAsync({
          id: projectId, ...form, group_notes: savedGroupNotes, created_by: user!.id, scopeItems: flatScope,
        });
        for (const att of attachments.filter((a) => a._isNew)) {
          await supabase.from("project_attachments").insert({
            project_id: projectId, file_name: att.file_name, file_url: att.file_url,
            file_size: att.file_size, mime_type: att.mime_type, uploaded_by: user!.id,
          });
        }
      }
      toast({ title: isEditing ? "Projeto atualizado!" : "Projeto criado!" });
      navigate("/projetos");
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  if (isEditing && loadingProject) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Carregando...</div>;
  }

  const isReadOnly = existingProject?.status === "concluido";
  const statusLabel = STATUS_MAP[existingProject?.status || "rascunho"] || "Rascunho";

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-24">
      {/* ─── Hero Header ─────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-r from-[hsl(215,28%,17%)] via-[hsl(217,33%,22%)] to-[hsl(217,91%,40%)] p-5 text-white shadow-lg dark:from-[hsl(222,47%,8%)] dark:via-[hsl(217,33%,14%)] dark:to-[hsl(217,91%,30%)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-3">
            <button onClick={() => navigate("/projetos")} className="mt-1 rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {isEditing ? "Editar Projeto" : "Novo Projeto"}
              </h1>
              <p className="mt-1 text-sm text-white/70">
                {form.description || "Defina o escopo técnico do projeto de implantação"}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Cliente", selectedClient?.name || "—"],
              ["Produto", form.product || "—"],
              ["Eng. Valor", selectedArquiteto?.name || "—"],
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

      {/* ─── Step Navigator ──────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Etapa <span className="font-semibold text-foreground">{currentStep}</span> de {steps.length}
          </div>
          <Badge variant="secondary" className="rounded-full text-xs">
            {progress}% concluído
          </Badge>
        </div>
        <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {steps.map((step) => {
            const Icon = step.icon;
            const active = step.id === currentStep;
            const completed = step.id < currentStep;
            return (
              <button
                key={step.id}
                onClick={() => setCurrentStep(step.id)}
                className={`group flex items-center gap-3 rounded-xl border p-3 text-left transition-all duration-200 ${
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20"
                    : completed
                    ? "border-primary/20 bg-primary/5 text-foreground hover:border-primary/40"
                    : "border-border bg-card text-muted-foreground hover:border-border hover:bg-accent/50"
                }`}
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  active ? "bg-white/20" : completed ? "bg-primary/10" : "bg-muted"
                }`}>
                  {completed ? <Check className="h-4 w-4 text-primary" /> : <Icon className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{step.label}</div>
                  <div className={`text-[11px] ${active ? "text-white/70" : "text-muted-foreground"}`}>
                    {active ? "Etapa atual" : completed ? "Concluída" : "Pendente"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ Step 1: Dados do Projeto ══════════════════════════════ */}
      {currentStep === 1 && (
        <div className="space-y-5">
          {/* ── Contexto do Cliente ────────────────────────────────── */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
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
                        {clientUnit && (
                          <Badge variant="outline" className="text-[11px] font-normal">{clientUnit.name}</Badge>
                        )}
                      </div>
                    </div>
                    {!isReadOnly && (
                      <Button variant="outline" size="sm" onClick={() => setForm(f => ({ ...f, client_id: "" }))} className="shrink-0">Alterar</Button>
                    )}
                  </div>
                </div>
                {/* ESN / GSN info */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">ESN (do cliente)</div>
                    <div className="mt-0.5 text-sm font-medium text-foreground">{clientEsn?.name || "—"}</div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">GSN (do cliente)</div>
                    <div className="mt-0.5 text-sm font-medium text-foreground">{clientGsn?.name || "—"}</div>
                  </div>
                </div>
              </div>
            ) : (
              <Popover open={clientPopoverOpen} onOpenChange={setClientPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" disabled={isReadOnly} className="w-full justify-between font-normal h-10">
                    Selecione o cliente
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Pesquisar cliente..." />
                    <CommandList>
                      <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                      <CommandGroup>
                        {clients.map((c: any) => (
                          <CommandItem
                            key={c.id}
                            value={`${c.name} ${c.code || ""} ${c.cnpj || ""}`}
                            onSelect={() => { setForm((f) => ({ ...f, client_id: c.id })); setClientPopoverOpen(false); }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", form.client_id === c.id ? "opacity-100" : "opacity-0")} />
                            <div className="flex flex-col">
                              <span>{c.name}</span>
                              <span className="text-xs text-muted-foreground">{c.code} · {c.cnpj}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </div>

          {/* ── Informações do Projeto ─────────────────────────────── */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <FolderKanban className="h-3.5 w-3.5 text-primary" />
              </div>
              Informações do Projeto
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Produto *</Label>
                <Select value={form.product} onValueChange={(v) => setForm((f) => ({ ...f, product: v }))} disabled={isReadOnly}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p: any) => (
                      <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Engenheiro de Valor</Label>
                <Popover open={arquitetoPopoverOpen} onOpenChange={setArquitetoPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" disabled={isReadOnly} className="w-full justify-between font-normal h-10">
                      {form.arquiteto_id
                        ? arquitetos.find((a: any) => a.id === form.arquiteto_id)?.name || "Selecione"
                        : "Selecione"}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Pesquisar arquiteto..." />
                      <CommandList>
                        <CommandEmpty>Nenhum arquiteto encontrado.</CommandEmpty>
                        <CommandGroup>
                          {arquitetos.map((a: any) => (
                            <CommandItem
                              key={a.id}
                              value={`${a.name} ${a.code || ""} ${a.email || ""}`}
                              onSelect={() => { setForm((f) => ({ ...f, arquiteto_id: a.id })); setArquitetoPopoverOpen(false); }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", form.arquiteto_id === a.id ? "opacity-100" : "opacity-0")} />
                              {a.code} - {a.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-xs text-muted-foreground">Descrição</Label>
                <Textarea
                  placeholder="Descrição do projeto de implantação..."
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  disabled={isReadOnly}
                  className="min-h-[80px] resize-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Step 2: Escopo ═══════════════════════════════════════ */}
      {currentStep === 2 && (
        <div className="space-y-4">
          {/* Scope header */}
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Escopo do Projeto</h2>
            {!isReadOnly && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => { setTemplateSearch(""); setTemplateDialogOpen(true); }}>
                  <Library className="mr-1 h-3.5 w-3.5" /> Adicionar Template
                </Button>
                <Button variant="outline" size="sm" onClick={addGroup}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Novo Grupo
                </Button>
              </div>
            )}
          </div>

          {/* Template search dialog */}
          <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Adicionar Templates de Escopo</DialogTitle>
              </DialogHeader>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Pesquisar templates por nome ou categoria..." value={templateSearch} onChange={(e) => setTemplateSearch(e.target.value)} className="pl-9" />
              </div>
              <div className="max-h-72 overflow-auto space-y-1">
                {availableTemplates.map((template: any) => {
                  const isAdded = addedTemplateIds.has(template.id);
                  const itemCount = (template.scope_template_items || []).length;
                  return (
                    <div key={template.id} className={`flex items-center justify-between rounded-md border px-3 py-2 transition-colors ${isAdded ? "border-primary/30 bg-primary/5" : "border-border hover:bg-accent/50"}`}>
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

          {/* Scope tree */}
          {(scopeProcesses.length > 0 || Object.keys(manualGroupNames).length > 0) ? (
            <div className="space-y-3">
              {groupedScope.map((group) => {
                const groupKey = group.templateId || group.groupId || "_unknown";
                const isTemplateExpanded = expandedTemplateIds.has(groupKey);
                const groupHours = group.processes.reduce((sum, p) => sum + (p.included ? processHours(p) : 0), 0);
                const groupItemCount = group.processes.reduce((sum, p) => sum + p.children.length, 0);

                return (
                  <div key={groupKey} className="rounded-lg border border-border bg-card overflow-hidden">
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors"
                      onClick={() => toggleTemplateExpand(groupKey)}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Layers className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        {group.groupId ? (
                          <Input
                            value={manualGroupNames[group.groupId] || ""}
                            onChange={(e) => setManualGroupNames((prev) => ({ ...prev, [group.groupId!]: e.target.value }))}
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
                          openNotesDialog({ type: "group", groupKey }, groupNotes[groupKey] || "", "📌 Comentário interno do grupo");
                        }}
                        className={`shrink-0 rounded p-1 transition-colors ${groupNotes[groupKey] ? "text-primary" : "text-muted-foreground"} hover:text-primary`}
                        title="Comentário interno do grupo"
                      >
                        <MessageSquare className="h-4 w-4" />
                      </button>
                      {!isReadOnly && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (group.templateId) {
                              removeTemplateFromScope(group.templateId);
                            } else if (group.groupId) {
                              setScopeProcesses((prev) => prev.filter((p) => p.groupId !== group.groupId));
                              setManualGroupNames((prev) => { const next = { ...prev }; delete next[group.groupId!]; return next; });
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {isTemplateExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                    </div>

                    {isTemplateExpanded && (
                      <div className="border-t border-border">
                        <div className="flex items-center justify-end gap-1 px-3 py-1.5 bg-muted/30 border-b border-border">
                          <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground"
                            onClick={() => {
                              const ids = group.processes.map((p) => p.id);
                              setExpandedProcessIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.add(id)); return next; });
                            }}
                          >
                            <ChevronsUpDown className="mr-1 h-3 w-3" /> Expandir todos
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground"
                            onClick={() => {
                              const ids = group.processes.map((p) => p.id);
                              setExpandedProcessIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
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
                                  disabled={isReadOnly}
                                />
                                <span className="shrink-0 text-xs text-muted-foreground w-12 text-right">{hours}h</span>
                                <button
                                  onClick={() => openNotesDialog({ type: "process", processId: proc.id }, proc.notes || "", "📝 Comentário do processo")}
                                  className={`shrink-0 rounded p-1 transition-colors ${proc.notes ? "text-primary" : "text-muted-foreground"} hover:text-primary`}
                                  title="Comentário do processo"
                                >
                                  <MessageSquare className="h-3.5 w-3.5" />
                                </button>
                                <Switch checked={proc.included} onCheckedChange={() => toggleProcess(proc.id)} disabled={isReadOnly} />
                                {!isReadOnly && (
                                  <button onClick={() => removeProcess(proc.id)} className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>

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
                                        disabled={isReadOnly}
                                      />
                                      <Input
                                        type="number"
                                        min={0}
                                        value={child.hours}
                                        onChange={(e) => updateChildHours(proc.id, child.id, Number(e.target.value))}
                                        className="h-7 w-16 text-center text-xs"
                                        disabled={!child.included || !proc.included || isReadOnly}
                                      />
                                      <button
                                        onClick={() => openNotesDialog({ type: "child", processId: proc.id, childId: child.id }, child.notes || "", "📝 Comentário do item")}
                                        className={`shrink-0 rounded p-1 transition-colors ${child.notes ? "text-primary" : "text-muted-foreground"} hover:text-primary`}
                                        title="Comentário do item"
                                      >
                                        <MessageSquare className="h-3.5 w-3.5" />
                                      </button>
                                      <Switch
                                        checked={child.included}
                                        onCheckedChange={() => toggleChild(proc.id, child.id)}
                                        disabled={!proc.included || isReadOnly}
                                      />
                                      {!isReadOnly && (
                                        <button onClick={() => removeChild(proc.id, child.id)} className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive">
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                  {!isReadOnly && (
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
                        {!isReadOnly && (
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

      {/* ═══ Step 3: Anexos ═══════════════════════════════════════ */}
      {currentStep === 3 && (
        <div className="space-y-4">
          {!isReadOnly && (
            <div>
              <Label htmlFor="file-upload" className="cursor-pointer">
                <div className="flex items-center gap-2 rounded-lg border-2 border-dashed border-border p-6 text-center hover:bg-accent/50 transition-colors">
                  <Upload className="h-6 w-6 text-muted-foreground mx-auto" />
                  <span className="text-sm text-muted-foreground">
                    {uploading ? "Enviando..." : "Clique para anexar documentos (relatórios, levantamentos, etc.)"}
                  </span>
                </div>
              </Label>
              <input id="file-upload" type="file" multiple className="hidden" onChange={handleFileUpload} disabled={uploading} />
            </div>
          )}

          <div className="space-y-2">
            {attachments.map((att) => (
              <div key={att.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
                <FileIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-foreground hover:underline truncate block">
                    {att.file_name}
                  </a>
                  {att.file_size > 0 && (
                    <p className="text-xs text-muted-foreground">{(att.file_size / 1024).toFixed(0)} KB</p>
                  )}
                </div>
                {!isReadOnly && (
                  <button onClick={() => removeAttachment(att)} className="rounded p-1 text-muted-foreground hover:text-destructive">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {attachments.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Paperclip className="mx-auto h-8 w-8 mb-2 opacity-40" />
                Nenhum anexo adicionado
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Floating Footer ─────────────────────────────────────── */}
      {!isReadOnly && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              {currentStep > 1 && (
                <Button variant="outline" onClick={() => setCurrentStep(s => s - 1)}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Anterior
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleSave} disabled={saving} variant="default">
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Salvando..." : "Salvar"}
              </Button>
              {currentStep < steps.length && (
                <Button onClick={() => setCurrentStep(s => s + 1)}>
                  Próximo <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
