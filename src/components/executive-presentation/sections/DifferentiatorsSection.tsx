import { type OpportunityData, type PresentationConfig } from "@/data/executivePresentationData";
import { Star } from "lucide-react";

interface Props {
  data: OpportunityData;
  config?: PresentationConfig;
}

export default function DifferentiatorsSection({ data, config }: Props) {
  return (
    <section className="space-y-8">
      {/* Section header */}
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Star className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Nossos Diferenciais</h2>
          <p className="text-sm text-muted-foreground">Por que somos o parceiro ideal para este desafio</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {data.differentiators.map((d, i) => (
          <div
            key={d.id}
            className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all duration-200 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
          >
            {/* Background number */}
            <span className="pointer-events-none absolute right-4 top-2 select-none text-7xl font-black text-muted/10">
              {String(i + 1).padStart(2, "0")}
            </span>

            <div className="relative space-y-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                <Star className="h-4 w-4 text-primary" />
              </div>
              <h4 className="font-semibold text-foreground">{d.title}</h4>
              <p className="text-sm leading-relaxed text-muted-foreground">{d.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
