import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, FolderKanban, Replace, Plus, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface ConcludeProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: any;
}

export default function ConcludeProjectDialog({ open, onOpenChange, project }: ConcludeProjectDialogProps) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [existingProjects, setExistingProjects] = useState<any[]>([]);
  const [replaceMode, setReplaceMode] = useState<"add" | "replace" | null>(null);
  const [proposalData, setProposalData] = useState<any>(null);
  const [esnEmail, setEsnEmail] = useState<string | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const proposalId = project?.proposal_id;

  useEffect(() => {
    if (!open || !proposalId) return;
    (async () => {
      const { data: proposal } = await supabase
        .from("proposals")
        .select("id, number, esn_id, client_id, status")
        .eq("id", proposalId)
        .single();
      setProposalData(proposal);

      if (proposal?.esn_id) {
        const { data: esn } = await supabase
          .from("sales_team")
          .select("email, name")
          .eq("id", proposal.esn_id)
          .single();
        setEsnEmail(esn?.email || null);
      }

      const { data: linkedProjects } = await supabase
        .from("projects")
        .select("id, description, product, proposal_id, proposal_number")
        .eq("proposal_id", proposalId)
        .neq("id", project.id);
      setExistingProjects(linkedProjects || []);

      if (!linkedProjects || linkedProjects.length === 0) {
        setReplaceMode("add");
      } else {
        setReplaceMode(null);
      }
    })();
  }, [open, proposalId, project?.id]);

  const scopeSummary = useMemo(() => {
    if (!project) return [];
    const items = project.project_scope_items || [];
    const groupNotes = project.group_notes || {};
    const processGroupMap: Record<string, string> = groupNotes._process_group_map || {};
    const manualGroups: Record<string, string> = groupNotes._manual_groups || {};
    const groupOrder: string[] = groupNotes._group_order || [];

    const parents = items.filter((i: any) => !i.parent_id).sort((a: any, b: any) => a.sort_order - b.sort_order);
    const groupHoursMap = new Map<string, { name: string; hours: number }>();

    for (const parent of parents) {
      const groupId = processGroupMap[parent.id];
      let groupName = "Itens Avulsos";
      let groupKey = "__ungrouped";

      if (groupId && manualGroups[groupId]) {
        groupName = manualGroups[groupId];
        groupKey = groupId;
      } else if (parent.template_id) {
        groupKey = parent.template_id;
        groupName = parent.template_id;
      }

      const children = items.filter((i: any) => i.parent_id === parent.id && i.included);
      const hrs = children.reduce((s: number, c: any) => s + Number(c.hours || 0), 0);

      if (groupHoursMap.has(groupKey)) {
        groupHoursMap.get(groupKey)!.hours += hrs;
      } else {
        groupHoursMap.set(groupKey, { name: groupName, hours: hrs });
      }
    }

    const result: { name: string; hours: number }[] = [];
    const orderedKeys = groupOrder.length > 0 ? groupOrder : [...groupHoursMap.keys()];

    for (const key of orderedKeys) {
      const entry = groupHoursMap.get(key);
      if (entry && entry.hours > 0) {
        result.push(entry);
      }
    }
    for (const [key, entry] of groupHoursMap) {
      if (!orderedKeys.includes(key) && entry.hours > 0) {
        result.push(entry);
      }
    }

    return result;
  }, [project]);

  const totalHours = scopeSummary.reduce((s, g) => s + g.hours, 0);

  const handleConclude = async () => {
    if (!proposalId || !proposalData) {
      toast({ title: "Erro", description: "Projeto não possui oportunidade vinculada.", variant: "destructive" });
      return;
    }
    if (existingProjects.length > 0 && !replaceMode) {
      toast({ title: "Selecione uma opção", description: "Escolha adicionar ou substituir o projeto existente.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      await supabase.from("projects").update({ status: "concluido" }).eq("id", project.id);

      if (replaceMode === "replace" && existingProjects.length > 0) {
        for (const ep of existingProjects) {
          await supabase.from("projects").update({ proposal_id: null, proposal_number: null }).eq("id", ep.id);
          await supabase.from("proposal_scope_items").delete().eq("proposal_id", proposalId).eq("project_id", ep.id);
        }
      }

      await includeProjectInOpportunity(project, proposalId);
      await supabase.from("proposals").update({ status: "analise_ev_concluida" }).eq("id", proposalId);

      if (esnEmail && message.trim()) {
        const scopeHtml = scopeSummary.map(g => `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${g.name}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${g.hours}h</td></tr>`).join("");
        const htmlBody = `
          <div style="font-family:sans-serif;max-width:600px">
            <h3>Projeto Concluído — OPP ${project.proposal_number || ""}</h3>
            <p>${message.replace(/\n/g, "<br>")}</p>
            <h4>Resumo do Escopo</h4>
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <thead><tr style="background:#f5f5f5"><th style="padding:6px 8px;text-align:left">Grupo</th><th style="padding:6px 8px;text-align:right">Horas</th></tr></thead>
              <tbody>${scopeHtml}</tbody>
              <tfoot><tr style="font-weight:bold;background:#f0f0f0"><td style="padding:6px 8px">Total</td><td style="padding:6px 8px;text-align:right">${totalHours}h</td></tr></tfoot>
            </table>
          </div>
        `;
        try {
          await supabase.functions.invoke("send-proposal-notification", {
            body: {
              proposalId,
              type: "projeto_concluido",
              to: esnEmail,
              subject: `Projeto Concluído — OPP ${project.proposal_number || ""}`,
              htmlBody,
            },
          });
        } catch (emailErr) {
          console.error("Email send failed:", emailErr);
        }
      }

      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["proposals"] });
      toast({ title: "Projeto concluído", description: "O escopo foi incluído na oportunidade e o ESN foi notificado." });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro ao concluir", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-600" />
            Concluir Projeto
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {proposalData && (
            <div className="rounded-lg border border-border bg-accent/30 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">Oportunidade Vinculada</p>
              <p className="text-sm font-semibold">OPP {proposalData.number}</p>
            </div>
          )}

          {!proposalId && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive">Este projeto não possui uma oportunidade vinculada. A conclusão não poderá incluir o escopo automaticamente.</p>
            </div>
          )}

          {existingProjects.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-400">A oportunidade já possui projeto(s) vinculado(s):</p>
                  {existingProjects.map((ep) => (
                    <Badge key={ep.id} variant="outline" className="mt-1 mr-1 text-xs">
                      <FolderKanban className="mr-1 h-3 w-3" />
                      {ep.description || ep.product || "Projeto"}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={replaceMode === "add" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setReplaceMode("add")}
                  className="flex-1"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Adicionar
                </Button>
                <Button
                  variant={replaceMode === "replace" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setReplaceMode("replace")}
                  className="flex-1"
                >
                  <Replace className="mr-1 h-3.5 w-3.5" />
                  Substituir
                </Button>
              </div>
              {replaceMode === "replace" && (
                <p className="text-xs text-muted-foreground">O(s) projeto(s) existente(s) serão desvinculados e seu escopo removido da oportunidade.</p>
              )}
              {replaceMode === "add" && (
                <p className="text-xs text-muted-foreground">Este projeto será adicionado à oportunidade mantendo os existentes.</p>
              )}
            </div>
          )}

          {scopeSummary.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Resumo do Escopo</Label>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-accent/50">
                      <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Grupo</th>
                      <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">Horas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scopeSummary.map((g, i) => (
                      <tr key={i} className="border-t border-border/50">
                        <td className="px-3 py-1.5">{g.name}</td>
                        <td className="px-3 py-1.5 text-right font-medium">{g.hours}h</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-accent/30 font-semibold">
                      <td className="px-3 py-1.5">Total</td>
                      <td className="px-3 py-1.5 text-right">{totalHours}h</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Mensagem para o ESN</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Escreva uma mensagem para o Executivo de Soluções sobre a conclusão deste projeto..."
              rows={4}
            />
            {esnEmail && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Send className="h-3 w-3" /> Será enviado para: {esnEmail}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={handleConclude} disabled={loading || (!proposalId) || (existingProjects.length > 0 && !replaceMode)}>
            {loading ? "Concluindo..." : "Concluir Projeto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function includeProjectInOpportunity(project: any, proposalId: string) {
  const items = project.project_scope_items || [];
  const projectGroupNotes = project.group_notes || {};
  const processGroupMap: Record<string, string> = projectGroupNotes._process_group_map || {};
  const manualGroups: Record<string, string> = projectGroupNotes._manual_groups || {};
  const projectGroupOrder: string[] = projectGroupNotes._group_order || [];

  const { data: proposal } = await supabase
    .from("proposals")
    .select("group_notes")
    .eq("id", proposalId)
    .single();
  const currentGroupNotes = proposal?.group_notes as any || {};
  const currentManualGroups = currentGroupNotes._manual_groups || {};
  const currentGroupOrder: string[] = currentGroupNotes._group_order || [];
  const currentProcessGroupMap = currentGroupNotes._process_group_map || {};

  const parents = items.filter((i: any) => !i.parent_id).sort((a: any, b: any) => a.sort_order - b.sort_order);
  const childrenMap = new Map<string, any[]>();
  items.filter((i: any) => i.parent_id).forEach((i: any) => {
    if (!childrenMap.has(i.parent_id)) childrenMap.set(i.parent_id, []);
    childrenMap.get(i.parent_id)!.push(i);
  });

  const localIdToRealId = new Map<string, string>();
  const newRows: any[] = [];
  const newManualGroups: Record<string, string> = {};
  const newGroupOrder: string[] = [];
  const newProcessGroupMap: Record<string, string> = {};

  const groupProcesses = new Map<string, any[]>();
  for (const parent of parents) {
    const origGroupId = processGroupMap[parent.id];
    let groupKey: string;
    if (origGroupId && manualGroups[origGroupId]) {
      groupKey = `_project_${project.id}_manual_${origGroupId}`;
      newManualGroups[groupKey] = manualGroups[origGroupId];
    } else if (parent.template_id) {
      groupKey = `_project_${project.id}_${parent.template_id}`;
    } else {
      groupKey = `_project_${project.id}_ungrouped`;
    }
    if (!groupProcesses.has(groupKey)) {
      groupProcesses.set(groupKey, []);
      newGroupOrder.push(groupKey);
    }
    groupProcesses.get(groupKey)!.push(parent);
  }

  let sortOrder = 0;
  for (const [, groupParents] of groupProcesses) {
    for (const parent of groupParents) {
      const parentRealId = crypto.randomUUID();
      localIdToRealId.set(parent.id, parentRealId);
      newRows.push({
        id: parentRealId,
        proposal_id: proposalId,
        project_id: project.id,
        description: parent.description,
        included: parent.included,
        hours: parent.hours || 0,
        phase: parent.phase || 1,
        notes: parent.notes || "",
        sort_order: sortOrder++,
        template_id: parent.template_id || null,
        parent_id: null,
      });

      const kids = (childrenMap.get(parent.id) || []).sort((a: any, b: any) => a.sort_order - b.sort_order);
      for (const kid of kids) {
        const kidRealId = crypto.randomUUID();
        newRows.push({
          id: kidRealId,
          proposal_id: proposalId,
          project_id: project.id,
          description: kid.description,
          included: kid.included,
          hours: kid.hours || 0,
          phase: kid.phase || 1,
          notes: kid.notes || "",
          sort_order: sortOrder++,
          template_id: kid.template_id || null,
          parent_id: parentRealId,
        });
      }
    }
  }

  if (newRows.length > 0) {
    const { error } = await supabase.from("proposal_scope_items").insert(newRows);
    if (error) throw error;
  }

  for (const [groupKey, groupParents] of groupProcesses) {
    for (const parent of groupParents) {
      const realId = localIdToRealId.get(parent.id);
      if (realId) {
        newProcessGroupMap[realId] = groupKey;
      }
    }
  }

  const mergedGroupNotes = {
    ...currentGroupNotes,
    _manual_groups: { ...currentManualGroups, ...newManualGroups },
    _group_order: [...currentGroupOrder, ...newGroupOrder],
    _process_group_map: { ...currentProcessGroupMap, ...newProcessGroupMap },
  };

  await supabase.from("proposals").update({ group_notes: mergedGroupNotes }).eq("id", proposalId);
}
