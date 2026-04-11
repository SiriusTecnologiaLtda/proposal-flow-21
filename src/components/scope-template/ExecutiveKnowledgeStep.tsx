import { useState, useEffect, useRef } from "react";
import { Globe, FileText, Trash2, Plus, Save, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useScopeTemplateKnowledge,
  useUpsertScopeTemplateKnowledge,
  useScopeTemplateSources,
  useAddScopeTemplateSource,
  useDeleteScopeTemplateSource,
} from "@/hooks/useScopeTemplateKnowledge";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  templateId: string;
}

const SOURCE_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pendente", variant: "outline" },
  processing: { label: "Processando", variant: "secondary" },
  done: { label: "Concluído", variant: "default" },
  error: { label: "Erro", variant: "destructive" },
};

export default function ExecutiveKnowledgeStep({ templateId }: Props) {
  const qc = useQueryClient();
  const { data: knowledge, isLoading: knowledgeLoading } = useScopeTemplateKnowledge(templateId);
  const { data: sources = [], isLoading: sourcesLoading } = useScopeTemplateSources(templateId);
  const upsertKnowledge = useUpsertScopeTemplateKnowledge();
  const addSource = useAddScopeTemplateSource();
  const deleteSource = useDeleteScopeTemplateSource();

  const [initialized, setInitialized] = useState(false);
  const [preprompt, setPreprompt] = useState("");
  const [commercialDesc, setCommercialDesc] = useState("");
  const [executiveNotes, setExecutiveNotes] = useState("");
  const [benefits, setBenefits] = useState<string[]>([]);
  const [newBenefit, setNewBenefit] = useState("");

  const [sourceType, setSourceType] = useState<string>("url");
  const [sourceLabel, setSourceLabel] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceDriveId, setSourceDriveId] = useState("");
  const [sourceDriveName, setSourceDriveName] = useState("");

  const [extracting, setExtracting] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (knowledge && !initialized) {
      setPreprompt(knowledge.generation_preprompt || "");
      setCommercialDesc(knowledge.commercial_description || "");
      setExecutiveNotes(knowledge.executive_notes || "");
      setBenefits(Array.isArray(knowledge.executive_benefits) ? (knowledge.executive_benefits as string[]) : []);
      setInitialized(true);
    } else if (!knowledge && !initialized) {
      setInitialized(true);
    }
  }, [knowledge, initialized]);

  useEffect(() => {
    if (knowledge?.extraction_status === "processing") {
      setExtracting(true);
      pollingRef.current = setInterval(() => {
        qc.invalidateQueries({ queryKey: ["scope_template_knowledge", templateId] });
        qc.invalidateQueries({ queryKey: ["scope_template_sources", templateId] });
      }, 3000);
    } else {
      setExtracting(false);
      setInitialized(false);
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [knowledge?.extraction_status, templateId, qc]);

  const handleSaveKnowledge = async () => {
    try {
      await upsertKnowledge.mutateAsync({
        templateId,
        commercial_description: commercialDesc,
        executive_benefits: benefits,
        executive_notes: executiveNotes,
        generation_preprompt: preprompt,
      });
      toast.success("Base executiva salva com sucesso");
    } catch (err: any) {
      toast.error("Erro ao salvar", { description: err.message });
    }
  };

  const handleAddSource = async () => {
    if (!sourceLabel.trim()) {
      toast.error("Informe um label para a fonte");
      return;
    }
    if (sourceType === "url" && !sourceUrl.trim()) {
      toast.error("Informe a URL");
      return;
    }
    if (sourceType === "drive_file" && !sourceDriveId.trim()) {
      toast.error("Informe o ID do arquivo no Drive");
      return;
    }
    try {
      await addSource.mutateAsync({
        template_id: templateId,
        source_type: sourceType,
        label: sourceLabel.trim(),
        url: sourceType === "url" ? sourceUrl.trim() : undefined,
        drive_file_id: sourceType === "drive_file" ? sourceDriveId.trim() : undefined,
        drive_file_name: sourceType === "drive_file" ? sourceDriveName.trim() : undefined,
      });
      setSourceLabel("");
      setSourceUrl("");
      setSourceDriveId("");
      setSourceDriveName("");
      toast.success("Fonte adicionada");
    } catch (err: any) {
      toast.error("Erro ao adicionar fonte", { description: err.message });
    }
  };

  const handleDeleteSource = async (sourceId: string) => {
    try {
      await deleteSource.mutateAsync({ id: sourceId, templateId });
      toast.success("Fonte removida");
    } catch (err: any) {
      toast.error("Erro ao remover", { description: err.message });
    }
  };

  const handleExtract = async () => {
    setExtracting(true);
    try {
      const { error } = await supabase.functions.invoke("extract-scope-knowledge", {
        body: { templateId },
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["scope_template_knowledge", templateId] });
      qc.invalidateQueries({ queryKey: ["scope_template_sources", templateId] });
    } catch (err: any) {
      toast.error("Erro ao iniciar extração", { description: err.message });
      setExtracting(false);
    }
  };

  const addBenefit = () => {
    if (!newBenefit.trim()) return;
    setBenefits((prev) => [...prev, newBenefit.trim()]);
    setNewBenefit("");
  };

  const removeBenefit = (index: number) => {
    setBenefits((prev) => prev.filter((_, i) => i !== index));
  };

  const hasPendingOrErrorSources = sources.some(
    (s: any) => s.status === "pending" || s.status === "error"
  );

  if (knowledgeLoading || sourcesLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
          Direcionamento para a IA
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Escreva premissas, foco ou restrições que a IA deve considerar ao extrair e construir o conteúdo executivo.
          Não substitui as instruções do sistema — apenas as complementa.
        </p>
        <Textarea
          rows={4}
          value={preprompt}
          onChange={(e) => setPreprompt(e.target.value)}
          placeholder="Ex: Este módulo é vendido principalmente para empresas do setor industrial. O foco deve ser em conformidade com SPED e integração com sistemas de chão de fábrica. Evitar mencionar funcionalidades voltadas ao varejo."
        />
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Globe className="h-3.5 w-3.5 text-primary" />
          </div>
          Fontes de conhecimento
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Informe URLs públicas e arquivos do Google Drive que a IA usará para extrair o conteúdo executivo.
        </p>

        {sources.length > 0 && (
          <div className="mb-4 space-y-2">
            {sources.map((src: any) => {
              const statusCfg = SOURCE_STATUS[src.status] || SOURCE_STATUS.pending;
              return (
                <div key={src.id} className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-2.5">
                  {src.source_type === "url" ? (
                    <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{src.label}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {src.source_type === "url" ? src.url : src.drive_file_name || src.drive_file_id}
                    </div>
                  </div>
                  <Badge variant={statusCfg.variant} className="shrink-0 text-[10px]">
                    {statusCfg.label}
                  </Badge>
                  <button
                    onClick={() => handleDeleteSource(src.id)}
                    className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="rounded-xl border border-dashed border-border p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <Select value={sourceType} onValueChange={setSourceType}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="url">URL pública</SelectItem>
                  <SelectItem value="drive_file">Arquivo do Google Drive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Label *</Label>
              <Input
                value={sourceLabel}
                onChange={(e) => setSourceLabel(e.target.value)}
                placeholder="Descrição da fonte"
                className="h-9"
              />
            </div>
          </div>

          {sourceType === "url" ? (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">URL</Label>
              <Input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://..."
                className="h-9"
              />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">ID do arquivo no Drive</Label>
                <Input
                  value={sourceDriveId}
                  onChange={(e) => setSourceDriveId(e.target.value)}
                  placeholder="ID do arquivo"
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Nome do arquivo</Label>
                <Input
                  value={sourceDriveName}
                  onChange={(e) => setSourceDriveName(e.target.value)}
                  placeholder="Nome do arquivo"
                  className="h-9"
                />
              </div>
            </div>
          )}

          <Button variant="outline" size="sm" onClick={handleAddSource} disabled={addSource.isPending}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {addSource.isPending ? "Adicionando..." : "Adicionar"}
          </Button>
        </div>

        {hasPendingOrErrorSources && (
          <div className="mt-4">
            <Button onClick={handleExtract} disabled={extracting}>
              {extracting ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Extrair com IA
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-3.5 w-3.5 text-primary" />
          </div>
          Conteúdo executivo
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Gerado automaticamente pela IA a partir das fontes, ou preenchido manualmente.
          Este conteúdo enriquece a Apresentação Executiva quando este template é usado no escopo.
        </p>

        {knowledge?.extraction_status === "done" && knowledge?.extracted_at && (
          <Badge variant="default" className="mb-4 text-xs">
            Extraído em {new Date(knowledge.extracted_at).toLocaleDateString("pt-BR", {
              day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
            })}
          </Badge>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Descrição comercial</Label>
            <Textarea
              rows={4}
              value={commercialDesc}
              onChange={(e) => setCommercialDesc(e.target.value)}
              placeholder="Descreva em linguagem executiva o que este bloco de trabalho entrega..."
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Benefícios executivos</Label>
            <div className="space-y-2">
              {benefits.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-5 shrink-0 text-right">{i + 1}.</span>
                  <Input
                    value={b}
                    onChange={(e) => {
                      const newBenefits = [...benefits];
                      newBenefits[i] = e.target.value;
                      setBenefits(newBenefits);
                    }}
                    className="h-8 text-sm flex-1"
                  />
                  <button
                    onClick={() => removeBenefit(i)}
                    className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Input
                  value={newBenefit}
                  onChange={(e) => setNewBenefit(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addBenefit();
                    }
                  }}
                  placeholder="Ex: Fechamentos mensais mais ágeis"
                  className="h-8 text-sm flex-1"
                />
                <Button variant="ghost" size="sm" className="h-8 text-xs shrink-0" onClick={addBenefit}>
                  <Plus className="mr-1 h-3 w-3" /> Adicionar
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Notas executivas</Label>
            <Textarea
              rows={3}
              value={executiveNotes}
              onChange={(e) => setExecutiveNotes(e.target.value)}
              placeholder="Observações adicionais para enriquecer o discurso da apresentação..."
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <Button onClick={handleSaveKnowledge} disabled={upsertKnowledge.isPending}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {upsertKnowledge.isPending ? "Salvando..." : "Salvar base executiva"}
          </Button>
        </div>
      </div>
    </div>
  );
}
