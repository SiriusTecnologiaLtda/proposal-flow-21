import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Pencil, Trash2, Search, ToggleLeft, ToggleRight,
  Cog, GripVertical, Save, X, ChevronDown, ChevronUp, Sparkles, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";

const SCOPE_OPTIONS = [
  { value: "item", label: "Item da Proposta" },
  { value: "header", label: "Cabeçalho da Proposta" },
  { value: "matching", label: "Pareamento / Matching" },
  { value: "normalization", label: "Normalização" },
];

const TARGET_FIELD_OPTIONS: Record<string, { value: string; label: string }[]> = {
  item: [
    { value: "recurrence", label: "Recorrência" },
    { value: "cost_classification", label: "Classificação de Custo" },
    { value: "item_type", label: "Tipo de Item" },
    { value: "description", label: "Descrição" },
    { value: "notes", label: "Notas" },
  ],
  header: [
    { value: "payment_type", label: "Tipo de Pagamento" },
    { value: "currency", label: "Moeda" },
    { value: "notes", label: "Notas" },
  ],
  matching: [
    { value: "client_name", label: "Nome do Cliente" },
    { value: "vendor_name", label: "Nome do Fornecedor" },
    { value: "unit_name", label: "Nome da Unidade" },
  ],
  normalization: [
    { value: "recurrence", label: "Recorrência" },
    { value: "cost_classification", label: "Classificação de Custo" },
    { value: "description", label: "Descrição" },
  ],
};

const CONDITION_TYPE_OPTIONS = [
  { value: "contains", label: "Contém" },
  { value: "not_contains", label: "Não contém" },
  { value: "equals", label: "Igual a" },
  { value: "starts_with", label: "Começa com" },
  { value: "ends_with", label: "Termina com" },
  { value: "regex", label: "Regex" },
  { value: "greater_than", label: "Maior que" },
  { value: "less_than", label: "Menor que" },
];

const ACTION_TYPE_OPTIONS = [
  { value: "set_value", label: "Definir valor" },
  { value: "append", label: "Acrescentar" },
  { value: "replace", label: "Substituir texto" },
  { value: "flag_issue", label: "Criar pendência" },
];

const RECURRENCE_VALUES = [
  { value: "one_time", label: "Único (one_time)" },
  { value: "monthly", label: "Mensal (monthly)" },
  { value: "annual", label: "Anual (annual)" },
  { value: "usage_based", label: "Sob demanda (usage_based)" },
  { value: "measurement", label: "Medição (measurement)" },
];

const COST_VALUES = [
  { value: "capex", label: "Capex" },
  { value: "opex", label: "Opex" },
  { value: "other", label: "Outros" },
];

interface RuleForm {
  name: string;
  description: string;
  scope: string;
  target_field: string;
  condition_type: string;
  condition_value: string;
  action_type: string;
  action_value: string;
  priority: number;
  is_active: boolean;
  example: string;
  notes: string;
}

const emptyForm: RuleForm = {
  name: "",
  description: "",
  scope: "item",
  target_field: "recurrence",
  condition_type: "contains",
  condition_value: "",
  action_type: "set_value",
  action_value: "",
  priority: 100,
  is_active: true,
  example: "",
  notes: "",
};

