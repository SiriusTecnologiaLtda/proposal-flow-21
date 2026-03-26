import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, FolderKanban, Replace, Plus, Send, Mail, UserPlus, X } from "lucide-react";
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
  const [esnName, setEsnName] = useState<string | null>(null);
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [ccInput, setCcInput] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const proposalId = project?.proposal_id;
  const [fullProject, setFullProject] = useState<any>(null);

  useEffect(() => {
    if (!open || !proposalId || !project?.id) return;
    setMessage("");
    setCcEmails([]);
    setCcInput("");
    setFullProject(null);
    (async () => {
      // Fetch full project data with group_notes and complete scope items
      const { data: fullProj } = await supabase
        .from("projects")
        .select("*, project_scope_items(*)")
        .eq("id", project.id)
        .single();
      setFullProject(fullProj);

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
        setEsnName(esn?.name || null);
      }

      // Check for OTHER projects linked to same proposal
      const { data: linkedProjects } = await supabase
        .from("projects")
        .select("id, description, product, proposal_id, proposal_number")
        .eq("proposal_id", proposalId)
        .neq("id", project.id);
      setExistingProjects(linkedProjects || []);

      // Check if THIS project already has scope items in the proposal
      const { count: ownScopeCount } = await supabase
        .from("proposal_scope_items")
        .select("id", { count: "exact", head: true })
        .eq("proposal_id", proposalId)
        .eq("project_id", project.id);

      // If no other projects, auto-add; if this project already has items it's an update
      if (!linkedProjects || linkedProjects.length === 0) {
        setReplaceMode("add");
      } else {
        setReplaceMode(null);
      }
    })();
  }, [open, proposalId, project?.id]);

  const scopeSummary = useMemo(() => {
    const proj = fullProject;
    if (!proj) return [];
    const items = proj.project_scope_items || [];
    const groupNotes = proj.group_notes || {};
    const processGroupMap: Record<string, string> = groupNotes._process_group_map || {};
    const manualGroups: Record<string, string> = groupNotes._manual_groups || {};
    const groupOrder: string[] = groupNotes._group_order || [];

    const groupToParents = new Map<string, string[]>();
    for (const [parentId, groupId] of Object.entries(processGroupMap)) {
      if (!groupToParents.has(groupId as string)) groupToParents.set(groupId as string, []);
      groupToParents.get(groupId as string)!.push(parentId);
    }

    const result: { name: string; hours: number }[] = [];
    const accountedParents = new Set<string>();

    for (const groupId of groupOrder) {
      const groupName = manualGroups[groupId] || groupId;
      const parentIds = groupToParents.get(groupId) || [];
      let hours = 0;
      for (const pid of parentIds) {
        accountedParents.add(pid);
        const children = items.filter((i: any) => i.parent_id === pid && i.included);
        hours += children.reduce((s: number, c: any) => s + Number(c.hours || 0), 0);
      }
      if (hours > 0) result.push({ name: groupName, hours });
    }

    const ungroupedParents = items.filter((i: any) => !i.parent_id && !accountedParents.has(i.id));
    let ungroupedHours = 0;
    for (const p of ungroupedParents) {
      const children = items.filter((i: any) => i.parent_id === p.id && i.included);
      ungroupedHours += children.reduce((s: number, c: any) => s + Number(c.hours || 0), 0);
    }
    if (ungroupedHours > 0) result.push({ name: "Itens Avulsos", hours: ungroupedHours });

    return result;
  }, [fullProject]);

  const totalHours = scopeSummary.reduce((s, g) => s + g.hours, 0);

  function addCcEmail() {
    const email = ccInput.trim().toLowerCase();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !ccEmails.includes(email)) {
      setCcEmails([...ccEmails, email]);
      setCcInput("");
    }
  }

  function removeCcEmail(email: string) {
    setCcEmails(ccEmails.filter((e) => e !== email));
  }

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

      await includeProjectInOpportunity(fullProject || project, proposalId);
      await supabase.from("proposals").update({ status: "analise_ev_concluida" }).eq("id", proposalId);

      if (esnEmail) {
        // Build scope summary for email
        const scopeHtml = scopeSummary.map(g => `<tr><td style="padding:6px 8px;border-bottom:1px solid #e0e0e0">${g.name}</td><td style="padding:6px 8px;border-bottom:1px solid #e0e0e0;text-align:right;font-weight:500">${g.hours}h</td></tr>`).join("");
        const totalRow = `<tr style="background:#f0f0f0;font-weight:bold"><td style="padding:6px 8px">Total</td><td style="padding:6px 8px;text-align:right">${totalHours}h</td></tr>`;

        const proposalLink = `${window.location.origin}/propostas/${proposalId}`;
        const htmlBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1a1a2e;">Projeto Concluído</h2>
            <p>Olá <strong>${esnName || "ESN"}</strong>,</p>
            <p>O projeto vinculado à oportunidade <strong>${project.proposal_number || ""}</strong> foi concluído.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr style="border-bottom: 1px solid #e0e0e0;">
                <td style="padding: 8px; font-weight: bold; color: #555;">Oportunidade</td>
                <td style="padding: 8px;">${project.proposal_number || ""}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e0e0e0;">
                <td style="padding: 8px; font-weight: bold; color: #555;">Produto</td>
                <td style="padding: 8px;">${project.product || ""}</td>
              </tr>
            </table>
            ${scopeSummary.length > 0 ? `
              <div style="margin: 16px 0;">
                <strong style="color: #555;">Resumo do Escopo:</strong>
                <table style="width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 13px;">
                  <tr style="background: #f0f0f0;">
                    <th style="padding: 6px 8px; text-align: left; border: 1px solid #ddd;">Grupo</th>
                    <th style="padding: 6px 8px; text-align: right; border: 1px solid #ddd;">Horas</th>
                  </tr>
                  ${scopeHtml}
                  ${totalRow}
                </table>
              </div>
            ` : ""}
            ${message.trim() ? `<div style="background: #f5f5f5; padding: 12px 16px; border-radius: 8px; margin: 16px 0;"><strong>Mensagem do Eng. Valor:</strong><br/>${message.replace(/\n/g, "<br/>")}</div>` : ""}
            <p style="margin: 16px 0;"><a href="${proposalLink}" style="display: inline-block; padding: 10px 20px; background: #1a1a2e; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">Acessar Oportunidade na Plataforma</a></p>
            <p style="color: #888; font-size: 12px; margin-top: 24px;">Este é um email automático do sistema de oportunidades.</p>
          </div>
        `;
        try {
          const session = (await supabase.auth.getSession()).data.session;
          await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-proposal-notification`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${session?.access_token}`,
              },
              body: JSON.stringify({
                proposalId,
                type: "projeto_concluido",
                to: esnEmail,
                subject: `[OPP ${project.proposal_number || ""}] Projeto Concluído`,
                htmlBody,
                cc: ccEmails.length > 0 ? ccEmails : undefined,
              }),
            }
          );
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-600" />
            Concluir Projeto
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!proposalId && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive">Este projeto não possui uma oportunidade vinculada.</p>
            </div>
          )}

          {proposalData && (
            <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
              <p><span className="font-medium text-muted-foreground">Oportunidade:</span> {proposalData.number}</p>
              <p><span className="font-medium text-muted-foreground">Produto:</span> {project?.product}</p>
              <p><span className="font-medium text-muted-foreground">Destinatário:</span> {esnName || "—"} ({esnEmail || "sem email"})</p>
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
                <p className="text-xs text-muted-foreground">O(s) projeto(s) existente(s) serão desvinculados.</p>
              )}
              {replaceMode === "add" && (
                <p className="text-xs text-muted-foreground">Este projeto será adicionado mantendo os existentes.</p>
              )}
            </div>
          )}

          {/* CC Recipients */}
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              <UserPlus className="h-3 w-3" /> Cópia (CC)
            </Label>
            <div className="flex gap-2">
              <Input
                value={ccInput}
                onChange={(e) => setCcInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCcEmail())}
                placeholder="email@exemplo.com"
                className="text-sm h-8"
              />
              <Button type="button" size="sm" variant="outline" onClick={addCcEmail} className="h-8 px-3">
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            {ccEmails.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {ccEmails.map((email) => (
                  <Badge key={email} variant="secondary" className="text-xs gap-1 pr-1">
                    {email}
                    <button onClick={() => removeCcEmail(email)} className="ml-0.5 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Mensagem (opcional)</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Descreva o resumo e observações sobre a conclusão do projeto..."
              rows={4}
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={handleConclude} disabled={loading || (!proposalId) || (existingProjects.length > 0 && !replaceMode)}>
            {loading ? "Concluindo..." : <><Send className="mr-2 h-4 w-4" /> Concluir Projeto</>}
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
  let currentManualGroups = { ...(currentGroupNotes._manual_groups || {}) };
  let currentGroupOrder: string[] = [...(currentGroupNotes._group_order || [])];
  let currentProcessGroupMap = { ...(currentGroupNotes._process_group_map || {}) };

  // --- Clean up any previous inclusion of THIS project ---
  // Remove old proposal_scope_items for this project
  await supabase.from("proposal_scope_items").delete()
    .eq("proposal_id", proposalId)
    .eq("project_id", project.id);

  // Remove old group_notes entries for this project
  const projectPrefix = `_project_${project.id}_`;
  currentGroupOrder = currentGroupOrder.filter(g => !g.startsWith(projectPrefix));
  for (const key of Object.keys(currentManualGroups)) {
    if (key.startsWith(projectPrefix)) delete currentManualGroups[key];
  }
  for (const key of Object.keys(currentProcessGroupMap)) {
    if ((currentProcessGroupMap as any)[key]?.startsWith?.(projectPrefix)) {
      delete currentProcessGroupMap[key];
    }
  }

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
