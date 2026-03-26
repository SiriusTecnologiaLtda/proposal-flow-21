import { useState } from "react";
import { Search, MessageCircle, Phone, Calendar, RefreshCw, ChevronLeft, ChevronRight, ArrowDownUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const PAGE_SIZE = 25;

export default function WhatsAppMessagesViewer() {
  const [search, setSearch] = useState("");
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["whatsapp_all_messages", search, directionFilter, page],
    queryFn: async () => {
      let query = supabase
        .from("whatsapp_messages" as any)
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (directionFilter !== "all") {
        query = query.eq("direction", directionFilter);
      }

      if (search.trim()) {
        query = query.or(`message_text.ilike.%${search.trim()}%,phone_number.ilike.%${search.trim()}%,ai_response.ilike.%${search.trim()}%`);
      }

      const { data: messages, error, count } = await query;
      if (error) throw error;
      return { messages: messages as any[], count: count || 0 };
    },
  });

  const messages = data?.messages || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  const formatPhone = (phone: string) => phone?.replace("whatsapp:", "") || phone;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Buscar</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Telefone, mensagem ou resposta..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="pl-9"
            />
          </div>
        </div>
        <div className="w-full sm:w-44 space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Direção</label>
          <Select value={directionFilter} onValueChange={(v) => { setDirectionFilter(v); setPage(0); }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="inbound">⬇ Recebidas</SelectItem>
              <SelectItem value="outbound">⬆ Enviadas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9">
          <RefreshCw className="mr-1 h-4 w-4" /> Atualizar
        </Button>
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{totalCount} mensagem(ns) encontrada(s)</span>
        {totalPages > 1 && (
          <span>Página {page + 1} de {totalPages}</span>
        )}
      </div>

      {/* Messages List */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando mensagens...</p>
      ) : messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <MessageCircle className="h-10 w-10 mb-2 opacity-40" />
          <p className="text-sm">Nenhuma mensagem encontrada.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((msg: any) => {
            const isExpanded = expandedId === msg.id;
            const isInbound = msg.direction === "inbound";
            return (
              <div
                key={msg.id}
                className="rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : msg.id)}
              >
                {/* Header row */}
                <div className="flex items-center gap-3 p-3">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full ${isInbound ? "bg-success/15 text-success" : "bg-primary/15 text-primary"}`}>
                    {isInbound ? <Phone className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium font-mono">{formatPhone(msg.phone_number)}</span>
                      <Badge variant={isInbound ? "default" : "secondary"} className="text-[10px] h-5">
                        {isInbound ? "⬇ Recebida" : "⬆ Enviada"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {msg.message_text}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
                    <Calendar className="h-3 w-3" />
                    {formatDate(msg.created_at)}
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-border px-3 pb-3 pt-2 space-y-3">
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">Mensagem Recebida:</span>
                      <p className="text-sm bg-muted/50 rounded-md p-2.5 whitespace-pre-wrap">{msg.message_text}</p>
                    </div>
                    {msg.ai_response && (
                      <div className="space-y-1">
                        <span className="text-xs font-medium text-muted-foreground">Resposta da IA:</span>
                        <p className="text-sm bg-primary/5 border border-primary/10 rounded-md p-2.5 whitespace-pre-wrap">{msg.ai_response}</p>
                      </div>
                    )}
                    <div className="flex gap-4 text-[11px] text-muted-foreground">
                      {msg.twilio_sid && <span>SID: <span className="font-mono">{msg.twilio_sid}</span></span>}
                      <span>ID: <span className="font-mono">{msg.id.slice(0, 8)}</span></span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground px-2">
            {page + 1} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
