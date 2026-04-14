import { useState, useMemo, useCallback, useEffect } from "react";
import PdfPreviewDialog from "@/components/software-proposal/PdfPreviewDialog";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { startExtraction, startBulkExtraction, subscribeExtracting } from "@/lib/backgroundExtraction";
import { startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear, isWithinInterval, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { useSalesTeam } from "@/hooks/useSupabaseData";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FileSearch,
  Upload,
  Search,
  BookOpen,
  Sparkles,
  Loader2,
  RotateCcw,
  Plus,
  AlertTriangle,
  FileText,
  SlidersHorizontal,
  CalendarRange,
  X,
  ChevronDown,
  ChevronUp,
  Trash2,
  Building2,
  Users,
  Check,
  ChevronsUpDown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const STATUS_OPTIONS = [
  { value: "all", label: "Todos os Status" },
  { value: "pending_extraction", label: "Aguardando Extração" },
  { value: "extracting", label: "Extraindo" },
  { value: "extracted", label: "Extraído" },
  { value: "in_review", label: "Em Revisão" },
  { value: "validated", label: "Validado" },
  { value: "error", label: "Erro" },
];

const ORIGIN_OPTIONS = [
  { value: "all", label: "Todas as Origens" },
  { value: "client", label: "Cliente" },
  { value: "vendor", label: "Fornecedor" },
  { value: "partner", label: "Parceiro" },
  { value: "internal", label: "Interno" },
  { value: "historical", label: "Histórico" },
  { value: "email_inbox", label: "E-mail" },
  { value: "other", label: "Outro" },
];

const STATUS_BADGE_VARIANT: Record<string, string> = {
  pending_extraction: "bg-muted text-muted-foreground",
  extracting: "bg-primary/15 text-primary",
  extracted: "bg-success/15 text-success",
  in_review: "bg-warning/15 text-warning",
  validated: "bg-success/15 text-success",
  error: "bg-destructive/15 text-destructive",
};

const STATUS_LABELS: Record<string, string> = {
  pending_extraction: "Aguardando Extração",
  extracting: "Extraindo",
  extracted: "Extraído",
  in_review: "Em Revisão",
  validated: "Validado",
  error: "Erro",
};

const ORIGIN_LABELS: Record<string, string> = {
  client: "Cliente",
  vendor: "Fornecedor",
  partner: "Parceiro",
  internal: "Interno",
  historical: "Histórico",
  email_inbox: "E-mail",
  other: "Outro",
};

// ─── Helpers to sync filters with URL search params ─────────────
function parseList(params: URLSearchParams, key: string): string[] {
  const v = params.get(key);
  return v ? v.split(",").filter(Boolean) : [];
}

function setList(params: URLSearchParams, key: string, values: string[]) {
  if (values.length === 0) params.delete(key);
  else params.set(key, values.join(","));
}

export default function SoftwareProposalsListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ─── Initialise state from URL params ─────────────────────────
  const [searchTerm, setSearchTerm] = useState(searchParams.get("q") || "");
  const [statusFilter, setStatusFilter] = useState<string[]>(() => parseList(searchParams, "status"));
  const [originFilter, setOriginFilter] = useState<string[]>(() => parseList(searchParams, "origin"));
  const [unitFilter, setUnitFilter] = useState<string[]>(() => parseList(searchParams, "unit"));
  const [memberFilter, setMemberFilter] = useState<string[]>(() => parseList(searchParams, "member"));
  const [periodFilter, setPeriodFilter] = useState<string>(searchParams.get("period") || "este_ano");
  const [customStart, setCustomStart] = useState(searchParams.get("cs") || "");
  const [customEnd, setCustomEnd] = useState(searchParams.get("ce") || "");

  const [unitSearch, setUnitSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [extractingIds, setExtractingIds] = useState<Set<string>>(new Set());

  // Subscribe to global background extraction state
  useEffect(() => {
    return subscribeExtracting((ids) => setExtractingIds(ids));
  }, []);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);
  const [pdfPreviewId, setPdfPreviewId] = useState<string | null>(null);

  // ─── Selection state ──────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  // ─── Sync state → URL params ──────────────────────────────────
  useEffect(() => {
    const p = new URLSearchParams();
    if (searchTerm) p.set("q", searchTerm);
    setList(p, "status", statusFilter);
    setList(p, "origin", originFilter);
    setList(p, "unit", unitFilter);
    setList(p, "member", memberFilter);
    if (periodFilter && periodFilter !== "este_ano") p.set("period", periodFilter);
    if (customStart) p.set("cs", customStart);
    if (customEnd) p.set("ce", customEnd);
    setSearchParams(p, { replace: true });
  }, [searchTerm, statusFilter, originFilter, unitFilter, memberFilter, periodFilter, customStart, customEnd, setSearchParams]);

  // Fetch units
  const { data: units = [] } = useQuery({
    queryKey: ["units-list"],
    queryFn: async () => {
      const { data } = await supabase.from("unit_info").select("id, name").order("name");
      return data || [];
    },
  });

  // Fetch sales team
  const { data: salesTeam = [] } = useSalesTeam();

  const handleExtract = useCallback((proposalId: string) => {
    startExtraction(proposalId, queryClient);
  }, [queryClient]);

  const deleteMutation = useMutation({
    mutationFn: async (proposalId: string) => {
      await supabase.from("software_proposal_items").delete().eq("software_proposal_id", proposalId);
      await supabase.from("extraction_issues").delete().eq("software_proposal_id", proposalId);
      await supabase.from("extraction_corrections_log").delete().eq("software_proposal_id", proposalId);
      const { error } = await supabase.from("software_proposals").delete().eq("id", proposalId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["software-proposals"] });
      toast.success("Proposta excluída com sucesso");
    },
    onError: (err: any) => {
      toast.error("Erro ao excluir: " + (err?.message || "desconhecido"));
    },
  });

  // Auto-recover proposals stuck in "extracting" for > 10 minutes
  const STALE_EXTRACTION_MS = 10 * 60 * 1000;

  const { data: allProposals, isLoading } = useQuery({
    queryKey: ["software-proposals", searchTerm],
    enabled: !!user,
    queryFn: async () => {
      let query = supabase
        .from("software_proposals")
        .select("*, software_proposal_items(total_price, cost_classification)")
        .order("created_at", { ascending: false });

      if (searchTerm.trim()) {
        query = query.or(
          `file_name.ilike.%${searchTerm}%,vendor_name.ilike.%${searchTerm}%,client_name.ilike.%${searchTerm}%,proposal_number.ilike.%${searchTerm}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;

      const now = Date.now();
      const rows = data || [];

      const staleIds = rows
        .filter((p: any) => p.status === "extracting" && now - new Date(p.updated_at).getTime() > STALE_EXTRACTION_MS)
        .map((p: any) => p.id);

      if (staleIds.length > 0) {
        console.warn(`[SoftwareProposals] Auto-recovering ${staleIds.length} stale extracting proposals:`, staleIds);
        await supabase
          .from("software_proposals")
          .update({ status: "error", notes: "Auto-recuperado: extração excedeu o tempo limite." })
          .in("id", staleIds);
      }

      return rows.map((p: any) => {
        const status = staleIds.includes(p.id) ? "error" : p.status;
        const items = p.software_proposal_items || [];
        const totalCapex = items
          .filter((i: any) => i.cost_classification === "capex")
          .reduce((sum: number, i: any) => sum + (i.total_price || 0), 0);
        const totalOpex = items
          .filter((i: any) => i.cost_classification === "opex")
          .reduce((sum: number, i: any) => sum + (i.total_price || 0), 0);
        const producaoTotal = Math.round(((totalCapex / 21.82) + totalOpex) * 100) / 100;
        return { ...p, status, _totalCapex: totalCapex, _totalOpex: totalOpex, _producaoTotal: producaoTotal };
      });
    },
  });

  const periodRange = useMemo(() => {
    const now = new Date();
    switch (periodFilter) {
      case "este_mes": return { start: startOfMonth(now), end: endOfMonth(now) };
      case "ultimo_mes": { const prev = subMonths(now, 1); return { start: startOfMonth(prev), end: endOfMonth(prev) }; }
      case "este_trimestre": return { start: startOfQuarter(now), end: endOfQuarter(now) };
      case "este_ano": return { start: startOfYear(now), end: endOfYear(now) };
      case "personalizado": {
        if (customStart && customEnd) return { start: parseISO(customStart), end: parseISO(customEnd) };
        return null;
      }
      default: return null;
    }
  }, [periodFilter, customStart, customEnd]);

  const proposals = useMemo(() => {
    if (!allProposals) return [];
    return allProposals.filter((p: any) => {
      if (statusFilter.length > 0 && !statusFilter.includes(p.status)) return false;
      if (originFilter.length > 0 && !originFilter.includes(p.origin)) return false;
      if (unitFilter.length > 0 && !unitFilter.includes(p.unit_id)) return false;
      if (memberFilter.length > 0) {
        const matchesMember = memberFilter.includes(p.esn_id) || memberFilter.includes(p.gsn_id) || memberFilter.includes(p.arquiteto_id);
        if (!matchesMember) return false;
      }
      if (periodRange) {
        const created = p.created_at;
        if (!created) return false;
        try {
          const d = parseISO(created);
          if (!isWithinInterval(d, { start: periodRange.start, end: periodRange.end })) return false;
        } catch { return false; }
      }
      return true;
    });
  }, [allProposals, statusFilter, originFilter, unitFilter, memberFilter, periodRange]);

  const visibleProposals = useMemo(() => proposals.slice(0, visibleCount), [proposals, visibleCount]);
  const hasMore = visibleCount < proposals.length;

  // ─── Selection helpers ────────────────────────────────────────
  const visibleIds = useMemo(() => new Set(visibleProposals.map((p: any) => p.id)), [visibleProposals]);
  const allVisibleSelected = visibleProposals.length > 0 && visibleProposals.every((p: any) => selectedIds.has(p.id));
  const someVisibleSelected = visibleProposals.some((p: any) => selectedIds.has(p.id));

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleProposals.forEach((p: any) => next.delete(p.id));
      } else {
        visibleProposals.forEach((p: any) => next.add(p.id));
      }
      return next;
    });
  }, [allVisibleSelected, visibleProposals]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ─── Bulk extract ─────────────────────────────────────────────
  const [bulkExtracting, setBulkExtracting] = useState(false);

  const handleBulkExtract = useCallback(async () => {
    setBulkConfirmOpen(false);
    setBulkExtracting(true);
    const ids = Array.from(selectedIds);
    let successCount = 0;
    let errorCount = 0;
    let creditError = false;

    for (const id of ids) {
      if (creditError) break; // Para imediatamente se sem créditos
      try {
        setExtractingIds((prev) => new Set(prev).add(id));
        const { data, error } = await supabase.functions.invoke("extract-software-proposal", {
          body: { software_proposal_id: id },
        });
        if (error || data?.error) {
          const errMsg = data?.error || error?.message || "";
          if (errMsg.includes("Créditos") || errMsg.includes("créditos") || data?.fallback) {
            creditError = true;
            toast.error("Créditos de IA insuficientes. Extração em lote interrompida. Adicione créditos em Settings → Workspace → Usage.");
          }
          throw error || new Error(errMsg);
        }
        successCount++;
      } catch {
        errorCount++;
      } finally {
        setExtractingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }

    queryClient.invalidateQueries({ queryKey: ["software-proposals"] });
    setSelectedIds(new Set());
    setBulkExtracting(false);

    if (creditError) {
      if (successCount > 0) {
        toast.info(`${successCount} proposta(s) extraída(s) antes do erro de créditos. ${ids.length - successCount - errorCount} pendente(s) não processada(s).`);
      }
    } else if (errorCount === 0) {
      toast.success(`Extração em lote concluída — ${successCount} propostas processadas`);
    } else {
      toast.warning(`Extração em lote: ${successCount} sucesso, ${errorCount} erro(s)`);
    }
  }, [selectedIds, queryClient]);

  const openPdf = (e: React.MouseEvent, proposalId: string) => {
    e.stopPropagation();
    setPdfPreviewId(proposalId);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("pt-BR");
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return "—";
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  const activeFilterCount =
    (statusFilter.length > 0 ? 1 : 0) +
    (originFilter.length > 0 ? 1 : 0) +
    (unitFilter.length > 0 ? 1 : 0) +
    (memberFilter.length > 0 ? 1 : 0) +
    (periodFilter && periodFilter !== "este_ano" ? 1 : 0);

  const filteredUnits = useMemo(() => {
    if (!unitSearch.trim()) return units;
    const q = unitSearch.toLowerCase();
    return units.filter((u: any) => u.name?.toLowerCase().includes(q));
  }, [units, unitSearch]);

  const filteredMembers = useMemo(() => {
    const all = salesTeam || [];
    if (!memberSearch.trim()) return all;
    const q = memberSearch.toLowerCase();
    return all.filter((m: any) => m.name?.toLowerCase().includes(q) || m.code?.toLowerCase().includes(q));
  }, [salesTeam, memberSearch]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Propostas de Software</h1>
          <p className="text-sm text-muted-foreground">
            {searchTerm ? `${proposals.length} de ${allProposals?.length || 0}` : allProposals?.length || 0} propostas importadas
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => navigate("/propostas-software/pendencias")}
          >
            <AlertTriangle className="h-4 w-4" />
            Pendências
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => navigate("/propostas-software/catalogo")}
          >
            <BookOpen className="h-4 w-4" />
            Catálogo
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                className="gap-2"
                disabled
              >
                <Sparkles className="h-4 w-4" />
                Regras
              </Button>
            </TooltipTrigger>
            <TooltipContent>Funcionalidade temporariamente desativada</TooltipContent>
          </Tooltip>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => navigate("/propostas-software/nova")}
          >
            <Plus className="h-4 w-4" />
            Nova Manual
          </Button>
          <Button className="gap-2" onClick={() => navigate("/propostas-software/importar")}>
            <Upload className="h-4 w-4" />
            Central de Importação
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por arquivo, fornecedor ou cliente..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Collapsible Filter Bar */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="flex w-full items-center gap-3 bg-accent/30 px-4 py-2.5 transition-colors hover:bg-accent/50"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <SlidersHorizontal className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Filtros</span>
          </div>
          {activeFilterCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
          {!filtersOpen && activeFilterCount > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 overflow-hidden">
              {unitFilter.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  <Building2 className="h-3 w-3" />
                  {unitFilter.length} {unitFilter.length === 1 ? "unidade" : "unidades"}
                </span>
              )}
              {memberFilter.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  <Users className="h-3 w-3" />
                  {memberFilter.length} {memberFilter.length === 1 ? "membro" : "membros"}
                </span>
              )}
              {statusFilter.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  {statusFilter.length} status
                </span>
              )}
              {originFilter.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  {originFilter.length} {originFilter.length === 1 ? "origem" : "origens"}
                </span>
              )}
            </div>
          )}
          <div className="flex-1" />
          {activeFilterCount > 0 && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                setStatusFilter([]);
                setOriginFilter([]);
                setUnitFilter([]);
                setMemberFilter([]);
                setPeriodFilter("este_ano");
                setCustomStart("");
                setCustomEnd("");
              }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <X className="h-3 w-3" />
              Limpar
            </span>
          )}
          {filtersOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {filtersOpen && (
          <div className="p-4 space-y-4">
            {/* Row 1: Period chips */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <CalendarRange className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium uppercase tracking-wider">Período</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {([
                  { key: "este_mes", label: "Este mês" },
                  { key: "ultimo_mes", label: "Último mês" },
                  { key: "este_trimestre", label: "Este trimestre" },
                  { key: "este_ano", label: "Este ano" },
                  { key: "personalizado", label: "Personalizado" },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setPeriodFilter(periodFilter === key && key !== "este_ano" ? "" : key)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      periodFilter === key
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                {periodFilter === "personalizado" && (
                  <div className="flex items-center gap-2">
                    <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-7 w-36 text-xs" />
                    <span className="text-xs text-muted-foreground">até</span>
                    <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-7 w-36 text-xs" />
                  </div>
                )}
              </div>
            </div>

            {/* Row 2: Status + Origin + Unit + Member */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Status */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium uppercase tracking-wider">Status</span>
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className={cn(
                      "flex w-full items-center justify-between rounded-md border px-3 py-1.5 text-xs transition-colors",
                      statusFilter.length > 0
                        ? "border-primary/50 bg-primary/5 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40"
                    )}>
                      <span className="truncate">
                        {statusFilter.length === 0
                          ? "Todos os status"
                          : statusFilter.length === 1
                            ? STATUS_LABELS[statusFilter[0]] || statusFilter[0]
                            : `${statusFilter.length} selecionados`}
                      </span>
                      <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-0" align="start">
                    <div className="max-h-48 overflow-auto p-1">
                      {STATUS_OPTIONS.filter(o => o.value !== "all").map(({ value, label }) => {
                        const active = statusFilter.includes(value);
                        return (
                          <button
                            key={value}
                            onClick={() =>
                              setStatusFilter((prev) =>
                                active ? prev.filter((s) => s !== value) : [...prev, value]
                              )
                            }
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                              active ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-accent"
                            )}
                          >
                            <div className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                              active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
                            )}>
                              {active && <Check className="h-3 w-3" />}
                            </div>
                            <span className="truncate">{label}</span>
                          </button>
                        );
                      })}
                    </div>
                    {statusFilter.length > 0 && (
                      <div className="border-t border-border p-1">
                        <button
                          onClick={() => setStatusFilter([])}
                          className="flex w-full items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-destructive transition-colors"
                        >
                          <X className="h-3 w-3" />
                          Limpar seleção
                        </button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>

              {/* Origin */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <FileSearch className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium uppercase tracking-wider">Origem</span>
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className={cn(
                      "flex w-full items-center justify-between rounded-md border px-3 py-1.5 text-xs transition-colors",
                      originFilter.length > 0
                        ? "border-primary/50 bg-primary/5 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40"
                    )}>
                      <span className="truncate">
                        {originFilter.length === 0
                          ? "Todas as origens"
                          : originFilter.length === 1
                            ? ORIGIN_LABELS[originFilter[0]] || originFilter[0]
                            : `${originFilter.length} selecionadas`}
                      </span>
                      <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-0" align="start">
                    <div className="max-h-48 overflow-auto p-1">
                      {ORIGIN_OPTIONS.filter(o => o.value !== "all").map(({ value, label }) => {
                        const active = originFilter.includes(value);
                        return (
                          <button
                            key={value}
                            onClick={() =>
                              setOriginFilter((prev) =>
                                active ? prev.filter((s) => s !== value) : [...prev, value]
                              )
                            }
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                              active ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-accent"
                            )}
                          >
                            <div className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                              active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
                            )}>
                              {active && <Check className="h-3 w-3" />}
                            </div>
                            <span className="truncate">{label}</span>
                          </button>
                        );
                      })}
                    </div>
                    {originFilter.length > 0 && (
                      <div className="border-t border-border p-1">
                        <button
                          onClick={() => setOriginFilter([])}
                          className="flex w-full items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-destructive transition-colors"
                        >
                          <X className="h-3 w-3" />
                          Limpar seleção
                        </button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>

              {/* Unit */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium uppercase tracking-wider">Unidade</span>
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className={cn(
                      "flex w-full items-center justify-between rounded-md border px-3 py-1.5 text-xs transition-colors",
                      unitFilter.length > 0
                        ? "border-primary/50 bg-primary/5 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40"
                    )}>
                      <span className="truncate">
                        {unitFilter.length === 0
                          ? "Todas as unidades"
                          : unitFilter.length === 1
                            ? units.find((u: any) => u.id === unitFilter[0])?.name || "1 selecionada"
                            : `${unitFilter.length} selecionadas`}
                      </span>
                      <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-60 p-0" align="start">
                    <div className="relative border-b border-border">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Buscar unidade..."
                        value={unitSearch}
                        onChange={(e) => setUnitSearch(e.target.value)}
                        className="h-9 w-full bg-transparent pl-8 pr-2 text-xs outline-none placeholder:text-muted-foreground"
                      />
                    </div>
                    <div className="max-h-48 overflow-auto p-1">
                      {filteredUnits.map((u: any) => {
                        const active = unitFilter.includes(u.id);
                        return (
                          <button
                            key={u.id}
                            onClick={() =>
                              setUnitFilter((prev) =>
                                active ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                              )
                            }
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                              active ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-accent"
                            )}
                          >
                            <div className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                              active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
                            )}>
                              {active && <Check className="h-3 w-3" />}
                            </div>
                            <span className="truncate">{u.name}</span>
                          </button>
                        );
                      })}
                      {filteredUnits.length === 0 && (
                        <p className="px-2 py-3 text-center text-xs text-muted-foreground">Nenhuma unidade encontrada</p>
                      )}
                    </div>
                    {unitFilter.length > 0 && (
                      <div className="border-t border-border p-1">
                        <button
                          onClick={() => setUnitFilter([])}
                          className="flex w-full items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-destructive transition-colors"
                        >
                          <X className="h-3 w-3" />
                          Limpar seleção
                        </button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>

              {/* Member */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium uppercase tracking-wider">Membro</span>
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className={cn(
                      "flex w-full items-center justify-between rounded-md border px-3 py-1.5 text-xs transition-colors",
                      memberFilter.length > 0
                        ? "border-primary/50 bg-primary/5 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40"
                    )}>
                      <span className="truncate">
                        {memberFilter.length === 0
                          ? "Todos os membros"
                          : memberFilter.length === 1
                            ? (salesTeam || []).find((m: any) => m.id === memberFilter[0])?.name || "1 selecionado"
                            : `${memberFilter.length} selecionados`}
                      </span>
                      <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-0" align="start">
                    <div className="relative border-b border-border">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Buscar por nome ou código..."
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        className="h-9 w-full bg-transparent pl-8 pr-2 text-xs outline-none placeholder:text-muted-foreground"
                      />
                    </div>
                    <div className="max-h-48 overflow-auto p-1">
                      {filteredMembers.map((m: any) => {
                        const active = memberFilter.includes(m.id);
                        return (
                          <button
                            key={m.id}
                            onClick={() =>
                              setMemberFilter((prev) =>
                                active ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                              )
                            }
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                              active ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-accent"
                            )}
                          >
                            <div className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                              active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
                            )}>
                              {active && <Check className="h-3 w-3" />}
                            </div>
                            <span className="truncate">{m.name}</span>
                            <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shrink-0">
                              {m.role?.toUpperCase()}
                            </span>
                          </button>
                        );
                      })}
                      {filteredMembers.length === 0 && (
                        <p className="px-2 py-3 text-center text-xs text-muted-foreground">Nenhum membro encontrado</p>
                      )}
                    </div>
                    {memberFilter.length > 0 && (
                      <div className="border-t border-border p-1">
                        <button
                          onClick={() => setMemberFilter([])}
                          className="flex w-full items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-destructive transition-colors"
                        >
                          <X className="h-3 w-3" />
                          Limpar seleção
                        </button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Selection bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
          <span className="text-sm font-medium text-foreground">
            {selectedIds.size} {selectedIds.size === 1 ? "selecionado" : "selecionados"}
          </span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => setSelectedIds(new Set())}
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Limpar seleção
          </Button>
          <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
            <AlertDialogTrigger asChild>
              <Button size="sm" className="gap-1.5" disabled={bulkExtracting}>
                {bulkExtracting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Extrair selecionados
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Extração em lote</AlertDialogTitle>
                <AlertDialogDescription>
                  Deseja iniciar a extração de <strong>{selectedIds.size}</strong> {selectedIds.size === 1 ? "proposta" : "propostas"} selecionada(s)?
                  O processo será executado sequencialmente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleBulkExtract}>
                  Confirmar extração
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {/* List */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Grid Header */}
        <div className="hidden border-b border-border bg-muted/50 px-4 py-2.5 md:grid md:grid-cols-[32px_1fr_40px_1fr_1fr_auto_1fr_1fr_1fr_auto_auto_auto] md:gap-3 md:items-center">
          <div className="flex items-center justify-center">
            <Checkbox
              checked={allVisibleSelected}
              onCheckedChange={toggleSelectAll}
              aria-label="Selecionar todos"
            />
          </div>
          <span className="text-xs font-medium text-muted-foreground">Unidade</span>
          <span className="text-xs font-medium text-muted-foreground text-center">PDF</span>
          <span className="text-xs font-medium text-muted-foreground">Nº Proposta</span>
          <span className="text-xs font-medium text-muted-foreground">Cliente</span>
          <span className="text-xs font-medium text-muted-foreground">Origem</span>
          <span className="text-xs font-medium text-muted-foreground text-right">Capex</span>
          <span className="text-xs font-medium text-muted-foreground text-right">Opex</span>
          <span className="text-xs font-medium text-muted-foreground text-right">Produção Total</span>
          <span className="text-xs font-medium text-muted-foreground">Status</span>
          <span className="text-xs font-medium text-muted-foreground">Data Import.</span>
          <span className="text-xs font-medium text-muted-foreground text-center">Ações</span>
        </div>

        <div className="divide-y divide-border">
          {isLoading ? (
            <div className="space-y-0">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-4 py-3">
                  <Skeleton className="h-8 w-full" />
                </div>
              ))}
            </div>
          ) : !proposals || proposals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileSearch className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">
                Nenhuma proposta importada
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                As propostas de software importadas aparecerão aqui. Use o botão
                "Central de Importação" para começar.
              </p>
            </div>
          ) : (
            visibleProposals.map((p: any) => {
              const isSelected = selectedIds.has(p.id);
              return (
                <div
                  key={p.id}
                  className={cn(
                    "flex flex-col gap-2 px-4 py-3 transition-colors cursor-pointer md:grid md:grid-cols-[32px_1fr_40px_1fr_1fr_auto_1fr_1fr_1fr_auto_auto_auto] md:items-center md:gap-3",
                    isSelected ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-accent/50"
                  )}
                  onClick={() => navigate(`/propostas-software/${p.id}`)}
                >
                  {/* Checkbox */}
                  <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(p.id)}
                      aria-label={`Selecionar ${p.file_name}`}
                    />
                  </div>
                  {/* Unidade */}
                  <p className="text-sm text-muted-foreground truncate min-w-0">{units.find((u: any) => u.id === p.unit_id)?.name || "—"}</p>
                  {/* PDF */}
                  <div className="flex items-center justify-center">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title="Abrir PDF"
                      onClick={(e) => openPdf(e, p.id)}
                    >
                      <FileText className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  {/* Nº Proposta */}
                  <p className="text-sm font-mono text-muted-foreground truncate">{(p as any).proposal_number || "—"}</p>
                  {/* Cliente */}
                  <p className="text-sm text-muted-foreground truncate min-w-0">{p.client_name || "—"}</p>
                  {/* Origem */}
                  <div>
                    <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
                      {ORIGIN_LABELS[p.origin] || p.origin}
                    </span>
                  </div>
                  {/* Capex */}
                  <p className="text-sm font-mono text-foreground text-right whitespace-nowrap">{formatCurrency(p._totalCapex)}</p>
                  {/* Opex */}
                  <p className="text-sm font-mono text-foreground text-right whitespace-nowrap">{formatCurrency(p._totalOpex)}</p>
                  {/* Produção Total */}
                  <p className="text-sm font-mono font-semibold text-foreground text-right whitespace-nowrap">{formatCurrency(p._producaoTotal)}</p>
                  {/* Status */}
                  <div>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
                        STATUS_BADGE_VARIANT[p.status] || "bg-muted text-muted-foreground"
                      }`}
                    >
                      {STATUS_LABELS[p.status] || p.status}
                    </span>
                  </div>
                  {/* Data Import */}
                  <p className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(p.created_at)}</p>
                  {/* Ações */}
                  <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {extractingIds.has(p.id) || p.status === "extracting" ? (
                      <Button size="sm" variant="ghost" disabled className="gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span className="text-xs">Extraindo…</span>
                      </Button>
                    ) : p.status === "pending_extraction" || p.status === "error" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => handleExtract(p.id)}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span className="text-xs">Extrair</span>
                      </Button>
                    ) : ["extracted", "in_review", "validated"].includes(p.status) ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-muted-foreground"
                        onClick={() => handleExtract(p.id)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span className="text-xs">Re-extrair</span>
                      </Button>
                    ) : null}

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir proposta</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza que deseja excluir "{p.file_name}"? Esta ação não pode ser desfeita e removerá todos os itens e pendências associados.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => deleteMutation.mutate(p.id)}
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {hasMore && (
        <div className="flex justify-center py-3">
          <Button variant="outline" size="sm" onClick={() => setVisibleCount((c) => c + 50)}>
            Carregar mais ({proposals.length - visibleCount} restantes)
          </Button>
        </div>
      )}

      <PdfPreviewDialog
        open={!!pdfPreviewId}
        onOpenChange={(open) => { if (!open) setPdfPreviewId(null); }}
        proposalId={pdfPreviewId}
      />
    </div>
  );
}
