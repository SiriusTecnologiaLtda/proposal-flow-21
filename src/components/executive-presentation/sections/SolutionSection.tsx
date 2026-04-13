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

  return (
    <section className="space-y-8">
      {/* Section header */}
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Lightbulb className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Visão da Solução</h2>
          <p className="text-sm text-muted-foreground">Como endereçamos os desafios identificados</p>
        </div>
      </div>

      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-primary/[0.03] to-transparent p-8 md:p-10">
        {/* Eyebrow */}
        <div className="mb-6 flex items-center gap-2">
          <div className="h-px flex-1 bg-gradient-to-r from-primary/40 to-transparent" />
          <span className="text-xs font-semibold uppercase tracking-widest text-primary">Nossa Abordagem</span>
          <div className="h-px flex-1 bg-gradient-to-l from-primary/40 to-transparent" />
        </div>

        {editable ? (
          <>
            <input
              className="mb-3 w-full bg-transparent text-2xl font-bold tracking-tight text-foreground outline-none md:text-3xl"
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
            <h3 className="mb-3 text-2xl font-bold tracking-tight text-foreground md:text-3xl">{summary}</h3>
            <p className="mb-6 text-base leading-relaxed text-muted-foreground">{how}</p>
          </>
        )}

        {/* Objectives — pill grid */}
        {data.objectives.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-border/50 pt-4">
            {data.objectives.map((obj, i) => (
              <span
                key={i}
                className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary"
              >
                {obj}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Methodology */}
      {methodology && !editable && (
        <div className="flex items-start gap-4 rounded-2xl border border-border bg-card p-6 transition-all duration-200 hover:shadow-sm">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <BookOpen className="h-4 w-4 text-primary" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-foreground">Abordagem Metodológica</h4>
            <p className="text-sm leading-relaxed text-muted-foreground">{methodology}</p>
          </div>
        </div>
      )}
    </section>
  );
}
