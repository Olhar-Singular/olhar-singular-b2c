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
});
