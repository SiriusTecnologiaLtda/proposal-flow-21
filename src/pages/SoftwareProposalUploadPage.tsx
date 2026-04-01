import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  ArrowLeft, Upload, FileUp, FileText, X, Loader2, CheckCircle2, AlertCircle, Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const ORIGIN_OPTIONS = [
  { value: "client", label: "Cliente" },
  { value: "vendor", label: "Fornecedor" },
  { value: "partner", label: "Parceiro" },
  { value: "internal", label: "Interno" },
  { value: "historical", label: "Histórico" },
  { value: "email_inbox", label: "E-mail" },
  { value: "other", label: "Outro" },
];

type FileEntry = {
  file: File;
  id: string;
  status: "pending" | "uploading" | "success" | "duplicate" | "error";
  message?: string;
};

async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SoftwareProposalUploadPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<FileEntry[]>([]);
  const [origin, setOrigin] = useState("other");
  const [notes, setNotes] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    const valid: FileEntry[] = [];
    for (const file of arr) {
      if (file.type !== "application/pdf") {
        toast.error(`"${file.name}" não é um PDF e foi ignorado.`);
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`"${file.name}" excede 20 MB e foi ignorado.`);
        continue;
      }
      valid.push({
        file,
        id: crypto.randomUUID(),
        status: "pending",
      });
    }
    if (valid.length > 0) {
      setFiles((prev) => [...prev, ...valid]);
      setShowSummary(false);
    }
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const updateFileStatus = (id: string, status: FileEntry["status"], message?: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, status, message } : f))
    );
  };

  const uploadAll = async () => {
    if (!user) return;
    setIsUploading(true);

    const pendingFiles = files.filter((f) => f.status === "pending");

    for (const entry of pendingFiles) {
      updateFileStatus(entry.id, "uploading");

      try {
        // 1. Hash
        const fileHash = await computeFileHash(entry.file);

        // 2. Duplicate check
        const { data: existing } = await supabase
          .from("software_proposals")
          .select("id, file_name")
          .eq("file_hash", fileHash)
          .maybeSingle();

        if (existing) {
          updateFileStatus(
            entry.id,
            "duplicate",
            `Duplicado de "${existing.file_name}"`
          );
          continue;
        }

        // 3. Upload to storage
        const filePath = `${user.id}/${fileHash}.pdf`;
        const { error: storageError } = await supabase.storage
          .from("software-proposal-pdfs")
          .upload(filePath, entry.file, { upsert: false });

        if (storageError) {
          // If file already exists in storage but no DB record, treat as storage conflict
          if (storageError.message?.includes("already exists")) {
            // File exists in bucket — proceed to create DB record anyway
          } else {
            throw new Error(storageError.message);
          }
        }

        // 4. Create record
        const { error: insertError } = await supabase
          .from("software_proposals")
          .insert({
            file_name: entry.file.name,
            file_url: filePath,
            file_hash: fileHash,
            origin,
            notes: notes.trim() || null,
            uploaded_by: user.id,
            status: "pending_extraction",
          });

        if (insertError) {
          await supabase.storage
            .from("software-proposal-pdfs")
            .remove([filePath]);
          throw new Error(insertError.message);
        }

        updateFileStatus(entry.id, "success", "Importado com sucesso");
      } catch (err: any) {
        updateFileStatus(entry.id, "error", err.message || "Erro desconhecido");
      }
    }

    queryClient.invalidateQueries({ queryKey: ["software-proposals"] });
    setIsUploading(false);
    setShowSummary(true);
  };

  const counts = {
    total: files.length,
    pending: files.filter((f) => f.status === "pending").length,
    success: files.filter((f) => f.status === "success").length,
    duplicate: files.filter((f) => f.status === "duplicate").length,
    error: files.filter((f) => f.status === "error").length,
    uploading: files.filter((f) => f.status === "uploading").length,
  };

  const canUpload = counts.pending > 0 && !isUploading;

  const statusIcon = (status: FileEntry["status"]) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />;
      case "duplicate":
        return <Ban className="h-4 w-4 text-amber-500 shrink-0" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive shrink-0" />;
      case "uploading":
        return <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />;
      default:
        return <FileText className="h-4 w-4 text-muted-foreground shrink-0" />;
    }
  };

  const statusLabel = (status: FileEntry["status"]) => {
    switch (status) {
      case "success":
        return <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50">Importado</Badge>;
      case "duplicate":
        return <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">Duplicado</Badge>;
      case "error":
        return <Badge variant="destructive">Erro</Badge>;
      case "uploading":
        return <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5">Enviando...</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/propostas-software")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Importar Propostas de Software</h1>
          <p className="text-sm text-muted-foreground">
            Selecione um ou mais PDFs de propostas comerciais de software
          </p>
        </div>
      </div>

      {/* Drop zone */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <FileUp className="h-4 w-4 text-primary" />
            Arquivos PDF
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors ${
              dragOver
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
            }`}
          >
            <Upload className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm font-medium text-foreground mb-1">
              Arraste e solte os PDFs aqui
            </p>
            <p className="text-xs text-muted-foreground">
              ou clique para selecionar — máximo 20 MB por arquivo
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">
                  {files.length} arquivo{files.length !== 1 ? "s" : ""} selecionado{files.length !== 1 ? "s" : ""}
                </p>
                {!isUploading && !showSummary && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    onClick={() => setFiles([])}
                  >
                    Limpar tudo
                  </Button>
                )}
              </div>
              <div className="divide-y divide-border rounded-lg border border-border">
                {files.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 px-3 py-2.5"
                  >
                    {statusIcon(entry.status)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{entry.file.name}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {formatFileSize(entry.file.size)}
                        </span>
                        {entry.message && (
                          <span className="text-xs text-muted-foreground truncate">
                            — {entry.message}
                          </span>
                        )}
                      </div>
                    </div>
                    {statusLabel(entry.status)}
                    {entry.status === "pending" && !isUploading && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => removeFile(entry.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Origin + Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Informações adicionais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Origem da proposta</Label>
            <Select value={origin} onValueChange={setOrigin}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORIGIN_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              A mesma origem será aplicada a todos os arquivos desta importação.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Observações (opcional)</Label>
            <Textarea
              placeholder="Informações adicionais sobre esta importação..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      {showSummary && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <h3 className="text-sm font-semibold text-foreground mb-3">Resumo da importação</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">Total selecionados:</span>
              <span className="font-medium text-foreground">{counts.total}</span>
              <span className="text-muted-foreground">Importados com sucesso:</span>
              <span className="font-medium text-emerald-600">{counts.success}</span>
              {counts.duplicate > 0 && (
                <>
                  <span className="text-muted-foreground">Duplicados ignorados:</span>
                  <span className="font-medium text-amber-600">{counts.duplicate}</span>
                </>
              )}
              {counts.error > 0 && (
                <>
                  <span className="text-muted-foreground">Falhas:</span>
                  <span className="font-medium text-destructive">{counts.error}</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => navigate("/propostas-software")}
          disabled={isUploading}
        >
          {showSummary ? "Voltar para a lista" : "Cancelar"}
        </Button>
        {showSummary ? (
          <Button
            onClick={() => {
              setFiles([]);
              setShowSummary(false);
              setNotes("");
            }}
            variant="outline"
          >
            Nova importação
          </Button>
        ) : (
          <Button
            onClick={uploadAll}
            disabled={!canUpload}
            className="gap-2"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {isUploading
              ? "Importando..."
              : `Importar ${counts.pending} arquivo${counts.pending !== 1 ? "s" : ""}`}
          </Button>
        )}
      </div>
    </div>
  );
}
