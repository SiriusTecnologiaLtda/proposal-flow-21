import { type OpportunityData, type PresentationConfig } from "@/data/executivePresentationData";
import { Star } from "lucide-react";

interface Props {
  data: OpportunityData;
  config?: PresentationConfig;
}

export default function DifferentiatorsSection({ data, config }: Props) {
  const isModern = !config?.templateStyle || config.templateStyle === "modern";
  const isMinimal = config?.templateStyle === "minimal";

  const cardClass = isModern
    ? "relative overflow-hidden rounded-xl border bg-card p-6 shadow-sm"
    : isMinimal
      ? "relative py-4 border-b border-border/30 last:border-b-0"
      : "relative overflow-hidden rounded-xl border bg-card p-6";

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-foreground">Nossos Diferenciais</h2>
        <p className="text-muted-foreground">Por que somos o parceiro ideal para este desafio</p>
      </div>

      <div className={`grid gap-4 ${isMinimal ? "grid-cols-1" : "md:grid-cols-3"}`}>
        {data.differentiators.map((d, i) => (
          <div key={d.id} className={cardClass}>
            {!isMinimal && (
              <div className="absolute right-4 top-4 text-3xl font-bold text-muted/50">
                {String(i + 1).padStart(2, "0")}
              </div>
            )}
            <div className="space-y-3">
              {!isMinimal && (
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${isModern ? "bg-warning/10" : "bg-muted"}`}>
                  <Star className={`h-4 w-4 ${isModern ? "text-warning" : "text-muted-foreground"}`} />
                </div>
              )}
              <h4 className="font-semibold text-foreground">{d.title}</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{d.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
