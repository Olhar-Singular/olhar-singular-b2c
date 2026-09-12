import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AccessMenu } from "./AccessMenu";
import type { AdminUser } from "@/types/admin";

function user(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: "u1",
    email: "ana@x.com",
    full_name: "Ana",
    credit_balance: 0,
    plan_credits: 0,
    plan_period_end: null,
    access_kind: "legacy",
    trial_started_at: null,
    cpf_masked: null,
    total_usd: 0,
    last_sign_in_at: null,
    created_at: null,
    is_active: true,
    is_super_admin: false,
    ...overrides,
  };
}

describe("AccessMenu", () => {
  let onSetAccess: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    onSetAccess = vi.fn();
  });

  async function open(u = user()) {
    const ue = userEvent.setup();
    render(<AccessMenu user={u} onSetAccess={onSetAccess} />);
    await ue.click(screen.getByRole("button", { name: /alterar acesso de ana/i }));
    await screen.findByRole("menu");
    return ue;
  }

  it("confirms before changing the access kind, then sends it", async () => {
    const ue = await open();
    await ue.click(screen.getByRole("menuitem", { name: /cortesia/i }));

    expect(await screen.findByRole("alertdialog")).toHaveTextContent(/Ana passa a: Cortesia/i);
    expect(onSetAccess).not.toHaveBeenCalled();

    await ue.click(screen.getByRole("button", { name: /confirmar/i }));
    expect(onSetAccess).toHaveBeenCalledWith({ userId: "u1", kind: "exempt" });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("does nothing when the confirmation is cancelled", async () => {
    const ue = await open();
    await ue.click(screen.getByRole("menuitem", { name: /período de teste/i }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(/começa agora/i);
    await ue.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(onSetAccess).not.toHaveBeenCalled();
  });

  it("disables the current kind", async () => {
    await open(user({ access_kind: "legacy" }));
    expect(screen.getByRole("menuitem", { name: /legado/i })).toHaveAttribute("aria-disabled", "true");
  });

  it("extends a running trial in one click with the chosen preset", async () => {
    const ue = await open(user({ access_kind: "trial", trial_started_at: "2026-09-01T00:00:00Z" }));
    await ue.click(screen.getByRole("menuitem", { name: /\+14 dias/i }));
    expect(onSetAccess).toHaveBeenCalledWith({ userId: "u1", extendDays: 14 });
  });

  it("disables the extension for accounts that are not a started trial", async () => {
    await open(user({ access_kind: "legacy" }));
    for (const days of [7, 14, 30]) {
      expect(screen.getByRole("menuitem", { name: new RegExp(`\\+${days} dias`) })).toHaveAttribute("aria-disabled", "true");
    }
  });

  it("can be disabled while a mutation is in flight", () => {
    render(<AccessMenu user={user()} onSetAccess={onSetAccess} disabled />);
    expect(screen.getByRole("button", { name: /alterar acesso de ana/i })).toBeDisabled();
  });
});
