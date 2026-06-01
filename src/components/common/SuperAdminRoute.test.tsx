import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SuperAdminRoute } from "./SuperAdminRoute";
import { buildAuthState } from "@/test/helpers";

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
import { useAuth } from "@/hooks/useAuth";

function setup(state: { profile?: Record<string, unknown> | null; loading?: boolean }) {
  vi.mocked(useAuth).mockReturnValue(buildAuthState(state) as never);
  return render(
    <MemoryRouter initialEntries={["/admin"]}>
      <Routes>
        <Route path="/dashboard" element={<div>dashboard</div>} />
        <Route
          path="/admin"
          element={
            <SuperAdminRoute>
              <div data-testid="admin-content">painel admin</div>
            </SuperAdminRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SuperAdminRoute", () => {
  it("renders children for a super-admin", () => {
    setup({ profile: { is_super_admin: true } });
    expect(screen.getByTestId("admin-content")).toBeInTheDocument();
    expect(screen.queryByText("dashboard")).not.toBeInTheDocument();
  });

  it("redirects to /dashboard when the profile is not a super-admin", () => {
    setup({ profile: { is_super_admin: false } });
    expect(screen.getByText("dashboard")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-content")).not.toBeInTheDocument();
  });

  it("redirects to /dashboard when there is no profile", () => {
    setup({ profile: null });
    expect(screen.getByText("dashboard")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-content")).not.toBeInTheDocument();
  });

  it("renders nothing while auth is loading", () => {
    const { container } = setup({ profile: null, loading: true });
    expect(screen.queryByTestId("admin-content")).not.toBeInTheDocument();
    expect(screen.queryByText("dashboard")).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });
});
