import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Eye, Link2, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  useExecutivePresentations,
  useProposalAsOpportunity,
  usePresentationTypeConfig,
  useCreateExecutivePresentation,
  useDeleteExecutivePresentation,
} from "@/hooks/useExecutivePresentation";
import { composePresentation, type PresentationConfig } from "@/data/executivePresentationData";
import GenerateDialog from "./GenerateDialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ProposalPresentationPanelProps {
  proposalId: string;
  proposalStatus: string;
}

export default function ProposalPresentationPanel({ proposalId, proposalStatus }: ProposalPresentationPanelProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  const { data: opportunityData, isLoading: loadingOpp } = useProposalAsOpportunity(proposalId);
  const { data: presentations = [], isLoading: loadingPres } = useExecutivePresentations(proposalId);

  const { data: proposalTypes = [] } = useQuery({
    queryKey: ["proposal_types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("proposal_types").select("id, name, slug").order("name");
      if (error) throw error;
      return data as { id: string; name: string; slug: string }[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const selectedTypeId = opportunityData
    ? proposalTypes.find((t) => t.slug === opportunityData.opportunityTypeSlug)?.id
    : undefined;

  const { data: typeConfigRow } = usePresentationTypeConfig(selectedTypeId);

  const createPresentation = useCreateExecutivePresentation();
  const deletePresentation = useDeleteExecutivePresentation();

  if (proposalStatus === "cancelada") return null;

  const handleGenerate = async (config: PresentationConfig) => {
    if (!opportunityData) {
      toast({ title: "Dados não carregados", description: "Aguarde o carregamento dos dados da oportunidade.", variant: "destructive" });
      return;
    }

    setGenerating(true);
    setDialogOpen(false);

    try {
      const typeConfig = typeConfigRow
        ? {
            executiveSummary: typeConfigRow.executive_summary,
            positioningText: typeConfigRow.positioning_text,
            problemStatement: typeConfigRow.problem_statement,
            solutionApproach: typeConfigRow.solution_approach,
            defaultBenefits: typeConfigRow.default_benefits as any,
            defaultScopeBlocks: typeConfigRow.default_scope_blocks as any,
            defaultTimeline: typeConfigRow.default_timeline as any,
            pricingDisplayMode: typeConfigRow.pricing_display_mode as any,
            differentiators: typeConfigRow.differentiators as any,
            defaultCta: typeConfigRow.default_cta,
            preferredTemplate: typeConfigRow.preferred_template as any,
            references: typeConfigRow.references as any,
          }
        : undefined;

      const composed = composePresentation(opportunityData, typeConfig);

      const result = await createPresentation.mutateAsync({
        proposalId,
        proposalTypeId: selectedTypeId || "",
        config: config as any,
        composedData: composed as any,
        dataSources: {
          opportunity: true,
          proposalType: !!typeConfigRow,
          linkedProject: !!opportunityData.linkedProject,
          proposalTemplate: !!opportunityData.templateContext,
          templateKnowledge: !!opportunityData.linkedProject?.scopeGroups.some(g => !!g.templateKnowledge),
        },
      });

      toast({ title: "Apresentação gerada", description: "Redirecionando para visualização..." });
      navigate(`/apresentacao-executiva/${result.id}`);
    } catch (err: any) {
      toast({ title: "Erro ao gerar apresentação", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const copyShareLink = (shareSlug: string) => {
    const url = `${window.location.origin}/apresentacao-publica/${shareSlug}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copiado", description: "O link da apresentação foi copiado para a área de transferência." });
  };

  return (
    <>
      <div className="space-y-6 w-full">
        {/* Botão gerar */}
        <Button
          variant="default"
          className="gap-2"
          onClick={() => setDialogOpen(true)}
          disabled={generating || loadingOpp}
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {generating ? "Gerando..." : "Gerar Nova Apresentação"}
        </Button>

        {/* Grid de apresentações geradas */}
        {loadingPres ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : presentations.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma apresentação gerada ainda.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {presentations.map((pres: any) => (
              <div key={pres.id} className="rounded-xl border border-border bg-muted/30 p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {new Date(pres.created_at).toLocaleDateString("pt-BR", {
                      day: "2-digit", month: "short", year: "numeric",
                      hour: "2-digit", minute: "2-digit"
                    })}
                  </span>
                </div>
                <div className="flex gap-2 mt-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={() => navigate(`/apresentacao-executiva/${pres.id}`)}
                  >
                    <Eye className="mr-1.5 h-3.5 w-3.5" /> Visualizar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2"
                    onClick={() => copyShareLink(pres.share_slug)}
                    title="Copiar link público"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2 text-destructive hover:text-destructive hover:border-destructive/50"
                    title="Excluir"
                    onClick={() => {
                      if (window.confirm("Excluir esta apresentação? Esta ação não pode ser desfeita.")) {
                        deletePresentation.mutate({ id: pres.id, proposalId });
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {opportunityData && (
        <GenerateDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          opportunity={opportunityData}
          onGenerate={handleGenerate}
        />
      )}
    </>
  );
}
