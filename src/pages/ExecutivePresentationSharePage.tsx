import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useExecutivePresentationBySlug } from "@/hooks/useExecutivePresentation";
import PresentationRenderer from "@/components/executive-presentation/PresentationRenderer";
import type { OpportunityData, PresentationConfig } from "@/data/executivePresentationData";

export default function ExecutivePresentationSharePage() {
  const { id } = useParams<{ id: string }>();
  const { data: presentation, isLoading } = useExecutivePresentationBySlug(id);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!presentation) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Apresentação não encontrada ou link inválido.</p>
      </div>
    );
  }

  const composedData = presentation.composed_data as unknown as OpportunityData;
  const config = presentation.config as unknown as PresentationConfig;
  const overrides = (presentation.overrides as Record<string, string>) ?? {};

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <PresentationRenderer
          data={composedData}
          config={config}
          overrides={overrides}
        />
        <footer className="mt-16 border-t pt-6 text-center text-xs text-muted-foreground">
          <p>Este documento é confidencial e destinado exclusivamente ao destinatário indicado.</p>
          <p className="mt-1">© {new Date().getFullYear()} — Documento gerado automaticamente</p>
        </footer>
      </div>
    </div>
  );
}
