import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { UsersTable } from "./UsersTable";
import type { AdminUser } from "@/types/admin";

const users: AdminUser[] = [
  {
    id: "u1",
    email: "alice@x.com",
    full_name: "Alice",
    credit_balance: 42,
    plan_credits: 10,
    plan_period_end: "2099-01-01T00:00:00Z",
    access_kind: "subscriber",
    trial_started_at: null,
    cpf_masked: "***.***.***-09",
    total_usd: 5,
    last_sign_in_at: "2026-05-30T12:00:00Z",
    created_at: null,
    is_active: true,
    is_super_admin: false,
  },
  {
    id: "u2",
    email: "bob@x.com",
    full_name: "Bob",
    credit_balance: 0,
    plan_credits: 0,
    plan_period_end: null,
    access_kind: "legacy",
    trial_started_at: null,
    cpf_masked: null,
    total_usd: 10,
    last_sign_in_at: null,
    created_at: null,
    is_active: false,
    is_super_admin: false,
  },
  {
    id: "u3",
    email: null,
    full_name: null,
    credit_balance: 1,
    plan_credits: 0,
    plan_period_end: null,
    access_kind: "exempt",
    trial_started_at: null,
    cpf_masked: null,
    total_usd: 0,
    last_sign_in_at: null,
    created_at: null,
    is_active: true,
    is_super_admin: true,
  },
];

function bodyRows() {
  const [table] = screen.getAllByRole("table");
  const rows = within(table).getAllByRole("row");
  return rows.slice(1); // drop header row
}

