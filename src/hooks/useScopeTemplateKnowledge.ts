import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useScopeTemplateKnowledge(templateId: string | undefined) {
  return useQuery({
    queryKey: ["scope_template_knowledge", templateId],
    queryFn: async () => {
      if (!templateId) return null;
      const { data, error } = await supabase
        .from("scope_template_knowledge")
        .select("*")
        .eq("template_id", templateId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!templateId,
    staleTime: 60 * 1000,
  });
}

export function useUpsertScopeTemplateKnowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      templateId: string;
      commercial_description: string;
      executive_benefits: string[];
      executive_notes: string;
      generation_preprompt: string;
    }) => {
      const { data, error } = await supabase
        .from("scope_template_knowledge")
        .upsert(
          {
            template_id: params.templateId,
            commercial_description: params.commercial_description,
            executive_benefits: params.executive_benefits as any,
            executive_notes: params.executive_notes,
            generation_preprompt: params.generation_preprompt,
          },
          { onConflict: "template_id" }
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["scope_template_knowledge", vars.templateId] });
    },
  });
}

export function useScopeTemplateSources(templateId: string | undefined) {
  return useQuery({
    queryKey: ["scope_template_sources", templateId],
    queryFn: async () => {
      if (!templateId) return [];
      const { data, error } = await supabase
        .from("scope_template_sources")
        .select("*")
        .eq("template_id", templateId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!templateId,
    staleTime: 30 * 1000,
  });
}

export function useAddScopeTemplateSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      template_id: string;
      source_type: string;
      label: string;
      url?: string;
      drive_file_id?: string;
      drive_file_name?: string;
    }) => {
      const { data, error } = await supabase
        .from("scope_template_sources")
        .insert({
          template_id: params.template_id,
          source_type: params.source_type,
          label: params.label,
          url: params.url ?? null,
          drive_file_id: params.drive_file_id ?? null,
          drive_file_name: params.drive_file_name ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["scope_template_sources", vars.template_id] });
    },
  });
}

export function useDeleteScopeTemplateSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; templateId: string }) => {
      const { error } = await supabase
        .from("scope_template_sources")
        .delete()
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["scope_template_sources", vars.templateId] });
    },
  });
}
