import { useSalesTeam, useUnits } from "@/hooks/useSupabaseData";
import { UserCog } from "lucide-react";

const roleLabels: Record<string, string> = {
  esn: "Executivo de Vendas (ESN)",
  gsn: "Gerente de Vendas (GSN)",
  arquiteto: "Arquiteto de Soluções",
};

const roleColors: Record<string, string> = {
  esn: "bg-primary/10 text-primary",
  gsn: "bg-success/15 text-success",
  arquiteto: "bg-warning/15 text-warning",
};

export default function SalesTeamPage() {
  const { data: salesTeam = [] } = useSalesTeam();
  const { data: units = [] } = useUnits();

  const grouped = salesTeam.reduce<Record<string, typeof salesTeam>>((acc, m) => {
    (acc[m.role] = acc[m.role] || []).push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Time de Vendas</h1>
        <p className="text-sm text-muted-foreground">{salesTeam.length} membros cadastrados</p>
      </div>

      {(["gsn", "esn", "arquiteto"] as const).map((role) => {
        const members = grouped[role] || [];
        return (
          <div key={role}>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {roleLabels[role]}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((member) => {
                const linkedGsn = member.linked_gsn_id
                  ? salesTeam.find((m) => m.id === member.linked_gsn_id)
                  : null;
                const unitName = (member as any).unit_info?.name;
                return (
                  <div key={member.id} className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${roleColors[role]}`}>
                        <UserCog className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{member.name}</p>
                        <p className="text-xs text-muted-foreground">{member.code}</p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {member.email && <p>📧 {member.email}</p>}
                      {linkedGsn && <p>🔗 GSN: {linkedGsn.name}</p>}
                      {unitName && <p>🏢 {unitName}</p>}
                    </div>
                  </div>
                );
              })}
              {members.length === 0 && (
                <p className="text-sm text-muted-foreground col-span-full">Nenhum membro neste grupo.</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
