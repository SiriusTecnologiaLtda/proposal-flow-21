import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  esnMembers: any[];
  units: any[];
}

export default function BatchCommissionDialog({ open, onOpenChange, esnMembers, units }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [newPct, setNewPct] = useState("3");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return esnMembers;
    return esnMembers.filter((m) => {
      const unitName = (m as any).unit_info?.name || "";
      return m.name.toLowerCase().includes(q) || unitName.toLowerCase().includes(q);
    });
  }, [esnMembers, search]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((m) => selectedIds.has(m.id));

  const toggleAll = () => {
    if (allFilteredSelected) {
      const next = new Set(selectedIds);
      filtered.forEach((m) => next.delete(m.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      filtered.forEach((m) => next.add(m.id));
      setSelectedIds(next);
    }
  };

  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const handleSave = async () => {
    if (selectedIds.size === 0) {
      toast({ title: "Selecione ao menos um ESN", variant: "destructive" });
      return;
    }
    const pct = parseFloat(newPct);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      toast({ title: "Percentual inválido (0-100)", variant: "destructive" });
      return;
    }
    setSaving(true);
    const ids = Array.from(selectedIds);
    const { error } = await supabase
      .from("sales_team")
      .update({ commission_pct: pct } as any)
      .in("id", ids);
    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Comissão atualizada para ${ids.length} ESN(s)!` });
      qc.invalidateQueries({ queryKey: ["sales_team"] });
      onOpenChange(false);
      setSelectedIds(new Set());
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Alterar Comissão em Lote</DialogTitle>
          <DialogDescription>Selecione os ESNs e defina o novo percentual de comissão.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid gap-1">
            <Label className="text-xs">Novo % Comissão</Label>
            <Input
              type="number"
              step="0.5"
              min="0"
              max="100"
              value={newPct}
              onChange={(e) => setNewPct(e.target.value)}
              className="w-32"
            />
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou unidade..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-2 border-b border-border pb-2">
            <Checkbox
              checked={allFilteredSelected}
              onCheckedChange={toggleAll}
              id="select-all"
            />
            <label htmlFor="select-all" className="text-xs font-medium text-muted-foreground cursor-pointer">
              {allFilteredSelected ? "Desmarcar todos" : "Marcar todos"} ({filtered.length})
            </label>
          </div>

          <div className="overflow-y-auto max-h-[280px] space-y-1">
            {filtered.map((m) => {
              const unitName = (m as any).unit_info?.name || "—";
              return (
                <label
                  key={m.id}
                  className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent/50 cursor-pointer"
                >
                  <Checkbox
                    checked={selectedIds.has(m.id)}
                    onCheckedChange={() => toggle(m.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{m.name}</p>
                    <p className="text-[11px] text-muted-foreground">{m.code} · {unitName} · {(m as any).commission_pct ?? 3}%</p>
                  </div>
                </label>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum ESN encontrado.</p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || selectedIds.size === 0}>
            {saving ? "Salvando..." : `Aplicar (${selectedIds.size})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
