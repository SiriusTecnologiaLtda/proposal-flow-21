import { useState, useMemo, useRef } from "react";
import PdfPreviewDialog from "@/components/software-proposal/PdfPreviewDialog";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear, isWithinInterval, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { useSalesTeam } from "@/hooks/useSupabaseData";
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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

export default function SoftwareProposalsListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [originFilter, setOriginFilter] = useState<string[]>([]);
  const [unitFilter, setUnitFilter] = useState<string[]>([]);
  const [memberFilter, setMemberFilter] = useState<string[]>([]);
  const [unitSearch, setUnitSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [extractingIds, setExtractingIds] = useState<Set<string>>(new Set());
  const [periodFilter, setPeriodFilter] = useState<string>("este_ano");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);
  const [pdfPreviewId, setPdfPreviewId] = useState<string | null>(null);

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
  const extractMutation = useMutation({
    mutationFn: async (proposalId: string) => {
      setExtractingIds((prev) => new Set(prev).add(proposalId));
      const { data, error } = await supabase.functions.invoke(
        "extract-software-proposal",
        { body: { software_proposal_id: proposalId } }
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data, proposalId) => {
      setExtractingIds((prev) => {
        const next = new Set(prev);
        next.delete(proposalId);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["software-proposals"] });
      toast.success(
        `Extração concluída — ${data.items_extracted} itens extraídos, ${data.issues_created} pendências criadas`,
        { duration: 5000 }
      );
    },
    onError: (err: any, proposalId) => {
      setExtractingIds((prev) => {
        const next = new Set(prev);
        next.delete(proposalId);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["software-proposals"] });
      toast.error(err?.message || "Erro na extração");
    },
  });

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

      return (data || []).map((p: any) => {
        const items = p.software_proposal_items || [];
        const totalCapex = items
          .filter((i: any) => i.cost_classification === "capex")
          .reduce((sum: number, i: any) => sum + (i.total_price || 0), 0);
        const totalOpex = items
          .filter((i: any) => i.cost_classification === "opex")
          .reduce((sum: number, i: any) => sum + (i.total_price || 0), 0);
        const producaoTotal = Math.round(((totalCapex / 21.82) + totalOpex) * 100) / 100;
        return { ...p, _totalCapex: totalCapex, _totalOpex: totalOpex, _producaoTotal: producaoTotal };
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
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => navigate("/propostas-software/regras")}
          >
            <Sparkles className="h-4 w-4" />
            Regras
          </Button>
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
          <div className="flex-1" />
          {activeFilterCount > 0 && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                setStatusFilter([]);
                setOriginFilter([]);
                setPeriodFilter("este_ano");
                setCustomStart("");
                setCustomEnd("");
              }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <X className="h-3 w-3" />
              Limpar tudo
            </span>
          )}
          {filtersOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {filtersOpen && (
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:flex-wrap sm:items-start">
            {/* Period */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <CalendarRange className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium uppercase tracking-wider">Período</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
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
              </div>
              {periodFilter === "personalizado" && (
                <div className="flex items-center gap-2 pt-1">
                  <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-8 w-36 text-xs" />
                  <span className="text-xs text-muted-foreground">até</span>
                  <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-8 w-36 text-xs" />
                </div>
              )}
            </div>

            <div className="hidden h-16 w-px self-center bg-border sm:block" />

            {/* Status */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium uppercase tracking-wider">Status</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_OPTIONS.filter(o => o.value !== "all").map(({ value, label }) => {
                  const active = statusFilter.includes(value);
                  const badgeClass = STATUS_BADGE_VARIANT[value] || "bg-muted text-muted-foreground";
                  return (
                    <button
                      key={value}
                      onClick={() =>
                        setStatusFilter((prev) =>
                          active ? prev.filter((s) => s !== value) : [...prev, value]
                        )
                      }
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                        active
                          ? `${badgeClass} border-current ring-1 ring-current/30`
                          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="hidden h-16 w-px self-center bg-border sm:block" />

            {/* Origin */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <FileSearch className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium uppercase tracking-wider">Origem</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
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
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                        active
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* List — Grid-based like ProjectsPage */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Grid Header */}
        <div className="hidden border-b border-border bg-muted/50 px-4 py-2.5 md:grid md:grid-cols-[40px_2fr_1fr_1fr_1fr_auto_1fr_1fr_1fr_auto_auto_auto] md:gap-3 md:items-center">
          <span className="text-xs font-medium text-muted-foreground"></span>
          <span className="text-xs font-medium text-muted-foreground">Arquivo</span>
          <span className="text-xs font-medium text-muted-foreground">Nº Proposta</span>
          <span className="text-xs font-medium text-muted-foreground">Fornecedor</span>
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
            visibleProposals.map((p: any) => (
              <div
                key={p.id}
                className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-accent/50 cursor-pointer md:grid md:grid-cols-[40px_2fr_1fr_1fr_1fr_auto_1fr_1fr_1fr_auto_auto_auto] md:items-center md:gap-3"
                onClick={() => navigate(`/propostas-software/${p.id}`)}
              >
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
                {/* Arquivo */}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{p.file_name}</p>
                </div>
                {/* Nº Proposta */}
                <p className="text-sm font-mono text-muted-foreground truncate">{(p as any).proposal_number || "—"}</p>
                {/* Fornecedor */}
                <p className="text-sm text-muted-foreground truncate min-w-0">{p.vendor_name || "—"}</p>
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
                      onClick={() => extractMutation.mutate(p.id)}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span className="text-xs">Extrair</span>
                    </Button>
                  ) : ["extracted", "in_review", "validated"].includes(p.status) ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-muted-foreground"
                      onClick={() => extractMutation.mutate(p.id)}
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
            ))
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
