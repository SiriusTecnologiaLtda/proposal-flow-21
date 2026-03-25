import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save, Plus, Trash2, FolderPlus, Upload, FileIcon, X, Paperclip, Library, Search } from "lucide-react";
import { useProject, useCreateProject, useUpdateProject } from "@/hooks/useProjects";
import { useClients, useSalesTeam, useProducts, useCategories, useScopeTemplates } from "@/hooks/useSupabaseData";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

interface ScopeItem {
  id?: string;
  _local_id: string;
  _parent_local_id?: string | null;
  description: string;
  included: boolean;
  hours: number;
  phase: number;
  sort_order: number;
  notes: string;
  template_id?: string | null;
  parent_id?: string | null;
  children?: ScopeItem[];
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

  const [scopeItems, setScopeItems] = useState<ScopeItem[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load existing project data
  useEffect(() => {
    if (existingProject) {
      setForm({
        client_id: existingProject.client_id,
        arquiteto_id: existingProject.arquiteto_id || "",
        product: existingProject.product,
        description: existingProject.description || "",
      });

      // Build scope items hierarchy
      const flat = existingProject.project_scope_items || [];
      const parents = flat.filter((i: any) => !i.parent_id).sort((a: any, b: any) => a.sort_order - b.sort_order);
      const built: ScopeItem[] = [];
      parents.forEach((p: any) => {
        const localId = `existing_${p.id}`;
        const children = flat
          .filter((c: any) => c.parent_id === p.id)
          .sort((a: any, b: any) => a.sort_order - b.sort_order)
          .map((c: any) => ({
            id: c.id,
            _local_id: `existing_${c.id}`,
            _parent_local_id: localId,
            description: c.description,
            included: c.included,
            hours: c.hours,
            phase: c.phase,
            sort_order: c.sort_order,
            notes: c.notes || "",
            template_id: c.template_id,
            parent_id: c.parent_id,
          }));
        built.push({
          id: p.id,
          _local_id: localId,
          description: p.description,
          included: p.included,
          hours: p.hours,
          phase: p.phase,
          sort_order: p.sort_order,
          notes: p.notes || "",
          template_id: p.template_id,
          parent_id: null,
          children,
        });
      });
      setScopeItems(built);

      setAttachments(existingProject.project_attachments || []);
    }
  }, [existingProject]);

  // Add template to scope
  const addTemplate = (templateId: string) => {
    const template = templates.find((t: any) => t.id === templateId);
    if (!template) return;
    const flatItems = (template as any).scope_template_items || [];
    const parents = flatItems.filter((i: any) => !i.parent_id).sort((a: any, b: any) => a.sort_order - b.sort_order);

    const newItems: ScopeItem[] = [];
    parents.forEach((p: any, pi: number) => {
      const localId = `local_${crypto.randomUUID()}`;
      const children = flatItems
        .filter((c: any) => c.parent_id === p.id)
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((c: any, ci: number) => ({
          _local_id: `local_${crypto.randomUUID()}`,
          _parent_local_id: localId,
          description: c.description,
          included: true,
          hours: c.default_hours,
          phase: 1,
          sort_order: ci,
          notes: "",
          template_id: templateId,
        }));
      newItems.push({
        _local_id: localId,
        description: p.description,
        included: true,
        hours: p.default_hours,
        phase: 1,
        sort_order: scopeItems.length + pi,
        notes: "",
        template_id: templateId,
        parent_id: null,
        children,
      });
    });
    setScopeItems((prev) => [...prev, ...newItems]);
  };

  // Manual process/item management
  const addProcess = () => {
    setScopeItems((prev) => [
      ...prev,
      {
        _local_id: `local_${crypto.randomUUID()}`,
        description: "",
        included: true,
        hours: 0,
        phase: 1,
        sort_order: prev.length,
        notes: "",
        parent_id: null,
        children: [],
      },
    ]);
  };

  const removeProcess = (idx: number) => setScopeItems((prev) => prev.filter((_, i) => i !== idx));

  const updateProcess = (idx: number, field: string, value: any) => {
    setScopeItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };

  const addItem = (parentIdx: number) => {
    setScopeItems((prev) =>
      prev.map((p, i) =>
        i === parentIdx
          ? {
              ...p,
              children: [
                ...(p.children || []),
                {
                  _local_id: `local_${crypto.randomUUID()}`,
                  _parent_local_id: p._local_id,
                  description: "",
                  included: true,
                  hours: 0,
                  phase: 1,
                  sort_order: (p.children || []).length,
                  notes: "",
                },
              ],
            }
          : p
      )
    );
  };

  const removeItem = (parentIdx: number, childIdx: number) => {
    setScopeItems((prev) =>
      prev.map((p, i) =>
        i === parentIdx ? { ...p, children: (p.children || []).filter((_, ci) => ci !== childIdx) } : p
      )
    );
  };

  const updateItem = (parentIdx: number, childIdx: number, field: string, value: any) => {
    setScopeItems((prev) =>
      prev.map((p, i) =>
        i === parentIdx
          ? {
              ...p,
              children: (p.children || []).map((c, ci) =>
                ci === childIdx ? { ...c, [field]: value } : c
              ),
            }
          : p
      )
    );
  };

  const parentHours = (parent: ScopeItem) => {
    if (!parent.children || parent.children.length === 0) return parent.hours;
    return parent.children.filter((c) => c.included).reduce((sum, c) => sum + (c.hours || 0), 0);
  };

  // Flatten scope for saving
  const flattenScope = (): any[] => {
    const flat: any[] = [];
    scopeItems.forEach((p, pi) => {
      flat.push({
        ...p,
        hours: parentHours(p),
        sort_order: pi,
      });
      (p.children || []).forEach((c, ci) => {
        flat.push({ ...c, sort_order: ci });
      });
    });
    return flat;
  };

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
          // Save attachment to DB immediately for existing projects
          await supabase.from("project_attachments").insert({
            project_id: id,
            file_name: file.name,
            file_url: urlData.publicUrl,
            file_size: file.size,
            mime_type: file.type,
            uploaded_by: user.id,
          });
        }

