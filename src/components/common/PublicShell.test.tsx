import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers";
import PublicShell from "./PublicShell";
import { resetConsentSession, subscribeConsentReopen } from "@/lib/analytics/consent";

vi.mock("@/assets/logo-olho-transparent.png", () => ({ default: "stub://logo.png" }));

describe("PublicShell", () => {
  it("wraps the content with brand, login and legal links", () => {
    renderWithProviders(
      <PublicShell>
        <div data-testid="content">payload</div>
      </PublicShell>,
    );
    expect(screen.getByTestId("content")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/auth");
    expect(screen.getByRole("link", { name: "Termos de Uso" })).toHaveAttribute("href", "/termos");
    expect(screen.getByRole("link", { name: "Privacidade" })).toHaveAttribute("href", "/privacidade");
    expect(screen.getByRole("link", { name: "Reembolso" })).toHaveAttribute("href", "/reembolso");
  });

  it("ends the legal footer with Preferências de cookies, which reopens the consent banner", () => {
    resetConsentSession();
    const onReopen = vi.fn();
    const unsubscribe = subscribeConsentReopen(onReopen);
    renderWithProviders(<PublicShell>x</PublicShell>, { route: "/termos" });
    const nav = screen.getByRole("navigation", { name: "Legal" });
    const entries = Array.from(nav.children).map((el) => el.textContent);
    expect(entries).toEqual(["Termos de Uso", "Privacidade", "Reembolso", "Preferências de cookies"]);
    const button = within(nav).getByRole("button", { name: "Preferências de cookies" });
    expect(button).toHaveClass("hover:text-foreground");
    fireEvent.click(button);
    expect(onReopen).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("leaves Preferências de cookies out of the checkout, where the banner never shows", () => {
    renderWithProviders(<PublicShell>x</PublicShell>, { route: "/assinar?plano=basico" });
    expect(screen.queryByRole("button", { name: "Preferências de cookies" })).toBeNull();
    expect(screen.getByRole("link", { name: "Reembolso" })).toBeInTheDocument();
  });
});
