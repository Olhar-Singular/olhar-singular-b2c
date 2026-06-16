import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { SelectionBubble } from "./SelectionBubble";
import { TEXT_COLORS } from "@/lib/adaptation/canonical/colors";

/**
 * Fake editor recording chain ops and answering isActive deterministically.
 * `active` drives mark toggles; `color` drives the textStyle color highlight.
 */
function makeEditor(opts: { active?: Record<string, boolean>; color?: string } = {}) {
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
});
