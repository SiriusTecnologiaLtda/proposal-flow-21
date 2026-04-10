import { type OpportunityData } from "@/data/executivePresentationData";
import { Lightbulb } from "lucide-react";

interface Props {
  data: OpportunityData;
  editable?: boolean;
  overrides?: Record<string, string>;
  onEdit?: (field: string, value: string) => void;
}

export default function SolutionSection({ data, editable, overrides, onEdit }: Props) {
  const summary = overrides?.solutionSummary ?? data.solutionSummary;
  const how = overrides?.solutionHow ?? data.solutionHow;

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-foreground">Visão da Solução</h2>
        <p className="text-muted-foreground">Como endereçamos os desafios identificados</p>
      </div>

      <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-transparent p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Lightbulb className="h-6 w-6 text-primary" />
          </div>
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
          </div>
        </div>
      </div>
    </section>
  );
}
