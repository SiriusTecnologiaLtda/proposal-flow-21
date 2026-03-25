import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, FolderKanban, MoreHorizontal, Trash2, Eye, CheckCircle, Clock, PenLine } from "lucide-react";
import { useProjects, useDeleteProject, useUpdateProjectStatus } from "@/hooks/useProjects";
import { useClients, useSalesTeam } from "@/hooks/useSupabaseData";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  rascunho: { label: "Rascunho", variant: "secondary" },
  em_revisao: { label: "Em Revisão", variant: "outline" },
  concluido: { label: "Concluído", variant: "default" },
};

export default function ProjectsPage() {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const { user } = useAuth();
  const { role } = useUserRole();
  const { toast } = useToast();

  const { data: projects = [], isLoading } = useProjects();
  const deleteProject = useDeleteProject();
  const updateStatus = useUpdateProjectStatus();

  const filtered = projects.filter((p: any) => {
    const s = search.toLowerCase();
    return (
      (p.clients?.name || "").toLowerCase().includes(s) ||
      (p.description || "").toLowerCase().includes(s) ||
      (p.product || "").toLowerCase().includes(s) ||
      (p.sales_team?.name || "").toLowerCase().includes(s)
    );
  });

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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Projetos de Implantação</h1>
          <p className="text-sm text-muted-foreground">{projects.length} projetos cadastrados</p>
        </div>
        <Button onClick={() => navigate("/projetos/novo")}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Projeto
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar por cliente, produto, arquiteto..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Arquiteto</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Itens</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Carregando...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  <FolderKanban className="mx-auto h-8 w-8 mb-2 opacity-40" />
                  Nenhum projeto encontrado
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((project: any) => {
                const statusInfo = STATUS_MAP[project.status] || STATUS_MAP.rascunho;
                const scopeCount = project.project_scope_items?.length || 0;
                const attachCount = project.project_attachments?.length || 0;
                return (
                  <TableRow key={project.id} className="cursor-pointer hover:bg-accent/50" onClick={() => navigate(`/projetos/${project.id}`)}>
                    <TableCell className="font-medium">{project.clients?.name || "—"}</TableCell>
                    <TableCell>{project.product || "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{project.description || "—"}</TableCell>
                    <TableCell>{project.sales_team?.name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
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
