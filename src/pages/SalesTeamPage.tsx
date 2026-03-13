import { mockSalesTeam } from "@/data/mockData";
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
  const grouped = mockSalesTeam.reduce<Record<string, typeof mockSalesTeam>>((acc, m) => {
    (acc[m.role] = acc[m.role] || []).push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Time de Vendas</h1>
        <p className="text-sm text-muted-foreground">
          {mockSalesTeam.length} membros cadastrados
        </p>
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
                const linkedGsn = member.linkedGsnId
                  ? mockSalesTeam.find((m) => m.id === member.linkedGsnId)
                  : null;
                return (
                  <div
                    key={member.id}
                    className="rounded-lg border border-border bg-card p-4"
                  >
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
                      <p>📧 {member.email}</p>
                      {linkedGsn && (
                        <p>🔗 GSN: {linkedGsn.name}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
