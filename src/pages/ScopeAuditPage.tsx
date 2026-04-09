import { useScopeComparison } from "@/hooks/useScopeComparison";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import { Search, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";

const roleLabels: Record<string, string> = {
  dsn: "DSN",
  gsn: "GSN",
  esn: "ESN",
  arquiteto: "EV",
};

export default function ScopeAuditPage() {
  const { comparisons, summary, salesTeam } = useScopeComparison();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "match" | "mismatch">("all");

  const memberNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of salesTeam) map[m.id] = `${m.name} (${m.code})`;
    return map;
  }, [salesTeam]);

  const filtered = useMemo(() => {
    let result = comparisons;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.memberName.toLowerCase().includes(q) ||
          c.memberCode.toLowerCase().includes(q)
      );
    }
    if (filterStatus === "match") result = result.filter((c) => c.match);
    if (filterStatus === "mismatch") result = result.filter((c) => !c.match);
    return result;
  }, [comparisons, search, filterStatus]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Auditoria de Escopo Comercial
        </h1>
        <p className="text-sm text-muted-foreground">
          Comparação entre escopo legado (linked_gsn_id) e escopo novo
          (sales_team_assignments). Fase observacional — sem impacto em produção.
        </p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Membros</p>
          <p className="text-2xl font-bold">{summary.total}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <p className="text-sm text-muted-foreground">Match</p>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{summary.matches}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <p className="text-sm text-muted-foreground">Divergências</p>
          </div>
          <p className="text-2xl font-bold text-amber-600">{summary.mismatches}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar membro..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "match", "mismatch"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filterStatus === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "all" ? "Todos" : s === "match" ? "✓ Match" : "⚠ Divergências"}
            </button>
          ))}
        </div>
      </div>

      {/* Member list */}
      <div className="space-y-3">
        {filtered.map((c) => (
          <div
            key={c.memberId}
            className={`rounded-lg border p-4 ${
              c.match ? "bg-card" : "bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="text-xs">
                  {roleLabels[c.memberRole] || c.memberRole}
                </Badge>
                <span className="font-medium text-sm">{c.memberName}</span>
                <span className="text-xs text-muted-foreground">{c.memberCode}</span>
                {c.unitName && (
                  <span className="text-xs text-muted-foreground">• {c.unitName}</span>
                )}
              </div>
              {c.match ? (
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Match
                </Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0">
                  <AlertTriangle className="h-3 w-3 mr-1" /> Mismatch
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              {/* Legacy scope */}
              <div>
                <p className="font-medium text-muted-foreground mb-1">
                  Escopo Legado ({c.legacyIds.length} IDs)
                </p>
                <div className="space-y-0.5 max-h-32 overflow-y-auto">
                  {c.legacyIds.map((id) => (
                    <p
                      key={id}
                      className={`${
                        c.missingInNew.includes(id)
                          ? "text-red-600 dark:text-red-400 font-medium"
                          : "text-muted-foreground"
                      }`}
                    >
                      {memberNameMap[id] || id.slice(0, 8)}
                      {c.missingInNew.includes(id) && " ← ausente no novo"}
                    </p>
                  ))}
                </div>
              </div>

              {/* New scope */}
              <div>
                <p className="font-medium text-muted-foreground mb-1">
                  Escopo Novo ({c.newIds.length} IDs)
                </p>
                <div className="space-y-0.5 max-h-32 overflow-y-auto">
                  {c.newIds.map((id) => (
                    <p
                      key={id}
                      className={`${
                        c.extraInNew.includes(id)
                          ? "text-blue-600 dark:text-blue-400 font-medium"
                          : "text-muted-foreground"
                      }`}
                    >
                      {memberNameMap[id] || id.slice(0, 8)}
                      {c.extraInNew.includes(id) && " ← extra no novo"}
                    </p>
                  ))}
                </div>
              </div>
            </div>

            {/* Divergence detail */}
            {!c.match && (
              <div className="mt-3 pt-3 border-t border-border/50 text-xs space-y-1">
                {c.missingInNew.length > 0 && (
                  <p className="text-red-600 dark:text-red-400">
                    <strong>Ausentes no novo:</strong>{" "}
                    {c.missingInNew.map((id) => memberNameMap[id] || id.slice(0, 8)).join(", ")}
                  </p>
                )}
                {c.extraInNew.length > 0 && (
                  <p className="text-blue-600 dark:text-blue-400">
                    <strong>Extras no novo:</strong>{" "}
                    {c.extraInNew.map((id) => memberNameMap[id] || id.slice(0, 8)).join(", ")}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-8">
            Nenhum membro encontrado.
          </p>
        )}
      </div>
    </div>
  );
}
