import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Building2, User, Target, Calendar, DollarSign, Sparkles, ArrowLeft, Settings2,
} from "lucide-react";
import { mockOpportunities, formatCurrency, type PresentationConfig, getTypeForOpportunity } from "@/data/executivePresentationData";
import GenerateDialog from "@/components/executive-presentation/GenerateDialog";

export default function OpportunityDetailPage() {
  const navigate = useNavigate();
  const [selectedOpp, setSelectedOpp] = useState(mockOpportunities[0]);
  const [dialogOpen, setDialogOpen] = useState(false);

  const typeRef = getTypeForOpportunity(selectedOpp);

  const stageColors: Record<string, string> = {
    Proposta: "bg-primary/10 text-primary border-primary/20",
    Qualificação: "bg-warning/10 text-warning border-warning/20",
    Negociação: "bg-success/10 text-success border-success/20",
  };

  const handleGenerate = (config: PresentationConfig) => {
    setDialogOpen(false);
    navigate(`/apresentacao-executiva/${selectedOpp.id}`, { state: { config } });
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
          <Button
            variant="ghost"
            size="sm"
            className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 gap-1.5"
            onClick={() => navigate("/tipos-oportunidade-apresentacao")}
          >
            <Settings2 className="h-4 w-4" /> Gerenciar Tipos
          </Button>
        </div>
      </div>

      {/* Opportunity selector */}
      <div className="grid gap-4 md:grid-cols-3">
        {mockOpportunities.map((opp) => (
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

        {/* Type reference info */}
        {typeRef && (
          <div className="border-t p-6">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Conteúdo-base do tipo: {typeRef.name}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Posicionamento</p>
                <p className="text-sm text-foreground line-clamp-3">{typeRef.positioningText}</p>
              </div>
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Abordagem</p>
                <p className="text-sm text-foreground line-clamp-3">{typeRef.solutionApproach}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-3 flex-wrap">
              <Badge variant="secondary" className="text-xs">{typeRef.defaultScopeBlocks.length} blocos de escopo padrão</Badge>
              <Badge variant="secondary" className="text-xs">{typeRef.defaultBenefits.length} benefícios padrão</Badge>
              <Badge variant="secondary" className="text-xs">{typeRef.references.length} referências</Badge>
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
