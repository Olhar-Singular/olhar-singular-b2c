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
