import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ActivityStatusBar from "./ActivityStatusBar";

describe("ActivityStatusBar", () => {
  it("renders nothing for empty input", () => {
    const { container } = render(<ActivityStatusBar text="" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders question count chip", () => {
    render(<ActivityStatusBar text={"# Sec\n1) Q?\n"} />);
    expect(screen.getByText(/1 questão/i)).toBeInTheDocument();
  });

  it("counts sections (only those with title)", () => {
    render(<ActivityStatusBar text={"# A\n1) Q?\n# B\n2) Q?\n"} />);
    expect(screen.getByText(/2 seç/i)).toBeInTheDocument();
  });

  it("counts total points across questions", () => {
    render(<ActivityStatusBar text={"1) Q1 {2 pts}\n2) Q2 {3 pts}\n"} />);
    expect(screen.getByText(/5 pontos/)).toBeInTheDocument();
  });

  it("renders multiple_choice question type chip", () => {
    render(<ActivityStatusBar text={"1) Q?\na) op\nb) op\n"} />);
    expect(screen.getByText(/múltipla/i)).toBeInTheDocument();
  });

  it("warns when multiple_choice has fewer than 2 alternatives", () => {
    render(<ActivityStatusBar text={"1) Q?\na) sozinha\n"} />);
    expect(screen.getByText(/so 1 alternativa/i)).toBeInTheDocument();
  });

  it("counts unrecognized lines", () => {
    render(<ActivityStatusBar text={"# Sec\nlinha aleatoria\n1) Q?\n"} />);
    expect(screen.getByText(/não reconhecida/i)).toBeInTheDocument();
  });

  it("renders open_ended chip", () => {
    render(<ActivityStatusBar text={"1) Pergunta dissertativa?\n"} />);
    expect(screen.getByText(/discursiva/i)).toBeInTheDocument();
  });

  it("renders fill_blank chip when statement has underscores", () => {
    render(<ActivityStatusBar text={"1) ____ é a resposta\n"} />);
    expect(screen.getByText(/lacuna/i)).toBeInTheDocument();
  });

  it("renders true_false chip", () => {
    render(<ActivityStatusBar text={"1) V ou F\n(V) item\n(F) item\n"} />);
    expect(screen.getByText(/V\/F/i)).toBeInTheDocument();
  });
});
