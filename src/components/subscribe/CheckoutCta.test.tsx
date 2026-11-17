import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CheckoutCta from "./CheckoutCta";

const PROPS = {
  label: "Começar meus 7 dias grátis",
  payToday: "R$ 0,00",
  note: "Hoje você não paga nada. Cancele em 2 cliques, sem fidelidade e sem multa.",
  mobileNote: "Cancele em 2 cliques. Sem fidelidade.",
};

describe("CheckoutCta", () => {
  it("is one button with the amount due today for the mobile bar and both notes", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<CheckoutCta {...PROPS} disabled={false} onClick={onClick} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByText("Você paga hoje")).toBeInTheDocument();
    expect(screen.getByText("R$ 0,00")).toBeInTheDocument();
    expect(screen.getByText(PROPS.note)).toBeInTheDocument();
    expect(screen.getByText(PROPS.mobileNote)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Começar meus 7 dias grátis" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // Checkout green (#00a650): white on it is 3.2:1, readable only as large text (WCAG 1.4.3); small green text uses the dark green (primary-strong).
  it("the green button carries large bold text and the amount the dark green", () => {
    render(<CheckoutCta {...PROPS} disabled={false} onClick={vi.fn()} />);
    expect(screen.getByRole("button")).toHaveClass("text-[1.1875rem]", "font-bold");
    expect(screen.getByText("R$ 0,00")).toHaveClass("text-primary-strong");
  });

  it("sticks to the bottom on mobile and sits in the flow from lg up", () => {
    render(<CheckoutCta {...PROPS} disabled={false} onClick={vi.fn()} />);
    const bar = screen.getByTestId("checkout-cta");
    expect(bar).toHaveClass("fixed", "bottom-0", "lg:static");
  });

  it("reserves room after the whole page (legal footer included) on mobile while it is on screen", () => {
    const { container, unmount } = render(<CheckoutCta {...PROPS} disabled={false} onClick={vi.fn()} />);
    const spacer = document.body.querySelector('[data-testid="checkout-cta-spacer"]');
    expect(spacer).not.toBeNull();
    // A direct child of <body>: after the app root, so after any footer.
    expect(spacer!.parentElement).toBe(document.body);
    expect(container.contains(spacer)).toBe(false);
    expect(spacer).toHaveAttribute("aria-hidden", "true");
    expect(spacer).toHaveClass("h-40", "lg:hidden");
    unmount();
    expect(document.body.querySelector('[data-testid="checkout-cta-spacer"]')).toBeNull();
  });

  it("does nothing while disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<CheckoutCta {...PROPS} disabled onClick={onClick} />);
    expect(screen.getByRole("button", { name: "Começar meus 7 dias grátis" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Começar meus 7 dias grátis" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
