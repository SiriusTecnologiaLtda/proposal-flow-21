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

  const isModern = !config?.templateStyle || config.templateStyle === "modern";
  const isMinimal = config?.templateStyle === "minimal";

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-foreground">Investimento</h2>
        <p className="text-muted-foreground">Resumo do investimento para esta iniciativa</p>
      </div>

      <div className={isModern
        ? "rounded-xl border bg-gradient-to-br from-primary/5 via-transparent to-transparent p-8"
        : isMinimal
          ? "py-6"
          : "rounded-xl border bg-card p-8"
      }>
        <div className="flex flex-col items-center gap-6 text-center md:flex-row md:text-left">
          {!isMinimal && (
            <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ${isModern ? "bg-primary/10" : "bg-muted"}`}>
              <DollarSign className={`h-8 w-8 ${isModern ? "text-primary" : "text-muted-foreground"}`} />
            </div>
          )}

          <div className="flex-1 space-y-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Investimento Total</p>
              <p className="text-4xl font-bold text-foreground">{formatCurrency(data.investmentTotal)}</p>
            </div>

            {(data.investmentSetup || data.investmentRecurring) && (
              <div className="flex flex-wrap justify-center gap-6 md:justify-start">
                {data.investmentSetup && (
                  <div className={`px-4 py-2.5 ${isMinimal ? "" : "rounded-lg border bg-card"}`}>
                    <p className="text-xs text-muted-foreground">Setup / Implantação</p>
                    <p className="text-lg font-semibold text-foreground">{formatCurrency(data.investmentSetup)}</p>
                  </div>
                )}
                {data.investmentRecurring && (
                  <div className={`px-4 py-2.5 ${isMinimal ? "" : "rounded-lg border bg-card"}`}>
                    <p className="text-xs text-muted-foreground">Recorrência</p>
                    <p className="text-lg font-semibold text-foreground">
                      {formatCurrency(data.investmentRecurring)}
                      <span className="text-sm font-normal text-muted-foreground">{data.investmentRecurringLabel}</span>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scope-hours breakdown from project — executive summary */}
      {hasProjectScope && (
        <div className={`space-y-3 ${isMinimal ? "py-4" : "rounded-xl border bg-card p-5"}`}>
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Composição por frente de trabalho</h3>
          </div>
          <div className="space-y-2">
            {data.linkedProject!.scopeGroups.map((g) => {
              const pct = Math.round((g.totalHours / data.linkedProject!.totalHours) * 100);
              return (
                <div key={g.id} className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-foreground flex-1 truncate">{g.title}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
                    <span className="text-sm font-semibold text-foreground tabular-nums w-16 text-right">{g.totalHours}h</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${isModern ? "bg-primary/60" : "bg-foreground/30"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            <div className="flex items-center gap-3 border-t pt-2 mt-2">
              <span className="text-sm font-semibold text-foreground flex-1">Total</span>
              <span className="text-sm font-bold text-primary tabular-nums w-16 text-right">{data.linkedProject!.totalHours}h</span>
            </div>
          </div>
        </div>
      )}

      {/* Commercial conditions from template */}
      {hasPremises && (
        <div className={`space-y-3 ${isMinimal ? "py-4" : "rounded-xl border bg-card p-5"}`}>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Condições Comerciais</h3>
          </div>
          <ul className="space-y-1.5">
            {data.templateContext!.premises.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <div className="h-1.5 w-1.5 mt-1.5 shrink-0 rounded-full bg-primary/50" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
