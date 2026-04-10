import { useState, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Share2, Copy, FileDown, Pencil, Eye } from "lucide-react";
import { toast } from "sonner";
import { executivePresentationStore } from "@/data/executivePresentationData";
import PresentationRenderer from "@/components/executive-presentation/PresentationRenderer";

export default function ExecutivePresentationPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const presentation = executivePresentationStore.getPresentation(id ?? "");

  const [editing, setEditing] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>(
    presentation?.overrides ?? {},
  );

  // Sync overrides back to store on change
  useEffect(() => {
    if (presentation) {
      executivePresentationStore.updateOverrides(presentation.id, overrides);
    }
  }, [overrides, presentation?.id]);

  if (!presentation) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-muted-foreground">Apresentação não encontrada.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>Voltar</Button>
      </div>
    );
  }

  const handleEdit = useCallback((field: string, value: string) => {
    setOverrides((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleShare = () => {
    const url = `${window.location.origin}/apresentacao-publica/${presentation.shareSlug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado!", { description: "O link da apresentação foi copiado para a área de transferência." });
  };

  const handleDuplicate = () => {
    const dup = executivePresentationStore.duplicatePresentation(presentation.id);
    if (dup) {
      toast.success("Apresentação duplicada", { description: "Uma cópia foi criada com sucesso." });
      navigate(`/apresentacao-executiva/${dup.id}`);
    }
  };

  const handleExportPdf = () => {
    toast.info("Exportação PDF", { description: "Funcionalidade disponível em breve." });
  };

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="sticky top-0 z-30 -mx-6 -mt-6 border-b bg-background/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-sm font-semibold text-foreground">Apresentação Executiva</h1>
              <p className="text-xs text-muted-foreground">{presentation.composedData.company}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={editing ? "default" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={() => setEditing(!editing)}
            >
              {editing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
              {editing ? "Visualizar" : "Editar"}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDuplicate}>
              <Copy className="h-3.5 w-3.5" /> Duplicar
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportPdf}>
              <FileDown className="h-3.5 w-3.5" /> PDF
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handleShare}>
              <Share2 className="h-3.5 w-3.5" /> Compartilhar
            </Button>
          </div>
        </div>
      </div>

      {/* Presentation */}
      <div className="mx-auto max-w-5xl pb-16">
        <PresentationRenderer
          data={presentation.composedData}
          config={presentation.config}
          editable={editing}
          overrides={overrides}
          onEdit={handleEdit}
        />
      </div>
    </div>
  );
}
