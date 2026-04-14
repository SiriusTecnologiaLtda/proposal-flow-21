/**
 * Background extraction service — runs extractions independently of component lifecycle.
 * Toasts fire even if the user navigates away from the page.
 */
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { QueryClient } from "@tanstack/react-query";

type Listener = (extractingIds: Set<string>) => void;

const extractingIds = new Set<string>();
const listeners = new Set<Listener>();

function notify() {
  const snapshot = new Set(extractingIds);
  listeners.forEach((fn) => fn(snapshot));
}

export function subscribeExtracting(fn: Listener): () => void {
  listeners.add(fn);
  fn(new Set(extractingIds)); // emit current state immediately
  return () => listeners.delete(fn);
}

export function getExtractingIds(): Set<string> {
  return new Set(extractingIds);
}

function invalidateAll(qc: QueryClient, id?: string) {
  qc.invalidateQueries({ queryKey: ["software-proposals"] });
  if (id) {
    qc.invalidateQueries({ queryKey: ["software-proposal", id] });
    qc.invalidateQueries({ queryKey: ["software-proposal-items", id] });
    qc.invalidateQueries({ queryKey: ["extraction-issues", id] });
  }
}

/** Run a single extraction in the background. Returns immediately. */
export function startExtraction(proposalId: string, qc: QueryClient) {
  if (extractingIds.has(proposalId)) return; // already running

  extractingIds.add(proposalId);
  notify();

  toast.info("Extração iniciada em background…", { duration: 2000 });

  supabase.functions
    .invoke("extract-software-proposal", {
      body: { software_proposal_id: proposalId },
    })
    .then(({ data, error }) => {
      if (error || data?.error) {
        const msg = data?.error || error?.message || "Erro na extração";
        toast.error(msg);
      } else {
        toast.success(
          `Extração concluída — ${data.items_extracted} itens extraídos, ${data.issues_created} pendências`,
          { duration: 5000 }
        );
      }
      invalidateAll(qc, proposalId);
    })
    .catch((err) => {
      toast.error(err?.message || "Erro na extração");
      invalidateAll(qc, proposalId);
    })
    .finally(() => {
      extractingIds.delete(proposalId);
      notify();
    });
}

/** Run bulk extraction in the background. Returns immediately. */
export function startBulkExtraction(ids: string[], qc: QueryClient, onDone?: () => void) {
  if (ids.length === 0) return;

  // Mark all as extracting
  ids.forEach((id) => extractingIds.add(id));
  notify();

  toast.info(`Extração em lote iniciada — ${ids.length} proposta(s) em background…`, { duration: 3000 });

  (async () => {
    let successCount = 0;
    let errorCount = 0;
    let creditError = false;

    for (const id of ids) {
      if (creditError) break;

      try {
        const { data, error } = await supabase.functions.invoke("extract-software-proposal", {
          body: { software_proposal_id: id },
        });
        if (error || data?.error) {
          const errMsg = data?.error || error?.message || "";
          if (errMsg.includes("Créditos") || errMsg.includes("créditos") || data?.fallback) {
            creditError = true;
            toast.error("Créditos de IA insuficientes. Extração em lote interrompida.");
          }
          throw new Error(errMsg);
        }
        successCount++;
      } catch {
        errorCount++;
      } finally {
        extractingIds.delete(id);
        notify();
      }
    }

    // Clear any remaining ids (e.g. skipped due to credit error)
    ids.forEach((id) => extractingIds.delete(id));
    notify();

    qc.invalidateQueries({ queryKey: ["software-proposals"] });

    if (creditError) {
      if (successCount > 0) {
        toast.info(
          `${successCount} proposta(s) extraída(s) antes do erro de créditos. ${ids.length - successCount - errorCount} não processada(s).`
        );
      }
    } else if (errorCount === 0) {
      toast.success(`Extração em lote concluída — ${successCount} propostas processadas`);
    } else {
      toast.warning(`Extração em lote: ${successCount} sucesso, ${errorCount} erro(s)`);
    }

    onDone?.();
  })();
}