        setAttachments((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            file_name: file.name,
            file_url: urlData.publicUrl,
            file_size: file.size,
            mime_type: file.type,
            _isNew: !id,
          },
        ]);
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
          id: projectId,
          ...form,
          created_by: user!.id,
          scopeItems: flatScope,
        });
        // Save pending attachments
        for (const att of attachments.filter((a) => a._isNew)) {
          await supabase.from("project_attachments").insert({
            project_id: projectId,
            file_name: att.file_name,
            file_url: att.file_url,
            file_size: att.file_size,
            mime_type: att.mime_type,
            uploaded_by: user!.id,
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
    <div className="space-y-4">
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
          <TabsTrigger value="escopo">Escopo ({scopeItems.length} processos)</TabsTrigger>
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
          {!isReadOnly && (
            <div className="flex flex-wrap items-center gap-2">
              <Select onValueChange={addTemplate}>
                <SelectTrigger className="w-[250px]">
                  <SelectValue placeholder="Adicionar template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.name} ({t.product})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={addProcess}>
                <FolderPlus className="mr-2 h-4 w-4" />Adicionar Processo Manual
              </Button>
            </div>
          )}

          <div className="space-y-3">
            {scopeItems.map((parent, pi) => (
              <div key={parent._local_id} className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="flex items-center gap-2 bg-muted/50 px-3 py-2">
                  <Checkbox
                    checked={parent.included}
                    onCheckedChange={(v) => updateProcess(pi, "included", !!v)}
                    disabled={isReadOnly}
                  />
                  <span className="text-xs font-semibold text-muted-foreground w-6 text-right">{pi + 1}.</span>
                  <Input
                    value={parent.description}
                    onChange={(e) => updateProcess(pi, "description", e.target.value)}
                    className="text-sm font-semibold flex-1"
                    placeholder="Nome do processo"
                    disabled={isReadOnly}
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{parentHours(parent)}h</span>
                  {!isReadOnly && (
                    <button onClick={() => removeProcess(pi)} className="rounded p-1 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="px-3 py-2 space-y-1.5">
                  {(parent.children || []).map((child, ci) => (
                    <div key={child._local_id} className="flex items-center gap-2">
                      <Checkbox
                        checked={child.included}
                        onCheckedChange={(v) => updateItem(pi, ci, "included", !!v)}
                        disabled={isReadOnly}
                      />
                      <span className="text-[10px] text-muted-foreground w-10 text-right">{pi + 1}.{ci + 1}</span>
                      <Input
                        value={child.description}
                        onChange={(e) => updateItem(pi, ci, "description", e.target.value)}
                        className="text-sm flex-1"
                        placeholder="Descrição do item"
                        disabled={isReadOnly}
                      />
                      <div className="flex items-center gap-1">
                        <Label className="text-[10px] text-muted-foreground">Horas:</Label>
                        <Input
                          type="number"
                          value={child.hours}
                          onChange={(e) => updateItem(pi, ci, "hours", Number(e.target.value))}
                          className="w-16 h-7 text-xs"
                          disabled={isReadOnly}
                        />
                      </div>
                      {!isReadOnly && (
                        <button onClick={() => removeItem(pi, ci)} className="rounded p-1 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {!isReadOnly && (
                    <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => addItem(pi)}>
                      <Plus className="mr-1 h-3 w-3" />Adicionar Item
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {scopeItems.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Nenhum processo no escopo. Adicione um template ou crie manualmente.
              </div>
            )}
          </div>
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
