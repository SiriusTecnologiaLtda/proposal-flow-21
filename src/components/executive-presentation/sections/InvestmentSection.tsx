import { type OpportunityData, formatCurrency } from "@/data/executivePresentationData";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Layers } from "lucide-react";

interface Props {
  data: OpportunityData;
}

export default function InvestmentSection({ data }: Props) {
  const hasProjectScope = !!data.linkedProject && data.linkedProject.scopeGroups.length > 0;

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-foreground">Investimento</h2>
        <p className="text-muted-foreground">Resumo do investimento para esta iniciativa</p>
      </div>

      <div className="rounded-xl border bg-gradient-to-br from-primary/5 via-transparent to-transparent p-8">
        <div className="flex flex-col items-center gap-6 text-center md:flex-row md:text-left">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
            <DollarSign className="h-8 w-8 text-primary" />
          </div>

          <div className="flex-1 space-y-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Investimento Total</p>
              <p className="text-4xl font-bold text-foreground">{formatCurrency(data.investmentTotal)}</p>
            </div>

            {(data.investmentSetup || data.investmentRecurring) && (
              <div className="flex flex-wrap justify-center gap-6 md:justify-start">
                {data.investmentSetup && (
                  <div className="rounded-lg border bg-card px-4 py-2.5">
                    <p className="text-xs text-muted-foreground">Setup / Implantação</p>
                    <p className="text-lg font-semibold text-foreground">{formatCurrency(data.investmentSetup)}</p>
                  </div>
                )}
                {data.investmentRecurring && (
                  <div className="rounded-lg border bg-card px-4 py-2.5">
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

      {/* Scope-hours breakdown from project */}
      {hasProjectScope && (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Composição por frente de trabalho</h3>
            <Badge variant="secondary" className="text-[10px]">Projeto Vinculado</Badge>
          </div>
          <div className="space-y-2">
            {data.linkedProject!.scopeGroups.map((g) => (
              <div key={g.id} className="flex items-center gap-3">
                <span className="text-sm text-foreground flex-1 truncate">{g.title}</span>
                <Badge variant="outline" className="text-[10px] shrink-0">{g.itemCount} itens</Badge>
                <span className="text-sm font-semibold text-foreground tabular-nums w-16 text-right">{g.totalHours}h</span>
              </div>
            ))}
            <div className="flex items-center gap-3 border-t pt-2 mt-2">
              <span className="text-sm font-semibold text-foreground flex-1">Total</span>
              <Badge variant="secondary" className="text-[10px] shrink-0">{data.linkedProject!.totalItems} itens</Badge>
              <span className="text-sm font-bold text-primary tabular-nums w-16 text-right">{data.linkedProject!.totalHours}h</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
