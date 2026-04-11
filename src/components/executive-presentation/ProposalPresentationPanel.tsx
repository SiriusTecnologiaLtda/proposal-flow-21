import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Eye, Link2, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  useExecutivePresentations,
  useProposalAsOpportunity,
  usePresentationTypeConfig,
  useCreateExecutivePresentation,
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
  const [listOpen, setListOpen] = useState(false);
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

  if (proposalStatus === "cancelada") return null;

  const handleGenerate = async (config: PresentationConfig) => {
    if (!opportunityData) {
      toast({ title: "Dados não carregados", description: "Aguarde o carregamento dos dados da oportunidade.", variant: "destructive" });
      return;
    }

    setGenerating(true);
    setDialogOpen(false);

    try {
      // Map typeConfigRow to PresentationTypeConfig shape
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

  const recentPresentations = presentations.slice(0, 5);

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-primary/30 text-primary hover:bg-primary/5"
          onClick={() => setDialogOpen(true)}
          disabled={generating || loadingOpp}
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {generating ? "Gerando..." : "Apresentação Executiva"}
        </Button>

        {recentPresentations.length > 0 && (
          <Collapsible open={listOpen} onOpenChange={setListOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground">
                {recentPresentations.length} gerada{recentPresentations.length !== 1 ? "s" : ""}
                {listOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="absolute z-20 mt-1 w-72 rounded-lg border border-border bg-card p-2 shadow-lg">
              <div className="space-y-1">
                {recentPresentations.map((pres: any) => (
                  <div key={pres.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                    <span className="text-xs text-foreground">
                      {new Date(pres.created_at).toLocaleDateString("pt-BR")}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => navigate(`/apresentacao-executiva/${pres.id}`)}
                      >
                        <Eye className="mr-1 h-3 w-3" /> Ver
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => copyShareLink(pres.share_slug)}
                      >
                        <Link2 className="mr-1 h-3 w-3" /> Link
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
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
