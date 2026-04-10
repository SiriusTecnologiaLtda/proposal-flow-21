import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Presentation, ChevronDown, ChevronRight, Save, FileText, Upload, Trash2, ExternalLink, Layers, Wrench, Info } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  type PresentationTypeConfig,
  type ReferenceAttachment,
  executivePresentationStore,
  templateStyleOptions,
  pricingDisplayModeOptions,
} from "@/data/executivePresentationData";

interface Props {
  proposalTypeId: string;
  proposalTypeSlug: string;
  proposalTypeName: string;
  templateDocId?: string | null;
  mitTemplateDocId?: string | null;
}

const emptyConfig: PresentationTypeConfig = {
  executiveSummary: "",
  positioningText: "",
  problemStatement: "",
  solutionApproach: "",
  defaultBenefits: [],
  defaultScopeBlocks: [],
  defaultTimeline: [],
  pricingDisplayMode: "setup_unico",
  differentiators: [],
  defaultCta: "",
  preferredTemplate: "modern",
  references: [],
};

export default function PresentationTypeConfigEditor({
  proposalTypeId,
  proposalTypeSlug,
  proposalTypeName,
  templateDocId,
  mitTemplateDocId,
}: Props) {
  const existing = executivePresentationStore.getConfigForSlug(proposalTypeSlug);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PresentationTypeConfig>(existing ?? emptyConfig);
  const [dirty, setDirty] = useState(false);

  // Fetch service items for this proposal type
  const { data: serviceItems = [] } = useQuery({
    queryKey: ["proposal_type_service_items", proposalTypeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposal_type_service_items")
        .select("id, label, hourly_rate, golive_pct, is_base_scope, sort_order")
        .eq("proposal_type_id", proposalTypeId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const cfg = executivePresentationStore.getConfigForSlug(proposalTypeSlug);
    setForm(cfg ?? emptyConfig);
    setDirty(false);
  }, [proposalTypeSlug]);

  const set = <K extends keyof PresentationTypeConfig>(key: K, value: PresentationTypeConfig[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = () => {
    executivePresentationStore.upsertConfig(proposalTypeSlug, form);
    setDirty(false);
    toast.success("Conteúdo de apresentação salvo");
  };

  const handleSimulateUpload = () => {
    const ref: ReferenceAttachment = {
      id: `ref-${Date.now()}`,
      fileName: `Documento_${proposalTypeName.replace(/\s/g, "_")}.pdf`,
      fileType: "pdf",
      description: "Documento de referência (simulado)",
      uploadedAt: new Date().toISOString().slice(0, 10),
    };
    set("references", [...form.references, ref]);
  };

  const removeRef = (id: string) => {
    set("references", form.references.filter((r) => r.id !== id));
  };

  const hasContent = !!existing;
  const hasTemplates = !!(templateDocId || mitTemplateDocId);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-2 w-full text-left group py-2">
          <Presentation className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground flex-1">Apresentação Executiva</span>
          {hasContent ? (
            <Badge variant="secondary" className="text-[10px]">Configurado</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">Sem conteúdo</Badge>
          )}
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-2">
        <p className="text-xs text-muted-foreground">
          Conteúdo-base usado para gerar apresentações executivas deste tipo de oportunidade.
        </p>

        {/* ── Existing type context ── */}
        <ExistingTypeContext
          templateDocId={templateDocId}
          mitTemplateDocId={mitTemplateDocId}
          serviceItems={serviceItems}
          hasTemplates={hasTemplates}
        />

        <Separator />

        {/* Narrative */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Resumo executivo</Label>
            <Textarea rows={2} value={form.executiveSummary} onChange={(e) => set("executiveSummary", e.target.value)} placeholder="Descrição curta do tipo..." />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Posicionamento</Label>
              <Textarea rows={2} value={form.positioningText} onChange={(e) => set("positioningText", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Problema-padrão</Label>
              <Textarea rows={2} value={form.problemStatement} onChange={(e) => set("problemStatement", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Abordagem da solução</Label>
              <Textarea rows={2} value={form.solutionApproach} onChange={(e) => set("solutionApproach", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">CTA padrão</Label>
              <Input value={form.defaultCta} onChange={(e) => set("defaultCta", e.target.value)} placeholder="Ex: Agendar reunião..." />
            </div>
          </div>
        </div>

        <Separator />

        {/* Visual config */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Template visual preferido</Label>
            <Select value={form.preferredTemplate} onValueChange={(v) => set("preferredTemplate", v as any)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {templateStyleOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Modo de exibição de preço</Label>
            <Select value={form.pricingDisplayMode} onValueChange={(v) => set("pricingDisplayMode", v as any)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {pricingDisplayModeOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Separator />

        {/* Summary badges */}
        <div className="flex gap-2 flex-wrap">
          <Badge variant="secondary" className="text-[10px]">{form.defaultScopeBlocks.length} blocos de escopo</Badge>
          <Badge variant="secondary" className="text-[10px]">{form.defaultBenefits.length} benefícios</Badge>
          <Badge variant="secondary" className="text-[10px]">{form.differentiators.length} diferenciais</Badge>
          <Badge variant="secondary" className="text-[10px]">{form.defaultTimeline.length} fases</Badge>
        </div>

        <Separator />

        {/* References */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Referências anexadas</Label>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleSimulateUpload}>
              <Upload className="h-3 w-3" /> Simular upload
            </Button>
          </div>
          {form.references.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Nenhuma referência</p>
          ) : (
            <div className="space-y-1">
              {form.references.map((r) => (
                <div key={r.id} className="flex items-center gap-2 rounded border bg-muted/30 px-2 py-1.5">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-foreground flex-1 truncate">{r.fileName}</span>
                  <Badge variant="outline" className="text-[10px] uppercase shrink-0">{r.fileType}</Badge>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRef(r.id)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Save */}
        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={!dirty} className="gap-1.5">
            <Save className="h-3.5 w-3.5" /> Salvar conteúdo
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ── Sub-component: existing type context panel ── */

interface ExistingTypeContextProps {
  templateDocId?: string | null;
  mitTemplateDocId?: string | null;
  serviceItems: { id: string; label: string; hourly_rate: number; golive_pct: number; is_base_scope: boolean; sort_order: number }[];
  hasTemplates: boolean;
}

function ExistingTypeContext({ templateDocId, mitTemplateDocId, serviceItems, hasTemplates }: ExistingTypeContextProps) {
  const hasServiceItems = serviceItems.length > 0;

  if (!hasTemplates && !hasServiceItems) return null;

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Info className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold text-foreground">Insumos já existentes no tipo</span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Estes dados já cadastrados serão utilizados na composição da apresentação executiva, combinados com os dados da oportunidade e do projeto vinculado.
      </p>

      {/* Templates */}
      {hasTemplates && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <FileText className="h-3 w-3 text-muted-foreground" />
            <span className="text-[11px] font-medium text-foreground">Templates de documento vinculados</span>
          </div>
          <div className="space-y-1 pl-4">
            {templateDocId && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] shrink-0">Proposta</Badge>
                <code className="text-[10px] font-mono text-muted-foreground truncate flex-1">{templateDocId}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 shrink-0"
                  onClick={() => window.open(`https://docs.google.com/document/d/${templateDocId}/edit`, "_blank")}
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            )}
            {mitTemplateDocId && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] shrink-0">MIT-065</Badge>
                <code className="text-[10px] font-mono text-muted-foreground truncate flex-1">{mitTemplateDocId}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 shrink-0"
                  onClick={() => window.open(`https://docs.google.com/document/d/${mitTemplateDocId}/edit`, "_blank")}
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground italic pl-4">
            Narrativa, estrutura e linguagem comercial dos templates servirão de base complementar.
          </p>
        </div>
      )}

      {/* Service Items */}
      {hasServiceItems && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Layers className="h-3 w-3 text-muted-foreground" />
            <span className="text-[11px] font-medium text-foreground">
              Itens de serviço do tipo
            </span>
            <Badge variant="secondary" className="text-[10px]">{serviceItems.length}</Badge>
          </div>
          <div className="pl-4 space-y-0.5">
            {serviceItems.map((si) => (
              <div key={si.id} className="flex items-center gap-2 text-[11px]">
                <Wrench className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                <span className="text-foreground flex-1 truncate">{si.label}</span>
                <span className="text-muted-foreground tabular-nums shrink-0">
                  R$ {si.hourly_rate.toLocaleString("pt-BR")}/h
                </span>
                {si.is_base_scope && (
                  <Badge variant="outline" className="text-[9px] shrink-0">base</Badge>
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground italic pl-4">
            Itens serão usados para compor a seção de escopo visual e investimento da apresentação.
          </p>
        </div>
      )}
    </div>
  );
}
