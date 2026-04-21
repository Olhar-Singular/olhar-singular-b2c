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

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<div className="flex min-h-screen items-center justify-center"><h1 className="text-4xl font-semibold">Olhar Singular</h1></div>} />
            <Route path="/auth" element={<AuthPage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/creditos"
              element={
                <ProtectedRoute>
                  <CreditsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/creditos/sucesso"
              element={
                <ProtectedRoute>
                  <div className="flex min-h-screen items-center justify-center">
                    <p className="text-lg font-medium">Pagamento confirmado! Seus créditos foram adicionados.</p>
                  </div>
                </ProtectedRoute>
              }
            />
            <Route
              path="/adaptar"
              element={
                <ProtectedRoute>
                  <AdaptarPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/chat"
              element={
                <ProtectedRoute>
                  <ChatPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/perfis-barreira"
              element={
                <ProtectedRoute>
                  <BarrierProfilesPage />
                </ProtectedRoute>
              }
            />
          </Routes>
          <Toaster />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
