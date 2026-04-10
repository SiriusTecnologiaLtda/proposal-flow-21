import { useState, useEffect } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { FileText, Upload, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import {
  type OpportunityType,
  type TemplateStyle,
  type PricingDisplayMode,
  type ReferenceAttachment,
  templateStyleOptions,
  pricingDisplayModeOptions,
} from "@/data/executivePresentationData";

/** @deprecated kept for backward compat */
type OpportunityTypeReference = OpportunityType;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: OpportunityTypeReference | null;
  onSave: (type: OpportunityTypeReference) => void;
}

function emptyType(): OpportunityTypeReference {
  return {
    id: `type-${Date.now()}`,
    name: "",
    slug: "saas",
    executiveSummary: "",
    positioningText: "",
    problemStatement: "",
    solutionApproach: "",
    defaultBenefits: [],
    defaultScopeBlocks: [],
    defaultTimeline: [],
    pricingDisplayMode: "recorrencia",
    differentiators: [],
    defaultCta: "",
    preferredTemplate: "modern",
    references: [],
    createdAt: new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString().slice(0, 10),
  };
}

export default function OpportunityTypeDrawer({ open, onOpenChange, type, onSave }: Props) {
  const [form, setForm] = useState<OpportunityTypeReference>(emptyType());
  const isNew = !type;

  useEffect(() => {
    setForm(type ? { ...type } : emptyType());
  }, [type, open]);

  const set = <K extends keyof OpportunityTypeReference>(key: K, value: OpportunityTypeReference[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSimulateUpload = () => {
    const ref: ReferenceAttachment = {
      id: `ref-${Date.now()}`,
      fileName: `Documento_Referencia_${form.references.length + 1}.pdf`,
      fileType: "pdf",
      description: "Referência anexada (simulado)",
      uploadedAt: new Date().toISOString().slice(0, 10),
    };
    set("references", [...form.references, ref]);
    toast.info("Upload simulado — arquivo de referência adicionado");
  };

  const handleRemoveRef = (id: string) => {
    set("references", form.references.filter((r) => r.id !== id));
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Nome do tipo é obrigatório");
      return;
    }
    onSave({ ...form, updatedAt: new Date().toISOString().slice(0, 10) });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl w-full p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <SheetTitle>{isNew ? "Novo Tipo de Oportunidade" : `Editar: ${type?.name}`}</SheetTitle>
          <SheetDescription>
            Defina o conteúdo-base para geração de apresentações executivas
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="space-y-6 py-4">
            {/* Identification */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Identificação</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Nome</Label>
                  <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex: SaaS / Assinatura" />
                </div>
                <div className="space-y-1.5">
                  <Label>Slug</Label>
                  <Input value={form.slug} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/\s+/g, "_"))} placeholder="ex: saas, consultoria" />
                </div>
              </div>
            </section>

            <Separator />

            {/* Narrative content */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Conteúdo Narrativo</h3>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Resumo executivo</Label>
                  <Textarea rows={2} value={form.executiveSummary} onChange={(e) => set("executiveSummary", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Texto de posicionamento</Label>
                  <Textarea rows={2} value={form.positioningText} onChange={(e) => set("positioningText", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Declaração do problema</Label>
                  <Textarea rows={2} value={form.problemStatement} onChange={(e) => set("problemStatement", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Abordagem da solução</Label>
                  <Textarea rows={2} value={form.solutionApproach} onChange={(e) => set("solutionApproach", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>CTA padrão</Label>
                  <Input value={form.defaultCta} onChange={(e) => set("defaultCta", e.target.value)} />
                </div>
              </div>
            </section>

            <Separator />

            {/* Presentation settings */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Configurações de Apresentação</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Template preferido</Label>
                  <Select value={form.preferredTemplate} onValueChange={(v) => set("preferredTemplate", v as TemplateStyle)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {templateStyleOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Modo de precificação</Label>
                  <Select value={form.pricingDisplayMode} onValueChange={(v) => set("pricingDisplayMode", v as PricingDisplayMode)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {pricingDisplayModeOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <Separator />

            {/* Scope blocks summary */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">
                Escopo padrão <Badge variant="secondary" className="ml-2 text-xs">{form.defaultScopeBlocks.length} blocos</Badge>
              </h3>
              {form.defaultScopeBlocks.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Nenhum bloco de escopo definido</p>
              ) : (
                <div className="space-y-1.5">
                  {form.defaultScopeBlocks.map((sb, i) => (
                    <div key={sb.id} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                      <span className="text-xs font-medium text-muted-foreground w-5">{i + 1}.</span>
                      <span className="text-sm text-foreground flex-1">{sb.title}</span>
                      <span className="text-xs text-muted-foreground">{sb.items.length} itens</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Edição detalhada de blocos de escopo em evolução futura.</p>
            </section>

            <Separator />

            {/* References */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Referências Anexadas</h3>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleSimulateUpload}>
                  <Upload className="h-3.5 w-3.5" /> Anexar referência
                </Button>
              </div>
              {form.references.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-center">
                  <FileText className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-xs text-muted-foreground">Nenhuma referência anexada</p>
                  <p className="text-xs text-muted-foreground/60">DOC/PDF de referência para futura extração de conteúdo</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {form.references.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{r.fileName}</p>
                        <p className="text-xs text-muted-foreground">{r.description}</p>
                      </div>
                      <Badge variant="outline" className="text-xs uppercase shrink-0">{r.fileType}</Badge>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleRemoveRef(r.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </ScrollArea>

        <SheetFooter className="border-t px-6 py-4 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} className="gap-2">
            <Save className="h-4 w-4" /> {isNew ? "Criar tipo" : "Salvar alterações"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
