import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

function formatDateOnly(date: Date) {
  return date.toISOString().split("T")[0];
}

function getDefaultPaymentDueDate() {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);
  return formatDateOnly(dueDate);
}

function normalizeProposalPayments(payments: any[] | undefined) {
  if (!payments || payments.length === 0) return [];

  const fallbackDueDate = payments.find((payment) => payment?.due_date)?.due_date || getDefaultPaymentDueDate();

  return payments.map((payment: any, index: number) => ({
    ...payment,
    installment: payment.installment || index + 1,
    due_date: payment.due_date || fallbackDueDate,
    amount: Number(payment.amount) || 0,
  }));
}

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
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      let allData: any[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("clients")
          .select("id, name, code, cnpj, email, phone, address, contact, state_registration, store_code, unit_id, esn_id, gsn_id, unit_info(id, name), esn:sales_team!clients_esn_id_fkey(id, name, code), gsn:sales_team!clients_gsn_id_fkey(id, name, code)")
          .order("name")
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        allData = allData.concat(data || []);
        hasMore = (data?.length || 0) === PAGE_SIZE;
        from += PAGE_SIZE;
      }

      return allData;
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
      const { data, error } = await supabase.from("clients").update(updates).eq("id", id).select();
      if (error) throw error;
      return data?.[0] ?? null;
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
    mutationFn: async (category: { name: string; cost_classification?: string }) => {
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
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; cost_classification?: string }) => {
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

// ============ SEGMENTS ============
export function useSegments() {
  return useQuery({
    queryKey: ["segments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("software_segments").select("*").order("name");
      if (error) throw error;
      return data as { id: string; name: string; is_active: boolean; created_at: string }[];
    },
  });
}

export function useCreateSegment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (segment: { name: string }) => {
      const { data, error } = await supabase.from("software_segments").insert(segment as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["segments"] }),
  });
}

export function useUpdateSegment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name: string }) => {
      const { data, error } = await supabase.from("software_segments").update(updates as any).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["segments"] }),
  });
}

export function useDeleteSegment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("software_segments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["segments"] }),
  });
}

