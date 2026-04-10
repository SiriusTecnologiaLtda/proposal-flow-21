import { type OpportunityData } from "@/data/executivePresentationData";
import { Badge } from "@/components/ui/badge";
import {
  Settings, DollarSign, BarChart3, GraduationCap, Search, PenTool,
  CheckCircle, Layers, Route, Link, Brain, Heart, Award, Shield,
  Rocket, Eye, TrendingDown, ShieldCheck, FolderKanban,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  Settings, DollarSign, BarChart3, GraduationCap, Search, PenTool,
  CheckCircle, Layers, Route, Link, Brain, Heart, Award, Shield,
  Rocket, Eye, TrendingDown, ShieldCheck,
};

interface Props {
  data: OpportunityData;
}

export default function ScopeSection({ data }: Props) {
  const hasProjectScope = !!data.linkedProject && data.linkedProject.scopeGroups.length > 0;

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-foreground">Escopo da Solução</h2>
        <p className="text-muted-foreground">O que será entregue em cada frente de trabalho</p>
      </div>

      {/* Source indicator */}
      {hasProjectScope && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
          <FolderKanban className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground truncate">
              Fonte: Projeto Vinculado — {data.linkedProject!.description}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {data.linkedProject!.totalItems} itens · {data.linkedProject!.totalHours}h · {data.linkedProject!.status}
            </p>
          </div>
        </div>
      )}

      {/* Scope blocks — rendered from project groups or fallback blocks */}
      <div className="grid gap-5 md:grid-cols-2">
        {data.scopeBlocks.map((block, i) => {
          const Icon = iconMap[block.icon] || Settings;
          return (
            <div
              key={block.id}
              className="group relative overflow-hidden rounded-xl border bg-card p-6 shadow-sm transition-all hover:shadow-md"
            >
              <div className="absolute left-0 top-0 h-full w-1 bg-primary/60 transition-all group-hover:w-1.5 group-hover:bg-primary" />

              <div className="flex items-start gap-4 pl-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-foreground">{block.title}</h3>
                      {hasProjectScope && (
                        <Badge variant="outline" className="text-[9px] shrink-0">Projeto</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{block.description}</p>
                  </div>
                  <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {block.items.map((item) => (
                      <li key={item} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Template context: premises & out of scope */}
      {data.templateContext && (
        <div className="grid gap-4 md:grid-cols-2">
          {data.templateContext.premises.length > 0 && (
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Premissas</h3>
              <ul className="space-y-1.5">
                {data.templateContext.premises.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <CheckCircle className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-muted-foreground italic">Fonte: Template de proposta do tipo</p>
            </div>
          )}
          {data.templateContext.outOfScope.length > 0 && (
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Fora do Escopo</h3>
              <ul className="space-y-1.5">
                {data.templateContext.outOfScope.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <div className="h-1.5 w-1.5 mt-1.5 shrink-0 rounded-full bg-destructive/50" />
                    {p}
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-muted-foreground italic">Fonte: Template de proposta do tipo</p>
            </div>
          )}
        </div>
      )}

      {/* Methodology from template */}
      {data.templateContext?.methodology && (
        <div className="rounded-xl border bg-muted/30 p-5 space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Metodologia</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{data.templateContext.methodology}</p>
          <p className="text-[10px] text-muted-foreground italic">Fonte: Template de proposta do tipo</p>
        </div>
      )}
    </section>
  );
}
