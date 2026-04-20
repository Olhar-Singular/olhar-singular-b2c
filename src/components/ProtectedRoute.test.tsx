import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "@/hooks/useAuth";

function setup(session: unknown, loading = false) {
  vi.mocked(useAuth).mockReturnValue({
    session: session as never,
    user: null,
    profile: null,
    loading,
    signOut: vi.fn(),
  });

  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route path="/auth" element={<div>página de login</div>} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <div>conteúdo protegido</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("ProtectedRoute", () => {
  it("renders children when authenticated", () => {
    setup({ user: { id: "123" } });
    expect(screen.getByText("conteúdo protegido")).toBeInTheDocument();
  });

  it("redirects to /auth when no session", () => {
    setup(null);
    expect(screen.getByText("página de login")).toBeInTheDocument();
  });

  it("renders nothing while loading", () => {
    setup(null, true);
    expect(screen.queryByText("conteúdo protegido")).not.toBeInTheDocument();
    expect(screen.queryByText("página de login")).not.toBeInTheDocument();
  });
});
