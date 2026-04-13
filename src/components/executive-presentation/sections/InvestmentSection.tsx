import { type OpportunityData, type PresentationConfig, formatCurrency } from "@/data/executivePresentationData";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Layers, FileText } from "lucide-react";

interface Props {
  data: OpportunityData;
  config?: PresentationConfig;
}

export default function InvestmentSection({ data, config }: Props) {
  const hasProjectScope = !!data.linkedProject && data.linkedProject.scopeGroups.length > 0;
  const hasPremises = data.templateContext && data.templateContext.premises.length > 0;

  return (
    <section className="space-y-8">
      {/* Section header */}
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <DollarSign className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Investimento</h2>
          <p className="text-sm text-muted-foreground">Resumo do investimento para esta iniciativa</p>
        </div>
      </div>

      {/* Hero investment card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(var(--hero-from))] via-[hsl(var(--hero-via))] to-[hsl(var(--hero-to))] p-10 text-primary-foreground">
        {/* Glow */}
        <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-primary-foreground/10 blur-3xl" />

        <div className="relative z-10 space-y-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground/40">
            Investimento Total
          </p>
          <p className="text-5xl font-black tracking-tight text-primary-foreground md:text-6xl">
            {formatCurrency(data.investmentTotal)}
          </p>
          <p className="text-sm text-primary-foreground/50">
            {data.opportunityTypeLabel} • {data.company}
          </p>
        </div>
      </div>

      {/* Setup / Recurring breakdown */}
      {(data.investmentSetup || data.investmentRecurring) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.investmentSetup && (
            <div className="rounded-2xl border border-border bg-card p-6 transition-all duration-200 hover:shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Setup / Implantação</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{formatCurrency(data.investmentSetup)}</p>
            </div>
          )}
          {data.investmentRecurring && (
            <div className="rounded-2xl border border-border bg-card p-6 transition-all duration-200 hover:shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Recorrência</p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {formatCurrency(data.investmentRecurring)}
                <span className="ml-1 text-sm font-normal text-muted-foreground">{data.investmentRecurringLabel}</span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Scope-hours breakdown */}
      {hasProjectScope && (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Composição por frente de trabalho</h3>
          </div>
          <div className="space-y-3">
            {data.linkedProject!.scopeGroups.map((g) => {
              const pct = Math.round((g.totalHours / data.linkedProject!.totalHours) * 100);
              return (
                <div key={g.id} className="space-y-1.5">
                  <div className="flex items-center gap-3">
                    <span className="flex-1 truncate text-sm text-foreground">{g.title}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
                    <span className="w-16 text-right text-sm font-semibold tabular-nums text-foreground">{g.totalHours}h</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary/60 transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            <div className="mt-2 flex items-center gap-3 border-t border-border pt-3">
              <span className="flex-1 text-sm font-semibold text-foreground">Total</span>
              <span className="w-16 text-right text-sm font-bold tabular-nums text-primary">{data.linkedProject!.totalHours}h</span>
            </div>
          </div>
        </div>
      )}

      {/* Commercial conditions */}
      {hasPremises && (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Condições Comerciais</h3>
          </div>
          <ul className="space-y-1.5">
            {data.templateContext!.premises.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
