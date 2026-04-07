import { useState, useEffect } from "react";
import { ArrowRightLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSalesTeam } from "@/hooks/useSupabaseData";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  member: { id: string; name: string; code: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function TransferAccountsDialog({ member, open, onOpenChange }: Props) {
  const { data: salesTeam = [] } = useSalesTeam();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [clients, setClients] = useState<{ id: string; name: string; code: string; cnpj: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetEsnId, setTargetEsnId] = useState("");
  const [loading, setLoading] = useState(false);
  const [transferring, setTransferring] = useState(false);

  const esnMembers = salesTeam.filter((m) => m.role === "esn" && m.id !== member.id);

  useEffect(() => {
    if (!open) return;
    setTargetEsnId("");
    setLoading(true);
    supabase
      .from("clients")
      .select("id, name, code, cnpj")
      .eq("esn_id", member.id)
      .order("name")
      .then(({ data, error }) => {
        setLoading(false);
        if (error) {
          toast({ title: "Erro ao carregar clientes", description: error.message, variant: "destructive" });
          return;
        }
        const list = data || [];
        setClients(list);
        setSelected(new Set(list.map((c) => c.id)));
      });
  }, [open, member.id]);

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(clients.map((c) => c.id)) : new Set());
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleTransfer = async () => {
    if (!targetEsnId) {
      toast({ title: "Selecione o ESN de destino", variant: "destructive" });
      return;
    }
    if (selected.size === 0) {
      toast({ title: "Selecione ao menos um cliente", variant: "destructive" });
      return;
    }

    setTransferring(true);
    const ids = Array.from(selected);
    const { error } = await supabase
      .from("clients")
      .update({ esn_id: targetEsnId } as any)
      .in("id", ids);
    setTransferring(false);

    if (error) {
      toast({ title: "Erro ao transferir", description: error.message, variant: "destructive" });
    } else {
      const target = esnMembers.find((m) => m.id === targetEsnId);
      toast({ title: `${ids.length} cliente(s) transferido(s) para ${target?.name || "novo ESN"}` });
      qc.invalidateQueries({ queryKey: ["clients"] });
      onOpenChange(false);
    }
  };

  const allChecked = clients.length > 0 && selected.size === clients.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-w-[calc(100vw-2rem)] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            Transferir Contas
          </DialogTitle>
          <DialogDescription>
            Transferir clientes de <strong>{member.code} - {member.name}</strong> para outro ESN.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando clientes...</p>
        ) : clients.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum cliente vinculado a este ESN.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                {selected.size} de {clients.length} selecionado(s)
              </Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={(v) => toggleAll(!!v)}
                  id="select-all"
                />
                <label htmlFor="select-all" className="text-xs cursor-pointer">
                  Selecionar todos
                </label>
              </div>
            </div>

            <ScrollArea className="h-52 rounded-md border border-border">
              <div className="divide-y divide-border">
                {clients.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50 min-w-0"
                  >
                    <Checkbox
                      checked={selected.has(c.id)}
                      onCheckedChange={() => toggle(c.id)}
                      className="shrink-0"
                    />
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.code} · {c.cnpj}</p>
                    </div>
                  </label>
                ))}
              </div>
            </ScrollArea>

            <div className="grid gap-1">
              <Label className="text-xs">ESN de destino *</Label>
              <Select value={targetEsnId} onValueChange={setTargetEsnId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o ESN de destino" />
                </SelectTrigger>
                <SelectContent>
                  {esnMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.code} - {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              className="w-full"
              onClick={handleTransfer}
              disabled={transferring || selected.size === 0 || !targetEsnId}
            >
              {transferring ? "Transferindo..." : `Transferir ${selected.size} cliente(s)`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
