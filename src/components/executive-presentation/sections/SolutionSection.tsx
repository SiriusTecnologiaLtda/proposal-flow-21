import { type OpportunityData, type PresentationConfig } from "@/data/executivePresentationData";
import { Lightbulb, BookOpen } from "lucide-react";

interface Props {
  data: OpportunityData;
  config?: PresentationConfig;
  editable?: boolean;
  overrides?: Record<string, string>;
  onEdit?: (field: string, value: string) => void;
}

export default function SolutionSection({ data, config, editable, overrides, onEdit }: Props) {
  const summary = overrides?.solutionSummary ?? data.solutionSummary;
  const how = overrides?.solutionHow ?? data.solutionHow;
  const methodology = data.templateContext?.methodology;

  const isModern = !config?.templateStyle || config.templateStyle === "modern";
  const isMinimal = config?.templateStyle === "minimal";

  const containerClass = isModern
    ? "rounded-xl border bg-gradient-to-br from-primary/5 to-transparent p-8"
    : isMinimal
      ? "py-6"
      : "rounded-xl border bg-card p-8";

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-foreground">Visão da Solução</h2>
        <p className="text-muted-foreground">Como endereçamos os desafios identificados</p>
      </div>

      <div className={containerClass}>
        <div className="flex items-start gap-4">
          {!isMinimal && (
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${isModern ? "bg-primary/10" : "bg-muted"}`}>
              <Lightbulb className={`h-6 w-6 ${isModern ? "text-primary" : "text-muted-foreground"}`} />
            </div>
          )}
          <div className="space-y-4 flex-1">
            {editable ? (
              <>
                <input
                  className="w-full bg-transparent text-xl font-semibold text-foreground outline-none"
                  value={summary}
                  onChange={(e) => onEdit?.("solutionSummary", e.target.value)}
                />
                <textarea
                  className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground outline-none focus:ring-2 focus:ring-ring"
                  rows={3}
                  value={how}
                  onChange={(e) => onEdit?.("solutionHow", e.target.value)}
                />
              </>
            ) : (
              <>
                <h3 className="text-xl font-semibold text-foreground">{summary}</h3>
                <p className="text-muted-foreground leading-relaxed">{how}</p>
              </>
            )}

            {/* Objectives from opportunity */}
            {data.objectives.length > 0 && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50">
                {data.objectives.map((obj, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="h-1.5 w-1.5 mt-1.5 shrink-0 rounded-full bg-primary" />
                    <p className="text-xs text-muted-foreground">{obj}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Methodology from template — integrated into the solution narrative */}
      {methodology && !editable && (
        <div className={`flex items-start gap-3 ${isMinimal ? "py-3" : "rounded-xl border bg-card p-5"}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-foreground">Abordagem Metodológica</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">{methodology}</p>
          </div>
        </div>
      )}
    </section>
  );
}
