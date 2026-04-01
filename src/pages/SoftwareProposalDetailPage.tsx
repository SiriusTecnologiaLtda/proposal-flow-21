import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  ArrowLeft, Save, CheckCircle2, Plus, Trash2, AlertTriangle,
  FileText, Download, Loader2, Eye, EyeOff, Pencil, RotateCcw, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchableClientSelect } from "@/components/software-proposal/SearchableClientSelect";
import { SearchableUnitSelect } from "@/components/software-proposal/SearchableUnitSelect";
import { SearchableCatalogSelect } from "@/components/software-proposal/SearchableCatalogSelect";
import { SearchableSalesTeamSelect } from "@/components/software-proposal/SearchableSalesTeamSelect";
import { SearchableSegmentSelect } from "@/components/software-proposal/SearchableSegmentSelect";

const STATUS_LABELS: Record<string, string> = {
  pending_extraction: "Aguardando Extração",
  extracting: "Extraindo",
  extracted: "Extraído",
  in_review: "Em Revisão",
  validated: "Validado",
  error: "Erro",
};

const STATUS_BADGE_VARIANT: Record<string, string> = {
  pending_extraction: "bg-muted text-muted-foreground",
  extracting: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  extracted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  in_review: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  validated: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  error: "bg-destructive/10 text-destructive",
};

const ORIGIN_OPTIONS = [
  { value: "client", label: "Cliente" },
  { value: "vendor", label: "Fornecedor" },
  { value: "partner", label: "Parceiro" },
  { value: "internal", label: "Interno" },
  { value: "historical", label: "Histórico" },
  { value: "email_inbox", label: "E-mail" },
  { value: "other", label: "Outro" },
];

const ISSUE_TYPE_LABELS: Record<string, string> = {
  low_confidence: "Baixa Confiança",
  missing_required: "Campo Obrigatório",
  ambiguous_value: "Valor Ambíguo",
  format_error: "Erro de Formato",
};

const RECURRENCE_OPTIONS = [
  { value: "one_time", label: "Único" },
  { value: "monthly", label: "Mensal" },
  { value: "annual", label: "Anual" },
];

const COST_OPTIONS = [
  { value: "opex", label: "Opex" },
  { value: "capex", label: "Capex" },
];

interface ProposalItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  discount_pct: number;
  discount_value: number;
  recurrence: string;
  cost_classification: string;
  item_type: string;
  notes: string | null;
  sort_order: number;
  discount_duration_months: number | null;
  confidence_score: number | null;
  catalog_item_id: string | null;
  matched_confidence: number | null;
}

interface ExtractionIssue {
  id: string;
  field_name: string;
  issue_type: string;
  extracted_value: string | null;
  corrected_value: string | null;
  status: string;
  item_id: string | null;
  created_at: string;
}

