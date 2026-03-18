/**
 * Role-based permissions configuration.
 * Permissions are stored in DB (role_permissions table) and can be edited by admins.
 * Admin role always has access to everything regardless of DB entries.
 */

export type AppRole = "admin" | "vendedor" | "arquiteto" | "gsn";

export const RESOURCE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  propostas: "Propostas",
  "cadastros/clientes": "Cadastros → Clientes",
  "cadastros/unidades": "Cadastros → Unidades",
  "cadastros/time": "Cadastros → Time de Vendas",
  "cadastros/produtos": "Cadastros → Produtos",
  "cadastros/categorias": "Cadastros → Categorias",
  "cadastros/tipos-proposta": "Cadastros → Tipos de Proposta",
  templates: "Templates de Escopo",
  configuracoes: "Configurações",
};

export const ALL_RESOURCES = Object.keys(RESOURCE_LABELS);

export function canAccessRoute(
  role: AppRole | null,
  pathname: string,
  allowedResources: string[]
): boolean {
  if (role === "admin") return true;
  if (pathname === "/" || pathname === "") return allowedResources.includes("dashboard");
  const segment = pathname.split("/").filter(Boolean)[0];
  return allowedResources.includes(segment);
}

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador",
  vendedor: "Vendedor (ESN)",
  gsn: "GSN",
  arquiteto: "Arquiteto",
};
