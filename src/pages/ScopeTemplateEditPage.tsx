import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save, Plus, Trash2, FolderPlus, FileText, ClipboardList, Check, CheckCircle2, XCircle, Clock, LayoutTemplate } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useProducts, useCategories, useScopeTemplates } from "@/hooks/useSupabaseData";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface ScopeItemForm {
  id?: string;
  description: string;
  default_hours: number;
  sort_order: number;
  parent_id?: string | null;
  children?: ScopeItemForm[];
}

const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  em_revisao: { label: "Em Revisão", icon: Clock, color: "text-warning" },
  aprovado: { label: "Aprovado", icon: CheckCircle2, color: "text-success" },
  inativo: { label: "Inativo", icon: XCircle, color: "text-muted-foreground" },
};

const steps = [
  { id: 1, label: "Dados Gerais", icon: FileText },
  { id: 2, label: "Itens do Escopo", icon: ClipboardList },
];

export default function ScopeTemplateEditPage() {
  const { id } = useParams();
  const isEditing = !!id;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { role: userRole } = useUserRole();
  const qc = useQueryClient();

  const { data: allTemplates = [] } = useScopeTemplates();
  const { data: products = [] } = useProducts();
  const { data: categories = [] } = useCategories();

  const existingTemplate = useMemo(() => allTemplates.find((t: any) => t.id === id), [allTemplates, id]);

  const [currentStep, setCurrentStep] = useState(1);
  const [form, setForm] = useState({ name: "", product: "", category: "" });
  const [status, setStatus] = useState("em_revisao");
  const [parentItems, setParentItems] = useState<ScopeItemForm[]>([]);
  const [saving, setSaving] = useState(false);
  const [createdByName, setCreatedByName] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Track if content was actually modified (dirty flag)
  const loadedSnapshotRef = useRef<string>("");
  const isDirty = useMemo(() => {
    if (!isEditing || !loadedSnapshotRef.current) return true; // new templates always "dirty"
    const currentSnapshot = JSON.stringify({ form, parentItems });
    return currentSnapshot !== loadedSnapshotRef.current;
  }, [form, parentItems, isEditing]);

  // Load existing template
  useEffect(() => {
    if (existingTemplate) {
      setForm({ name: existingTemplate.name, product: existingTemplate.product, category: existingTemplate.category });
      setStatus((existingTemplate as any).status || "em_revisao");
      setCreatedByName((existingTemplate as any).created_by_name || "");
      setCreatedAt(existingTemplate.created_at || "");
      const flatItems = (existingTemplate as any).scope_template_items || [];
      setParentItems(buildHierarchy(flatItems));
    }
  }, [existingTemplate]);

  function buildHierarchy(flatItems: any[]): ScopeItemForm[] {
    const parents = flatItems.filter((it: any) => !it.parent_id).sort((a: any, b: any) => a.sort_order - b.sort_order);
    return parents.map((p: any) => ({
      id: p.id,
      description: p.description,
      default_hours: p.default_hours,
      sort_order: p.sort_order,
      parent_id: null,
      children: flatItems
        .filter((c: any) => c.parent_id === p.id)
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((c: any) => ({
          id: c.id,
          description: c.description,
          default_hours: c.default_hours,
          sort_order: c.sort_order,
          parent_id: p.id,
        })),
    }));
  }

  function parentHours(parent: ScopeItemForm): number {
    if (!parent.children || parent.children.length === 0) return parent.default_hours;
    return parent.children.reduce((sum, c) => sum + (c.default_hours || 0), 0);
  }

  const addParent = () => {
    setParentItems((prev) => [
      ...prev,
      { description: "", default_hours: 0, sort_order: prev.length, parent_id: null, children: [] },
    ]);
  };

  const removeParent = (index: number) => {
    setParentItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateParent = (index: number, field: string, value: any) => {
    setParentItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  };

  const addChild = (parentIndex: number) => {
    setParentItems((prev) =>
      prev.map((p, i) =>
        i === parentIndex
          ? { ...p, children: [...(p.children || []), { description: "", default_hours: 0, sort_order: (p.children || []).length }] }
          : p
      )
    );
  };

  const removeChild = (parentIndex: number, childIndex: number) => {
    setParentItems((prev) =>
      prev.map((p, i) =>
        i === parentIndex
          ? { ...p, children: (p.children || []).filter((_, ci) => ci !== childIndex) }
          : p
      )
    );
  };

  const updateChild = (parentIndex: number, childIndex: number, field: string, value: any) => {
    setParentItems((prev) =>
      prev.map((p, i) =>
        i === parentIndex
          ? { ...p, children: (p.children || []).map((c, ci) => ci === childIndex ? { ...c, [field]: value } : c) }
          : p
      )
    );
  };

  const totalHours = useMemo(() => {
    return parentItems.reduce((sum, p) => sum + parentHours(p), 0);
  }, [parentItems]);

  const progress = useMemo(() => {
    let filled = 0;
    if (form.name) filled++;
    if (form.product) filled++;
    if (form.category) filled++;
    if (parentItems.length > 0) filled++;
    return Math.round((filled / 4) * 100);
  }, [form, parentItems.length]);

  // Get user display name
  const [userDisplayName, setUserDisplayName] = useState("");
  useEffect(() => {
    if (user?.id) {
      supabase.from("profiles").select("display_name").eq("user_id", user.id).single().then(({ data }) => {
        if (data) setUserDisplayName(data.display_name);
      });
    }
  }, [user?.id]);

  const handleSave = async () => {
    if (!form.name || !form.product || !form.category) {
      toast({ title: "Preencha Nome, Produto e Categoria", variant: "destructive" });
      setCurrentStep(1);
      return;
    }
    setSaving(true);
    try {
      let templateId = id;
      // On edit, set status back to em_revisao
      const newStatus = isEditing ? "em_revisao" : "em_revisao";

      if (isEditing && id) {
        const { error } = await supabase.from("scope_templates").update({
          name: form.name,
          product: form.product,
          category: form.category,
          status: newStatus,
          updated_by: user?.id,
        } as any).eq("id", id);
        if (error) throw error;

        // Delete old items (children first due to FK)
        const { data: existingItems } = await supabase.from("scope_template_items").select("id, parent_id").eq("template_id", id);
        if (existingItems) {
          const childIds = existingItems.filter(i => i.parent_id).map(i => i.id);
          if (childIds.length > 0) await supabase.from("scope_template_items").delete().in("id", childIds);
          const parentIds = existingItems.filter(i => !i.parent_id).map(i => i.id);
          if (parentIds.length > 0) await supabase.from("scope_template_items").delete().in("id", parentIds);
        }
      } else {
        const { data, error } = await supabase.from("scope_templates").insert({
          name: form.name,
          product: form.product,
          category: form.category,
          status: newStatus,
          created_by: user?.id,
          created_by_name: userDisplayName || user?.email || "",
          updated_by: user?.id,
        } as any).select().single();
        if (error) throw error;
        templateId = data.id;
      }

      if (parentItems.length > 0 && templateId) {
        for (let pi = 0; pi < parentItems.length; pi++) {
          const p = parentItems[pi];
          const hours = parentHours(p);
          const { data: parentData, error: parentError } = await supabase
            .from("scope_template_items")
            .insert({
              template_id: templateId!,
              description: p.description,
              default_hours: hours,
              sort_order: pi,
              parent_id: null,
            })
            .select()
            .single();
          if (parentError) throw parentError;

          if (p.children && p.children.length > 0) {
            const childRows = p.children.map((c, ci) => ({
              template_id: templateId!,
              description: c.description,
              default_hours: c.default_hours,
              sort_order: ci,
              parent_id: parentData.id,
            }));
            const { error: childError } = await supabase.from("scope_template_items").insert(childRows);
            if (childError) throw childError;
          }
        }
      }

      toast({ title: isEditing ? "Template atualizado! Status: Em Revisão" : "Template criado!" });
      qc.invalidateQueries({ queryKey: ["scope_templates"] });
      navigate("/templates");
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleStatusAction = async (newStatus: string) => {
    if (!id) return;
    try {
      const { error } = await supabase.from("scope_templates").update({
        status: newStatus,
        updated_by: user?.id,
      } as any).eq("id", id);
      if (error) throw error;
      setStatus(newStatus);
      toast({ title: `Status alterado para ${STATUS_CONFIG[newStatus]?.label || newStatus}` });
      qc.invalidateQueries({ queryKey: ["scope_templates"] });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const isAdmin = userRole === "admin";
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.em_revisao;
  const StatusIcon = statusCfg.icon;

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-24">
      {/* ─── Hero Header ─────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-r from-[hsl(var(--hero-from))] via-[hsl(var(--hero-via))] to-[hsl(var(--hero-to))] p-5 text-white shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-3">
            <button onClick={() => navigate("/templates")} className="mt-1 rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {isEditing ? "Editar Template" : "Novo Template"}
              </h1>
              <p className="mt-1 text-sm text-white/70">
                {form.name || "Template de escopo para propostas"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isEditing && (
              <>
                {status !== "aprovado" && (
                  <Button size="sm" variant="secondary" className="bg-white/10 hover:bg-white/20 text-white border-0" onClick={() => handleStatusAction("aprovado")}>
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Aprovar
                  </Button>
                )}
                {status !== "inativo" && (
                  <Button size="sm" variant="secondary" className="bg-white/10 hover:bg-white/20 text-white border-0" onClick={() => handleStatusAction("inativo")}>
                    <XCircle className="mr-1.5 h-3.5 w-3.5" /> Inativar
                  </Button>
                )}
                {status === "inativo" && (
                  <Button size="sm" variant="secondary" className="bg-white/10 hover:bg-white/20 text-white border-0" onClick={() => handleStatusAction("em_revisao")}>
                    <Clock className="mr-1.5 h-3.5 w-3.5" /> Reativar
                  </Button>
                )}
              </>
            )}
            <Button size="sm" onClick={handleSave} disabled={saving} className="bg-white/20 hover:bg-white/30 text-white border-0">
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            ["Produto", form.product || "—"],
            ["Categoria", form.category || "—"],
            ["Total Horas", `${totalHours}h`],
            ["Itens", `${parentItems.reduce((s, p) => s + (p.children?.length || 0), 0)}`],
            ["Status", statusCfg.label],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-xl bg-white/10 px-3 py-2 backdrop-blur-sm">
              <div className="text-[10px] font-medium uppercase tracking-wider text-white/50">{label}</div>
              <div className="mt-0.5 flex items-center gap-1.5 truncate text-sm font-semibold">
                {label === "Status" && <StatusIcon className={`h-3.5 w-3.5 ${status === "aprovado" ? "text-green-300" : status === "inativo" ? "text-white/40" : "text-yellow-300"}`} />}
                {value}
              </div>
            </div>
          ))}
        </div>
        {/* Creator info */}
        {isEditing && (createdByName || createdAt) && (
          <div className="mt-3 flex items-center gap-4 text-[11px] text-white/50">
            {createdByName && <span>Criado por: <span className="text-white/70 font-medium">{createdByName}</span></span>}
            {createdAt && <span>em {new Date(createdAt).toLocaleDateString("pt-BR")}</span>}
          </div>
        )}
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
        <div className="grid grid-cols-2 gap-2">
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
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
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

      {/* ═══ Step 1: Dados Gerais ══════════════════════════════════ */}
      {currentStep === 1 && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm overflow-hidden">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <LayoutTemplate className="h-3.5 w-3.5 text-primary" />
              </div>
              Informações do Template
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-xs text-muted-foreground">Nome *</Label>
                <Input placeholder="Nome do template" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Produto *</Label>
                <Select value={form.product} onValueChange={(v) => setForm((f) => ({ ...f, product: v }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (<SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Categoria *</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (<SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Step 2: Itens do Escopo ═══════════════════════════════ */}
      {currentStep === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Itens do Escopo</h2>
            <Button variant="outline" size="sm" onClick={addParent}>
              <FolderPlus className="mr-1.5 h-3.5 w-3.5" /> Adicionar Processo
            </Button>
          </div>

          <div className="space-y-3">
            {parentItems.map((parent, pi) => (
              <div key={pi} className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
                {/* Parent row */}
                <div className="flex items-center gap-2 bg-muted/50 px-4 py-3">
                  <span className="text-xs font-semibold text-muted-foreground w-6 shrink-0 text-right">{pi + 1}.</span>
                  <Input
                    placeholder="Nome do processo (ex: CONTAS A PAGAR)"
                    value={parent.description}
                    onChange={(e) => updateParent(pi, "description", e.target.value)}
                    className="text-sm font-semibold flex-1 h-9"
                  />
                  <Badge variant="secondary" className="text-xs shrink-0">{parentHours(parent)}h</Badge>
                  <button onClick={() => removeParent(pi)} className="rounded p-1.5 text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {/* Children */}
                <div className="px-4 py-3 space-y-2">
                  {(parent.children || []).map((child, ci) => (
                    <div key={ci} className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground w-10 shrink-0 text-right">{pi + 1}.{ci + 1}</span>
                      <Input
                        placeholder="Descrição do item"
                        value={child.description}
                        onChange={(e) => updateChild(pi, ci, "description", e.target.value)}
                        className="text-sm flex-1 h-8"
                      />
                      <div className="flex items-center gap-1">
                        <Label className="text-[10px] text-muted-foreground">Horas:</Label>
                        <Input
                          type="number"
                          value={child.default_hours}
                          onChange={(e) => updateChild(pi, ci, "default_hours", Number(e.target.value))}
                          className="w-16 h-8 text-xs"
                        />
                      </div>
                      <button onClick={() => removeChild(pi, ci)} className="rounded p-1.5 text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => addChild(pi)}>
                    <Plus className="mr-1 h-3 w-3" /> Adicionar Item
                  </Button>
                </div>
              </div>
            ))}
            {parentItems.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
                <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">Nenhum processo adicionado.</p>
                <p className="text-xs text-muted-foreground mt-1">Clique em "Adicionar Processo" para começar.</p>
              </div>
            )}
          </div>

          {/* Summary */}
          {parentItems.length > 0 && (
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total de processos: <span className="font-semibold text-foreground">{parentItems.length}</span></span>
                <span className="text-muted-foreground">Total de horas: <span className="font-semibold text-foreground">{totalHours}h</span></span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Bottom Save Bar ─────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-card/95 backdrop-blur-sm px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Button variant="outline" onClick={() => navigate("/templates")}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Voltar
          </Button>
          <div className="flex items-center gap-2">
            {currentStep > 1 && (
              <Button variant="outline" onClick={() => setCurrentStep((s) => s - 1)}>Anterior</Button>
            )}
            {currentStep < steps.length ? (
              <Button onClick={() => setCurrentStep((s) => s + 1)}>Próximo</Button>
            ) : (
              <Button onClick={handleSave} disabled={saving}>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                {saving ? "Salvando..." : "Salvar Template"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
