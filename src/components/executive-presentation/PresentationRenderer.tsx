import { type OpportunityData, type PresentationConfig } from "@/data/executivePresentationData";
import CoverSection from "./sections/CoverSection";
import ContextSection from "./sections/ContextSection";
import SolutionSection from "./sections/SolutionSection";
import ScopeSection from "./sections/ScopeSection";
import BenefitsSection from "./sections/BenefitsSection";
import TimelineSection from "./sections/TimelineSection";
import InvestmentSection from "./sections/InvestmentSection";
import DifferentiatorsSection from "./sections/DifferentiatorsSection";
import NextStepsSection from "./sections/NextStepsSection";

interface Props {
  data: OpportunityData;
  config: PresentationConfig;
  editable?: boolean;
  overrides?: Record<string, string>;
  onEdit?: (field: string, value: string) => void;
}

export default function PresentationRenderer({ data, config, editable = false, overrides, onEdit }: Props) {
  return (
    <div className="space-y-12">
      <CoverSection data={data} config={config} editable={editable} overrides={overrides} onEdit={onEdit} />
      <ContextSection data={data} config={config} editable={editable} overrides={overrides} onEdit={onEdit} />
      <SolutionSection data={data} config={config} editable={editable} overrides={overrides} onEdit={onEdit} />
      <ScopeSection data={data} config={config} />
      <BenefitsSection data={data} config={config} />
      {config.showTimeline && <TimelineSection data={data} config={config} />}
      {config.showInvestment && <InvestmentSection data={data} config={config} />}
      <DifferentiatorsSection data={data} config={config} />
      <NextStepsSection data={data} config={config} editable={editable} overrides={overrides} onEdit={onEdit} />
    </div>
  );
}
