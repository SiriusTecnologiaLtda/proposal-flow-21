import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear, isWithinInterval, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

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
  extracting: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  extracted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  in_review: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  validated: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  error: "bg-destructive/10 text-destructive",
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
  const [extractingIds, setExtractingIds] = useState<Set<string>>(new Set());
  const [periodFilter, setPeriodFilter] = useState<string>("este_ano");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

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
  }, [allProposals, statusFilter, originFilter, periodRange]);

  const openPdf = async (e: React.MouseEvent, fileUrl: string) => {
    e.stopPropagation();
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

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("pt-BR");
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return "—";
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Gestão de Propostas de Software
          </h1>
          <p className="text-sm text-muted-foreground">
            Importação e análise de propostas comerciais de software
          </p>
        </div>
        <div className="flex gap-2">
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
      {(() => {
        const activeFilterCount =
          (statusFilter.length > 0 ? 1 : 0) +
          (originFilter.length > 0 ? 1 : 0) +
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

                {/* Divider */}
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
        );
      })()}

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <FileSearch className="h-4 w-4 text-primary" />
            Propostas Importadas
            {proposals && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {proposals.length}
              </Badge>
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
          ) : !proposals || proposals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileSearch className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">
                Nenhuma proposta importada
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                As propostas de software importadas aparecerão aqui. Use o botão
                "Importar PDF" para começar a análise de propostas comerciais.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Nº Proposta</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead className="text-right">Capex</TableHead>
                    <TableHead className="text-right">Opex</TableHead>
                    <TableHead className="text-right">Produção Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data Import.</TableHead>
                    <TableHead className="text-center">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proposals.map((p: any) => (
                    <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/propostas-software/${p.id}`)}>
                      <TableCell className="px-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Abrir PDF"
                          onClick={(e) => openPdf(e, p.file_url)}
                        >
                          <FileText className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {p.file_name}
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {(p as any).proposal_number || "—"}
                      </TableCell>
                      <TableCell>{p.vendor_name || "—"}</TableCell>
                      <TableCell>{p.client_name || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {ORIGIN_LABELS[p.origin] || p.origin}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(p._totalCapex)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(p._totalOpex)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">
                        {formatCurrency(p._producaoTotal)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            STATUS_BADGE_VARIANT[p.status] || "bg-muted text-muted-foreground"
                          }`}
                        >
                          {STATUS_LABELS[p.status] || p.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(p.created_at)}
                      </TableCell>
                      <TableCell className="text-center">
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
                            onClick={(e) => {
                              e.stopPropagation();
                              extractMutation.mutate(p.id);
                            }}
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            <span className="text-xs">Extrair</span>
                          </Button>
                        ) : ["extracted", "in_review", "validated"].includes(p.status) ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1.5 text-muted-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              extractMutation.mutate(p.id);
                            }}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            <span className="text-xs">Re-extrair</span>
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
