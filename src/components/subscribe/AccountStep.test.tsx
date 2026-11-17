import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/helpers";
import AccountStep, { EMPTY_ACCOUNT_FORM, type AccountForm } from "./AccountStep";
import { canSubscribe, confirmedEmail, maskCpfForOwner, normalizeAccount, validateAccountForm } from "@/lib/domain/subscriptionUi";

describe("validateAccountForm", () => {
  const ok = { fullName: "Ana Souza", email: "Ana@Example.com", emailConfirmation: "ana@example.com ", acceptedTerms: true };

  it("passes a complete form, comparing e-mails case- and space-insensitively", () => {
    expect(validateAccountForm(ok)).toBeNull();
  });

  it("reports the first problem in order", () => {
    expect(validateAccountForm({ ...ok, fullName: "A" })).toBe("name");
    expect(validateAccountForm({ ...ok, email: "nope" })).toBe("email");
    expect(validateAccountForm({ ...ok, emailConfirmation: "other@example.com" })).toBe("email_mismatch");
    expect(validateAccountForm({ ...ok, acceptedTerms: false })).toBe("terms");
  });
});

describe("canSubscribe", () => {
  const base = { kind: "exempt" as const, planCredits: 0, extraCredits: 0, total: 0, unlimited: true, paywalled: false, periodEnd: null, daysLeft: null, trialExpired: false, mustSetPassword: false };
  it("blocks courtesy accounts unless they are the super-admin", () => {
    expect(canSubscribe(base, false)).toBe(false);
    expect(canSubscribe(base, null)).toBe(false);
    expect(canSubscribe(base, true)).toBe(true);
    expect(canSubscribe({ ...base, kind: "legacy", unlimited: false }, false)).toBe(true);
    expect(canSubscribe(null, true)).toBe(false);
  });
});

describe("maskCpfForOwner", () => {
  it("keeps only the last two digits and refuses anything but 11 digits", () => {
    expect(maskCpfForOwner("12345678909")).toBe("***.***.***-09");
    expect(maskCpfForOwner("123")).toBeNull();
    expect(maskCpfForOwner(null)).toBeNull();
    expect(maskCpfForOwner(undefined)).toBeNull();
  });
});

describe("confirmedEmail", () => {
  it("gives the normalised e-mail only when it is valid and both fields match", () => {
    expect(confirmedEmail({ email: " Ana@Example.com", emailConfirmation: "ana@example.com " })).toBe("ana@example.com");
    expect(confirmedEmail({ email: "ana@example.com", emailConfirmation: "ana@example.co" })).toBeNull();
    expect(confirmedEmail({ email: "nope", emailConfirmation: "nope" })).toBeNull();
  });
});

describe("normalizeAccount", () => {
  it("trims the name and lower-cases the e-mail", () => {
    expect(
      normalizeAccount({ fullName: " Ana Souza ", email: " Ana@Example.com", emailConfirmation: "x", acceptedTerms: true }),
    ).toEqual({ fullName: "Ana Souza", email: "ana@example.com" });
  });
});

describe("AccountStep", () => {
  // The page owns the values (they are checked by the checkout's own button).
  function Harness({ error = null, onChange }: { error?: string | null; onChange?: (v: AccountForm) => void }) {
    const [value, setValue] = useState<AccountForm>(EMPTY_ACCOUNT_FORM);
    return (
      <AccountStep
        value={value}
        error={error}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
    );
  }

  it("is a part of the checkout, not a step: no button of its own", () => {
    renderWithProviders(<Harness />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByLabelText("E-mail")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Nome completo")).toHaveAttribute("autocomplete", "name");
  });

  it("reports every field to the page", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<Harness onChange={onChange} />);
    await user.type(screen.getByLabelText("Nome completo"), "Ana");
    await user.type(screen.getByLabelText("E-mail"), "a@b.co");
    await user.type(screen.getByLabelText("Confirme o e-mail"), "a@b.co");
    await user.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenLastCalledWith({ fullName: "Ana", email: "a@b.co", emailConfirmation: "a@b.co", acceptedTerms: true });
    await user.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ acceptedTerms: false }));
  });

  it("shows the page's validation message as an alert", () => {
    renderWithProviders(<Harness error="Os e-mails não coincidem." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Os e-mails não coincidem.");
    expect(screen.getByRole("alert")).toHaveClass("text-destructive-strong");
  });

  it("links to the three legal documents", () => {
    renderWithProviders(<Harness />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("link", { name: "Termos de Uso" })).toHaveAttribute("href", "/termos");
    expect(screen.getByRole("link", { name: "Política de Privacidade" })).toHaveAttribute("href", "/privacidade");
    expect(screen.getByRole("link", { name: "Política de Reembolso" })).toHaveAttribute("href", "/reembolso");
  });
});
