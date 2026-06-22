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
});
