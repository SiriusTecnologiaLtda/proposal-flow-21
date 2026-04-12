import { type OpportunityData, type PresentationConfig } from "@/data/executivePresentationData";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  data: OpportunityData;
  config?: PresentationConfig;
  editable?: boolean;
  overrides?: Record<string, string>;
  onEdit?: (field: string, value: string) => void;
}

export default function NextStepsSection({ data, config, editable, overrides, onEdit }: Props) {
  const nextStep = overrides?.nextStep ?? data.nextStep;
  const cta = overrides?.nextStepCta ?? data.nextStepCta;

  const isModern = !config?.templateStyle || config.templateStyle === "modern";
  const isMinimal = config?.templateStyle === "minimal";

  return (
    <section
      className={`px-8 py-12 text-center ${
        isModern
          ? "rounded-xl bg-gradient-to-br from-[hsl(var(--hero-from))] via-[hsl(var(--hero-via))] to-[hsl(var(--hero-to))] text-primary-foreground"
          : isMinimal
            ? "text-foreground"
            : "rounded-xl border bg-card text-foreground"
      }`}
    >
      <div className="mx-auto max-w-2xl space-y-6">
        <h2 className="text-2xl font-bold">Próximos Passos</h2>

        {editable ? (
          <textarea
            className="w-full resize-none rounded-md border border-primary-foreground/20 bg-primary-foreground/10 px-4 py-3 text-center text-primary-foreground outline-none placeholder:text-primary-foreground/40"
            rows={2}
            value={nextStep}
            onChange={(e) => onEdit?.("nextStep", e.target.value)}
          />
        ) : (
          <p className={`text-lg leading-relaxed ${isModern ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
            {nextStep}
          </p>
        )}

        <Button
          size="lg"
          className={`gap-2 ${
            isModern
              ? "bg-primary-foreground text-foreground hover:bg-primary-foreground/90"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          }`}
        >
          {cta} <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}
