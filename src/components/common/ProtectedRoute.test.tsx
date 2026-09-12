import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { buildAuthState } from "@/test/helpers";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "@/hooks/useAuth";

function setup({
  session = null,
  loading = false,
  profile = null,
  profileLoading = false,
  route = "/dashboard",
}: { session?: unknown; loading?: boolean; profile?: unknown; profileLoading?: boolean; route?: string }) {
  vi.mocked(useAuth).mockReturnValue(
    buildAuthState({ session, loading, profile, profileLoading }) as never,
  );

  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/auth" element={<div>página de login</div>} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <div data-testid="protected-content">conteúdo protegido</div>
            </ProtectedRoute>
          }
        />
        <Route
          path="/definir-senha"
          element={
            <ProtectedRoute>
              <div data-testid="set-password">defina sua senha</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const SESSION = { user: { id: "123" }, access_token: "tok" };

describe("ProtectedRoute", () => {
  it("renders children when session is valid", () => {
    setup({ session: { user: { id: "123" }, access_token: "tok" } });
    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    expect(screen.queryByText("página de login")).not.toBeInTheDocument();
  });

  it("redirects to /auth when no session", () => {
    setup({ session: null });
    expect(screen.getByText("página de login")).toBeInTheDocument();
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
  });

  it("renders nothing during loading and does not redirect", () => {
    const { container } = setup({ session: null, loading: true });
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    expect(screen.queryByText("página de login")).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it("does not redirect during loading even if a session exists", () => {
    setup({ session: { user: { id: "1" } }, loading: true });
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    expect(screen.queryByText("página de login")).not.toBeInTheDocument();
  });

  describe("first-access password", () => {
    it("waits for the profile before deciding", () => {
      const { container } = setup({ session: SESSION, profile: null, profileLoading: true });
      expect(container.firstChild).toBeNull();
    });

    it("renders the route when the profile has no pending password", () => {
      setup({ session: SESSION, profile: { must_set_password: false } });
      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });

    it("sends every protected route to /definir-senha while the flag is on", () => {
      setup({ session: SESSION, profile: { must_set_password: true } });
      expect(screen.getByTestId("set-password")).toBeInTheDocument();
      expect(screen.queryByTestId("protected-content")).toBeNull();
    });

    it("lets /definir-senha render while the flag is on", () => {
      setup({ session: SESSION, profile: { must_set_password: true }, route: "/definir-senha" });
      expect(screen.getByTestId("set-password")).toBeInTheDocument();
    });

    it("bounces /definir-senha to the dashboard once the password is set", () => {
      setup({ session: SESSION, profile: { must_set_password: false }, route: "/definir-senha" });
      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });

    it("renders when the profile is missing and not loading (legacy sessions)", () => {
      setup({ session: SESSION, profile: null, profileLoading: false });
      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });
  });
});
