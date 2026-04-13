import { type OpportunityData, type PresentationConfig } from "@/data/executivePresentationData";
import { Clock } from "lucide-react";

interface Props {
  data: OpportunityData;
  config?: PresentationConfig;
}

export default function TimelineSection({ data, config }: Props) {
  return (
    <section className="space-y-8">
      {/* Section header */}
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Clock className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Cronograma Macro</h2>
          <p className="text-sm text-muted-foreground">Visão geral das fases de execução</p>
        </div>
      </div>

      {/* Desktop timeline */}
      <div className="hidden md:block">
        <div className="relative">
          {/* Connecting line */}
          <div className="absolute left-0 right-0 top-8 h-0.5 bg-gradient-to-r from-primary/40 via-primary/20 to-primary/40" />

          <div className="relative grid" style={{ gridTemplateColumns: `repeat(${data.timeline.length}, 1fr)` }}>
            {data.timeline.map((phase) => (
              <div key={phase.id} className="flex flex-col items-center px-2 text-center">
                <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary bg-card text-lg font-bold text-primary shadow-sm transition-all duration-200 hover:shadow-lg hover:shadow-primary/10">
                  {phase.phase}
                </div>
                <div className="mt-4 space-y-1.5">
                  <h4 className="text-sm font-semibold text-foreground">{phase.title}</h4>
                  <span className="inline-block rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary">
                    {phase.duration}
                  </span>
                  <p className="text-xs leading-relaxed text-muted-foreground">{phase.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile timeline */}
      <div className="space-y-3 md:hidden">
        {data.timeline.map((phase, i) => (
          <div
            key={phase.id}
            className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 transition-all duration-200 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
          >
            <span className="pointer-events-none absolute right-4 top-2 select-none text-6xl font-black text-muted/10">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="relative flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {phase.phase}
              </div>
              <div>
                <h4 className="font-semibold text-foreground">{phase.title}</h4>
                <span className="text-xs font-medium text-primary">{phase.duration}</span>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{phase.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
