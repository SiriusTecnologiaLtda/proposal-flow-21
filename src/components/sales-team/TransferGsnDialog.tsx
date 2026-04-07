import { useState, useEffect, useMemo } from "react";
import { ArrowRightLeft, Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSalesTeam } from "@/hooks/useSupabaseData";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
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
  const [searchClient, setSearchClient] = useState("");
  const [searchEsn, setSearchEsn] = useState("");

  const otherGsns = salesTeam.filter((m) => m.role === "gsn" && m.id !== member.id);

  const filteredGsns = useMemo(() => {
    if (!searchTarget.trim()) return otherGsns;
    const q = searchTarget.toLowerCase();
    return otherGsns.filter(
      (m) => m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q) || (m.email && m.email.toLowerCase().includes(q))
    );
  }, [otherGsns, searchTarget]);

  const selectedTarget = otherGsns.find((m) => m.id === targetGsnId);

  useEffect(() => {
    if (!open) return;
    setTargetGsnId("");
    setSearchTarget("");
    setSearchClient("");
    setSearchEsn("");
    setLoading(true);

    const linkedEsns = salesTeam.filter(
      (m) => m.role === "esn" && m.linked_gsn_id === member.id &&
        (!member.unit_id || m.unit_id === member.unit_id)
    );
    setEsnMembers(linkedEsns.map((m) => ({ id: m.id, name: m.name, code: m.code })));
    setSelectedEsns(new Set(linkedEsns.map((m) => m.id)));

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

  const filteredClients = useMemo(() => {
    if (!searchClient.trim()) return clients;
    const q = searchClient.toLowerCase();
    return clients.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || c.cnpj.includes(q));
  }, [clients, searchClient]);

  const filteredEsnMembers = useMemo(() => {
    if (!searchEsn.trim()) return esnMembers;
    const q = searchEsn.toLowerCase();
    return esnMembers.filter((e) => e.name.toLowerCase().includes(q) || e.code.toLowerCase().includes(q));
  }, [esnMembers, searchEsn]);

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

  const hasContent = clients.length > 0 || esnMembers.length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0 gap-0">
        {/* Header */}
        <SheetHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <ArrowRightLeft className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-base">Transferir Contas e ESNs</SheetTitle>
              <SheetDescription className="text-xs mt-0.5">
                Transferir clientes e ESNs de <strong className="text-foreground">{member.code} — {member.name}</strong> para outro GSN.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {loading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : !hasContent ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Nenhum cliente ou ESN vinculado a este GSN.</p>
          ) : (
            <Tabs defaultValue="clients" className="flex-1 flex flex-col overflow-hidden">
              <div className="shrink-0 px-6 pt-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="clients">Clientes ({clients.length})</TabsTrigger>
                  <TabsTrigger value="esns">ESNs ({esnMembers.length})</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="clients" className="flex-1 flex flex-col overflow-hidden mt-0 data-[state=inactive]:hidden">
                {/* Controls */}
                <div className="shrink-0 px-6 py-3 border-b border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">
                      <Users className="inline h-3.5 w-3.5 mr-1" />
                      {selectedClients.size} de {clients.length} selecionado(s)
                    </Label>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={clients.length > 0 && selectedClients.size === clients.length}
                        onCheckedChange={(v) => toggleAllClients(!!v)}
                        id="select-all-clients-gsn"
                      />
                      <label htmlFor="select-all-clients-gsn" className="text-xs cursor-pointer select-none">Selecionar todos</label>
                    </div>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Filtrar clientes..."
                      value={searchClient}
                      onChange={(e) => setSearchClient(e.target.value)}
                      className="pl-9 h-8 text-sm"
                    />
                  </div>
                </div>
                {/* List */}
                <ScrollArea className="flex-1 min-h-0">
                  <div className="divide-y divide-border">
                    {filteredClients.length === 0 && (
                      <p className="p-6 text-xs text-muted-foreground text-center">Nenhum cliente encontrado.</p>
                    )}
                    {filteredClients.map((c) => (
                      <label key={c.id} className="flex items-center gap-3 px-6 py-2.5 cursor-pointer hover:bg-muted/50">
                        <Checkbox checked={selectedClients.has(c.id)} onCheckedChange={() => toggleClient(c.id)} className="shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground break-words">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.code} · {c.cnpj}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="esns" className="flex-1 flex flex-col overflow-hidden mt-0 data-[state=inactive]:hidden">
                {/* Controls */}
                <div className="shrink-0 px-6 py-3 border-b border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">
                      <Users className="inline h-3.5 w-3.5 mr-1" />
                      {selectedEsns.size} de {esnMembers.length} selecionado(s)
                    </Label>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={esnMembers.length > 0 && selectedEsns.size === esnMembers.length}
                        onCheckedChange={(v) => toggleAllEsns(!!v)}
                        id="select-all-esns-gsn"
                      />
                      <label htmlFor="select-all-esns-gsn" className="text-xs cursor-pointer select-none">Selecionar todos</label>
                    </div>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Filtrar ESNs..."
                      value={searchEsn}
                      onChange={(e) => setSearchEsn(e.target.value)}
                      className="pl-9 h-8 text-sm"
                    />
                  </div>
                </div>
                {/* List */}
                <ScrollArea className="flex-1 min-h-0">
                  <div className="divide-y divide-border">
                    {filteredEsnMembers.length === 0 && (
                      <p className="p-6 text-xs text-muted-foreground text-center">Nenhum ESN encontrado.</p>
                    )}
                    {filteredEsnMembers.map((e) => (
                      <label key={e.id} className="flex items-center gap-3 px-6 py-2.5 cursor-pointer hover:bg-muted/50">
                        <Checkbox checked={selectedEsns.has(e.id)} onCheckedChange={() => toggleEsn(e.id)} className="shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground break-words">{e.name}</p>
                          <p className="text-xs text-muted-foreground">{e.code}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}
        </div>

        {/* Sticky footer */}
        {!loading && hasContent && (
          <div className="shrink-0 border-t border-border px-6 py-4 space-y-3 bg-background">
            <div className="space-y-1">
              <Label className="text-xs font-medium">GSN de destino *</Label>
              <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal h-9 text-sm">
                    {selectedTarget
                      ? `${selectedTarget.code} — ${selectedTarget.name}`
                      : <span className="text-muted-foreground">Pesquisar GSN de destino...</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start" side="top">
                  <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                    <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Input
                      placeholder="Buscar por nome, código ou e-mail..."
                      value={searchTarget}
                      onChange={(e) => setSearchTarget(e.target.value)}
                      className="border-0 p-0 h-auto shadow-none focus-visible:ring-0 text-sm"
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
                          <div className="min-w-0">
                            <p className="font-medium text-foreground">{m.code} — {m.name}</p>
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
      </SheetContent>
    </Sheet>
  );
}
