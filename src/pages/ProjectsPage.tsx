import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, FolderKanban, MoreHorizontal, Trash2, Eye, CheckCircle, PenLine, SlidersHorizontal, CalendarRange, X, ChevronDown, ChevronUp, Link2, Link2Off, FileText, PenSquare, Trophy, XCircle, Clock, AlertTriangle } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import ConcludeProjectDialog from "@/components/project/ConcludeProjectDialog";
import ProposalReviewDialog from "@/components/project/ProposalReviewDialog";
import { startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear, isWithinInterval, parseISO } from "date-fns";
import { useProjects, useDeleteProject, useUpdateProjectStatus } from "@/hooks/useProjects";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "bg-muted text-muted-foreground" },
  rascunho: { label: "Pendente", className: "bg-muted text-muted-foreground" }, // legacy
  em_revisao: { label: "Em Revisão", className: "bg-warning/15 text-warning" },
  concluido: { label: "Concluído", className: "bg-success/15 text-success" },
};

const PROPOSAL_STATUS_MAP: Record<string, { label: string; className: string; icon: any }> = {
  aberto: { label: "Em Aberto", className: "bg-muted text-muted-foreground", icon: Clock },
  em_assinatura: { label: "Em Assinatura", className: "bg-primary/15 text-primary", icon: PenSquare },
  ganha: { label: "Ganha", className: "bg-success/15 text-success", icon: Trophy },
  cancelada: { label: "Perdida", className: "bg-destructive/15 text-destructive", icon: XCircle },
};

function getProposalStatusCategory(proposalStatus: string | null | undefined): string | null {
  if (!proposalStatus) return null;
  if (proposalStatus === "ganha") return "ganha";
  if (proposalStatus === "cancelada") return "cancelada";
  if (proposalStatus === "em_assinatura") return "em_assinatura";
  return "aberto"; // pendente, proposta_gerada, em_analise_ev, analise_ev_concluida
}

