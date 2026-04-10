import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { canAccessRoute } from "@/lib/permissions";
import AppLayout from "@/components/AppLayout";
import UnauthorizedScreen from "@/components/UnauthorizedScreen";
import Dashboard from "@/pages/Dashboard";
import ProposalsList from "@/pages/ProposalsList";
import ProposalCreate from "@/pages/ProposalCreate";
import ClientsList from "@/pages/ClientsList";
import ScopeTemplatesPage from "@/pages/ScopeTemplatesPage";
import ScopeTemplateEditPage from "@/pages/ScopeTemplateEditPage";
import ProductsCategoriesPage from "@/pages/ProductsCategoriesPage";
import SalesTeamPage from "@/pages/SalesTeamPage";
import SettingsPage from "@/pages/SettingsPage";
import GoogleIntegrationPage from "@/pages/GoogleIntegrationPage";
import ProposalDefaultsPage from "@/pages/ProposalDefaultsPage";
import UnitsPage from "@/pages/UnitsPage";
import ImportDataPage from "@/pages/ImportDataPage";
import IntegrationsPage from "@/pages/IntegrationsPage";
import UserManagementPage from "@/pages/UserManagementPage";
import RolePermissionsPage from "@/pages/RolePermissionsPage";
import RegisteredUsersPage from "@/pages/RegisteredUsersPage";
import ProposalTypesPage from "@/pages/ProposalTypesPage";
import CadastrosPage from "@/pages/CadastrosPage";
import SalesTargetsPage from "@/pages/SalesTargetsPage";
import SalesTargetEditPage from "@/pages/SalesTargetEditPage";
import TaeConfigPage from "@/pages/TaeConfigPage";
import WhatsAppConfigPage from "@/pages/WhatsAppConfigPage";
import ProposalLogsPage from "@/pages/ProposalLogsPage";
import ProfilePage from "@/pages/ProfilePage";
import LoginPage from "@/pages/LoginPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import GoogleOAuthCallback from "@/pages/GoogleOAuthCallback";
import LandingPage from "@/pages/LandingPage";
import ProjectsPage from "@/pages/ProjectsPage";
import ProjectCreatePage from "@/pages/ProjectCreatePage";
import UserGroupsPage from "@/pages/UserGroupsPage";
import XaiConfigPage from "@/pages/XaiConfigPage";
import SoftwareProposalsListPage from "@/pages/SoftwareProposalsListPage";
import SoftwareProposalUploadPage from "@/pages/SoftwareProposalUploadPage";
import SoftwareCatalogPage from "@/pages/SoftwareCatalogPage";
import SoftwareProposalDetailPage from "@/pages/SoftwareProposalDetailPage";
import SoftwareProposalCreatePage from "@/pages/SoftwareProposalCreatePage";
import SoftwareProposalIssuesPage from "@/pages/SoftwareProposalIssuesPage";
import SoftwareProposalPdfViewerPage from "@/pages/SoftwareProposalPdfViewerPage";
import EmailInboxConfigPage from "@/pages/EmailInboxConfigPage";
import SegmentsPage from "@/pages/SegmentsPage";
import ExtractionRulesPage from "@/pages/ExtractionRulesPage";
import NotFound from "./pages/NotFound.tsx";
import ScopeAuditPage from "@/pages/ScopeAuditPage";
import OpportunityDetailPage from "@/pages/OpportunityDetailPage";
import ExecutivePresentationPage from "@/pages/ExecutivePresentationPage";
import ExecutivePresentationSharePage from "@/pages/ExecutivePresentationSharePage";
import React from "react";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Render crash:", error, info.componentStack);

    // Auto-recover from DOM reconciliation errors (insertBefore, removeChild, etc.)
    // These are typically caused by portal/dialog/toast race conditions during navigation
    const isDomError =
      error?.message?.includes("insertBefore") ||
      error?.message?.includes("removeChild") ||
      error?.message?.includes("not a child of this node") ||
      error?.name === "NotFoundError";

    if (isDomError) {
      console.warn("[ErrorBoundary] DOM reconciliation error detected — auto-recovering...");
      // Give React a tick to settle, then clear the error state
      setTimeout(() => {
        this.setState({ hasError: false, error: null });
      }, 100);
    }
  }
  render() {
    if (this.state.hasError) {
      // For DOM errors we auto-recover above, but show fallback briefly
      const isDomError =
        this.state.error?.message?.includes("insertBefore") ||
        this.state.error?.message?.includes("removeChild") ||
        this.state.error?.name === "NotFoundError";

      if (isDomError) {
        return (
          <div className="flex h-screen items-center justify-center bg-background">
            <div className="text-muted-foreground">Recarregando...</div>
          </div>
        );
      }

      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center">
          <h2 className="text-lg font-semibold text-destructive">Ocorreu um erro inesperado</h2>
          <p className="text-sm text-muted-foreground max-w-md">{this.state.error?.message}</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = "/"; }}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            Voltar ao início
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 min — config data rarely changes
      refetchOnWindowFocus: false,
    },
  },
});

