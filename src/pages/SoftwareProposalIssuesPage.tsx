import { useState, useMemo } from "react";
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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  // Quick-create client dialog state
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

  const openPdf = async (e: React.MouseEvent, fileUrl: string | null) => {
    e.stopPropagation();
    if (!fileUrl) {
      toast.error("PDF não disponível para esta proposta");
      return;
    }
    try {
      const { data, error } = await supabase.storage
        .from("software-proposal-pdfs")
        .download(fileUrl);
      if (error) throw error;
      const blobUrl = URL.createObjectURL(data);
      window.open(blobUrl, "_blank");
    } catch (err: any) {
      toast.error("Erro ao abrir PDF: " + (err.message || "desconhecido"));
    }
  };

  // Extract raw name from "Cliente não encontrado: NOME" pattern
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
    // Link the client to the proposal
    if (createClientProposalId) {
      await supabase
        .from("software_proposals")
        .update({ client_id: clientId })
        .eq("id", createClientProposalId);
    }
    // Resolve the issue
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/propostas-software")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Fila de Pendências
          </h1>
          <p className="text-sm text-muted-foreground">
            Revisão operacional de pendências de extração em todas as propostas
          </p>
        </div>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Abertas</p>
            <p className="text-2xl font-bold text-destructive">{counters?.open ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Resolvidas</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{counters?.resolved ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Ignoradas</p>
            <p className="text-2xl font-bold text-muted-foreground">{counters?.ignored ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Propostas em Revisão</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{counters?.inReview ?? "—"}</p>
          </CardContent>
        </Card>
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
      {(() => {
        const activeFilterCount =
          (statusFilter.length > 0 && !(statusFilter.length === 1 && statusFilter[0] === "open") ? 1 : 0) +
          (typeFilter.length > 0 ? 1 : 0) +
          (periodFilter && periodFilter !== "este_ano" ? 1 : 0);
        return (
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
                      <Input
                        type="date"
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                        className="h-8 w-36 text-xs"
                      />
                      <span className="text-xs text-muted-foreground">até</span>
                      <Input
                        type="date"
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        className="h-8 w-36 text-xs"
                      />
                    </div>
                  )}
                </div>

                {/* Divider */}
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

                {/* Divider */}
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
        );
      })()}

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Pendências
            {issues.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">{issues.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : issues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500/40 mb-4" />
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>Proposta</TableHead>
                    <TableHead>Fornecedor / Cliente</TableHead>
                    <TableHead>Campo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Valor Extraído</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="w-[160px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issues.map((issue) => (
                    <TableRow key={issue.id}>
                      <TableCell className="px-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Abrir PDF"
                          onClick={(e) => openPdf(e, issue.file_url)}
                        >
                          <FileText className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {issue.proposal_number || "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="flex flex-col">
                          <span>{issue.vendor_name || "—"}</span>
                          {issue.client_name && (
                            <span className="text-xs text-muted-foreground">{issue.client_name}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-medium">{issue.field_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {ISSUE_TYPE_LABELS[issue.issue_type] || issue.issue_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">
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
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateStr(issue.created_at)}
                      </TableCell>
                      <TableCell>
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <QuickCreateClientDialog
        open={createClientOpen}
        onOpenChange={setCreateClientOpen}
        onClientCreated={handleClientCreated}
        initialSearch={createClientInitialName}
      />
    </div>
  );
}
