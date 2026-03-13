import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ============ CLIENTS ============
export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (client: { code: string; name: string; cnpj: string; contact?: string; email?: string; phone?: string; address?: string; state_registration?: string }) => {
      const { data, error } = await supabase.from("clients").insert(client).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

// ============ SALES TEAM ============
export function useSalesTeam() {
  return useQuery({
    queryKey: ["sales_team"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales_team").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

// ============ SCOPE TEMPLATES ============
export function useScopeTemplates() {
  return useQuery({
    queryKey: ["scope_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scope_templates")
        .select("*, scope_template_items(*)")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

// ============ PRODUCTS ============
export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

// ============ PROPOSALS ============
export function useProposals() {
  return useQuery({
    queryKey: ["proposals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposals")
        .select("*, clients(name), sales_team!proposals_esn_id_fkey(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (proposal: any) => {
      const { scopeItems, payments, ...proposalData } = proposal;
      
      const { data, error } = await supabase.from("proposals").insert(proposalData).select().single();
      if (error) throw error;

      if (scopeItems && scopeItems.length > 0) {
        const items = scopeItems.map((item: any) => ({ ...item, proposal_id: data.id }));
        const { error: scopeError } = await supabase.from("proposal_scope_items").insert(items);
        if (scopeError) throw scopeError;
      }

      if (payments && payments.length > 0) {
        const paymentRows = payments.map((p: any) => ({ ...p, proposal_id: data.id }));
        const { error: payError } = await supabase.from("payment_conditions").insert(paymentRows);
        if (payError) throw payError;
      }

      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["proposals"] }),
  });
}

// ============ UNIT INFO ============
export function useUnitInfo() {
  return useQuery({
    queryKey: ["unit_info"],
    queryFn: async () => {
      const { data, error } = await supabase.from("unit_info").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
