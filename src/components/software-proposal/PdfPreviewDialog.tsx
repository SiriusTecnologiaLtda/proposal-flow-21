import { useEffect, useState } from "react";
import { Download, FileWarning, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

interface PdfPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposalId: string | null;
}

const PdfPreviewDialog = ({ open, onOpenChange, proposalId }: PdfPreviewDialogProps) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");

  useEffect(() => {
    if (!open || !proposalId) {
      setPdfUrl(null);
      setError(null);
      setFileName("");
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      setPdfUrl(null);

      try {
        const { data: proposal, error: qErr } = await supabase
          .from("software_proposals")
          .select("file_name, file_url")
          .eq("id", proposalId)
          .maybeSingle();

        if (qErr) throw qErr;
        if (!proposal?.file_url) throw new Error("PDF não disponível para esta proposta.");

        setFileName(proposal.file_name || "proposta.pdf");

        const { data: blob, error: dlErr } = await supabase.storage
          .from("software-proposal-pdfs")
          .download(proposal.file_url);

        if (dlErr) throw dlErr;

        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setPdfUrl(objectUrl);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Não foi possível carregar o PDF.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, proposalId]);

  const handleDownload = () => {
    if (!pdfUrl) return;
    const link = document.createElement("a");
    link.href = pdfUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] max-w-5xl flex-col gap-0 p-0">
        <DialogHeader className="flex flex-row items-center justify-between border-b border-border px-4 py-3">
          <DialogTitle className="truncate text-sm font-semibold">
            {fileName || "Visualizador de PDF"}
          </DialogTitle>
          <Button
            variant="outline"
            size="sm"
            className="mr-6 gap-2"
            onClick={handleDownload}
            disabled={!pdfUrl}
          >
            <Download className="h-3.5 w-3.5" />
            Baixar
          </Button>
        </DialogHeader>

        <div className="flex-1 overflow-hidden bg-muted/30">
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Carregando PDF...</p>
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <FileWarning className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-foreground">Não foi possível abrir o PDF</h2>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            </div>
          ) : pdfUrl ? (
            <iframe
              key={pdfUrl}
              src={pdfUrl}
              title={fileName}
              className="h-full w-full"
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PdfPreviewDialog;
