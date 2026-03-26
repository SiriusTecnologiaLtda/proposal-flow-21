import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Layers, FolderKanban, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  proposalId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ScopeGroup {
  key: string;
  name: string;
  category: string;
  isProject: boolean;
  processes: { id: string; description: string; hours: number; children: { id: string; description: string; hours: number }[] }[];
}

export default function ProposalReviewDialog({ proposalId, open, onOpenChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState<any>(null);
  const [scopeGroups, setScopeGroups] = useState<ScopeGroup[]>([]);

  useEffect(() => {
    if (!open || !proposalId) return;
    loadProposal();
  }, [open, proposalId]);

  async function loadProposal() {
    setLoading(true);
    try {
      const { data: prop } = await supabase
        .from("proposals")
        .select("*, clients(name), proposal_scope_items(*), payment_conditions(*)")
        .eq("id", proposalId!)
        .single();

      if (!prop) { setLoading(false); return; }
      setProposal(prop);

      // Get proposal type config
      const { data: typeConfig } = await supabase
        .from("proposal_types")
        .select("name")
        .eq("slug", prop.type)
        .maybeSingle();

      setProposal({ ...prop, _typeName: typeConfig?.name || prop.type });

      // Build scope groups
      const items = prop.proposal_scope_items || [];
      const parents = items.filter((i: any) => !i.parent_id).sort((a: any, b: any) => a.sort_order - b.sort_order);
      const groupNotes = (prop.group_notes as any) || {};
      const processGroupMap: Record<string, string> = groupNotes._process_group_map || {};
      const manualGroups: Record<string, string> = groupNotes._manual_groups || {};
      const groupOrder: string[] = groupNotes._group_order || [];

      // Get template names
      const templateIds = [...new Set(parents.map((p: any) => p.template_id).filter(Boolean))];
      let templateMap: Record<string, { name: string; category: string }> = {};
      if (templateIds.length > 0) {
        const { data: templates } = await supabase
          .from("scope_templates")
          .select("id, name, category")
          .in("id", templateIds);
        if (templates) {
          for (const t of templates) templateMap[t.id] = { name: t.name, category: t.category };
        }
      }

      // Group processes
      const groupMap = new Map<string, ScopeGroup>();

      for (const parent of parents) {
        const children = items
          .filter((c: any) => c.parent_id === parent.id && c.included)
          .sort((a: any, b: any) => a.sort_order - b.sort_order)
          .map((c: any) => ({ id: c.id, description: c.description, hours: c.hours }));

        if (!parent.included) continue;

        const hours = children.reduce((s: number, c: any) => s + (c.hours || 0), 0);
        let groupKey: string;
        let groupName: string;
        let category = "";
        let isProject = false;

        if (parent.template_id && templateMap[parent.template_id]) {
          groupKey = parent.template_id;
          groupName = templateMap[parent.template_id].name;
          category = templateMap[parent.template_id].category;
        } else if (parent.project_id) {
          groupKey = `_project_${parent.project_id}`;
          groupName = "Projeto";
          isProject = true;
        } else {
          const mappedGroup = processGroupMap[parent.id];
          groupKey = mappedGroup || "_avulso";
          groupName = manualGroups[groupKey] || "Itens Avulsos";
        }

        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, { key: groupKey, name: groupName, category, isProject, processes: [] });
        }
        groupMap.get(groupKey)!.processes.push({
          id: parent.id,
          description: parent.description,
          hours,
          children,
        });
      }

      // Sort by groupOrder
      const groups = Array.from(groupMap.values());
      if (groupOrder.length > 0) {
        groups.sort((a, b) => {
          const idxA = groupOrder.indexOf(a.key);
          const idxB = groupOrder.indexOf(b.key);
          return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
        });
      }

      setScopeGroups(groups);
    } catch (err) {
      console.error("Error loading proposal for review:", err);
    }
    setLoading(false);
  }

  if (!proposal) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Revisão da Proposta</DialogTitle></DialogHeader>
          {loading ? (
            <div className="py-12 text-center text-muted-foreground">Carregando...</div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">Proposta não encontrada</div>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  const scopeItems = proposal.proposal_scope_items || [];
  const totalHours = scopeItems
    .filter((i: any) => i.included && i.parent_id)
    .reduce((s: number, i: any) => s + (i.hours || 0), 0);

  const gpHours = Math.ceil(totalHours * ((proposal.gp_percentage || 0) / 100));
  const accompAnalystHours = Math.ceil(totalHours * ((proposal.accomp_analyst || 0) / 100));
  const accompGpHours = Math.ceil(totalHours * ((proposal.accomp_gp || 0) / 100));
  const grandTotalHours = totalHours + gpHours + accompAnalystHours + accompGpHours;
  const totalValue = grandTotalHours * (proposal.hourly_rate || 0);

  // Tax factor
  const payments = proposal.payment_conditions || [];
  const installments = payments.length || 1;

  // Get ESN/GSN names from proposal
  const clientName = (proposal.clients as any)?.name || "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Revisão da Proposta</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center text-muted-foreground">Carregando...</div>
        ) : (
          <div className="space-y-4">
            {/* Dados Gerais */}
            <div className="rounded-md border border-border p-4">
              <h3 className="mb-2 text-sm font-semibold text-foreground">Dados Gerais</h3>
              <div className="grid gap-1 text-sm md:grid-cols-2">
                <p><span className="text-muted-foreground">Nº Proposta:</span> <span className="font-medium">{proposal.number || "—"}</span></p>
                <p><span className="text-muted-foreground">Tipo:</span> <span className="font-medium">{proposal._typeName || proposal.type || "—"}</span></p>
                <p><span className="text-muted-foreground">Produto:</span> <span className="font-medium">{proposal.product || "—"}</span></p>
                <p><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{clientName}</span></p>
                <p><span className="text-muted-foreground">Descrição:</span> <span className="font-medium">{proposal.description || "—"}</span></p>
              </div>
            </div>

            {/* Escopo */}
            <div className="rounded-md border border-border p-4">
              <h3 className="mb-2 text-sm font-semibold text-foreground">Escopo</h3>
              {scopeGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum item de escopo incluído</p>
              ) : (
                <div className="space-y-2">
                  {scopeGroups.map((group) => {
                    const groupHours = group.processes.reduce((sum, p) => sum + p.hours, 0);
                    const groupItemCount = group.processes.reduce((sum, p) => sum + p.children.length, 0);

                    return (
                      <Collapsible key={group.key} defaultOpen={false}>
                        <div className="rounded-lg border border-border bg-card overflow-hidden">
                          <CollapsibleTrigger className="flex w-full items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors">
                            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${group.isProject ? "bg-accent text-accent-foreground" : "bg-primary/10 text-primary"}`}>
                              {group.isProject ? <FolderKanban className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
                            </div>
                            <div className="flex-1 min-w-0 text-left">
                              <p className="text-sm font-semibold text-foreground">{group.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {groupItemCount} itens{group.category ? ` · ${group.category}` : ""} · {groupHours}h
                              </p>
                            </div>
                            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180 shrink-0" />
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="border-t border-border">
                              {group.processes.map((proc, procIdx) => (
                                <Collapsible key={proc.id} defaultOpen={false}>
                                  <div className={`${procIdx > 0 ? "border-t border-border" : ""}`}>
                                    <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 pl-6 hover:bg-accent/20 transition-colors">
                                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180 shrink-0" />
                                      <span className="shrink-0 text-xs font-medium text-muted-foreground w-6">{procIdx + 1}.</span>
                                      <span className="flex-1 text-sm font-semibold text-foreground text-left">{proc.description || "(sem nome)"}</span>
                                      <span className="shrink-0 text-xs text-muted-foreground">{proc.hours}h</span>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                      <div className="bg-muted/20">
                                        {proc.children.map((child, childIdx) => (
                                          <div key={child.id} className="flex items-center gap-2 border-t border-border/50 px-3 py-1.5 pl-14 text-sm">
                                            <span className="shrink-0 text-xs text-muted-foreground w-6">{procIdx + 1}.{childIdx + 1}</span>
                                            <span className="flex-1 text-foreground">{child.description}</span>
                                            <span className="shrink-0 text-xs text-muted-foreground">{child.hours}h</span>
                                          </div>
                                        ))}
                                      </div>
                                    </CollapsibleContent>
                                  </div>
                                </Collapsible>
                              ))}
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Financeiro */}
            <div className="rounded-md border border-border bg-primary/5 p-4">
              <h3 className="mb-2 text-sm font-semibold text-foreground">Financeiro</h3>
              <div className="grid gap-1 text-sm md:grid-cols-2">
                <p><span className="text-muted-foreground">Total Horas:</span> <span className="font-semibold">{grandTotalHours}h</span></p>
                <p><span className="text-muted-foreground">Valor Hora:</span> <span className="font-semibold">R$ {(proposal.hourly_rate || 0).toFixed(2)}</span></p>
                <p><span className="text-muted-foreground">Valor Líquido:</span> <span className="font-semibold">R$ {totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></p>
                <p><span className="text-muted-foreground">Parcelas:</span> <span className="font-semibold">{installments}x</span></p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
