import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronRight, FileText, Paperclip,
} from "lucide-react";
import { toast } from "sonner";
import {
  type OpportunityType,
  pricingDisplayModeOptions,
  executivePresentationStore,
} from "@/data/executivePresentationData";
import OpportunityTypeDrawer from "@/components/executive-presentation/OpportunityTypeDrawer";

export default function OpportunityTypesAdminPage() {
  const [types, setTypes] = useState(executivePresentationStore.getTypes());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingType, setEditingType] = useState<OpportunityType | null>(null);

  // Subscribe to store changes
  useEffect(() => {
    return executivePresentationStore.subscribe(() => {
      setTypes([...executivePresentationStore.getTypes()]);
    });
  }, []);

  const handleNew = () => {
    setEditingType(null);
    setDrawerOpen(true);
  };

  const handleEdit = (t: OpportunityType) => {
    setEditingType(t);
    setDrawerOpen(true);
  };

  const handleDelete = (id: string) => {
    executivePresentationStore.deleteType(id);
    toast.success("Tipo de oportunidade removido");
  };

  const handleSave = (t: OpportunityType) => {
    executivePresentationStore.upsertType(t);
    setDrawerOpen(false);
    toast.success(editingType ? "Tipo atualizado" : "Tipo criado");
  };

  const pricingLabel = (mode: string) =>
    pricingDisplayModeOptions.find((p) => p.value === mode)?.label ?? mode;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl bg-gradient-to-r from-[hsl(var(--hero-from))] via-[hsl(var(--hero-via))] to-[hsl(var(--hero-to))] px-6 py-5 text-primary-foreground">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Tipos de Oportunidade — Apresentação Executiva</h1>
            <p className="text-sm text-primary-foreground/70">
              Gerencie o conteúdo-base usado para gerar apresentações por tipo de oportunidade
            </p>
          </div>
          <Button onClick={handleNew} className="gap-2 bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground border-0">
            <Plus className="h-4 w-4" /> Novo Tipo
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {types.map((t) => {
          const expanded = expandedId === t.id;
          return (
            <div key={t.id} className="rounded-xl border bg-card shadow-sm transition-all">
              {/* Summary row */}
              <div className="flex items-center gap-4 p-5">
                <button
                  onClick={() => setExpandedId(expanded ? null : t.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground hover:bg-muted/80"
                >
                  {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-foreground truncate">{t.name}</h3>
                    <Badge variant="secondary" className="text-xs shrink-0">{t.slug}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-1">{t.executiveSummary}</p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
                    <Paperclip className="h-3.5 w-3.5" />
                    <span>{t.references.length} ref.</span>
                  </div>
                  <Badge variant="outline" className="text-xs hidden lg:inline-flex">
                    {pricingLabel(t.pricingDisplayMode)}
                  </Badge>
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(t)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(t.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>

              {/* Expanded detail */}
              {expanded && (
                <div className="border-t px-5 pb-5 pt-4 space-y-5">
                  {/* Positioning */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <DetailBlock label="Posicionamento" value={t.positioningText} />
                    <DetailBlock label="Problema-padrão" value={t.problemStatement} />
                    <DetailBlock label="Abordagem da solução" value={t.solutionApproach} />
                    <DetailBlock label="CTA padrão" value={t.defaultCta} />
                  </div>

                  {/* Scope blocks */}
                  <div>
                    <h4 className="text-sm font-semibold text-foreground mb-2">Escopo padrão ({t.defaultScopeBlocks.length} blocos)</h4>
                    <div className="grid gap-2 md:grid-cols-2">
                      {t.defaultScopeBlocks.map((sb) => (
                        <div key={sb.id} className="rounded-lg border bg-muted/30 p-3">
                          <p className="text-sm font-medium text-foreground">{sb.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{sb.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* References */}
                  <div>
                    <h4 className="text-sm font-semibold text-foreground mb-2">Referências anexadas</h4>
                    {t.references.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Nenhuma referência anexada</p>
                    ) : (
                      <div className="space-y-1.5">
                        {t.references.map((r) => (
                          <div key={r.id} className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{r.fileName}</p>
                              <p className="text-xs text-muted-foreground">{r.description}</p>
                            </div>
                            <Badge variant="outline" className="text-xs uppercase shrink-0">{r.fileType}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <OpportunityTypeDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        type={editingType}
        onSave={handleSave}
      />
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/30 p-3">
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}
