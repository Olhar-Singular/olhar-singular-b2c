import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import HowItWorksSection from "./HowItWorksSection";
import { renderWithProviders } from "@/test/helpers";
import { MAX_ACTIVITY_CHARS } from "@/lib/domain/activityLimits";

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

  it("states the real activity size limit from the shared constant, not the retired 10 000", () => {
    renderWithProviders(<HowItWorksSection />);
    expect(screen.getByText(`Insira o texto da prova, exercício ou trabalho. Aceita até ${MAX_ACTIVITY_CHARS.toLocaleString("pt-BR")} caracteres.`)).toBeInTheDocument();
    expect(screen.queryByText(/10 000/)).toBeNull();
  });
});
