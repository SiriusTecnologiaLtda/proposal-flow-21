import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  FileSearch,
  Upload,
  Filter,
  Search,
  BookOpen,
  Sparkles,
  Loader2,
  RotateCcw,
  Plus,
  AlertTriangle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [statusFilter, setStatusFilter] = useState("all");
  const [originFilter, setOriginFilter] = useState("all");
  const [extractingIds, setExtractingIds] = useState<Set<string>>(new Set());

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

  const { data: proposals, isLoading } = useQuery({
    queryKey: ["software-proposals", statusFilter, originFilter, searchTerm],
    enabled: !!user,
    queryFn: async () => {
      let query = supabase
        .from("software_proposals")
        .select("*, software_proposal_items(total_price, cost_classification)")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      if (originFilter !== "all") {
        query = query.eq("origin", originFilter);
      }
      if (searchTerm.trim()) {
        query = query.or(
          `file_name.ilike.%${searchTerm}%,vendor_name.ilike.%${searchTerm}%,client_name.ilike.%${searchTerm}%,proposal_number.ilike.%${searchTerm}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;

      // Compute Capex, Opex, Produção Total per proposal
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
            Importar PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por arquivo, fornecedor ou cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={originFilter} onValueChange={setOriginFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORIGIN_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

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
