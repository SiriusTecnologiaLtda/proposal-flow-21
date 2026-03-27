import { useState, useEffect, useMemo } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, CheckCircle, FolderKanban, Replace, Plus, Send, Mail, UserPlus, X, FileText, MessageSquare } from "lucide-react";
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
  const [resolvingLink, setResolvingLink] = useState(false);
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

  const [fullProject, setFullProject] = useState<any>(null);
  const proposalId = proposalData?.id || fullProject?.proposal_id || project?.proposal_id;

  async function resolveProjectLinkage() {
    if (!project?.id) {
      return { freshProject: null, resolvedProposal: null, linkedProjects: [] as any[] };
    }

    const { data: freshProject, error: projectError } = await supabase
      .from("projects")
      .select("*, project_scope_items(*)")
      .eq("id", project.id)
      .maybeSingle();

    if (projectError) throw projectError;
    setFullProject(freshProject);

    const projectWithFallback = freshProject || project;
    let resolvedProposal = null;

    const candidateProposalId = projectWithFallback?.proposal_id;
    const candidateProposalNumber = projectWithFallback?.proposal_number;

    if (candidateProposalId) {
      const { data, error } = await supabase
        .from("proposals")
        .select("id, number, esn_id, client_id, status")
        .eq("id", candidateProposalId)
        .maybeSingle();
      if (error) throw error;
      resolvedProposal = data;
    }

    if (!resolvedProposal && candidateProposalNumber) {
      const { data, error } = await supabase
        .from("proposals")
        .select("id, number, esn_id, client_id, status")
        .eq("number", candidateProposalNumber)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      resolvedProposal = data;

      if (data?.id && !projectWithFallback?.proposal_id) {
        await supabase
          .from("projects")
          .update({ proposal_id: data.id, proposal_number: data.number })
          .eq("id", project.id);

        setFullProject((prev: any) => prev ? { ...prev, proposal_id: data.id, proposal_number: data.number } : prev);
      }
    }

    setProposalData(resolvedProposal);

    if (resolvedProposal?.esn_id) {
      const { data: esn, error: esnError } = await supabase
        .from("sales_team")
        .select("email, name")
        .eq("id", resolvedProposal.esn_id)
        .maybeSingle();
      if (esnError) throw esnError;
      setEsnEmail(esn?.email || null);
      setEsnName(esn?.name || null);
    } else {
      setEsnEmail(null);
      setEsnName(null);
    }

    if (!resolvedProposal?.id) {
      setExistingProjects([]);
      setReplaceMode(null);
      return { freshProject: projectWithFallback, resolvedProposal: null, linkedProjects: [] as any[] };
    }

    const { data: linkedProjects, error: linkedError } = await supabase
      .from("projects")
      .select("id, description, product, proposal_id, proposal_number")
      .eq("proposal_id", resolvedProposal.id)
      .neq("id", project.id);

    if (linkedError) throw linkedError;

    const normalizedLinkedProjects = linkedProjects || [];
    setExistingProjects(normalizedLinkedProjects);
    setReplaceMode(normalizedLinkedProjects.length === 0 ? "add" : null);

    return {
      freshProject: projectWithFallback,
      resolvedProposal,
      linkedProjects: normalizedLinkedProjects,
    };
  }

  useEffect(() => {
    if (!open || !project?.id) return;
    setMessage("");
    setCcEmails([]);
    setCcInput("");
    setFullProject(null);
    setTemplateNames({});
    setProposalData(null);
    setEsnEmail(null);
    setEsnName(null);
    setExistingProjects([]);
    setReplaceMode(null);
    setResolvingLink(true);

    let active = true;

    (async () => {
      try {
        const { data: tmpls, error: tmplError } = await supabase.from("scope_templates").select("id, name");
        if (tmplError) throw tmplError;
        if (active && tmpls) {
          const map: Record<string, string> = {};
          tmpls.forEach((t: any) => { map[t.id] = t.name; });
          setTemplateNames(map);
        }

        await resolveProjectLinkage();
      } catch (err: any) {
        if (active) {
          toast({ title: "Erro", description: err.message || "Falha ao carregar vínculo do projeto.", variant: "destructive" });
        }
      } finally {
        if (active) setResolvingLink(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [open, project?.id]);

  const scopeSummary = useMemo(() => {
    const proj = fullProject;
    if (!proj) return [];
    const items = proj.project_scope_items || [];
    const gNotes = proj.group_notes || {};
    let processGroupMap: Record<string, string> = gNotes._process_group_map || {};
    const manualGroups: Record<string, string> = gNotes._manual_groups || {};
    let groupOrder: string[] = gNotes._group_order || [];

    const parents = items.filter((i: any) => !i.parent_id).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
    if (groupOrder.length === 0 && Object.keys(processGroupMap).length === 0 && parents.length > 0) {
      const inferredMap: Record<string, string> = {};
      const inferredOrder: string[] = [];
      for (const p of parents) {
        const key = p.template_id || "_manual_default";
        inferredMap[p.id] = key;
        if (!inferredOrder.includes(key)) inferredOrder.push(key);
      }
      processGroupMap = inferredMap;
      groupOrder = inferredOrder;
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
      proposal_number: fullProject?.proposal_number || project?.proposal_number || proposalData?.number || null,
      client_id: fullProject?.client_id || project?.client_id || proposalData?.client_id || null,
      user_id: authUser.id,
      user_email: authUser.email || null,
      user_name: (authUser.user_metadata?.display_name as string | undefined) || authUser.email || null,
      payload,
      metadata: {
        project_id: project?.id,
        project_status: fullProject?.status || project?.status,
        replace_mode: replaceMode,
        existing_projects_count: existingProjects.length,
      },
      error_message: errorMessage || null,
    });
  }

  const handleConclude = async () => {
    if (resolvingLink) {
      toast({ title: "Aguarde", description: "Estamos validando o vínculo da oportunidade.", variant: "default" });
      return;
    }

    // Validate before closing
    const effectiveProposalIdCheck = proposalData?.id || fullProject?.proposal_id || project?.proposal_id;
    if (!effectiveProposalIdCheck || !proposalData) {
      toast({ title: "Erro", description: "Projeto não possui oportunidade vinculada.", variant: "destructive" });
      return;
    }
    if (existingProjects.length > 0 && !replaceMode) {
      toast({ title: "Selecione uma opção", description: "Escolha adicionar ou substituir o projeto existente.", variant: "destructive" });
      return;
    }

    // Close immediately and show background toast
    onOpenChange(false);
    toast({ title: "Processando...", description: "A conclusão da revisão está sendo executada em background. Você será avisado ao concluir." });

    // Capture state before async
    const capturedMessage = message;
    const capturedCcEmails = [...ccEmails];
    const capturedReplaceMode = replaceMode;
    const capturedScopeSummary = [...scopeSummary];
    const capturedTotalHours = totalHours;

    // Run in background
    try {
      const { freshProject, resolvedProposal, linkedProjects } = await resolveProjectLinkage();
      const effectiveProject = freshProject || fullProject || project;
      const effectiveProposal = resolvedProposal || proposalData;
      const effectiveProposalId = effectiveProposal?.id || effectiveProject?.proposal_id;
      const effectiveProposalNumber = effectiveProposal?.number || effectiveProject?.proposal_number;

      if (!effectiveProposalId || !effectiveProposal) {
        toast({ title: "Erro", description: "Projeto não possui oportunidade vinculada.", variant: "destructive" });
        return;
      }

      await writeSyncLog("project_conclude_started", {
        project_scope_items_count: (effectiveProject?.project_scope_items || []).length,
        scope_summary_count: capturedScopeSummary.length,
        total_hours: capturedTotalHours,
      });

      await supabase
        .from("projects")
        .update({ status: "concluido", proposal_id: effectiveProposalId, proposal_number: effectiveProposalNumber })
        .eq("id", project.id);

      if (capturedReplaceMode === "replace" && linkedProjects.length > 0) {
        for (const ep of linkedProjects) {
          await supabase.from("projects").update({ proposal_id: null, proposal_number: null }).eq("id", ep.id);
          await supabase.from("proposal_scope_items").delete().eq("proposal_id", effectiveProposalId).eq("project_id", ep.id);
        }
        await writeSyncLog("project_conclude_replaced_existing", {
          removed_project_ids: linkedProjects.map((ep) => ep.id),
        });
      }

      await includeProjectInOpportunity(effectiveProject, effectiveProposalId);
      await writeSyncLog("project_conclude_scope_synced", { proposal_id: effectiveProposalId, project_id: project.id });

      await supabase.from("proposals").update({ status: "analise_ev_concluida" }).eq("id", effectiveProposalId);
      await writeSyncLog("project_conclude_proposal_updated", { proposal_status: "analise_ev_concluida" });

      if (esnEmail) {
        const scopeHtml = capturedScopeSummary.map(g => `<tr><td style="padding:6px 8px;border-bottom:1px solid #e0e0e0">${g.name}</td><td style="padding:6px 8px;border-bottom:1px solid #e0e0e0;text-align:right;font-weight:500">${g.hours}h</td></tr>`).join("");
        const totalRow = `<tr style="background:#f0f0f0;font-weight:bold"><td style="padding:6px 8px">Total</td><td style="padding:6px 8px;text-align:right">${capturedTotalHours}h</td></tr>`;

        const proposalLink = `${window.location.origin}/propostas/${effectiveProposalId}`;
        const htmlBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1a1a2e;">Revisão Concluída</h2>
            <p>Olá <strong>${esnName || "ESN"}</strong>,</p>
            <p>A revisão vinculada à oportunidade <strong>${effectiveProposalNumber || ""}</strong> foi concluída.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr style="border-bottom: 1px solid #e0e0e0;">
                <td style="padding: 8px; font-weight: bold; color: #555;">Oportunidade</td>
                <td style="padding: 8px;">${effectiveProposalNumber || ""}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e0e0e0;">
                <td style="padding: 8px; font-weight: bold; color: #555;">Produto</td>
                <td style="padding: 8px;">${effectiveProject?.product || ""}</td>
              </tr>
            </table>
            ${capturedScopeSummary.length > 0 ? `
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
            ${capturedMessage.trim() ? `<div style="background: #f5f5f5; padding: 12px 16px; border-radius: 8px; margin: 16px 0;"><strong>Mensagem do Eng. Valor:</strong><br/>${capturedMessage.replace(/\n/g, "<br/>")}</div>` : ""}
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
                proposalId: effectiveProposalId,
                type: "projeto_concluido",
                to: esnEmail,
                subject: `[OPP ${effectiveProposalNumber || ""}] Revisão Concluída`,
                htmlBody,
                cc: capturedCcEmails.length > 0 ? capturedCcEmails : undefined,
              }),
            }
          );
          await writeSyncLog("project_conclude_email_sent", { to: esnEmail, cc_count: capturedCcEmails.length });
        } catch (emailErr: any) {
          await writeSyncLog("project_conclude_email_error", {}, "warn", emailErr?.message || "Email send failed");
          console.error("Email send failed:", emailErr);
        }
      }

      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project", project.id] });
      qc.invalidateQueries({ queryKey: ["proposals"] });
      qc.invalidateQueries({ queryKey: ["proposal", effectiveProposalId] });
      toast({ title: "Revisão concluída", description: "O escopo foi incluído na oportunidade e o ESN foi notificado." });
    } catch (err: any) {
      await writeSyncLog("project_conclude_error", {}, "error", err.message);
      toast({ title: "Erro ao concluir revisão", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl md:max-w-2xl p-0 flex flex-col gap-0 [&>button]:hidden">
        {/* Hero Header */}
        <div className="bg-gradient-to-r from-[hsl(var(--hero-from))] via-[hsl(var(--hero-via))] to-[hsl(var(--hero-to))] px-6 py-5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-white/10 p-2">
              <CheckCircle className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Concluir Revisão</h2>
              <p className="text-sm text-white/70">Vincule o escopo do projeto à oportunidade e notifique o ESN</p>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-6 space-y-5">
            {/* Loading state */}
            {resolvingLink && (
              <div className="rounded-lg border border-border bg-muted/40 p-4 flex items-start gap-3">
                <div className="mt-0.5 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent shrink-0" />
                <p className="text-sm text-muted-foreground">Validando vínculo da oportunidade e preparando os dados do projeto...</p>
              </div>
            )}

            {/* Error: no proposal */}
            {!resolvingLink && !proposalId && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive">Este projeto não possui uma oportunidade vinculada.</p>
              </div>
            )}

            {/* Section: Dados da Oportunidade */}
            {proposalData && (
              <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                  <FileText className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Dados da Oportunidade</h3>
                </div>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Oportunidade</p>
                    <p className="text-sm font-medium text-foreground truncate">{proposalData.number}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Produto</p>
                    <p className="text-sm font-medium text-foreground truncate">{fullProject?.product || project?.product}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground font-medium">Destinatário (ESN)</p>
                    <p className="text-sm font-medium text-foreground truncate">{esnName || "—"} <span className="text-muted-foreground font-normal">({esnEmail || "sem email"})</span></p>
                  </div>
                </div>
              </div>
            )}

            {/* Section: Existing Projects Warning */}
            {existingProjects.length > 0 && (
              <div className="rounded-xl border border-warning/30 bg-warning/5 shadow-sm">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-warning/20">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <h3 className="text-sm font-semibold text-warning">Projetos Existentes</h3>
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-sm text-muted-foreground">A oportunidade já possui projeto(s) vinculado(s):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {existingProjects.map((ep) => (
                      <Badge key={ep.id} variant="outline" className="text-xs">
                        <FolderKanban className="mr-1 h-3 w-3" />
                        {ep.description || ep.product || "Projeto"}
                      </Badge>
                    ))}
                  </div>
                  <Separator />
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
              </div>
            )}

            {/* Section: Cópia (CC) */}
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <UserPlus className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Cópia (CC)</h3>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={ccInput}
                    onChange={(e) => setCcInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCcEmail())}
                    placeholder="email@exemplo.com"
                    className="text-sm"
                  />
                  <Button type="button" size="sm" variant="outline" onClick={addCcEmail} className="h-10 px-3 shrink-0">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {ccEmails.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
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
            </div>

            {/* Section: Mensagem */}
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <MessageSquare className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Mensagem (opcional)</h3>
              </div>
              <div className="p-4">
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Descreva o resumo e observações sobre a conclusão do projeto..."
                  rows={5}
                  className="text-sm"
                />
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="border-t border-border bg-card px-6 py-4 flex items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading || resolvingLink}>
            Cancelar
          </Button>
          <Button onClick={handleConclude} disabled={loading || resolvingLink || (!proposalId) || (existingProjects.length > 0 && !replaceMode)}>
            {loading ? "Processando..." : <><Send className="mr-2 h-4 w-4" /> Concluir Revisão</>}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
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
