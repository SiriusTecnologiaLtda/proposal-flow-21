import { type OpportunityData, type PresentationConfig } from "@/data/executivePresentationData";
import { Calendar } from "lucide-react";

interface Props {
  data: OpportunityData;
  config?: PresentationConfig;
  editable?: boolean;
  overrides?: Record<string, string>;
  onEdit?: (field: string, value: string) => void;
}

export default function CoverSection({ data, config, editable, overrides, onEdit }: Props) {
  const title = overrides?.title ?? `Proposta de Investimento — ${data.opportunityTypeLabel}`;
  const subtitle = overrides?.subtitle ?? data.mainPain;

  const isModern = !config?.templateStyle || config.templateStyle === "modern";
  const isClassic = config?.templateStyle === "corporate";
  const isMinimal = config?.templateStyle === "minimal";

  return (
    <section
      className={`relative overflow-hidden px-8 py-16 text-primary-foreground md:px-16 md:py-24 ${
        isModern
          ? "rounded-xl bg-gradient-to-br from-[hsl(var(--hero-from))] via-[hsl(var(--hero-via))] to-[hsl(var(--hero-to))]"
          : isClassic
            ? "rounded-xl border border-border bg-card text-foreground shadow-sm"
            : "bg-transparent text-foreground"
      }`}
    >
      {/* Decorative elements — modern only */}
      {isModern && (
        <>
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary-foreground/5" />
          <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-primary-foreground/5" />
        </>
      )}

      <div className="relative z-10 max-w-3xl space-y-6">
        <p
          className={`text-sm font-medium uppercase tracking-widest ${
            isModern ? "text-primary-foreground/70" : "text-muted-foreground"
          }`}
        >
          Apresentação Executiva
        </p>

        {editable ? (
          <input
            className="block w-full bg-transparent text-3xl font-bold leading-tight outline-none placeholder:text-primary-foreground/40 md:text-4xl lg:text-5xl"
            value={title}
            onChange={(e) => onEdit?.("title", e.target.value)}
          />
        ) : (
          <h1 className={`text-3xl font-bold leading-tight md:text-4xl lg:text-5xl ${!isModern ? "text-foreground" : ""}`}>
            {title}
          </h1>
        )}

        {editable ? (
          <textarea
            className="block w-full resize-none bg-transparent text-lg leading-relaxed text-primary-foreground/80 outline-none placeholder:text-primary-foreground/40 md:text-xl"
            rows={2}
            value={subtitle}
            onChange={(e) => onEdit?.("subtitle", e.target.value)}
          />
        ) : (
          <p className={`text-lg leading-relaxed md:text-xl ${isModern ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
            {subtitle}
          </p>
        )}

        <div className={`flex flex-wrap items-center gap-6 pt-4 text-sm ${isModern ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
          <span className={`font-semibold ${isModern ? "text-primary-foreground" : "text-foreground"}`}>{data.company}</span>
          <span className="hidden sm:inline">•</span>
          <span>{data.contact} — {data.contactRole}</span>
          <span className="hidden sm:inline">•</span>
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            {new Date(data.createdAt).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </span>
        </div>
      </div>
    </section>
  );
}
