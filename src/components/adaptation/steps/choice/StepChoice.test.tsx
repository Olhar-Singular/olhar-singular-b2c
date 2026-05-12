import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StepChoice } from "./StepChoice";

describe("StepChoice", () => {
  it("renders the heading", () => {
    render(<StepChoice onSelect={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /Como deseja adaptar/i })).toBeInTheDocument();
  });

  it("renders Gerar com IA and Adaptar manualmente buttons", () => {
    render(<StepChoice onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Gerar com IA/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Adaptar manualmente/i })).toBeInTheDocument();
  });

  it("calls onSelect('ai') when AI button is clicked", () => {
    const onSelect = vi.fn();
    render(<StepChoice onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Gerar com IA/i }));
    expect(onSelect).toHaveBeenCalledWith("ai");
  });

  it("calls onSelect('manual') when manual button is clicked", () => {
    const onSelect = vi.fn();
    render(<StepChoice onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Adaptar manualmente/i }));
    expect(onSelect).toHaveBeenCalledWith("manual");
  });

  it("shows credit cost on AI card when creditCost is provided and not first free", () => {
    render(<StepChoice onSelect={vi.fn()} creditCost={8} isFreeAdaptation={false} />);
    expect(screen.getByText("8 créditos")).toBeInTheDocument();
  });

  it("shows 'Grátis (1ª adaptação)' on AI card when isFreeAdaptation is true", () => {
    render(<StepChoice onSelect={vi.fn()} creditCost={12} isFreeAdaptation={true} />);
    expect(screen.getByText(/Grátis \(1ª adaptação\)/i)).toBeInTheDocument();
  });

  it("shows 'Sem custo' on the manual card", () => {
    render(<StepChoice onSelect={vi.fn()} />);
    expect(screen.getByText(/Sem custo/i)).toBeInTheDocument();
  });

  it("does not render a credit cost label when creditCost is not provided", () => {
    render(<StepChoice onSelect={vi.fn()} />);
    expect(screen.queryByText(/créditos/i)).not.toBeInTheDocument();
  });
});
