import { useState } from "react";
import { Lightbulb, ThumbsUp, Plus, Check, X, Clock, Rocket, Send, MessageSquarePlus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type FeatureRequest = {
  id: string;
  title: string;
  description: string;
  status: string;
  created_by: string;
  admin_response: string | null;
  created_at: string;
  vote_count: number;
  user_voted: boolean;
  author_name: string;
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  pending: { label: "Pendente", icon: Clock, color: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  accepted: { label: "Aceito", icon: Check, color: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  rejected: { label: "Recusado", icon: X, color: "bg-destructive/15 text-destructive border-destructive/30" },
  implemented: { label: "Implementado", icon: Rocket, color: "bg-primary/15 text-primary border-primary/30" },
};

export default function FeatureRequestsPanel() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["feature-requests"],
    enabled: open,
    queryFn: async () => {
      const { data: items, error } = await supabase
        .from("feature_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Fetch votes in bulk
      const { data: votes } = await supabase
        .from("feature_request_votes")
        .select("feature_request_id, user_id");

      // Fetch author profiles
      const authorIds = [...new Set((items || []).map((i: any) => i.created_by))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", authorIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p.display_name]));

      return (items || []).map((item: any) => {
        const itemVotes = (votes || []).filter((v: any) => v.feature_request_id === item.id);
        return {
          ...item,
          vote_count: itemVotes.length,
          user_voted: itemVotes.some((v: any) => v.user_id === user?.id),
          author_name: profileMap.get(item.created_by) || "Usuário",
        } as FeatureRequest;
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("feature_requests").insert({
        title: title.trim(),
        description: description.trim(),
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature-requests"] });
      setTitle("");
      setDescription("");
      setShowForm(false);
      toast({ title: "Sugestão enviada!", description: "Obrigado pela sua contribuição." });
    },
  });

  const voteMutation = useMutation({
    mutationFn: async ({ requestId, hasVoted }: { requestId: string; hasVoted: boolean }) => {
      if (hasVoted) {
        const { error } = await supabase
          .from("feature_request_votes")
          .delete()
          .eq("feature_request_id", requestId)
          .eq("user_id", user!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("feature_request_votes")
          .insert({ feature_request_id: requestId, user_id: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feature-requests"] }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("feature_requests").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature-requests"] });
      toast({ title: "Status atualizado!" });
    },
  });

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  // Sort: pending first, then by votes desc
  const sorted = [...requests].sort((a, b) => {
    const order = ["pending", "accepted", "implemented", "rejected"];
    const diff = order.indexOf(a.status) - order.indexOf(b.status);
    if (diff !== 0) return diff;
    return b.vote_count - a.vote_count;
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <SheetTrigger asChild>
            <button className="relative rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Lightbulb className="h-5 w-5" />
              {pendingCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {pendingCount > 9 ? "9+" : pendingCount}
                </span>
              )}
            </button>
          </SheetTrigger>
        </TooltipTrigger>
        <TooltipContent>Sugestões de Melhoria</TooltipContent>
      </Tooltip>

      <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-4">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <Lightbulb className="h-5 w-5 text-primary" />
            Sugestões de Melhoria
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            Sugira melhorias e vote nas ideias que mais importam para você.
          </p>
        </SheetHeader>

        <Separator />

        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {/* New suggestion form */}
          {showForm ? (
            <div className="rounded-lg border border-border bg-accent/30 p-4 space-y-3">
              <Input
                placeholder="Título da sugestão"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
              />
              <Textarea
                placeholder="Descreva sua ideia em detalhes..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={1000}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setTitle(""); setDescription(""); }}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  disabled={!title.trim() || createMutation.isPending}
                  onClick={() => createMutation.mutate()}
                >
                  <Send className="h-3.5 w-3.5 mr-1" />
                  Enviar
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setShowForm(true)}>
              <MessageSquarePlus className="h-4 w-4 mr-2" />
              Nova Sugestão
            </Button>
          )}

          {/* List */}
          {isLoading ? (
            <div className="text-center text-sm text-muted-foreground py-8">Carregando...</div>
          ) : sorted.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              Nenhuma sugestão ainda. Seja o primeiro!
            </div>
          ) : (
            sorted.map((req) => {
              const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
              const StatusIcon = cfg.icon;
              return (
                <div
                  key={req.id}
                  className={cn(
                    "rounded-lg border border-border p-4 space-y-2 transition-colors",
                    req.status === "implemented" && "opacity-70"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Vote button */}
                    <button
                      onClick={() => voteMutation.mutate({ requestId: req.id, hasVoted: req.user_voted })}
                      disabled={voteMutation.isPending}
                      className={cn(
                        "flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors border min-w-[44px]",
                        req.user_voted
                          ? "bg-primary/10 text-primary border-primary/30"
                          : "bg-accent/50 text-muted-foreground border-transparent hover:border-border hover:text-foreground"
                      )}
                    >
                      <ThumbsUp className={cn("h-4 w-4", req.user_voted && "fill-primary")} />
                      {req.vote_count}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground">{req.title}</p>
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", cfg.color)}>
                          <StatusIcon className="h-3 w-3 mr-0.5" />
                          {cfg.label}
                        </Badge>
                      </div>
                      {req.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{req.description}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground/70 mt-1.5">
                        por {req.author_name} · {new Date(req.created_at).toLocaleDateString("pt-BR")}
                      </p>
                      {req.admin_response && (
                        <div className="mt-2 rounded-md bg-accent/50 px-3 py-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Resposta:</span> {req.admin_response}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Admin actions */}
                  {isAdmin && req.status !== "implemented" && (
                    <div className="flex items-center gap-1.5 pt-1 pl-[56px]">
                      {req.status !== "accepted" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                          onClick={() => updateStatusMutation.mutate({ id: req.id, status: "accepted" })}
                        >
                          <Check className="h-3 w-3 mr-1" /> Aceitar
                        </Button>
                      )}
                      {req.status !== "rejected" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:bg-destructive/10"
                          onClick={() => updateStatusMutation.mutate({ id: req.id, status: "rejected" })}
                        >
                          <X className="h-3 w-3 mr-1" /> Recusar
                        </Button>
                      )}
                      {req.status === "accepted" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-primary hover:bg-primary/10"
                          onClick={() => updateStatusMutation.mutate({ id: req.id, status: "implemented" })}
                        >
                          <Rocket className="h-3 w-3 mr-1" /> Implementado
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
