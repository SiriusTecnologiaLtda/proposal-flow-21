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

  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(var(--hero-from))] via-[hsl(var(--hero-via))] to-[hsl(var(--hero-to))] px-8 py-16 text-center text-primary-foreground">
      {/* Glow */}
      <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-primary-foreground/5 blur-3xl" />
      <div className="absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-primary-foreground/5 blur-2xl" />

      <div className="relative z-10 mx-auto max-w-2xl space-y-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground/40">
          Próximos Passos
        </p>
        <h2 className="text-3xl font-bold tracking-tight text-primary-foreground">
          Vamos começar?
        </h2>

        {editable ? (
          <textarea
            className="w-full resize-none rounded-md border border-primary-foreground/20 bg-primary-foreground/10 px-4 py-3 text-center text-primary-foreground outline-none placeholder:text-primary-foreground/40"
            rows={2}
            value={nextStep}
            onChange={(e) => onEdit?.("nextStep", e.target.value)}
          />
        ) : (
          <p className="text-lg leading-relaxed text-primary-foreground/70">{nextStep}</p>
        )}

        <Button
          size="lg"
          className="gap-2 bg-primary-foreground text-foreground hover:bg-primary-foreground/90"
        >
          {cta} <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}
