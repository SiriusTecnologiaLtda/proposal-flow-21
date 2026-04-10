import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles } from "lucide-react";
import {
  type PresentationConfig,
  type OpportunityData,
  templateStyleOptions,
  audienceOptions,
  detailOptions,
  opportunityTypeOptions,
  defaultPresentationConfig,
} from "@/data/executivePresentationData";

interface GenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity: OpportunityData;
  onGenerate: (config: PresentationConfig) => void;
}

export default function GenerateDialog({ open, onOpenChange, opportunity, onGenerate }: GenerateDialogProps) {
  const [config, setConfig] = useState<PresentationConfig>({
    ...defaultPresentationConfig,
    opportunityType: opportunity.opportunityType,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Gerar Apresentação Executiva
          </DialogTitle>
          <DialogDescription>
            Configure a apresentação para <strong>{opportunity.company}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Opportunity type */}
          <div className="space-y-1.5">
            <Label>Tipo de oportunidade</Label>
            <Select
              value={config.opportunityType}
              onValueChange={(v) => setConfig((c) => ({ ...c, opportunityType: v as any }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {opportunityTypeOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Template style */}
          <div className="space-y-1.5">
            <Label>Template visual</Label>
            <Select
              value={config.templateStyle}
              onValueChange={(v) => setConfig((c) => ({ ...c, templateStyle: v as any }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {templateStyleOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    <span>{o.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">— {o.description}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Audience */}
          <div className="space-y-1.5">
            <Label>Público-alvo</Label>
            <Select
              value={config.audience}
              onValueChange={(v) => setConfig((c) => ({ ...c, audience: v as any }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {audienceOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Detail level */}
          <div className="space-y-1.5">
            <Label>Nível de detalhamento</Label>
            <Select
              value={config.detailLevel}
              onValueChange={(v) => setConfig((c) => ({ ...c, detailLevel: v as any }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {detailOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Toggles */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="show-investment">Mostrar investimento</Label>
            <Switch
              id="show-investment"
              checked={config.showInvestment}
              onCheckedChange={(v) => setConfig((c) => ({ ...c, showInvestment: v }))}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="show-timeline">Mostrar cronograma</Label>
            <Switch
              id="show-timeline"
              checked={config.showTimeline}
              onCheckedChange={(v) => setConfig((c) => ({ ...c, showTimeline: v }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => onGenerate(config)} className="gap-2">
            <Sparkles className="h-4 w-4" /> Gerar apresentação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
