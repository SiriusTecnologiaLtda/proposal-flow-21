import { type OpportunityData, type PresentationConfig } from "@/data/executivePresentationData";

interface Props {
  data: OpportunityData;
  config?: PresentationConfig;
}

export default function TimelineSection({ data, config }: Props) {
  const isModern = !config?.templateStyle || config.templateStyle === "modern";
  const isMinimal = config?.templateStyle === "minimal";

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-foreground">Cronograma Macro</h2>
        <p className="text-muted-foreground">Visão geral das fases de execução</p>
      </div>

      {/* Desktop timeline */}
      {!isMinimal && (
        <div className="hidden md:block">
          <div className="relative">
            {/* Connecting line */}
            <div className="absolute left-0 right-0 top-8 h-0.5 bg-border" />

            <div className="relative grid" style={{ gridTemplateColumns: `repeat(${data.timeline.length}, 1fr)` }}>
              {data.timeline.map((phase) => (
                <div key={phase.id} className="flex flex-col items-center text-center px-2">
                  <div className={`relative z-10 flex h-16 w-16 items-center justify-center rounded-full border-2 text-lg font-bold shadow-sm ${
                    isModern
                      ? "border-primary bg-card text-primary"
                      : "border-border bg-card text-foreground"
                  }`}>
                    {phase.phase}
                  </div>
                  <div className="mt-4 space-y-1">
                    <h4 className="font-semibold text-foreground text-sm">{phase.title}</h4>
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      isModern ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}>
                      {phase.duration}
                    </span>
                    <p className="text-xs text-muted-foreground leading-relaxed">{phase.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mobile / minimal timeline */}
      <div className={`space-y-4 ${!isMinimal ? "md:hidden" : ""}`}>
        {data.timeline.map((phase) => (
          <div key={phase.id} className={`flex gap-4 ${isMinimal ? "py-3 border-b border-border/30 last:border-b-0" : "rounded-xl border bg-card p-4 shadow-sm"}`}>
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
              isModern
                ? "bg-primary text-primary-foreground"
                : isMinimal
                  ? "bg-muted text-foreground"
                  : "bg-primary text-primary-foreground"
            }`}>
              {phase.phase}
            </div>
            <div>
              <h4 className="font-semibold text-foreground">{phase.title}</h4>
              <span className="text-xs font-medium text-primary">{phase.duration}</span>
              <p className="mt-1 text-xs text-muted-foreground">{phase.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
