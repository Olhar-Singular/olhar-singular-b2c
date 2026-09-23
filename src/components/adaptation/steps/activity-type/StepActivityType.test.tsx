import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StepActivityType } from "./StepActivityType";

describe("StepActivityType", () => {
  it("renders the step heading", () => {
    render(<StepActivityType onSelect={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /Tipo de atividade/i })).toBeInTheDocument();
  });

  it("renders four activity-type buttons", () => {
    render(<StepActivityType onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Exercício/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Prova/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Texto.*Leitura/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Projeto.*Pesquisa/i })).toBeInTheDocument();
  });

  it("invokes onSelect with 'exercício' when first option is clicked", () => {
    const onSelect = vi.fn();
    render(<StepActivityType onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Exercício/i }));
    expect(onSelect).toHaveBeenCalledWith("exercício");
  });

  it("invokes onSelect with the correct value for each option", () => {
    const onSelect = vi.fn();
    render(<StepActivityType onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Prova/i }));
    fireEvent.click(screen.getByRole("button", { name: /Texto.*Leitura/i }));
    fireEvent.click(screen.getByRole("button", { name: /Projeto.*Pesquisa/i }));
    expect(onSelect).toHaveBeenNthCalledWith(1, "prova");
    expect(onSelect).toHaveBeenNthCalledWith(2, "texto");
    expect(onSelect).toHaveBeenNthCalledWith(3, "projeto");
  });
});

// 0108-A: o passo 1 não tinha estado de selecionado. Quem voltava ao Tipo depois de
// escolher via os quatro cards idênticos — impossível distinguir "o clique não pegou"
// de "pegou e a tela não mostra".
describe("StepActivityType — estado de selecionado (0108)", () => {
  it("marks the current type with aria-pressed and leaves the others unpressed", () => {
    render(<StepActivityType value="prova" onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Prova/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Exercício/i })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /Texto.*Leitura/i })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /Projeto.*Pesquisa/i })).toHaveAttribute("aria-pressed", "false");
  });

  it("leaves every card unpressed when no type was chosen yet", () => {
    render(<StepActivityType onSelect={vi.fn()} />);
    screen
      .getAllByRole("button")
      .forEach((b) => expect(b).toHaveAttribute("aria-pressed", "false"));
  });

  // A distinção não pode depender só de cor (WCAG 1.4.1): o card escolhido carrega
  // um selo textual, lido por leitor de tela e visível em tons de cinza.
  it("marks the selected card with a non-color badge", () => {
    const { rerender } = render(<StepActivityType value="texto" onSelect={vi.fn()} />);
    const selected = screen.getByTestId("activity-type-selected");
    expect(selected).toHaveTextContent(/Selecionado/i);
    expect(screen.getByRole("button", { name: /Texto.*Leitura/i })).toContainElement(selected);

    rerender(<StepActivityType onSelect={vi.fn()} />);
    expect(screen.queryByTestId("activity-type-selected")).not.toBeInTheDocument();
  });
});
