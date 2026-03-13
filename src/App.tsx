import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import ProposalsList from "@/pages/ProposalsList";
import ProposalCreate from "@/pages/ProposalCreate";
import ClientsList from "@/pages/ClientsList";
import ScopeTemplatesPage from "@/pages/ScopeTemplatesPage";
import SalesTeamPage from "@/pages/SalesTeamPage";
import SettingsPage from "@/pages/SettingsPage";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/propostas" element={<ProposalsList />} />
            <Route path="/propostas/nova" element={<ProposalCreate />} />
            <Route path="/propostas/:id" element={<ProposalCreate />} />
            <Route path="/clientes" element={<ClientsList />} />
            <Route path="/templates" element={<ScopeTemplatesPage />} />
            <Route path="/time" element={<SalesTeamPage />} />
            <Route path="/configuracoes" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
