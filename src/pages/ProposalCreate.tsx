import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Search, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  mockClients,
  mockSalesTeam,
  mockScopeTemplates,
  products,
  type ScopeItem,
  type PaymentCondition,
} from "@/data/mockData";

const steps = [
  { id: 1, label: "Dados Gerais" },
  { id: 2, label: "Escopo" },
  { id: 3, label: "Financeiro" },
  { id: 4, label: "Revisão" },
];

export default function ProposalCreate() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1 state
  const [proposalNumber, setProposalNumber] = useState("");
  const [proposalType, setProposalType] = useState<string>("");
  const [product, setProduct] = useState<string>("");
  const [clientId, setClientId] = useState<string>("");
  const [clientSearch, setClientSearch] = useState("");
  const [esnId, setEsnId] = useState<string>("");
  const [arquitetoId, setArquitetoId] = useState<string>("");
  const [scopeType, setScopeType] = useState<string>("detalhado");

  // Step 2 state
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [scopeItems, setScopeItems] = useState<Record<string, ScopeItem[]>>({});
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);

  // Step 3 state
  const [hourlyRate, setHourlyRate] = useState(250);
  const [gpPercentage, setGpPercentage] = useState(20);
  const [payments, setPayments] = useState<PaymentCondition[]>([
    { installment: 1, dueDate: "", amount: 0 },
  ]);

  // Derived
  const selectedEsn = mockSalesTeam.find((m) => m.id === esnId);
  const autoGsn = selectedEsn?.linkedGsnId
    ? mockSalesTeam.find((m) => m.id === selectedEsn.linkedGsnId)
    : null;

  const filteredClients = mockClients.filter(
    (c) =>
      c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
      c.code.includes(clientSearch)
  );

  const availableTemplates = useMemo(() => {
    if (!product) return mockScopeTemplates;
    return mockScopeTemplates.filter(
      (t) => t.product.toLowerCase() === product.toLowerCase() || t.product === "TOTVS"
    );
  }, [product]);

  const totalHours = useMemo(() => {
    let total = 0;
    for (const items of Object.values(scopeItems)) {
      for (const item of items) {
        if (item.included) total += item.hours;
      }
    }
    return total;
  }, [scopeItems]);

  const gpHours = Math.ceil(totalHours * (gpPercentage / 100));
  const totalValue = (totalHours + gpHours) * hourlyRate;

  function toggleTemplate(templateId: string) {
    if (selectedTemplateIds.includes(templateId)) {
      setSelectedTemplateIds((prev) => prev.filter((id) => id !== templateId));
      setScopeItems((prev) => {
        const next = { ...prev };
        delete next[templateId];
        return next;
      });
    } else {
      const template = mockScopeTemplates.find((t) => t.id === templateId);
      if (template) {
        setSelectedTemplateIds((prev) => [...prev, templateId]);
        setScopeItems((prev) => ({
          ...prev,
          [templateId]: template.items.map((item) => ({ ...item })),
        }));
      }
    }
  }

  function toggleScopeItem(templateId: string, itemId: string) {
    setScopeItems((prev) => ({
      ...prev,
      [templateId]: prev[templateId].map((item) =>
        item.id === itemId ? { ...item, included: !item.included, hours: !item.included ? 8 : 0 } : item
      ),
    }));
  }

  function updateScopeItemHours(templateId: string, itemId: string, hours: number) {
    setScopeItems((prev) => ({
      ...prev,
      [templateId]: prev[templateId].map((item) =>
        item.id === itemId ? { ...item, hours } : item
      ),
    }));
  }

  function addPayment() {
    setPayments((prev) => [
      ...prev,
      { installment: prev.length + 1, dueDate: "", amount: 0 },
    ]);
  }

  function removePayment(index: number) {
    setPayments((prev) => prev.filter((_, i) => i !== index).map((p, i) => ({ ...p, installment: i + 1 })));
  }

  const selectedClient = mockClients.find((c) => c.id === clientId);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/propostas")}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Nova Proposta</h1>
          <p className="text-sm text-muted-foreground">Preencha as informações da proposta comercial</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {steps.map((step, i) => (
          <div key={step.id} className="flex items-center gap-2">
            <button
              onClick={() => setCurrentStep(step.id)}
              className={`flex h-8 items-center gap-2 rounded-full px-3 text-xs font-medium transition-colors
                ${
                  currentStep === step.id
                    ? "bg-primary text-primary-foreground"
                    : currentStep > step.id
                    ? "bg-success/15 text-success"
                    : "bg-muted text-muted-foreground"
                }`}
            >
              {currentStep > step.id ? (
                <Check className="h-3 w-3" />
              ) : (
                <span>{step.id}</span>
              )}
              <span className="hidden sm:inline">{step.label}</span>
            </button>
            {i < steps.length - 1 && (
              <div className="h-px w-4 bg-border sm:w-8" />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Dados Gerais */}
      {currentStep === 1 && (
        <div className="space-y-6 rounded-lg border border-border bg-card p-4 md:p-6">
          <h2 className="text-base font-semibold text-foreground">Dados Gerais</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Número da Proposta (OPP)</Label>
              <Input
                placeholder="OPP-2025-XXX"
                value={proposalNumber}
                onChange={(e) => setProposalNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de Proposta</Label>
              <Select value={proposalType} onValueChange={setProposalType}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="projeto">Projeto</SelectItem>
                  <SelectItem value="banco_de_horas">Banco de Horas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Produto</Label>
              <Select value={product} onValueChange={setProduct}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Escopo</Label>
              <Select value={scopeType} onValueChange={setScopeType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="detalhado">Detalhado</SelectItem>
                  <SelectItem value="macro">Macro Escopo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Client */}
          <div className="space-y-3">
            <Label className="text-xs">Cliente</Label>
            {selectedClient ? (
              <div className="flex items-center justify-between rounded-md border border-border bg-accent/50 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{selectedClient.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedClient.code} · {selectedClient.cnpj}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setClientId("")}>
                  Alterar
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar cliente por nome ou código..."
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {clientSearch.length >= 2 && (
                  <div className="max-h-48 overflow-auto rounded-md border border-border bg-card">
                    {filteredClients.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setClientId(c.id);
                          setClientSearch("");
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                      >
                        <span className="font-medium text-foreground">{c.name}</span>
                        <span className="text-xs text-muted-foreground">{c.code}</span>
                      </button>
                    ))}
                    {filteredClients.length === 0 && (
                      <p className="px-3 py-2 text-xs text-muted-foreground">
                        Nenhum cliente encontrado. Cadastre um novo.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sales Team */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Executivo de Vendas (ESN)</Label>
              <Select value={esnId} onValueChange={setEsnId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {mockSalesTeam.filter((m) => m.role === "esn").map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.code} - {m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Gerente de Vendas (GSN)</Label>
              <div className="flex h-9 items-center rounded-md border border-border bg-muted px-3 text-sm text-muted-foreground">
                {autoGsn ? `${autoGsn.code} - ${autoGsn.name}` : "Vinculado ao ESN"}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Arquiteto de Solução</Label>
              <Select value={arquitetoId} onValueChange={setArquitetoId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {mockSalesTeam.filter((m) => m.role === "arquiteto").map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.code} - {m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Escopo */}
      {currentStep === 2 && (
        <div className="space-y-4">
          {/* Template selection */}
          <div className="rounded-lg border border-border bg-card p-4 md:p-6">
            <h2 className="mb-3 text-base font-semibold text-foreground">Selecione os Templates de Escopo</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Escolha os módulos que farão parte desta proposta. Você pode adicionar ou remover a qualquer momento.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {availableTemplates.map((template) => {
                const isSelected = selectedTemplateIds.includes(template.id);
                return (
                  <button
                    key={template.id}
                    onClick={() => toggleTemplate(template.id)}
                    className={`flex items-center gap-3 rounded-md border p-3 text-left transition-all
                      ${
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30"
                      }`}
                  >
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors
                        ${isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{template.name}</p>
                      <p className="text-xs text-muted-foreground">{template.items.length} itens</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scope items for selected templates */}
          {selectedTemplateIds.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">Detalhamento do Escopo</h2>
              {selectedTemplateIds.map((templateId) => {
                const template = mockScopeTemplates.find((t) => t.id === templateId);
                const items = scopeItems[templateId] || [];
                const isOpen = expandedTemplateId === templateId;
                const includedCount = items.filter((i) => i.included).length;
                const templateHours = items.filter((i) => i.included).reduce((s, i) => s + i.hours, 0);

                return (
                  <div key={templateId} className="rounded-lg border border-border bg-card overflow-hidden">
                    <button
                      onClick={() => setExpandedTemplateId(isOpen ? null : templateId)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-accent/50"
                    >
                      <div className="flex items-center gap-3">
                        {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        <div>
                          <p className="text-sm font-medium text-foreground">{template?.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {includedCount}/{items.length} selecionados · {templateHours}h
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleTemplate(templateId);
                        }}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </button>
                    {isOpen && (
                      <div className="border-t border-border">
                        {/* Select all */}
                        <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-2">
                          <span className="text-xs font-medium text-muted-foreground">Item do Escopo</span>
                          <div className="flex items-center gap-4">
                            <span className="text-xs font-medium text-muted-foreground w-16 text-center">Horas</span>
                            <span className="text-xs font-medium text-muted-foreground w-12 text-center">Sim/Não</span>
                          </div>
                        </div>
                        {items.map((item) => (
                          <div
                            key={item.id}
                            className={`flex items-center justify-between px-4 py-2.5 border-b border-border last:border-0 transition-colors
                              ${item.included ? "bg-success/5" : ""}`}
                          >
                            <p className={`text-sm flex-1 pr-4 ${item.included ? "text-foreground" : "text-muted-foreground"}`}>
                              {item.description}
                            </p>
                            <div className="flex items-center gap-4">
                              <Input
                                type="number"
                                min={0}
                                value={item.hours}
                                onChange={(e) => updateScopeItemHours(templateId, item.id, Number(e.target.value))}
                                className="h-7 w-16 text-center text-xs"
                                disabled={!item.included}
                              />
                              <Switch
                                checked={item.included}
                                onCheckedChange={() => toggleScopeItem(templateId, item.id)}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Financeiro */}
      {currentStep === 3 && (
        <div className="space-y-6 rounded-lg border border-border bg-card p-4 md:p-6">
          <h2 className="text-base font-semibold text-foreground">Informações Financeiras</h2>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor Hora (R$)</Label>
              <Input
                type="number"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">% Horas GP</Label>
              <Input
                type="number"
                value={gpPercentage}
                onChange={(e) => setGpPercentage(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Qtde Empresas</Label>
              <Input type="number" defaultValue={1} />
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-md border border-border bg-muted/50 p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Resumo Financeiro</h3>
            <div className="grid gap-2 text-sm md:grid-cols-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Horas Analista:</span>
                <span className="font-medium text-foreground">{totalHours}h</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Horas GP ({gpPercentage}%):</span>
                <span className="font-medium text-foreground">{gpHours}h</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total de Horas:</span>
                <span className="font-medium text-foreground">{totalHours + gpHours}h</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor Líquido:</span>
                <span className="font-semibold text-foreground">
                  R$ {totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Payment conditions */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Condições de Pagamento</h3>
              <Button variant="outline" size="sm" onClick={addPayment}>
                <Plus className="mr-1 h-3 w-3" /> Parcela
              </Button>
            </div>
            <div className="space-y-2">
              {payments.map((payment, index) => (
                <div key={index} className="flex items-center gap-3">
                  <span className="w-8 text-xs text-muted-foreground text-right">{payment.installment}ª</span>
                  <Input
                    type="date"
                    value={payment.dueDate}
                    onChange={(e) => {
                      const updated = [...payments];
                      updated[index] = { ...updated[index], dueDate: e.target.value };
                      setPayments(updated);
                    }}
                    className="h-8 text-xs"
                  />
                  <Input
                    type="number"
                    placeholder="Valor"
                    value={payment.amount || ""}
                    onChange={(e) => {
                      const updated = [...payments];
                      updated[index] = { ...updated[index], amount: Number(e.target.value) };
                      setPayments(updated);
                    }}
                    className="h-8 text-xs"
                  />
                  {payments.length > 1 && (
                    <button
                      onClick={() => removePayment(index)}
                      className="rounded p-1 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Negotiation */}
          <div className="space-y-1.5">
            <Label className="text-xs">Negociação Específica (opcional)</Label>
            <Textarea placeholder="Descreva condições especiais ou observações..." rows={3} />
          </div>
        </div>
      )}

      {/* Step 4: Revisão */}
      {currentStep === 4 && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 md:p-6">
            <h2 className="mb-4 text-base font-semibold text-foreground">Revisão da Proposta</h2>

            <div className="space-y-4">
              {/* General info */}
              <div className="rounded-md border border-border p-4">
                <h3 className="mb-2 text-sm font-semibold text-foreground">Dados Gerais</h3>
                <div className="grid gap-1 text-sm md:grid-cols-2">
                  <p><span className="text-muted-foreground">Nº Proposta:</span> <span className="font-medium">{proposalNumber || "—"}</span></p>
                  <p><span className="text-muted-foreground">Tipo:</span> <span className="font-medium">{proposalType === "projeto" ? "Projeto" : proposalType === "banco_de_horas" ? "Banco de Horas" : "—"}</span></p>
                  <p><span className="text-muted-foreground">Produto:</span> <span className="font-medium">{product || "—"}</span></p>
                  <p><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{selectedClient?.name || "—"}</span></p>
                  <p><span className="text-muted-foreground">ESN:</span> <span className="font-medium">{selectedEsn?.name || "—"}</span></p>
                  <p><span className="text-muted-foreground">GSN:</span> <span className="font-medium">{autoGsn?.name || "—"}</span></p>
                </div>
              </div>

              {/* Scope summary */}
              <div className="rounded-md border border-border p-4">
                <h3 className="mb-2 text-sm font-semibold text-foreground">Escopo</h3>
                <div className="space-y-1 text-sm">
                  {selectedTemplateIds.map((tid) => {
                    const template = mockScopeTemplates.find((t) => t.id === tid);
                    const items = scopeItems[tid] || [];
                    const included = items.filter((i) => i.included);
                    const hours = included.reduce((s, i) => s + i.hours, 0);
                    return (
                      <div key={tid} className="flex justify-between">
                        <span className="text-muted-foreground">{template?.name}</span>
                        <span className="font-medium">{included.length} itens · {hours}h</span>
                      </div>
                    );
                  })}
                  {selectedTemplateIds.length === 0 && (
                    <p className="text-muted-foreground">Nenhum template selecionado</p>
                  )}
                </div>
              </div>

              {/* Financial summary */}
              <div className="rounded-md border border-border bg-primary/5 p-4">
                <h3 className="mb-2 text-sm font-semibold text-foreground">Financeiro</h3>
                <div className="grid gap-1 text-sm md:grid-cols-2">
                  <p><span className="text-muted-foreground">Total Horas:</span> <span className="font-semibold">{totalHours + gpHours}h</span></p>
                  <p><span className="text-muted-foreground">Valor Hora:</span> <span className="font-semibold">R$ {hourlyRate.toFixed(2)}</span></p>
                  <p><span className="text-muted-foreground">Valor Total:</span> <span className="text-lg font-bold text-primary">R$ {totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></p>
                  <p><span className="text-muted-foreground">Parcelas:</span> <span className="font-semibold">{payments.length}x</span></p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
          disabled={currentStep === 1}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Anterior
        </Button>
        <div className="flex gap-2">
          {currentStep === 4 ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  // Save as draft
                  navigate("/propostas");
                }}
              >
                Salvar Rascunho
              </Button>
              <Button
                onClick={() => {
                  // Generate proposal
                  navigate("/propostas");
                }}
              >
                <Check className="mr-2 h-4 w-4" />
                Gerar Proposta
              </Button>
            </>
          ) : (
            <Button onClick={() => setCurrentStep((s) => Math.min(4, s + 1))}>
              Próximo
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
