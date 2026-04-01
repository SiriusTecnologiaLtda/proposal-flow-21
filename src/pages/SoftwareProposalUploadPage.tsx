import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ArrowLeft, Upload, FileUp, FileText, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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

async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function SoftwareProposalUploadPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [origin, setOrigin] = useState("other");
  const [notes, setNotes] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileSelect = useCallback((file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("Apenas arquivos PDF são aceitos.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("O arquivo excede o limite de 20 MB.");
      return;
    }
    setSelectedFile(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !user) throw new Error("Dados insuficientes");

      setUploadProgress(10);

      // 1. Compute hash
      const fileHash = await computeFileHash(selectedFile);
      setUploadProgress(25);

      // 2. Check duplicate
      const { data: existing } = await supabase
        .from("software_proposals")
        .select("id, file_name")
        .eq("file_hash", fileHash)
        .maybeSingle();

      if (existing) {
        throw new Error(
          `Este arquivo já foi importado anteriormente como "${existing.file_name}". Envio duplicado não permitido.`
        );
      }

      setUploadProgress(40);

      // 3. Upload to storage
      const filePath = `${user.id}/${fileHash}.pdf`;
      const { error: storageError } = await supabase.storage
        .from("software-proposal-pdfs")
        .upload(filePath, selectedFile, { upsert: false });

      if (storageError) throw new Error(`Erro ao enviar arquivo: ${storageError.message}`);
      setUploadProgress(70);

      // 4. Store the path reference (private bucket — signed URLs generated on demand)
      setUploadProgress(85);

      // 5. Create record — cleanup uploaded file if insert fails
      const { error: insertError } = await supabase
        .from("software_proposals")
        .insert({
          file_name: selectedFile.name,
          file_url: filePath,
          file_hash: fileHash,
          origin,
          notes: notes.trim() || null,
          uploaded_by: user.id,
          status: "pending_extraction",
        });

      if (insertError) {
        // Orphan cleanup: remove uploaded file since DB record failed
        await supabase.storage
          .from("software-proposal-pdfs")
          .remove([filePath]);
        throw new Error(`Erro ao registrar proposta: ${insertError.message}`);
      }
      setUploadProgress(100);
    },
    onSuccess: () => {
      toast.success("Proposta importada com sucesso!");
      navigate("/propostas-software");
    },
    onError: (err: Error) => {
      toast.error(err.message);
      setUploadProgress(0);
    },
  });

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/propostas-software")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Importar Proposta de Software</h1>
          <p className="text-sm text-muted-foreground">
            Faça upload de um PDF de proposta comercial de software
          </p>
        </div>
      </div>

      {/* Upload area */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <FileUp className="h-4 w-4 text-primary" />
            Arquivo PDF
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedFile ? (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 cursor-pointer transition-colors ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
              }`}
            >
              <Upload className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">
                Arraste e solte o PDF aqui
              </p>
              <p className="text-xs text-muted-foreground">
                ou clique para selecionar — máximo 20 MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-4">
              <FileText className="h-8 w-8 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setSelectedFile(null);
                  setUploadProgress(0);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                disabled={uploadMutation.isPending}
              >
                <X className="h-4 w-4" />
              </Button>
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
          </div>
          <div className="space-y-2">
            <Label>Observações (opcional)</Label>
            <Textarea
              placeholder="Informações adicionais sobre esta proposta..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Progress */}
      {uploadMutation.isPending && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Importando proposta...</span>
                <span className="font-mono text-muted-foreground">{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => navigate("/propostas-software")}
          disabled={uploadMutation.isPending}
        >
          Cancelar
        </Button>
        <Button
          onClick={() => uploadMutation.mutate()}
          disabled={!selectedFile || uploadMutation.isPending}
          className="gap-2"
        >
          {uploadMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          Importar Proposta
        </Button>
      </div>
    </div>
  );
}
