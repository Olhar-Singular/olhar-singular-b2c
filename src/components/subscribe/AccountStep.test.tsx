import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/helpers";
import AccountStep from "./AccountStep";
import { canSubscribe, maskCpfForOwner, validateAccountForm } from "@/lib/domain/subscriptionUi";

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

describe("AccountStep", () => {
  async function fill(user: ReturnType<typeof userEvent.setup>, values: { name?: string; email?: string; confirm?: string; terms?: boolean }) {
    if (values.name) await user.type(screen.getByLabelText("Nome completo"), values.name);
    if (values.email) await user.type(screen.getByLabelText("E-mail"), values.email);
    if (values.confirm) await user.type(screen.getByLabelText("Confirme o e-mail"), values.confirm);
    if (values.terms) await user.click(screen.getByRole("checkbox"));
  }

  it("confirms a valid account, normalising the e-mail", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderWithProviders(<AccountStep onConfirm={onConfirm} />);
    await fill(user, { name: " Ana Souza ", email: "Ana@Example.com", confirm: "ana@example.com", terms: true });
    await user.click(screen.getByRole("button", { name: /Continuar para o pagamento/ }));
    expect(onConfirm).toHaveBeenCalledWith({ fullName: "Ana Souza", email: "ana@example.com" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("blocks a mismatching e-mail and explains why it matters", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderWithProviders(<AccountStep onConfirm={onConfirm} />);
    await fill(user, { name: "Ana Souza", email: "ana@example.com", confirm: "ana@exemple.com", terms: true });
    await user.click(screen.getByRole("button", { name: /Continuar/ }));
    expect(screen.getByRole("alert")).toHaveTextContent(/não coincidem/);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("requires the terms and links to them", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderWithProviders(<AccountStep onConfirm={onConfirm} />);
    await fill(user, { name: "Ana Souza", email: "ana@example.com", confirm: "ana@example.com" });
    await user.click(screen.getByRole("button", { name: /Continuar/ }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Termos de Uso/);
    expect(screen.getByRole("link", { name: "Termos de Uso" })).toHaveAttribute("href", "/termos");
    expect(screen.getByRole("link", { name: "Política de Privacidade" })).toHaveAttribute("href", "/privacidade");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("pre-fills from a previous draft", () => {
    renderWithProviders(<AccountStep onConfirm={vi.fn()} initial={{ fullName: "Ana", email: "ana@example.com" }} />);
    expect(screen.getByLabelText("Nome completo")).toHaveValue("Ana");
    expect(screen.getByLabelText("Confirme o e-mail")).toHaveValue("ana@example.com");
  });
});
