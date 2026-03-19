import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, LayoutTemplate, LayoutDashboard, Settings, Menu, X, ChevronLeft, LogOut, Package, User,
} from "lucide-react";
import FeatureRequestsPanel from "@/components/FeatureRequestsPanel";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { canAccessRoute } from "@/lib/permissions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const navItems = [
  { path: "/", key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/propostas", key: "propostas", label: "Propostas", icon: FileText },
  { path: "/cadastros", key: "cadastros", label: "Cadastros", icon: Package },
  { path: "/templates", key: "templates", label: "Templates de Escopo", icon: LayoutTemplate },
  { path: "/configuracoes", key: "configuracoes", label: "Configurações", icon: Settings },
];

interface AppLayoutProps { children: React.ReactNode; }

export default function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { role, allowedResources } = useUserRole();

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, avatar_url, phone")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data as { display_name: string; avatar_url: string | null; phone: string | null } | null;
    },
  });

  const displayName = profile?.display_name || user?.user_metadata?.display_name || user?.email || "U";
  const avatarUrl = profile?.avatar_url || "";
  const initials = displayName.substring(0, 2).toUpperCase();

  const filteredNavItems = navItems.filter((item) =>
    canAccessRoute(role, item.path, allowedResources)
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AnimatePresence>
        {mobileOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-foreground/20 md:hidden" onClick={() => setMobileOpen(false)} />
        )}
      </AnimatePresence>

      <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-card transition-all duration-200 ${collapsed ? "w-16" : "w-60"} ${mobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 md:static`}>
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          {!collapsed && <span className="text-base font-semibold text-foreground">TOTVS Leste</span>}
          <button onClick={() => setCollapsed(!collapsed)} className="hidden rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground md:block">
            <ChevronLeft className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
          </button>
          <button onClick={() => setMobileOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-accent md:hidden">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-2">
          {filteredNavItems.map((item) => {
            const isActive = item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path);
            return (
              <Link key={item.path} to={item.path} onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"} ${collapsed ? "justify-center px-2" : ""}`}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-2">
          <button onClick={signOut} className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${collapsed ? "justify-center px-2" : ""}`} title={collapsed ? "Sair" : undefined}>
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Sair</span>}
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center gap-4 border-b border-border bg-card px-4 md:px-6">
          <button onClick={() => setMobileOpen(true)} className="rounded-md p-1 text-muted-foreground hover:bg-accent md:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <FeatureRequestsPanel />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                <Avatar className="h-8 w-8 cursor-pointer">
                  <AvatarImage src={avatarUrl || undefined} />
                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials}</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/perfil")}>
                <User className="mr-2 h-4 w-4" />
                Meu Perfil
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
