import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/common/ProtectedRoute";
import { SuperAdminRoute } from "@/components/common/SuperAdminRoute";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import AuthPage from "@/pages/AuthPage";
import AdminPage from "@/pages/AdminPage";
import DashboardPage from "@/pages/DashboardPage";
import BarrierProfilesPage from "@/pages/BarrierProfilesPage";
import CreditsPage from "@/pages/CreditsPage";
import AdaptarPage from "@/pages/AdaptarPage";
import ChatPage from "@/pages/ChatPage";
import LandingPage from "@/pages/LandingPage";
import QuestionBankPage from "@/pages/QuestionBankPage";
import Layout from "@/components/common/Layout";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/adaptar" element={<AdaptarPage />} />
                <Route path="/perfis-barreira" element={<BarrierProfilesPage />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/banco-questoes" element={<QuestionBankPage />} />
                <Route path="/creditos" element={<CreditsPage />} />
                <Route
                  path="/admin"
                  element={
                    <SuperAdminRoute>
                      <AdminPage />
                    </SuperAdminRoute>
                  }
                />
                <Route
                  path="/creditos/sucesso"
                  element={
                    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
                      <p className="text-lg font-semibold text-foreground">Pagamento confirmado!</p>
                      <p className="text-muted-foreground text-sm">Seus créditos foram adicionados à sua conta.</p>
                    </div>
                  }
                />
              </Route>
            </Routes>
          </ErrorBoundary>
          <Toaster position="top-right" />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
