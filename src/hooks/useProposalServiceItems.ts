import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProposalServiceItem {
  id: string;
  source_item_id: string | null;
  label: string;
  rounding_factor: number;
  is_base_scope: boolean;
  additional_pct: number;
  hourly_rate: number;
  golive_pct: number;
  related_item_id: string | null;
  calculated_hours: number;
  sort_order: number;
}

const defaultItem = (): ProposalServiceItem => ({
  id: `local_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  source_item_id: null,
  label: "",
  rounding_factor: 8,
  is_base_scope: false,
  additional_pct: 0,
  hourly_rate: 250,
  golive_pct: 0,
  related_item_id: null,
  calculated_hours: 0,
  sort_order: 0,
});

function roundUp(val: number, factor: number): number {
  if (factor <= 0 || val <= 0) return val;
  return Math.ceil(val / factor) * factor;
}

/**
 * Loads service items from proposal_type_service_items for the given type,
 * or from proposal_service_items for an existing proposal.
 * Calculates hours dynamically based on raw scope hours.
 */
export function useProposalServiceItems(
  proposalTypeSlug: string | undefined,
  proposalId: string | undefined,
  isEditing: boolean,
  rawScopeHours: number
) {
  const [items, setItems] = useState<ProposalServiceItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load template items for the selected proposal type
  const { data: typeServiceItems = [] } = useQuery({
    queryKey: ["type_service_items", proposalTypeSlug],
    queryFn: async () => {
      if (!proposalTypeSlug) return [];
      const { data: typeRow } = await supabase
        .from("proposal_types")
        .select("id")
        .eq("slug", proposalTypeSlug)
        .maybeSingle();
      if (!typeRow) return [];
      const { data, error } = await supabase
        .from("proposal_type_service_items")
        .select("*")
        .eq("proposal_type_id", typeRow.id)
        .order("sort_order");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!proposalTypeSlug,
  });

  // Load existing proposal service items (for editing)
  const { data: existingItems = [] } = useQuery({
    queryKey: ["proposal_service_items", proposalId],
    queryFn: async () => {
      if (!proposalId) return [];
      const { data, error } = await supabase
        .from("proposal_service_items")
        .select("*")
        .eq("proposal_id", proposalId)
        .order("sort_order");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!proposalId && isEditing,
  });

  // Initialize items from template or existing
  useEffect(() => {
    if (loaded) return;

    // When items were reset (e.g. type change), load from template even during editing
    if (items.length === 0 && typeServiceItems.length > 0 && !loaded) {
      // Create local copies from template
      const localItems: ProposalServiceItem[] = [];
      const idMap = new Map<string, string>();
      for (const ti of typeServiceItems) {
        const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        idMap.set(ti.id, localId);
        localItems.push({
          id: localId,
          source_item_id: ti.id,
          label: ti.label,
          rounding_factor: Number(ti.rounding_factor),
          is_base_scope: ti.is_base_scope,
          additional_pct: Number(ti.additional_pct),
          hourly_rate: Number(ti.hourly_rate),
          golive_pct: Number(ti.golive_pct),
          related_item_id: ti.related_item_id ? (idMap.get(ti.related_item_id) || null) : null,
          calculated_hours: 0,
          sort_order: ti.sort_order,
        });
      }
      for (const item of localItems) {
        if (!item.related_item_id) {
          const sourceItem = typeServiceItems.find((ti: any) => ti.id === item.source_item_id);
          if (sourceItem?.related_item_id) {
            item.related_item_id = idMap.get(sourceItem.related_item_id) || null;
          }
        }
      }
      setItems(localItems);
      setLoaded(true);
      return;
    }

    if (isEditing && existingItems.length > 0) {
      setItems(existingItems.map((i: any) => ({
        id: i.id,
        source_item_id: i.source_item_id,
        label: i.label,
        rounding_factor: Number(i.rounding_factor),
        is_base_scope: i.is_base_scope,
        additional_pct: Number(i.additional_pct),
        hourly_rate: Number(i.hourly_rate),
        golive_pct: Number(i.golive_pct),
        related_item_id: i.related_item_id,
        calculated_hours: Number(i.calculated_hours),
        sort_order: i.sort_order,
      })));
      setLoaded(true);
    }
  }, [isEditing, existingItems, typeServiceItems, loaded, items.length]);

  // Reset when proposal type changes (new proposal)
  useEffect(() => {
    if (!isEditing) {
      setLoaded(false);
    }
  }, [proposalTypeSlug, isEditing]);

  // Force reload items from template (used when type changes on existing proposal)
  const resetToTemplate = useCallback(() => {
    setLoaded(false);
    setItems([]);
  }, []);

  // Recalculate hours whenever rawScopeHours or items change
  const calculatedItems = useMemo(() => {
    if (items.length === 0) return [];

    const baseItem = items.find(i => i.is_base_scope);
    const baseHours = baseItem ? roundUp(rawScopeHours, baseItem.rounding_factor) : 0;

    return items.map(item => {
      let hours: number;
      if (item.is_base_scope) {
        hours = baseHours;
      } else {
        // Find the related item's calculated hours
        const relatedItem = item.related_item_id
          ? items.find(i => i.id === item.related_item_id)
          : baseItem; // fallback to base item
        const relatedHours = relatedItem?.is_base_scope ? baseHours : 0;
        const rawHours = Math.ceil(relatedHours * (item.additional_pct / 100));
        hours = roundUp(rawHours, item.rounding_factor);
      }
      return { ...item, calculated_hours: hours };
    });
  }, [items, rawScopeHours]);

  // Total hours and value
  const totalServiceHours = useMemo(() =>
    calculatedItems.reduce((s, i) => s + i.calculated_hours, 0),
    [calculatedItems]
  );

  const totalServiceValue = useMemo(() =>
    calculatedItems.reduce((s, i) => s + i.calculated_hours * i.hourly_rate, 0),
    [calculatedItems]
  );

  // Go-live hours per item
  const goLiveItems = useMemo(() =>
    calculatedItems
      .filter(i => i.golive_pct > 0)
      .map(i => ({
        ...i,
        golive_hours: roundUp(Math.ceil(i.calculated_hours * (i.golive_pct / 100)), i.rounding_factor),
      })),
    [calculatedItems]
  );

  const updateItem = useCallback((itemId: string, updates: Partial<ProposalServiceItem>) => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...updates } : i));
  }, []);

  // For serialization to save
  const getItemsForSave = useCallback((proposalId: string) => {
    // Build a map from local IDs to UUIDs for related_item_id
    const idMap = new Map<string, string>();
    const saveItems = calculatedItems.map(item => {
      const realId = item.id.startsWith("local_") ? crypto.randomUUID() : item.id;
      idMap.set(item.id, realId);
      return { ...item, _localId: item.id, id: realId };
    });

    return saveItems.map(item => ({
      id: item.id,
      proposal_id: proposalId,
      source_item_id: item.source_item_id,
      label: item.label,
      rounding_factor: item.rounding_factor,
      is_base_scope: item.is_base_scope,
      additional_pct: item.additional_pct,
      hourly_rate: item.hourly_rate,
      golive_pct: item.golive_pct,
      related_item_id: item.related_item_id ? (idMap.get(item.related_item_id) || item.related_item_id) : null,
      calculated_hours: item.calculated_hours,
      sort_order: item.sort_order,
    }));
  }, [calculatedItems]);

  return {
    items: calculatedItems,
    totalServiceHours,
    totalServiceValue,
    goLiveItems,
    updateItem,
    getItemsForSave,
    hasItems: items.length > 0,
  };
}
