/**
 * Role-based permissions configuration.
 * Each role maps to a set of allowed route prefixes.
 * "admin" has access to everything.
 */

export type AppRole = "admin" | "vendedor" | "arquiteto" | "gsn";

export interface PermissionDef {
  label: string;
  routes: string[];
}

// Route groups that can be restricted
export const RESOURCE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  propostas: "Propostas",
  clientes: "Clientes",
  unidades: "Unidades",
  templates: "Templates de Escopo",
  "produtos-categorias": "Produtos & Categorias",
  time: "Time de Vendas",
  configuracoes: "Configurações",
};

// Which routes each role can access (admin always has all)
const ROLE_PERMISSIONS: Record<AppRole, string[]> = {
  admin: Object.keys(RESOURCE_LABELS),
  vendedor: ["dashboard", "propostas", "clientes"],
  gsn: ["dashboard", "propostas", "clientes", "time"],
  arquiteto: ["dashboard", "propostas", "clientes"],
};

export function getAllowedResources(role: AppRole | null): string[] {
  if (!role) return ["dashboard", "propostas"];
  return ROLE_PERMISSIONS[role] || ["dashboard", "propostas"];
}

export function canAccessRoute(role: AppRole | null, pathname: string): boolean {
  if (role === "admin") return true;
  const allowed = getAllowedResources(role);
  // Root path = dashboard
  if (pathname === "/" || pathname === "") return allowed.includes("dashboard");
  const segment = pathname.split("/").filter(Boolean)[0];
  return allowed.includes(segment);
}

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador",
  vendedor: "Vendedor (ESN)",
  gsn: "GSN",
  arquiteto: "Arquiteto",
};