export default function ProjectsPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);
  const [visibleCount, setVisibleCount] = useState(50);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [proposalStatusFilter, setProposalStatusFilter] = useState<string[]>([]);
  const [periodFilter, setPeriodFilter] = useState<string>("este_ano");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [concludeProject, setConcludeProject] = useState<any>(null);
  const [reviewProposalId, setReviewProposalId] = useState<string | null>(null);
  const [deleteConfirmProject, setDeleteConfirmProject] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
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

  const filtered = useMemo(() => projects.filter((p: any) => {
    const s = debouncedSearch.toLowerCase();
    if (s) {
      const textMatch =
        (p.clients?.name || "").toLowerCase().includes(s) ||
        (p.description || "").toLowerCase().includes(s) ||
        (p.product || "").toLowerCase().includes(s) ||
        (p.sales_team?.name || "").toLowerCase().includes(s) ||
        (p.clients?.sales_team_esn?.name || "").toLowerCase().includes(s) ||
        (p.clients?.sales_team_gsn?.name || "").toLowerCase().includes(s) ||
        (p.clients?.unit_info?.name || "").toLowerCase().includes(s);
      if (!textMatch) return false;
    }

    const effectiveStatus = (p.status === "rascunho") ? "pendente" : p.status;
    if (statusFilter.length > 0 && !statusFilter.includes(effectiveStatus || "pendente")) return false;

    if (proposalStatusFilter.length > 0) {
      const proposalStatus = p.proposals?.status || null;
      const category = getProposalStatusCategory(proposalStatus);
      if (!category || !proposalStatusFilter.includes(category)) return false;
    }

    const range = getDateRange();
    if (range) {
      const date = p.created_at ? parseISO(p.created_at) : null;
      if (!date || !isWithinInterval(date, range)) return false;
    }

    return true;
  }), [projects, debouncedSearch, statusFilter, proposalStatusFilter, periodFilter, customStart, customEnd]);

  useEffect(() => { setVisibleCount(50); }, [debouncedSearch, statusFilter, proposalStatusFilter, periodFilter]);

  const visibleProjects = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMoreProjects = visibleCount < filtered.length;

  const activeFilterCount = statusFilter.length + proposalStatusFilter.length + (periodFilter && periodFilter !== "este_ano" ? 1 : 0);

  const handleDeleteConfirmed = async (project: any) => {
    setIsDeleting(true);
    try {
      // If project is linked to a proposal, clean up the opportunity
      if (project.proposal_id) {
        // Remove project scope items from the proposal
        await supabase.from("proposal_scope_items").delete().eq("project_id", project.id);

        // Clean project references from group_notes
        const { data: proposal } = await supabase
          .from("proposals")
          .select("group_notes")
          .eq("id", project.proposal_id)
          .single();

        if (proposal?.group_notes) {
          const notes = { ...(proposal.group_notes as any) };
          Object.keys(notes).forEach((key) => {
            if (key.startsWith(`_project_${project.id}_`)) delete notes[key];
          });
          await supabase.from("proposals").update({ group_notes: notes }).eq("id", project.proposal_id);
        }

        // Revert proposal status to pendente
        await supabase.from("proposals").update({ status: "pendente" }).eq("id", project.proposal_id);

        // Notify ESN via email
        try {
          await supabase.functions.invoke("send-proposal-notification", {
            body: {
              proposalId: project.proposal_id,
              type: "projeto_excluido",
              _origin: window.location.origin,
            },
          });
        } catch (emailErr) {
          console.error("Falha ao enviar notificação ao ESN:", emailErr);
          // Don't block deletion if email fails
        }
      }

      await deleteProject.mutateAsync(project.id);
      toast({ title: "Projeto excluído", description: project.proposal_id ? "A oportunidade foi revertida para Pendente e o ESN foi notificado." : undefined });
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    } finally {
      setIsDeleting(false);
      setDeleteConfirmProject(null);
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

  // Check if proposal has scope and financial data
  const canViewProposal = (project: any) => {
    if (!project.proposal_id) return false;
    const proposalStatus = project.proposals?.status;
    // Has scope if proposal exists and has been worked on
    return proposalStatus && proposalStatus !== "pendente";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Meus Projetos</h1>
          <p className="text-sm text-muted-foreground">{projects.length} projetos cadastrados</p>
        </div>
{/* Projetos criados apenas via Solicitar Revisão EV */}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar por cliente, produto, eng. valor, ESN, GSN, unidade..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Filters */}
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
                setProposalStatusFilter([]);
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

            {/* Status do Projeto */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <FolderKanban className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium uppercase tracking-wider">Status Projeto</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(STATUS_MAP).filter(([key]) => key !== "rascunho").map(([key, { label, className: statusClassName }]) => {
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

            {/* Divider */}
            <div className="hidden h-16 w-px self-center bg-border sm:block" />

            {/* Status da Oportunidade */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium uppercase tracking-wider">Status Oportunidade</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(PROPOSAL_STATUS_MAP).map(([key, { label, className: statusClassName }]) => {
                  const active = proposalStatusFilter.includes(key);
                  return (
                    <button
                      key={key}
                      onClick={() =>
                        setProposalStatusFilter((prev) =>
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
              <TableHead className="w-12">OPP</TableHead>
              <TableHead className="min-w-[120px]">Cliente</TableHead>
              <TableHead className="hidden xl:table-cell">ESN</TableHead>
              <TableHead className="hidden xl:table-cell">GSN</TableHead>
              <TableHead className="hidden lg:table-cell">Unidade</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead className="hidden lg:table-cell">Eng. Valor</TableHead>
              <TableHead className="hidden md:table-cell">Data</TableHead>
              <TableHead className="text-right">Horas</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell w-24">Oportunidade</TableHead>
              <TableHead className="text-right hidden sm:table-cell">Itens</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={13} className="text-center text-muted-foreground py-8">Carregando...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
              <TableCell colSpan={13} className="text-center text-muted-foreground py-8">
                  <FolderKanban className="mx-auto h-8 w-8 mb-2 opacity-40" />
                  Nenhum projeto encontrado
                </TableCell>
              </TableRow>
            ) : (
              visibleProjects.map((project: any) => {
                const effectiveStatus = project.status === "rascunho" ? "pendente" : project.status;
                const statusInfo = STATUS_MAP[effectiveStatus] || STATUS_MAP.pendente;
                const scopeCount = project.project_scope_items?.length || 0;
                const attachCount = project.project_attachments?.length || 0;
                const totalHours = getTotalHours(project);
                const createdDate = project.created_at
                  ? new Date(project.created_at).toLocaleDateString("pt-BR")
                  : "—";
                const hasProposal = !!(project.proposal_id || project.proposal_number);
                const proposalStatus = project.proposals?.status || null;
                const proposalCategory = getProposalStatusCategory(proposalStatus);
                const proposalStatusInfo = proposalCategory ? PROPOSAL_STATUS_MAP[proposalCategory] : null;
                const ProposalIcon = proposalStatusInfo?.icon || null;

                return (
                  <TableRow key={project.id} className="cursor-pointer hover:bg-accent/50" onClick={() => navigate(`/projetos/${project.id}`)}>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center justify-center">
                            {hasProposal ? (
                              <Link2 className="h-4 w-4 text-primary" />
                            ) : (
                              <Link2Off className="h-4 w-4 text-muted-foreground/40" />
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {hasProposal
                            ? `Vinculado à OPP ${project.proposal_number || ""}`
                            : "Sem oportunidade vinculada"
                          }
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="truncate max-w-[180px]">{project.clients?.name || "—"}</div>
                      {project.clients?.code && (
                        <div className="text-xs text-muted-foreground truncate max-w-[180px]">{project.clients.code} · {project.clients.cnpj || ""}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm hidden xl:table-cell">
                      <span className="truncate block max-w-[120px]">{project.clients?.sales_team_esn?.name || "—"}</span>
                    </TableCell>
                    <TableCell className="text-sm hidden xl:table-cell">
                      <span className="truncate block max-w-[120px]">{project.clients?.sales_team_gsn?.name || "—"}</span>
                    </TableCell>
                    <TableCell className="text-sm hidden lg:table-cell">
                      <span className="truncate block max-w-[120px]">{project.clients?.unit_info?.name || "—"}</span>
                    </TableCell>
                    <TableCell>
                      <span className="truncate block max-w-[100px]">{project.product || "—"}</span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="truncate block max-w-[120px]">{project.sales_team?.name || "—"}</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden md:table-cell whitespace-nowrap">{createdDate}</TableCell>
                    <TableCell className="text-right text-sm font-medium whitespace-nowrap">{totalHours > 0 ? `${totalHours}h` : "—"}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${statusInfo.className}`}>
                        {statusInfo.label}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {proposalStatusInfo && ProposalIcon ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${proposalStatusInfo.className}`}>
                              <ProposalIcon className="h-3 w-3" />
                              {proposalStatusInfo.label}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Status da Oportunidade: {proposalStatusInfo.label}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground whitespace-nowrap hidden sm:table-cell">
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
                          {canViewProposal(project) && (
                            <DropdownMenuItem onClick={() => setReviewProposalId(project.proposal_id)}>
                              <FileText className="mr-2 h-4 w-4" />Ver Proposta
                            </DropdownMenuItem>
                          )}
                          {(effectiveStatus === "pendente" || effectiveStatus === "em_revisao") && hasProposal && (
                            <DropdownMenuItem onClick={() => setConcludeProject(project)}>
                              <CheckCircle className="mr-2 h-4 w-4" />Concluir Revisão
                            </DropdownMenuItem>
                          )}
                          {effectiveStatus === "em_revisao" && (
                            <DropdownMenuItem onClick={() => handleStatusChange(project.id, "pendente")}>
                              <PenLine className="mr-2 h-4 w-4" />Voltar para Pendente
                            </DropdownMenuItem>
                          )}
                          {role === "admin" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteConfirmProject(project)}>
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

      <ConcludeProjectDialog
        open={!!concludeProject}
        onOpenChange={(open) => { if (!open) setConcludeProject(null); }}
        project={concludeProject}
      />

      <ProposalReviewDialog
        proposalId={reviewProposalId}
        open={!!reviewProposalId}
        onOpenChange={(open) => { if (!open) setReviewProposalId(null); }}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmProject} onOpenChange={(open) => { if (!open) setDeleteConfirmProject(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <AlertDialogTitle>Excluir Projeto</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="space-y-3 pt-2">
              <span className="block">
                Tem certeza que deseja excluir o projeto de <strong>{deleteConfirmProject?.clients?.name || "—"}</strong>?
              </span>
              {deleteConfirmProject?.proposal_id && (
                <span className="block rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
                  <strong>Atenção:</strong> Este projeto está vinculado à Oportunidade <strong>{deleteConfirmProject?.proposal_number || ""}</strong>. 
                  Ao confirmar a exclusão:
                  <ul className="mt-2 list-disc pl-5 space-y-1">
                    <li>O ESN responsável será notificado sobre a exclusão</li>
                    <li>O escopo do projeto será removido da oportunidade</li>
                    <li>A oportunidade voltará ao status <strong>Pendente</strong></li>
                  </ul>
                </span>
              )}
              <span className="block text-xs text-muted-foreground">Esta ação não pode ser desfeita.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirmProject && handleDeleteConfirmed(deleteConfirmProject)}
            >
              {isDeleting ? "Excluindo..." : "Confirmar Exclusão"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
