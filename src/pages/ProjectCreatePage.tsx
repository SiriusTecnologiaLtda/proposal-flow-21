import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save, Plus, Trash2, Upload, FileIcon, X, Paperclip, Library, Search, Layers, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, MessageSquare } from "lucide-react";
import { useProject, useCreateProject, useUpdateProject } from "@/hooks/useProjects";
import { useClients, useSalesTeam, useProducts, useCategories, useScopeTemplates, useUnits } from "@/hooks/useSupabaseData";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  notes?: string;
}

let idCounter = 0;
function localId() {
  return `local_${Date.now()}_${++idCounter}`;
}

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
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();

  const arquitetos = useMemo(() => salesTeam.filter((m: any) => m.role === "arquiteto"), [salesTeam]);

  const [form, setForm] = useState({
    client_id: "",
    arquiteto_id: "",
    product: "",
    description: "",
  });

  // Derived client info (ESN, GSN, Unit)
  const selectedClient = useMemo(() => clients.find((c: any) => c.id === form.client_id), [clients, form.client_id]);
  const clientEsn = useMemo(() => salesTeam.find((m: any) => m.id === selectedClient?.esn_id), [salesTeam, selectedClient]);
  const clientGsn = useMemo(() => salesTeam.find((m: any) => m.id === selectedClient?.gsn_id), [salesTeam, selectedClient]);

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

  // Notes dialog state
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [notesDialogValue, setNotesDialogValue] = useState("");
  const [notesDialogTarget, setNotesDialogTarget] = useState<{ type: "process" | "child" | "group"; processId?: string; childId?: string; groupKey?: string } | null>(null);
  const [notesDialogLabel, setNotesDialogLabel] = useState("");

  // Group notes (internal, per template group)
  const [groupNotes, setGroupNotes] = useState<Record<string, string>>({});
  const [avulsoGroupName, setAvulsoGroupName] = useState("Itens Avulsos");

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
      const expandProc = new Set<string>();
      const expandTmpl = new Set<string>();

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
        processes.push({
          id: pid,
          description: p.description,
          included: p.included,
          templateId: p.template_id || undefined,
          notes: p.notes || "",
          children,
        });
        if (p.template_id) {
          templateIds.add(p.template_id);
          expandTmpl.add(p.template_id);
        } else {
          expandTmpl.add("_avulso");
        }
        expandProc.add(pid);
      });

      setScopeProcesses(processes);
      setAddedTemplateIds(templateIds);
      setExpandedProcessIds(expandProc);
      setExpandedTemplateIds(expandTmpl);
      setAttachments(existingProject.project_attachments || []);
      setLoaded(true);
    }
  }, [existingProject, loaded]);

  // Filtered templates for dialog
  const availableTemplates = useMemo(() => {
    const search = templateSearch.toLowerCase();
    return templates.filter((t: any) =>
      (t.name || "").toLowerCase().includes(search) ||
      (t.category || "").toLowerCase().includes(search) ||
      (t.product || "").toLowerCase().includes(search)
    );
  }, [templates, templateSearch]);

  // Group scope processes by template
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
      const tmpl = templates.find((t: any) => t.id === tid);
      groups.push({
        templateId: tid,
        templateName: tmpl?.name || "Template",
        category: (tmpl as any)?.category || "",
        processes: procs,
      });
    }

    if (noTemplate.length > 0) {
      groups.push({ templateId: undefined, templateName: avulsoGroupName, category: "", processes: noTemplate });
    }

    return groups;
  }, [scopeProcesses, templates, avulsoGroupName]);

  // Total hours
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

  // Add template to scope
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
    setExpandedTemplateIds((prev) => new Set([...prev, templateId]));
    setExpandedProcessIds((prev) => {
      const next = new Set(prev);
      newProcesses.forEach((p) => next.add(p.id));
      return next;
    });
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
      if (next.has(processId)) next.delete(processId);
      else next.add(processId);
      return next;
    });
  }

  function toggleTemplateExpand(templateId: string) {
    setExpandedTemplateIds((prev) => {
      const next = new Set(prev);
      if (next.has(templateId)) next.delete(templateId);
      else next.add(templateId);
      return next;
    });
  }

  function processHours(proc: ScopeProcess) {
    return proc.children.filter((c) => c.included).reduce((s, c) => s + c.hours, 0);
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

  // Flatten scope for saving
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
      if (isEditing) {
        await updateProject.mutateAsync({ id, ...form, scopeItems: flatScope });
      } else {
        const projectId = crypto.randomUUID();
        await createProject.mutateAsync({
          id: projectId, ...form, created_by: user!.id, scopeItems: flatScope,
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

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/projetos")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {isEditing ? "Editar Projeto" : "Novo Projeto de Implantação"}
          </h1>
          {existingProject && (
            <p className="text-sm text-muted-foreground">
              Cliente: {existingProject.clients?.name}
            </p>
          )}
        </div>
        <div className="flex-1" />
        {!isReadOnly && (
          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        )}
      </div>

      <Tabs defaultValue="dados" className="w-full">
        <TabsList>
          <TabsTrigger value="dados">Dados do Projeto</TabsTrigger>
          <TabsTrigger value="escopo">Escopo ({scopeProcesses.length} processos)</TabsTrigger>
          <TabsTrigger value="anexos">Anexos ({attachments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="dados" className="space-y-4 mt-4">
          <div className="grid gap-4 sm:grid-cols-2 rounded-lg border border-border bg-card p-4">
            <div className="grid gap-1">
              <Label className="text-xs">Cliente *</Label>
              <Select value={form.client_id} onValueChange={(v) => setForm((f) => ({ ...f, client_id: v }))} disabled={isReadOnly}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Arquiteto</Label>
              <Select value={form.arquiteto_id} onValueChange={(v) => setForm((f) => ({ ...f, arquiteto_id: v }))} disabled={isReadOnly}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {arquitetos.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Produto *</Label>
              <Select value={form.product} onValueChange={(v) => setForm((f) => ({ ...f, product: v }))} disabled={isReadOnly}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {products.map((p: any) => (
                    <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1 sm:col-span-2">
              <Label className="text-xs">Descrição</Label>
              <Textarea
                placeholder="Descrição do projeto de implantação..."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                disabled={isReadOnly}
                rows={3}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="escopo" className="space-y-4 mt-4">
          {/* Scope header */}
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Escopo do Projeto</h2>
            {!isReadOnly && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => { setTemplateSearch(""); setTemplateDialogOpen(true); }}>
                  <Library className="mr-1 h-3.5 w-3.5" /> Adicionar Template
                </Button>
                <Button variant="outline" size="sm" onClick={addProcess}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Novo Processo
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

          {/* Scope tree - grouped by template */}
          {scopeProcesses.length > 0 ? (
            <div className="space-y-3">
              {groupedScope.map((group) => {
                const groupKey = group.templateId || "_avulso";
                const isTemplateExpanded = expandedTemplateIds.has(groupKey);
                const groupHours = group.processes.reduce((sum, p) => sum + (p.included ? processHours(p) : 0), 0);
                const groupItemCount = group.processes.reduce((sum, p) => sum + p.children.length, 0);

                return (
                  <div key={groupKey} className="rounded-lg border border-border bg-card overflow-hidden">
                    {/* Template group header */}
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
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openNotesDialog(
                            { type: "group", groupKey },
                            groupNotes[groupKey] || "",
                            "📌 Comentário interno do grupo"
                          );
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
                            } else {
                              setScopeProcesses((prev) => prev.filter((p) => p.templateId));
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {isTemplateExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                    </div>

                    {/* Processes inside this template */}
                    {isTemplateExpanded && (
                      <div className="border-t border-border">
                        {/* Expand/Collapse all */}
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
                              {/* Process row */}
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
                                  onClick={() => openNotesDialog(
                                    { type: "process", processId: proc.id },
                                    proc.notes || "",
                                    "📝 Comentário do processo"
                                  )}
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

                              {/* Children */}
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
                                        onClick={() => openNotesDialog(
                                          { type: "child", processId: proc.id, childId: child.id },
                                          child.notes || "",
                                          "📝 Comentário do item"
                                        )}
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
        </TabsContent>

        <TabsContent value="anexos" className="space-y-4 mt-4">
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
