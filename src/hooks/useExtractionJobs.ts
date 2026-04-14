/**
 * useExtractionJobs — Backend-driven extraction job management.
 * Replaces the old client-side backgroundExtraction.ts.
 * Uses Supabase Realtime for multi-tab state synchronization.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface ExtractionJob {
  id: string;
  proposal_id: string;
  batch_id: string | null;
  status: string;
  error_code: string | null;
  error_message: string | null;
  retryable: boolean;
  items_extracted: number | null;
  issues_created: number | null;
  created_at: string;
  finished_at: string | null;
}

interface BatchProgress {
  total: number;
  queued: number;
  running: number;
  success: number;
  failed: number;
  cancelled: number;
}

export function useExtractionJobs() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [jobs, setJobs] = useState<ExtractionJob[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const batchToastDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBatchProgressRef = useRef<BatchProgress | null>(null);

  // Derive extractingIds from active jobs
  const extractingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const job of jobs) {
      if (job.status === "queued" || job.status === "running") {
        ids.add(job.proposal_id);
      }
    }
    return ids;
  }, [jobs]);

  // Load initial active jobs
  useEffect(() => {
    if (!user) return;

    const loadActiveJobs = async () => {
      const { data } = await supabase
        .from("extraction_jobs")
        .select("*")
        .eq("requested_by", user.id)
        .in("status", ["queued", "running"])
        .order("created_at", { ascending: false });

      if (data) {
        setJobs(data as ExtractionJob[]);
        // Detect active batch
        const batches = data.filter((j: any) => j.batch_id).map((j: any) => j.batch_id);
        if (batches.length > 0) {
          setActiveBatchId(batches[0]);
        }
      }
    };

    loadActiveJobs();
  }, [user]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("extraction-jobs-user")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "extraction_jobs",
          filter: `requested_by=eq.${user.id}`,
        },
        (payload) => {
          const newRecord = payload.new as ExtractionJob;
          const eventType = payload.eventType;

          setJobs((prev) => {
            if (eventType === "INSERT") {
              return [newRecord, ...prev.filter((j) => j.id !== newRecord.id)];
            }
            if (eventType === "UPDATE") {
              const exists = prev.some((j) => j.id === newRecord.id);
              if (exists) {
                return prev.map((j) => (j.id === newRecord.id ? newRecord : j));
              }
              return [newRecord, ...prev];
            }
            if (eventType === "DELETE") {
              return prev.filter((j) => j.id !== (payload.old as any)?.id);
            }
            return prev;
          });

          // Handle notifications
          if (eventType === "UPDATE" && newRecord) {
            handleJobStatusChange(newRecord);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Handle individual job notifications
  const handleJobStatusChange = useCallback(
    (job: ExtractionJob) => {
      if (job.batch_id) {
        // Batch job: aggregate notifications with debounce
        scheduleBatchNotification(job.batch_id);

        // Invalidate individual proposal on success
        if (job.status === "success") {
          queryClient.invalidateQueries({ queryKey: ["software-proposal", job.proposal_id] });
          queryClient.invalidateQueries({ queryKey: ["software-proposal-items", job.proposal_id] });
          queryClient.invalidateQueries({ queryKey: ["extraction-issues", job.proposal_id] });
        }
      } else {
        // Unit job: immediate toast
        if (job.status === "success") {
          toast.success(
            `Extração concluída — ${job.items_extracted || 0} itens, ${job.issues_created || 0} pendências`,
            { duration: 5000 }
          );
          queryClient.invalidateQueries({ queryKey: ["software-proposals"] });
          queryClient.invalidateQueries({ queryKey: ["software-proposal", job.proposal_id] });
          queryClient.invalidateQueries({ queryKey: ["software-proposal-items", job.proposal_id] });
          queryClient.invalidateQueries({ queryKey: ["extraction-issues", job.proposal_id] });
        } else if (job.status === "failed") {
          const msg = job.error_code === "INSUFFICIENT_CREDITS"
            ? "Créditos de IA insuficientes"
            : `Erro na extração: ${job.error_message || job.error_code || "desconhecido"}`;
          toast.error(msg);
          queryClient.invalidateQueries({ queryKey: ["software-proposals"] });
        }
      }

      // Clean up finished jobs from state
      if (["success", "failed", "cancelled"].includes(job.status)) {
        setTimeout(() => {
          setJobs((prev) => prev.filter((j) => j.id !== job.id));
        }, 2000);
      }
    },
    [queryClient]
  );

  // Debounced batch notification
  const scheduleBatchNotification = useCallback(
    (batchId: string) => {
      if (batchToastDebounceRef.current) {
        clearTimeout(batchToastDebounceRef.current);
      }

      batchToastDebounceRef.current = setTimeout(async () => {
        // Compute progress from current jobs state
        const batchJobs = jobs.filter((j) => j.batch_id === batchId);
        // Also check DB for full picture
        const { data } = await supabase.functions.invoke("extraction-jobs", {
          body: { action: "batch_status", batch_id: batchId },
        });

        if (data && !data.error_code) {
          const progress = data as BatchProgress;
          const done = progress.success + progress.failed + progress.cancelled;
          const isComplete = done >= progress.total;

          if (isComplete) {
            // Final notification
            if (progress.failed > 0) {
              toast.warning(
                `Lote concluído: ${progress.success} sucesso, ${progress.failed} erro(s)`,
                { duration: 8000 }
              );
            } else {
              toast.success(
                `Lote concluído — ${progress.success} propostas extraídas com sucesso`,
                { duration: 5000 }
              );
            }
            queryClient.invalidateQueries({ queryKey: ["software-proposals"] });
            setActiveBatchId(null);
          } else {
            // Progress update (only if changed)
            const lastProgress = lastBatchProgressRef.current;
            if (!lastProgress || lastProgress.success !== progress.success || lastProgress.failed !== progress.failed) {
              toast.info(
                `Extração em lote: ${done}/${progress.total} processados${progress.failed > 0 ? ` (${progress.failed} erro(s))` : ""}`,
                { duration: 3000, id: `batch-progress-${batchId}` }
              );
            }
          }
          lastBatchProgressRef.current = progress;
        }
      }, 5000); // 5s debounce
    },
    [jobs, queryClient]
  );

  // Enqueue single extraction
  const enqueueExtraction = useCallback(
    async (proposalId: string) => {
      const { data, error } = await supabase.functions.invoke("extraction-jobs", {
        body: { action: "enqueue", proposal_id: proposalId },
      });

      if (error || data?.error_code) {
        toast.error(data?.message || error?.message || "Erro ao iniciar extração");
        return null;
      }

      if (data.is_existing) {
        toast.info("Extração já em andamento para esta proposta", { duration: 2000 });
      } else {
        toast.info("Extração iniciada em background…", { duration: 2000 });
      }

      return data.job_id;
    },
    []
  );

  // Enqueue bulk extraction
  const enqueueBulkExtraction = useCallback(
    async (proposalIds: string[]) => {
      if (proposalIds.length === 0) return null;

      const { data, error } = await supabase.functions.invoke("extraction-jobs", {
        body: { action: "enqueue_bulk", proposal_ids: proposalIds },
      });

      if (error || data?.error_code) {
        toast.error(data?.message || error?.message || "Erro ao iniciar extração em lote");
        return null;
      }

      toast.info(
        `Extração em lote iniciada — ${data.jobs_created} proposta(s) enfileiradas${data.jobs_skipped > 0 ? `, ${data.jobs_skipped} já em andamento` : ""}`,
        { duration: 3000 }
      );

      setActiveBatchId(data.batch_id);
      lastBatchProgressRef.current = null;

      return data.batch_id;
    },
    []
  );

  // Cancel batch
  const cancelBatch = useCallback(
    async (batchId?: string) => {
      const targetBatchId = batchId || activeBatchId;
      if (!targetBatchId) return;

      const { data, error } = await supabase.functions.invoke("extraction-jobs", {
        body: { action: "cancel_batch", batch_id: targetBatchId },
      });

      if (error || data?.error_code) {
        toast.error("Erro ao cancelar lote");
        return;
      }

      toast.info(`${data.cancelled_count} job(s) cancelado(s)`);
      if (targetBatchId === activeBatchId) {
        setActiveBatchId(null);
      }
    },
    [activeBatchId]
  );

  return {
    extractingIds,
    activeBatchId,
    enqueueExtraction,
    enqueueBulkExtraction,
    cancelBatch,
    jobs,
  };
}
