import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    onGrantCredits,
    onSetAccess,
    onChangeEmail,
    onCancelSubscription,
    isUpdating,
    isSettingAccess,
  }: {
    users: unknown[];
    onToggleStatus: (i: unknown) => void;
    onGrantCredits: (i: unknown) => void;
    onSetAccess: (i: unknown) => void;
    onChangeEmail: (i: unknown) => void;
    onCancelSubscription: (i: unknown) => void;
    isUpdating: boolean;
    isSettingAccess: boolean;
  }) => (
    <div data-testid="userstable" data-count={users.length} data-updating={String(isUpdating)} data-setting={String(isSettingAccess)}>
      <button onClick={() => onToggleStatus({ userId: "u1", action: "ban" })}>toggle</button>
      <button onClick={() => onGrantCredits({ userId: "u1", amount: 10 })}>grant</button>
      <button onClick={() => onSetAccess({ userId: "u1", kind: "exempt" })}>access</button>
      <button onClick={() => onChangeEmail({ userId: "u1", email: "n@x.com" })}>email</button>
      <button onClick={() => onCancelSubscription({ userId: "u1" })}>cancel-sub</button>
    </div>
  ),
}));
vi.mock("@/components/admin/CreateUserDialog", () => ({
  CreateUserDialog: ({ onCreate, disabled }: { onCreate: (i: unknown) => Promise<unknown>; disabled: boolean }) => (
    <button data-testid="create-user" disabled={disabled} onClick={() => onCreate({ email: "a@x.com", fullName: "A B", mode: "trial" })}>
      criar
    </button>
  ),
}));
vi.mock("@/components/admin/SubscriptionStats", () => ({
  SubscriptionStats: ({ summary }: { summary?: { live: number } }) => <div data-testid="substats">{summary?.live ?? "none"}</div>,
}));

vi.mock("@/hooks/useAdminDashboard", () => ({
  useAdminDashboard: vi.fn(),
  useSetUserStatus: vi.fn(),
  useGrantCredits: vi.fn(),
  useSetAccess: vi.fn(),
  useCreateUser: vi.fn(),
  useChangeEmail: vi.fn(),
  useAdminCancelSubscription: vi.fn(),
}));

import {
  useAdminDashboard,
  useSetUserStatus,
  useGrantCredits,
  useSetAccess,
  useCreateUser,
  useChangeEmail,
  useAdminCancelSubscription,
} from "@/hooks/useAdminDashboard";

const dashboard = {
  metrics: { total_usd: 7, today_usd: 1, month_usd: 3, daily: [], monthly: [] },
  users: [{ id: "u1" }, { id: "u2" }],
  subscriptions: { live: 4, mrr_brl: 100, by_status: {} },
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
let grantMutate: ReturnType<typeof vi.fn>;
let setAccessMutate: ReturnType<typeof vi.fn>;
let createMutateAsync: ReturnType<typeof vi.fn>;
let changeEmailMutate: ReturnType<typeof vi.fn>;
let cancelMutate: ReturnType<typeof vi.fn>;
beforeEach(() => {
  mutate = vi.fn();
  grantMutate = vi.fn();
  setAccessMutate = vi.fn();
  createMutateAsync = vi.fn(async () => ({ success: true }));
  changeEmailMutate = vi.fn();
  cancelMutate = vi.fn();
  vi.mocked(useSetUserStatus).mockReturnValue({ mutate, isPending: false } as never);
  vi.mocked(useGrantCredits).mockReturnValue({ mutate: grantMutate, isPending: false } as never);
  vi.mocked(useSetAccess).mockReturnValue({ mutate: setAccessMutate, isPending: false } as never);
  vi.mocked(useCreateUser).mockReturnValue({ mutateAsync: createMutateAsync, isPending: false } as never);
  vi.mocked(useChangeEmail).mockReturnValue({ mutateAsync: changeEmailMutate, isPending: false } as never);
  vi.mocked(useAdminCancelSubscription).mockReturnValue({ mutate: cancelMutate, isPending: false } as never);
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

    expect(screen.getByTestId("userstable").getAttribute("data-count")).toBe("2");
    expect(screen.getByRole("tab", { name: "Usuários (2)" })).toBeInTheDocument();

    fireEvent.click(screen.getByText("toggle"));
    expect(mutate).toHaveBeenCalledWith({ userId: "u1", action: "ban" });

    fireEvent.click(screen.getByText("grant"));
    expect(grantMutate).toHaveBeenCalledWith({ userId: "u1", amount: 10 });

    fireEvent.click(screen.getByText("access"));
    expect(setAccessMutate).toHaveBeenCalledWith({ userId: "u1", kind: "exempt" });

    fireEvent.click(screen.getByText("email"));
    expect(changeEmailMutate).toHaveBeenCalledWith({ userId: "u1", email: "n@x.com" });

    fireEvent.click(screen.getByText("cancel-sub"));
    expect(cancelMutate).toHaveBeenCalledWith({ userId: "u1" });

    fireEvent.click(screen.getByTestId("create-user"));
    expect(createMutateAsync).toHaveBeenCalledWith({ email: "a@x.com", fullName: "A B", mode: "trial" });
  });

  it("switches between the three tabs", async () => {
    const ue = userEvent.setup();
    mockDashboard({ data: dashboard });
    render(<AdminPage />);
    expect(screen.getByTestId("userstable")).toBeInTheDocument();
    expect(screen.queryByTestId("statcards")).toBeNull();

    await ue.click(screen.getByRole("tab", { name: /Assinaturas e receita/ }));
    expect(screen.getByTestId("substats")).toHaveTextContent("4");

    await ue.click(screen.getByRole("tab", { name: /Custos de IA/ }));
    expect(screen.getByTestId("statcards")).toHaveTextContent("7");
    expect(screen.getByTestId("costchart")).toBeInTheDocument();
  });

  it("marks the table busy while any account mutation is in flight", () => {
    vi.mocked(useChangeEmail).mockReturnValue({ mutateAsync: changeEmailMutate, isPending: true } as never);
    mockDashboard({ data: dashboard });
    render(<AdminPage />);
    expect(screen.getByTestId("userstable").getAttribute("data-setting")).toBe("true");
  });

  it("renders only the header when there is no data, error, or loading", () => {
    mockDashboard({});
    render(<AdminPage />);
    expect(screen.getByText("Painel do Superadmin")).toBeInTheDocument();
    expect(screen.queryByTestId("statcards")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
