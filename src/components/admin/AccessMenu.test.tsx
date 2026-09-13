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
  let onChangeEmail: ReturnType<typeof vi.fn>;
  let onCancelSubscription: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    onSetAccess = vi.fn();
    onChangeEmail = vi.fn();
    onCancelSubscription = vi.fn();
  });

  async function open(u = user()) {
    const ue = userEvent.setup();
    render(<AccessMenu user={u} onSetAccess={onSetAccess} onChangeEmail={onChangeEmail} onCancelSubscription={onCancelSubscription} />);
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

  describe("account actions", () => {
    it("keeps the e-mail dialog and the typed value when the change is refused", async () => {
      onChangeEmail.mockRejectedValueOnce(new Error("email_exists"));
      const ue = await open();
      await ue.click(screen.getByRole("menuitem", { name: /alterar e-mail/i }));
      await screen.findByRole("dialog");
      await ue.type(screen.getByLabelText(/novo e-mail/i), "taken@x.com");
      await ue.click(screen.getByRole("button", { name: /salvar e-mail/i }));
      await waitFor(() => expect(onChangeEmail).toHaveBeenCalled());
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByLabelText(/novo e-mail/i)).toHaveValue("taken@x.com");
    });

    it("changes the e-mail after validation", async () => {
      const ue = await open();
      await ue.click(screen.getByRole("menuitem", { name: /alterar e-mail/i }));
      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveTextContent(/corrigir um erro de digitação/);

      await ue.click(screen.getByRole("button", { name: /salvar e-mail/i }));
      expect(screen.getByRole("alert")).toHaveTextContent(/e-mail válido/);

      await ue.type(screen.getByLabelText(/novo e-mail/i), "Ana@X.com");
      await ue.click(screen.getByRole("button", { name: /salvar e-mail/i }));
      expect(screen.getByRole("alert")).toHaveTextContent(/mesmo e-mail/);

      await ue.clear(screen.getByLabelText(/novo e-mail/i));
      await ue.type(screen.getByLabelText(/novo e-mail/i), " Nova@X.com ");
      await ue.click(screen.getByRole("button", { name: /salvar e-mail/i }));
      expect(onChangeEmail).toHaveBeenCalledWith({ userId: "u1", email: "nova@x.com" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("clears the validation error when the dialog closes", async () => {
      const ue = await open(user({ email: null }));
      await ue.click(screen.getByRole("menuitem", { name: /alterar e-mail/i }));
      await screen.findByRole("dialog");
      await ue.type(screen.getByLabelText(/novo e-mail/i), "ok@x.com");
      await ue.clear(screen.getByLabelText(/novo e-mail/i));
      await ue.click(screen.getByRole("button", { name: /salvar e-mail/i }));
      expect(screen.getByRole("alert")).toBeInTheDocument();
      // With no current e-mail the "same e-mail" check never trips.
      await ue.type(screen.getByLabelText(/novo e-mail/i), "ok@x.com");
      await ue.click(screen.getByRole("button", { name: /salvar e-mail/i }));
      expect(onChangeEmail).toHaveBeenCalledWith({ userId: "u1", email: "ok@x.com" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await ue.click(screen.getByRole("button", { name: /alterar acesso de ana/i }));
      await screen.findByRole("menu");
      await ue.click(screen.getByRole("menuitem", { name: /alterar e-mail/i }));
      await screen.findByRole("dialog");
      await ue.click(screen.getByRole("button", { name: /salvar e-mail/i }));
      expect(screen.getByRole("alert")).toBeInTheDocument();
      await ue.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("offers to cancel a live subscription only, after confirmation", async () => {
      const ue = await open(user({ subscription: { status: "authorized", plan_name: "Pro", price_brl: 59.9, next_payment_date: null, current_period_end: null, mp_preapproval_id: "p" } }));
      await ue.click(screen.getByRole("menuitem", { name: /cancelar assinatura/i }));
      expect(await screen.findByRole("alertdialog")).toHaveTextContent(/cobrança mensal de Ana para/);
      await ue.click(screen.getByRole("button", { name: /^manter$/i }));
      expect(onCancelSubscription).not.toHaveBeenCalled();

      await ue.click(screen.getByRole("button", { name: /alterar acesso de ana/i }));
      await screen.findByRole("menu");
      await ue.click(screen.getByRole("menuitem", { name: /cancelar assinatura/i }));
      await screen.findByRole("alertdialog");
      await ue.click(screen.getByRole("button", { name: /^cancelar assinatura$/i }));
      expect(onCancelSubscription).toHaveBeenCalledWith({ userId: "u1" });
    });

    it("disables the cancel item without a live subscription", async () => {
      await open(user({ subscription: { status: "cancelled", plan_name: null, price_brl: 0, next_payment_date: null, current_period_end: null, mp_preapproval_id: null } }));
      expect(screen.getByRole("menuitem", { name: /cancelar assinatura/i })).toHaveAttribute("aria-disabled", "true");
    });

    it("works without the optional handlers", async () => {
      const ue = userEvent.setup();
      render(<AccessMenu user={user({ subscription: { status: "paused", plan_name: null, price_brl: 0, next_payment_date: null, current_period_end: null, mp_preapproval_id: "p" } })} onSetAccess={onSetAccess} />);
      await ue.click(screen.getByRole("button", { name: /alterar acesso de ana/i }));
      await screen.findByRole("menu");
      await ue.click(screen.getByRole("menuitem", { name: /cancelar assinatura/i }));
      await screen.findByRole("alertdialog");
      await ue.click(screen.getByRole("button", { name: /^cancelar assinatura$/i }));
      await ue.click(screen.getByRole("button", { name: /alterar acesso de ana/i }));
      await screen.findByRole("menu");
      await ue.click(screen.getByRole("menuitem", { name: /alterar e-mail/i }));
      await screen.findByRole("dialog");
      await ue.type(screen.getByLabelText(/novo e-mail/i), "x@y.zz");
      await ue.click(screen.getByRole("button", { name: /salvar e-mail/i }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });
  });
});