function GuardedRoute({ path, children }: { path: string; children: React.ReactNode }) {
  const { role, allowedResources } = useUserRole();
  if (!canAccessRoute(role, path, allowedResources)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function ProtectedRoutes() {
  const { user, loading, isAuthorized } = useAuth();
  const { role } = useUserRole();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Wait for authorization check
  if (isAuthorized === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Verificando acesso...</div>
      </div>
    );
  }

  if (!isAuthorized) {
    return <UnauthorizedScreen />;
  }

  // Consulta role: only access proposals list and view (read-only)
  if (role === "consulta") {
    return (
      <AppLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/propostas" replace />} />
          <Route path="/perfil" element={<ProfilePage />} />
          <Route path="/propostas" element={<ProposalsList />} />
          <Route path="/propostas/:id" element={<ProposalCreate />} />
          <Route path="*" element={<Navigate to="/propostas" replace />} />
        </Routes>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/perfil" element={<ProfilePage />} />
        <Route path="/propostas" element={<ProposalsList />} />
        <Route path="/propostas/nova" element={<ProposalCreate />} />
        <Route path="/propostas/:id" element={<ProposalCreate />} />
        <Route path="/projetos" element={<GuardedRoute path="/projetos"><ProjectsPage /></GuardedRoute>} />
        <Route path="/projetos/novo" element={<GuardedRoute path="/projetos"><ProjectCreatePage /></GuardedRoute>} />
        <Route path="/projetos/:id" element={<GuardedRoute path="/projetos"><ProjectCreatePage /></GuardedRoute>} />
        <Route path="/propostas-software" element={<GuardedRoute path="/propostas-software"><SoftwareProposalsListPage /></GuardedRoute>} />
        <Route path="/propostas-software/nova" element={<GuardedRoute path="/propostas-software"><SoftwareProposalCreatePage /></GuardedRoute>} />
        <Route path="/propostas-software/importar" element={<GuardedRoute path="/propostas-software"><SoftwareProposalUploadPage /></GuardedRoute>} />
        <Route path="/propostas-software/catalogo" element={<GuardedRoute path="/propostas-software"><SoftwareCatalogPage /></GuardedRoute>} />
        <Route path="/propostas-software/pendencias" element={<GuardedRoute path="/propostas-software"><SoftwareProposalIssuesPage /></GuardedRoute>} />
        <Route path="/propostas-software/regras" element={<GuardedRoute path="/propostas-software"><ExtractionRulesPage /></GuardedRoute>} />
        <Route path="/propostas-software/:id/pdf" element={<GuardedRoute path="/propostas-software"><SoftwareProposalPdfViewerPage /></GuardedRoute>} />
        <Route path="/propostas-software/:id" element={<GuardedRoute path="/propostas-software"><SoftwareProposalDetailPage /></GuardedRoute>} />
        <Route path="/cadastros" element={<GuardedRoute path="/cadastros"><CadastrosPage /></GuardedRoute>} />
        <Route path="/cadastros/clientes" element={<GuardedRoute path="/cadastros/clientes"><ClientsList /></GuardedRoute>} />
        <Route path="/cadastros/unidades" element={<GuardedRoute path="/cadastros/unidades"><UnitsPage /></GuardedRoute>} />
        <Route path="/cadastros/time" element={<GuardedRoute path="/cadastros/time"><SalesTeamPage /></GuardedRoute>} />
        <Route path="/cadastros/produtos" element={<GuardedRoute path="/cadastros/produtos"><ProductsCategoriesPage /></GuardedRoute>} />
        <Route path="/cadastros/categorias" element={<GuardedRoute path="/cadastros/categorias"><ProductsCategoriesPage /></GuardedRoute>} />
        <Route path="/cadastros/tipos-proposta" element={<GuardedRoute path="/cadastros/tipos-proposta"><ProposalTypesPage /></GuardedRoute>} />
        <Route path="/cadastros/metas" element={<GuardedRoute path="/cadastros/metas"><SalesTargetsPage /></GuardedRoute>} />
        <Route path="/cadastros/metas/editar" element={<GuardedRoute path="/cadastros/metas"><SalesTargetEditPage /></GuardedRoute>} />
        <Route path="/cadastros/segmentos" element={<GuardedRoute path="/cadastros/segmentos"><SegmentsPage /></GuardedRoute>} />
        <Route path="/cadastros/templates" element={<GuardedRoute path="/cadastros/templates"><ScopeTemplatesPage /></GuardedRoute>} />
        <Route path="/cadastros/templates/novo" element={<GuardedRoute path="/cadastros/templates"><ScopeTemplateEditPage /></GuardedRoute>} />
        <Route path="/cadastros/templates/:id" element={<GuardedRoute path="/cadastros/templates"><ScopeTemplateEditPage /></GuardedRoute>} />
        {/* Legacy routes redirect */}
        <Route path="/clientes" element={<Navigate to="/cadastros/clientes" replace />} />
        <Route path="/unidades" element={<Navigate to="/cadastros/unidades" replace />} />
        <Route path="/produtos-categorias" element={<Navigate to="/cadastros/produtos" replace />} />
        <Route path="/time" element={<Navigate to="/cadastros/time" replace />} />
        <Route path="/templates" element={<Navigate to="/cadastros/templates" replace />} />
        <Route path="/templates/novo" element={<Navigate to="/cadastros/templates/novo" replace />} />
        <Route path="/templates/:id" element={<Navigate to="/cadastros/templates/:id" replace />} />
        <Route path="/configuracoes" element={<GuardedRoute path="/configuracoes"><SettingsPage /></GuardedRoute>} />
        <Route path="/configuracoes/parametros" element={<GuardedRoute path="/configuracoes"><ProposalDefaultsPage /></GuardedRoute>} />
        <Route path="/configuracoes/google" element={<GuardedRoute path="/configuracoes"><GoogleIntegrationPage /></GuardedRoute>} />
        <Route path="/configuracoes/integracoes" element={<GuardedRoute path="/configuracoes"><IntegrationsPage /></GuardedRoute>} />
        <Route path="/configuracoes/importar" element={<GuardedRoute path="/configuracoes"><ImportDataPage /></GuardedRoute>} />
        <Route path="/configuracoes/tae" element={<GuardedRoute path="/configuracoes"><TaeConfigPage /></GuardedRoute>} />
        <Route path="/configuracoes/whatsapp" element={<GuardedRoute path="/configuracoes"><WhatsAppConfigPage /></GuardedRoute>} />
        <Route path="/configuracoes/xai" element={<GuardedRoute path="/configuracoes"><XaiConfigPage /></GuardedRoute>} />
        <Route path="/configuracoes/email-inbox" element={<GuardedRoute path="/configuracoes"><EmailInboxConfigPage /></GuardedRoute>} />
        <Route path="/configuracoes/logs-propostas" element={<GuardedRoute path="/configuracoes/logs-propostas"><ProposalLogsPage /></GuardedRoute>} />
        <Route path="/configuracoes/usuarios" element={<GuardedRoute path="/configuracoes"><UserManagementPage /></GuardedRoute>} />
        <Route path="/configuracoes/usuarios/permissoes" element={<GuardedRoute path="/configuracoes"><RolePermissionsPage /></GuardedRoute>} />
        <Route path="/configuracoes/usuarios/cadastrados" element={<GuardedRoute path="/configuracoes"><RegisteredUsersPage /></GuardedRoute>} />
        <Route path="/configuracoes/usuarios/grupos" element={<GuardedRoute path="/configuracoes"><UserGroupsPage /></GuardedRoute>} />
        <Route path="/configuracoes/tipos-proposta" element={<Navigate to="/cadastros/tipos-proposta" replace />} />
        <Route path="/admin/scope-audit" element={<GuardedRoute path="/configuracoes"><ScopeAuditPage /></GuardedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <ErrorBoundary>
          <Toaster />
          <Sonner />
          <AuthProvider>
            <Routes>
              <Route path="/landing" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/oauth/google/callback" element={<GoogleOAuthCallback />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/*" element={<ProtectedRoutes />} />
            </Routes>
          </AuthProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
