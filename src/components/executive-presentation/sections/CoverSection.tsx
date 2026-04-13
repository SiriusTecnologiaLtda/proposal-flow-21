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

  return (
    <section
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(var(--hero-from))] via-[hsl(var(--hero-via))] to-[hsl(var(--hero-to))] px-10 py-20 text-primary-foreground md:px-20 md:py-32"
    >
      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Glow effects */}
      <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-primary-foreground/10 blur-3xl" />
      <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-primary-foreground/5 blur-2xl" />

      <div className="relative z-10 max-w-4xl space-y-8">
        {/* Eyebrow */}
        <div className="flex items-center gap-3">
          <div className="h-px w-8 bg-primary-foreground/30" />
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground/50">
            Apresentação Executiva
          </span>
        </div>

        {/* Main title */}
        {editable ? (
          <input
            className="block w-full bg-transparent text-4xl font-black leading-[1.05] tracking-tight text-primary-foreground outline-none placeholder:text-primary-foreground/30 md:text-6xl lg:text-7xl"
            value={title}
            onChange={(e) => onEdit?.("title", e.target.value)}
          />
        ) : (
          <h1 className="text-4xl font-black leading-[1.05] tracking-tight text-primary-foreground md:text-6xl lg:text-7xl">
            {title}
          </h1>
        )}

        {/* Subtitle — highlighted with border */}
        <div className="border-l-2 border-primary-foreground/30 pl-5">
          {editable ? (
            <textarea
              className="block w-full resize-none bg-transparent text-lg leading-relaxed text-primary-foreground/70 outline-none placeholder:text-primary-foreground/30 md:text-xl"
              rows={2}
              value={subtitle}
              onChange={(e) => onEdit?.("subtitle", e.target.value)}
            />
          ) : (
            <p className="max-w-2xl text-lg leading-relaxed text-primary-foreground/70 md:text-xl">
              {subtitle}
            </p>
          )}
        </div>

        {/* Meta bar */}
        <div className="flex flex-wrap items-center gap-4 pt-4">
          <div className="flex items-center gap-2.5 rounded-full border border-primary-foreground/10 bg-primary-foreground/5 px-4 py-2 backdrop-blur-sm">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm font-semibold text-primary-foreground">{data.company}</span>
          </div>
          <span className="text-sm text-primary-foreground/40">{data.contact} — {data.contactRole}</span>
          <span className="flex items-center gap-1.5 text-sm text-primary-foreground/40">
            <Calendar className="h-3.5 w-3.5" />
            {new Date(data.createdAt).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </span>
        </div>
      </div>
    </section>
  );
}
