import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Save, Loader2, Building2, ChevronDown, ChevronUp, Star, StarOff, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface Assignment {
  id?: string;
  unit_id: string;
  role: string;
  reports_to_id: string;
  is_primary: boolean;
  active: boolean;
  crm_code: string;
  isNew?: boolean;
}

interface Props {
  memberId: string;
  memberName: string;
  units: any[];
  allMembers: any[];
}

const roleLabels: Record<string, string> = {
  dsn: "Diretor de Vendas (DSN)",
  esn: "Executivo de Vendas (ESN)",
  gsn: "Gerente de Vendas (GSN)",
  arquiteto: "Engenheiro de Valor",
};

const roleColors: Record<string, string> = {
  dsn: "bg-destructive/10 text-destructive border-destructive/20",
  esn: "bg-primary/10 text-primary border-primary/20",
  gsn: "bg-success/15 text-success border-success/20",
  arquiteto: "bg-warning/15 text-warning border-warning/20",
};

export default function AssignmentsTab({ memberId, memberName, units, allMembers }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allAssignments, setAllAssignments] = useState<any[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [removedIds, setRemovedIds] = useState<string[]>([]);

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    const [memberResult, allResult] = await Promise.all([
      (supabase as any)
        .from("sales_team_assignments")
        .select("id, unit_id, role, reports_to_id, is_primary, active, crm_code")
        .eq("member_id", memberId)
        .order("is_primary", { ascending: false }),
      (supabase as any)
        .from("sales_team_assignments")
        .select("id, member_id, unit_id, role, active")
        .eq("active", true),
    ]);
    setLoading(false);
    if (!memberResult.error && memberResult.data) {
      setAssignments(
        memberResult.data.map((d: any) => ({
          id: d.id,
          unit_id: d.unit_id,
          role: d.role,
          reports_to_id: d.reports_to_id || "",
          is_primary: d.is_primary,
          active: d.active,
          crm_code: d.crm_code || "",
        }))
      );
      setRemovedIds([]);
    }
    if (!allResult.error && allResult.data) {
      setAllAssignments(allResult.data);
    }
  }, [memberId]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  const addAssignment = () => {
    setAssignments((prev) => [
      ...prev,
      { unit_id: "", role: "", reports_to_id: "", is_primary: false, active: true, crm_code: "", isNew: true },
    ]);
    setExpandedIdx(assignments.length);
  };

  const [dependentsInfo, setDependentsInfo] = useState<{ index: number; dependents: { memberName: string; unitName: string }[] } | null>(null);

  const removeAssignment = async (index: number) => {
    const removed = assignments[index];
    // New assignments can always be removed
    if (!removed.id || removed.isNew) {
      setAssignments((prev) => prev.filter((_, i) => i !== index));
      setExpandedIdx(null);
      return;
    }

    // Check if this assignment is used as reports_to_id by others
    const { data: refs } = await (supabase as any)
      .from("sales_team_assignments")
      .select("id, member_id, unit_id")
      .eq("reports_to_id", removed.id)
      .eq("active", true);

    if (refs && refs.length > 0) {
      // Resolve names for the dependents
      const depDetails = refs.map((ref: any) => {
        const member = allMembers.find((m) => m.id === ref.member_id);
        const unit = units.find((u) => u.id === ref.unit_id);
        return {
          memberName: member ? `${member.code} - ${member.name}` : ref.member_id,
          unitName: unit?.name || "—",
        };
      });
      setDependentsInfo({ index, dependents: depDetails });
      return;
    }

    // No dependents — safe to remove
    setRemovedIds((prev) => [...prev, removed.id!]);
    setAssignments((prev) => prev.filter((_, i) => i !== index));
    setExpandedIdx(null);
  };

  const updateField = (index: number, field: keyof Assignment, value: any) => {
    setAssignments((prev) =>
      prev.map((a, i) => {
        if (i !== index) return a;
        const updated = { ...a, [field]: value };
        if (field === "is_primary" && value === true) {
          return updated;
        }
        return updated;
      })
    );
    if (field === "is_primary" && value === true) {
      setAssignments((prev) =>
        prev.map((a, i) => (i === index ? a : { ...a, is_primary: false }))
      );
    }
  };

  const getSuperiorOptions = (unitId: string, role: string) => {
    if (!unitId || !role) return [];
    if (role === "dsn") return [];
    const targetRole = role === "gsn" ? "dsn" : role === "esn" ? "gsn" : null;
    if (!targetRole) return [];
    return allAssignments
      .filter((a) => a.unit_id === unitId && a.role === targetRole && a.member_id !== memberId)
      .map((a) => {
        const member = allMembers.find((m) => m.id === a.member_id);
        return { id: a.id, label: member ? `${member.code} - ${member.name}` : a.member_id };
      });
  };

  const validate = (): string | null => {
    const activeAssignments = assignments.filter((a) => a.active);
    for (let i = 0; i < assignments.length; i++) {
      const a = assignments[i];
      if (!a.unit_id) return `Vínculo ${i + 1}: selecione a unidade.`;
      if (!a.role) return `Vínculo ${i + 1}: selecione o papel.`;
    }
    const seen = new Set<string>();
    for (const a of activeAssignments) {
      const key = `${a.unit_id}`;
      if (seen.has(key)) {
        const unitName = units.find((u) => u.id === a.unit_id)?.name || a.unit_id;
        return `Vínculo duplicado na unidade "${unitName}". Cada membro pode ter apenas um vínculo ativo por unidade.`;
      }
      seen.add(key);
    }
    const primaryCount = activeAssignments.filter((a) => a.is_primary).length;
    if (activeAssignments.length > 0 && primaryCount !== 1) {
      return "Defina exatamente um vínculo como Principal entre os ativos.";
    }
    return null;
  };

  const handleSave = async () => {
    const error = validate();
    if (error) {
      toast({ title: "Validação", description: error, variant: "destructive" });
      return;
    }
    setSaving(true);

    try {
      // Separate existing (update) vs new (insert)
      const toUpdate = assignments.filter((a) => a.id && !a.isNew && a.unit_id && a.role);
      const toInsert = assignments.filter((a) => (!a.id || a.isNew) && a.unit_id && a.role);

      // Delete assignments that the user explicitly removed
      if (removedIds.length > 0) {
        // Check if any removed ID is referenced by reports_to_id from OTHER members
        const { data: refsData } = await (supabase as any)
          .from("sales_team_assignments")
          .select("id, member_id, reports_to_id")
          .in("reports_to_id", removedIds)
          .neq("member_id", memberId);

        if (refsData && refsData.length > 0) {
          // Clear the reports_to_id references before deleting
          for (const ref of refsData) {
            await (supabase as any)
              .from("sales_team_assignments")
              .update({ reports_to_id: null })
              .eq("id", ref.id);
          }
        }

        const { error: delError } = await (supabase as any)
          .from("sales_team_assignments")
          .delete()
          .in("id", removedIds);
        if (delError) {
          toast({ title: "Erro ao remover vínculos", description: delError.message, variant: "destructive" });
          setSaving(false);
          return;
        }
      }

      // Update existing assignments one by one to preserve IDs
      for (const a of toUpdate) {
        const { error: updError } = await (supabase as any)
          .from("sales_team_assignments")
          .update({
            unit_id: a.unit_id,
            role: a.role,
            reports_to_id: a.reports_to_id || null,
            is_primary: a.is_primary,
            active: a.active,
            crm_code: a.crm_code.trim() || null,
          })
          .eq("id", a.id);
        if (updError) {
          toast({ title: "Erro ao atualizar vínculo", description: updError.message, variant: "destructive" });
          setSaving(false);
          return;
        }
      }

      // Insert new assignments
      if (toInsert.length > 0) {
        const { error: insError } = await (supabase as any)
          .from("sales_team_assignments")
          .insert(
            toInsert.map((a) => ({
              member_id: memberId,
              unit_id: a.unit_id,
              role: a.role,
              reports_to_id: a.reports_to_id || null,
              is_primary: a.is_primary,
              active: a.active,
              crm_code: a.crm_code.trim() || null,
            }))
          );
        if (insError) {
          toast({ title: "Erro ao criar vínculo", description: insError.message, variant: "destructive" });
          setSaving(false);
          return;
        }
      }

      setRemovedIds([]);
      toast({ title: "Vínculos comerciais salvos!" });
      qc.invalidateQueries({ queryKey: ["sales_team"] });
    } catch (err: any) {
      toast({ title: "Erro inesperado", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
      await loadAssignments();
    }
  };

  const unitName = (id: string) => units.find((u) => u.id === id)?.name || "—";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando vínculos...
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Vínculos Comerciais por Unidade
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {assignments.length} vínculo{assignments.length !== 1 ? "s" : ""} cadastrado{assignments.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={addAssignment}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />Adicionar
          </Button>
        </div>

        {assignments.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <Building2 className="mx-auto h-8 w-8 mb-2 opacity-40" />
            <p>Nenhum vínculo cadastrado.</p>
            <p className="text-xs mt-1">Clique em "Adicionar" para vincular este membro a uma unidade.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {assignments.map((a, index) => {
              const isExpanded = expandedIdx === index;
              const superiorOptions = getSuperiorOptions(a.unit_id, a.role);
              return (
                <div
                  key={a.id || `new-${index}`}
                  className={`rounded-lg border transition-colors ${
                    !a.active
                      ? "border-border/50 bg-muted/20 opacity-70"
                      : "border-border bg-card"
                  }`}
                >
                  {/* Summary row */}
                  <div
                    className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
                    onClick={() => setExpandedIdx(isExpanded ? null : index)}
                  >
                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      {a.is_primary && (
                        <Star className="h-3.5 w-3.5 text-warning shrink-0 fill-warning" />
                      )}
                      <span className="text-sm font-medium truncate">
                        {a.unit_id ? unitName(a.unit_id) : "Nova unidade"}
                      </span>
                      {a.role && (
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${roleColors[a.role] || ""}`}>
                          {roleLabels[a.role] || a.role}
                        </Badge>
                      )}
                      {a.crm_code && (
                        <Badge variant="secondary" className="text-[10px] shrink-0 font-mono">
                          {a.crm_code}
                        </Badge>
                      )}
                      {!a.active && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">Inativo</Badge>
                      )}
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-border px-3 pb-3 pt-3 space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-1">
                          <Label className="text-xs">Unidade *</Label>
                          <Select value={a.unit_id} onValueChange={(v) => updateField(index, "unit_id", v)}>
                            <SelectTrigger className="h-9 text-sm">
                              <SelectValue placeholder="Selecione a unidade" />
                            </SelectTrigger>
                            <SelectContent>
                              {units.map((u) => (
                                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs">Papel *</Label>
                          <Select value={a.role} onValueChange={(v) => updateField(index, "role", v)}>
                            <SelectTrigger className="h-9 text-sm">
                              <SelectValue placeholder="Selecione o papel" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="dsn">Diretor de Vendas (DSN)</SelectItem>
                              <SelectItem value="gsn">Gerente de Vendas (GSN)</SelectItem>
                              <SelectItem value="esn">Executivo de Vendas (ESN)</SelectItem>
                              <SelectItem value="arquiteto">Engenheiro de Valor</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-1">
                          <Label className="text-xs">Código CRM</Label>
                          <Input
                            placeholder="Ex: T22558"
                            value={a.crm_code}
                            onChange={(e) => updateField(index, "crm_code", e.target.value)}
                            className="h-9 text-sm font-mono"
                          />
                        </div>
                        {superiorOptions.length > 0 && (
                          <div className="grid gap-1">
                            <Label className="text-xs">Superior Hierárquico</Label>
                            <Select
                              value={a.reports_to_id}
                              onValueChange={(v) => updateField(index, "reports_to_id", v === "__none__" ? "" : v)}
                            >
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue placeholder="Selecione o superior" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Nenhum</SelectItem>
                                {superiorOptions.map((opt) => (
                                  <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-4 pt-1">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={a.is_primary}
                              onCheckedChange={(v) => updateField(index, "is_primary", v)}
                            />
                            <Label className="text-xs cursor-pointer flex items-center gap-1">
                              {a.is_primary ? <Star className="h-3 w-3 fill-warning text-warning" /> : <StarOff className="h-3 w-3" />}
                              Principal
                            </Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={a.active}
                              onCheckedChange={(v) => updateField(index, "active", v)}
                            />
                            <Label className="text-xs cursor-pointer">
                              {a.active ? "Ativo" : "Inativo"}
                            </Label>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => removeAssignment(index)}
                        >
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />Remover
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end border-t border-border pt-4">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</>
          ) : (
            <><Save className="mr-2 h-4 w-4" />Salvar Vínculos</>
          )}
        </Button>
      </div>
    </div>
  );
}
