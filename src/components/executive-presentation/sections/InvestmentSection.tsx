import { type OpportunityData, formatCurrency } from "@/data/executivePresentationData";
import { DollarSign } from "lucide-react";

interface Props {
  data: OpportunityData;
}

export default function InvestmentSection({ data }: Props) {
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
    </section>
  );
}