describe("UsersTable", () => {
  let onToggleStatus: ReturnType<typeof vi.fn>;
  let onGrantCredits: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    onToggleStatus = vi.fn();
    onGrantCredits = vi.fn();
  });

  it("renders users sorted by spend desc, with formatted cells and badges", () => {
    render(<UsersTable users={users} onToggleStatus={onToggleStatus} onGrantCredits={onGrantCredits} />);

    const rows = bodyRows();
    expect(rows[0]).toHaveTextContent("Bob"); // 10 usd
    expect(rows[1]).toHaveTextContent("Alice"); // 5 usd
    expect(rows[2]).toHaveTextContent("Admin"); // u3 admin badge

    expect(screen.getByText("$10.00")).toBeInTheDocument();
    expect(screen.getByText("$5.00")).toBeInTheDocument();
    expect(screen.getByText("$0.00")).toBeInTheDocument();
    // Bob is banned: the Status badge and the access badge both read "Inativo".
    expect(screen.getAllByText("Inativo").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Ativo").length).toBe(2);
    // u3 has null name and email -> "—" placeholders
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("filters by name and by email", () => {
    render(<UsersTable users={users} onToggleStatus={onToggleStatus} onGrantCredits={onGrantCredits} />);
    const search = screen.getByPlaceholderText(/buscar por nome ou e-mail/i);

    fireEvent.change(search, { target: { value: "ali" } });
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText("Alice")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "bob@x" } });
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("shows an empty state when nothing matches", () => {
    render(<UsersTable users={users} onToggleStatus={onToggleStatus} onGrantCredits={onGrantCredits} />);
    fireEvent.change(screen.getByPlaceholderText(/buscar por nome ou e-mail/i), {
      target: { value: "zzz" },
    });
    expect(screen.getByText("Nenhum usuário encontrado.")).toBeInTheDocument();
  });

  it("reactivates an inactive user immediately, without confirmation", () => {
    render(<UsersTable users={users} onToggleStatus={onToggleStatus} onGrantCredits={onGrantCredits} />);
    // sorted: [Bob(off), Alice(on), Admin(disabled)]
    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[0]); // Bob off -> on
    expect(onToggleStatus).toHaveBeenCalledWith({ userId: "u2", action: "unban" });
    expect(screen.queryByText("Inativar usuário?")).not.toBeInTheDocument();
  });

  it("confirms before deactivating an active user", () => {
    render(<UsersTable users={users} onToggleStatus={onToggleStatus} onGrantCredits={onGrantCredits} />);
    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[1]); // Alice on -> off

    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Inativar usuário?")).toBeInTheDocument();
    expect(within(dialog).getByText(/Alice/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Inativar" }));
    expect(onToggleStatus).toHaveBeenCalledWith({ userId: "u1", action: "ban" });
  });

  it("does not deactivate when the confirmation is cancelled", () => {
    render(<UsersTable users={users} onToggleStatus={onToggleStatus} onGrantCredits={onGrantCredits} />);
    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[1]); // Alice on -> off
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onToggleStatus).not.toHaveBeenCalled();
    expect(screen.queryByText("Inativar usuário?")).not.toBeInTheDocument();
  });

  it("disables the toggle for super-admins", () => {
    render(<UsersTable users={users} onToggleStatus={onToggleStatus} onGrantCredits={onGrantCredits} />);
    const switches = screen.getAllByRole("switch");
    expect(switches[2]).toBeDisabled(); // admin row
    expect(switches[0]).not.toBeDisabled();
  });

  it("disables all toggles while an update is in flight", () => {
    render(<UsersTable users={users} onToggleStatus={onToggleStatus} onGrantCredits={onGrantCredits} isUpdating />);
    for (const sw of screen.getAllByRole("switch")) {
      expect(sw).toBeDisabled();
    }
  });

  it("grants free credits to a user from the row", () => {
    render(<UsersTable users={users} onToggleStatus={onToggleStatus} onGrantCredits={onGrantCredits} />);
    // Bob (u2) is the top row (highest spend); open his grant dialog.
    fireEvent.click(screen.getByRole("button", { name: /Adicionar créditos para Bob/ }));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(onGrantCredits).toHaveBeenCalledWith({ userId: "u2", amount: 10 });
  });

  it("shows the access state, the active plan bucket and the masked CPF", () => {
    render(<UsersTable users={users} onToggleStatus={onToggleStatus} onGrantCredits={onGrantCredits} now={new Date("2026-09-12T12:00:00Z")} />);
    expect(screen.getByTestId("access-u1")).toHaveTextContent("Assinante");
    expect(screen.getByTestId("access-u2")).toHaveTextContent("Inativo");
    expect(screen.getByTestId("access-u3")).toHaveTextContent("Cortesia");
    expect(screen.getByText(/até 01\/01\/2099/)).toBeInTheDocument();
    expect(screen.getByText(/CPF \*\*\*\.\*\*\*\.\*\*\*-09/)).toBeInTheDocument();
  });

  it("filters by access state", () => {
    render(<UsersTable users={users} onToggleStatus={onToggleStatus} onGrantCredits={onGrantCredits} now={new Date("2026-09-12T12:00:00Z")} />);
    fireEvent.change(screen.getByLabelText(/filtrar por estado/i), { target: { value: "exempt" } });
    const rows = bodyRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveTextContent("Alice");
    fireEvent.change(screen.getByLabelText(/filtrar por estado/i), { target: { value: "all" } });
    expect(bodyRows()).toHaveLength(3);
  });

  it("disables the access menu for super-admins and while a change is in flight", () => {
    render(<UsersTable users={users} onToggleStatus={onToggleStatus} onGrantCredits={onGrantCredits} isSettingAccess />);
    screen.getAllByRole("button", { name: /alterar acesso de/i }).forEach((b) => expect(b).toBeDisabled());
  });

  it("tolerates a missing onSetAccess handler (defaults to a no-op)", async () => {
    const ue = userEvent.setup();
    const trialUsers = [{ ...users[0], access_kind: "trial", trial_started_at: "2026-09-01T00:00:00Z" }];
    render(<UsersTable users={trialUsers} onToggleStatus={onToggleStatus} onGrantCredits={onGrantCredits} />);
    await ue.click(screen.getByRole("button", { name: /alterar acesso de alice/i }));
    await ue.click(await screen.findByRole("menuitem", { name: /\+7 dias/i }));
    expect(screen.getByTestId("access-u1")).toBeInTheDocument();
  });

  it("tolerates missing e-mail and cancel handlers (default no-ops)", async () => {
    const ue = userEvent.setup();
    const withSub = [{ ...users[0], subscription: { status: "paused", plan_name: null, price_brl: 0, next_payment_date: null, current_period_end: null, mp_preapproval_id: "p", trial_ends_at: null, first_payment_confirmed: true, last_charge: null } }];
    render(<UsersTable users={withSub} onToggleStatus={onToggleStatus} onGrantCredits={onGrantCredits} />);
    await ue.click(screen.getByRole("button", { name: /alterar acesso de alice/i }));
    await ue.click(await screen.findByRole("menuitem", { name: /cancelar assinatura/i }));
    await ue.click(await screen.findByRole("button", { name: /^cancelar assinatura$/i }));
    await ue.click(screen.getByRole("button", { name: /alterar acesso de alice/i }));
    await ue.click(await screen.findByRole("menuitem", { name: /alterar e-mail/i }));
    await ue.type(await screen.findByLabelText(/novo e-mail/i), "x@y.zz");
    await ue.click(screen.getByRole("button", { name: /salvar e-mail/i }));
    expect(screen.getByTestId("subscription-u1")).toHaveTextContent("Pausada");
  });

  it("forwards access changes from the row menu", async () => {
    const ue = userEvent.setup();
    const onSetAccess = vi.fn();
    render(<UsersTable users={users} onToggleStatus={onToggleStatus} onGrantCredits={onGrantCredits} onSetAccess={onSetAccess} />);
    await ue.click(screen.getByRole("button", { name: /alterar acesso de alice/i }));
    await ue.click(await screen.findByRole("menuitem", { name: /legado/i }));
    await ue.click(await screen.findByRole("button", { name: /confirmar/i }));
    expect(onSetAccess).toHaveBeenCalledWith({ userId: "u1", kind: "legacy" });
  });

  it("shows the subscription column and forwards e-mail and cancel actions", async () => {
    const ue = userEvent.setup();
    const onChangeEmail = vi.fn();
    const onCancelSubscription = vi.fn();
    const withSub = [{
      ...users[0],
      subscription: { status: "authorized", plan_name: "Profissional", price_brl: 59.9, next_payment_date: "2026-10-12T12:00:00Z", current_period_end: null, mp_preapproval_id: "p", trial_ends_at: null, first_payment_confirmed: true, last_charge: null },
    }, users[1]];
    render(
      <UsersTable users={withSub} onToggleStatus={onToggleStatus} onGrantCredits={onGrantCredits} onChangeEmail={onChangeEmail} onCancelSubscription={onCancelSubscription} />,
    );
    expect(screen.getByTestId("subscription-u1")).toHaveTextContent("Profissional · Ativa");
    expect(screen.getByTestId("subscription-u1")).toHaveTextContent("próx. 12/10/2026");
    expect(screen.getByTestId("subscription-u2")).toHaveTextContent("—");

    await ue.click(screen.getByRole("button", { name: /alterar acesso de alice/i }));
    await ue.click(await screen.findByRole("menuitem", { name: /cancelar assinatura/i }));
    await ue.click(await screen.findByRole("button", { name: /^cancelar assinatura$/i }));
    expect(onCancelSubscription).toHaveBeenCalledWith({ userId: "u1" });
  });

  it("badges a live card trial as Teste (cartão) and lists it in the filter", () => {
    const cardTrialUsers = [{
      ...users[0],
      access_kind: "trial",
      trial_started_at: "2026-09-01T00:00:00Z",
      plan_period_end: "2099-01-01T00:00:00Z",
      subscription: {
        status: "authorized", plan_name: null, price_brl: 0, next_payment_date: null, current_period_end: null, mp_preapproval_id: "p",
        trial_ends_at: "2026-09-08T00:00:00Z", first_payment_confirmed: false, last_charge: null,
      },
    }];
    render(<UsersTable users={cardTrialUsers} onToggleStatus={onToggleStatus} onGrantCredits={onGrantCredits} now={new Date("2026-09-05T12:00:00Z")} />);
    expect(screen.getByTestId("access-u1")).toHaveTextContent("Teste (cartão)");

    fireEvent.change(screen.getByLabelText(/filtrar por estado/i), { target: { value: "trial_card" } });
    expect(bodyRows()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText(/filtrar por estado/i), { target: { value: "trial" } });
    expect(screen.getByText("Nenhum usuário encontrado.")).toBeInTheDocument();
  });

  it("shows the last charge row, with the refund note when the charge was refunded", () => {
    const withCharge = [{
      ...users[0],
      subscription: {
        status: "authorized", plan_name: "Profissional", price_brl: 59.9, next_payment_date: "2026-10-12T12:00:00Z", current_period_end: null, mp_preapproval_id: "p",
        trial_ends_at: null, first_payment_confirmed: true,
        last_charge: { amount_brl: 39.9, debit_date: "2026-09-12T00:00:00Z", refunded_at: "2026-09-13T00:00:00Z" },
      },
    }, users[1]];
    render(<UsersTable users={withCharge} onToggleStatus={onToggleStatus} onGrantCredits={onGrantCredits} />);
    expect(screen.getByTestId("last-charge-u1")).toHaveTextContent(/R\$\s*39,90 em 12\/09\/2026/);
    expect(screen.getByTestId("last-charge-u1")).toHaveTextContent(/estornada em 13\/09\/2026/);
    expect(screen.queryByTestId("last-charge-u2")).not.toBeInTheDocument();
  });
});
