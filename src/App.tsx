import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
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
import LoginPage from "@/pages/LoginPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import GoogleOAuthCallback from "@/pages/GoogleOAuthCallback";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

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
        <Route path="/clientes" element={<ClientsList />} />
        <Route path="/templates" element={<ScopeTemplatesPage />} />
        <Route path="/produtos-categorias" element={<ProductsCategoriesPage />} />
            <Route path="/time" element={<SalesTeamPage />} />
            <Route path="/unidades" element={<UnitsPage />} />
            <Route path="/configuracoes" element={<SettingsPage />} />
            <Route path="/configuracoes/parametros" element={<ProposalDefaultsPage />} />
            <Route path="/configuracoes/google" element={<GoogleIntegrationPage />} />
            <Route path="/configuracoes/integracoes" element={<IntegrationsPage />} />
            <Route path="/configuracoes/importar" element={<ImportDataPage />} />
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
