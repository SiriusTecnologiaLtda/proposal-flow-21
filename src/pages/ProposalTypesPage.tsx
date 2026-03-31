import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, ArrowLeft, FileText, ChevronDown, ChevronRight } from "lucide-react";
import ServiceItemsManager from "@/components/proposal-types/ServiceItemsManager";

interface ProposalType {
  id: string;
  name: string;
  slug: string;
  template_doc_id: string | null;
  mit_template_doc_id: string | null;
}

const emptyForm = { name: "", slug: "", template_doc_id: "", mit_template_doc_id: "" };

export default function ProposalTypesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: types = [], isLoading } = useQuery({
    queryKey: ["proposal_types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposal_types")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as unknown as ProposalType[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: typeof emptyForm & { id?: string }) => {
      const payload: any = {
        name: values.name,
        slug: values.slug,
        template_doc_id: values.template_doc_id || null,
        mit_template_doc_id: values.mit_template_doc_id || null,
      };
      if (values.id) {
        const { error } = await supabase.from("proposal_types").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("proposal_types").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proposal_types"] });
      toast({ title: "Salvo", description: "Tipo de oportunidade salvo com sucesso." });
      closeDialog();
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("proposal_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proposal_types"] });
      toast({ title: "Excluído" });
      setDeleteId(null);
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setDialogOpen(true);
  }

  function openEdit(item: ProposalType) {
    setForm({
      name: item.name,
      slug: item.slug,
      template_doc_id: item.template_doc_id || "",
      mit_template_doc_id: item.mit_template_doc_id || "",
    });
    setEditingId(item.id);
    setDialogOpen(true);
  }

  function handleSave() {
    if (!form.name.trim() || !form.slug.trim()) {
      toast({ title: "Campos obrigatórios", description: "Preencha Nome e Slug.", variant: "destructive" });
      return;
    }
    saveMutation.mutate({ ...form, id: editingId ?? undefined });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/configuracoes")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Tipos de Oportunidade</h1>
          <p className="text-sm text-muted-foreground">Gerencie os tipos e seus itens de serviço</p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Tipos cadastrados</CardTitle>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" /> Novo Tipo
          </Button>
        </CardHeader>
        <CardContent className="space-y-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : types.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum tipo cadastrado.</p>
          ) : (
            <div className="space-y-2">
              {types.map((item) => (
                <div key={item.id} className="border rounded-lg">
                  {/* Row header */}
                  <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  >
                    {expandedId === item.id
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    }
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm flex-1">{item.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{item.slug}</span>
                    <div className="flex gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteId(item.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded: service items */}
                  {expandedId === item.id && (
                    <div className="px-4 pb-4 pt-1 border-t bg-muted/30">
                      <ServiceItemsManager proposalTypeId={item.id} proposalTypeName={item.name} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Tipo" : "Novo Tipo de Oportunidade"}</DialogTitle>
            <DialogDescription>Defina o nome, slug e IDs dos templates Google Docs.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Nome</Label>
                <Input placeholder="Ex: Projeto" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>Slug (valor interno)</Label>
                <Input placeholder="Ex: projeto" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
                <p className="text-xs text-muted-foreground mt-1">Identificador único usado internamente</p>
              </div>
            </div>
            <div>
              <Label>ID do Template de Proposta (Google Doc)</Label>
              <Input
                placeholder="Cole o ID do Google Doc do template de proposta"
                value={form.template_doc_id}
                onChange={(e) => setForm({ ...form, template_doc_id: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                O ID está na URL do Google Docs: docs.google.com/document/d/<strong>ID_AQUI</strong>/edit
              </p>
            </div>
            <div>
              <Label>ID do Template MIT-065 (Google Doc)</Label>
              <Input
                placeholder="Cole o ID do Google Doc do template MIT"
                value={form.mit_template_doc_id}
                onChange={(e) => setForm({ ...form, mit_template_doc_id: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Template usado para gerar o documento MIT-065 deste tipo de proposta
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tipo de oportunidade?</AlertDialogTitle>
            <AlertDialogDescription>
              Os itens de serviço deste tipo também serão excluídos. Propostas existentes não serão afetadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
