import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import AuthPage from "@/pages/AuthPage";
import DashboardPage from "@/pages/DashboardPage";
import BarrierProfilesPage from "@/pages/BarrierProfilesPage";
import CreditsPage from "@/pages/CreditsPage";
import AdaptarPage from "@/pages/AdaptarPage";
import ChatPage from "@/pages/ChatPage";
import LandingPage from "@/pages/LandingPage";
import Layout from "@/components/Layout";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
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
              <Route path="/creditos" element={<CreditsPage />} />
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
          <Toaster />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
