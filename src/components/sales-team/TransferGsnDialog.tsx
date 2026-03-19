import { useState, useEffect, useMemo } from "react";
import { ArrowRightLeft, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSalesTeam } from "@/hooks/useSupabaseData";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  member: { id: string; name: string; code: string; unit_id?: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function TransferGsnDialog({ member, open, onOpenChange }: Props) {
  const { data: salesTeam = [] } = useSalesTeam();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [clients, setClients] = useState<{ id: string; name: string; code: string; cnpj: string }[]>([]);
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [esnMembers, setEsnMembers] = useState<{ id: string; name: string; code: string }[]>([]);
  const [selectedEsns, setSelectedEsns] = useState<Set<string>>(new Set());
  const [targetGsnId, setTargetGsnId] = useState("");
  const [loading, setLoading] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [searchTarget, setSearchTarget] = useState("");
  const [popoverOpen, setPopoverOpen] = useState(false);

  const otherGsns = salesTeam.filter((m) => m.role === "gsn" && m.id !== member.id);

  const filteredGsns = useMemo(() => {
    if (!searchTarget.trim()) return otherGsns;
    const q = searchTarget.toLowerCase();
    return otherGsns.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.code.toLowerCase().includes(q) ||
        (m.email && m.email.toLowerCase().includes(q))
    );
  }, [otherGsns, searchTarget]);

  const selectedTarget = otherGsns.find((m) => m.id === targetGsnId);

  useEffect(() => {
    if (!open) return;
    setTargetGsnId("");
    setSearchTarget("");
    setLoading(true);

    // Filter ESNs by same unit as GSN
    const linkedEsns = salesTeam.filter(
      (m) => m.role === "esn" && m.linked_gsn_id === member.id &&
        (!member.unit_id || m.unit_id === member.unit_id)
    );
    setEsnMembers(linkedEsns.map((m) => ({ id: m.id, name: m.name, code: m.code })));
    setSelectedEsns(new Set(linkedEsns.map((m) => m.id)));

    // Filter clients by same unit as GSN
    let query = supabase
      .from("clients")
      .select("id, name, code, cnpj")
      .eq("gsn_id", member.id);
    if (member.unit_id) {
      query = query.eq("unit_id", member.unit_id);
    }
    query.order("name").then(({ data, error }) => {
      setLoading(false);
      if (error) {
        toast({ title: "Erro ao carregar clientes", description: error.message, variant: "destructive" });
        return;
      }
      const list = data || [];
      setClients(list);
      setSelectedClients(new Set(list.map((c) => c.id)));
      });
  }, [open, member.id, salesTeam]);

  const toggleAllClients = (checked: boolean) => {
    setSelectedClients(checked ? new Set(clients.map((c) => c.id)) : new Set());
  };
  const toggleClient = (id: string) => {
    setSelectedClients((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAllEsns = (checked: boolean) => {
    setSelectedEsns(checked ? new Set(esnMembers.map((e) => e.id)) : new Set());
  };
  const toggleEsn = (id: string) => {
    setSelectedEsns((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const totalSelected = selectedClients.size + selectedEsns.size;

  const handleTransfer = async () => {
    if (!targetGsnId) {
      toast({ title: "Selecione o GSN de destino", variant: "destructive" });
      return;
    }
    if (totalSelected === 0) {
      toast({ title: "Selecione ao menos um item", variant: "destructive" });
      return;
    }

    setTransferring(true);
    const errors: string[] = [];

    if (selectedClients.size > 0) {
      const { error } = await supabase
        .from("clients")
        .update({ gsn_id: targetGsnId } as any)
        .in("id", Array.from(selectedClients));
      if (error) errors.push(`Clientes: ${error.message}`);
    }

    if (selectedEsns.size > 0) {
      const { error } = await supabase
        .from("sales_team")
        .update({ linked_gsn_id: targetGsnId } as any)
        .in("id", Array.from(selectedEsns));
      if (error) errors.push(`ESNs: ${error.message}`);
    }

    setTransferring(false);

    if (errors.length > 0) {
      toast({ title: "Erro na transferência", description: errors.join("; "), variant: "destructive" });
    } else {
      toast({
        title: `Transferência concluída para ${selectedTarget?.name || "novo GSN"}`,
        description: `${selectedClients.size} cliente(s) e ${selectedEsns.size} ESN(s) transferido(s).`,
      });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["sales_team"] });
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            Transferir Contas e ESNs
          </DialogTitle>
          <DialogDescription>
            Transferir clientes e ESNs de <strong>{member.code} - {member.name}</strong> para outro GSN.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
        ) : clients.length === 0 && esnMembers.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum cliente ou ESN vinculado a este GSN.</p>
        ) : (
          <div className="space-y-4">
            <Tabs defaultValue="clients" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="clients">Clientes ({clients.length})</TabsTrigger>
                <TabsTrigger value="esns">ESNs ({esnMembers.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="clients" className="space-y-2 mt-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">
                    {selectedClients.size} de {clients.length} selecionado(s)
                  </Label>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={clients.length > 0 && selectedClients.size === clients.length}
                      onCheckedChange={(v) => toggleAllClients(!!v)}
                      id="select-all-clients"
                    />
                    <label htmlFor="select-all-clients" className="text-xs cursor-pointer">Selecionar todos</label>
                  </div>
                </div>
                <ScrollArea className="h-44 rounded-md border border-border">
                  <div className="divide-y divide-border">
                    {clients.length === 0 && (
                      <p className="p-3 text-xs text-muted-foreground text-center">Nenhum cliente vinculado.</p>
                    )}
                    {clients.map((c) => (
                      <label key={c.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50">
                        <Checkbox checked={selectedClients.has(c.id)} onCheckedChange={() => toggleClient(c.id)} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.code} · {c.cnpj}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="esns" className="space-y-2 mt-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">
                    {selectedEsns.size} de {esnMembers.length} selecionado(s)
                  </Label>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={esnMembers.length > 0 && selectedEsns.size === esnMembers.length}
                      onCheckedChange={(v) => toggleAllEsns(!!v)}
                      id="select-all-esns"
                    />
                    <label htmlFor="select-all-esns" className="text-xs cursor-pointer">Selecionar todos</label>
                  </div>
                </div>
                <ScrollArea className="h-44 rounded-md border border-border">
                  <div className="divide-y divide-border">
                    {esnMembers.length === 0 && (
                      <p className="p-3 text-xs text-muted-foreground text-center">Nenhum ESN vinculado.</p>
                    )}
                    {esnMembers.map((e) => (
                      <label key={e.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50">
                        <Checkbox checked={selectedEsns.has(e.id)} onCheckedChange={() => toggleEsn(e.id)} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{e.name}</p>
                          <p className="text-xs text-muted-foreground">{e.code}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>

            <div className="grid gap-1">
              <Label className="text-xs">GSN de destino *</Label>
              <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    {selectedTarget
                      ? `${selectedTarget.code} - ${selectedTarget.name}`
                      : <span className="text-muted-foreground">Pesquisar GSN de destino...</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                    <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Input
                      placeholder="Buscar por nome, código ou e-mail..."
                      value={searchTarget}
                      onChange={(e) => setSearchTarget(e.target.value)}
                      className="border-0 p-0 h-auto shadow-none focus-visible:ring-0"
                    />
                  </div>
                  <ScrollArea className="max-h-48">
                    {filteredGsns.length === 0 ? (
                      <p className="p-3 text-xs text-muted-foreground text-center">Nenhum GSN encontrado.</p>
                    ) : (
                      filteredGsns.map((m) => (
                        <button
                          key={m.id}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
                          onClick={() => {
                            setTargetGsnId(m.id);
                            setPopoverOpen(false);
                            setSearchTarget("");
                          }}
                        >
                          <div>
                            <p className="font-medium text-foreground">{m.code} - {m.name}</p>
                            {m.email && <p className="text-xs text-muted-foreground">{m.email}</p>}
                          </div>
                        </button>
                      ))
                    )}
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            </div>

            <Button
              className="w-full"
              onClick={handleTransfer}
              disabled={transferring || totalSelected === 0 || !targetGsnId}
            >
              {transferring ? "Transferindo..." : `Transferir ${totalSelected} item(ns)`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
