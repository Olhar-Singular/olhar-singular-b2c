import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GrantCreditsButton } from "./GrantCreditsButton";

const user = { id: "u1", full_name: "Alice", email: "a@x.com" };

let onGrant: ReturnType<typeof vi.fn>;
beforeEach(() => {
  onGrant = vi.fn();
});

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: /Adicionar créditos para Alice/ }));
}

describe("GrantCreditsButton", () => {
  it("opens the dialog and grants the default amount", () => {
    render(<GrantCreditsButton user={user} onGrant={onGrant} />);
    openDialog();

    expect(screen.getByText(/não entram nos custos/i)).toBeInTheDocument();
    expect(screen.getByText(/Alice/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(onGrant).toHaveBeenCalledWith({ userId: "u1", amount: 10 });
    expect(screen.queryByText("Adicionar créditos")).not.toBeInTheDocument();
  });

  it("grants a preset amount", () => {
    render(<GrantCreditsButton user={user} onGrant={onGrant} />);
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: "+50" }));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(onGrant).toHaveBeenCalledWith({ userId: "u1", amount: 50 });
  });

  it("grants an amount typed in the input", () => {
    render(<GrantCreditsButton user={user} onGrant={onGrant} />);
    openDialog();
    fireEvent.change(screen.getByLabelText("Quantidade de créditos"), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(onGrant).toHaveBeenCalledWith({ userId: "u1", amount: 25 });
  });

  it("disables confirmation for empty or invalid amounts", () => {
    render(<GrantCreditsButton user={user} onGrant={onGrant} />);
    openDialog();
    const input = screen.getByLabelText("Quantidade de créditos");

    fireEvent.change(input, { target: { value: "" } }); // -> 0
    expect(screen.getByRole("button", { name: "Adicionar" })).toBeDisabled();

    fireEvent.change(input, { target: { value: "abc" } }); // -> NaN
    expect(screen.getByRole("button", { name: "Adicionar" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(onGrant).not.toHaveBeenCalled();
  });

  it("cancels without granting", () => {
    render(<GrantCreditsButton user={user} onGrant={onGrant} />);
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onGrant).not.toHaveBeenCalled();
    expect(screen.queryByText("Adicionar créditos")).not.toBeInTheDocument();
  });

  it("respects the disabled prop", () => {
    render(<GrantCreditsButton user={user} onGrant={onGrant} disabled />);
    expect(screen.getByRole("button", { name: /Adicionar créditos para Alice/ })).toBeDisabled();
  });
});
