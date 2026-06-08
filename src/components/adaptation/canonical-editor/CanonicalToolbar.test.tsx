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
  it("inserts image / math / scaffold / divider blocks via commands", () => {
    render(<CanonicalToolbar editor={makeEditor()} />);
    fireEvent.click(screen.getByTitle("Inserir imagem"));
    fireEvent.click(screen.getByTitle("Inserir fórmula"));
    fireEvent.click(screen.getByTitle("Inserir andaime"));
    fireEvent.click(screen.getByTitle("Inserir divisória"));
    const inserts = chain.calls.filter((c) => c === "insertContent");
    expect(inserts).toHaveLength(4);
  });

  it("renders the question insert dropdown trigger", () => {
    render(<CanonicalToolbar editor={makeEditor()} />);
    expect(screen.getByTitle("Inserir questão")).toBeInTheDocument();
  });

  it("does NOT render text-format buttons (they move to the Estilo step)", () => {
    render(<CanonicalToolbar editor={makeEditor()} />);
    expect(screen.queryByTitle("Negrito")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Itálico")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Sublinhado")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Tachado")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Cor do texto")).not.toBeInTheDocument();
  });

  it("disables insert buttons when disabled", () => {
    render(<CanonicalToolbar editor={makeEditor()} disabled />);
    expect(screen.getByTitle("Inserir imagem")).toBeDisabled();
  });

  it("exposes accessible names on icon-only buttons (a11y)", () => {
    render(<CanonicalToolbar editor={makeEditor()} />);
    // getByRole(name) matches the accessible name (aria-label), which screen
    // readers announce — `title` alone is not reliably announced.
    expect(screen.getByRole("button", { name: /inserir imagem/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /inserir fórmula/i })).toBeInTheDocument();
  });
});
