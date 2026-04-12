import { type OpportunityData, type PresentationConfig } from "@/data/executivePresentationData";
import {
  TrendingDown, Eye, ShieldCheck, Rocket, Heart, Award, Brain, Shield,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  TrendingDown, Eye, ShieldCheck, Rocket, Heart, Award, Brain, Shield,
};

interface Props {
  data: OpportunityData;
  config?: PresentationConfig;
}

export default function BenefitsSection({ data, config }: Props) {
  const isModern = !config?.templateStyle || config.templateStyle === "modern";
  const isMinimal = config?.templateStyle === "minimal";

  // detailLevel filtering
  const detailLevel = config?.detailLevel ?? "detalhado";
  const maxBenefits = detailLevel === "executivo" ? 2 : detailLevel === "resumido" ? 3 : 999;
  const showDescription = detailLevel !== "executivo";

  const visibleBenefits = data.benefits.slice(0, maxBenefits);

  const cardClass = isModern
    ? "flex items-start gap-4 rounded-xl border bg-card p-5 shadow-sm"
    : isMinimal
      ? "flex items-start gap-4 py-4 border-b border-border/30 last:border-b-0"
      : "flex items-start gap-4 rounded-xl border bg-card p-5";

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-foreground">Benefícios Esperados</h2>
        <p className="text-muted-foreground">Impactos estratégicos e operacionais para o seu negócio</p>
      </div>

      <div className={`grid gap-4 ${isMinimal ? "grid-cols-1" : "sm:grid-cols-2"}`}>
        {visibleBenefits.map((b) => {
          const Icon = iconMap[b.icon] || Rocket;
          return (
            <div key={b.id} className={cardClass}>
              {!isMinimal && (
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${isModern ? "bg-success/10" : "bg-muted"}`}>
                  <Icon className={`h-5 w-5 ${isModern ? "text-success" : "text-muted-foreground"}`} />
                </div>
              )}
              <div>
                <h4 className="font-semibold text-foreground">{b.title}</h4>
                {showDescription && (
                  <p className="mt-1 text-sm text-muted-foreground">{b.description}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
