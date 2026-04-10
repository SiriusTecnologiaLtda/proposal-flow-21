import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Building2, User, Target, Calendar, DollarSign, Sparkles, ArrowLeft,
  FolderKanban, FileText, Layers,
} from "lucide-react";
import {
  formatCurrency,
  type PresentationConfig,
  executivePresentationStore,
} from "@/data/executivePresentationData";
import GenerateDialog from "@/components/executive-presentation/GenerateDialog";

export default function OpportunityDetailPage() {
  const navigate = useNavigate();
  const opportunities = executivePresentationStore.getOpportunities();
  const [selectedOpp, setSelectedOpp] = useState(opportunities[0]);
  const [dialogOpen, setDialogOpen] = useState(false);

  const presConfig = executivePresentationStore.getConfigForSlug(selectedOpp.opportunityTypeSlug);

  const stageColors: Record<string, string> = {
    Proposta: "bg-primary/10 text-primary border-primary/20",
    Qualificação: "bg-warning/10 text-warning border-warning/20",
    Negociação: "bg-success/10 text-success border-success/20",
  };

  const handleGenerate = (config: PresentationConfig) => {
    setDialogOpen(false);
    const pres = executivePresentationStore.createPresentation(selectedOpp, config);
    navigate(`/apresentacao-executiva/${pres.id}`);
  };

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <div className="rounded-xl bg-gradient-to-r from-[hsl(var(--hero-from))] via-[hsl(var(--hero-via))] to-[hsl(var(--hero-to))] px-6 py-5 text-primary-foreground">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Apresentação Executiva</h1>
            <p className="text-sm text-primary-foreground/70">Selecione uma oportunidade e gere a apresentação</p>
          </div>
        </div>
      </div>

      {/* Opportunity selector */}
      <div className="grid gap-4 md:grid-cols-3">
        {opportunities.map((opp) => (
          <button
            key={opp.id}
            onClick={() => setSelectedOpp(opp)}
            className={`rounded-xl border p-5 text-left transition-all hover:shadow-md ${
              selectedOpp.id === opp.id
                ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                : "bg-card hover:border-primary/30"
            }`}
          >
            <div className="space-y-2">
              <Badge variant="outline" className={stageColors[opp.stage] ?? ""}>{opp.stage}</Badge>
              <h3 className="font-semibold text-foreground">{opp.company}</h3>
              <p className="text-xs text-muted-foreground">{opp.opportunityTypeLabel}</p>
              <p className="text-sm font-medium text-primary">{formatCurrency(opp.investmentTotal)}</p>
              {/* Data source indicators */}
              <div className="flex gap-1.5 pt-1">
                {opp.linkedProject && (
                  <Badge variant="secondary" className="text-[9px] gap-0.5">
                    <FolderKanban className="h-2.5 w-2.5" /> Projeto
                  </Badge>
                )}
                {opp.templateContext && (
                  <Badge variant="secondary" className="text-[9px] gap-0.5">
                    <FileText className="h-2.5 w-2.5" /> Template
                  </Badge>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Selected opportunity detail */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="border-b p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-foreground">{selectedOpp.company}</h2>
              <p className="text-sm text-muted-foreground">{selectedOpp.opportunityTypeLabel}</p>
            </div>
            <Button onClick={() => setDialogOpen(true)} className="gap-2">
              <Sparkles className="h-4 w-4" /> Gerar apresentação executiva
            </Button>
          </div>
        </div>

        <div className="grid gap-6 p-6 md:grid-cols-2 lg:grid-cols-3">
          <InfoBlock icon={Building2} label="Segmento" value={selectedOpp.segment} />
          <InfoBlock icon={User} label="Contato" value={`${selectedOpp.contact} — ${selectedOpp.contactRole}`} />
          <InfoBlock icon={Target} label="Estágio" value={selectedOpp.stage} />
          <InfoBlock icon={DollarSign} label="Valor previsto" value={formatCurrency(selectedOpp.investmentTotal)} />
          <InfoBlock icon={Calendar} label="Previsão de fechamento" value={new Date(selectedOpp.expectedCloseDate).toLocaleDateString("pt-BR")} />
          <InfoBlock icon={Target} label="Dor principal" value={selectedOpp.mainPain} />
        </div>

        {/* Linked Project */}
        {selectedOpp.linkedProject && (
          <div className="border-t p-6">
            <div className="flex items-center gap-2 mb-3">
              <FolderKanban className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Projeto Vinculado</h3>
              <Badge variant="outline" className="text-[10px]">{selectedOpp.linkedProject.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-3">{selectedOpp.linkedProject.description}</p>
            <div className="space-y-1.5">
              {selectedOpp.linkedProject.scopeGroups.map((g) => (
                <div key={g.id} className="flex items-center gap-3 rounded-lg bg-muted/30 px-3 py-2">
                  <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm text-foreground flex-1 truncate">{g.title}</span>
                  <span className="text-xs text-muted-foreground">{g.itemCount} itens</span>
                  <span className="text-xs font-medium text-foreground tabular-nums">{g.totalHours}h</span>
                </div>
              ))}
              <div className="flex items-center justify-end gap-3 pt-1">
                <span className="text-xs text-muted-foreground">Total:</span>
                <span className="text-sm font-bold text-primary">{selectedOpp.linkedProject.totalHours}h</span>
              </div>
            </div>
          </div>
        )}

        {/* Template context */}
        {selectedOpp.templateContext && (
          <div className="border-t p-6">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Template de Proposta</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {selectedOpp.templateContext.premises.length > 0 && (
                <div className="rounded-lg bg-muted/30 p-3 space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Premissas</p>
                  <ul className="space-y-0.5">
                    {selectedOpp.templateContext.premises.slice(0, 3).map((p, i) => (
                      <li key={i} className="text-[11px] text-foreground">• {p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {selectedOpp.templateContext.outOfScope.length > 0 && (
                <div className="rounded-lg bg-muted/30 p-3 space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Fora do Escopo</p>
                  <ul className="space-y-0.5">
                    {selectedOpp.templateContext.outOfScope.slice(0, 3).map((p, i) => (
                      <li key={i} className="text-[11px] text-foreground">• {p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {selectedOpp.templateContext.methodology && (
                <div className="rounded-lg bg-muted/30 p-3 space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Metodologia</p>
                  <p className="text-[11px] text-foreground line-clamp-4">{selectedOpp.templateContext.methodology}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Type reference info */}
        {presConfig && (
          <div className="border-t p-6">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Conteúdo-base: {selectedOpp.opportunityTypeLabel}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Posicionamento</p>
                <p className="text-sm text-foreground line-clamp-3">{presConfig.positioningText}</p>
              </div>
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Abordagem</p>
                <p className="text-sm text-foreground line-clamp-3">{presConfig.solutionApproach}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-3 flex-wrap">
              <Badge variant="secondary" className="text-xs">{presConfig.defaultScopeBlocks.length} blocos de escopo padrão</Badge>
              <Badge variant="secondary" className="text-xs">{presConfig.defaultBenefits.length} benefícios padrão</Badge>
              <Badge variant="secondary" className="text-xs">{presConfig.references.length} referências</Badge>
            </div>
          </div>
        )}

        <div className="border-t p-6">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Objetivos</h3>
          <ul className="space-y-2">
            {selectedOpp.objectives.map((obj, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {obj}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <GenerateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        opportunity={selectedOpp}
        onGenerate={handleGenerate}
      />
    </div>
  );
}

function InfoBlock({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}