export default function ExtractionRulesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleForm>({ ...emptyForm });
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState("all");

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["extraction-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("extraction_rules")
        .select("*")
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: applicationCounts = {} } = useQuery({
    queryKey: ["extraction-rule-application-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("extraction_rule_applications")
        .select("rule_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data || []) {
        if (row.rule_id) counts[row.rule_id] = (counts[row.rule_id] || 0) + 1;
      }
      return counts;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: RuleForm & { id?: string }) => {
      const payload = {
        name: data.name,
        description: data.description,
        scope: data.scope,
        target_field: data.target_field,
        condition_type: data.condition_type,
        condition_value: data.condition_value,
        action_type: data.action_type,
        action_value: data.action_value,
        priority: data.priority,
        is_active: data.is_active,
        example: data.example || null,
        notes: data.notes || null,
        created_by: user?.id || null,
      };
      if (data.id) {
        const { error } = await supabase
          .from("extraction_rules")
          .update(payload)
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("extraction_rules")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["extraction-rules"] });
      toast.success(editingId ? "Regra atualizada" : "Regra criada");
      setDialogOpen(false);
      setEditingId(null);
      setForm({ ...emptyForm });
    },
    onError: (err: any) => toast.error(err?.message || "Erro ao salvar regra"),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("extraction_rules")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["extraction-rules"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("extraction_rule_applications").delete().eq("rule_id", id);
      const { error } = await supabase.from("extraction_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["extraction-rules"] });
      toast.success("Regra excluída");
      setDeleteTarget(null);
    },
    onError: (err: any) => toast.error(err?.message || "Erro ao excluir"),
  });

  const openEdit = (rule: any) => {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      description: rule.description || "",
      scope: rule.scope,
      target_field: rule.target_field,
      condition_type: rule.condition_type,
      condition_value: rule.condition_value,
      action_type: rule.action_type,
      action_value: rule.action_value,
      priority: rule.priority,
      is_active: rule.is_active,
      example: rule.example || "",
      notes: rule.notes || "",
    });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const filteredRules = rules.filter((r: any) => {
    const matchSearch = !searchTerm ||
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.description || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchScope = scopeFilter === "all" || r.scope === scopeFilter;
    return matchSearch && matchScope;
  });

  const scopeLabel = (s: string) => SCOPE_OPTIONS.find((o) => o.value === s)?.label || s;
  const conditionLabel = (c: string) => CONDITION_TYPE_OPTIONS.find((o) => o.value === c)?.label || c;
  const actionLabel = (a: string) => ACTION_TYPE_OPTIONS.find((o) => o.value === a)?.label || a;

  const targetFields = TARGET_FIELD_OPTIONS[form.scope] || TARGET_FIELD_OPTIONS.item;

  const showActionValueHelper = form.target_field === "recurrence" || form.target_field === "cost_classification";
  const actionValueOptions = form.target_field === "recurrence"
    ? RECURRENCE_VALUES
    : form.target_field === "cost_classification"
    ? COST_VALUES
    : [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/propostas-software")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Regras de Extração</h1>
            <p className="text-sm text-muted-foreground">
              Configure regras de interpretação e normalização para importação de propostas de software
            </p>
          </div>
        </div>
        <Button className="gap-2" onClick={openNew}>
          <Plus className="h-4 w-4" />
          Nova Regra
        </Button>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar regras..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={scopeFilter} onValueChange={setScopeFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Escopo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Escopos</SelectItem>
            {SCOPE_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-foreground">{rules.length}</div>
            <div className="text-xs text-muted-foreground">Total de regras</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-emerald-600">{rules.filter((r: any) => r.is_active).length}</div>
            <div className="text-xs text-muted-foreground">Ativas</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-muted-foreground">{rules.filter((r: any) => !r.is_active).length}</div>
            <div className="text-xs text-muted-foreground">Inativas</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-foreground">
              {Object.values(applicationCounts).reduce((s: number, c: number) => s + c, 0)}
            </div>
            <div className="text-xs text-muted-foreground">Aplicações registradas</div>
          </CardContent>
        </Card>
      </div>

      {/* Rules Table */}
      {isLoading ? (
        <Card><CardContent className="p-6 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </CardContent></Card>
      ) : filteredRules.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Cog className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground font-medium">Nenhuma regra encontrada</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Crie regras para automatizar a interpretação de propostas importadas</p>
            <Button className="mt-4 gap-2" onClick={openNew}>
              <Plus className="h-4 w-4" /> Criar primeira regra
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Ord.</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Escopo</TableHead>
                <TableHead>Condição</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead className="text-center">Aplicações</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="w-28">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRules.map((rule: any) => (
                <TableRow key={rule.id} className={!rule.is_active ? "opacity-50" : ""}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{rule.priority}</TableCell>
                  <TableCell>
                    <div className="font-medium text-foreground">{rule.name}</div>
                    {rule.description && (
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{rule.description}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{scopeLabel(rule.scope)}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs">
                      <span className="text-muted-foreground">{conditionLabel(rule.condition_type)}:</span>{" "}
                      <code className="bg-muted px-1 rounded text-foreground">{rule.condition_value}</code>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs">
                      <span className="text-muted-foreground">{actionLabel(rule.action_type)}:</span>{" "}
                      <code className="bg-muted px-1 rounded text-foreground">{rule.action_value}</code>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="text-xs">
                      {(applicationCounts as any)[rule.id] || 0}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleMutation.mutate({ id: rule.id, is_active: !rule.is_active })}
                        >
                          {rule.is_active ? (
                            <ToggleRight className="h-5 w-5 text-emerald-600" />
                          ) : (
                            <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{rule.is_active ? "Desativar" : "Ativar"}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(rule)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(rule.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) { setDialogOpen(false); setEditingId(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Regra" : "Nova Regra de Extração"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* Identification */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Identificação</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Nome da Regra *</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Ex: Excedente → usage_based"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Prioridade</Label>
                    <Input
                      type="number"
                      value={form.priority}
                      onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 100 })}
                      min={1}
                    />
                    <p className="text-xs text-muted-foreground">Menor = maior prioridade</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Descrição em Linguagem Natural</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Ex: Ao encontrar descrição de item contendo algo que remeta a EXCEDENTE, aplique na coluna Recorrência a opção usage_based"
                    rows={2}
                  />
                  <p className="text-xs text-muted-foreground">
                    Descreva a regra de forma legível. O sistema utiliza os campos estruturados abaixo para executar.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Condition */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Condição (Quando aplicar)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Escopo *</Label>
                    <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v, target_field: (TARGET_FIELD_OPTIONS[v] || [])[0]?.value || "" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SCOPE_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tipo de Condição *</Label>
                    <Select value={form.condition_type} onValueChange={(v) => setForm({ ...form, condition_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CONDITION_TYPE_OPTIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Valor / Padrão da Condição *</Label>
                  <Input
                    value={form.condition_value}
                    onChange={(e) => setForm({ ...form, condition_value: e.target.value })}
                    placeholder="Ex: EXCEDENTE"
                  />
                  <p className="text-xs text-muted-foreground">
                    {form.condition_type === "regex" ? "Use uma expressão regular válida" : "Texto a ser procurado (case-insensitive)"}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Action */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Ação (O que fazer)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Campo Alvo *</Label>
                    <Select value={form.target_field} onValueChange={(v) => setForm({ ...form, target_field: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {targetFields.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tipo de Ação *</Label>
                    <Select value={form.action_type} onValueChange={(v) => setForm({ ...form, action_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ACTION_TYPE_OPTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Valor da Ação *</Label>
                  {showActionValueHelper && form.action_type === "set_value" ? (
                    <Select value={form.action_value} onValueChange={(v) => setForm({ ...form, action_value: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {actionValueOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={form.action_value}
                      onChange={(e) => setForm({ ...form, action_value: e.target.value })}
                      placeholder="Ex: usage_based"
                    />
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Additional */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Informações Adicionais</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Exemplo</Label>
                  <Textarea
                    value={form.example}
                    onChange={(e) => setForm({ ...form, example: e.target.value })}
                    placeholder='Ex: "Licença TOTVS Protheus - Excedente" → recurrence = usage_based'
                    rows={2}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Notas internas</Label>
                  <Textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Anotações, contexto ou justificativa"
                    rows={2}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                  />
                  <Label>Regra ativa</Label>
                </div>
              </CardContent>
            </Card>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => saveMutation.mutate({ ...form, id: editingId || undefined })}
              disabled={!form.name || !form.condition_value || !form.action_value || saveMutation.isPending}
              className="gap-2"
            >
              {saveMutation.isPending ? <Sparkles className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editingId ? "Salvar" : "Criar Regra"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir regra?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. O histórico de aplicações desta regra também será removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
