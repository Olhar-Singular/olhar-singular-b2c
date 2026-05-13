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

  // ── DifficultyBadge branches ──

  it("renders difficulty badge with 'médio' style", () => {
    render(<ActivityPreview text={"1) Q? {médio}\n"} />);
    expect(screen.getByText("médio")).toBeInTheDocument();
  });

  it("renders difficulty badge with 'difícil' style (red)", () => {
    render(<ActivityPreview text={"1) Q? {difícil}\n"} />);
    expect(screen.getByText("difícil")).toBeInTheDocument();
  });

  it("renders difficulty badge with 'fácil' style (green)", () => {
    render(<ActivityPreview text={"1) Q? {fácil}\n"} />);
    expect(screen.getByText("fácil")).toBeInTheDocument();
  });

  // ── QuestionAlternatives sub-items mode (no correct marker) ──

  it("renders sub-items mode (no correct alternative) with plain continuation", () => {
    render(
      <ActivityPreview
        text={"1) Q\na) sub-item A\ncontinuação da letra a\nb) sub-item B\n"}
      />,
    );
    expect(screen.getByText(/sub-item A/)).toBeInTheDocument();
    expect(screen.getByText(/sub-item B/)).toBeInTheDocument();
  });

  it("renders sub-items with math block continuation ($$...$$)", () => {
    render(
      <ActivityPreview
        text={"1) Q\na) altern\n$$x^2$$\n"}
      />,
    );
    // The math block is rendered via KaTeX — just verify the alternative is present
    expect(screen.getByText(/altern/)).toBeInTheDocument();
  });

  it("renders sub-items with Apoio continuation (> Apoio:)", () => {
    render(
      <ActivityPreview
        text={"1) Q\na) sub\n> Apoio: dica sub-item\n"}
      />,
    );
    expect(screen.getAllByText(/dica sub-item/i).length).toBeGreaterThan(0);
  });

  it("renders sub-items with blockquote (> text, non-Apoio)", () => {
    render(
      <ActivityPreview
        text={"1) Q\na) sub\n> nota importante\n"}
      />,
    );
    expect(screen.getByText(/nota importante/)).toBeInTheDocument();
  });

  it("renders sub-items with nested V/F tfItems", () => {
    render(
      <ActivityPreview
        text={"1) Q\na) sub\n(V) verdadeiro nested\n(F) falso nested\n"}
      />,
    );
    expect(screen.getByText(/verdadeiro nested/)).toBeInTheDocument();
  });

  // ── QuestionAlternatives multiple_choice with correct marker + continuations ──

  it("renders multiple_choice with correct marker (*)  and continuation lines", () => {
    render(
      <ActivityPreview
        text={"1) Q?\na) errada\nb*) correta\ncontinuação correta\nc) outra\n"}
      />,
    );
    expect(screen.getAllByText(/correta/).length).toBeGreaterThan(0);
    // continuation line is rendered under the correct alternative
    expect(screen.getByText(/continuação correta/)).toBeInTheDocument();
  });

  // ── QuestionTable special cells ( ) and [ ] ──

  it("renders table cells with ( ) as radio circle", () => {
    const { container } = render(
      <ActivityPreview
        text={"1) Tabela\n| col1 | col2 |\n| item | ( ) |\n"}
      />,
    );
    // rounded-full inline-block is the radio circle span
    const radio = container.querySelector(".rounded-full.inline-block");
    expect(radio).toBeInTheDocument();
  });

  it("renders table cells with [ ] as checkbox square", () => {
    const { container } = render(
      <ActivityPreview
        text={"1) Tabela\n| col1 | col2 |\n| item | [ ] |\n"}
      />,
    );
    // rounded-[3px] inline-block is the checkbox span
    const checkbox = container.querySelector(".rounded-\\[3px\\].inline-block");
    expect(checkbox).toBeInTheDocument();
  });

  // ── SingleImage width/align/onImageResize/unresolved ──

  it("renders image with width= and align=center attributes", () => {
    const { container } = render(
      <ActivityPreview
        text={"1) Q\n[img:imagem-1 width=200 align=center]\n"}
        imageRegistry={{ "imagem-1": "https://example.com/img.png" }}
      />,
    );
    expect(container.querySelector("img")).toBeInTheDocument();
  });

  it("renders image with align=right attribute", () => {
    const { container } = render(
      <ActivityPreview
        text={"1) Q\n[img:imagem-1 align=right]\n"}
        imageRegistry={{ "imagem-1": "https://example.com/img.png" }}
      />,
    );
    expect(container.querySelector("img")).toBeInTheDocument();
  });

  it("renders image with width= attribute (sets inline style)", () => {
    const { container } = render(
      <ActivityPreview
        text={"1) Q\n[img:foto width=300]\n"}
        imageRegistry={{ foto: "https://example.com/img.png" }}
      />,
    );
    const img = container.querySelector("img");
    expect(img).toBeInTheDocument();
  });

  it("renders image with onImageResize + width= + align= attributes", () => {
    const onResize = vi.fn();
    render(
      <ActivityPreview
        text={"1) Q\n[img:imagem-1 width=150 align=center]\n"}
        imageRegistry={{ "imagem-1": "https://example.com/img.png" }}
        onImageResize={onResize}
      />,
    );
    expect(screen.getByTestId("resizer")).toBeInTheDocument();
  });

  it("renders image with onImageResize prop (ImageResizer)", () => {
    const onResize = vi.fn();
    render(
      <ActivityPreview
        text={"1) Q\n[img:imagem-1]\n"}
        imageRegistry={{ "imagem-1": "https://example.com/img.png" }}
        onImageResize={onResize}
      />,
    );
    expect(screen.getByTestId("resizer")).toBeInTheDocument();
  });

  it("renders image placeholder badge when ref is unresolved (no http/data)", () => {
    render(
      <ActivityPreview
        text={"1) Q\n[img:ref-desconhecida]\n"}
        imageRegistry={{}}
      />,
    );
    // The unresolved ref shows the ImageIcon + ref name
    expect(screen.getByText(/ref-desconhecida/)).toBeInTheDocument();
  });

  it("renders image with data: URI via img tag", () => {
    const { container } = render(
      <ActivityPreview
        text={"1) Q\n[img:foto]\n"}
        imageRegistry={{ foto: "data:image/png;base64,abc" }}
      />,
    );
    expect(container.querySelector("img")).toBeInTheDocument();
  });

  // ── renderContinuationStream branches ──

  it("renders leading continuation stream with $$ math block", () => {
    render(<ActivityPreview text={"1) Enunciado\n$$E=mc^2$$\na) alternativa\n"} />);
    expect(screen.getByText(/Enunciado/)).toBeInTheDocument();
  });

  it("renders leading continuation stream with > Apoio line", () => {
    render(<ActivityPreview text={"1) Enunciado\n> Apoio: contexto\na) alternativa\n"} />);
    expect(screen.getByText(/contexto/)).toBeInTheDocument();
  });

  it("renders leading continuation stream with plain blockquote (> text)", () => {
    render(<ActivityPreview text={"1) Enunciado\n> instrução adicional\na) alternativa\n"} />);
    expect(screen.getByText(/instrução adicional/)).toBeInTheDocument();
  });

  it("renders leading continuation stream with <!--blank--> as line break", () => {
    render(<ActivityPreview text={"1) Enunciado\n<!--blank-->\na) alternativa\n"} />);
    // blank just inserts a <br>, question is still rendered
    expect(screen.getByText(/Enunciado/)).toBeInTheDocument();
  });

  it("renders leading continuation stream with plain text continuation", () => {
    render(<ActivityPreview text={"1) Enunciado\ntexto extra de continuação\na) alternativa\n"} />);
    expect(screen.getByText(/texto extra de continuação/)).toBeInTheDocument();
  });

  it("renders leading continuation stream with two consecutive plain text lines (buffer <br> branch)", () => {
    render(<ActivityPreview text={"1) Enunciado\nlinha um\nlinha dois\na) alternativa\n"} />);
    expect(screen.getByText(/linha um/)).toBeInTheDocument();
  });

  it("renders leading continuation stream with inline image marker [img: ...]", () => {
    render(
      <ActivityPreview
        text={"1) Enunciado\n[img:foto]\ntexto após imagem\na) alternativa\n"}
        imageRegistry={{ foto: "https://example.com/img.png" }}
      />,
    );
    expect(screen.getByText(/texto após imagem/)).toBeInTheDocument();
  });

  // ── SectionItemRenderer extra branches ──

  it("renders separator (---) between sections", () => {
    const { container } = render(
      <ActivityPreview text={"# Sec\n---\n1) Q\n"} />,
    );
    expect(container.querySelector("hr")).toBeInTheDocument();
  });

  it("renders spacer (h-3 div) between section-level items", () => {
    // A blank line at section level (outside any question) produces a spacer item
    const { container } = render(
      <ActivityPreview text={"# Sec\n> instrucao\n\n> outra\n"} />,
    );
    const spacer = container.querySelector(".h-3");
    expect(spacer).toBeInTheDocument();
  });

  it("renders top-level math block ($$...$$)", () => {
    render(<ActivityPreview text={"# Sec\n$$x^2 + y^2$$\n1) Q\n"} />);
    // KaTeX renders it; just check the question still shows
    expect(screen.getByText(/Questão/)).toBeInTheDocument();
  });

  it("renders unrecognized line with red border", () => {
    render(<ActivityPreview text={"# Sec\n???linha-estranha???\n1) Q\n"} />);
    // unrecognized text appears in the DOM
    expect(screen.getByText(/linha-estranha/)).toBeInTheDocument();
  });

  // ── QuestionCard active / scroll ──

  it("highlights active question with violet ring", () => {
    const { container } = render(
      <ActivityPreview text={"1) Questão ativa\n"} activeQuestion={1} />,
    );
    const card = container.querySelector(".ring-2");
    expect(card).toBeInTheDocument();
  });

  it("renders section with level 2 heading (## syntax)", () => {
    render(<ActivityPreview text={"## Subseção\n1) Q\n"} />);
    expect(screen.getByText("Subseção")).toBeInTheDocument();
  });

  // ── True/false marked values ──

  it("renders true_false items with F marker", () => {
    render(<ActivityPreview text={"1) V/F\n(V) verdade\n(F) falso\n"} />);
    expect(screen.getByText("V")).toBeInTheDocument();
    expect(screen.getByText("F")).toBeInTheDocument();
  });

  it("renders true_false items with blank marker", () => {
    render(<ActivityPreview text={"1) V/F\n( ) nem verdade nem falso\n"} />);
    expect(screen.getByText(/nem verdade/)).toBeInTheDocument();
  });

  // ── QuestionCard points singular ──

  it("renders points badge with singular 'pt' when points = 1", () => {
    render(<ActivityPreview text={"1) Q? {1 pt}\n"} />);
    expect(screen.getByText(/1\s*pt$/i)).toBeInTheDocument();
  });

  // ── apoioInner fallback branch (line 61 — no regex match) ──

  it("renders trailing Apoio via trailing continuation stream", () => {
    render(<ActivityPreview text={"1) Q\na) op A\nb) op B\n> Apoio: dica trailing\n"} />);
    expect(screen.getByText(/dica trailing/i)).toBeInTheDocument();
  });

  // ── imageRegistry || {} fallback branch (line 397) ──

  it("renders image ref without imageRegistry prop (covers imageRegistry || {} branch)", () => {
    // When imageRegistry is undefined, resolveImageSrc falls back to {} and
    // the ref is returned as-is (unresolved), showing the placeholder badge
    render(<ActivityPreview text={"1) Q\n[img:foto-sem-registro]\n"} />);
    expect(screen.getByText(/foto-sem-registro/)).toBeInTheDocument();
  });
});
