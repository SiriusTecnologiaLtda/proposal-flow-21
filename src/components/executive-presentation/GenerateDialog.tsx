import { useState, useEffect } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sparkles, Info, FolderKanban, FileText, Layers, Building2, CheckCircle2, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  type PresentationConfig,
  type OpportunityData,
  templateStyleOptions,
  audienceOptions,
  detailOptions,
  defaultPresentationConfig,
} from "@/data/executivePresentationData";

interface GenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity: OpportunityData;
  onGenerate: (config: PresentationConfig) => void;
}

export default function GenerateDialog({ open, onOpenChange, opportunity, onGenerate }: GenerateDialogProps) {
  const { data: proposalTypes = [] } = useQuery({
    queryKey: ["proposal_types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("proposal_types").select("id, name, slug").order("name");
      if (error) throw error;
      return data as { id: string; name: string; slug: string }[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch all presentation_type_configs to know which types have content
  const { data: presConfigs = [] } = useQuery({
    queryKey: ["presentation_type_configs_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("presentation_type_configs")
        .select("proposal_type_id, preferred_template");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const configByTypeId = new Map(presConfigs.map((c) => [c.proposal_type_id, c]));
  const selectedTypeId = proposalTypes.find((t) => t.slug === opportunity.opportunityTypeSlug)?.id;
  const selectedConfig = selectedTypeId ? configByTypeId.get(selectedTypeId) : undefined;

  const [config, setConfig] = useState<PresentationConfig>(() => ({
    ...defaultPresentationConfig,
    opportunityTypeSlug: opportunity.opportunityTypeSlug,
    templateStyle: (selectedConfig?.preferred_template as any) ?? defaultPresentationConfig.templateStyle,
  }));

  useEffect(() => {
    const typeId = proposalTypes.find((t) => t.slug === opportunity.opportunityTypeSlug)?.id;
    const tc = typeId ? configByTypeId.get(typeId) : undefined;
    setConfig({
      ...defaultPresentationConfig,
      opportunityTypeSlug: opportunity.opportunityTypeSlug,
      templateStyle: (tc?.preferred_template as any) ?? defaultPresentationConfig.templateStyle,
    });
  }, [opportunity.id, opportunity.opportunityTypeSlug, presConfigs.length]);

  const hasPresConfig = !!selectedConfig;
  const hasProject = !!opportunity.linkedProject;
  const hasTemplate = !!opportunity.templateContext;

  const sources = [
    { key: "opportunity", label: "Oportunidade", icon: Building2, active: true, description: "Cliente, valor, contexto comercial" },
    { key: "type", label: "Tipo de Oportunidade", icon: Layers, active: hasPresConfig, description: "Lógica, narrativa e modelo do tipo" },
    { key: "project", label: "Projeto Vinculado", icon: FolderKanban, active: hasProject, description: hasProject ? `${opportunity.linkedProject!.totalItems} itens · ${opportunity.linkedProject!.totalHours}h` : "Sem projeto vinculado" },
    { key: "template", label: "Template de Proposta", icon: FileText, active: hasTemplate, description: hasTemplate ? "Premissas, metodologia, fora de escopo" : "Sem template vinculado" },
  ];

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

        <div className="space-y-4 py-2">
          {/* Data sources composition */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-foreground">Fontes de dados da composição</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {sources.map((s) => (
                <div
                  key={s.key}
                  className={`flex items-start gap-2 rounded-lg border p-2.5 ${
                    s.active
                      ? "border-primary/20 bg-primary/5"
                      : "border-dashed bg-muted/20 opacity-60"
                  }`}
                >
                  <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded ${s.active ? "text-primary" : "text-muted-foreground"}`}>
                    {s.active ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-foreground truncate">{s.label}</p>
                    <p className="text-[10px] text-muted-foreground leading-snug">{s.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Opportunity type */}
          <div className="space-y-1.5">
            <Label>Tipo de oportunidade</Label>
            <Select
              value={config.opportunityTypeSlug}
              onValueChange={(v) => {
                const typeId = proposalTypes.find((t) => t.slug === v)?.id;
                const tc = typeId ? configByTypeId.get(typeId) : undefined;
                setConfig((c) => ({
                  ...c,
                  opportunityTypeSlug: v,
                  templateStyle: (tc?.preferred_template as any) ?? c.templateStyle,
                }));
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {proposalTypes.map((t) => (
                  <SelectItem key={t.slug} value={t.slug}>
                    <span>{t.name}</span>
                    {!configByTypeId.has(t.id) && (
                      <span className="ml-2 text-xs text-muted-foreground">(sem conteúdo)</span>
                    )}
                  </SelectItem>
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

          {/* Audience & Detail in row */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Público-alvo</Label>
              <Select value={config.audience} onValueChange={(v) => setConfig((c) => ({ ...c, audience: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {audienceOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Detalhamento</Label>
              <Select value={config.detailLevel} onValueChange={(v) => setConfig((c) => ({ ...c, detailLevel: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {detailOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Toggles */}
          <div className="flex gap-3">
            <div className="flex flex-1 items-center justify-between rounded-lg border p-3">
              <Label htmlFor="show-investment" className="text-xs">Investimento</Label>
              <Switch id="show-investment" checked={config.showInvestment} onCheckedChange={(v) => setConfig((c) => ({ ...c, showInvestment: v }))} />
            </div>
            <div className="flex flex-1 items-center justify-between rounded-lg border p-3">
              <Label htmlFor="show-timeline" className="text-xs">Cronograma</Label>
              <Switch id="show-timeline" checked={config.showTimeline} onCheckedChange={(v) => setConfig((c) => ({ ...c, showTimeline: v }))} />
            </div>
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
