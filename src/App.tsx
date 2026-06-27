import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider, Outlet } from "react-router-dom";
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
import MyAdaptationsPage from "@/pages/MyAdaptationsPage";
import EditAdaptationPage from "@/pages/EditAdaptationPage";
import ChatPage from "@/pages/ChatPage";
import LandingPage from "@/pages/LandingPage";
import QuestionBankPage from "@/pages/QuestionBankPage";
import AdaptacoesPage from "@/pages/AdaptacoesPage";
import Layout from "@/components/common/Layout";

const queryClient = new QueryClient();

// Root layout: provides global context to every route via <Outlet />.
function AppRoot() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
        <Toaster position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function buildRouter() {
  return createBrowserRouter([
    {
      element: <AppRoot />,
      children: [
        { path: "/", element: <LandingPage /> },
        { path: "/auth", element: <AuthPage /> },
        {
          element: (
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          ),
          children: [
            { path: "/dashboard", element: <DashboardPage /> },
            { path: "/adaptar", element: <AdaptarPage /> },
            { path: "/adaptar/editar/:id", element: <EditAdaptationPage /> },
            { path: "/historico", element: <MyAdaptationsPage /> },
            { path: "/perfis-barreira", element: <BarrierProfilesPage /> },
            { path: "/chat", element: <ChatPage /> },
            { path: "/adaptacoes", element: <AdaptacoesPage /> },
            { path: "/banco-questoes", element: <QuestionBankPage /> },
            { path: "/creditos", element: <CreditsPage /> },
            {
              path: "/admin",
              element: (
                <SuperAdminRoute>
                  <AdminPage />
                </SuperAdminRoute>
              ),
            },
            {
              path: "/creditos/sucesso",
              element: (
                <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
                  <p className="text-lg font-semibold text-foreground">Pagamento confirmado!</p>
                  <p className="text-muted-foreground text-sm">Seus créditos foram adicionados à sua conta.</p>
                </div>
              ),
            },
          ],
        },
      ],
    },
  ]);
}

export default function App() {
  // Router created once per mount so tests that push URL before render get a fresh instance.
  const [router] = useState(buildRouter);
  return <RouterProvider router={router} />;
}
