import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
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

import { RECURRENCE_OPTIONS, COST_CLASSIFICATION_OPTIONS, getRecurrenceLabel, getCostClassificationLabel } from "@/lib/softwareConstants";


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
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Resolve-issue flow from issues queue
  const resolveIssueId = searchParams.get("resolve_issue");
  const resolveField = searchParams.get("field");

  // Header form state
  const [headerForm, setHeaderForm] = useState<Record<string, any>>({});
  const [headerDirty, setHeaderDirty] = useState(false);
  const [savingHeader, setSavingHeader] = useState(false);

  // Active tab state (controlled for programmatic switching)
  const [activeTab, setActiveTab] = useState("dados");

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

  // Highlight field ref
  const [highlightField, setHighlightField] = useState<string | null>(null);

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

  // Fetch sales team names for display
  const { data: linkedGsn } = useQuery({
    queryKey: ["sales-team-name", (proposal as any)?.gsn_id],
    enabled: !!(proposal as any)?.gsn_id,
    queryFn: async () => {
      const { data } = await supabase.from("sales_team").select("id, name, code").eq("id", (proposal as any).gsn_id).single();
      return data;
    },
  });
  const { data: linkedEsn } = useQuery({
    queryKey: ["sales-team-name", (proposal as any)?.esn_id],
    enabled: !!(proposal as any)?.esn_id,
    queryFn: async () => {
      const { data } = await supabase.from("sales_team").select("id, name, code").eq("id", (proposal as any).esn_id).single();
      return data;
    },
  });
  const { data: linkedArquiteto } = useQuery({
    queryKey: ["sales-team-name", (proposal as any)?.arquiteto_id],
    enabled: !!(proposal as any)?.arquiteto_id,
    queryFn: async () => {
      const { data } = await supabase.from("sales_team").select("id, name, code").eq("id", (proposal as any).arquiteto_id).single();
      return data;
    },
  });
  const { data: linkedSegment } = useQuery({
    queryKey: ["segment-name", (proposal as any)?.segment_id],
    enabled: !!(proposal as any)?.segment_id,
    queryFn: async () => {
      const { data } = await supabase.from("software_segments").select("id, name").eq("id", (proposal as any).segment_id).single();
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

  // Fetch rule applications for this proposal
  const { data: ruleApplications = [] } = useQuery({
    queryKey: ["rule-applications", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("extraction_rule_applications")
        .select("*, extraction_rules(name, description, scope)")
        .eq("software_proposal_id", id!);
      if (error) throw error;
      return data || [];
    },
  });

  // Init header form when proposal loads
  useEffect(() => {
    if (proposal && !headerDirty) {
      setHeaderForm({
        proposal_number: (proposal as any).proposal_number || "",
        vendor_name: proposal.vendor_name || "",
        client_name: proposal.client_name || "",
        client_id: (proposal as any).client_id || null,
        unit_id: (proposal as any).unit_id || null,
        gsn_id: (proposal as any).gsn_id || null,
        esn_id: (proposal as any).esn_id || null,
        arquiteto_id: (proposal as any).arquiteto_id || null,
        segment_id: (proposal as any).segment_id || null,
        origin: proposal.origin,
        currency: proposal.currency || "BRL",
        proposal_date: proposal.proposal_date || "",
        validity_date: proposal.validity_date || "",
        notes: proposal.notes || "",
      });
    }
  }, [proposal]);

  // Field name to tab/element mapping for resolve flow
  const FIELD_TAB_MAP: Record<string, string> = {
    client_id: "dados", client_name: "dados", unit_id: "dados",
    gsn_id: "dados", esn_id: "dados", arquiteto_id: "dados",
    segment_id: "dados", vendor_name: "dados", proposal_number: "dados",
    proposal_date: "dados", validity_date: "dados", origin: "dados",
    notes: "dados",
  };

  // Helper: detect if a field_name belongs to item-level issues
  const getTabForField = (fieldName: string): string => {
    if (fieldName.startsWith("item_")) return "itens";
    return FIELD_TAB_MAP[fieldName] || "dados";
  };

  // Handle resolve_issue query param — switch tab and highlight field
  useEffect(() => {
    if (!resolveIssueId || !resolveField || !proposal) return;

    const targetTab = getTabForField(resolveField);
    setActiveTab(targetTab);
    setHighlightField(resolveField);

    // Small delay to let tab switch render, then scroll to field
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-field="${resolveField}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Try to focus the input inside
        const input = el.querySelector("input, textarea, button[role='combobox']") as HTMLElement;
        if (input) input.focus();
      }
    }, 300);

    // Remove highlight after 5 seconds
    const clearTimer = setTimeout(() => setHighlightField(null), 5000);

    return () => {
      clearTimeout(timer);
      clearTimeout(clearTimer);
    };
  }, [resolveIssueId, resolveField, proposal]);

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
        gsn_id: headerForm.gsn_id || null,
        esn_id: headerForm.esn_id || null,
        arquiteto_id: headerForm.arquiteto_id || null,
        segment_id: headerForm.segment_id || null,
        origin: headerForm.origin,
        currency: headerForm.currency,
        proposal_date: headerForm.proposal_date || null,
        validity_date: headerForm.validity_date || null,
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

      // Auto-resolve the linked issue if we came from the resolve flow
      if (resolveIssueId) {
        await supabase
          .from("extraction_issues")
          .update({
            status: "resolved",
            resolved_at: new Date().toISOString(),
            resolved_by: user.id,
            corrected_value: corrections.length > 0
              ? corrections.map(c => `${c.field_path}: ${c.corrected_value}`).join("; ")
              : null,
          })
          .eq("id", resolveIssueId);

        queryClient.invalidateQueries({ queryKey: ["extraction-issues", id] });
        queryClient.invalidateQueries({ queryKey: ["software-issues-queue"] });
        queryClient.invalidateQueries({ queryKey: ["software-issues-counters"] });
        toast.success("Pendência resolvida automaticamente", { duration: 3000 });

        // Clear query params
        setSearchParams({}, { replace: true });
        setHighlightField(null);
      }
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

      // Auto-resolve open issues related to this item
      await revalidateItemIssues(editingItemId, updates);

      queryClient.invalidateQueries({ queryKey: ["software-proposal-items", id] });
      queryClient.invalidateQueries({ queryKey: ["extraction-issues", id] });
      queryClient.invalidateQueries({ queryKey: ["software-issues-queue"] });
      queryClient.invalidateQueries({ queryKey: ["software-issues-counters"] });
      setEditingItemId(null);

      // Clear resolve params if we were resolving
      if (resolveIssueId) {
        setSearchParams({}, { replace: true });
        setHighlightField(null);
      }

      toast.success("Item atualizado");
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar item");
    }
  };

  // Revalidate and auto-resolve item-level issues after edit
  const revalidateItemIssues = async (itemId: string, updates: Record<string, any>) => {
    if (!id || !user) return;

    const validRecurrences = ["one_time", "monthly", "annual", "usage_based", "measurement"];
    const validClassifications = ["opex", "capex", "other"];

    // Fetch open issues for this item
    const { data: openIssues } = await supabase
      .from("extraction_issues")
      .select("*")
      .eq("software_proposal_id", id)
      .eq("status", "open");

    if (!openIssues || openIssues.length === 0) return;

    const issueIdsToResolve: string[] = [];

    for (const issue of openIssues) {
      // Match item-level issues by item_id or by field_name containing item description
      const isForThisItem = issue.item_id === itemId ||
        (issue.field_name.startsWith("item_recurrence") && issue.field_name.includes(updates.description?.substring(0, 30))) ||
        (issue.field_name.startsWith("item_classification") && issue.field_name.includes(updates.description?.substring(0, 30)));

      if (!isForThisItem) continue;

      // Check if the issue is now resolved based on the updated values
      if (issue.field_name.startsWith("item_recurrence") && validRecurrences.includes(updates.recurrence)) {
        issueIdsToResolve.push(issue.id);
      } else if (issue.field_name.startsWith("item_classification") && validClassifications.includes(updates.cost_classification)) {
        issueIdsToResolve.push(issue.id);
      } else if (issue.issue_type === "low_confidence" || issue.issue_type === "ambiguous_value") {
        // If user manually edited the item, consider it resolved
        issueIdsToResolve.push(issue.id);
      }
    }

    if (issueIdsToResolve.length > 0) {
      await supabase
        .from("extraction_issues")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
          corrected_value: `recurrence: ${updates.recurrence}, classification: ${updates.cost_classification}`,
        })
        .in("id", issueIdsToResolve);

      // Check if all issues are now resolved — update proposal status
      const { data: remainingOpen } = await supabase
        .from("extraction_issues")
        .select("id")
        .eq("software_proposal_id", id)
        .eq("status", "open");

      if (!remainingOpen || remainingOpen.length === 0) {
        await supabase
          .from("software_proposals")
          .update({ status: "extracted" })
          .eq("id", id)
          .eq("status", "in_review");
        queryClient.invalidateQueries({ queryKey: ["software-proposal", id] });
        toast.success("Todas as pendências foram resolvidas — status atualizado para Extraído");
      }
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

  // Download file via signed URL
  const downloadFile = async () => {
    if (!proposal?.file_url) return;
    try {
      const { data, error } = await supabase.storage
        .from("software-proposal-pdfs")
        .createSignedUrl(proposal.file_url, 300);
      if (error) throw error;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast.error("Erro ao gerar link de visualização");
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
      {/* Resolve issue banner */}
      {resolveIssueId && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Resolução de Pendência</p>
            <p className="text-xs text-muted-foreground">
              Corrija o campo destacado e clique em "Salvar Alterações" — a pendência será resolvida automaticamente.
            </p>
          </div>
          <Button
            variant="ghost" size="sm"
            onClick={() => {
              setSearchParams({}, { replace: true });
              setHighlightField(null);
            }}
          >
            Cancelar
          </Button>
        </div>
      )}
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
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
          {ruleApplications.length > 0 && (
            <TabsTrigger value="regras">
              Regras Aplicadas
              <Badge variant="secondary" className="ml-2 h-5 min-w-5 text-xs">
                {ruleApplications.length}
              </Badge>
            </TabsTrigger>
          )}
        </TabsList>

        {/* TAB: Header data */}
        <TabsContent value="dados" className="space-y-4">
          {/* Save bar */}
          {headerDirty && (
            <div className="flex justify-end">
              <Button size="sm" className="gap-2" onClick={saveHeader} disabled={savingHeader}>
                {savingHeader ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar Alterações
              </Button>
            </div>
          )}

          {/* Section: Identificação da Proposta */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="border-b border-border bg-muted/50 px-4 py-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Identificação da Proposta</h3>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={`space-y-1.5 rounded-md p-2 -m-2 transition-all duration-500 ${highlightField === "proposal_number" ? "ring-2 ring-primary bg-primary/5" : ""}`} data-field="proposal_number">
                  <Label className="text-xs">Nº da Proposta</Label>
                  <Input
                    value={headerForm.proposal_number || ""}
                    onChange={(e) => updateHeaderField("proposal_number", e.target.value)}
                    placeholder="Ex: AAPDFQ"
                  />
                </div>
                <div className={`space-y-1.5 rounded-md p-2 -m-2 transition-all duration-500 ${highlightField === "vendor_name" ? "ring-2 ring-primary bg-primary/5" : ""}`} data-field="vendor_name">
                  <Label className="text-xs">Fornecedor</Label>
                  <Input
                    value={headerForm.vendor_name || ""}
                    onChange={(e) => updateHeaderField("vendor_name", e.target.value)}
                  />
                </div>
                <div className={`space-y-1.5 rounded-md p-2 -m-2 transition-all duration-500 ${highlightField === "client_name" ? "ring-2 ring-primary bg-primary/5" : ""}`} data-field="client_name">
                  <Label className="text-xs">Cliente (texto extraído)</Label>
                  <Input
                    value={headerForm.client_name || ""}
                    onChange={(e) => updateHeaderField("client_name", e.target.value)}
                    placeholder="Nome extraído do PDF"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section: Vínculos Cadastrais */}
          <div className="rounded-lg border border-border bg-card overflow-visible">
            <div className="border-b border-border bg-muted/50 px-4 py-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vínculos Cadastrais</h3>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`space-y-1.5 rounded-md p-2 -m-2 transition-all duration-500 ${highlightField === "client_id" ? "ring-2 ring-primary bg-primary/5" : ""}`} data-field="client_id">
                  <Label className="text-xs">Cliente Vinculado</Label>
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
                <div className={`space-y-1.5 rounded-md p-2 -m-2 transition-all duration-500 ${highlightField === "unit_id" ? "ring-2 ring-primary bg-primary/5" : ""}`} data-field="unit_id">
                  <Label className="text-xs">Unidade TOTVS</Label>
                  <SearchableUnitSelect
                    value={headerForm.unit_id}
                    displayValue={linkedUnit?.name}
                    onChange={(unitId) => {
                      updateHeaderField("unit_id", unitId);
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section: Time Comercial */}
          <div className="rounded-lg border border-border bg-card overflow-visible">
            <div className="border-b border-border bg-muted/50 px-4 py-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Time Comercial</h3>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className={`space-y-1.5 rounded-md p-2 -m-2 transition-all duration-500 ${highlightField === "gsn_id" ? "ring-2 ring-primary bg-primary/5" : ""}`} data-field="gsn_id">
                  <Label className="text-xs">Gerente de Vendas (GSN)</Label>
                  <SearchableSalesTeamSelect
                    value={headerForm.gsn_id}
                    displayValue={linkedGsn ? `${linkedGsn.name} (${linkedGsn.code})` : undefined}
                    onChange={(id) => updateHeaderField("gsn_id", id)}
                    placeholder="Buscar GSN..."
                    roleFilter={["gsn"]}
                  />
                  {(proposal as any)?.raw_gsn_name && (
                    <p className="text-xs text-muted-foreground">Extraído: {(proposal as any).raw_gsn_name}</p>
                  )}
                </div>
                <div className={`space-y-1.5 rounded-md p-2 -m-2 transition-all duration-500 ${highlightField === "esn_id" ? "ring-2 ring-primary bg-primary/5" : ""}`} data-field="esn_id">
                  <Label className="text-xs">Executivo de Vendas (ESN)</Label>
                  <SearchableSalesTeamSelect
                    value={headerForm.esn_id}
                    displayValue={linkedEsn ? `${linkedEsn.name} (${linkedEsn.code})` : undefined}
                    onChange={(id) => updateHeaderField("esn_id", id)}
                    placeholder="Buscar ESN..."
                    roleFilter={["esn"]}
                  />
                  {(proposal as any)?.raw_esn_name && (
                    <p className="text-xs text-muted-foreground">Extraído: {(proposal as any).raw_esn_name}</p>
                  )}
                </div>
                <div className={`space-y-1.5 rounded-md p-2 -m-2 transition-all duration-500 ${highlightField === "arquiteto_id" ? "ring-2 ring-primary bg-primary/5" : ""}`} data-field="arquiteto_id">
                  <Label className="text-xs">Arquiteto de Solução</Label>
                  <SearchableSalesTeamSelect
                    value={headerForm.arquiteto_id}
                    displayValue={linkedArquiteto ? `${linkedArquiteto.name} (${linkedArquiteto.code})` : undefined}
                    onChange={(id) => updateHeaderField("arquiteto_id", id)}
                    placeholder="Buscar Arquiteto..."
                    roleFilter={["arquiteto"]}
                  />
                  {(proposal as any)?.raw_arquiteto_name && (
                    <p className="text-xs text-muted-foreground">Extraído: {(proposal as any).raw_arquiteto_name}</p>
                  )}
                </div>
                <div className={`space-y-1.5 rounded-md p-2 -m-2 transition-all duration-500 ${highlightField === "segment_id" ? "ring-2 ring-primary bg-primary/5" : ""}`} data-field="segment_id">
                  <Label className="text-xs">Segmento</Label>
                  <SearchableSegmentSelect
                    value={headerForm.segment_id}
                    displayValue={linkedSegment?.name}
                    onChange={(id) => updateHeaderField("segment_id", id)}
                  />
                  {(proposal as any)?.raw_segment_name && (
                    <p className="text-xs text-muted-foreground">Extraído: {(proposal as any).raw_segment_name}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Section: Datas e Origem */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="border-b border-border bg-muted/50 px-4 py-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Datas & Origem</h3>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Origem</Label>
                  <Select value={headerForm.origin || "other"} onValueChange={(v) => updateHeaderField("origin", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ORIGIN_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Data da Proposta</Label>
                  <Input
                    type="date"
                    value={headerForm.proposal_date || ""}
                    onChange={(e) => updateHeaderField("proposal_date", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Validade</Label>
                  <Input
                    type="date"
                    value={headerForm.validity_date || ""}
                    onChange={(e) => updateHeaderField("validity_date", e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section: Resumo Financeiro */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="border-b border-border bg-muted/50 px-4 py-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resumo Financeiro</h3>
            </div>
            <div className="p-4 space-y-4">
              {(() => {
                const totalCapex = items
                  .filter((i) => i.cost_classification === "capex")
                  .reduce((sum, i) => sum + (i.total_price || 0), 0);
                const totalOpex = items
                  .filter((i) => i.cost_classification === "opex")
                  .reduce((sum, i) => sum + (i.total_price || 0), 0);
                const producaoTotal = Math.round(((totalCapex / 21.82) + totalOpex) * 100) / 100;
                return (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <Label className="text-muted-foreground text-xs">Total Não Recorrente (Capex)</Label>
                      <p className="text-lg font-semibold text-foreground">{formatCurrency(totalCapex)}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-muted-foreground text-xs">Total Recorrente (Opex)</Label>
                      <p className="text-lg font-semibold text-foreground">{formatCurrency(totalOpex)}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-muted-foreground text-xs">Produção Total</Label>
                      <p className="text-lg font-semibold text-foreground">{formatCurrency(producaoTotal)}</p>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Section: Observações */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="border-b border-border bg-muted/50 px-4 py-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Observações</h3>
            </div>
            <div className="p-4">
              <Textarea
                value={headerForm.notes || ""}
                onChange={(e) => updateHeaderField("notes", e.target.value)}
                rows={3}
                placeholder="Observações gerais sobre a proposta..."
              />
            </div>
          </div>
        </TabsContent>

        {/* TAB: Items */}
        <TabsContent value="itens" className="space-y-4">
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Itens da Proposta</h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{items.length}</span>
              </div>
              <Button size="sm" variant="outline" className="gap-2 h-7 text-xs" onClick={() => setAddingItem(true)}>
                <Plus className="h-3 w-3" />
                Adicionar Item
              </Button>
            </div>

            {/* Grid header */}
            <div className="hidden border-b border-border px-4 py-2 md:grid md:grid-cols-[2fr_1.2fr_60px_100px_100px_60px_90px_70px_80px] md:gap-2 md:items-center">
              <span className="text-xs font-medium text-muted-foreground">Descrição</span>
              <span className="text-xs font-medium text-muted-foreground">Catálogo</span>
              <span className="text-xs font-medium text-muted-foreground text-center">Qtd</span>
              <span className="text-xs font-medium text-muted-foreground text-right">Vlr Unit.</span>
              <span className="text-xs font-medium text-muted-foreground text-right">Vlr Total</span>
              <span className="text-xs font-medium text-muted-foreground text-center">Desc%</span>
              <span className="text-xs font-medium text-muted-foreground">Recorrência</span>
              <span className="text-xs font-medium text-muted-foreground">Class.</span>
              <span className="text-xs font-medium text-muted-foreground text-right">Ações</span>
            </div>

            <div className="divide-y divide-border">
              {itemsLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="px-4 py-3"><Skeleton className="h-8 w-full" /></div>
                ))
              ) : items.length === 0 && !addingItem ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-1">Nenhum item encontrado</h3>
                  <p className="text-sm text-muted-foreground">Adicione itens manualmente ou reprocesse a proposta.</p>
                </div>
              ) : (
                <>
                  {items.map((item) =>
                    editingItemId === item.id ? (
                      <div key={item.id} className="flex flex-col gap-2 px-4 py-3 bg-primary/5 md:grid md:grid-cols-[2fr_1.2fr_60px_100px_100px_60px_90px_70px_80px] md:gap-2 md:items-center">
                        <Input value={itemForm.description || ""} onChange={(e) => setItemForm((p: any) => ({ ...p, description: e.target.value }))} className="text-sm" />
                        <SearchableCatalogSelect
                          value={itemForm.catalog_item_id || null}
                          displayValue={itemForm.catalog_item_id ? catalogNameMap.get(itemForm.catalog_item_id) : undefined}
                          onChange={(catalogItemId) => setItemForm((p: any) => ({ ...p, catalog_item_id: catalogItemId }))}
                        />
                        <Input type="number" className="text-sm" value={itemForm.quantity ?? 0} onChange={(e) => {
                          const qty = parseFloat(e.target.value) || 0;
                          const unitPrice = parseFloat(itemForm.unit_price) || 0;
                          setItemForm((p: any) => ({ ...p, quantity: e.target.value, total_price: Math.round(qty * unitPrice * 100) / 100 }));
                        }} />
                        <Input type="number" step="0.01" className="text-sm" value={itemForm.unit_price ?? 0} onChange={(e) => {
                          const unitPrice = parseFloat(e.target.value) || 0;
                          const qty = parseFloat(itemForm.quantity) || 1;
                          setItemForm((p: any) => ({ ...p, unit_price: e.target.value, total_price: Math.round(qty * unitPrice * 100) / 100 }));
                        }} />
                        <Input type="number" step="0.01" className="text-sm" value={itemForm.total_price ?? 0} onChange={(e) => {
                          const totalPrice = parseFloat(e.target.value) || 0;
                          const qty = parseFloat(itemForm.quantity) || 1;
                          setItemForm((p: any) => ({ ...p, total_price: e.target.value, unit_price: qty > 0 ? Math.round((totalPrice / qty) * 100) / 100 : 0 }));
                        }} />
                        <Input type="number" step="0.01" className="text-sm" value={itemForm.discount_pct ?? 0} onChange={(e) => setItemForm((p: any) => ({ ...p, discount_pct: e.target.value }))} />
                        <Select value={itemForm.recurrence} onValueChange={(v) => setItemForm((p: any) => ({ ...p, recurrence: v }))}>
                          <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>{RECURRENCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={itemForm.cost_classification} onValueChange={(v) => setItemForm((p: any) => ({ ...p, cost_classification: v }))}>
                          <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>{COST_CLASSIFICATION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                        </Select>
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveItemEdit}><Save className="h-3.5 w-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingItemId(null)}><EyeOff className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={item.id}
                        className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-accent/50 md:grid md:grid-cols-[2fr_1.2fr_60px_100px_100px_60px_90px_70px_80px] md:gap-2 md:items-center"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{item.description}</p>
                        </div>
                        <p className="text-xs text-muted-foreground truncate min-w-0">
                          {item.catalog_item_id ? (catalogNameMap.get(item.catalog_item_id) || "Vinculado") : "—"}
                        </p>
                        <p className="text-sm text-center">{item.quantity}</p>
                        <p className="text-sm font-mono text-right">{formatCurrency(item.unit_price)}</p>
                        <p className="text-sm font-mono text-right">{formatCurrency(item.total_price)}</p>
                        <p className="text-sm text-center">{item.discount_pct > 0 ? `${item.discount_pct}%` : "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          {RECURRENCE_OPTIONS.find((r) => r.value === item.recurrence)?.label || item.recurrence}
                        </p>
                        <p className="text-xs uppercase text-muted-foreground">{item.cost_classification}</p>
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingItemId(item.id); setItemForm({ ...item }); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteItemTarget(item.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )
                  )}

                  {/* Add new item inline */}
                  {addingItem && (
                    <div className="flex flex-col gap-2 px-4 py-3 bg-primary/5 md:grid md:grid-cols-[2fr_1.2fr_60px_100px_100px_60px_90px_70px_80px] md:gap-2 md:items-center">
                      <Input placeholder="Descrição do item" value={newItemForm.description} onChange={(e) => setNewItemForm((p) => ({ ...p, description: e.target.value }))} className="text-sm" />
                      <span className="text-xs text-muted-foreground">—</span>
                      <Input type="number" className="text-sm" value={newItemForm.quantity} onChange={(e) => setNewItemForm((p) => ({ ...p, quantity: Number(e.target.value) }))} />
                      <Input type="number" step="0.01" className="text-sm" value={newItemForm.unit_price} onChange={(e) => setNewItemForm((p) => ({ ...p, unit_price: Number(e.target.value) }))} />
                      <Input type="number" step="0.01" className="text-sm" value={newItemForm.total_price} onChange={(e) => setNewItemForm((p) => ({ ...p, total_price: Number(e.target.value) }))} />
                      <Input type="number" step="0.01" className="text-sm" value={newItemForm.discount_pct} onChange={(e) => setNewItemForm((p) => ({ ...p, discount_pct: Number(e.target.value) }))} />
                      <Select value={newItemForm.recurrence} onValueChange={(v) => setNewItemForm((p) => ({ ...p, recurrence: v }))}>
                        <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>{RECURRENCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                      </Select>
                      <Select value={newItemForm.cost_classification} onValueChange={(v) => setNewItemForm((p) => ({ ...p, cost_classification: v }))}>
                        <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>{COST_CLASSIFICATION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                      </Select>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={addItem} disabled={!newItemForm.description.trim()}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAddingItem(false)}>
                          <EyeOff className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Items total */}
            {items.length > 0 && (
              <div className="flex justify-end border-t border-border px-4 py-3">
                <div className="text-sm text-muted-foreground">
                  Total dos Itens:{" "}
                  <span className="font-semibold text-foreground font-mono">
                    {formatCurrency(items.reduce((sum, i) => sum + (i.total_price || 0), 0))}
                  </span>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* TAB: Issues */}
        <TabsContent value="pendencias" className="space-y-4">
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pendências da Extração</h3>
              {openIssues.length > 0 && (
                <Badge variant="destructive" className="text-xs h-5 min-w-5">{openIssues.length} abertas</Badge>
              )}
            </div>

            {issues.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <CheckCircle2 className="h-12 w-12 text-emerald-500/40 mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-1">Nenhuma pendência</h3>
                <p className="text-sm text-muted-foreground">Todos os campos extraídos foram validados com sucesso.</p>
              </div>
            ) : (
              <>
                {/* Grid header */}
                <div className="hidden border-b border-border px-4 py-2 md:grid md:grid-cols-[1.5fr_1fr_2fr_100px_120px] md:gap-3 md:items-center">
                  <span className="text-xs font-medium text-muted-foreground">Campo</span>
                  <span className="text-xs font-medium text-muted-foreground">Tipo</span>
                  <span className="text-xs font-medium text-muted-foreground">Valor Extraído</span>
                  <span className="text-xs font-medium text-muted-foreground">Status</span>
                  <span className="text-xs font-medium text-muted-foreground text-right">Ações</span>
                </div>

                <div className="divide-y divide-border">
                  {issues.map((issue) => (
                    <div
                      key={issue.id}
                      className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-accent/50 md:grid md:grid-cols-[1.5fr_1fr_2fr_100px_120px] md:gap-3 md:items-center"
                    >
                      <p className="text-sm font-medium text-foreground">{issue.field_name}</p>
                      <div>
                        <Badge variant="outline" className="text-xs">
                          {ISSUE_TYPE_LABELS[issue.issue_type] || issue.issue_type}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate min-w-0">{issue.extracted_value || "—"}</p>
                      <div>
                        {issue.status === "open" ? (
                          <Badge variant="destructive" className="text-xs">Aberta</Badge>
                        ) : issue.status === "resolved" ? (
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs">Resolvida</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Ignorada</Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-end gap-1">
                        {issue.status === "open" && (
                          <>
                            <Button
                              size="sm" variant="outline" className="h-7 text-xs"
                              onClick={() => {
                                const targetTab = getTabForField(issue.field_name);
                                setSearchParams({ resolve_issue: issue.id, field: issue.field_name }, { replace: true });
                                setActiveTab(targetTab);
                                setHighlightField(issue.field_name);
                                setTimeout(() => {
                                  const el = document.querySelector(`[data-field="${issue.field_name}"]`);
                                  if (el) {
                                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                                    const input = el.querySelector("input, textarea, button[role='combobox']") as HTMLElement;
                                    if (input) input.focus();
                                  }
                                }, 300);
                                setTimeout(() => setHighlightField(null), 5000);
                              }}
                            >
                              Resolver
                            </Button>
                            <Button
                              size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground"
                              onClick={() => updateIssueMutation.mutate({ issueId: issue.id, status: "ignored" })}
                            >
                              Ignorar
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </TabsContent>

        {/* TAB: Rule Applications */}
        {ruleApplications.length > 0 && (
          <TabsContent value="regras" className="space-y-4">
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="bg-accent/30 px-4 py-3 border-b border-border">
                <h3 className="font-medium text-foreground flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Regras de Extração Aplicadas ({ruleApplications.length})
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Regras configuradas que influenciaram a extração desta proposta
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Regra</TableHead>
                    <TableHead>Campo</TableHead>
                    <TableHead>Valor Original</TableHead>
                    <TableHead>Valor Aplicado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ruleApplications.map((app: any) => (
                    <TableRow key={app.id}>
                      <TableCell>
                        <div className="font-medium text-foreground text-sm">
                          {app.extraction_rules?.name || "Regra removida"}
                        </div>
                        {app.extraction_rules?.description && (
                          <div className="text-xs text-muted-foreground line-clamp-1">{app.extraction_rules.description}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{app.field_name}</Badge>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{app.original_value || "—"}</code>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">{app.applied_value}</code>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        )}
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
