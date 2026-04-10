import { useParams } from "react-router-dom";
import { executivePresentationStore, defaultPresentationConfig } from "@/data/executivePresentationData";
import PresentationRenderer from "@/components/executive-presentation/PresentationRenderer";

export default function ExecutivePresentationSharePage() {
  const { id } = useParams<{ id: string }>();
  const presentation = executivePresentationStore.getPresentationByShare(id ?? "");

  if (!presentation) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Apresentação não encontrada ou link inválido.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <PresentationRenderer
          data={presentation.composedData}
          config={presentation.config}
          overrides={presentation.overrides}
        />
        <footer className="mt-16 border-t pt-6 text-center text-xs text-muted-foreground">
          <p>Este documento é confidencial e destinado exclusivamente ao destinatário indicado.</p>
          <p className="mt-1">© {new Date().getFullYear()} — Documento gerado automaticamente</p>
        </footer>
      </div>
    </div>
  );
}
