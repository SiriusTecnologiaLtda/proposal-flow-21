import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  ArrowLeft, Save, Plus, Trash2, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SearchableClientSelect } from "@/components/software-proposal/SearchableClientSelect";
import { SearchableUnitSelect } from "@/components/software-proposal/SearchableUnitSelect";
import { SearchableSalesTeamSelect } from "@/components/software-proposal/SearchableSalesTeamSelect";
import { SearchableSegmentSelect } from "@/components/software-proposal/SearchableSegmentSelect";

const ORIGIN_OPTIONS = [
  { value: "client", label: "Cliente" },
  { value: "vendor", label: "Fornecedor" },
  { value: "partner", label: "Parceiro" },
  { value: "internal", label: "Interno" },
  { value: "historical", label: "Histórico" },
  { value: "other", label: "Outro" },
];

const RECURRENCE_OPTIONS = [
  { value: "one_time", label: "Único" },
  { value: "monthly", label: "Mensal" },
  { value: "annual", label: "Anual" },
];

const COST_OPTIONS = [
  { value: "opex", label: "Opex" },
  { value: "capex", label: "Capex" },
];

interface ManualItem {
  tempId: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  discount_pct: number;
  discount_value: number;
  recurrence: string;
  cost_classification: string;
  item_type: string;
  notes: string;
}

const emptyItem = (): ManualItem => ({
  tempId: crypto.randomUUID(),
  description: "",
  quantity: 1,
  unit_price: 0,
  total_price: 0,
  discount_pct: 0,
  discount_value: 0,
  recurrence: "monthly",
  cost_classification: "opex",
  item_type: "software",
  notes: "",
});

