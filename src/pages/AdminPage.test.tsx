import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AdminPage from "./AdminPage";

vi.mock("@/components/admin/StatCards", () => ({
  StatCards: ({ metrics }: { metrics: { total_usd: number } }) => (
    <div data-testid="statcards">{metrics.total_usd}</div>
  ),
}));
vi.mock("@/components/admin/CostChart", () => ({ CostChart: () => <div data-testid="costchart" /> }));
vi.mock("@/components/admin/UsersTable", () => ({
  UsersTable: ({
    users,
    onToggleStatus,
    isUpdating,
  }: {
    users: unknown[];
    onToggleStatus: (i: unknown) => void;
    isUpdating: boolean;
  }) => (
    <div data-testid="userstable" data-count={users.length} data-updating={String(isUpdating)}>
      <button onClick={() => onToggleStatus({ userId: "u1", action: "ban" })}>toggle</button>
    </div>
  ),
}));

vi.mock("@/hooks/useAdminDashboard", () => ({
  useAdminDashboard: vi.fn(),
  useSetUserStatus: vi.fn(),
}));

import { useAdminDashboard, useSetUserStatus } from "@/hooks/useAdminDashboard";

const dashboard = {
  metrics: { total_usd: 7, today_usd: 1, month_usd: 3, daily: [], monthly: [] },
  users: [{ id: "u1" }, { id: "u2" }],
};

function mockDashboard(over: Record<string, unknown>) {
  vi.mocked(useAdminDashboard).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    ...over,
  } as never);
}

let mutate: ReturnType<typeof vi.fn>;
beforeEach(() => {
  mutate = vi.fn();
  vi.mocked(useSetUserStatus).mockReturnValue({ mutate, isPending: false } as never);
});

describe("AdminPage", () => {
  it("shows a skeleton while loading", () => {
    mockDashboard({ isLoading: true });
    render(<AdminPage />);
    expect(screen.getByTestId("admin-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("statcards")).not.toBeInTheDocument();
  });

  it("shows the error message when the query fails", () => {
    mockDashboard({ isError: true, error: new Error("falhou feio") });
    render(<AdminPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("falhou feio");
  });

  it("falls back to a generic error message when none is given", () => {
    mockDashboard({ isError: true, error: null });
    render(<AdminPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("Erro ao carregar o painel.");
  });

  it("renders the dashboard and wires the user status toggle", () => {
    mockDashboard({ data: dashboard });
    render(<AdminPage />);

    expect(screen.getByTestId("statcards")).toHaveTextContent("7");
    expect(screen.getByTestId("costchart")).toBeInTheDocument();
    expect(screen.getByTestId("userstable").getAttribute("data-count")).toBe("2");
    expect(screen.getByText("Usuários (2)")).toBeInTheDocument();

    fireEvent.click(screen.getByText("toggle"));
    expect(mutate).toHaveBeenCalledWith({ userId: "u1", action: "ban" });
  });

  it("renders only the header when there is no data, error, or loading", () => {
    mockDashboard({});
    render(<AdminPage />);
    expect(screen.getByText("Painel do Superadmin")).toBeInTheDocument();
    expect(screen.queryByTestId("statcards")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
