import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bot, Sparkles, Crown, Zap, DollarSign, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import xaiAvatar from "@/assets/xai-avatar.png";

interface ModelOption {
  id: string;
  name: string;
  description: string;
  tier: "free" | "paid";
  speed: "fast" | "medium" | "slow";
  quality: "standard" | "high" | "premium";
}

const MODELS: ModelOption[] = [
  {
    id: "google/gemini-2.5-flash-lite",
    name: "Gemini Flash Lite",
    description: "Mais rápido e econômico. Bom para perguntas simples e classificações.",
    tier: "free",
    speed: "fast",
    quality: "standard",
  },
  {
    id: "google/gemini-2.5-flash",
    name: "Gemini Flash",
    description: "Equilíbrio entre custo e qualidade. Ótimo para a maioria das interações.",
    tier: "free",
    speed: "fast",
    quality: "high",
  },
  {
    id: "google/gemini-3-flash-preview",
    name: "Gemini 3 Flash (Preview)",
    description: "Nova geração. Velocidade com capacidades avançadas.",
    tier: "paid",
    speed: "fast",
    quality: "high",
  },
  {
    id: "google/gemini-2.5-pro",
    name: "Gemini Pro",
    description: "Máxima qualidade. Raciocínio complexo e contexto extenso.",
    tier: "paid",
    speed: "slow",
    quality: "premium",
  },
  {
    id: "openai/gpt-5-nano",
    name: "GPT-5 Nano",
    description: "Rápido e eficiente. Ideal para alto volume de consultas simples.",
    tier: "paid",
    speed: "fast",
    quality: "standard",
  },
  {
    id: "openai/gpt-5-mini",
    name: "GPT-5 Mini",
    description: "Forte raciocínio com custo moderado. Bom para consultas detalhadas.",
    tier: "paid",
    speed: "medium",
    quality: "high",
  },
  {
    id: "openai/gpt-5",
    name: "GPT-5",
    description: "Máxima precisão e nuance. Para questões complexas e críticas.",
    tier: "paid",
    speed: "slow",
    quality: "premium",
  },
];

const speedLabel = { fast: "Rápido", medium: "Moderado", slow: "Lento" };
const speedColor = { fast: "text-emerald-600", medium: "text-amber-600", slow: "text-orange-600" };
const qualityStars = { standard: 1, high: 2, premium: 3 };

export default function XaiConfigPage() {
  const navigate = useNavigate();
  const [selectedModel, setSelectedModel] = useState("google/gemini-2.5-flash");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("xai_config" as any)
        .select("ai_model")
        .limit(1)
        .maybeSingle();
      if (data) setSelectedModel((data as any).ai_model);
      setLoading(false);
    })();
  }, []);

  const save = async (modelId: string) => {
    setSaving(true);
    setSelectedModel(modelId);
    try {
      const { data: existing } = await supabase
        .from("xai_config" as any)
        .select("id")
        .limit(1)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("xai_config" as any)
          .update({ ai_model: modelId, updated_at: new Date().toISOString() } as any)
          .eq("id", (existing as any).id);
      } else {
        await supabase
          .from("xai_config" as any)
          .insert({ ai_model: modelId } as any);
      }
      toast.success("Modelo da xAI atualizado com sucesso!");
    } catch {
      toast.error("Erro ao salvar configuração");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/configuracoes")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3">
          <img src={xaiAvatar} alt="xAI" className="h-10 w-10 rounded-full border-2 border-primary/20" />
          <div>
            <h1 className="text-2xl font-semibold text-foreground">xAI — Assistente Digital</h1>
            <p className="text-sm text-muted-foreground">Configure o modelo de inteligência artificial utilizado pela assistente</p>
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div className="text-sm space-y-1">
            <p className="font-medium text-foreground">Como funciona o custo dos modelos?</p>
            <p className="text-muted-foreground">
              Modelos marcados como <Badge variant="outline" className="mx-1 text-[10px] border-emerald-500 text-emerald-600 bg-emerald-50">Incluído</Badge>
              estão incluídos no plano Lovable e não geram custo adicional por uso.
              Modelos <Badge variant="outline" className="mx-1 text-[10px] border-amber-500 text-amber-600 bg-amber-50">Premium</Badge>
              consomem créditos de IA do workspace e oferecem qualidade superior.
            </p>
          </div>
        </div>
      </div>

      {/* Model selection */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {MODELS.map((model) => {
          const isSelected = selectedModel === model.id;
          return (
            <Card
              key={model.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                isSelected ? "ring-2 ring-primary border-primary" : "hover:border-primary/30"
              }`}
              onClick={() => !saving && save(model.id)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-sm font-semibold">{model.name}</CardTitle>
                  <div className="flex items-center gap-1.5">
                    {model.tier === "free" ? (
                      <Badge variant="outline" className="text-[10px] border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30">
                        <Check className="h-3 w-3 mr-0.5" /> Incluído
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/30">
                        <Crown className="h-3 w-3 mr-0.5" /> Premium
                      </Badge>
                    )}
                    {isSelected && (
                      <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">{model.description}</p>
                <div className="flex items-center gap-4 text-[11px]">
                  <span className={`flex items-center gap-1 ${speedColor[model.speed]}`}>
                    <Zap className="h-3 w-3" /> {speedLabel[model.speed]}
                  </span>
                  <span className="flex items-center gap-0.5 text-amber-500">
                    {Array.from({ length: qualityStars[model.quality] }).map((_, i) => (
                      <Sparkles key={i} className="h-3 w-3" />
                    ))}
                    <span className="ml-0.5 text-muted-foreground">Qualidade</span>
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground/60 font-mono truncate">{model.id}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
