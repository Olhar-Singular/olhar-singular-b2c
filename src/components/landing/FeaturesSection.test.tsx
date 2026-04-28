import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import FeaturesSection from "./FeaturesSection";
import { renderWithProviders } from "@/test/helpers";

describe("FeaturesSection", () => {
  it("renders the section heading", () => {
    renderWithProviders(<FeaturesSection />);
    expect(screen.getByRole("heading", { name: /Tudo que você precisa/i })).toBeInTheDocument();
  });

  it("renders all four feature cards", () => {
    renderWithProviders(<FeaturesSection />);
    expect(screen.getByText(/Adaptação com IA/i)).toBeInTheDocument();
    expect(screen.getByText(/Chat com a ISA/i)).toBeInTheDocument();
    expect(screen.getByText(/Perfis de barreira/i)).toBeInTheDocument();
    expect(screen.getByText(/Histórico completo/i)).toBeInTheDocument();
  });
});
