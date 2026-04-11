// Hook for executive presentation CRUD — backed by Supabase
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { PresentationTypeConfig, OpportunityData, LinkedProject, ProjectScopeGroup } from "@/data/executivePresentationData";

// ── Presentation Type Config (per proposal_type) ─────────────────────

export function usePresentationTypeConfig(proposalTypeId: string | undefined) {
  return useQuery({
    queryKey: ["presentation_type_config", proposalTypeId],
    queryFn: async () => {
      if (!proposalTypeId) return null;
      const { data, error } = await supabase
        .from("presentation_type_configs")
        .select("*")
        .eq("proposal_type_id", proposalTypeId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!proposalTypeId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpsertPresentationTypeConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      proposalTypeId: string;
      config: PresentationTypeConfig;
    }) => {
      const row = {
        proposal_type_id: params.proposalTypeId,
        executive_summary: params.config.executiveSummary,
        positioning_text: params.config.positioningText,
        problem_statement: params.config.problemStatement,
        solution_approach: params.config.solutionApproach,
        default_benefits: params.config.defaultBenefits as any,
        default_scope_blocks: params.config.defaultScopeBlocks as any,
        default_timeline: params.config.defaultTimeline as any,
        pricing_display_mode: params.config.pricingDisplayMode,
        differentiators: params.config.differentiators as any,
        default_cta: params.config.defaultCta,
        preferred_template: params.config.preferredTemplate,
        references: params.config.references as any,
      };
      const { data, error } = await supabase
        .from("presentation_type_configs")
        .upsert(row, { onConflict: "proposal_type_id" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["presentation_type_config", vars.proposalTypeId] });
    },
  });
}

// ── Executive Presentations (generated entities) ─────────────────────

export function useExecutivePresentations(proposalId: string | undefined) {
  return useQuery({
    queryKey: ["executive_presentations", proposalId],
    queryFn: async () => {
      if (!proposalId) return [];
      const { data, error } = await supabase
        .from("executive_presentations")
        .select("*")
        .eq("proposal_id", proposalId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!proposalId,
    staleTime: 60 * 1000,
  });
}

export function useExecutivePresentation(id: string | undefined) {
  return useQuery({
    queryKey: ["executive_presentation", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("executive_presentations")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

export function useExecutivePresentationBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: ["executive_presentation_share", slug],
    queryFn: async () => {
      if (!slug) return null;
      const { data, error } = await supabase
        .from("executive_presentations")
        .select("*")
        .eq("share_slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
    staleTime: 60 * 1000,
  });
}

export function useCreateExecutivePresentation() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      proposalId: string;
      proposalTypeId: string;
      config: Record<string, any>;
      composedData: Record<string, any>;
      dataSources: Record<string, boolean>;
    }) => {
      const shareSlug = `ep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const { data, error } = await supabase
        .from("executive_presentations")
        .insert({
          proposal_id: params.proposalId,
          proposal_type_id: params.proposalTypeId,
          config: params.config as any,
          composed_data: params.composedData as any,
          data_sources: params.dataSources as any,
          share_slug: shareSlug,
          created_by: user?.id ?? "",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["executive_presentations", vars.proposalId] });
    },
  });
}

export function useUpdateExecutivePresentationOverrides() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; overrides: Record<string, string> }) => {
      const { error } = await supabase
        .from("executive_presentations")
        .update({ overrides: params.overrides as any })
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["executive_presentation", vars.id] });
    },
  });
}

// ── Client enrichment fields ─────────────────────────────────────────

export function useClientEnrichment(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client_enrichment", clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, cnpj, website, logo_url, institutional_description, strategic_notes")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
  });
}
