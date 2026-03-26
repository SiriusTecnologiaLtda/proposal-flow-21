import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, clients(name, code, cnpj, esn_id, gsn_id, unit_id, sales_team_esn:sales_team!clients_esn_id_fkey(id, name), sales_team_gsn:sales_team!clients_gsn_id_fkey(id, name), unit_info(id, name)), sales_team!projects_arquiteto_id_fkey(name), project_scope_items(id, description, hours, included, parent_id), project_attachments(id), proposal_id, proposal_number")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ["project", id],
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, clients(name), project_scope_items(*), project_attachments(*), proposal_id, proposal_number")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (project: any) => {
      const { scopeItems, ...projectData } = project;
      const projectId = project.id || crypto.randomUUID();

      const { error } = await supabase.from("projects").insert({ ...projectData, id: projectId });
      if (error) throw error;

      let localToReal: Map<string, string> | undefined;
      if (scopeItems && scopeItems.length > 0) {
        localToReal = await insertProjectScopeItems(scopeItems, projectId);
        // Update group_notes with real DB IDs for process_group_map
        await updateProcessGroupMap(projectId, scopeItems, localToReal, projectData.group_notes);
      }

      return { id: projectId };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, scopeItems, ...projectData }: any) => {
      const { error } = await supabase.from("projects").update(projectData).eq("id", id);
      if (error) throw error;

      // Replace scope items
      const { data: existingItems } = await supabase
        .from("project_scope_items")
        .select("id, parent_id")
        .eq("project_id", id);
      if (existingItems && existingItems.length > 0) {
        const childIds = existingItems.filter((i) => i.parent_id).map((i) => i.id);
        if (childIds.length > 0) await supabase.from("project_scope_items").delete().in("id", childIds);
        const parentIds = existingItems.filter((i) => !i.parent_id).map((i) => i.id);
        if (parentIds.length > 0) await supabase.from("project_scope_items").delete().in("id", parentIds);
      }

      let localToReal: Map<string, string> | undefined;
      if (scopeItems && scopeItems.length > 0) {
        localToReal = await insertProjectScopeItems(scopeItems, id);
        await updateProcessGroupMap(id, scopeItems, localToReal, projectData.group_notes);
      }

      return { id };
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project", vars.id] });
    },
  });
}

async function updateProcessGroupMap(
  projectId: string,
  scopeItems: any[],
  localToReal: Map<string, string>,
  currentGroupNotes: any
) {
  const processGroupMap: Record<string, string> = {};
  for (const item of scopeItems) {
    if (!item._parent_local_id) {
      const realId = localToReal.get(item._local_id || item.id);
      if (realId) {
        // Map to manual groupId or templateId
        const groupKey = item._groupId || item.template_id;
        if (groupKey) {
          processGroupMap[realId] = groupKey;
        }
      }
    }
  }
  // Merge with existing group_notes (preserve _group_order, _manual_groups etc.)
  const updatedNotes = { ...(currentGroupNotes || {}), _process_group_map: processGroupMap };
  await supabase.from("projects").update({ group_notes: updatedNotes }).eq("id", projectId);
}

export function useUpdateProjectStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("projects").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export async function insertProjectScopeItems(scopeItems: any[], projectId: string) {
  const localIdToRealId = new Map<string, string>();

  const rows = scopeItems.map((item: any) => {
    const realId = item.id?.startsWith?.("local_") ? crypto.randomUUID() : item.id || crypto.randomUUID();
    localIdToRealId.set(item._local_id || item.id, realId);
    return {
      id: realId,
      project_id: projectId,
      description: item.description,
      included: item.included,
      hours: item.hours,
      phase: item.phase || 1,
      notes: item.notes || "",
      sort_order: item.sort_order,
      template_id: item.template_id || null,
      parent_id: item._parent_local_id ? null : item.parent_id || null,
    };
  });

  const normalizedRows = rows.map((row: any, index: number) => {
    const source = scopeItems[index];
    return {
      ...row,
      parent_id: source._parent_local_id
        ? localIdToRealId.get(source._parent_local_id) || null
        : row.parent_id,
    };
  });

  const { error } = await supabase.from("project_scope_items").insert(normalizedRows);
  if (error) throw error;
  return localIdToRealId;
}
