import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { SelectionBubble } from "./SelectionBubble";
import { TEXT_COLORS } from "@/lib/adaptation/canonical/colors";

/**
 * Fake editor recording chain ops and answering isActive / getAttributes
 * deterministically.
 */
function makeEditor(opts: { active?: Record<string, boolean>; color?: string; fontSize?: string } = {}) {
  const ops: { name: string; args: unknown[] }[] = [];
  const chain: Record<string, (...a: unknown[]) => unknown> = {};
  for (const m of [
    "focus",
    "toggleBold",
    "toggleItalic",
    "toggleUnderline",
    "toggleStrike",
    "setColor",
    "unsetColor",
    "setFontSize",
    "run",
  ]) {
    chain[m] = (...args: unknown[]) => {
      ops.push({ name: m, args });
      return chain;
    };
  }
  const editor = {
    chain: () => chain,
    isActive: (name: string, attrs?: { color?: string }) =>
      name === "textStyle" ? attrs?.color === opts.color : !!opts.active?.[name],
    getAttributes: (name: string) =>
      name === "textStyle" ? { fontSize: opts.fontSize } : {},
    ops,
  };
  return editor as unknown as Editor & { ops: typeof ops };
}

describe("SelectionBubble", () => {
  it("aplica negrito/itálico/sublinhado/tachado pela cadeia do editor", () => {
    const editor = makeEditor();
    render(<SelectionBubble editor={editor} />);

    fireEvent.click(screen.getByRole("button", { name: "Negrito" }));
    fireEvent.click(screen.getByRole("button", { name: "Itálico" }));
    fireEvent.click(screen.getByRole("button", { name: "Sublinhado" }));
    fireEvent.click(screen.getByRole("button", { name: "Tachado" }));

    const ops = (editor as unknown as { ops: { name: string }[] }).ops.map((o) => o.name);
    expect(ops).toContain("toggleBold");
    expect(ops).toContain("toggleItalic");
    expect(ops).toContain("toggleUnderline");
    expect(ops).toContain("toggleStrike");
  });

  it("aplica uma cor da allowlist via setColor com o hex correto", () => {
    const editor = makeEditor();
    render(<SelectionBubble editor={editor} />);

    fireEvent.click(screen.getByRole("button", { name: `Cor ${TEXT_COLORS[0]}` }));

    const setColor = (editor as unknown as { ops: { name: string; args: unknown[] }[] }).ops.find(
      (o) => o.name === "setColor",
    );
    expect(setColor?.args).toEqual([TEXT_COLORS[0]]);
  });

  it("remove a cor via unsetColor", () => {
    const editor = makeEditor();
    render(<SelectionBubble editor={editor} />);

    fireEvent.click(screen.getByRole("button", { name: "Remover cor" }));

    const ops = (editor as unknown as { ops: { name: string }[] }).ops.map((o) => o.name);
    expect(ops).toContain("unsetColor");
  });

  it("reflete o estado ativo em aria-pressed (marca e cor)", () => {
    const editor = makeEditor({ active: { bold: true }, color: TEXT_COLORS[0] });
    render(<SelectionBubble editor={editor} />);

    expect(screen.getByRole("button", { name: "Negrito" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Itálico" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: `Cor ${TEXT_COLORS[0]}` })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: `Cor ${TEXT_COLORS[1]}` })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("oferece um swatch para cada cor da allowlist de texto", () => {
    const editor = makeEditor();
    render(<SelectionBubble editor={editor} />);
    for (const color of TEXT_COLORS) {
      expect(screen.getByRole("button", { name: `Cor ${color}` })).toBeInTheDocument();
    }
  });

  /**
   * Regressão (caça 0210): as amostras de cor eram o próprio disco de 20x20
   * (`h-5 w-5`) com 2 px de gap — abaixo do mínimo de 24x24 do WCAG 2.2 SC 2.5.8
   * e sem direito à exceção de espaçamento (centros a 22 px). O disco continua
   * com 20 px, mas como decoração dentro de um botão de 28x28.
   */
  describe("alvo de toque das amostras de cor (caça 0210)", () => {
    it("cada amostra tem pelo menos 24x24 de área tocável", () => {
      render(<SelectionBubble editor={makeEditor()} />);
      for (const color of TEXT_COLORS) {
        const btn = screen.getByRole("button", { name: `Cor ${color}` });
        expect(btn.className).toMatch(/(^|\s)h-7(\s|$)/);
        expect(btn.className).toMatch(/(^|\s)w-7(\s|$)/);
        expect(btn.className).not.toMatch(/(^|\s)[hw]-5(\s|$)/);
      }
    });

    it("mantém o disco de cor em 20 px como decoração interna", () => {
      render(<SelectionBubble editor={makeEditor()} />);
      const btn = screen.getByRole("button", { name: `Cor ${TEXT_COLORS[0]}` });
      const disc = btn.querySelector("span");
      expect(disc).not.toBeNull();
      expect(disc).toHaveStyle({ backgroundColor: TEXT_COLORS[0] });
      expect(disc?.className).toMatch(/(^|\s)h-5(\s|$)/);
      expect(disc?.className).toMatch(/(^|\s)w-5(\s|$)/);
    });

    it("a barra quebra em linhas em vez de estourar telas estreitas", () => {
      render(<SelectionBubble editor={makeEditor()} />);
      expect(screen.getByRole("toolbar").className).toMatch(/(^|\s)flex-wrap(\s|$)/);
    });
  });

  // --- Fonte por seleção (A+ / A-) ---

  it("aumenta o tamanho de fonte via setFontSize (+1px)", () => {
    const editor = makeEditor({ fontSize: "16px" });
    render(<SelectionBubble editor={editor} />);
    fireEvent.click(screen.getByRole("button", { name: "Aumentar fonte" }));
    const call = editor.ops.find((o) => o.name === "setFontSize");
    expect(call?.args[0]).toBe("17px");
  });

  it("diminui o tamanho de fonte via setFontSize (-1px)", () => {
    const editor = makeEditor({ fontSize: "16px" });
    render(<SelectionBubble editor={editor} />);
    fireEvent.click(screen.getByRole("button", { name: "Diminuir fonte" }));
    const call = editor.ops.find((o) => o.name === "setFontSize");
    expect(call?.args[0]).toBe("15px");
  });

  it("usa 16px como base quando não há fontSize explícita na seleção", () => {
    const editor = makeEditor(); // no fontSize
    render(<SelectionBubble editor={editor} />);
    fireEvent.click(screen.getByRole("button", { name: "Aumentar fonte" }));
    const call = editor.ops.find((o) => o.name === "setFontSize");
    expect(call?.args[0]).toBe("17px");
  });

  it("respeita o limite mínimo (8px) ao diminuir", () => {
    const editor = makeEditor({ fontSize: "8px" });
    render(<SelectionBubble editor={editor} />);
    fireEvent.click(screen.getByRole("button", { name: "Diminuir fonte" }));
    const call = editor.ops.find((o) => o.name === "setFontSize");
    expect(call?.args[0]).toBe("8px");
  });

  it("respeita o limite máximo (72px) ao aumentar", () => {
    const editor = makeEditor({ fontSize: "72px" });
    render(<SelectionBubble editor={editor} />);
    fireEvent.click(screen.getByRole("button", { name: "Aumentar fonte" }));
    const call = editor.ops.find((o) => o.name === "setFontSize");
    expect(call?.args[0]).toBe("72px");
  });

  it("arredonda fontSize fracionário antes de somar (18.67px → 19, A+ → 20px)", () => {
    const editor = makeEditor({ fontSize: "18.67px" });
    render(<SelectionBubble editor={editor} />);
    fireEvent.click(screen.getByRole("button", { name: "Aumentar fonte" }));
    const call = editor.ops.find((o) => o.name === "setFontSize");
    expect(call?.args[0]).toBe("20px");
  });

  /**
   * Regressão (caça 0208): a barra era a única superfície de formatação de trecho
   * e não tinha caminho de teclado — sem `role="toolbar"`, sem roving tabindex e
   * sem volta para o editor. Cor e tamanho de fonte, que não têm atalho no Tiptap,
   * ficavam inalcançáveis sem mouse (WCAG 2.2 SC 2.1.1).
   */
  describe("caminho de teclado (caça 0208)", () => {
    const controls = () =>
      Array.from(global.document.querySelectorAll<HTMLElement>("[data-toolbar-control]"));

    it("expõe a barra como toolbar nomeada", () => {
      render(<SelectionBubble editor={makeEditor()} />);
      const toolbar = screen.getByRole("toolbar", { name: "Formatação do trecho selecionado" });
      expect(toolbar).toHaveAttribute("aria-orientation", "horizontal");
    });

    it("roving tabindex: só o primeiro controle é tabulável", () => {
      render(<SelectionBubble editor={makeEditor()} />);
      const items = controls();
      expect(items.length).toBe(4 + 2 + TEXT_COLORS.length + 1);
      expect(items[0]).toHaveAttribute("tabindex", "0");
      for (const item of items.slice(1)) expect(item).toHaveAttribute("tabindex", "-1");
    });

    it("seta para a direita move o foco para o próximo controle", () => {
      render(<SelectionBubble editor={makeEditor()} />);
      const toolbar = screen.getByRole("toolbar");
      const items = controls();
      items[0].focus();
      fireEvent.keyDown(toolbar, { key: "ArrowRight" });
      expect(global.document.activeElement).toBe(items[1]);
      expect(items[1]).toHaveAttribute("tabindex", "0");
      expect(items[0]).toHaveAttribute("tabindex", "-1");
    });

    it("seta para a esquerda a partir do primeiro dá a volta para o último", () => {
      render(<SelectionBubble editor={makeEditor()} />);
      const toolbar = screen.getByRole("toolbar");
      const items = controls();
      items[0].focus();
      fireEvent.keyDown(toolbar, { key: "ArrowLeft" });
      expect(global.document.activeElement).toBe(items[items.length - 1]);
    });

    it("seta para a direita a partir do último dá a volta para o primeiro", () => {
      render(<SelectionBubble editor={makeEditor()} />);
      const toolbar = screen.getByRole("toolbar");
      const items = controls();
      items[items.length - 1].focus();
      fireEvent.keyDown(toolbar, { key: "ArrowRight" });
      expect(global.document.activeElement).toBe(items[0]);
    });

    it("Home e End vão para as pontas", () => {
      render(<SelectionBubble editor={makeEditor()} />);
      const toolbar = screen.getByRole("toolbar");
      const items = controls();
      items[2].focus();
      fireEvent.keyDown(toolbar, { key: "End" });
      expect(global.document.activeElement).toBe(items[items.length - 1]);
      fireEvent.keyDown(toolbar, { key: "Home" });
      expect(global.document.activeElement).toBe(items[0]);
    });

    it("sem foco em nenhum controle, a seta parte do controle ativo", () => {
      render(<SelectionBubble editor={makeEditor()} />);
      const toolbar = screen.getByRole("toolbar");
      const items = controls();
      // Foco fora da barra: o índice ativo (0) é a base.
      fireEvent.keyDown(toolbar, { key: "ArrowRight" });
      expect(global.document.activeElement).toBe(items[1]);
    });

    it("Escape devolve o foco ao editor", () => {
      const editor = makeEditor();
      render(<SelectionBubble editor={editor} />);
      fireEvent.keyDown(screen.getByRole("toolbar"), { key: "Escape" });
      expect(editor.ops.map((o) => o.name)).toContain("focus");
    });

    it("ignora teclas que não são de navegação", () => {
      render(<SelectionBubble editor={makeEditor()} />);
      const toolbar = screen.getByRole("toolbar");
      const items = controls();
      items[0].focus();
      fireEvent.keyDown(toolbar, { key: "a" });
      expect(global.document.activeElement).toBe(items[0]);
    });
  });
});
