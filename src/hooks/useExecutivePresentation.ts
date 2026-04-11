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

// ── Transform a real proposal into OpportunityData ───────────────────

export function useProposalAsOpportunity(proposalId: string | undefined) {
  return useQuery({
    queryKey: ["proposal_as_opportunity", proposalId],
    queryFn: async (): Promise<OpportunityData | null> => {
      if (!proposalId) return null;

      // 1. Fetch proposal + client (left join, no !inner)
      const { data: proposal, error: pErr } = await supabase
        .from("proposals")
        .select(`
          id, number, description, client_id, expected_close_date, status, type, product,
          main_pain, objectives, current_scenario, why_act_now, solution_summary, solution_how,
          hourly_rate, created_at,
          clients(name, cnpj, website, logo_url, institutional_description, strategic_notes)
        `)
        .eq("id", proposalId)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!proposal) return null;

      const client = proposal.clients as any;

      // 2. Parallel: proposal_type + project
      const [proposalTypeResult, projectResult] = await Promise.all([
        supabase
          .from("proposal_types")
          .select("id, name, slug")
          .eq("slug", proposal.type)
          .maybeSingle(),
        supabase
          .from("projects")
          .select("id, description, status, group_notes")
          .eq("proposal_id", proposalId)
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

      const proposalType = proposalTypeResult.data;

      // 3. Fetch linked project scope
      let linkedProject: LinkedProject | undefined;
      const projects = projectResult.data;

      const project = projects?.[0];
      if (project) {
        // Fetch scope items
        const { data: scopeItems = [] } = await supabase
          .from("project_scope_items")
          .select("id, description, hours, included, parent_id, phase, sort_order")
          .eq("project_id", project.id)
          .order("sort_order");

        // Group by phase
        const phaseMap = new Map<number, typeof scopeItems>();
        for (const item of scopeItems) {
          const phase = item.phase ?? 1;
          if (!phaseMap.has(phase)) phaseMap.set(phase, []);
          phaseMap.get(phase)!.push(item);
        }

        const groupNotes = (project.group_notes as any) ?? {};
        const scopeGroups: ProjectScopeGroup[] = [];

        for (const [phase, items] of Array.from(phaseMap.entries()).sort((a, b) => a[0] - b[0])) {
          const parentItem = items
            .filter((i) => !i.parent_id)
            .sort((a, b) => a.sort_order - b.sort_order)[0];
          const title = parentItem?.description || `Fase ${phase}`;

          const includedItems = items.filter((i) => i.included);

          const phaseKey = `fase_${phase}`;
          const phaseNotes = groupNotes?.grupos?.[phaseKey] ?? groupNotes?.[phaseKey] ?? {};

          scopeGroups.push({
            id: `phase_${phase}`,
            title,
            source: "project",
            itemCount: includedItems.length,
            totalHours: includedItems.reduce((sum, i) => sum + (i.hours ?? 0), 0),
            items: items.map((i) => ({
              id: i.id,
              description: i.description,
              hours: i.hours ?? 0,
              included: i.included,
            })),
            executiveObjective: phaseNotes.executive_objective || undefined,
            expectedImpact: phaseNotes.expected_impact || undefined,
            executiveSummary: phaseNotes.executive_summary || undefined,
          });
        }

        linkedProject = {
          id: project.id,
          description: project.description || "",
          status: project.status,
          scopeGroups,
          totalHours: scopeGroups.reduce((s, g) => s + g.totalHours, 0),
          totalItems: scopeGroups.reduce((s, g) => s + g.itemCount, 0),
        };
      }

      // 4. Calculate investmentTotal: prefer service_items, fallback to macro_scope
      const [serviceItemsResult, macroScopeResult] = await Promise.all([
        supabase
          .from("proposal_service_items")
          .select("calculated_hours, hourly_rate, is_base_scope")
          .eq("proposal_id", proposalId),
        supabase
          .from("proposal_macro_scope")
          .select("analyst_hours, gp_hours")
          .eq("proposal_id", proposalId),
      ]);

      let investmentTotal = 0;
      const serviceItems = serviceItemsResult.data;
      const macroScope = macroScopeResult.data;

      if (serviceItems && serviceItems.length > 0) {
        investmentTotal = serviceItems
          .reduce((sum, si) => sum + (si.calculated_hours ?? 0) * (si.hourly_rate ?? 0), 0);
      } else if (macroScope && macroScope.length > 0) {
        const totalHours = macroScope.reduce(
          (sum, row) => sum + (row.analyst_hours ?? 0) + (row.gp_hours ?? 0),
          0
        );
        investmentTotal = totalHours * (proposal.hourly_rate ?? 0);
      }

      // 4. Build OpportunityData
      const objectives = Array.isArray(proposal.objectives)
        ? (proposal.objectives as string[])
        : [];

      return {
        id: proposal.id,
        company: client?.name ?? "",
        contact: "",
        contactRole: "",
        segment: "",
        opportunityTypeSlug: proposalType?.slug ?? "",
        opportunityTypeLabel: proposalType?.name ?? proposal.type ?? "",
        stage: proposal.status,
        mainPain: (proposal as any).main_pain ?? "",
        objectives,
        currentScenario: (proposal as any).current_scenario ?? "",
        whyActNow: (proposal as any).why_act_now ?? "",
        solutionSummary: (proposal as any).solution_summary ?? "",
        solutionHow: (proposal as any).solution_how ?? "",
        scopeBlocks: [],
        benefits: [],
        timeline: [],
        investmentTotal,
        investmentSetup: undefined,
        investmentRecurring: undefined,
        differentiators: [],
        nextStep: "",
        nextStepCta: "",
        createdAt: proposal.created_at,
        expectedCloseDate: proposal.expected_close_date ?? "",
        linkedProject,
      };
    },
    enabled: !!proposalId,
    staleTime: 60 * 1000,
  });
}
