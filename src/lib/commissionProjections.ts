import { supabase } from "@/integrations/supabase/client";

/**
 * Regenerate commission_projections for a given proposal.
 * Deletes existing projections and re-creates from payment_conditions + ESN commission_pct.
 */
export async function regenerateCommissionProjections(proposalId: string) {
  // Get proposal to find esn_id and status
  const { data: proposal, error: pErr } = await supabase
    .from("proposals")
    .select("id, esn_id, status")
    .eq("id", proposalId)
    .maybeSingle();

  if (pErr || !proposal || !proposal.esn_id) return;

  // Get ESN commission_pct
  const { data: esn } = await supabase
    .from("sales_team")
    .select("id, commission_pct")
    .eq("id", proposal.esn_id)
    .maybeSingle();

  const commissionPct = (esn as any)?.commission_pct ?? 3;

  // Get payment conditions
  const { data: payments } = await supabase
    .from("payment_conditions")
    .select("*")
    .eq("proposal_id", proposalId)
    .order("installment");

  if (!payments || payments.length === 0) {
    // Just delete existing
    await supabase.from("commission_projections").delete().eq("proposal_id", proposalId);
    return;
  }

  // Delete existing projections for this proposal
  await supabase.from("commission_projections").delete().eq("proposal_id", proposalId);

  // Create new projections
  const rows = payments.map((p) => ({
    proposal_id: proposalId,
    esn_id: proposal.esn_id!,
    installment: p.installment,
    due_date: p.due_date || new Date().toISOString().substring(0, 10),
    amount: p.amount,
    commission_pct: commissionPct,
    commission_value: (p.amount * commissionPct) / 100,
    proposal_status: proposal.status,
  }));

  await supabase.from("commission_projections").insert(rows as any);
}

/**
 * Update proposal_status in commission_projections when status changes.
 */
export async function updateCommissionProjectionStatus(proposalId: string, newStatus: string) {
  await supabase
    .from("commission_projections")
    .update({ proposal_status: newStatus } as any)
    .eq("proposal_id", proposalId);
}
