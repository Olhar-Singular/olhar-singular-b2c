import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { buildAuthState } from "@/test/helpers";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "@/hooks/useAuth";

function setup({ session = null, loading = false }: { session?: unknown; loading?: boolean }) {
  vi.mocked(useAuth).mockReturnValue(
    buildAuthState({ session, loading }) as never,
  );

  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
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
      </Routes>
    </MemoryRouter>,
  );
}

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
});
