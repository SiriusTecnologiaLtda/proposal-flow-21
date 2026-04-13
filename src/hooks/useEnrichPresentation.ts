import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useEnrichPresentation() {
  return useMutation({
    mutationFn: async (payload: {
      proposalId: string;
      fields: Record<string, any>;
    }) => {
      const { data, error } = await supabase.functions.invoke(
        "enrich-presentation",
        { body: payload }
      );
      if (error) throw error;
      return data as { enriched: boolean; data: Record<string, any> };
    },
  });
}
