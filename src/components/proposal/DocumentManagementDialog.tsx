import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  FolderOpen, Star, Eye, Loader2, FileText, Paperclip,
  FileSpreadsheet, FileImage, File, CheckCircle2, XCircle
} from "lucide-react";

interface ProposalDoc {
  id: string;
  doc_url: string;
  file_name: string;
  version: number;
  is_official: boolean;
  created_at: string;
  doc_type: string;
}

interface ProjectAttachment {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  is_scope: boolean;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposalId: string | null;
  docType: string;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return <File className="h-5 w-5 text-muted-foreground" />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv"))
    return <FileSpreadsheet className="h-5 w-5 text-success" />;
  if (mimeType.includes("image"))
    return <FileImage className="h-5 w-5 text-primary" />;
  if (mimeType.includes("pdf"))
    return <FileText className="h-5 w-5 text-destructive" />;
  return <File className="h-5 w-5 text-muted-foreground" />;
}

function getExtension(fileName: string): string {
  const parts = fileName.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : "—";
}

export default function DocumentManagementDialog({ open, onOpenChange, proposalId, docType }: Props) {
  const { toast } = useToast();
  const [versions, setVersions] = useState<ProposalDoc[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [attachments, setAttachments] = useState<ProjectAttachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("proposals");

  const titleLabel = docType === "mit" ? "MIT-065" : "Propostas";

  useEffect(() => {
    if (open && proposalId) {
      loadVersions();
      loadProjectAttachments();
      setActiveTab("proposals");
    }
  }, [open, proposalId]);

  async function loadVersions() {
    if (!proposalId) return;
    setVersionsLoading(true);
    try {
      const { data, error } = await supabase
        .from("proposal_documents")
        .select("*")
        .eq("proposal_id", proposalId)
        .eq("doc_type", docType)
        .order("version", { ascending: false });
      if (error) throw error;
      setVersions((data || []) as ProposalDoc[]);
    } catch (err: any) {
      toast({ title: "Erro ao carregar versões", description: err.message, variant: "destructive" });
      setVersions([]);
    }
    setVersionsLoading(false);
  }

  async function loadProjectAttachments() {
    if (!proposalId) return;
    setAttachmentsLoading(true);
    try {
      // Find project linked to this proposal
      const { data: projects, error: projErr } = await supabase
        .from("projects")
        .select("id")
        .eq("proposal_id", proposalId)
        .limit(1);
      if (projErr) throw projErr;
      if (!projects || projects.length === 0) {
        setAttachments([]);
        setAttachmentsLoading(false);
        return;
      }
      const { data: files, error: filesErr } = await supabase
        .from("project_attachments")
        .select("id, file_name, file_url, file_size, mime_type, is_scope, created_at")
        .eq("project_id", projects[0].id)
        .order("created_at", { ascending: false });
      if (filesErr) throw filesErr;
      setAttachments((files || []) as ProjectAttachment[]);
    } catch (err: any) {
      toast({ title: "Erro ao carregar anexos", description: err.message, variant: "destructive" });
      setAttachments([]);
    }
    setAttachmentsLoading(false);
  }

  async function toggleOfficial(docId: string, currentOfficial: boolean) {
    try {
      if (!currentOfficial && proposalId) {
        await supabase
          .from("proposal_documents")
          .update({ is_official: false })
          .eq("proposal_id", proposalId)
          .eq("doc_type", docType);
      }
      await supabase.from("proposal_documents").update({ is_official: !currentOfficial }).eq("id", docId);
      await loadVersions();
      toast({ title: currentOfficial ? "Versão desmarcada como oficial" : "Versão definida como oficial" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-lg">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10">
                <FolderOpen className="h-5 w-5 text-primary" />
              </div>
              <div>
                <span className="block">Documentos da Oportunidade</span>
                <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                  Gerencie propostas e consulte documentos vinculados ao projeto
                </span>
              </div>
            </DialogTitle>
          </DialogHeader>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="px-6 pt-4">
            <TabsList className="w-full grid grid-cols-2 h-10">
              <TabsTrigger value="proposals" className="gap-1.5 text-sm">
                <FileText className="h-4 w-4" />
                {titleLabel} Geradas
                {versions.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5 text-[10px]">
                    {versions.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="project" className="gap-1.5 text-sm">
                <Paperclip className="h-4 w-4" />
                Documentos do Projeto
                {attachments.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5 text-[10px]">
                    {attachments.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Tab: Propostas Geradas */}
          <TabsContent value="proposals" className="flex-1 min-h-0 mt-0 px-6 pb-6 pt-4">
            {versionsLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : versions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">Nenhum documento gerado ainda</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Gere uma proposta para visualizar aqui</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-2 pr-3">
                  {versions.map((doc, idx) => (
                    <div
                      key={doc.id}
                      className={`group relative flex items-center gap-4 rounded-lg border px-4 py-3.5 transition-all ${
                        doc.is_official
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-muted-foreground/30 hover:bg-accent/30"
                      }`}
                    >
                      {/* Official indicator bar */}
                      {doc.is_official && (
                        <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-primary" />
                      )}

                      {/* Icon */}
                      <div className={`flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-lg ${
                        doc.is_official ? "bg-primary/10" : "bg-muted"
                      }`}>
                        <FileText className={`h-5 w-5 ${doc.is_official ? "text-primary" : "text-muted-foreground"}`} />
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-foreground truncate max-w-[300px]">
                            {doc.file_name}
                          </p>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-[18px] font-mono">
                            v{doc.version}
                          </Badge>
                          {doc.is_official && (
                            <Badge className="text-[10px] px-2 py-0 h-[18px] bg-primary text-primary-foreground">
                              ★ Oficial
                            </Badge>
                          )}
                          {idx === 0 && !doc.is_official && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-[18px]">
                              Mais recente
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(doc.created_at).toLocaleDateString("pt-BR")} às{" "}
                          {new Date(doc.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant={doc.is_official ? "default" : "ghost"}
                          size="icon"
                          className={`h-8 w-8 ${doc.is_official ? "bg-primary/15 hover:bg-primary/25 text-primary" : ""}`}
                          title={doc.is_official ? "Desmarcar como oficial" : "Selecionar para assinatura"}
                          onClick={() => toggleOfficial(doc.id, doc.is_official)}
                        >
                          <Star className={`h-4 w-4 ${doc.is_official ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Visualizar documento"
                          onClick={() => window.open(doc.doc_url, "_blank")}
                        >
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          {/* Tab: Documentos do Projeto */}
          <TabsContent value="project" className="flex-1 min-h-0 mt-0 px-6 pb-6 pt-4">
            {attachmentsLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : attachments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Paperclip className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">Nenhum documento vinculado</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Os anexos do projeto associado aparecerão aqui
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-2 pr-3">
                  {attachments.map((file) => (
                    <div
                      key={file.id}
                      className="group flex items-center gap-4 rounded-lg border border-border px-4 py-3.5 transition-colors hover:border-muted-foreground/30 hover:bg-accent/30"
                    >
                      {/* File icon */}
                      <div className="flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-lg bg-muted">
                        {getFileIcon(file.mime_type)}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-foreground truncate max-w-[280px]">
                            {file.file_name}
                          </p>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-[18px] font-mono uppercase">
                            {getExtension(file.file_name)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-muted-foreground">
                            {formatFileSize(file.file_size)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(file.created_at).toLocaleDateString("pt-BR")}
                          </span>
                        </div>
                      </div>

                      {/* Scope badge */}
                      <div className="flex-shrink-0">
                        {file.is_scope ? (
                          <Badge className="gap-1 text-[10px] px-2 py-0.5 bg-success/15 text-success border-success/30 hover:bg-success/15">
                            <CheckCircle2 className="h-3 w-3" />
                            Compõe escopo
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-[10px] px-2 py-0.5 text-muted-foreground">
                            <XCircle className="h-3 w-3" />
                            Referência
                          </Badge>
                        )}
                      </div>

                      {/* View */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 flex-shrink-0"
                        title="Visualizar documento"
                        onClick={() => window.open(file.file_url, "_blank")}
                      >
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
