import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Download, Upload, FileSpreadsheet, Users, LayoutTemplate, Loader2, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import * as XLSX from "xlsx";

// ─── Template generation ─────────────────────────────────────────

function generateClientTemplate(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const headers = [
    "Código*", "Nome*", "CNPJ*", "Loja", "Inscrição Estadual", "Contato",
    "Email", "Telefone", "Endereço", "Código Unidade", "Código ESN", "Código GSN"
  ];

  const exampleRow = [
    "CLI001", "Empresa Exemplo LTDA", "12.345.678/0001-90", "01", "123456789",
    "João Silva", "joao@empresa.com", "(11) 99999-0000",
    "Rua Exemplo, 123 - São Paulo/SP", "", "", ""
  ];

  const instructions = [
    "INSTRUÇÕES DE PREENCHIMENTO:",
    "- Campos marcados com * são obrigatórios",
    "- Código: identificador único do cliente (A1_COD)",
    "- Loja: código da loja/filial (A1_LOJA)",
    "- CNPJ: formato XX.XXX.XXX/XXXX-XX",
    "- Código Unidade/ESN/GSN: códigos dos registros já cadastrados no sistema",
    "- Remova esta linha de instruções e a linha de exemplo antes de importar",
  ];

  const data = [headers, exampleRow, [], instructions];
  const ws = XLSX.utils.aoa_to_sheet(data);

  ws["!cols"] = [
    { wch: 12 }, { wch: 35 }, { wch: 22 }, { wch: 8 }, { wch: 18 },
    { wch: 20 }, { wch: 28 }, { wch: 18 }, { wch: 40 },
    { wch: 16 }, { wch: 14 }, { wch: 14 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Clientes");
  return wb;
}

function generateTemplateTemplate(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const headers = [
    "Nome Template*", "Produto*", "Categoria*",
    "Tipo (P=Processo / S=Sub-item)*", "Descrição Item*",
    "Horas Padrão", "Processo Pai (descrição, se Sub-item)"
  ];

  const examples = [
    ["Implantação RM", "RM", "Implantação", "P", "Cadastros Básicos", 8, ""],
    ["Implantação RM", "RM", "Implantação", "S", "Cadastro de Fornecedores", 4, "Cadastros Básicos"],
    ["Implantação RM", "RM", "Implantação", "S", "Cadastro de Clientes", 4, "Cadastros Básicos"],
    ["Implantação RM", "RM", "Implantação", "P", "Financeiro", 16, ""],
    ["Implantação RM", "RM", "Implantação", "S", "Contas a Pagar", 8, "Financeiro"],
    ["Implantação RM", "RM", "Implantação", "S", "Contas a Receber", 8, "Financeiro"],
  ];

  const instructions = [
    "",
    "INSTRUÇÕES DE PREENCHIMENTO:",
    "- Campos marcados com * são obrigatórios",
    "- Nome Template, Produto e Categoria: devem ser iguais para todos os itens do mesmo template",
    "- Tipo: P = Processo (nível 1), S = Sub-item (nível 2)",
    "- Processo Pai: para Sub-itens (S), informe a descrição exata do Processo pai",
    "- Horas Padrão: valor numérico, padrão 0 se vazio",
    "- Remova as linhas de exemplo e instruções antes de importar",
  ];

  const data = [headers, ...examples, ...instructions.map(i => [i])];
  const ws = XLSX.utils.aoa_to_sheet(data);

  ws["!cols"] = [
    { wch: 25 }, { wch: 15 }, { wch: 18 },
    { wch: 28 }, { wch: 35 }, { wch: 14 }, { wch: 30 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Templates de Escopo");
  return wb;
}

function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Import log types ────────────────────────────────────────────

interface ImportLog {
  status: "ok" | "error" | "info";
  message: string;
}

// ─── Component ───────────────────────────────────────────────────

export default function ImportDataPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const clientFileRef = useRef<HTMLInputElement>(null);
  const templateFileRef = useRef<HTMLInputElement>(null);

  const [importing, setImporting] = useState(false);
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [clearClientsBeforeImport, setClearClientsBeforeImport] = useState(false);
  const [clearTemplatesBeforeImport, setClearTemplatesBeforeImport] = useState(false);

  function addLog(status: ImportLog["status"], message: string) {
    setLogs(prev => [...prev, { status, message }]);
  }

  // ─── Clear data helpers ────────────────────────────────────

  async function clearClients() {
    addLog("info", "Limpando base de clientes...");
    // Must delete proposals and related data first due to FK constraints
    const { error: pcErr } = await supabase.from("payment_conditions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const { error: psiErr } = await supabase.from("proposal_scope_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const { error: pmsErr } = await supabase.from("proposal_macro_scope").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const { error: pdErr } = await supabase.from("proposal_documents").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const { error: prErr } = await supabase.from("proposals").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const { error } = await supabase.from("clients").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      addLog("error", `Erro ao limpar clientes: ${error.message}`);
      return false;
    }
    addLog("ok", "Base de clientes limpa com sucesso.");
    return true;
  }

  async function clearTemplates() {
    addLog("info", "Limpando base de templates...");
    // Delete items first, then templates
    const { error: itemsErr } = await supabase.from("scope_template_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (itemsErr) {
      addLog("error", `Erro ao limpar itens de template: ${itemsErr.message}`);
      return false;
    }
    const { error } = await supabase.from("scope_templates").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      addLog("error", `Erro ao limpar templates: ${error.message}`);
      return false;
    }
    addLog("ok", "Base de templates limpa com sucesso.");
    return true;
  }

  // ─── Client import ──────────────────────────────────────────

  async function handleClientImport(file: File) {
    setLogs([]);
    setShowLogs(true);
    setImporting(true);

    if (clearClientsBeforeImport) {
      const cleared = await clearClients();
      if (!cleared) {
        setImporting(false);
        return;
      }
    }

    addLog("info", `Lendo arquivo "${file.name}"...`);

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      if (rows.length < 2) {
        addLog("error", "Planilha vazia ou sem dados além do cabeçalho.");
        setImporting(false);
        return;
      }

      // Skip header row, filter empty rows (code + name + cnpj required)
      const dataRows = rows.slice(1).filter(r => r[0] && r[1] && r[2]);
      addLog("info", `${dataRows.length} registros encontrados.`);

      // Load units, sales_team for code lookup
      const { data: units } = await supabase.from("unit_info").select("id, name");
      const { data: salesTeam } = await supabase.from("sales_team").select("id, code, role");
      const unitMap = new Map((units || []).map(u => [u.name.toLowerCase(), u.id]));
      const esnMap = new Map((salesTeam || []).filter(s => s.role === "esn").map(s => [s.code.toLowerCase(), s.id]));
      const gsnMap = new Map((salesTeam || []).filter(s => s.role === "gsn").map(s => [s.code.toLowerCase(), s.id]));

      let success = 0;
      let errors = 0;

      for (let i = 0; i < dataRows.length; i++) {
        const r = dataRows[i];
        const code = String(r[0] || "").trim();
        const name = String(r[1] || "").trim();
        const cnpj = String(r[2] || "").trim();

        if (!code || !name || !cnpj) {
          addLog("error", `Linha ${i + 2}: Código, Nome e CNPJ são obrigatórios.`);
          errors++;
          continue;
        }

        const storeCode = String(r[3] || "").trim();
        const unitCode = String(r[9] || "").trim().toLowerCase();
        const esnCode = String(r[10] || "").trim().toLowerCase();
        const gsnCode = String(r[11] || "").trim().toLowerCase();

        const payload: any = {
          code,
          name,
          cnpj,
          store_code: storeCode || "",
          state_registration: String(r[4] || "").trim() || null,
          contact: String(r[5] || "").trim() || null,
          email: String(r[6] || "").trim() || null,
          phone: String(r[7] || "").trim() || null,
          address: String(r[8] || "").trim() || null,
          unit_id: unitCode ? (unitMap.get(unitCode) || null) : null,
          esn_id: esnCode ? (esnMap.get(esnCode) || null) : null,
          gsn_id: gsnCode ? (gsnMap.get(gsnCode) || null) : null,
        };

        const { error } = await supabase.from("clients").insert(payload);
        if (error) {
          addLog("error", `Linha ${i + 2} (${code}): ${error.message}`);
          errors++;
        } else {
          success++;
        }
      }

      addLog("ok", `Importação concluída: ${success} clientes importados, ${errors} erros.`);
      if (success > 0) qc.invalidateQueries({ queryKey: ["clients"] });
    } catch (err: any) {
      addLog("error", `Erro ao processar arquivo: ${err.message}`);
    }
    setImporting(false);
  }

  // ─── Template import ────────────────────────────────────────

  async function handleTemplateImport(file: File) {
    setLogs([]);
    setShowLogs(true);
    setImporting(true);

    if (clearTemplatesBeforeImport) {
      const cleared = await clearTemplates();
      if (!cleared) {
        setImporting(false);
        return;
      }
    }

    addLog("info", `Lendo arquivo "${file.name}"...`);

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      if (rows.length < 2) {
        addLog("error", "Planilha vazia ou sem dados além do cabeçalho.");
        setImporting(false);
        return;
      }

      const dataRows = rows.slice(1).filter(r => r[0] && r[3] && r[4]);
      addLog("info", `${dataRows.length} linhas de dados encontradas.`);

      // Group by template name
      const templateGroups = new Map<string, { product: string; category: string; items: any[] }>();

      for (const r of dataRows) {
        const tplName = String(r[0] || "").trim();
        const product = String(r[1] || "").trim();
        const category = String(r[2] || "").trim();
        const tipo = String(r[3] || "").trim().toUpperCase();
        const desc = String(r[4] || "").trim();
        const hours = Number(r[5]) || 0;
        const parentDesc = String(r[6] || "").trim();

        if (!tplName || !desc) continue;

        if (!templateGroups.has(tplName)) {
          templateGroups.set(tplName, { product, category, items: [] });
        }
        templateGroups.get(tplName)!.items.push({ tipo, desc, hours, parentDesc });
      }

      addLog("info", `${templateGroups.size} template(s) identificados.`);

      let success = 0;
      let errors = 0;

      for (const [tplName, group] of templateGroups) {
        const { data: tpl, error: tplErr } = await supabase
          .from("scope_templates")
          .insert({ name: tplName, product: group.product, category: group.category })
          .select("id")
          .single();

        if (tplErr || !tpl) {
          addLog("error", `Template "${tplName}": ${tplErr?.message || "erro desconhecido"}`);
          errors++;
          continue;
        }

        const templateId = tpl.id;
        const processes = group.items.filter(i => i.tipo === "P");
        const processIdMap = new Map<string, string>();
        let sortOrder = 0;

        for (const proc of processes) {
          const { data: inserted, error } = await supabase
            .from("scope_template_items")
            .insert({
              template_id: templateId,
              description: proc.desc,
              default_hours: proc.hours,
              sort_order: sortOrder++,
              parent_id: null,
            })
            .select("id")
            .single();

          if (error) {
            addLog("error", `Item "${proc.desc}" em "${tplName}": ${error.message}`);
          } else if (inserted) {
            processIdMap.set(proc.desc.toLowerCase(), inserted.id);
          }
        }

        const subItems = group.items.filter(i => i.tipo === "S");
        for (const sub of subItems) {
          const parentId = processIdMap.get(sub.parentDesc.toLowerCase());
          if (!parentId) {
            addLog("error", `Sub-item "${sub.desc}": processo pai "${sub.parentDesc}" não encontrado no template "${tplName}".`);
            continue;
          }

          const { error } = await supabase
            .from("scope_template_items")
            .insert({
              template_id: templateId,
              description: sub.desc,
              default_hours: sub.hours,
              sort_order: sortOrder++,
              parent_id: parentId,
            });

          if (error) {
            addLog("error", `Sub-item "${sub.desc}": ${error.message}`);
          }
        }

        addLog("ok", `Template "${tplName}" importado com ${processes.length} processos e ${subItems.length} sub-itens.`);
        success++;
      }

      addLog("ok", `Importação concluída: ${success} templates importados, ${errors} erros.`);
      if (success > 0) {
        qc.invalidateQueries({ queryKey: ["scope_templates"] });
        qc.invalidateQueries({ queryKey: ["scope_template_items"] });
      }
    } catch (err: any) {
      addLog("error", `Erro ao processar arquivo: ${err.message}`);
    }
    setImporting(false);
  }

  // ─── File input handlers ────────────────────────────────────

  function onClientFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleClientImport(file);
    e.target.value = "";
  }

  function onTemplateFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleTemplateImport(file);
    e.target.value = "";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/configuracoes")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Importar Dados</h1>
          <p className="text-sm text-muted-foreground">Importe clientes e templates de escopo via planilha Excel</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Clients */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Clientes</CardTitle>
                <CardDescription>Importar cadastro de clientes</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Baixe o modelo de planilha, preencha com os dados dos clientes e faça o upload para importar.
            </p>
            <div className="flex items-center gap-2">
              <Checkbox
                id="clear-clients"
                checked={clearClientsBeforeImport}
                onCheckedChange={(v) => setClearClientsBeforeImport(!!v)}
              />
              <Label htmlFor="clear-clients" className="text-xs text-destructive flex items-center gap-1 cursor-pointer">
                <Trash2 className="h-3 w-3" />
                Limpar base antes de importar
              </Label>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadWorkbook(generateClientTemplate(), "modelo_clientes.xlsx")}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Baixar Modelo
              </Button>
              <Button
                size="sm"
                disabled={importing}
                onClick={() => clientFileRef.current?.click()}
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Importar
              </Button>
              <input ref={clientFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onClientFile} />
            </div>
          </CardContent>
        </Card>

        {/* Templates */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <LayoutTemplate className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Templates de Escopo</CardTitle>
                <CardDescription>Importar templates com processos e sub-itens</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Baixe o modelo, preencha com os templates e seus itens hierárquicos, e faça o upload para importar.
            </p>
            <div className="flex items-center gap-2">
              <Checkbox
                id="clear-templates"
                checked={clearTemplatesBeforeImport}
                onCheckedChange={(v) => setClearTemplatesBeforeImport(!!v)}
              />
              <Label htmlFor="clear-templates" className="text-xs text-destructive flex items-center gap-1 cursor-pointer">
                <Trash2 className="h-3 w-3" />
                Limpar base antes de importar
              </Label>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadWorkbook(generateTemplateTemplate(), "modelo_templates_escopo.xlsx")}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Baixar Modelo
              </Button>
              <Button
                size="sm"
                disabled={importing}
                onClick={() => templateFileRef.current?.click()}
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Importar
              </Button>
              <input ref={templateFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onTemplateFile} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Import log */}
      {showLogs && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Log de Importação
              </CardTitle>
              {!importing && (
                <Button variant="ghost" size="sm" onClick={() => setShowLogs(false)}>
                  Fechar
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64 rounded-md border border-border bg-muted/30 p-3">
              <div className="space-y-1 font-mono text-xs">
                {logs.map((entry, i) => (
                  <div key={i} className="flex items-start gap-2">
                    {entry.status === "ok" && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />}
                    {entry.status === "error" && <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />}
                    {entry.status === "info" && <FileSpreadsheet className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />}
                    <span className={
                      entry.status === "ok" ? "text-green-600 dark:text-green-400" :
                      entry.status === "error" ? "text-destructive" :
                      "text-muted-foreground"
                    }>
                      {entry.message}
                    </span>
                  </div>
                ))}
                {importing && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Processando...
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
