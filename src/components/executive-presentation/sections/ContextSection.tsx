import { type OpportunityData, type PresentationConfig } from "@/data/executivePresentationData";
import { AlertTriangle, TrendingUp, Clock } from "lucide-react";

interface Props {
  data: OpportunityData;
  config?: PresentationConfig;
  editable?: boolean;
  overrides?: Record<string, string>;
  onEdit?: (field: string, value: string) => void;
}

const cards = [
  { key: "currentScenario", label: "Cenário Atual", num: "01", icon: AlertTriangle, dataKey: "currentScenario" as const },
  { key: "mainPain", label: "Desafio Principal", num: "02", icon: TrendingUp, dataKey: "mainPain" as const },
  { key: "whyActNow", label: "Por que agir agora", num: "03", icon: Clock, dataKey: "whyActNow" as const },
];

export default function ContextSection({ data, config, editable, overrides, onEdit }: Props) {
  const field = (key: string, fallback: string) => overrides?.[key] ?? fallback;

  return (
    <section className="space-y-8">
      {/* Section header */}
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <AlertTriangle className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Contexto & Oportunidade</h2>
          <p className="text-sm text-muted-foreground">Entendendo o cenário e a urgência de agir</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => {
          const value = field(card.key, data[card.dataKey]);
          const Icon = card.icon;
          return (
            <div
              key={card.key}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all duration-200 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
            >
              {/* Background number */}
              <span className="pointer-events-none absolute right-4 top-2 select-none text-7xl font-black text-muted/20">
                {card.num}
              </span>

              <div className="relative space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-1 w-6 rounded-full bg-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                    {card.label}
                  </span>
                </div>

                {editable ? (
                  <textarea
                    className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    rows={3}
                    value={value}
                    onChange={(e) => onEdit?.(card.key, e.target.value)}
                  />
                ) : (
                  <p className="text-sm leading-relaxed text-foreground/80">{value}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
