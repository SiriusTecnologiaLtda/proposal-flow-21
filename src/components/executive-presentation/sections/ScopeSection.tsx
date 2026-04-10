import { type OpportunityData } from "@/data/executivePresentationData";
import {
  Settings, DollarSign, BarChart3, GraduationCap, Search, PenTool,
  CheckCircle, Layers, Route, Link, Brain, Heart, Award, Shield,
  Rocket, Eye, TrendingDown, ShieldCheck,
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
  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-foreground">Escopo da Solução</h2>
        <p className="text-muted-foreground">O que será entregue em cada frente de trabalho</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {data.scopeBlocks.map((block, i) => {
          const Icon = iconMap[block.icon] || Settings;
          return (
            <div
              key={block.id}
              className="group relative overflow-hidden rounded-xl border bg-card p-6 shadow-sm transition-all hover:shadow-md"
            >
              {/* Accent bar */}
              <div className="absolute left-0 top-0 h-full w-1 bg-primary/60 transition-all group-hover:w-1.5 group-hover:bg-primary" />

              <div className="flex items-start gap-4 pl-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {data.opportunityTypeSlug === "projeto_sob_medida" ? `Fase ${i + 1}` : `Módulo ${i + 1}`}
                    </span>
                    <h3 className="text-lg font-semibold text-foreground">{block.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{block.description}</p>
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
    </section>
  );
}
