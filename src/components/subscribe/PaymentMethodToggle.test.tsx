import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PaymentMethodToggle from "./PaymentMethodToggle";

describe("PaymentMethodToggle", () => {
  it("offers card and Pix as two radios, the card copy following the trial", () => {
    const { rerender } = render(<PaymentMethodToggle value="card" onChange={vi.fn()} trial />);
    expect(screen.getByRole("radiogroup", { name: "Forma de pagamento" })).toBeInTheDocument();
    const card = screen.getByRole("radio", { name: /Cartão de crédito/ });
    expect(card).toHaveAttribute("aria-checked", "true");
    expect(card).toHaveTextContent("Teste 7 dias grátis. Nada é cobrado hoje.");
    const pix = screen.getByRole("radio", { name: /Pix/ });
    expect(pix).toHaveAttribute("aria-checked", "false");
    expect(pix).toHaveTextContent("Sem cartão. Planos à vista, acesso imediato.");

    rerender(<PaymentMethodToggle value="card" onChange={vi.fn()} trial={false} />);
    expect(screen.getByRole("radio", { name: /Cartão de crédito/ })).toHaveTextContent("Assinatura mensal. Cancele quando quiser.");
  });

  it("only the checked radio is in the tab order", () => {
    render(<PaymentMethodToggle value="pix" onChange={vi.fn()} trial={false} />);
    expect(screen.getByRole("radio", { name: /Pix/ })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: /Cartão/ })).toHaveAttribute("tabindex", "-1");
  });

  it("changes on click", async () => {
    const onChange = vi.fn();
    render(<PaymentMethodToggle value="card" onChange={onChange} trial={false} />);
    await userEvent.click(screen.getByRole("radio", { name: /Pix/ }));
    expect(onChange).toHaveBeenCalledWith("pix");
  });

  it("arrow keys move to the other option and focus it", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<PaymentMethodToggle value="card" onChange={onChange} trial={false} />);
    screen.getByRole("radio", { name: /Cartão/ }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("pix");
    expect(screen.getByRole("radio", { name: /Pix/ })).toHaveFocus();

    rerender(<PaymentMethodToggle value="pix" onChange={onChange} trial={false} />);
    await userEvent.keyboard("{ArrowUp}");
    expect(onChange).toHaveBeenLastCalledWith("card");
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it("ignores other keys", async () => {
    const onChange = vi.fn();
    render(<PaymentMethodToggle value="card" onChange={onChange} trial={false} />);
    screen.getByRole("radio", { name: /Cartão/ }).focus();
    await userEvent.keyboard("a");
    expect(onChange).not.toHaveBeenCalled();
  });
});
