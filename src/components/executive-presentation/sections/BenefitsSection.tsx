import { type OpportunityData } from "@/data/executivePresentationData";
import {
  TrendingDown, Eye, ShieldCheck, Rocket, Heart, Award, Brain, Shield,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  TrendingDown, Eye, ShieldCheck, Rocket, Heart, Award, Brain, Shield,
};

interface Props {
  data: OpportunityData;
}

export default function BenefitsSection({ data }: Props) {
  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-foreground">Benefícios Esperados</h2>
        <p className="text-muted-foreground">Impactos estratégicos e operacionais para o seu negócio</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {data.benefits.map((b) => {
          const Icon = iconMap[b.icon] || Rocket;
          return (
            <div key={b.id} className="flex items-start gap-4 rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10">
                <Icon className="h-5 w-5 text-success" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground">{b.title}</h4>
                <p className="mt-1 text-sm text-muted-foreground">{b.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
