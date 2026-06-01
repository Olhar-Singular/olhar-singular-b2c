import { describe, it, expect } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import FaqSection from "./FaqSection";
import { renderWithProviders } from "@/test/helpers";

describe("FaqSection", () => {
  it("renders the FAQ heading", () => {
    renderWithProviders(<FaqSection />);
    expect(screen.getByRole("heading", { name: /Perguntas frequentes/i })).toBeInTheDocument();
  });

  it("starts with all questions collapsed (aria-expanded=false)", () => {
    renderWithProviders(<FaqSection />);
    const buttons = screen.getAllByRole("button", { expanded: false });
    expect(buttons.length).toBeGreaterThanOrEqual(5);
  });

  it("expands a question on click and shows the answer", () => {
    renderWithProviders(<FaqSection />);
    const button = screen.getByRole("button", { name: /diagnóstico/i });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/barreiras pedagógicas observáveis/i)).toBeInTheDocument();
  });

  it("states the real adaptation cost range (5–12 credits), not the legacy flat 3", () => {
    renderWithProviders(<FaqSection />);
    const button = screen.getByRole("button", { name: /Quanto vale 1 crédito/i });
    fireEvent.click(button);
    expect(screen.getByText(/5 a 12 créditos/i)).toBeInTheDocument();
  });

  it("collapses again on second click", () => {
    renderWithProviders(<FaqSection />);
    const button = screen.getByRole("button", { name: /créditos expiram/i });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });
});
