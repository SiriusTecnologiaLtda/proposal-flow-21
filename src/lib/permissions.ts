/**
 * Role-based permissions configuration.
 * Permissions are stored in DB (role_permissions table) and can be edited by admins.
 * Admin role always has access to everything regardless of DB entries.
 */

export type AppRole = "admin" | "vendedor" | "arquiteto" | "gsn" | "consulta";

export const RESOURCE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  propostas: "Oportunidades",
  "cadastros/clientes": "Cadastros → Clientes",
  "cadastros/unidades": "Cadastros → Unidades",
  "cadastros/time": "Cadastros → Time de Vendas",
  "cadastros/produtos": "Cadastros → Produtos",
  "cadastros/categorias": "Cadastros → Categorias",
  "cadastros/tipos-proposta": "Cadastros → Tipos de Oportunidade",
  "cadastros/metas": "Cadastros → Metas de Vendas",
  "cadastros/segmentos": "Cadastros → Segmentos",
  "cadastros/templates": "Cadastros → Templates de Escopo",
  projetos: "Projetos de Implantação",
  configuracoes: "Configurações",
  "configuracoes/logs-propostas": "Configurações → Logs de Oportunidades",
  "propostas-software": "Importação de Propostas de Software",
};

export const ALL_RESOURCES = Object.keys(RESOURCE_LABELS);

export function canAccessRoute(
  role: AppRole | null,
  pathname: string,
  allowedResources: string[]
): boolean {
  if (role === "admin") return true;
  if (pathname === "/" || pathname === "") return allowedResources.includes("dashboard");

  const segments = pathname.split("/").filter(Boolean);
  const firstSegment = segments[0];

  // For cadastros sub-routes, check the specific sub-resource
  if (firstSegment === "cadastros" && segments.length >= 2) {
    const subResource = `cadastros/${segments[1]}`;
    return allowedResources.includes(subResource);
  }

  // For the cadastros hub itself, allow if user has access to ANY cadastro sub-resource
  if (firstSegment === "cadastros") {
    return allowedResources.some((r) => r.startsWith("cadastros/"));
  }

  return allowedResources.includes(firstSegment);
}

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador",
  vendedor: "Vendedor (ESN)",
  gsn: "GSN",
  arquiteto: "Eng. Valor",
  consulta: "Consulta Oportunidades",
};
