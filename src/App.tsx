import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { canAccessRoute } from "@/lib/permissions";
import AppLayout from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import ProposalsList from "@/pages/ProposalsList";
import ProposalCreate from "@/pages/ProposalCreate";
import ClientsList from "@/pages/ClientsList";
import ScopeTemplatesPage from "@/pages/ScopeTemplatesPage";
import ProductsCategoriesPage from "@/pages/ProductsCategoriesPage";
import SalesTeamPage from "@/pages/SalesTeamPage";
import SettingsPage from "@/pages/SettingsPage";
import GoogleIntegrationPage from "@/pages/GoogleIntegrationPage";
import ProposalDefaultsPage from "@/pages/ProposalDefaultsPage";
import UnitsPage from "@/pages/UnitsPage";
import ImportDataPage from "@/pages/ImportDataPage";
import IntegrationsPage from "@/pages/IntegrationsPage";
import UserManagementPage from "@/pages/UserManagementPage";
import ProposalTypesPage from "@/pages/ProposalTypesPage";
import CadastrosPage from "@/pages/CadastrosPage";
import LoginPage from "@/pages/LoginPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import GoogleOAuthCallback from "@/pages/GoogleOAuthCallback";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

function GuardedRoute({ path, children }: { path: string; children: React.ReactNode }) {
  const { role, allowedResources } = useUserRole();
  if (!canAccessRoute(role, path, allowedResources)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function ProtectedRoutes() {
  const { user, loading } = useAuth();

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

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/propostas" element={<ProposalsList />} />
        <Route path="/propostas/nova" element={<ProposalCreate />} />
        <Route path="/propostas/:id" element={<ProposalCreate />} />
        <Route path="/cadastros" element={<GuardedRoute path="/cadastros"><CadastrosPage /></GuardedRoute>} />
        <Route path="/cadastros/clientes" element={<GuardedRoute path="/cadastros/clientes"><ClientsList /></GuardedRoute>} />
        <Route path="/cadastros/unidades" element={<GuardedRoute path="/cadastros/unidades"><UnitsPage /></GuardedRoute>} />
        <Route path="/cadastros/time" element={<GuardedRoute path="/cadastros/time"><SalesTeamPage /></GuardedRoute>} />
        <Route path="/cadastros/produtos" element={<GuardedRoute path="/cadastros/produtos"><ProductsCategoriesPage /></GuardedRoute>} />
        <Route path="/cadastros/categorias" element={<GuardedRoute path="/cadastros/categorias"><ProductsCategoriesPage /></GuardedRoute>} />
        <Route path="/cadastros/tipos-proposta" element={<GuardedRoute path="/cadastros/tipos-proposta"><ProposalTypesPage /></GuardedRoute>} />
        {/* Legacy routes redirect */}
        <Route path="/clientes" element={<Navigate to="/cadastros/clientes" replace />} />
        <Route path="/unidades" element={<Navigate to="/cadastros/unidades" replace />} />
        <Route path="/produtos-categorias" element={<Navigate to="/cadastros/produtos" replace />} />
        <Route path="/time" element={<Navigate to="/cadastros/time" replace />} />
        <Route path="/templates" element={<GuardedRoute path="/templates"><ScopeTemplatesPage /></GuardedRoute>} />
        <Route path="/configuracoes" element={<GuardedRoute path="/configuracoes"><SettingsPage /></GuardedRoute>} />
        <Route path="/configuracoes/parametros" element={<GuardedRoute path="/configuracoes"><ProposalDefaultsPage /></GuardedRoute>} />
        <Route path="/configuracoes/google" element={<GuardedRoute path="/configuracoes"><GoogleIntegrationPage /></GuardedRoute>} />
        <Route path="/configuracoes/integracoes" element={<GuardedRoute path="/configuracoes"><IntegrationsPage /></GuardedRoute>} />
        <Route path="/configuracoes/importar" element={<GuardedRoute path="/configuracoes"><ImportDataPage /></GuardedRoute>} />
        <Route path="/configuracoes/usuarios" element={<GuardedRoute path="/configuracoes"><UserManagementPage /></GuardedRoute>} />
        <Route path="/configuracoes/tipos-proposta" element={<Navigate to="/cadastros/tipos-proposta" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/oauth/google/callback" element={<GoogleOAuthCallback />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
