import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, ArrowLeft, FolderOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface GoogleIntegration {
  id: string;
  label: string;
  service_account_key: string;
  drive_folder_id: string;
  created_at: string;
  updated_at: string;
}

const emptyForm = { label: "", service_account_key: "", drive_folder_id: "" };

export default function GoogleIntegrationPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [jsonError, setJsonError] = useState("");

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ["google_integrations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("google_integrations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as GoogleIntegration[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: typeof emptyForm & { id?: string }) => {
      if (values.id) {
        const { error } = await supabase
          .from("google_integrations")
          .update({ label: values.label, service_account_key: values.service_account_key, drive_folder_id: values.drive_folder_id })
          .eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("google_integrations")
          .insert({ label: values.label, service_account_key: values.service_account_key, drive_folder_id: values.drive_folder_id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google_integrations"] });
      toast({ title: "Salvo", description: "Integração Google salva com sucesso." });
      closeDialog();
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("google_integrations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google_integrations"] });
      toast({ title: "Excluído", description: "Integração removida." });
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
    setJsonError("");
  }

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setJsonError("");
    setDialogOpen(true);
  }

  function openEdit(item: GoogleIntegration) {
    setForm({ label: item.label, service_account_key: item.service_account_key, drive_folder_id: item.drive_folder_id });
    setEditingId(item.id);
    setJsonError("");
    setDialogOpen(true);
  }

  function handleSave() {
    if (!form.label.trim() || !form.drive_folder_id.trim() || !form.service_account_key.trim()) {
      toast({ title: "Campos obrigatórios", description: "Preencha todos os campos.", variant: "destructive" });
      return;
    }
    try {
      JSON.parse(form.service_account_key);
      setJsonError("");
    } catch {
      setJsonError("JSON inválido. Cole o conteúdo completo do arquivo .json da Service Account.");
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
          <h1 className="text-2xl font-semibold text-foreground">Google Drive / Docs</h1>
          <p className="text-sm text-muted-foreground">Gerencie as credenciais de acesso ao Google para geração de propostas</p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Conexões configuradas</CardTitle>
          {isAdmin && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" /> Nova conexão
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : integrations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma conexão configurada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Pasta Drive</TableHead>
                  <TableHead>Service Account</TableHead>
                  {isAdmin && <TableHead className="w-24">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {integrations.map((item) => {
                  let email = "—";
                  try { email = JSON.parse(item.service_account_key).client_email || "—"; } catch { /* ignore */ }
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.label}</TableCell>
                      <TableCell className="font-mono text-xs">{item.drive_folder_id}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{email}</TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteId(item.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar conexão" : "Nova conexão Google"}</DialogTitle>
            <DialogDescription>Preencha as credenciais da Service Account e o ID da pasta do Google Drive.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome / Label</Label>
              <Input placeholder="Ex: Unidade Leste" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </div>
            <div>
              <Label>ID da Pasta do Google Drive</Label>
              <Input placeholder="Ex: 1JBh1YFS86MMe-M91kWeBchfh8xwQrFwB" value={form.drive_folder_id} onChange={(e) => setForm({ ...form, drive_folder_id: e.target.value })} />
            </div>
            <div>
              <Label>JSON da Service Account</Label>
              <Textarea
                placeholder='Cole aqui o conteúdo completo do arquivo .json da Service Account'
                className="min-h-[200px] font-mono text-xs"
                value={form.service_account_key}
                onChange={(e) => { setForm({ ...form, service_account_key: e.target.value }); setJsonError(""); }}
              />
              {jsonError && <p className="mt-1 text-xs text-destructive">{jsonError}</p>}
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
            <AlertDialogTitle>Excluir conexão?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. A conexão será removida permanentemente.</AlertDialogDescription>
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
