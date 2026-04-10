import { type OpportunityData } from "@/data/executivePresentationData";
import { AlertTriangle, TrendingUp, Clock } from "lucide-react";

interface Props {
  data: OpportunityData;
  editable?: boolean;
  overrides?: Record<string, string>;
  onEdit?: (field: string, value: string) => void;
}

export default function ContextSection({ data, editable, overrides, onEdit }: Props) {
  const field = (key: string, fallback: string) => overrides?.[key] ?? fallback;

  const EditableBlock = ({ fieldKey, value, label, icon: Icon }: { fieldKey: string; value: string; label: string; icon: typeof AlertTriangle }) => (
    <div className="space-y-3 rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2 text-primary">
        <Icon className="h-5 w-5" />
        <h3 className="font-semibold">{label}</h3>
      </div>
      {editable ? (
        <textarea
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          rows={3}
          value={value}
          onChange={(e) => onEdit?.(fieldKey, e.target.value)}
        />
      ) : (
        <p className="text-sm leading-relaxed text-muted-foreground">{value}</p>
      )}
    </div>
  );

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-foreground">Contexto & Oportunidade</h2>
        <p className="text-muted-foreground">Entendendo o cenário e a urgência de agir</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <EditableBlock
          fieldKey="currentScenario"
          value={field("currentScenario", data.currentScenario)}
          label="Cenário Atual"
          icon={AlertTriangle}
        />
        <EditableBlock
          fieldKey="mainPain"
          value={field("mainPain", data.mainPain)}
          label="Desafio Principal"
          icon={TrendingUp}
        />
        <EditableBlock
          fieldKey="whyActNow"
          value={field("whyActNow", data.whyActNow)}
          label="Por que agir agora"
          icon={Clock}
        />
      </div>
    </section>
  );
}
