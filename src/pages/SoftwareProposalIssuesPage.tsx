import { useState, useMemo } from "react";
import PdfPreviewDialog from "@/components/software-proposal/PdfPreviewDialog";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear, isWithinInterval, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import {
  AlertTriangle, CheckCircle2, Search, ExternalLink,
  EyeOff, ArrowLeft, FileText, UserPlus,
  SlidersHorizontal, CalendarRange, X, ChevronDown, ChevronUp,
} from "lucide-react";
import QuickCreateClientDialog from "@/components/proposal/QuickCreateClientDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "open", label: "Abertas" },
  { value: "resolved", label: "Resolvidas" },
  { value: "ignored", label: "Ignoradas" },
];

const ISSUE_TYPE_OPTIONS = [
  { value: "all", label: "Todos os Tipos" },
  { value: "low_confidence", label: "Baixa Confiança" },
  { value: "missing_required", label: "Campo Obrigatório" },
  { value: "ambiguous_value", label: "Valor Ambíguo" },
  { value: "format_error", label: "Erro de Formato" },
];

const ISSUE_TYPE_LABELS: Record<string, string> = {
  low_confidence: "Baixa Confiança",
  missing_required: "Campo Obrigatório",
  ambiguous_value: "Valor Ambíguo",
  format_error: "Erro de Formato",
};

interface IssueRow {
  id: string;
  field_name: string;
  issue_type: string;
  extracted_value: string | null;
  status: string;
  created_at: string;
  software_proposal_id: string;
  proposal_number: string | null;
  vendor_name: string | null;
  client_name: string | null;
  proposal_status: string;
  file_url: string | null;
}

