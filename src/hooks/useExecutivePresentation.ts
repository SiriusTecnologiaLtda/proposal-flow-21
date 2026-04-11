// Hook for executive presentation CRUD — backed by Supabase
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { PresentationTypeConfig, OpportunityData, LinkedProject, ProjectScopeGroup, TemplateKnowledge } from "@/data/executivePresentationData";

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

// ── Scope grouping helper ───────────────────────────────────────────

interface RawScopeItem {
  id: string;
  description: string;
  hours: number;
  included: boolean;
  parent_id: string | null;
  template_id: string | null;
  sort_order: number;
  phase?: number;
}

async function buildScopeGroups(
  items: RawScopeItem[],
  groupNotes: any,
  source: "project" | "proposal",
): Promise<ProjectScopeGroup[]> {
  if (!items || items.length === 0) return [];

  // Step 2: Separate parents and children
  const parents = items.filter((i) => !i.parent_id).sort((a, b) => a.sort_order - b.sort_order);
  const childrenByParent = new Map<string, RawScopeItem[]>();
  for (const item of items) {
    if (item.parent_id) {
      if (!childrenByParent.has(item.parent_id)) childrenByParent.set(item.parent_id, []);
      childrenByParent.get(item.parent_id)!.push(item);
    }
  }

  // Step 3: Determine groupKey for each parent
  const processGroupMap: Record<string, string> = groupNotes?._process_group_map ?? {};
  const groupOrder: string[] = groupNotes?._group_order ?? [];
  const manualGroups: Record<string, string> = groupNotes?._manual_groups ?? {};

  const groupedParents = new Map<string, RawScopeItem[]>();

  for (const parent of parents) {
    let groupKey: string;
    if (parent.template_id) {
      groupKey = parent.template_id;
    } else if (processGroupMap[parent.id]) {
      groupKey = processGroupMap[parent.id];
    } else {
      groupKey = "_ungrouped";
    }
    if (!groupedParents.has(groupKey)) groupedParents.set(groupKey, []);
    groupedParents.get(groupKey)!.push(parent);
  }

  // Step 5: Sort groups by _group_order
  const sortedGroupKeys = Array.from(groupedParents.keys()).sort((a, b) => {
    const idxA = groupOrder.indexOf(a);
    const idxB = groupOrder.indexOf(b);
    if (idxA === -1 && idxB === -1) return 0;
    if (idxA === -1) return 1;
    if (idxB === -1) return -1;
    return idxA - idxB;
  });

  // Step 7: Collect unique template_ids for name resolution and knowledge
  const templateIds = sortedGroupKeys.filter(
    (k) => k !== "_ungrouped" && !manualGroups[k] && k.match(/^[0-9a-f-]{36}$/i)
  );

  let templateNameMap = new Map<string, string>();
  let knowledgeMap = new Map<string, TemplateKnowledge>();

  if (templateIds.length > 0) {
    const [templatesResult, knowledgeResult] = await Promise.all([
      supabase
        .from("scope_templates")
        .select("id, name")
        .in("id", templateIds),
      supabase
        .from("scope_template_knowledge")
        .select("template_id, commercial_description, executive_benefits, executive_notes")
        .in("template_id", templateIds),
    ]);

    for (const t of templatesResult.data ?? []) {
      templateNameMap.set(t.id, t.name);
    }
    for (const k of knowledgeResult.data ?? []) {
      const templateName = templateNameMap.get(k.template_id) ?? "";
      knowledgeMap.set(k.template_id, {
        template_id: k.template_id,
        template_name: templateName,
        commercial_description: k.commercial_description ?? "",
        executive_benefits: Array.isArray(k.executive_benefits) ? (k.executive_benefits as string[]) : [],
        executive_notes: k.executive_notes ?? "",
      });
    }
  }

  // Step 6 & 8: Build groups
  const scopeGroups: ProjectScopeGroup[] = [];
  let ungroupedIdx = 0;

  for (const groupKey of sortedGroupKeys) {
    const groupParents = groupedParents.get(groupKey)!;

    // Collect all items (parents + their children)
    const allItems: RawScopeItem[] = [];
    for (const p of groupParents) {
      allItems.push(p);
      const children = childrenByParent.get(p.id) ?? [];
      allItems.push(...children.sort((a, b) => a.sort_order - b.sort_order));
    }

    // Title resolution (Step 6)
    let title: string;
    if (templateNameMap.has(groupKey)) {
      title = templateNameMap.get(groupKey)!;
    } else if (manualGroups[groupKey]) {
      title = manualGroups[groupKey];
    } else {
      ungroupedIdx++;
      title = `Grupo ${ungroupedIdx}`;
    }

    // Executive notes from group_notes
    const phaseKey = `fase_${groupParents[0]?.phase ?? 1}`;
    const grupos = groupNotes?.grupos ?? {};
    const phaseNotes = grupos[groupKey] ?? grupos[phaseKey] ?? groupNotes?.[groupKey] ?? {};

    const includedItems = allItems.filter((i) => i.included);

    scopeGroups.push({
      id: groupKey,
      title,
      source,
      itemCount: includedItems.length,
      totalHours: includedItems.reduce((sum, i) => sum + (i.hours ?? 0), 0),
      items: allItems.map((i) => ({
        id: i.id,
        description: i.description,
        hours: i.hours ?? 0,
        included: i.included,
      })),
      executiveObjective: phaseNotes.executive_objective || undefined,
      expectedImpact: phaseNotes.expected_impact || undefined,
      executiveSummary: phaseNotes.executive_summary || undefined,
      templateKnowledge: knowledgeMap.get(groupKey),
    });
  }

  return scopeGroups;
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
          hourly_rate, created_at, group_notes,
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

      // 3. Build scope groups — prefer project, fallback to proposal
      let linkedProject: LinkedProject | undefined;
      const project = projectResult.data?.[0];

      let scopeGroups: ProjectScopeGroup[] = [];

      if (project) {
        // Fetch project scope items
        const { data: projectScopeItems = [] } = await supabase
          .from("project_scope_items")
          .select("id, description, hours, included, parent_id, template_id, sort_order, phase")
          .eq("project_id", project.id)
          .order("sort_order");

        scopeGroups = await buildScopeGroups(
          projectScopeItems as RawScopeItem[],
          project.group_notes ?? {},
          "project",
        );

        if (scopeGroups.length > 0) {
          linkedProject = {
            id: project.id,
            description: project.description || "",
            status: project.status,
            scopeGroups,
            totalHours: scopeGroups.reduce((s, g) => s + g.totalHours, 0),
            totalItems: scopeGroups.reduce((s, g) => s + g.itemCount, 0),
          };
        }
      }

      // Fallback: use proposal_scope_items if no project scope
      if (!linkedProject) {
        const { data: proposalScopeItems = [] } = await supabase
          .from("proposal_scope_items")
          .select("id, description, hours, included, parent_id, template_id, sort_order, phase")
          .eq("proposal_id", proposalId)
          .order("sort_order");

        scopeGroups = await buildScopeGroups(
          proposalScopeItems as RawScopeItem[],
          proposal.group_notes ?? {},
          "proposal",
        );

        if (scopeGroups.length > 0) {
          linkedProject = {
            id: proposalId,
            description: proposal.description || "",
            status: proposal.status,
            scopeGroups,
            totalHours: scopeGroups.reduce((s, g) => s + g.totalHours, 0),
            totalItems: scopeGroups.reduce((s, g) => s + g.itemCount, 0),
          };
        }
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

      // 5. Build OpportunityData
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
