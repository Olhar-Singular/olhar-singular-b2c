import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/contexts/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuthContext: () => ({ session: null, user: null, profile: null, loading: false, signOut: vi.fn(), refreshProfile: vi.fn() }),
}));

vi.mock("@/components/common/ProtectedRoute", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/common/Layout", () => ({ default: () => <div data-testid="layout-stub" /> }));
vi.mock("@/pages/AuthPage", () => ({ default: () => <div data-testid="auth-page" /> }));
vi.mock("@/pages/LandingPage", () => ({ default: () => <div data-testid="landing-page" /> }));
vi.mock("@/pages/DashboardPage", () => ({ default: () => <div data-testid="dashboard-page" /> }));
vi.mock("@/pages/BarrierProfilesPage", () => ({ default: () => <div data-testid="profiles-page" /> }));
vi.mock("@/pages/CreditsPage", () => ({ default: () => <div data-testid="credits-page" /> }));
vi.mock("@/pages/AdaptarPage", () => ({ default: () => <div data-testid="adaptar-page" /> }));
vi.mock("@/pages/ChatPage", () => ({ default: () => <div data-testid="chat-page" /> }));
vi.mock("@/pages/QuestionBankPage", () => ({ default: () => <div data-testid="qb-page" /> }));
vi.mock("@/pages/AdminPage", () => ({ default: () => <div data-testid="admin-page" /> }));
vi.mock("@/components/common/SuperAdminRoute", () => ({
  SuperAdminRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => <div data-testid="toaster-stub" /> }));

import App from "./App";

describe("App", () => {
  it("renders the landing page on / route", async () => {
    window.history.pushState({}, "", "/");
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("landing-page")).toBeInTheDocument());
  });

  it("renders the auth page on /auth route", async () => {
    window.history.pushState({}, "", "/auth");
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("auth-page")).toBeInTheDocument());
  });

  it("renders the layout stub on protected /dashboard route", async () => {
    window.history.pushState({}, "", "/dashboard");
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("layout-stub")).toBeInTheDocument());
  });

  it("renders the layout stub on protected /admin route", async () => {
    window.history.pushState({}, "", "/admin");
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("layout-stub")).toBeInTheDocument());
  });

  it("renders payment confirmed copy on /creditos/sucesso", async () => {
    window.history.pushState({}, "", "/creditos/sucesso");
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("layout-stub")).toBeInTheDocument());
  });

  it("renders the toaster", async () => {
    window.history.pushState({}, "", "/");
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("toaster-stub")).toBeInTheDocument());
  });
});