export default function SoftwareProposalCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    proposal_number: "",
    vendor_name: "",
    client_name: "",
    client_id: null as string | null,
    unit_id: null as string | null,
    gsn_id: null as string | null,
    esn_id: null as string | null,
    arquiteto_id: null as string | null,
    segment_id: null as string | null,
    origin: "other",
    total_value: 0,
    proposal_date: "",
    validity_date: "",
    payment_type: "",
    installment_count: "",
    first_due_date: "",
    discount_amount: 0,
    discount_notes: "",
    discount_duration_months: "",
    notes: "",
  });

  const [clientDisplayName, setClientDisplayName] = useState("");
  const [unitDisplayName, setUnitDisplayName] = useState("");
  const [gsnDisplayName, setGsnDisplayName] = useState("");
  const [esnDisplayName, setEsnDisplayName] = useState("");
  const [arquitetoDisplayName, setArquitetoDisplayName] = useState("");
  const [segmentDisplayName, setSegmentDisplayName] = useState("");
  const [items, setItems] = useState<ManualItem[]>([emptyItem()]);

  const updateForm = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateItem = (tempId: string, field: string, value: any) => {
    setItems((prev) =>
      prev.map((i) => (i.tempId === tempId ? { ...i, [field]: value } : i))
    );
  };

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);

  const removeItem = (tempId: string) => {
    setItems((prev) => prev.filter((i) => i.tempId !== tempId));
  };

  const handleSave = async () => {
    if (!user) return;
    if (!form.vendor_name.trim() && !form.client_name.trim() && !form.client_id) {
      toast.error("Preencha pelo menos o fornecedor ou o cliente");
      return;
    }

    setSaving(true);
    try {
      const { data: proposal, error: insertError } = await supabase
        .from("software_proposals")
        .insert({
          file_name: `Manual — ${form.proposal_number || form.vendor_name || "Sem título"}`,
          file_url: "",
          file_hash: null,
          origin: form.origin,
          notes: form.notes?.trim() || null,
          uploaded_by: user.id,
          status: "extracted",
          vendor_name: form.vendor_name?.trim() || null,
          client_name: form.client_name?.trim() || clientDisplayName || null,
          client_id: form.client_id,
          unit_id: form.unit_id,
          proposal_number: form.proposal_number?.trim() || null,
          total_value: Number(form.total_value) || 0,
          proposal_date: form.proposal_date || null,
          validity_date: form.validity_date || null,
          payment_type: form.payment_type?.trim() || null,
          installment_count: form.installment_count ? Number(form.installment_count) : null,
          first_due_date: form.first_due_date || null,
          discount_amount: Number(form.discount_amount) || 0,
          discount_notes: form.discount_notes?.trim() || null,
          discount_duration_months: form.discount_duration_months ? Number(form.discount_duration_months) : null,
          extraction_provider: null,
          extraction_model: null,
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      const validItems = items.filter((i) => i.description.trim());
      if (validItems.length > 0 && proposal) {
        const itemRows = validItems.map((i, idx) => ({
          software_proposal_id: proposal.id,
          description: i.description.trim(),
          quantity: Number(i.quantity) || 1,
          unit_price: Number(i.unit_price) || 0,
          total_price: Number(i.total_price) || 0,
          discount_pct: Number(i.discount_pct) || 0,
          discount_value: Number(i.discount_value) || 0,
          recurrence: i.recurrence,
          cost_classification: i.cost_classification,
          item_type: i.item_type,
          notes: i.notes?.trim() || null,
          sort_order: idx + 1,
        }));

        const { error: itemsError } = await supabase
          .from("software_proposal_items")
          .insert(itemRows);
        if (itemsError) throw itemsError;
      }

      queryClient.invalidateQueries({ queryKey: ["software-proposals"] });
      toast.success("Proposta criada com sucesso!");
      navigate(`/propostas-software/${proposal!.id}`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar proposta");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/propostas-software")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Nova Proposta de Software</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre manualmente uma proposta comercial de software
          </p>
        </div>
      </div>

      {/* Commercial info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Informações Comerciais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Nº da Proposta</Label>
              <Input
                value={form.proposal_number}
                onChange={(e) => updateForm("proposal_number", e.target.value)}
                placeholder="Ex: AAPDFQ"
              />
            </div>
            <div className="space-y-2">
              <Label>Fornecedor</Label>
              <Input
                value={form.vendor_name}
                onChange={(e) => updateForm("vendor_name", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Cliente (texto livre)</Label>
              <Input
                value={form.client_name}
                onChange={(e) => updateForm("client_name", e.target.value)}
                placeholder="Nome do cliente"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cliente Vinculado</Label>
              <SearchableClientSelect
                value={form.client_id}
                displayValue={clientDisplayName}
                onChange={(clientId, clientName) => {
                  updateForm("client_id", clientId);
                  setClientDisplayName(clientName);
                  if (clientName && !form.client_name) {
                    updateForm("client_name", clientName);
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Unidade TOTVS</Label>
              <SearchableUnitSelect
                value={form.unit_id}
                displayValue={unitDisplayName}
                onChange={(unitId, unitName) => {
                  updateForm("unit_id", unitId);
                  setUnitDisplayName(unitName);
                }}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Origem</Label>
              <Select value={form.origin} onValueChange={(v) => updateForm("origin", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORIGIN_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data da Proposta</Label>
              <Input type="date" value={form.proposal_date} onChange={(e) => updateForm("proposal_date", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Validade</Label>
              <Input type="date" value={form.validity_date} onChange={(e) => updateForm("validity_date", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Valor Total (R$)</Label>
              <Input type="number" step="0.01" value={form.total_value} onChange={(e) => updateForm("total_value", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Pagamento</Label>
              <Input value={form.payment_type} onChange={(e) => updateForm("payment_type", e.target.value)} placeholder="Ex: Boleto" />
            </div>
            <div className="space-y-2">
              <Label>Nº Parcelas</Label>
              <Input type="number" value={form.installment_count} onChange={(e) => updateForm("installment_count", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>1º Vencimento</Label>
              <Input type="date" value={form.first_due_date} onChange={(e) => updateForm("first_due_date", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Desconto (R$)</Label>
              <Input type="number" step="0.01" value={form.discount_amount} onChange={(e) => updateForm("discount_amount", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Duração Desconto (meses)</Label>
              <Input type="number" value={form.discount_duration_months} onChange={(e) => updateForm("discount_duration_months", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Observações Desconto</Label>
              <Input value={form.discount_notes} onChange={(e) => updateForm("discount_notes", e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Observações Gerais</Label>
            <Textarea value={form.notes} onChange={(e) => updateForm("notes", e.target.value)} rows={3} />
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium">Itens da Proposta</CardTitle>
            <Button size="sm" variant="outline" className="gap-2" onClick={addItem}>
              <Plus className="h-4 w-4" />
              Adicionar Item
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Descrição</TableHead>
                  <TableHead className="w-[70px]">Qtd</TableHead>
                  <TableHead className="w-[110px]">Vlr Unit.</TableHead>
                  <TableHead className="w-[110px]">Vlr Total</TableHead>
                  <TableHead className="w-[80px]">Desc %</TableHead>
                  <TableHead className="w-[100px]">Recorrência</TableHead>
                  <TableHead className="w-[80px]">Class.</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.tempId}>
                    <TableCell>
                      <Input
                        placeholder="Descrição do item"
                        value={item.description}
                        onChange={(e) => updateItem(item.tempId, "description", e.target.value)}
                        className="text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" className="text-sm w-16"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.tempId, "quantity", Number(e.target.value))}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" step="0.01" className="text-sm w-24"
                        value={item.unit_price}
                        onChange={(e) => updateItem(item.tempId, "unit_price", Number(e.target.value))}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" step="0.01" className="text-sm w-24"
                        value={item.total_price}
                        onChange={(e) => updateItem(item.tempId, "total_price", Number(e.target.value))}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" step="0.01" className="text-sm w-16"
                        value={item.discount_pct}
                        onChange={(e) => updateItem(item.tempId, "discount_pct", Number(e.target.value))}
                      />
                    </TableCell>
                    <TableCell>
                      <Select value={item.recurrence} onValueChange={(v) => updateItem(item.tempId, "recurrence", v)}>
                        <SelectTrigger className="text-sm h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {RECURRENCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={item.cost_classification} onValueChange={(v) => updateItem(item.tempId, "cost_classification", v)}>
                        <SelectTrigger className="text-sm h-9 w-20"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {COST_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {items.length > 1 && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeItem(item.tempId)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => navigate("/propostas-software")} disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar Proposta
        </Button>
      </div>
    </div>
  );
}