export default function SoftwareProposalIssuesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string[]>(["open"]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [periodFilter, setPeriodFilter] = useState<string>("este_ano");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [createClientOpen, setCreateClientOpen] = useState(false);
  const [createClientInitialName, setCreateClientInitialName] = useState("");
  const [createClientIssueId, setCreateClientIssueId] = useState<string | null>(null);
  const [createClientProposalId, setCreateClientProposalId] = useState<string | null>(null);

  const { data: allIssues = [], isLoading } = useQuery({
    queryKey: ["software-issues-queue", searchTerm],
    enabled: !!user,
    queryFn: async () => {
      const { data: issueData, error: issueError } = await supabase
        .from("extraction_issues")
        .select("id, field_name, issue_type, extracted_value, status, created_at, software_proposal_id")
        .order("created_at", { ascending: false });
      if (issueError) throw issueError;
      if (!issueData || issueData.length === 0) return [];

      const proposalIds = [...new Set(issueData.map((i) => i.software_proposal_id))];

      const { data: proposals, error: propError } = await supabase
        .from("software_proposals")
        .select("id, proposal_number, vendor_name, client_name, status, file_url")
        .in("id", proposalIds);
      if (propError) throw propError;

      const propMap = new Map((proposals || []).map((p) => [p.id, p]));

      let results: IssueRow[] = issueData.map((issue) => {
        const prop = propMap.get(issue.software_proposal_id);
        return {
          ...issue,
          proposal_number: (prop as any)?.proposal_number || null,
          vendor_name: prop?.vendor_name || null,
          client_name: prop?.client_name || null,
          proposal_status: prop?.status || "unknown",
          file_url: prop?.file_url || null,
        };
      });

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        results = results.filter(
          (r) =>
            r.field_name.toLowerCase().includes(term) ||
            (r.vendor_name || "").toLowerCase().includes(term) ||
            (r.client_name || "").toLowerCase().includes(term) ||
            (r.proposal_number || "").toLowerCase().includes(term) ||
            (r.extracted_value || "").toLowerCase().includes(term)
        );
      }

      return results;
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

  const issues = useMemo(() => {
    return allIssues.filter((r) => {
      if (statusFilter.length > 0 && !statusFilter.includes(r.status)) return false;
      if (typeFilter.length > 0 && !typeFilter.includes(r.issue_type)) return false;
      if (periodRange) {
        try {
          const d = parseISO(r.created_at);
          if (!isWithinInterval(d, { start: periodRange.start, end: periodRange.end })) return false;
        } catch { return false; }
      }
      return true;
    });
  }, [allIssues, statusFilter, typeFilter, periodRange]);

  const { data: counters } = useQuery({
    queryKey: ["software-issues-counters"],
    enabled: !!user,
    queryFn: async () => {
      const [
        { count: openCount },
        { count: resolvedCount },
        { count: ignoredCount },
      ] = await Promise.all([
        supabase.from("extraction_issues").select("*", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("extraction_issues").select("*", { count: "exact", head: true }).eq("status", "resolved"),
        supabase.from("extraction_issues").select("*", { count: "exact", head: true }).eq("status", "ignored"),
      ]);

      const { count: inReviewCount } = await supabase
        .from("software_proposals")
        .select("*", { count: "exact", head: true })
        .eq("status", "in_review");

      return {
        open: openCount || 0,
        resolved: resolvedCount || 0,
        ignored: ignoredCount || 0,
        inReview: inReviewCount || 0,
      };
    },
  });

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
      queryClient.invalidateQueries({ queryKey: ["software-issues-queue"] });
      queryClient.invalidateQueries({ queryKey: ["software-issues-counters"] });
      toast.success("Pendência atualizada");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const [pdfPreviewId, setPdfPreviewId] = useState<string | null>(null);

  const openPdf = (e: React.MouseEvent, proposalId: string | null) => {
    e.stopPropagation();
    if (!proposalId) {
      toast.error("PDF não disponível para esta proposta");
      return;
    }
    setPdfPreviewId(proposalId);
  };

  const extractNotFoundName = (extracted: string | null): string => {
    if (!extracted) return "";
    const match = extracted.match(/não encontrad[oa]:\s*(.+)/i);
    return match ? match[1].trim() : extracted;
  };

  const isNotFoundIssue = (issue: IssueRow) =>
    issue.status === "open" &&
    issue.extracted_value &&
    /não encontrad/i.test(issue.extracted_value);

  const handleOpenCreateClient = (issue: IssueRow) => {
    const name = extractNotFoundName(issue.extracted_value);
    setCreateClientInitialName(name);
    setCreateClientIssueId(issue.id);
    setCreateClientProposalId(issue.software_proposal_id);
    setCreateClientOpen(true);
  };

  const handleClientCreated = async (clientId: string) => {
    if (createClientProposalId) {
      await supabase
        .from("software_proposals")
        .update({ client_id: clientId })
        .eq("id", createClientProposalId);
    }
    if (createClientIssueId) {
      await supabase
        .from("extraction_issues")
        .update({
          status: "resolved",
          corrected_value: clientId,
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id || null,
        })
        .eq("id", createClientIssueId);
    }
    queryClient.invalidateQueries({ queryKey: ["software-issues-queue"] });
    queryClient.invalidateQueries({ queryKey: ["software-issues-counters"] });
    toast.success("Cliente criado e vinculado à proposta");
  };

  const formatDateStr = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("pt-BR");

  const activeFilterCount =
    (statusFilter.length > 0 && !(statusFilter.length === 1 && statusFilter[0] === "open") ? 1 : 0) +
    (typeFilter.length > 0 ? 1 : 0) +
    (periodFilter && periodFilter !== "este_ano" ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/propostas-software")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Fila de Pendências</h1>
            <p className="text-sm text-muted-foreground">
              {issues.length} pendências {statusFilter.length === 1 && statusFilter[0] === "open" ? "abertas" : "encontradas"}
            </p>
          </div>
        </div>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Abertas</p>
          <p className="text-2xl font-bold text-destructive">{counters?.open ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Resolvidas</p>
          <p className="text-2xl font-bold text-success">{counters?.resolved ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Ignoradas</p>
          <p className="text-2xl font-bold text-muted-foreground">{counters?.ignored ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Propostas em Revisão</p>
          <p className="text-2xl font-bold text-warning">{counters?.inReview ?? "—"}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por campo, fornecedor, cliente ou proposta..."
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
                setStatusFilter(["open"]);
                setTypeFilter([]);
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

            <div className="hidden h-16 w-px self-center bg-border sm:block" />

            {/* Type */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium uppercase tracking-wider">Tipo</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ISSUE_TYPE_OPTIONS.filter(o => o.value !== "all").map(({ value, label }) => {
                  const active = typeFilter.includes(value);
                  return (
                    <button
                      key={value}
                      onClick={() =>
                        setTypeFilter((prev) =>
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
        <div className="hidden border-b border-border bg-muted/50 px-4 py-2.5 md:grid md:grid-cols-[40px_1fr_1.5fr_1fr_auto_1.5fr_auto_auto_160px] md:gap-3 md:items-center">
          <span className="text-xs font-medium text-muted-foreground"></span>
          <span className="text-xs font-medium text-muted-foreground">Proposta</span>
          <span className="text-xs font-medium text-muted-foreground">Fornecedor / Cliente</span>
          <span className="text-xs font-medium text-muted-foreground">Campo</span>
          <span className="text-xs font-medium text-muted-foreground">Tipo</span>
          <span className="text-xs font-medium text-muted-foreground">Valor Extraído</span>
          <span className="text-xs font-medium text-muted-foreground">Status</span>
          <span className="text-xs font-medium text-muted-foreground">Data</span>
          <span className="text-xs font-medium text-muted-foreground">Ações</span>
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
          ) : issues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle2 className="h-12 w-12 text-success/40 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">
                Nenhuma pendência encontrada
              </h3>
              <p className="text-sm text-muted-foreground">
                {statusFilter.length === 1 && statusFilter[0] === "open"
                  ? "Todas as pendências abertas foram resolvidas."
                  : "Nenhum resultado para os filtros selecionados."}
              </p>
            </div>
          ) : (
            issues.map((issue) => (
              <div
                key={issue.id}
                className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-accent/50 md:grid md:grid-cols-[40px_1fr_1.5fr_1fr_auto_1.5fr_auto_auto_160px] md:items-center md:gap-3"
              >
                {/* PDF */}
                <div className="flex items-center justify-center">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="Abrir PDF"
                    onClick={(e) => openPdf(e, issue.software_proposal_id)}
                  >
                    <FileText className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                {/* Proposta */}
                <p className="text-sm font-mono text-muted-foreground truncate">{issue.proposal_number || "—"}</p>
                {/* Fornecedor / Cliente */}
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{issue.vendor_name || "—"}</p>
                  {issue.client_name && (
                    <p className="text-xs text-muted-foreground truncate">{issue.client_name}</p>
                  )}
                </div>
                {/* Campo */}
                <p className="text-sm font-medium text-foreground truncate">{issue.field_name}</p>
                {/* Tipo */}
                <div>
                  <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
                    {ISSUE_TYPE_LABELS[issue.issue_type] || issue.issue_type}
                  </span>
                </div>
                {/* Valor Extraído */}
                <p className="text-sm text-muted-foreground truncate max-w-[180px]">{issue.extracted_value || "—"}</p>
                {/* Status */}
                <div>
                  {issue.status === "open" ? (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-destructive/15 text-destructive whitespace-nowrap">Aberta</span>
                  ) : issue.status === "resolved" ? (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-success/15 text-success whitespace-nowrap">Resolvida</span>
                  ) : (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground whitespace-nowrap">Ignorada</span>
                  )}
                </div>
                {/* Data */}
                <p className="text-sm text-muted-foreground whitespace-nowrap">{formatDateStr(issue.created_at)}</p>
                {/* Ações */}
                <div className="flex gap-1">
                  <Button
                    size="icon" variant="ghost" className="h-7 w-7"
                    title="Abrir proposta"
                    onClick={() => navigate(`/propostas-software/${issue.software_proposal_id}`)}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                  {issue.status === "open" && (
                    <>
                      {isNotFoundIssue(issue) && issue.field_name === "client_name" && (
                        <Button
                          size="sm" variant="outline" className="h-7 text-xs gap-1 border-primary/40 text-primary hover:bg-primary/10"
                          onClick={(e) => { e.stopPropagation(); handleOpenCreateClient(issue); }}
                        >
                          <UserPlus className="h-3 w-3" />
                          Cadastrar
                        </Button>
                      )}
                      <Button
                        size="sm" variant="outline" className="h-7 text-xs gap-1"
                        onClick={() => navigate(`/propostas-software/${issue.software_proposal_id}?resolve_issue=${issue.id}&field=${encodeURIComponent(issue.field_name)}`)}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        Resolver
                      </Button>
                      <Button
                        size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground gap-1"
                        onClick={() => updateIssueMutation.mutate({ issueId: issue.id, status: "ignored" })}
                      >
                        <EyeOff className="h-3 w-3" />
                        Ignorar
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <QuickCreateClientDialog
        open={createClientOpen}
        onOpenChange={setCreateClientOpen}
        onClientCreated={handleClientCreated}
        initialSearch={createClientInitialName}
      />

      <PdfPreviewDialog
        open={!!pdfPreviewId}
        onOpenChange={(open) => { if (!open) setPdfPreviewId(null); }}
        proposalId={pdfPreviewId}
      />
    </div>
  );
}
