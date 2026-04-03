import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, FileWarning, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type ProposalPdfRecord = {
  id: string;
  file_name: string;
  file_url: string | null;
};

const SoftwareProposalPdfViewerPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const {
    data: proposal,
    isLoading: isProposalLoading,
    error: proposalError,
  } = useQuery({
    queryKey: ["software-proposal-pdf-viewer", id],
    enabled: !!id,
    queryFn: async (): Promise<ProposalPdfRecord> => {
      const { data, error } = await supabase
        .from("software_proposals")
        .select("id, file_name, file_url")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Proposta não encontrada.");
      if (!data.file_url) throw new Error("PDF não disponível para esta proposta.");

      return data;
    },
  });

  useEffect(() => {
    if (!proposal?.file_url) return;

    let objectUrl: string | null = null;
    let cancelled = false;

    setPdfUrl(null);
    setLoadError(null);

    const loadPdf = async () => {
      try {
        const { data, error } = await supabase.storage
          .from("software-proposal-pdfs")
          .download(proposal.file_url);

        if (error) throw error;

        objectUrl = URL.createObjectURL(data);

        if (!cancelled) {
          setPdfUrl(objectUrl);
        }
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Não foi possível carregar o PDF.");
      }
    };

    void loadPdf();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [proposal?.file_url]);

  const errorMessage = useMemo(() => {
    if (proposalError instanceof Error) return proposalError.message;
    return loadError;
  }, [loadError, proposalError]);

  const handleDownload = () => {
    if (!pdfUrl || !proposal) return;

    const link = document.createElement("a");
    link.href = pdfUrl;
    link.download = proposal.file_name || "proposta.pdf";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const isPdfLoading = !!proposal?.file_url && !pdfUrl && !errorMessage;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Propostas de Software
            </p>
            <h1 className="truncate text-base font-semibold text-foreground">
              {proposal?.file_name || "Visualizador de PDF"}
            </h1>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate(`/propostas-software/${id}`)}>
              <ArrowLeft className="h-4 w-4" />
              Abrir detalhe
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleDownload} disabled={!pdfUrl}>
              <Download className="h-4 w-4" />
              Baixar PDF
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 bg-muted/30 p-4">
        {isProposalLoading || isPdfLoading ? (
          <div className="flex h-[calc(100vh-104px)] flex-col items-center justify-center gap-3 rounded-lg border border-border bg-background">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Carregando PDF da proposta...</p>
          </div>
        ) : errorMessage ? (
          <div className="flex h-[calc(100vh-104px)] flex-col items-center justify-center gap-3 rounded-lg border border-border bg-background px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <FileWarning className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">Não foi possível abrir o PDF</h2>
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
            </div>
            <Button variant="outline" onClick={() => navigate(`/propostas-software/${id}`)}>
              Voltar para a proposta
            </Button>
          </div>
        ) : pdfUrl ? (
          <div className="h-[calc(100vh-104px)] overflow-hidden rounded-lg border border-border bg-background shadow-sm">
            <iframe
              key={pdfUrl}
              src={pdfUrl}
              title={proposal?.file_name || "PDF da proposta"}
              className="h-full w-full"
            />
          </div>
        ) : null}
      </main>
    </div>
  );
};

export default SoftwareProposalPdfViewerPage;