export default function SoftwareProposalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Header form state
  const [headerForm, setHeaderForm] = useState<Record<string, any>>({});
  const [headerDirty, setHeaderDirty] = useState(false);
  const [savingHeader, setSavingHeader] = useState(false);

  // Items state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState<Record<string, any>>({});
  const [addingItem, setAddingItem] = useState(false);
  const [newItemForm, setNewItemForm] = useState({
    description: "", quantity: 1, unit_price: 0, total_price: 0,
    discount_pct: 0, discount_value: 0, recurrence: "monthly",
    cost_classification: "opex", item_type: "software", notes: "",
  });
  const [deleteItemTarget, setDeleteItemTarget] = useState<string | null>(null);

  // Validate dialog
  const [showValidateDialog, setShowValidateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Fetch proposal
  const { data: proposal, isLoading } = useQuery({
    queryKey: ["software-proposal", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("software_proposals")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch items
  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["software-proposal-items", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("software_proposal_items")
        .select("*")
        .eq("software_proposal_id", id!)
        .order("sort_order");
      if (error) throw error;
      return data as ProposalItem[];
    },
  });

  // Fetch issues
  const { data: issues = [] } = useQuery({
    queryKey: ["extraction-issues", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("extraction_issues")
        .select("*")
        .eq("software_proposal_id", id!)
        .order("created_at");
      if (error) throw error;
      return data as ExtractionIssue[];
    },
  });

  // Fetch client name for display
  const { data: linkedClient } = useQuery({
    queryKey: ["client-name", proposal?.client_id],
    enabled: !!proposal?.client_id,
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name").eq("id", proposal!.client_id!).single();
      return data;
    },
  });

  // Fetch unit name for display
  const { data: linkedUnit } = useQuery({
    queryKey: ["unit-name", proposal?.unit_id],
    enabled: !!proposal?.unit_id,
    queryFn: async () => {
      const { data } = await supabase.from("unit_info").select("id, name").eq("id", proposal!.unit_id!).single();
      return data;
    },
  });

  // Fetch catalog item names for items display
  const catalogItemIds = items.filter(i => i.catalog_item_id).map(i => i.catalog_item_id!);
  const { data: catalogNames = [] } = useQuery({
    queryKey: ["catalog-names", catalogItemIds.join(",")],
    enabled: catalogItemIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("software_catalog_items").select("id, name").in("id", catalogItemIds);
      return data || [];
    },
  });
  const catalogNameMap = new Map(catalogNames.map(c => [c.id, c.name]));

  // Init header form when proposal loads
  useEffect(() => {
    if (proposal && !headerDirty) {
      setHeaderForm({
        proposal_number: (proposal as any).proposal_number || "",
        vendor_name: proposal.vendor_name || "",
        client_name: proposal.client_name || "",
        client_id: (proposal as any).client_id || null,
        unit_id: (proposal as any).unit_id || null,
        origin: proposal.origin,
        total_value: proposal.total_value || 0,
        currency: proposal.currency || "BRL",
        proposal_date: proposal.proposal_date || "",
        validity_date: proposal.validity_date || "",
        payment_type: proposal.payment_type || "",
        installment_count: proposal.installment_count || "",
        first_due_date: proposal.first_due_date || "",
        discount_amount: proposal.discount_amount || 0,
        discount_notes: proposal.discount_notes || "",
        discount_duration_months: proposal.discount_duration_months || "",
        notes: proposal.notes || "",
      });
    }
  }, [proposal]);

  const updateHeaderField = (field: string, value: any) => {
    setHeaderForm((prev) => ({ ...prev, [field]: value }));
    setHeaderDirty(true);
  };

  // Save header
  const saveHeader = async () => {
    if (!id || !user) return;
    setSavingHeader(true);
    try {
      const oldProposal = proposal;
      const updates: Record<string, any> = {
        vendor_name: headerForm.vendor_name?.trim() || null,
        client_name: headerForm.client_name?.trim() || null,
        client_id: headerForm.client_id || null,
        unit_id: headerForm.unit_id || null,
        origin: headerForm.origin,
        total_value: Number(headerForm.total_value) || 0,
        currency: headerForm.currency,
        proposal_date: headerForm.proposal_date || null,
        validity_date: headerForm.validity_date || null,
        payment_type: headerForm.payment_type?.trim() || null,
        installment_count: headerForm.installment_count ? Number(headerForm.installment_count) : null,
        first_due_date: headerForm.first_due_date || null,
        discount_amount: Number(headerForm.discount_amount) || 0,
        discount_notes: headerForm.discount_notes?.trim() || null,
        discount_duration_months: headerForm.discount_duration_months ? Number(headerForm.discount_duration_months) : null,
        notes: headerForm.notes?.trim() || null,
        proposal_number: headerForm.proposal_number?.trim() || null,
      };

      const { error } = await supabase
        .from("software_proposals")
        .update(updates)
        .eq("id", id);
      if (error) throw error;

      // Log corrections for changed fields
      const corrections: any[] = [];
      for (const [key, newVal] of Object.entries(updates)) {
        const oldVal = (oldProposal as any)?.[key];
        const oldStr = oldVal == null ? "" : String(oldVal);
        const newStr = newVal == null ? "" : String(newVal);
        if (oldStr !== newStr) {
          corrections.push({
            software_proposal_id: id,
            field_path: key,
            original_value: oldStr || null,
            corrected_value: newStr || null,
            corrected_by: user.id,
          });
        }
      }
      if (corrections.length > 0) {
        await supabase.from("extraction_corrections_log").insert(corrections);
      }

      queryClient.invalidateQueries({ queryKey: ["software-proposal", id] });
      queryClient.invalidateQueries({ queryKey: ["software-proposals"] });
      setHeaderDirty(false);
      toast.success("Dados da proposta atualizados");
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSavingHeader(false);
    }
  };

  // Save item inline edit
  const saveItemEdit = async () => {
    if (!editingItemId || !user) return;
    try {
      const oldItem = items.find((i) => i.id === editingItemId);
      const updates = {
        description: itemForm.description?.trim(),
        quantity: Number(itemForm.quantity) || 0,
        unit_price: Number(itemForm.unit_price) || 0,
        total_price: Number(itemForm.total_price) || 0,
        discount_pct: Number(itemForm.discount_pct) || 0,
        discount_value: Number(itemForm.discount_value) || 0,
        recurrence: itemForm.recurrence,
        cost_classification: itemForm.cost_classification,
        notes: itemForm.notes?.trim() || null,
      };

      const { error } = await supabase
        .from("software_proposal_items")
        .update(updates)
        .eq("id", editingItemId);
      if (error) throw error;

      // Log corrections
      const corrections: any[] = [];
      for (const [key, newVal] of Object.entries(updates)) {
        const oldVal = (oldItem as any)?.[key];
        if (String(oldVal ?? "") !== String(newVal ?? "")) {
          corrections.push({
            software_proposal_id: id,
            item_id: editingItemId,
            field_path: key,
            original_value: oldVal == null ? null : String(oldVal),
            corrected_value: newVal == null ? null : String(newVal),
            corrected_by: user.id,
          });
        }
      }
      if (corrections.length > 0) {
        await supabase.from("extraction_corrections_log").insert(corrections);
      }

      queryClient.invalidateQueries({ queryKey: ["software-proposal-items", id] });
      setEditingItemId(null);
      toast.success("Item atualizado");
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar item");
    }
  };

  // Add new item
  const addItem = async () => {
    if (!id || !user) return;
    try {
      const maxOrder = items.length > 0 ? Math.max(...items.map((i) => i.sort_order)) : 0;
      const { error } = await supabase.from("software_proposal_items").insert({
        software_proposal_id: id,
        description: newItemForm.description.trim(),
        quantity: Number(newItemForm.quantity) || 1,
        unit_price: Number(newItemForm.unit_price) || 0,
        total_price: Number(newItemForm.total_price) || 0,
        discount_pct: Number(newItemForm.discount_pct) || 0,
        discount_value: Number(newItemForm.discount_value) || 0,
        recurrence: newItemForm.recurrence,
        cost_classification: newItemForm.cost_classification,
        item_type: newItemForm.item_type,
        notes: newItemForm.notes?.trim() || null,
        sort_order: maxOrder + 1,
      });
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["software-proposal-items", id] });
      setAddingItem(false);
      setNewItemForm({
        description: "", quantity: 1, unit_price: 0, total_price: 0,
        discount_pct: 0, discount_value: 0, recurrence: "monthly",
        cost_classification: "opex", item_type: "software", notes: "",
      });
      toast.success("Item adicionado");
    } catch (err: any) {
      toast.error(err.message || "Erro ao adicionar item");
    }
  };

  // Delete item
  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from("software_proposal_items")
        .delete()
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["software-proposal-items", id] });
      setDeleteItemTarget(null);
      toast.success("Item removido");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Resolve/ignore issue
  const updateIssueMutation = useMutation({
    mutationFn: async ({ issueId, status }: { issueId: string; status: string }) => {
      const { error } = await supabase
        .from("extraction_issues")
        .update({
          status,
          resolved_at: status !== "open" ? new Date().toISOString() : null,
          resolved_by: status !== "open" ? user?.id : null,
        })
        .eq("id", issueId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["extraction-issues", id] });
      toast.success("Pendência atualizada");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Validate proposal
  const validateProposal = async () => {
    if (!id || !user) return;
    try {
      const { error } = await supabase
        .from("software_proposals")
        .update({
          status: "validated",
          validated_at: new Date().toISOString(),
          validated_by: user.id,
        })
        .eq("id", id);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["software-proposal", id] });
      queryClient.invalidateQueries({ queryKey: ["software-proposals"] });
      setShowValidateDialog(false);
      toast.success("Proposta validada com sucesso!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao validar");
    }
  };

  // Delete proposal
  const deleteProposalMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("ID não encontrado");
      // Delete related data first
      await supabase.from("software_proposal_items").delete().eq("software_proposal_id", id);
      await supabase.from("extraction_issues").delete().eq("software_proposal_id", id);
      await supabase.from("extraction_corrections_log").delete().eq("software_proposal_id", id);
      // Delete storage file if exists
      if (proposal?.file_url) {
        await supabase.storage.from("software-proposal-pdfs").remove([proposal.file_url]);
      }
      const { error } = await supabase.from("software_proposals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["software-proposals"] });
      toast.success("Proposta excluída com sucesso");
      navigate("/propostas-software");
    },
    onError: (err: any) => toast.error(err.message || "Erro ao excluir proposta"),
  });

  // Reprocess (re-extract)
  const reprocessMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("ID não encontrado");
      const { data, error } = await supabase.functions.invoke("extract-software-proposal", {
        body: { software_proposal_id: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["software-proposal", id] });
      queryClient.invalidateQueries({ queryKey: ["software-proposal-items", id] });
      queryClient.invalidateQueries({ queryKey: ["extraction-issues", id] });
      queryClient.invalidateQueries({ queryKey: ["software-proposals"] });
      toast.success(
        `Re-extração concluída — ${data.items_extracted} itens, ${data.issues_created} pendências`,
        { duration: 5000 }
      );
    },
    onError: (err: any) => toast.error(err.message || "Erro na re-extração"),
  });

  // Download file
  const downloadFile = async () => {
    if (!proposal?.file_url) return;
    try {
      const { data, error } = await supabase.storage
        .from("software-proposal-pdfs")
        .createSignedUrl(proposal.file_url, 300);
      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    } catch (err: any) {
      toast.error("Erro ao gerar link de download");
    }
  };

  const openIssues = issues.filter((i) => i.status === "open");
  const canValidate = proposal && ["extracted", "in_review"].includes(proposal.status) && openIssues.length === 0;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-medium">Proposta não encontrada</h3>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/propostas-software")}>
          Voltar para a lista
        </Button>
      </div>
    );
  }

  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/propostas-software")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">
                {(proposal as any).proposal_number
                  ? `Proposta ${(proposal as any).proposal_number}`
                  : "Detalhe da Proposta"}
              </h1>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE_VARIANT[proposal.status] || "bg-muted text-muted-foreground"}`}>
                {STATUS_LABELS[proposal.status] || proposal.status}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{proposal.file_name}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {proposal.file_url && (
            <Button variant="outline" size="sm" className="gap-2" onClick={downloadFile}>
              <Download className="h-4 w-4" />
              Baixar PDF
            </Button>
          )}
          {proposal.file_url && proposal.status !== "extracting" && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => reprocessMutation.mutate()}
              disabled={reprocessMutation.isPending}
            >
              {reprocessMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              {reprocessMutation.isPending ? "Reprocessando…" : "Reprocessar"}
            </Button>
          )}
          {canValidate && (
            <Button size="sm" className="gap-2" onClick={() => setShowValidateDialog(true)}>
              <CheckCircle2 className="h-4 w-4" />
              Validar Proposta
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-destructive hover:text-destructive"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="h-4 w-4" />
            Excluir
          </Button>
        </div>
      </div>

      <Tabs defaultValue="dados" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dados">Dados da Proposta</TabsTrigger>
          <TabsTrigger value="itens">
            Itens ({items.length})
          </TabsTrigger>
          <TabsTrigger value="pendencias">
            Pendências
            {openIssues.length > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 min-w-5 text-xs">
                {openIssues.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* TAB: Header data */}
        <TabsContent value="dados" className="space-y-4">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium">Informações Comerciais</CardTitle>
                {headerDirty && (
                  <Button size="sm" className="gap-2" onClick={saveHeader} disabled={savingHeader}>
                    {savingHeader ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar Alterações
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Nº da Proposta</Label>
                  <Input
                    value={headerForm.proposal_number || ""}
                    onChange={(e) => updateHeaderField("proposal_number", e.target.value)}
                    placeholder="Ex: AAPDFQ"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fornecedor</Label>
                  <Input
                    value={headerForm.vendor_name || ""}
                    onChange={(e) => updateHeaderField("vendor_name", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cliente (texto extraído)</Label>
                  <Input
                    value={headerForm.client_name || ""}
                    onChange={(e) => updateHeaderField("client_name", e.target.value)}
                    placeholder="Nome extraído do PDF"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cliente Vinculado</Label>
                  <SearchableClientSelect
                    value={headerForm.client_id}
                    displayValue={linkedClient?.name}
                    onChange={(clientId, clientName) => {
                      updateHeaderField("client_id", clientId);
                      if (clientName && !headerForm.client_name) {
                        updateHeaderField("client_name", clientName);
                      }
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Unidade TOTVS</Label>
                  <SearchableUnitSelect
                    value={headerForm.unit_id}
                    displayValue={linkedUnit?.name}
                    onChange={(unitId) => {
                      updateHeaderField("unit_id", unitId);
                    }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Origem</Label>
                  <Select value={headerForm.origin || "other"} onValueChange={(v) => updateHeaderField("origin", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ORIGIN_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Data da Proposta</Label>
                  <Input
                    type="date"
                    value={headerForm.proposal_date || ""}
                    onChange={(e) => updateHeaderField("proposal_date", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Validade</Label>
                  <Input
                    type="date"
                    value={headerForm.validity_date || ""}
                    onChange={(e) => updateHeaderField("validity_date", e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Valor Total (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={headerForm.total_value ?? 0}
                    onChange={(e) => updateHeaderField("total_value", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Pagamento</Label>
                  <Input
                    value={headerForm.payment_type || ""}
                    onChange={(e) => updateHeaderField("payment_type", e.target.value)}
                    placeholder="Ex: Boleto"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nº Parcelas</Label>
                  <Input
                    type="number"
                    value={headerForm.installment_count || ""}
                    onChange={(e) => updateHeaderField("installment_count", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>1º Vencimento</Label>
                  <Input
                    type="date"
                    value={headerForm.first_due_date || ""}
                    onChange={(e) => updateHeaderField("first_due_date", e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Desconto (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={headerForm.discount_amount ?? 0}
                    onChange={(e) => updateHeaderField("discount_amount", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Duração Desconto (meses)</Label>
                  <Input
                    type="number"
                    value={headerForm.discount_duration_months || ""}
                    onChange={(e) => updateHeaderField("discount_duration_months", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Observações Desconto</Label>
                  <Input
                    value={headerForm.discount_notes || ""}
                    onChange={(e) => updateHeaderField("discount_notes", e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Observações Gerais</Label>
                <Textarea
                  value={headerForm.notes || ""}
                  onChange={(e) => updateHeaderField("notes", e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Items */}
        <TabsContent value="itens" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium">Itens da Proposta</CardTitle>
                <Button size="sm" variant="outline" className="gap-2" onClick={() => setAddingItem(true)}>
                  <Plus className="h-4 w-4" />
                  Adicionar Item
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {itemsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : items.length === 0 && !addingItem ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhum item encontrado</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[200px]">Descrição</TableHead>
                        <TableHead className="w-[120px]">Catálogo</TableHead>
                        <TableHead className="w-[70px]">Qtd</TableHead>
                        <TableHead className="w-[110px]">Vlr Unit.</TableHead>
                        <TableHead className="w-[110px]">Vlr Total</TableHead>
                        <TableHead className="w-[80px]">Desc %</TableHead>
                        <TableHead className="w-[100px]">Recorrência</TableHead>
                        <TableHead className="w-[80px]">Class.</TableHead>
                        <TableHead className="w-[90px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) =>
                        editingItemId === item.id ? (
                          <TableRow key={item.id} className="bg-primary/5">
                            <TableCell>
                              <Input
                                value={itemForm.description || ""}
                                onChange={(e) => setItemForm((p: any) => ({ ...p, description: e.target.value }))}
                                className="text-sm"
                              />
                            </TableCell>
                            <TableCell>
                              <SearchableCatalogSelect
                                value={itemForm.catalog_item_id || null}
                                displayValue={itemForm.catalog_item_id ? catalogNameMap.get(itemForm.catalog_item_id) : undefined}
                                onChange={(catalogItemId) => setItemForm((p: any) => ({ ...p, catalog_item_id: catalogItemId }))}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number" className="text-sm w-16"
                                value={itemForm.quantity ?? 0}
                                onChange={(e) => setItemForm((p: any) => ({ ...p, quantity: e.target.value }))}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number" step="0.01" className="text-sm w-24"
                                value={itemForm.unit_price ?? 0}
                                onChange={(e) => setItemForm((p: any) => ({ ...p, unit_price: e.target.value }))}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number" step="0.01" className="text-sm w-24"
                                value={itemForm.total_price ?? 0}
                                onChange={(e) => setItemForm((p: any) => ({ ...p, total_price: e.target.value }))}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number" step="0.01" className="text-sm w-16"
                                value={itemForm.discount_pct ?? 0}
                                onChange={(e) => setItemForm((p: any) => ({ ...p, discount_pct: e.target.value }))}
                              />
                            </TableCell>
                            <TableCell>
                              <Select value={itemForm.recurrence} onValueChange={(v) => setItemForm((p: any) => ({ ...p, recurrence: v }))}>
                                <SelectTrigger className="text-sm h-9"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {RECURRENCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Select value={itemForm.cost_classification} onValueChange={(v) => setItemForm((p: any) => ({ ...p, cost_classification: v }))}>
                                <SelectTrigger className="text-sm h-9 w-20"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {COST_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveItemEdit}>
                                  <Save className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingItemId(null)}>
                                  <EyeOff className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          <TableRow key={item.id}>
                            <TableCell className="text-sm font-medium">{item.description}</TableCell>
                            <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">
                              {item.catalog_item_id ? (catalogNameMap.get(item.catalog_item_id) || "Vinculado") : "—"}
                            </TableCell>
                            <TableCell className="text-sm text-center">{item.quantity}</TableCell>
                            <TableCell className="text-sm font-mono">{formatCurrency(item.unit_price)}</TableCell>
                            <TableCell className="text-sm font-mono">{formatCurrency(item.total_price)}</TableCell>
                            <TableCell className="text-sm text-center">{item.discount_pct > 0 ? `${item.discount_pct}%` : "—"}</TableCell>
                            <TableCell className="text-xs">
                              {RECURRENCE_OPTIONS.find((r) => r.value === item.recurrence)?.label || item.recurrence}
                            </TableCell>
                            <TableCell className="text-xs uppercase">{item.cost_classification}</TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                                  setEditingItemId(item.id);
                                  setItemForm({ ...item });
                                }}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteItemTarget(item.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      )}

                      {/* Add new item inline */}
                      {addingItem && (
                        <TableRow className="bg-primary/5">
                          <TableCell>
                            <Input
                              placeholder="Descrição do item"
                              value={newItemForm.description}
                              onChange={(e) => setNewItemForm((p) => ({ ...p, description: e.target.value }))}
                              className="text-sm"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number" className="text-sm w-16"
                              value={newItemForm.quantity}
                              onChange={(e) => setNewItemForm((p) => ({ ...p, quantity: Number(e.target.value) }))}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number" step="0.01" className="text-sm w-24"
                              value={newItemForm.unit_price}
                              onChange={(e) => setNewItemForm((p) => ({ ...p, unit_price: Number(e.target.value) }))}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number" step="0.01" className="text-sm w-24"
                              value={newItemForm.total_price}
                              onChange={(e) => setNewItemForm((p) => ({ ...p, total_price: Number(e.target.value) }))}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number" step="0.01" className="text-sm w-16"
                              value={newItemForm.discount_pct}
                              onChange={(e) => setNewItemForm((p) => ({ ...p, discount_pct: Number(e.target.value) }))}
                            />
                          </TableCell>
                          <TableCell>
                            <Select value={newItemForm.recurrence} onValueChange={(v) => setNewItemForm((p) => ({ ...p, recurrence: v }))}>
                              <SelectTrigger className="text-sm h-9"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {RECURRENCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select value={newItemForm.cost_classification} onValueChange={(v) => setNewItemForm((p) => ({ ...p, cost_classification: v }))}>
                              <SelectTrigger className="text-sm h-9 w-20"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {COST_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={addItem} disabled={!newItemForm.description.trim()}>
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAddingItem(false)}>
                                <EyeOff className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Items total */}
              {items.length > 0 && (
                <div className="flex justify-end pt-4 border-t mt-4">
                  <div className="text-sm text-muted-foreground">
                    Total dos Itens:{" "}
                    <span className="font-semibold text-foreground font-mono">
                      {formatCurrency(items.reduce((sum, i) => sum + (i.total_price || 0), 0))}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Issues */}
        <TabsContent value="pendencias" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Pendências da Extração
                {openIssues.length > 0 && (
                  <Badge variant="destructive" className="text-xs">{openIssues.length} abertas</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {issues.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500/40 mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhuma pendência registrada</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campo</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Valor Extraído</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[120px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {issues.map((issue) => (
                        <TableRow key={issue.id}>
                          <TableCell className="text-sm font-medium">{issue.field_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {ISSUE_TYPE_LABELS[issue.issue_type] || issue.issue_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                            {issue.extracted_value || "—"}
                          </TableCell>
                          <TableCell>
                            {issue.status === "open" ? (
                              <Badge variant="destructive" className="text-xs">Aberta</Badge>
                            ) : issue.status === "resolved" ? (
                              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs">Resolvida</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">Ignorada</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {issue.status === "open" && (
                              <div className="flex gap-1">
                                <Button
                                  size="sm" variant="outline" className="h-7 text-xs"
                                  onClick={() => updateIssueMutation.mutate({ issueId: issue.id, status: "resolved" })}
                                >
                                  Resolver
                                </Button>
                                <Button
                                  size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground"
                                  onClick={() => updateIssueMutation.mutate({ issueId: issue.id, status: "ignored" })}
                                >
                                  Ignorar
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete item dialog */}
      <AlertDialog open={!!deleteItemTarget} onOpenChange={(o) => !o && setDeleteItemTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Item</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este item? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteItemTarget && deleteItemMutation.mutate(deleteItemTarget)}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Validate dialog */}
      <AlertDialog open={showValidateDialog} onOpenChange={setShowValidateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Validar Proposta</AlertDialogTitle>
            <AlertDialogDescription>
              Confirma a validação desta proposta? O status será alterado para "Validado".
              {openIssues.length > 0 && " Ainda existem pendências abertas."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={validateProposal}>Confirmar Validação</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete proposal dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Proposta</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta proposta? Todos os itens, pendências e correções associados serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteProposalMutation.mutate()}
              disabled={deleteProposalMutation.isPending}
            >
              {deleteProposalMutation.isPending ? "Excluindo…" : "Excluir Proposta"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
