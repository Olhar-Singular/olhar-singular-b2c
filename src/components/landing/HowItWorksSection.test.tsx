import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import HowItWorksSection from "./HowItWorksSection";
import { renderWithProviders } from "@/test/helpers";

describe("HowItWorksSection", () => {
  it("renders the section heading", () => {
    renderWithProviders(<HowItWorksSection />);
    expect(screen.getByRole("heading", { name: /Como funciona/i })).toBeInTheDocument();
  });

  it("renders three numbered steps", () => {
    renderWithProviders(<HowItWorksSection />);
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("03")).toBeInTheDocument();
  });

  it("renders the step titles", () => {
    renderWithProviders(<HowItWorksSection />);
    expect(screen.getByText(/Selecione as barreiras/i)).toBeInTheDocument();
    expect(screen.getByText(/Cole sua atividade/i)).toBeInTheDocument();
    expect(screen.getByText(/Receba a adaptação/i)).toBeInTheDocument();
  });
});
