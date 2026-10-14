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
    expect(screen.getByText("Perfis de barreira")).toBeInTheDocument();
    expect(screen.getByText(/Histórico completo/i)).toBeInTheDocument();
  });

  it("describes barrier profiles without inviting student identification (Termos 8.3, Privacidade 4)", () => {
    renderWithProviders(<FeaturesSection />);
    expect(screen.getByText(/Salve perfis de barreira, sem identificar o aluno, e adapte com mais agilidade/)).toBeInTheDocument();
    expect(screen.queryByText(/perfis dos seus alunos/i)).toBeNull();
  });

  it("says adaptation takes minutes, as the hero and index.html do, never seconds (CDC arts. 30 and 37)", () => {
    renderWithProviders(<FeaturesSection />);
    expect(screen.getByText("Transforme provas, exercícios e atividades em versões adaptadas em minutos.")).toBeInTheDocument();
    expect(screen.queryByText(/em segundos/)).toBeNull();
  });
});
