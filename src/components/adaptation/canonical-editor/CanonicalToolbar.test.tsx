import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { CanonicalToolbar } from "./CanonicalToolbar";

vi.mock("@tiptap/react", () => ({}));

function makeChain() {
  const calls: string[] = [];
  const proxy: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "run") return () => true;
        return (...args: unknown[]) => {
          calls.push(prop);
          if (prop === "insertContent") (calls as unknown as { lastInsert?: unknown }).lastInsert = args[0];
          return proxy;
        };
      },
    }
  );
  return { proxy, calls };
}

let chain: ReturnType<typeof makeChain>;
function makeEditor(active = false): Editor {
  return {
    chain: () => chain.proxy,
    isActive: () => active,
  } as unknown as Editor;
}

beforeEach(() => {
  chain = makeChain();
});

describe("CanonicalToolbar", () => {
  it("dispatches mark toggles", () => {
    render(<CanonicalToolbar editor={makeEditor()} />);
    fireEvent.click(screen.getByTitle("Negrito"));
    fireEvent.click(screen.getByTitle("Itálico"));
    fireEvent.click(screen.getByTitle("Sublinhado"));
    fireEvent.click(screen.getByTitle("Tachado"));
    expect(chain.calls).toEqual(
      expect.arrayContaining(["toggleBold", "toggleItalic", "toggleUnderline", "toggleStrike"])
    );
  });

  it("inserts image / math / scaffold / divider blocks via commands", () => {
    render(<CanonicalToolbar editor={makeEditor()} />);
    fireEvent.click(screen.getByTitle("Inserir imagem"));
    fireEvent.click(screen.getByTitle("Inserir fórmula"));
    fireEvent.click(screen.getByTitle("Inserir andaime"));
    fireEvent.click(screen.getByTitle("Inserir divisória"));
    const inserts = chain.calls.filter((c) => c === "insertContent");
    expect(inserts).toHaveLength(4);
  });

  it("shows the active state on toggle buttons", () => {
    render(<CanonicalToolbar editor={makeEditor(true)} />);
    expect(screen.getByTitle("Negrito").className).toContain("accent");
  });

  it("renders the question and color dropdown triggers", () => {
    render(<CanonicalToolbar editor={makeEditor()} />);
    expect(screen.getByTitle("Inserir questão")).toBeInTheDocument();
    expect(screen.getByTitle("Cor do texto")).toBeInTheDocument();
  });

  it("disables buttons when disabled", () => {
    render(<CanonicalToolbar editor={makeEditor()} disabled />);
    expect(screen.getByTitle("Negrito")).toBeDisabled();
  });
});
