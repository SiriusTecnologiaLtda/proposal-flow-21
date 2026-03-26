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
  const [templateNames, setTemplateNames] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const qc = useQueryClient();

  const proposalId = proposalData?.id || project?.proposal_id;
  const [fullProject, setFullProject] = useState<any>(null);

  useEffect(() => {
    if (!open || !project?.id) return;
    setMessage("");
    setCcEmails([]);
    setCcInput("");
    setFullProject(null);
    setTemplateNames({});
    setProposalData(null);
    setExistingProjects([]);
    setReplaceMode(null);
    (async () => {
      // Fetch full project data with group_notes and complete scope items
      const { data: fullProj } = await supabase
        .from("projects")
        .select("*, project_scope_items(*)")
        .eq("id", project.id)
        .single();
      setFullProject(fullProj);

      // Fetch template names for resolving template-based group names
      const { data: tmpls } = await supabase.from("scope_templates").select("id, name");
      if (tmpls) {
        const map: Record<string, string> = {};
        tmpls.forEach((t: any) => { map[t.id] = t.name; });
        setTemplateNames(map);
      }

      let resolvedProposal = null;
      if (project?.proposal_id) {
        const { data } = await supabase
          .from("proposals")
          .select("id, number, esn_id, client_id, status")
          .eq("id", project.proposal_id)
          .maybeSingle();
        resolvedProposal = data;
      }

      if (!resolvedProposal && project?.proposal_number) {
        const { data } = await supabase
          .from("proposals")
          .select("id, number, esn_id, client_id, status")
          .eq("number", project.proposal_number)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        resolvedProposal = data;

        if (data?.id && !project?.proposal_id) {
          await supabase
            .from("projects")
            .update({ proposal_id: data.id, proposal_number: data.number })
            .eq("id", project.id);
        }
      }

      setProposalData(resolvedProposal);

      if (resolvedProposal?.esn_id) {
        const { data: esn } = await supabase
          .from("sales_team")
          .select("email, name")
          .eq("id", resolvedProposal.esn_id)
          .single();
        setEsnEmail(esn?.email || null);
        setEsnName(esn?.name || null);
      }

      if (!resolvedProposal?.id) return;

      // Check for OTHER projects linked to same proposal
      const { data: linkedProjects } = await supabase
        .from("projects")
        .select("id, description, product, proposal_id, proposal_number")
        .eq("proposal_id", resolvedProposal.id)
        .neq("id", project.id);
      setExistingProjects(linkedProjects || []);

      if (!linkedProjects || linkedProjects.length === 0) {
        setReplaceMode("add");
      } else {
        setReplaceMode(null);
      }
    })();
  }, [open, project?.id, project?.proposal_id, project?.proposal_number]);

  const scopeSummary = useMemo(() => {
    const proj = fullProject;
    if (!proj) return [];
    const items = proj.project_scope_items || [];
    const gNotes = proj.group_notes || {};
    let processGroupMap: Record<string, string> = gNotes._process_group_map || {};
    const manualGroups: Record<string, string> = gNotes._manual_groups || {};
    let groupOrder: string[] = gNotes._group_order || [];

    // Fallback: if no _group_order or _process_group_map, infer from items
    const parents = items.filter((i: any) => !i.parent_id).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
    if (groupOrder.length === 0 && Object.keys(processGroupMap).length === 0 && parents.length > 0) {
      // Infer groups from template_id or assign to a single manual group
      const inferredMap: Record<string, string> = {};
      const inferredOrder: string[] = [];
      for (const p of parents) {
        const key = p.template_id || "_manual_default";
        inferredMap[p.id] = key;
        if (!inferredOrder.includes(key)) inferredOrder.push(key);
      }
      processGroupMap = inferredMap;
      groupOrder = inferredOrder;
      // If there's a single manual group and manualGroups has entries, use the first one's name
      if (inferredOrder.includes("_manual_default") && Object.keys(manualGroups).length > 0) {
        const firstManualName = Object.values(manualGroups)[0];
        manualGroups["_manual_default"] = firstManualName;
      }
    }

    const groupToParents = new Map<string, string[]>();
    for (const [parentId, groupId] of Object.entries(processGroupMap)) {
      if (!groupToParents.has(groupId)) groupToParents.set(groupId, []);
      groupToParents.get(groupId)!.push(parentId);
    }

    const result: { name: string; hours: number }[] = [];
    const accountedParents = new Set<string>();

    for (const groupId of groupOrder) {
      const groupName = manualGroups[groupId] || templateNames[groupId] || groupId;
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
  }, [fullProject, templateNames]);

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

  async function writeSyncLog(stage: string, payload: Record<string, any> = {}, severity: "info" | "warn" | "error" = "info", errorMessage?: string) {
    const { data: authData } = await supabase.auth.getUser();
    const authUser = authData.user;
    if (!authUser) return;

    await supabase.from("proposal_process_logs").insert({
      stage,
      severity,
      action: "project_conclude_sync",
      proposal_id: proposalId || null,
      proposal_number: project?.proposal_number || proposalData?.number || null,
      client_id: project?.client_id || proposalData?.client_id || null,
      user_id: authUser.id,
      user_email: authUser.email || null,
      user_name: (authUser.user_metadata?.display_name as string | undefined) || authUser.email || null,
      payload,
      metadata: {
        project_id: project?.id,
        project_status: project?.status,
        replace_mode: replaceMode,
        existing_projects_count: existingProjects.length,
      },
      error_message: errorMessage || null,
    });
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
      await writeSyncLog("project_conclude_started", {
        project_scope_items_count: (fullProject?.project_scope_items || project?.project_scope_items || []).length,
        scope_summary_count: scopeSummary.length,
        total_hours: totalHours,
      });

      await supabase
        .from("projects")
        .update({ status: "concluido", proposal_id: proposalId, proposal_number: proposalData.number })
        .eq("id", project.id);

      if (replaceMode === "replace" && existingProjects.length > 0) {
        for (const ep of existingProjects) {
          await supabase.from("projects").update({ proposal_id: null, proposal_number: null }).eq("id", ep.id);
          await supabase.from("proposal_scope_items").delete().eq("proposal_id", proposalId).eq("project_id", ep.id);
        }
        await writeSyncLog("project_conclude_replaced_existing", {
          removed_project_ids: existingProjects.map((ep) => ep.id),
        });
      }

      await includeProjectInOpportunity(fullProject || project, proposalId);
      await writeSyncLog("project_conclude_scope_synced", { proposal_id: proposalId, project_id: project.id });

      await supabase.from("proposals").update({ status: "analise_ev_concluida" }).eq("id", proposalId);
      await writeSyncLog("project_conclude_proposal_updated", { proposal_status: "analise_ev_concluida" });

      if (esnEmail) {
        const scopeHtml = scopeSummary.map(g => `<tr><td style="padding:6px 8px;border-bottom:1px solid #e0e0e0">${g.name}</td><td style="padding:6px 8px;border-bottom:1px solid #e0e0e0;text-align:right;font-weight:500">${g.hours}h</td></tr>`).join("");
        const totalRow = `<tr style="background:#f0f0f0;font-weight:bold"><td style="padding:6px 8px">Total</td><td style="padding:6px 8px;text-align:right">${totalHours}h</td></tr>`;

        const proposalLink = `${window.location.origin}/propostas/${proposalId}`;
        const htmlBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1a1a2e;">Projeto Concluído</h2>
            <p>Olá <strong>${esnName || "ESN"}</strong>,</p>
            <p>O projeto vinculado à oportunidade <strong>${project.proposal_number || proposalData.number || ""}</strong> foi concluído.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr style="border-bottom: 1px solid #e0e0e0;">
                <td style="padding: 8px; font-weight: bold; color: #555;">Oportunidade</td>
                <td style="padding: 8px;">${project.proposal_number || proposalData.number || ""}</td>
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
                subject: `[OPP ${project.proposal_number || proposalData.number || ""}] Projeto Concluído`,
                htmlBody,
                cc: ccEmails.length > 0 ? ccEmails : undefined,
              }),
            }
          );
          await writeSyncLog("project_conclude_email_sent", { to: esnEmail, cc_count: ccEmails.length });
        } catch (emailErr: any) {
          await writeSyncLog("project_conclude_email_error", {}, "warn", emailErr?.message || "Email send failed");
          console.error("Email send failed:", emailErr);
        }
      }

      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["proposals"] });
      qc.invalidateQueries({ queryKey: ["proposal", proposalId] });
      toast({ title: "Projeto concluído", description: "O escopo foi incluído na oportunidade e o ESN foi notificado." });
      onOpenChange(false);
    } catch (err: any) {
      await writeSyncLog("project_conclude_error", {}, "error", err.message);
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
            <CheckCircle className="h-5 w-5 text-success" />
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
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-warning">A oportunidade já possui projeto(s) vinculado(s):</p>
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
    // Try to find group from processGroupMap, or infer from template_id
    const origGroupId = processGroupMap[parent.id];
    let groupKey: string;
    if (origGroupId && manualGroups[origGroupId]) {
      // Manual group
      groupKey = `_project_${project.id}_manual_${origGroupId}`;
      newManualGroups[groupKey] = manualGroups[origGroupId];
    } else if (origGroupId && !manualGroups[origGroupId]) {
      // Template-based group (origGroupId is the template ID)
      groupKey = `_project_${project.id}_${origGroupId}`;
    } else if (parent.template_id) {
      // Fallback: use template_id directly
      groupKey = `_project_${project.id}_${parent.template_id}`;
    } else {
      // No group info - check if there's a manual group to use
      if (Object.keys(manualGroups).length > 0) {
        const firstGroupId = Object.keys(manualGroups)[0];
        groupKey = `_project_${project.id}_manual_${firstGroupId}`;
        newManualGroups[groupKey] = manualGroups[firstGroupId];
      } else {
        groupKey = `_project_${project.id}_ungrouped`;
      }
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
