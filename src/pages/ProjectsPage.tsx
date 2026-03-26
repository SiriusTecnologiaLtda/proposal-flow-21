import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, FolderKanban, MoreHorizontal, Trash2, Eye, CheckCircle, Clock, PenLine, SlidersHorizontal, CalendarRange, X, ChevronDown, ChevronUp } from "lucide-react";
import { startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear, isWithinInterval, parseISO } from "date-fns";
import { useProjects, useDeleteProject, useUpdateProjectStatus } from "@/hooks/useProjects";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  rascunho: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  em_revisao: { label: "Em Revisão", className: "bg-warning/15 text-warning" },
  concluido: { label: "Concluído", className: "bg-success/15 text-success" },
};

export default function ProjectsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [periodFilter, setPeriodFilter] = useState<string>("este_ano");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { role } = useUserRole();
  const { toast } = useToast();

  const { data: projects = [], isLoading } = useProjects();
  const deleteProject = useDeleteProject();
  const updateStatus = useUpdateProjectStatus();

  // Period filter logic
  function getDateRange(): { start: Date; end: Date } | null {
    const now = new Date();
    switch (periodFilter) {
      case "este_mes": return { start: startOfMonth(now), end: endOfMonth(now) };
      case "ultimo_mes": { const prev = subMonths(now, 1); return { start: startOfMonth(prev), end: endOfMonth(prev) }; }
      case "este_trimestre": return { start: startOfQuarter(now), end: endOfQuarter(now) };
      case "este_ano": return { start: startOfYear(now), end: endOfYear(now) };
      case "personalizado":
        if (customStart && customEnd) return { start: parseISO(customStart), end: parseISO(customEnd) };
        return null;
      default: return null;
    }
  }

  const filtered = projects.filter((p: any) => {
    const s = search.toLowerCase();
    const textMatch =
      (p.clients?.name || "").toLowerCase().includes(s) ||
      (p.description || "").toLowerCase().includes(s) ||
      (p.product || "").toLowerCase().includes(s) ||
      (p.sales_team?.name || "").toLowerCase().includes(s) ||
      (p.clients?.sales_team_esn?.name || "").toLowerCase().includes(s) ||
      (p.clients?.sales_team_gsn?.name || "").toLowerCase().includes(s) ||
      (p.clients?.unit_info?.name || "").toLowerCase().includes(s);
    if (!textMatch) return false;

    if (statusFilter.length > 0 && !statusFilter.includes(p.status || "rascunho")) return false;

    const range = getDateRange();
    if (range) {
      const date = p.created_at ? parseISO(p.created_at) : null;
      if (!date || !isWithinInterval(date, range)) return false;
    }

    return true;
  });

  const activeFilterCount = statusFilter.length + (periodFilter && periodFilter !== "este_ano" ? 1 : 0);

  const handleDelete = async (id: string) => {
    try {
      await deleteProject.mutateAsync(id);
      toast({ title: "Projeto excluído" });
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await updateStatus.mutateAsync({ id, status });
      toast({ title: `Status alterado para ${STATUS_MAP[status]?.label || status}` });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  // Calculate total hours for a project
  const getTotalHours = (project: any) => {
    const items = project.project_scope_items || [];
    return items
      .filter((i: any) => i.included && i.parent_id)
      .reduce((sum: number, i: any) => sum + (i.hours || 0), 0);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Meus Projetos</h1>
          <p className="text-sm text-muted-foreground">{projects.length} projetos cadastrados</p>
        </div>
        <Button onClick={() => navigate("/projetos/novo")}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Projeto
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar por cliente, produto, eng. valor, ESN, GSN, unidade..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Filters - same layout as proposals */}
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

            {/* Divider */}
            <div className="hidden h-16 w-px self-center bg-border sm:block" />

            {/* Status */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <FolderKanban className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium uppercase tracking-wider">Status</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(STATUS_MAP).map(([key, { label, className: statusClassName }]) => {
                  const active = statusFilter.includes(key);
                  return (
                    <button
                      key={key}
                      onClick={() =>
                        setStatusFilter((prev) =>
                          active ? prev.filter((s) => s !== key) : [...prev, key]
                        )
                      }
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                        active
                          ? `${statusClassName} border-current ring-1 ring-current/30`
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

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>ESN</TableHead>
              <TableHead>GSN</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Eng. Valor</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Horas</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Itens</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={12} className="text-center text-muted-foreground py-8">Carregando...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
              <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                  <FolderKanban className="mx-auto h-8 w-8 mb-2 opacity-40" />
                  Nenhum projeto encontrado
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((project: any) => {
                const statusInfo = STATUS_MAP[project.status] || STATUS_MAP.rascunho;
                const scopeCount = project.project_scope_items?.length || 0;
                const attachCount = project.project_attachments?.length || 0;
                const totalHours = getTotalHours(project);
                const createdDate = project.created_at
                  ? new Date(project.created_at).toLocaleDateString("pt-BR")
                  : "—";
                return (
                  <TableRow key={project.id} className="cursor-pointer hover:bg-accent/50" onClick={() => navigate(`/projetos/${project.id}`)}>
                    <TableCell className="font-medium">
                      <div>{project.clients?.name || "—"}</div>
                      {project.clients?.code && (
                        <div className="text-xs text-muted-foreground">{project.clients.code} · {project.clients.cnpj || ""}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{project.clients?.sales_team_esn?.name || "—"}</TableCell>
                    <TableCell className="text-sm">{project.clients?.sales_team_gsn?.name || "—"}</TableCell>
                    <TableCell className="text-sm">{project.clients?.unit_info?.name || "—"}</TableCell>
                    <TableCell>{project.product || "—"}</TableCell>
                    <TableCell>{project.sales_team?.name || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{createdDate}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{totalHours > 0 ? `${totalHours}h` : "—"}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo.className}`}>
                        {statusInfo.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {scopeCount} itens · {attachCount} anexos
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem onClick={() => navigate(`/projetos/${project.id}`)}>
                            <Eye className="mr-2 h-4 w-4" />Abrir
                          </DropdownMenuItem>
                          {project.status === "rascunho" && (
                            <DropdownMenuItem onClick={() => handleStatusChange(project.id, "em_revisao")}>
                              <Clock className="mr-2 h-4 w-4" />Enviar para Revisão
                            </DropdownMenuItem>
                          )}
                          {project.status === "em_revisao" && (
                            <>
                              <DropdownMenuItem onClick={() => handleStatusChange(project.id, "concluido")}>
                                <CheckCircle className="mr-2 h-4 w-4" />Concluir
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStatusChange(project.id, "rascunho")}>
                                <PenLine className="mr-2 h-4 w-4" />Voltar para Rascunho
                              </DropdownMenuItem>
                            </>
                          )}
                          {role === "admin" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(project.id)}>
                                <Trash2 className="mr-2 h-4 w-4" />Excluir
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
