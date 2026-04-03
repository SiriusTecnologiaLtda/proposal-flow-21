import { useEffect, useRef, useState } from "react";
import { Download, FileWarning, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";

GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

interface PdfPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposalId: string | null;
}

interface PdfPageCanvasProps {
  documentProxy: any;
  pageNumber: number;
}

const PdfPageCanvas = ({ documentProxy, pageNumber }: PdfPageCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isRendering, setIsRendering] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: any = null;

    const renderPage = async () => {
      try {
        setIsRendering(true);
        setRenderError(null);

        const page = await documentProxy.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Não foi possível preparar a visualização do PDF.");

        const baseViewport = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(Math.min(window.innerWidth - 96, 1040), 280);
        const cssScale = Math.min(availableWidth / baseViewport.width, 1.6);
        const viewport = page.getViewport({ scale: cssScale });
        const outputScale = window.devicePixelRatio || 1;
        const renderViewport = page.getViewport({ scale: cssScale * outputScale });

        canvas.width = Math.ceil(renderViewport.width);
        canvas.height = Math.ceil(renderViewport.height);
        canvas.style.width = `${Math.ceil(viewport.width)}px`;
        canvas.style.height = `${Math.ceil(viewport.height)}px`;

        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);

        renderTask = page.render({
          canvasContext: context,
          viewport: renderViewport,
        });

        await renderTask.promise;
        if (!cancelled) setIsRendering(false);
      } catch (err: any) {
        if (cancelled || err?.name === "RenderingCancelledException") return;
        setRenderError(err instanceof Error ? err.message : "Não foi possível renderizar esta página do PDF.");
        setIsRendering(false);
      }
    };

    void renderPage();

    return () => {
      cancelled = true;
      if (renderTask) {
        void renderTask.cancel();
      }
    };
  }, [documentProxy, pageNumber]);

  if (renderError) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-lg border border-destructive/20 bg-background px-4 py-6 text-center">
        <p className="text-sm text-destructive">{renderError}</p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-background shadow-sm">
      {isRendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      )}
      <canvas ref={canvasRef} className="mx-auto block max-w-full" />
    </div>
  );
};

const PdfPreviewDialog = ({ open, onOpenChange, proposalId }: PdfPreviewDialogProps) => {
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfDocument, setPdfDocument] = useState<any | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");

  useEffect(() => {
    if (!open || !proposalId) {
      setPdfBlob(null);
      setPdfDocument(null);
      setPageCount(0);
      setError(null);
      setFileName("");
      return;
    }

    let cancelled = false;
    let loadingTask: any = null;
    let documentProxy: any = null;

    const load = async () => {
      setLoading(true);
      setError(null);
      setPdfBlob(null);
      setPdfDocument(null);
      setPageCount(0);

      try {
        const { data: proposal, error: qErr } = await supabase
          .from("software_proposals")
          .select("file_name, file_url")
          .eq("id", proposalId)
          .maybeSingle();

        if (qErr) throw qErr;
        if (!proposal?.file_url) throw new Error("PDF não disponível para esta proposta.");
        if (cancelled) return;

        setFileName(proposal.file_name || "proposta.pdf");

        const { data: blob, error: dlErr } = await supabase.storage
          .from("software-proposal-pdfs")
          .download(proposal.file_url);

        if (dlErr) throw dlErr;
        if (!blob || blob.size === 0) throw new Error("Arquivo PDF retornado está vazio.");

        const pdfBlob = blob.type === "application/pdf"
          ? blob
          : new Blob([blob], { type: "application/pdf" });

        const bytes = new Uint8Array(await pdfBlob.arrayBuffer());
        if (cancelled) return;

        loadingTask = getDocument({ data: bytes });
        documentProxy = await loadingTask.promise;
        if (cancelled) {
          await documentProxy?.destroy?.();
          return;
        }

        setPdfBlob(pdfBlob);
        setPdfDocument(documentProxy);
        setPageCount(documentProxy.numPages || 0);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Não foi possível carregar o PDF.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      void loadingTask?.destroy?.();
      void documentProxy?.destroy?.();
    };
  }, [open, proposalId]);

  const handleDownload = () => {
    if (!pdfBlob) return;
    const downloadUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] max-w-6xl flex-col gap-0 p-0">
        <DialogHeader className="flex flex-row items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <DialogTitle className="truncate text-sm font-semibold">
              {fileName || "Visualizador de PDF"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Pré-visualização interna do PDF importado, renderizada diretamente no aplicativo.
            </DialogDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mr-6 gap-2"
            onClick={handleDownload}
            disabled={!pdfBlob}
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
          ) : pdfDocument ? (
            <div className="h-full overflow-auto px-4 py-4">
              <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
                {Array.from({ length: pageCount }, (_, index) => (
                  <div key={`${proposalId}-${index + 1}`} className="space-y-2">
                    <PdfPageCanvas documentProxy={pdfDocument} pageNumber={index + 1} />
                    <p className="text-center text-xs text-muted-foreground">Página {index + 1} de {pageCount}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PdfPreviewDialog;
