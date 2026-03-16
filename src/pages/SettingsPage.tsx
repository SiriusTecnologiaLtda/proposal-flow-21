import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Settings, Save, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProposalDefaults, useUpdateProposalDefaults } from "@/hooks/useSupabaseData";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const navigate = useNavigate();
  const { data: defaults, isLoading } = useProposalDefaults();
  const updateDefaults = useUpdateProposalDefaults();
  const { toast } = useToast();

  const [hourlyRate, setHourlyRate] = useState(250);
  const [gpPercentage, setGpPercentage] = useState(20);
  const [travelLocalHours, setTravelLocalHours] = useState(1);
  const [travelTripHours, setTravelTripHours] = useState(4);
  const [travelHourlyRate, setTravelHourlyRate] = useState(250);
  const [additionalAnalystRate, setAdditionalAnalystRate] = useState(280);
  const [additionalGpRate, setAdditionalGpRate] = useState(300);

  useEffect(() => {
    if (defaults) {
      setHourlyRate(defaults.hourly_rate);
      setGpPercentage(defaults.gp_percentage);
      setTravelLocalHours(defaults.travel_local_hours);
      setTravelTripHours(defaults.travel_trip_hours);
      setTravelHourlyRate(defaults.travel_hourly_rate);
      setAdditionalAnalystRate(defaults.additional_analyst_rate);
      setAdditionalGpRate(defaults.additional_gp_rate);
    }
  }, [defaults]);

  async function handleSave() {
    if (!defaults?.id) return;
    try {
      await updateDefaults.mutateAsync({
        id: defaults.id,
        hourly_rate: hourlyRate,
        gp_percentage: gpPercentage,
        travel_local_hours: travelLocalHours,
        travel_trip_hours: travelTripHours,
        travel_hourly_rate: travelHourlyRate,
        additional_analyst_rate: additionalAnalystRate,
        additional_gp_rate: additionalGpRate,
      });
      toast({ title: "Parâmetros salvos com sucesso!" });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie acessos, APIs e parâmetros do sistema</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {[
          { title: "Usuários e Acessos", desc: "Gerenciar usuários e permissões da plataforma", action: () => toast({ title: "Em breve", description: "Módulo de gestão de usuários será implementado em breve." }) },
          { title: "Integrações / APIs", desc: "Configurar APIs externas para sincronizar Clientes e Time de Vendas", action: () => toast({ title: "Em breve", description: "Módulo de integrações será implementado em breve." }) },
          { title: "Dados da Unidade", desc: "Informações da unidade TOTVS Leste (CNPJ, endereço, etc.)", action: () => navigate("/unidades") },
        ].map((item) => (
          <div key={item.title} onClick={item.action} className="cursor-pointer rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/50">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-muted-foreground">
                <Settings className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        ))}
      </div>

      {/* Parâmetros de Proposta */}
      <div className="rounded-lg border border-border bg-card p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">Parâmetros Padrão de Proposta</h2>
            <p className="text-xs text-muted-foreground">Valores carregados automaticamente em novas propostas. O usuário pode ajustá-los por proposta.</p>
          </div>
          <Button size="sm" onClick={handleSave} disabled={updateDefaults.isPending || isLoading}>
            <Save className="mr-1 h-4 w-4" /> Salvar
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor Hora (R$)</Label>
                <Input type="number" value={hourlyRate} onChange={(e) => setHourlyRate(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">% Horas GP</Label>
                <Input type="number" value={gpPercentage} onChange={(e) => setGpPercentage(Number(e.target.value))} />
              </div>
            </div>

            <h3 className="text-sm font-medium text-foreground pt-2 border-t border-border">Outros Parâmetros</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Qtde Horas Traslado Local</Label>
                <Input type="number" value={travelLocalHours} onChange={(e) => setTravelLocalHours(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Qtde Horas Traslado Viagem</Label>
                <Input type="number" value={travelTripHours} onChange={(e) => setTravelTripHours(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valor Hora Traslado (R$)</Label>
                <Input type="number" value={travelHourlyRate} onChange={(e) => setTravelHourlyRate(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valor Hora Adicional/Avulso Analista (R$)</Label>
                <Input type="number" value={additionalAnalystRate} onChange={(e) => setAdditionalAnalystRate(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valor Hora Adicional/Avulso GP (R$)</Label>
                <Input type="number" value={additionalGpRate} onChange={(e) => setAdditionalGpRate(Number(e.target.value))} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
