import { type OpportunityData, type PresentationConfig } from "@/data/executivePresentationData";
import {
  TrendingDown, Eye, ShieldCheck, Rocket, Heart, Award, Brain, Shield, Zap,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  TrendingDown, Eye, ShieldCheck, Rocket, Heart, Award, Brain, Shield,
};

interface Props {
  data: OpportunityData;
  config?: PresentationConfig;
}

export default function BenefitsSection({ data, config }: Props) {
  const detailLevel = config?.detailLevel ?? "resumido";
  const maxBenefits = detailLevel === "executivo" ? 2 : detailLevel === "resumido" ? 3 : 999;
  const showDescription = detailLevel !== "executivo";

  const visibleBenefits = data.benefits.slice(0, maxBenefits);

  return (
    <section className="space-y-8">
      {/* Section header */}
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Zap className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Benefícios Esperados</h2>
          <p className="text-sm text-muted-foreground">Impactos estratégicos e operacionais para o seu negócio</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {visibleBenefits.map((b, i) => {
          const Icon = iconMap[b.icon] || Rocket;
          return (
            <div
              key={b.id}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all duration-200 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
            >
              {/* Background number */}
              <span className="pointer-events-none absolute right-4 top-2 select-none text-6xl font-black text-muted/10">
                {String(i + 1).padStart(2, "0")}
              </span>

              <div className="relative flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">{b.title}</h4>
                  {showDescription && (
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{b.description}</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
