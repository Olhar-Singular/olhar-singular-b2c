import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UsersTable } from "./UsersTable";
import type { AdminUser } from "@/types/admin";

const users: AdminUser[] = [
  {
    id: "u1",
    email: "alice@x.com",
    full_name: "Alice",
    credit_balance: 42,
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
  beforeEach(() => {
    onToggleStatus = vi.fn();
  });

  it("renders users sorted by spend desc, with formatted cells and badges", () => {
    render(<UsersTable users={users} onToggleStatus={onToggleStatus} />);

    const rows = bodyRows();
    expect(rows[0]).toHaveTextContent("Bob"); // 10 usd
    expect(rows[1]).toHaveTextContent("Alice"); // 5 usd
    expect(rows[2]).toHaveTextContent("Admin"); // u3 admin badge

    expect(screen.getByText("$10.00")).toBeInTheDocument();
    expect(screen.getByText("$5.00")).toBeInTheDocument();
    expect(screen.getByText("$0.00")).toBeInTheDocument();
    expect(screen.getByText("Inativo")).toBeInTheDocument();
    expect(screen.getAllByText("Ativo").length).toBe(2);
    // u3 has null name and email -> "—" placeholders
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("filters by name and by email", () => {
    render(<UsersTable users={users} onToggleStatus={onToggleStatus} />);
    const search = screen.getByPlaceholderText(/buscar por nome ou e-mail/i);

    fireEvent.change(search, { target: { value: "ali" } });
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText("Alice")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "bob@x" } });
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("shows an empty state when nothing matches", () => {
    render(<UsersTable users={users} onToggleStatus={onToggleStatus} />);
    fireEvent.change(screen.getByPlaceholderText(/buscar por nome ou e-mail/i), {
      target: { value: "zzz" },
    });
    expect(screen.getByText("Nenhum usuário encontrado.")).toBeInTheDocument();
  });

  it("reactivates an inactive user immediately, without confirmation", () => {
    render(<UsersTable users={users} onToggleStatus={onToggleStatus} />);
    // sorted: [Bob(off), Alice(on), Admin(disabled)]
    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[0]); // Bob off -> on
    expect(onToggleStatus).toHaveBeenCalledWith({ userId: "u2", action: "unban" });
    expect(screen.queryByText("Inativar usuário?")).not.toBeInTheDocument();
  });

  it("confirms before deactivating an active user", () => {
    render(<UsersTable users={users} onToggleStatus={onToggleStatus} />);
    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[1]); // Alice on -> off

    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Inativar usuário?")).toBeInTheDocument();
    expect(within(dialog).getByText(/Alice/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Inativar" }));
    expect(onToggleStatus).toHaveBeenCalledWith({ userId: "u1", action: "ban" });
  });

  it("does not deactivate when the confirmation is cancelled", () => {
    render(<UsersTable users={users} onToggleStatus={onToggleStatus} />);
    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[1]); // Alice on -> off
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onToggleStatus).not.toHaveBeenCalled();
    expect(screen.queryByText("Inativar usuário?")).not.toBeInTheDocument();
  });

  it("disables the toggle for super-admins", () => {
    render(<UsersTable users={users} onToggleStatus={onToggleStatus} />);
    const switches = screen.getAllByRole("switch");
    expect(switches[2]).toBeDisabled(); // admin row
    expect(switches[0]).not.toBeDisabled();
  });

  it("disables all toggles while an update is in flight", () => {
    render(<UsersTable users={users} onToggleStatus={onToggleStatus} isUpdating />);
    for (const sw of screen.getAllByRole("switch")) {
      expect(sw).toBeDisabled();
    }
  });
});
