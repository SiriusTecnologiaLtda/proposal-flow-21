import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ============ UNITS ============
export function useUnits() {
  return useQuery({
    queryKey: ["units"],
    queryFn: async () => {
      const { data, error } = await supabase.from("unit_info").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (unit: { name: string; cnpj?: string; contact?: string; email?: string; phone?: string; address?: string; city?: string; tax_factor?: number }) => {
      const { data, error } = await supabase.from("unit_info").insert(unit).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["units"] }),
  });
}

export function useUpdateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { data, error } = await supabase.from("unit_info").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["units"] }),
  });
}

// ============ CLIENTS ============
export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*, unit_info(id, name), esn:sales_team!clients_esn_id_fkey(id, name, code), gsn:sales_team!clients_gsn_id_fkey(id, name, code)")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (client: { code: string; name: string; cnpj: string; contact?: string; email?: string; phone?: string; address?: string; state_registration?: string; unit_id?: string | null; esn_id?: string | null; gsn_id?: string | null }) => {
      const { data, error } = await supabase.from("clients").insert(client).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { data, error } = await supabase.from("clients").update(updates).eq("id", id).select().single();
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
      const { data, error } = await supabase
        .from("sales_team")
        .select("*, unit_info(id, name)")
        .order("name");
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

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (product: { name: string }) => {
      const { data, error } = await supabase.from("products").insert(product).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name: string }) => {
      const { data, error } = await supabase.from("products").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

// ============ CATEGORIES ============
export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (category: { name: string }) => {
      const { data, error } = await supabase.from("categories").insert(category).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name: string }) => {
      const { data, error } = await supabase.from("categories").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
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

export function useProposal(id: string | undefined) {
  return useQuery({
    queryKey: ["proposal", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposals")
        .select("*, clients(name), proposal_scope_items(*), payment_conditions(*)")
        .eq("id", id!)
        .single();
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

export function useUpdateProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, scopeItems, payments, ...proposalData }: any) => {
      const { data, error } = await supabase.from("proposals").update(proposalData).eq("id", id).select().single();
      if (error) throw error;

      // Replace scope items
      await supabase.from("proposal_scope_items").delete().eq("proposal_id", id);
      if (scopeItems && scopeItems.length > 0) {
        const items = scopeItems.map((item: any) => ({ ...item, proposal_id: id }));
        const { error: scopeError } = await supabase.from("proposal_scope_items").insert(items);
        if (scopeError) throw scopeError;
      }

      // Replace payments
      await supabase.from("payment_conditions").delete().eq("proposal_id", id);
      if (payments && payments.length > 0) {
        const paymentRows = payments.map((p: any) => ({ ...p, proposal_id: id }));
        const { error: payError } = await supabase.from("payment_conditions").insert(paymentRows);
        if (payError) throw payError;
      }

      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["proposals"] });
      qc.invalidateQueries({ queryKey: ["proposal", vars.id] });
    },
  });
}

export function useDeleteProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("proposal_scope_items").delete().eq("proposal_id", id);
      await supabase.from("payment_conditions").delete().eq("proposal_id", id);
      const { error } = await supabase.from("proposals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["proposals"] }),
  });
}

export function useUpdateProposalStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data, error } = await supabase.from("proposals").update({ status } as any).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["proposals"] }),
  });
}

// ============ UNIT INFO (legacy single) ============
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