// ============ PROPOSALS ============
export function useProposals() {
  return useQuery({
    queryKey: ["proposals"],
    staleTime: 3 * 60 * 1000,
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      let allData: any[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("proposals")
          .select("id, number, type, status, scope_type, product, description, negotiation, client_id, esn_id, gsn_id, arquiteto_id, created_by, created_at, updated_at, date_validity, expected_close_date, hourly_rate, gp_percentage, accomp_analyst, accomp_gp, num_companies, needs_regen, ev_requested, group_notes, clients(name, unit_id), sales_team!proposals_esn_id_fkey(name, email, unit_id), arquiteto:sales_team!proposals_arquiteto_id_fkey(name, email), proposal_scope_items(hours, included, parent_id), proposal_service_items(id, calculated_hours, hourly_rate), proposal_documents(id, doc_type, created_at), proposal_signatures(id, status, tae_publication_id, tae_document_id, sent_at, created_at), projects(id, updated_at)")
          .order("created_at", { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        allData = allData.concat(data || []);
        hasMore = (data?.length || 0) === PAGE_SIZE;
        from += PAGE_SIZE;
      }

      return allData;
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

async function insertHierarchicalScopeItems(scopeItems: any[], proposalId: string) {
  const localIdToRealId = new Map<string, string>();
  if (!scopeItems || scopeItems.length === 0) return localIdToRealId;

  const rows = scopeItems.map((item: any) => {
    const realId = item.id?.startsWith?.("local_") ? crypto.randomUUID() : item.id || crypto.randomUUID();
    localIdToRealId.set(item._local_id || item.id, realId);
    return {
      id: realId,
      proposal_id: proposalId,
      description: item.description,
      included: item.included,
      hours: item.hours,
      phase: item.phase || 1,
      notes: item.notes || "",
      sort_order: item.sort_order,
      template_id: item.template_id || null,
      project_id: item.project_id || null,
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

  const { error } = await supabase.from("proposal_scope_items").insert(normalizedRows);
  if (error) throw error;
  return localIdToRealId;
}

async function updateProposalProcessGroupMap(
  proposalId: string,
  scopeItems: any[],
  localToReal: Map<string, string>,
  currentGroupNotes: any,
) {
  const processGroupMap: Record<string, string> = {};

  for (const item of scopeItems) {
    if (item._groupId && !item._parent_local_id) {
      const realId = localToReal.get(item._local_id || item.id);
      if (realId) {
        processGroupMap[realId] = item._groupId;
      }
    }
  }

  const updatedNotes = { ...(currentGroupNotes || {}), _process_group_map: processGroupMap };
  const { error } = await supabase.from("proposals").update({ group_notes: updatedNotes }).eq("id", proposalId);
  if (error) throw error;
}

export function useCreateProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (proposal: any) => {
      const { scopeItems, payments, serviceItems, id, ...proposalData } = proposal;
      const proposalId = id || crypto.randomUUID();

      const { error } = await supabase.from("proposals").insert({
        ...proposalData,
        id: proposalId,
      });
      if (error) throw error;

      const localToReal = await insertHierarchicalScopeItems(scopeItems, proposalId);
      await updateProposalProcessGroupMap(proposalId, scopeItems, localToReal, proposalData.group_notes);

      if (payments && payments.length > 0) {
        const paymentRows = normalizeProposalPayments(payments).map((p: any) => ({
          id: p.id || crypto.randomUUID(),
          ...p,
          proposal_id: proposalId,
        }));
        const { error: payError } = await supabase.from("payment_conditions").insert(paymentRows);
        if (payError) throw payError;
      }

      // Persist service items
      if (serviceItems && serviceItems.length > 0) {
        const { error: siError } = await supabase.from("proposal_service_items").insert(serviceItems);
        if (siError) throw siError;
      }

      return { id: proposalId };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["proposals"] }),
  });
}

export function useUpdateProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, scopeItems, payments, serviceItems, ...proposalData }: any) => {
      const { error } = await supabase.from("proposals").update(proposalData).eq("id", id);
      if (error) throw error;

      // Replace scope items (delete children first due to FK, then parents)
      const { data: existingItems } = await supabase.from("proposal_scope_items").select("id, parent_id").eq("proposal_id", id);
      if (existingItems && existingItems.length > 0) {
        const childIds = existingItems.filter((i) => i.parent_id).map((i) => i.id);
        if (childIds.length > 0) await supabase.from("proposal_scope_items").delete().in("id", childIds);
        const parentIds = existingItems.filter((i) => !i.parent_id).map((i) => i.id);
        if (parentIds.length > 0) await supabase.from("proposal_scope_items").delete().in("id", parentIds);
      }

      const localToReal = await insertHierarchicalScopeItems(scopeItems, id);
      await updateProposalProcessGroupMap(id, scopeItems, localToReal, proposalData.group_notes);

      // Replace payments
      await supabase.from("payment_conditions").delete().eq("proposal_id", id);
      if (payments && payments.length > 0) {
        const paymentRows = normalizeProposalPayments(payments).map((p: any) => ({ ...p, proposal_id: id }));
        const { error: payError } = await supabase.from("payment_conditions").insert(paymentRows);
        if (payError) throw payError;
      }

      // Replace service items
      // Delete existing (related_item_id FK needs nullifying first)
      await supabase.from("proposal_service_items").update({ related_item_id: null }).eq("proposal_id", id);
      await supabase.from("proposal_service_items").delete().eq("proposal_id", id);
      if (serviceItems && serviceItems.length > 0) {
        const { error: siError } = await supabase.from("proposal_service_items").insert(serviceItems);
        if (siError) throw siError;
      }

      return { id };
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
      const updates: any = { status };
      // When winning a proposal, set expected_close_date to today
      if (status === "ganha") {
        updates.expected_close_date = new Date().toISOString().substring(0, 10);
      }
      const { data, error } = await supabase.from("proposals").update(updates).eq("id", id).select().single();
      if (error) throw error;

      // Update commission projection status
      await supabase
        .from("commission_projections")
        .update({ proposal_status: status } as any)
        .eq("proposal_id", id);

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

// ============ PROPOSAL DEFAULTS ============
export function useProposalDefaults() {
  return useQuery({
    queryKey: ["proposal_defaults"],
    queryFn: async () => {
      const { data, error } = await supabase.from("proposal_defaults").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateProposalDefaults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { data, error } = await supabase.from("proposal_defaults").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["proposal_defaults"] }),
  });
}
