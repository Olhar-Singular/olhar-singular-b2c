import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ActivityPreview from "./ActivityPreview";

vi.mock("./ImageResizer", () => ({ default: () => <div data-testid="resizer" /> }));

describe("ActivityPreview", () => {
  it("renders empty state for empty input", () => {
    render(<ActivityPreview text="" />);
    expect(screen.getByText(/A prévia aparece/i)).toBeInTheDocument();
  });

  it("renders a single open_ended question", () => {
    render(<ActivityPreview text={"# A\n1) Pergunta dissertativa\n"} />);
    expect(screen.getByText(/Pergunta dissertativa/)).toBeInTheDocument();
    expect(screen.getByText(/Discursiva/i)).toBeInTheDocument();
  });

  it("renders a multiple_choice question with alternatives", () => {
    render(<ActivityPreview text={"1) Q?\na) Op A\nb) Op B\nc) Op C\n"} />);
    expect(screen.getByText(/Múltipla escolha/i)).toBeInTheDocument();
    expect(screen.getByText(/Op A/)).toBeInTheDocument();
    expect(screen.getByText(/Op B/)).toBeInTheDocument();
  });

  it("renders true/false items", () => {
    render(<ActivityPreview text={"1) V/F\n(V) verdade\n(F) falso\n"} />);
    expect(screen.getByText(/V \/ F/i)).toBeInTheDocument();
  });

  it("renders multiple_answer (checkboxes)", () => {
    render(<ActivityPreview text={"1) Selecione:\n[x] A\n[ ] B\n"} />);
    expect(screen.getByText(/Multi-resposta/i)).toBeInTheDocument();
  });

  it("renders matching pairs", () => {
    render(<ActivityPreview text={"1) Associe:\nA -- 1\nB -- 2\n"} />);
    expect(screen.getByText(/Associação/i)).toBeInTheDocument();
  });

  it("renders ordering items", () => {
    render(<ActivityPreview text={"1) Ordene:\n[1] x\n[2] y\n"} />);
    expect(screen.getByText(/Ordenação/i)).toBeInTheDocument();
  });

  it("renders table rows", () => {
    render(<ActivityPreview text={"1) Tabela\n| h1 | h2 |\n| a | b |\n"} />);
    expect(screen.getAllByText(/Tabela/i).length).toBeGreaterThan(0);
  });

  it("renders fill_blank when statement has underscores", () => {
    render(<ActivityPreview text={"1) Complete: ____\n"} />);
    expect(screen.getByText(/Lacuna/i)).toBeInTheDocument();
  });

  it("renders section title heading", () => {
    render(<ActivityPreview text={"# Bloco I\n1) X\n"} />);
    expect(screen.getByText(/Bloco I/)).toBeInTheDocument();
  });

  it("renders multiple sections separated", () => {
    render(<ActivityPreview text={"# A\n1) X\n# B\n2) Y\n"} />);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("renders question with image reference (image registry resolution)", () => {
    render(
      <ActivityPreview
        text={"1) com imagem\n[img:imagem-1]\n"}
        imageRegistry={{ "imagem-1": "https://x.png" }}
      />,
    );
    expect(screen.getByText(/com imagem/)).toBeInTheDocument();
  });

  it("renders points badge when present in statement", () => {
    render(<ActivityPreview text={"1) Q? {3 pts}\n"} />);
    expect(screen.getByText(/3\s*pts/i)).toBeInTheDocument();
  });

  it("renders the wordbank section for fill_blank with [banco:]", () => {
    render(<ActivityPreview text={"1) Complete: ____\n[banco: a, b, c]\n"} />);
    expect(screen.getByText(/Banco de palavras/i)).toBeInTheDocument();
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("b")).toBeInTheDocument();
  });

  it("renders answer lines when [linhas:N] is present", () => {
    const { container } = render(<ActivityPreview text={"1) Disserte:\n[linhas:3]\n"} />);
    const lines = container.querySelectorAll(".border-b.border-zinc-300");
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  it("renders trailing Apoio (scaffolding) when present after body", () => {
    render(<ActivityPreview text={"1) Q\na) op\n> Apoio: dica útil\n"} />);
    expect(screen.getByText(/dica útil/i)).toBeInTheDocument();
  });

  it("renders multi-question block correctly", () => {
    render(<ActivityPreview text={"# Sec\n1) Pergunta primeira\n2) Pergunta segunda\n"} />);
    expect(screen.getByText(/primeira/)).toBeInTheDocument();
    expect(screen.getByText(/segunda/)).toBeInTheDocument();
  });

  it("renders activity-level instruction (>) at section level", () => {
    render(<ActivityPreview text={"# Sec\n> Leia atentamente\n1) Q\n"} />);
    expect(screen.getByText(/Leia atentamente/)).toBeInTheDocument();
  });
});
