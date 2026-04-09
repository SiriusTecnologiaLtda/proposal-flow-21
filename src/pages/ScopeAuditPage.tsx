import { useScopeComparison, DivergenceClassification } from "@/hooks/useScopeComparison";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  Info,
  Target,
  AlertCircle,
} from "lucide-react";

const roleLabels: Record<string, string> = {
  dsn: "DSN",
  gsn: "GSN",
  esn: "ESN",
  arquiteto: "EV",
};

const classificationConfig: Record<
  DivergenceClassification,
  { label: string; color: string; icon: typeof CheckCircle2; bg: string }
> = {
  match: {
    label: "Match",
    color: "text-emerald-700 dark:text-emerald-400",
    icon: CheckCircle2,
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
  },
  acceptable: {
    label: "Aceitável",
    color: "text-blue-700 dark:text-blue-400",
    icon: Info,
    bg: "bg-blue-100 dark:bg-blue-900/30",
  },
  real_issue: {
    label: "Divergência Real",
    color: "text-red-700 dark:text-red-400",
    icon: AlertCircle,
    bg: "bg-red-100 dark:bg-red-900/30",
  },
};

type FilterStatus = "all" | "match" | "acceptable" | "real_issue";

export default function ScopeAuditPage() {
  const { comparisons, summary, salesTeam, orphanedEsnIds } =
    useScopeComparison();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

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
    if (filterStatus !== "all") {
      result = result.filter((c) => c.classification === filterStatus);
    }
    return result;
  }, [comparisons, search, filterStatus]);

  const filterButtons: { key: FilterStatus; label: string }[] = [
    { key: "all", label: "Todos" },
    { key: "match", label: "✓ Match" },
    { key: "acceptable", label: "ℹ Aceitável" },
    { key: "real_issue", label: "⚠ Divergência Real" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Auditoria de Escopo Comercial
        </h1>
        <p className="text-sm text-muted-foreground">
          Comparação entre escopo legado e escopo novo com classificação de
          divergências. Fase observacional — sem impacto em produção.
        </p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Membros</p>
          <p className="text-2xl font-bold">{summary.total}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <p className="text-xs text-muted-foreground">Match Exato</p>
          </div>
          <p className="text-2xl font-bold text-emerald-600">
            {summary.matches}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-blue-500" />
            <p className="text-xs text-muted-foreground">Aceitável</p>
          </div>
          <p className="text-2xl font-bold text-blue-600">
            {summary.acceptable}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-red-500" />
            <p className="text-xs text-muted-foreground">Divergência Real</p>
          </div>
          <p className="text-2xl font-bold text-red-600">
            {summary.realIssues}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs text-muted-foreground">Match c/ Alvo</p>
          </div>
          <p className="text-2xl font-bold text-primary">
            {summary.matchesTarget}
          </p>
        </div>
      </div>

      {/* Orphaned ESNs alert */}
      {orphanedEsnIds.size > 0 && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="font-medium text-sm text-amber-700 dark:text-amber-400">
              ESNs sem vínculo hierárquico (reports_to_id = null)
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from(orphanedEsnIds).map((id) => (
              <Badge key={id} variant="outline" className="text-xs">
                {memberNameMap[id] || id.slice(0, 8)}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Esses ESNs não aparecerão no escopo de nenhum GSN/DSN no modelo
            novo. Precisam ter reports_to_id atribuído.
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 items-center flex-wrap">
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
          {filterButtons.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilterStatus(f.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filterStatus === f.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Member list */}
      <div className="space-y-3">
        {filtered.map((c) => {
          const cfg = classificationConfig[c.classification];
          const Icon = cfg.icon;

          return (
            <div
              key={c.memberId}
              className={`rounded-lg border p-4 ${
                c.classification === "match"
                  ? "bg-card"
                  : c.classification === "acceptable"
                  ? "bg-blue-50/30 dark:bg-blue-950/10 border-blue-200/50 dark:border-blue-800/50"
                  : "bg-red-50/30 dark:bg-red-950/10 border-red-200/50 dark:border-red-800/50"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-xs">
                    {roleLabels[c.memberRole] || c.memberRole}
                  </Badge>
                  <span className="font-medium text-sm">{c.memberName}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.memberCode}
                  </span>
                  {c.unitName && (
                    <span className="text-xs text-muted-foreground">
                      • {c.unitName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {c.matchesTarget && !c.match && (
                    <Badge
                      variant="outline"
                      className="text-xs border-primary/30 text-primary"
                    >
                      <Target className="h-3 w-3 mr-1" /> Alvo OK
                    </Badge>
                  )}
                  <Badge className={`${cfg.bg} ${cfg.color} border-0`}>
                    <Icon className="h-3 w-3 mr-1" /> {cfg.label}
                  </Badge>
                </div>
              </div>

              {/* Divergence reasons */}
              {c.divergenceReasons.length > 0 && (
                <div className="mb-3 space-y-1">
                  {c.divergenceReasons.map((reason, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      → {reason}
                    </p>
                  ))}
                </div>
              )}

              {/* Only show scope details for non-match */}
              {!c.match && (
                <>
                  <div className="grid grid-cols-3 gap-4 text-xs">
                    <div>
                      <p className="font-medium text-muted-foreground mb-1">
                        Legado ({c.legacyIds.length})
                      </p>
                      <div className="space-y-0.5 max-h-28 overflow-y-auto">
                        {c.legacyIds.map((id) => (
                          <p
                            key={id}
                            className={
                              c.missingInNew.includes(id)
                                ? "text-red-600 dark:text-red-400 font-medium"
                                : "text-muted-foreground"
                            }
                          >
                            {memberNameMap[id] || id.slice(0, 8)}
                          </p>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="font-medium text-muted-foreground mb-1">
                        Novo ({c.newIds.length})
                      </p>
                      <div className="space-y-0.5 max-h-28 overflow-y-auto">
                        {c.newIds.map((id) => (
                          <p
                            key={id}
                            className={
                              c.extraInNew.includes(id)
                                ? "text-blue-600 dark:text-blue-400 font-medium"
                                : "text-muted-foreground"
                            }
                          >
                            {memberNameMap[id] || id.slice(0, 8)}
                          </p>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="font-medium text-muted-foreground mb-1">
                        Alvo ({c.targetIds.length})
                      </p>
                      <div className="space-y-0.5 max-h-28 overflow-y-auto">
                        {c.targetIds.map((id) => (
                          <p key={id} className="text-muted-foreground">
                            {memberNameMap[id] || id.slice(0, 8)}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-8">
            Nenhum membro encontrado.
          </p>
        )}
      </div>
    </div>
  );
}
