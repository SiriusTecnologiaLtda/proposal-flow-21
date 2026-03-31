import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Plus, Pencil, Trash2, ArrowLeft, FileText, ChevronDown, ChevronRight, ExternalLink, BookOpen, Copy, Check } from "lucide-react";
import ServiceItemsManager from "@/components/proposal-types/ServiceItemsManager";

interface ProposalType {
  id: string;
  name: string;
  slug: string;
  template_doc_id: string | null;
  mit_template_doc_id: string | null;
}

const emptyForm = { name: "", slug: "", template_doc_id: "", mit_template_doc_id: "" };

const PLACEHOLDERS = [
  { group: "Dados Gerais", items: [
    { placeholder: "{{NUMERO_PROPOSTA}}", desc: "Número da oportunidade" },
    { placeholder: "{{DATA_PROPOSTA}}", desc: "Data de criação da proposta (dd/mm/aaaa)" },
    { placeholder: "{{DATA_VALIDADE}}", desc: "Data de validade da oportunidade (dd/mm/aaaa)" },
    { placeholder: "{{PRODUTO}}", desc: "Nome do produto da oportunidade" },
    { placeholder: "{{TIPO_PROPOSTA}}", desc: "Nome do tipo de oportunidade" },
    { placeholder: "{{DESCRICAO}}", desc: "Descrição/observações da oportunidade" },
    { placeholder: "{{NEGOCIACAO}}", desc: "Informações de negociação" },
  ]},
  { group: "Cliente", items: [
    { placeholder: "{{RAZAO_SOCIAL}}", desc: "Razão social do cliente" },
    { placeholder: "{{CNPJ}}", desc: "CNPJ do cliente" },
    { placeholder: "{{ENDERECO}}", desc: "Endereço do cliente" },
    { placeholder: "{{CONTATO}}", desc: "Nome do contato principal" },
    { placeholder: "{{EMAIL}}", desc: "E-mail do cliente" },
    { placeholder: "{{TELEFONE}}", desc: "Telefone do cliente" },
    { placeholder: "{{INSCRICAO_ESTADUAL}}", desc: "Inscrição estadual do cliente" },
  ]},
  { group: "Unidade / ESN", items: [
    { placeholder: "{{UNIDADE_NOME}}", desc: "Nome da unidade vinculada ao ESN" },
    { placeholder: "{{UNIDADE_CNPJ}}", desc: "CNPJ da unidade" },
    { placeholder: "{{UNIDADE_ENDERECO}}", desc: "Endereço da unidade" },
    { placeholder: "{{UNIDADE_CIDADE}}", desc: "Cidade da unidade" },
    { placeholder: "{{ESN_NOME}}", desc: "Nome do Executivo de Soluções (ESN)" },
    { placeholder: "{{ESN_EMAIL}}", desc: "E-mail do ESN" },
    { placeholder: "{{ESN_TELEFONE}}", desc: "Telefone do ESN" },
  ]},
  { group: "Itens de Serviço (Dinâmico)", items: [
    { placeholder: "{{TABELA_RECURSOS}}", desc: "Tabela dinâmica com todos os itens: Label, Horas, Valor/Hora, Valor Total" },
    { placeholder: "{{TABELA_GOLIVE}}", desc: "Tabela dinâmica: Recurso (com %) e Horas de Acompanhamento pós Go-Live" },
    { placeholder: "{{TABELA_AVULSO}}", desc: "Tabela dinâmica de hora avulsa/adicional: Serviço Contratado, Valor Hora (Líquido)" },
    { placeholder: "{{TAB_REC_HR_TOT}}", desc: "Tabela dinâmica com Recurso, Horas e Valor Total de cada item de serviço" },
    { placeholder: "{{QTHR_REC1}}", desc: "Horas do 1º item de serviço (por sort_order)" },
    { placeholder: "{{VRLIQTOT_REC1}}", desc: "Valor total do 1º item de serviço" },
    { placeholder: "{{DESC_RECURSO1}}", desc: "Label/nome do 1º item de serviço" },
    { placeholder: "{{QT_HR_ACOMP1}}", desc: "Horas Go-Live do 1º item" },
    { placeholder: "{{QTHR_REC2}}", desc: "Horas do 2º item de serviço" },
    { placeholder: "{{VRLIQTOT_REC2}}", desc: "Valor total do 2º item de serviço" },
    { placeholder: "{{DESC_RECURSO2}}", desc: "Label/nome do 2º item de serviço" },
    { placeholder: "{{QT_HR_ACOMP2}}", desc: "Horas Go-Live do 2º item" },
    { placeholder: "{{QTHR_RECn}}", desc: "Horas do n-ésimo item (3, 4, 5...)" },
    { placeholder: "{{VRLIQTOT_RECn}}", desc: "Valor total do n-ésimo item" },
  ]},
  { group: "Totais Financeiros", items: [
    { placeholder: "{{QTHR_TOTAL}}", desc: "Soma total de horas de todos os itens de serviço" },
    { placeholder: "{{VLRTOT}}", desc: "Valor total líquido da oportunidade" },
    { placeholder: "{{NUM_EMPRESAS}}", desc: "Número de empresas" },
  ]},
  { group: "Condições de Pagamento", items: [
    { placeholder: "{{TABELA_PAGAMENTO}}", desc: "Tabela dinâmica de parcelas: Nº, Vencimento, Valor" },
    { placeholder: "{{PARCELA_1_VALOR}}", desc: "Valor da 1ª parcela" },
    { placeholder: "{{PARCELA_1_DATA}}", desc: "Data de vencimento da 1ª parcela" },
  ]},
  { group: "Viagem / Deslocamento", items: [
    { placeholder: "{{VLR_HR_VIAGEM}}", desc: "Valor hora para deslocamento" },
    { placeholder: "{{HORAS_LOCAL}}", desc: "Horas de deslocamento local" },
    { placeholder: "{{HORAS_VIAGEM}}", desc: "Horas de deslocamento em viagem" },
  ]},
  { group: "Escopo Detalhado", items: [
    { placeholder: "{{TABELA_ESCOPO}}", desc: "Tabela completa do escopo técnico com grupos, processos e itens" },
  ]},
];

function PlaceholderCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      title="Copiar placeholder"
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export default function ProposalTypesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [placeholdersOpen, setPlaceholdersOpen] = useState(false);

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

  function openDocUrl(docId: string | null | undefined) {
    if (!docId) return;
    window.open(`https://docs.google.com/document/d/${docId}/edit`, "_blank");
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

      {/* Create / Edit Dialog — Enhanced UI */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0">
          {/* Header with gradient */}
          <div className="bg-gradient-to-r from-primary/90 to-primary rounded-t-lg px-6 py-5">
            <DialogTitle className="text-lg font-semibold text-primary-foreground">
              {editingId ? "Editar Tipo de Oportunidade" : "Novo Tipo de Oportunidade"}
            </DialogTitle>
            <p className="text-sm text-primary-foreground/80 mt-1">
              Configure identificação e templates de documento
            </p>
          </div>

          <div className="px-6 py-5 space-y-6">
            {/* Section: Identificação */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-1 w-1 rounded-full bg-primary" />
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Identificação</h3>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Nome</Label>
                  <Input placeholder="Ex: Projeto" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Slug (valor interno)</Label>
                  <Input placeholder="Ex: projeto" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} disabled={!!editingId} className={editingId ? "bg-muted" : ""} />
                  <p className="text-[11px] text-muted-foreground">Identificador único — não pode ser alterado após criação</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Section: Templates */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-1 w-1 rounded-full bg-primary" />
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Templates de Documento</h3>
              </div>

              {/* Template Proposta */}
              <div className="rounded-lg border bg-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground">Template de Proposta (Google Doc)</Label>
                  {form.template_doc_id && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={() => openDocUrl(form.template_doc_id)}>
                      <ExternalLink className="h-3 w-3" /> Abrir Documento
                    </Button>
                  )}
                </div>
                <Input
                  placeholder="Cole o ID do Google Doc do template"
                  value={form.template_doc_id}
                  onChange={(e) => setForm({ ...form, template_doc_id: e.target.value })}
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  ID extraído da URL: docs.google.com/document/d/<strong className="text-foreground">ID_AQUI</strong>/edit
                </p>
              </div>

              {/* Template MIT */}
              <div className="rounded-lg border bg-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground">Template MIT-065 (Google Doc)</Label>
                  {form.mit_template_doc_id && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={() => openDocUrl(form.mit_template_doc_id)}>
                      <ExternalLink className="h-3 w-3" /> Abrir Documento
                    </Button>
                  )}
                </div>
                <Input
                  placeholder="Cole o ID do Google Doc do template MIT"
                  value={form.mit_template_doc_id}
                  onChange={(e) => setForm({ ...form, mit_template_doc_id: e.target.value })}
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  Usado para gerar o documento MIT-065 (Transição Comercial)
                </p>
              </div>
            </div>

            <Separator />

            {/* Section: Placeholders Reference */}
            <Collapsible open={placeholdersOpen} onOpenChange={setPlaceholdersOpen}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 w-full text-left group">
                  <div className="h-1 w-1 rounded-full bg-primary" />
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide flex-1">
                    Referência de Placeholders
                  </h3>
                  <Badge variant="outline" className="text-[10px]">
                    {PLACEHOLDERS.reduce((acc, g) => acc + g.items.length, 0)} disponíveis
                  </Badge>
                  {placeholdersOpen
                    ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  }
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Insira estes placeholders nos templates Google Docs. O sistema substituirá automaticamente pelos valores da oportunidade durante a geração.
                </p>
                {PLACEHOLDERS.map((group) => (
                  <div key={group.group} className="rounded-lg border bg-muted/30 overflow-hidden">
                    <div className="px-3 py-2 bg-muted/50 border-b">
                      <span className="text-xs font-semibold text-foreground">{group.group}</span>
                    </div>
                    <div className="divide-y divide-border/50">
                      {group.items.map((item) => (
                        <div key={item.placeholder} className="flex items-center gap-3 px-3 py-1.5 hover:bg-muted/40 transition-colors">
                          <code className="text-[11px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0">
                            {item.placeholder}
                          </code>
                          <PlaceholderCopyButton text={item.placeholder} />
                          <span className="text-[11px] text-muted-foreground flex-1">{item.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Footer */}
          <div className="border-t px-6 py-4 flex justify-end gap-3 bg-muted/20">
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
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
