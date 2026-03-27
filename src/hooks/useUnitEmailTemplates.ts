import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const EMAIL_ACTION_TYPES = [
  { value: "solicitar_ev", label: "Solicitar Análise E.V.", description: "Enviada ao Engenheiro de Valor para revisão de escopo" },
  { value: "concluir_revisao", label: "Concluir Revisão", description: "Enviada ao ESN quando o E.V. conclui a análise do projeto" },
  { value: "enviar_operacoes", label: "Enviar para Operações", description: "Enviada à equipe de operações quando proposta é ganha" },
] as const;

export type EmailActionType = typeof EMAIL_ACTION_TYPES[number]["value"];

export const EMAIL_PLACEHOLDERS = [
  { tag: "{{NUMERO_OPORTUNIDADE}}", label: "Número da Oportunidade", example: "501318" },
  { tag: "{{CLIENTE}}", label: "Nome do Cliente", example: "MARBRASA S.A." },
  { tag: "{{UNIDADE}}", label: "Unidade TOTVS", example: "TSE102 - TOTVS COM" },
  { tag: "{{ESN}}", label: "ESN (Vendedor)", example: "João Silva" },
  { tag: "{{EV}}", label: "Engenheiro de Valor", example: "Maria Souza" },
  { tag: "{{GSN}}", label: "GSN (Gerente)", example: "Carlos Lima" },
  { tag: "{{PRODUTO}}", label: "Produto", example: "Protheus" },
  { tag: "{{RESUMO_OPORTUNIDADE}}", label: "Resumo da Oportunidade", description: "Tabela com dados, escopo e financeiro" },
] as const;

export function useUnitEmailTemplates(unitId: string | null) {
  return useQuery({
    queryKey: ["unit_email_templates", unitId],
    enabled: !!unitId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unit_email_templates" as any)
        .select("*")
        .eq("unit_id", unitId!);
      if (error) throw error;
      return (data || []) as unknown as Array<{ id: string; unit_id: string; action_type: string; subject: string; body: string }>;
    },
  });
}

export async function fetchUnitEmailTemplate(unitId: string, actionType: string) {
  const { data, error } = await supabase
    .from("unit_email_templates" as any)
    .select("subject, body")
    .eq("unit_id", unitId)
    .eq("action_type", actionType)
    .maybeSingle();
  if (error) return null;
  return data as { subject: string; body: string } | null;
}

export function replacePlaceholders(
  text: string,
  values: {
    numero?: string;
    cliente?: string;
    unidade?: string;
    esn?: string;
    ev?: string;
    gsn?: string;
    produto?: string;
    resumo?: string;
  }
): string {
  return text
    .replace(/\{\{NUMERO_OPORTUNIDADE\}\}/g, values.numero || "")
    .replace(/\{\{CLIENTE\}\}/g, values.cliente || "")
    .replace(/\{\{UNIDADE\}\}/g, values.unidade || "")
    .replace(/\{\{ESN\}\}/g, values.esn || "")
    .replace(/\{\{EV\}\}/g, values.ev || "")
    .replace(/\{\{GSN\}\}/g, values.gsn || "")
    .replace(/\{\{PRODUTO\}\}/g, values.produto || "")
    .replace(/\{\{RESUMO_OPORTUNIDADE\}\}/g, values.resumo || "");
}
