import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { NodeViewProps } from "@tiptap/react";
import { readFileSync } from "node:fs";
import { InlineMathNodeView, ALT_STALE_MARK_CLASS } from "./InlineMathNodeView";

vi.mock("@tiptap/react", () => ({
  NodeViewWrapper: ({ children, ...rest }: { children: React.ReactNode }) => (
    <span {...rest}>{children}</span>
  ),
}));

const renderLatexToHtml = vi.fn((s: string) => `<span>${s}</span>`);
vi.mock("@/lib/domain/latexRenderer", () => ({
  renderLatexToHtml: (s: string, displayMode?: boolean) => renderLatexToHtml(s, displayMode),
}));

function makeProps(attrs: Record<string, unknown> = {}, editable = true) {
  const updateAttributes = vi.fn();
  const props = {
    node: { attrs: { latex: "x^2", alt: null, ...attrs } },
    updateAttributes,
    editor: { isEditable: editable },
  } as unknown as NodeViewProps;
  return { props, updateAttributes };
}

beforeEach(() => vi.clearAllMocks());

describe("InlineMathNodeView", () => {
  it("renders inline KaTeX (display mode false) and enters edit mode on click", () => {
    const { props } = makeProps();
    render(<InlineMathNodeView {...props} />);
    expect(screen.getByTestId("inlinemath-render")).toBeInTheDocument();
    expect(renderLatexToHtml).toHaveBeenCalledWith("x^2", false);
    fireEvent.click(screen.getByTestId("inlinemath-render"));
    expect(screen.getByLabelText("Expressão LaTeX inline")).toBeInTheDocument();
  });


  // Achado 0312: mesmo caso da fórmula em bloco, no chrome inline.
  it("dá identidade de campo ao LaTeX e ao alt inline (achado 0312)", () => {
    const { props } = makeProps();
    render(<InlineMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("inlinemath-render"));
    const latex = screen.getByLabelText("Expressão LaTeX inline") as HTMLInputElement;
    const alt = screen.getByLabelText("Texto alternativo da fórmula inline") as HTMLInputElement;
    expect(latex.id).not.toBe("");
    expect(alt.id).not.toBe("");
    expect(latex.id).not.toBe(alt.id);
    expect(latex.getAttribute("name")).toBe("inlinemath-latex");
    expect(alt.getAttribute("name")).toBe("inlinemath-alt");
  });

  it("edits the latex attr and closes edit mode", () => {
    const { props, updateAttributes } = makeProps();
    render(<InlineMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("inlinemath-render"));
    fireEvent.change(screen.getByLabelText("Expressão LaTeX inline"), { target: { value: "y" } });
    expect(updateAttributes).toHaveBeenCalledWith({ latex: "y" });
    fireEvent.click(screen.getByText("Pronto"));
    expect(screen.getByTestId("inlinemath-render")).toBeInTheDocument();
  });

  it("does not enter edit mode when disabled", () => {
    const { props } = makeProps({}, false);
    render(<InlineMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("inlinemath-render"));
    expect(screen.queryByLabelText("Expressão LaTeX inline")).not.toBeInTheDocument();
  });

  /**
   * B8 · gatilho G4 — `latex` is `min(1)` in the canonical model, so committing
   * the empty string makes the WHOLE document unrepresentable and the autosave
   * freezes silently. Clearing the field to retype must stay possible, so the
   * empty value lives in the input only.
   */
  it("lets the field be cleared WITHOUT writing an empty latex onto the node", () => {
    const { props, updateAttributes } = makeProps();
    render(<InlineMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("inlinemath-render"));
    const input = screen.getByLabelText("Expressão LaTeX inline");

    fireEvent.change(input, { target: { value: "" } });

    // The input really is empty (the user can retype)...
    expect((input as HTMLInputElement).value).toBe("");
    // ...but nothing unrepresentable reached the document.
    expect(updateAttributes).not.toHaveBeenCalled();

    // Typing again commits normally.
    fireEvent.change(input, { target: { value: "z" } });
    expect(updateAttributes).toHaveBeenCalledWith({ latex: "z" });
  });

  it("restores the committed formula when an emptied field loses focus", () => {
    const { props } = makeProps();
    render(<InlineMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("inlinemath-render"));
    const input = screen.getByLabelText("Expressão LaTeX inline");

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    // The input must not keep claiming the formula is gone when it is not.
    expect((input as HTMLInputElement).value).toBe("x^2");
  });

  it("leaves a non-empty field untouched on blur", () => {
    const { props } = makeProps();
    render(<InlineMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("inlinemath-render"));
    const input = screen.getByLabelText("Expressão LaTeX inline");

    fireEvent.change(input, { target: { value: "a+b" } });
    fireEvent.blur(input);

    expect((input as HTMLInputElement).value).toBe("a+b");
  });
  /** Achado 0006 — parity with the read-only `RichTextView`. */
  it("exposes the formula as math with the alt as accessible name", () => {
    const { props } = makeProps({ alt: "x ao quadrado" });
    render(<InlineMathNodeView {...props} />);
    const math = screen.getByTestId("inlinemath-math");
    expect(math).toHaveAttribute("role", "math");
    expect(math).toHaveAttribute("aria-label", "x ao quadrado");
  });

  /**
   * Achado 0403 — o `role="math"` do 0006 estava no próprio `<button>` e
   * substituía o papel implícito, apagando a afordância de edição para o leitor
   * de tela (WCAG 4.1.2). O papel `math` pertence a um elemento não interativo.
   */
  it("keeps the clickable element announced as a button naming the formula", () => {
    const { props } = makeProps({ alt: "x ao quadrado" });
    render(<InlineMathNodeView {...props} />);
    const trigger = screen.getByTestId("inlinemath-render");
    expect(trigger).not.toHaveAttribute("role");
    expect(screen.getByRole("button", { name: "Editar fórmula: x ao quadrado" })).toBe(trigger);
  });

  it("falls back to the latex as accessible name when there is no alt", () => {
    const { props } = makeProps({ alt: null });
    render(<InlineMathNodeView {...props} />);
    expect(screen.getByTestId("inlinemath-math")).toHaveAttribute("aria-label", "x^2");
    expect(screen.getByTestId("inlinemath-render")).toHaveAttribute(
      "aria-label",
      "Editar fórmula: x^2",
    );
  });

  /**
   * Achado 0406 — o alvo de clique embrulhava a fórmula num botão com `px-0.5`,
   * somando 2 px de cada lado que o impresso (`RichTextView`, um `<span>` pelado)
   * não tem: o `?` logo depois da fórmula aparecia descolado só no Revisar. O
   * realce pode continuar maior que a fórmula, mas não pode ocupar caixa: todo
   * padding horizontal precisa ser compensado por margem negativa igual.
   */
  it("does not add horizontal box space around the formula", () => {
    const { props } = makeProps();
    render(<InlineMathNodeView {...props} />);
    const classes = screen.getByTestId("inlinemath-render").className.split(/\s+/);

    const spacing = (prefix: string) =>
      classes
        .filter((c) => c.startsWith(prefix))
        .reduce((sum, c) => sum + Number(c.slice(prefix.length)), 0);

    const horizontal =
      spacing("px-") + spacing("pl-") + spacing("pr-") -
      (spacing("-mx-") + spacing("-ml-") + spacing("-mr-"));

    expect(horizontal).toBe(0);
  });

  /**
   * Achado 0006 — without this field the `alt` of an inlineMath is editable
   * nowhere in the UI, so the accessible name above can never be filled in.
   */
  it("edits the alt attr", () => {
    const { props, updateAttributes } = makeProps({ alt: "antigo" });
    render(<InlineMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("inlinemath-render"));
    const alt = screen.getByLabelText("Texto alternativo da fórmula inline");
    expect((alt as HTMLInputElement).value).toBe("antigo");

    fireEvent.change(alt, { target: { value: "x ao quadrado" } });
    expect(updateAttributes).toHaveBeenCalledWith({ alt: "x ao quadrado" });

    fireEvent.change(alt, { target: { value: "" } });
    expect(updateAttributes).toHaveBeenCalledWith({ alt: null });
  });
  /**
   * Achado 0436 — trocar a `Expressão LaTeX` não tocava no `alt`, e o `alt` é o
   * nome acessível da fórmula: a folha passava a mostrar uma fórmula enquanto o
   * leitor de tela continuava anunciando a anterior, sem nenhum sinal de que as
   * duas divergiram. Vale a regra que a correção do 0317 escreveu para a imagem:
   * o conteúdo novo não herda o que descrevia o antigo.
   */
  it("descarta o alt que descrevia a fórmula substituída", () => {
    const { props, updateAttributes } = makeProps({
      latex: "x^2 + 2x + 1 = 0",
      alt: "x ao quadrado mais 2x mais 1 igual a zero",
    });
    render(<InlineMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("inlinemath-render"));

    fireEvent.change(screen.getByLabelText("Expressão LaTeX inline"), {
      target: { value: "y^3 = 8" },
    });

    expect(updateAttributes).toHaveBeenCalledWith({ latex: "y^3 = 8", alt: null });
  });

  /** Achado 0436 — o caso do LaTeX inválido é o mesmo defeito, só visível a olho nu. */
  it("descarta o alt também quando o LaTeX novo é inválido", () => {
    const { props, updateAttributes } = makeProps({
      latex: "x^2 + 2x + 1 = 0",
      alt: "x ao quadrado mais 2x mais 1 igual a zero",
    });
    render(<InlineMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("inlinemath-render"));

    fireEvent.change(screen.getByLabelText("Expressão LaTeX inline"), {
      target: { value: "\\frac{1}{ \\unknowncmd{x" },
    });

    expect(updateAttributes).toHaveBeenCalledWith({
      latex: "\\frac{1}{ \\unknowncmd{x",
      alt: null,
    });
  });

  /**
   * Achado 0436 — zerar o alt em silêncio trocaria uma mentira por um buraco: o
   * professor precisa ver, na folha, que a descrição ficou para trás.
   */
  it("para de anunciar o alt antigo e avisa que a descrição ficou desatualizada", () => {
    const { props } = makeProps({ latex: "x^2", alt: "x ao quadrado" });
    render(<InlineMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("inlinemath-render"));
    fireEvent.change(screen.getByLabelText("Expressão LaTeX inline"), {
      target: { value: "y^3" },
    });

    expect(screen.getByTestId("inlinemath-alt-stale")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Pronto"));
    const trigger = screen.getByTestId("inlinemath-render");
    expect(trigger.getAttribute("aria-label")).not.toContain("x ao quadrado");
    expect(trigger).toHaveAttribute("data-alt-stale", "true");
    expect(screen.getByTestId("inlinemath-math").getAttribute("aria-label")).not.toContain(
      "x ao quadrado",
    );
  });

  /**
   * Achado 0437: o aviso do 0436 era `text-decoration` no `<button>`, e a
   * decoração de um ancestral não atravessa caixa inline-level atômica: o único
   * filho do gatilho é o KaTeX, cujo `.katex .base` é `inline-block`. O CSS
   * existia, o computado confirmava, e nenhum pixel era pintado. O sinal tem que
   * ser uma tinta própria do gatilho (fundo), que pinta sob o descendente.
   */
  it("marca a fórmula desatualizada com tinta que atravessa o inline-block do KaTeX", () => {
    const { props } = makeProps({ latex: "x^2", alt: "x ao quadrado" });
    render(<InlineMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("inlinemath-render"));
    fireEvent.change(screen.getByLabelText("Expressão LaTeX inline"), {
      target: { value: "y^3" },
    });
    fireEvent.click(screen.getByText("Pronto"));

    const trigger = screen.getByTestId("inlinemath-render");
    expect(trigger).toHaveClass(ALT_STALE_MARK_CLASS);
    // Falharia de novo se o aviso voltasse a ser decoração herdada pelo KaTeX.
    expect(trigger.className).not.toMatch(/\bunderline\b|\bdecoration-/);
  });

  /** Achado 0437: classe que não pinta nada é o próprio bug: a regra existe. */
  it("publica na folha a regra que pinta a marca de descrição desatualizada", () => {
    const css = readFileSync("src/index.css", "utf-8");
    const rule = css.slice(css.indexOf(`.${ALT_STALE_MARK_CLASS}`));
    expect(css).toContain(`.${ALT_STALE_MARK_CLASS}`);
    expect(rule.slice(0, rule.indexOf("}"))).toContain("background-image");
  });

  /** Achado 0436 — reescrita a descrição, o aviso sai: ela volta a valer. */
  it("tira o aviso quando o professor reescreve a descrição", () => {
    const { props, updateAttributes } = makeProps({ latex: "x^2", alt: "x ao quadrado" });
    render(<InlineMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("inlinemath-render"));
    fireEvent.change(screen.getByLabelText("Expressão LaTeX inline"), {
      target: { value: "y^3" },
    });
    fireEvent.change(screen.getByLabelText("Texto alternativo da fórmula inline"), {
      target: { value: "y ao cubo" },
    });

    expect(updateAttributes).toHaveBeenCalledWith({ alt: "y ao cubo" });
    expect(screen.queryByTestId("inlinemath-alt-stale")).not.toBeInTheDocument();
  });

  /** Achado 0436 — o alt só cai quando a fórmula muda de verdade. */
  it("mantém o alt quando o LaTeX commitado é o mesmo de antes", () => {
    const { props, updateAttributes } = makeProps({ latex: "x^2", alt: "x ao quadrado" });
    render(<InlineMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("inlinemath-render"));
    const input = screen.getByLabelText("Expressão LaTeX inline");

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.change(input, { target: { value: "x^2" } });

    expect(updateAttributes).toHaveBeenCalledWith({ latex: "x^2" });
    expect(screen.queryByTestId("inlinemath-alt-stale")).not.toBeInTheDocument();
  });
});

// Achado 0350: os quatro átomos são `atom: true, selectable: true` — o clique
// cria uma NodeSelection que o Backspace apaga inteira, e até então nada disso
// aparecia na folha (a única regra de seleção do CSS mirava uma classe morta).
describe("InlineMathNodeView — seleção do átomo (achado 0350)", () => {
  it("pinta o anel da folha quando o nó está selecionado", () => {
    const { props } = makeProps();
    const { container, rerender } = render(<InlineMathNodeView {...props} />);
    expect(container.querySelector('[data-testid="inlinemath-node"]')!.className).not.toMatch(/ring-2/);

    rerender(<InlineMathNodeView {...props} selected />);
    const wrapper = container.querySelector('[data-testid="inlinemath-node"]')!;
    expect(wrapper.className).toMatch(/ring-2/);
    expect(wrapper.className).toMatch(/ring-surface-accent/);
  });
});

// Achado 0416: o editor de fórmula era a única superfície transitória do
// Revisar sem saída por teclado — quem abria sem querer só saía no mouse.
describe("InlineMathNodeView — Escape fecha o editor (achado 0416)", () => {
  it("fecha o editor, segura o Escape e devolve o foco à fórmula", () => {
    const { props } = makeProps();
    render(<InlineMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("inlinemath-render"));

    // O Escape não pode subir: no Revisar ele fecha o wizard inteiro.
    const subiu = vi.fn();
    document.addEventListener("keydown", subiu);
    fireEvent.keyDown(screen.getByLabelText("Expressão LaTeX inline"), { key: "Escape" });
    document.removeEventListener("keydown", subiu);

    expect(screen.queryByLabelText("Expressão LaTeX inline")).not.toBeInTheDocument();
    expect(subiu).not.toHaveBeenCalled();
    expect(screen.getByTestId("inlinemath-render")).toHaveFocus();
  });

  it("ignora as demais teclas dentro do editor", () => {
    const { props } = makeProps();
    render(<InlineMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("inlinemath-render"));
    fireEvent.keyDown(screen.getByLabelText("Expressão LaTeX inline"), { key: "a" });
    expect(screen.getByLabelText("Expressão LaTeX inline")).toBeInTheDocument();
  });

  it("não leva o rascunho vazio embora ao sair por Escape", () => {
    const { props } = makeProps();
    render(<InlineMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("inlinemath-render"));
    fireEvent.change(screen.getByLabelText("Expressão LaTeX inline"), { target: { value: "" } });
    fireEvent.keyDown(screen.getByLabelText("Expressão LaTeX inline"), { key: "Escape" });

    fireEvent.click(screen.getByTestId("inlinemath-render"));
    expect((screen.getByLabelText("Expressão LaTeX inline") as HTMLInputElement).value).toBe("x^2");
  });

});

// Achado 0417: "Pronto" é o próprio elemento que some — sem devolver o foco ao
// gatilho o navegador o joga no BODY e quem edita pelo teclado perde a posição.
describe("InlineMathNodeView — Pronto devolve o foco à fórmula (achado 0417)", () => {
  it("foca o gatilho da fórmula ao fechar pelo Pronto", () => {
    const { props } = makeProps();
    render(<InlineMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("inlinemath-render"));
    fireEvent.click(screen.getByText("Pronto"));
    expect(screen.getByTestId("inlinemath-render")).toHaveFocus();
  });

  it("não foca a fórmula na primeira montagem, antes de qualquer edição", () => {
    const { props } = makeProps();
    render(<InlineMathNodeView {...props} />);
    expect(screen.getByTestId("inlinemath-render")).not.toHaveFocus();
  });
});

// Achado 0418: largura fixa (w-28 / w-32) cortava o valor dos campos — o alt,
// que é frase em português, era editado por uma janela de ~17 caracteres.
describe("InlineMathNodeView — campos acompanham o conteúdo (achado 0418)", () => {
  function widthInCh(el: HTMLElement) {
    const width = el.style.width;
    expect(width).toMatch(/ch$/);
    return Number.parseFloat(width);
  }

  it("dá ao alt longo largura suficiente para ler a frase inteira", () => {
    const alt = "x ao quadrado mais 2x mais 1 igual a zero";
    const { props } = makeProps({ latex: "x^2 + 2x + 1 = 0", alt });
    render(<InlineMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("inlinemath-render"));
    const field = screen.getByLabelText("Texto alternativo da fórmula inline");
    expect(field).not.toHaveClass("w-32");
    expect(widthInCh(field)).toBeGreaterThanOrEqual(alt.length);
  });

  it("dá ao LaTeX largura proporcional à expressão", () => {
    const latex = "\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}";
    const { props } = makeProps({ latex, alt: "x" });
    render(<InlineMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("inlinemath-render"));
    const field = screen.getByLabelText("Expressão LaTeX inline");
    expect(field).not.toHaveClass("w-28");
    expect(widthInCh(field)).toBeGreaterThanOrEqual(latex.length);
  });

  it("mantém um piso de largura com o campo vazio", () => {
    const { props } = makeProps({ latex: "x", alt: "" });
    render(<InlineMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("inlinemath-render"));
    expect(widthInCh(screen.getByLabelText("Texto alternativo da fórmula inline"))).toBeGreaterThanOrEqual(12);
  });

  it("mantém um teto de largura para não estourar a coluna de texto", () => {
    const { props } = makeProps({ latex: "x", alt: "a".repeat(300) });
    render(<InlineMathNodeView {...props} />);
    fireEvent.click(screen.getByTestId("inlinemath-render"));
    const field = screen.getByLabelText("Texto alternativo da fórmula inline");
    expect(widthInCh(field)).toBeLessThanOrEqual(48);
    expect(field).toHaveClass("max-w-full");
  });
});
