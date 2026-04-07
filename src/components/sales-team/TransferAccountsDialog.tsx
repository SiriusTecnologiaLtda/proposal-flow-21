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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const [searchClient, setSearchClient] = useState("");
  const [searchTarget, setSearchTarget] = useState("");
  const [popoverOpen, setPopoverOpen] = useState(false);

  const esnMembers = salesTeam.filter((m) => m.role === "esn" && m.id !== member.id);

  const filteredEsns = useMemo(() => {
    if (!searchTarget.trim()) return esnMembers;
    const q = searchTarget.toLowerCase();
    return esnMembers.filter(
      (m) => m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q)
    );
  }, [esnMembers, searchTarget]);

  const selectedTarget = esnMembers.find((m) => m.id === targetEsnId);

  useEffect(() => {
    if (!open) return;
    setTargetEsnId("");
    setSearchClient("");
    setSearchTarget("");
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

  const filteredClients = useMemo(() => {
    if (!searchClient.trim()) return clients;
    const q = searchClient.toLowerCase();
    return clients.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || c.cnpj.includes(q)
    );
  }, [clients, searchClient]);

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0 gap-0">
        {/* Header */}
        <SheetHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <ArrowRightLeft className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-base">Transferir Contas</SheetTitle>
              <SheetDescription className="text-xs mt-0.5">
                Transferir clientes de <strong className="text-foreground">{member.code} — {member.name}</strong> para outro ESN.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {loading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Carregando clientes...</p>
          ) : clients.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Nenhum cliente vinculado a este ESN.</p>
          ) : (
            <>
              {/* Controls bar */}
              <div className="shrink-0 px-6 py-3 border-b border-border space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">
                    <Users className="inline h-3.5 w-3.5 mr-1" />
                    {selected.size} de {clients.length} selecionado(s)
                  </Label>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={(v) => toggleAll(!!v)}
                      id="select-all-transfer"
                    />
                    <label htmlFor="select-all-transfer" className="text-xs cursor-pointer select-none">
                      Selecionar todos
                    </label>
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

              {/* Scrollable list */}
              <ScrollArea className="flex-1 min-h-0">
                <div className="divide-y divide-border">
                  {filteredClients.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-3 px-6 py-2.5 cursor-pointer hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selected.has(c.id)}
                        onCheckedChange={() => toggle(c.id)}
                        className="shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground break-words">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.code} · {c.cnpj}</p>
                      </div>
                    </label>
                  ))}
                  {filteredClients.length === 0 && (
                    <p className="p-6 text-xs text-muted-foreground text-center">Nenhum cliente encontrado.</p>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </div>

        {/* Sticky footer */}
        {!loading && clients.length > 0 && (
          <div className="shrink-0 border-t border-border px-6 py-4 space-y-3 bg-background">
            <div className="space-y-1">
              <Label className="text-xs font-medium">ESN de destino *</Label>
              <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal h-9 text-sm">
                    {selectedTarget
                      ? `${selectedTarget.code} — ${selectedTarget.name}`
                      : <span className="text-muted-foreground">Pesquisar ESN de destino...</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start" side="top">
                  <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                    <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Input
                      placeholder="Buscar por nome ou código..."
                      value={searchTarget}
                      onChange={(e) => setSearchTarget(e.target.value)}
                      className="border-0 p-0 h-auto shadow-none focus-visible:ring-0 text-sm"
                    />
                  </div>
                  <ScrollArea className="max-h-48">
                    {filteredEsns.length === 0 ? (
                      <p className="p-3 text-xs text-muted-foreground text-center">Nenhum ESN encontrado.</p>
                    ) : (
                      filteredEsns.map((m) => (
                        <button
                          key={m.id}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
                          onClick={() => {
                            setTargetEsnId(m.id);
                            setPopoverOpen(false);
                            setSearchTarget("");
                          }}
                        >
                          <p className="font-medium text-foreground">{m.code} — {m.name}</p>
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
              disabled={transferring || selected.size === 0 || !targetEsnId}
            >
              {transferring ? "Transferindo..." : `Transferir ${selected.size} cliente(s)`}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
