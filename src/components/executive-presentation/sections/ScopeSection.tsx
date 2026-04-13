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

  const detailLevel = config?.detailLevel ?? "resumido";
  const maxGroups = detailLevel === "executivo" ? 2 : detailLevel === "resumido" ? 5 : 999;
  const showItems = detailLevel === "detalhado";
  const showBenefits = detailLevel === "detalhado";

  const rawGroups = data.linkedProject?.scopeGroups ?? [];
  const visibleGroups = rawGroups.slice(0, maxGroups);

  return (
    <section className="space-y-8">
      {/* Section header */}
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Layers className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Escopo da Solução</h2>
          <p className="text-sm text-muted-foreground">Frentes de trabalho e seus objetivos estratégicos</p>
        </div>
      </div>

      {/* Source indicator */}
      {hasProjectScope && (
        <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
          <FolderKanban className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">
              Baseado no Projeto Vinculado — {data.linkedProject!.description}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {data.linkedProject!.scopeGroups.length} frentes · {data.linkedProject!.totalHours}h estimadas
            </p>
          </div>
        </div>
      )}

      {/* Scope blocks */}
      <div className="grid gap-4 md:grid-cols-2">
        {visibleBlocks.map((block, i) => {
          const Icon = iconMap[block.icon] || Settings;
          return (
            <div
              key={block.id}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all duration-200 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
            >
              {/* Left accent bar */}
              <div className="absolute left-0 top-0 h-full w-1 bg-primary/50 transition-all duration-200 group-hover:w-1.5 group-hover:bg-primary" />

              {/* Background number */}
              <span className="pointer-events-none absolute right-4 top-2 select-none text-6xl font-black text-muted/10">
                {String(i + 1).padStart(2, "0")}
              </span>

              <div className="relative flex items-start gap-4 pl-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-foreground">{block.title}</h3>
                      {block.volumeSummary && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">{block.volumeSummary}</Badge>
                      )}
                    </div>
                    {detailLevel !== "executivo" && (
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{block.description}</p>
                    )}
                  </div>

                  {/* Expected impact */}
                  {block.expectedImpact && (
                    <div className="flex items-start gap-2 rounded-xl bg-primary/5 px-3 py-2">
                      <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <p className="text-xs leading-relaxed text-foreground/80">{block.expectedImpact}</p>
                    </div>
                  )}

                  {/* Benefits */}
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

                  {/* Deliverables */}
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

      {/* Premises & out of scope */}
      {detailLevel === "detalhado" && data.templateContext && (data.templateContext.premises.length > 0 || data.templateContext.outOfScope.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {data.templateContext.premises.length > 0 && (
            <div className="space-y-3 rounded-2xl border border-border bg-card p-6">
              <h3 className="text-sm font-semibold text-foreground">Premissas</h3>
              <ul className="space-y-1.5">
                {data.templateContext.premises.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.templateContext.outOfScope.length > 0 && (
            <div className="space-y-3 rounded-2xl border border-border bg-card p-6">
              <h3 className="text-sm font-semibold text-foreground">Fora do Escopo</h3>
              <ul className="space-y-1.5">
                {data.templateContext.outOfScope.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive/50" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Methodology */}
      {detailLevel === "detalhado" && data.templateContext?.methodology && (
        <div className="space-y-2 rounded-2xl border border-border bg-muted/30 p-6">
          <h3 className="text-sm font-semibold text-foreground">Metodologia</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{data.templateContext.methodology}</p>
        </div>
      )}
    </section>
  );
}
