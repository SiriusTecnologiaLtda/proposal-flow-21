import { useParams } from "react-router-dom";
import { mockOpportunities, defaultPresentationConfig } from "@/data/executivePresentationData";
import PresentationRenderer from "@/components/executive-presentation/PresentationRenderer";

export default function ExecutivePresentationSharePage() {
  const { id } = useParams<{ id: string }>();
  const data = mockOpportunities.find((o) => o.id === id) ?? mockOpportunities[0];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <PresentationRenderer
          data={data}
          config={defaultPresentationConfig}
        />
        <footer className="mt-16 border-t pt-6 text-center text-xs text-muted-foreground">
          <p>Este documento é confidencial e destinado exclusivamente ao destinatário indicado.</p>
          <p className="mt-1">© {new Date().getFullYear()} — Documento gerado automaticamente</p>
        </footer>
      </div>
    </div>
  );
}
