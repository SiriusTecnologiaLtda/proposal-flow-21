import { type OpportunityData, type PresentationConfig } from "@/data/executivePresentationData";
import { Badge } from "@/components/ui/badge";
import {
  Settings, DollarSign, BarChart3, GraduationCap, Search, PenTool,
  CheckCircle, CheckCircle2, Layers, Route, Link, Brain, Heart, Award, Shield,
  Rocket, Eye, TrendingDown, ShieldCheck, FolderKanban, Target,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  Settings, DollarSign, BarChart3, GraduationCap, Search, PenTool,
  CheckCircle, Layers, Route, Link, Brain, Heart, Award, Shield,
  Rocket, Eye, TrendingDown, ShieldCheck, Target,
};

interface Props {
  data: OpportunityData;
  config?: PresentationConfig;
}

export default function ScopeSection({ data, config }: Props) {
  const hasProjectScope = !!data.linkedProject && data.linkedProject.scopeGroups.length > 0;

  const isModern = !config?.templateStyle || config.templateStyle === "modern";
  const isMinimal = config?.templateStyle === "minimal";

  // detailLevel filtering
  const detailLevel = config?.detailLevel ?? "resumido";
  const maxGroups = detailLevel === "executivo" ? 2 : detailLevel === "resumido" ? 5 : 999;
  const showItems = detailLevel === "detalhado";
  const showBenefits = detailLevel === "detalhado";

  const visibleBlocks = data.scopeBlocks.slice(0, maxGroups);

  const cardClass = isModern
    ? "group relative overflow-hidden rounded-xl border bg-card p-6 shadow-sm transition-all hover:shadow-md"
    : isMinimal
      ? "group relative py-5 border-b border-border/30 last:border-b-0"
      : "group relative overflow-hidden rounded-xl border bg-card p-6";

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-foreground">Escopo da Solução</h2>
        <p className="text-muted-foreground">Frentes de trabalho e seus objetivos estratégicos</p>
      </div>

      {/* Source indicator */}
      {hasProjectScope && !isMinimal && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${isModern ? "border border-primary/20 bg-primary/5" : "border bg-muted/30"}`}>
          <FolderKanban className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground truncate">
              Baseado no Projeto Vinculado — {data.linkedProject!.description}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {data.linkedProject!.scopeGroups.length} frentes · {data.linkedProject!.totalHours}h estimadas
            </p>
          </div>
        </div>
      )}

      {/* Scope blocks — executive rendering */}
      <div className={`grid gap-5 ${isMinimal ? "grid-cols-1" : "md:grid-cols-2"}`}>
        {visibleBlocks.map((block) => {
          const Icon = iconMap[block.icon] || Settings;
          const hasExecutiveFields = block.executiveObjective || block.expectedImpact;
          return (
            <div key={block.id} className={cardClass}>
              {!isMinimal && (
                <div className="absolute left-0 top-0 h-full w-1 bg-primary/60 transition-all group-hover:w-1.5 group-hover:bg-primary" />
              )}

              <div className={`flex items-start gap-4 ${!isMinimal ? "pl-3" : ""}`}>
                {!isMinimal && (
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-primary ${isModern ? "bg-primary/10" : "bg-muted"}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                )}
                <div className="flex-1 space-y-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-semibold text-foreground">{block.title}</h3>
                      {block.volumeSummary && !isMinimal && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">{block.volumeSummary}</Badge>
                      )}
                    </div>
                    {detailLevel !== "executivo" && (
                      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{block.description}</p>
                    )}
                  </div>

                  {/* Expected impact — executive framing */}
                  {hasExecutiveFields && block.expectedImpact && (
                    <div className={`flex items-start gap-2 rounded-lg px-3 py-2 ${isModern ? "bg-primary/5" : "bg-muted/30"}`}>
                      <Target className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                      <p className="text-xs text-foreground/80 leading-relaxed">{block.expectedImpact}</p>
                    </div>
                  )}

                  {/* Template knowledge benefits */}
                  {showBenefits && block.templateKnowledge?.executive_benefits &&
                    block.templateKnowledge.executive_benefits.length >= 3 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Benefícios desta frente</p>
                      <ul className="space-y-1">
                        {block.templateKnowledge.executive_benefits.slice(0, 4).map((benefit, bi) => (
                          <li key={bi} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CheckCircle2 className="h-3 w-3 shrink-0 text-primary" />
                            {benefit}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Key deliverables — concise list */}
                  {showItems && block.items.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Principais entregáveis</p>
                      <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                        {block.items.map((item) => (
                          <li key={item} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Template context: premises & out of scope */}
      {detailLevel === "detalhado" && data.templateContext && (data.templateContext.premises.length > 0 || data.templateContext.outOfScope.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {data.templateContext.premises.length > 0 && (
            <div className={`space-y-3 ${isMinimal ? "py-4" : "rounded-xl border bg-card p-5"}`}>
              <h3 className="text-sm font-semibold text-foreground">Premissas</h3>
              <ul className="space-y-1.5">
                {data.templateContext.premises.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <CheckCircle className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.templateContext.outOfScope.length > 0 && (
            <div className={`space-y-3 ${isMinimal ? "py-4" : "rounded-xl border bg-card p-5"}`}>
              <h3 className="text-sm font-semibold text-foreground">Fora do Escopo</h3>
              <ul className="space-y-1.5">
                {data.templateContext.outOfScope.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <div className="h-1.5 w-1.5 mt-1.5 shrink-0 rounded-full bg-destructive/50" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Methodology from template */}
      {detailLevel === "detalhado" && data.templateContext?.methodology && (
        <div className={`space-y-2 ${isMinimal ? "py-4" : "rounded-xl border bg-muted/30 p-5"}`}>
          <h3 className="text-sm font-semibold text-foreground">Metodologia</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{data.templateContext.methodology}</p>
        </div>
      )}
    </section>
  );
}
