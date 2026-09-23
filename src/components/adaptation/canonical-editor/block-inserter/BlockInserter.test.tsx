import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import { getEditorSchema } from "@/lib/adaptation/tiptap/getEditorSchema";
import { canonicalToProseMirror } from "@/lib/adaptation/tiptap/fromCanonical";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import { BlockInserter } from "./BlockInserter";
import { runInserterAction } from "./insertAtPos";

vi.mock("./insertAtPos", () => ({ runInserterAction: vi.fn() }));

const schema = getEditorSchema();
const uid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const doc: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [
    { id: uid(1), type: "paragraph", content: [{ type: "text", text: "a" }] },
    { id: uid(2), type: "paragraph", content: [{ type: "text", text: "b" }] },
  ],
};
const pmDoc = PMNode.fromJSON(schema, canonicalToProseMirror(doc));

function makeEditor(tops: number[] = [10, 60, 110]) {
  let call = 0;
  const coordsAtPos = vi.fn(() => {
    const top = tops[Math.min(call++, tops.length - 1)];
    return { top, bottom: top + 2, left: 0, right: 0 };
  });
  const on = vi.fn();
  const off = vi.fn();
  const dom = document.createElement("div");
  const editor = {
    state: { doc: pmDoc },
    view: { coordsAtPos, dom },
    on,
    off,
  } as unknown as Editor;
  return { editor, coordsAtPos, on, off, dom };
}

/** Tops das faixas renderizadas, na ordem do DOM. */
function zoneTops(): string[] {
  return screen
    .getAllByRole("button", { name: "Inserir bloco" })
    .map((b) => (b.closest("[data-block-gap]") as HTMLElement).style.top);
}

beforeEach(() => {
  vi.mocked(runInserterAction).mockClear();
});

describe("BlockInserter", () => {
  it("renders one inserter per gap (blocks + 1 trailing)", () => {
    const { editor } = makeEditor();
    render(<BlockInserter editor={editor} />);
    // 2 blocks → 2 leading gaps + 1 trailing = 3
    expect(screen.getAllByRole("button", { name: "Inserir bloco" })).toHaveLength(3);
  });

  it("turns a pick into an editor action at the chosen gap", () => {
    const { editor } = makeEditor();
    render(<BlockInserter editor={editor} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Inserir bloco" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Parágrafo" }));
    expect(runInserterAction).toHaveBeenCalledTimes(1);
    const [calledEditor, gap, action] = vi.mocked(runInserterAction).mock.calls[0];
    expect(calledEditor).toBe(editor);
    expect(gap.index).toBe(0);
    expect(action.type).toBe("insert");
  });

  it("subscribes to editor transactions and cleans up on unmount", () => {
    const { editor, on, off } = makeEditor();
    const { unmount } = render(<BlockInserter editor={editor} />);
    expect(on).toHaveBeenCalledWith("transaction", expect.any(Function));
    unmount();
    expect(off).toHaveBeenCalledWith("transaction", expect.any(Function));
  });

  /*
    Achado 0247: NodeView React (question/image/blockMath) e <img> ganham altura
    depois do layout. Enquanto o bloco mede zero, `coordsAtPos` devolve o mesmo
    topo para a lacuna de cima e a de baixo (flattenH devolve o rect inalterado
    quando height == 0), e as faixas nasciam empilhadas no mesmo retângulo — a
    de baixo inalcançável por ponteiro.
  */
  it("nunca empilha duas faixas no mesmo ponto (achado 0247)", () => {
    // Todas as lacunas medem o mesmo topo: bloco ainda sem altura.
    const { editor } = makeEditor([120]);
    render(<BlockInserter editor={editor} />);
    const tops = zoneTops();
    expect(new Set(tops).size).toBe(tops.length);
  });

  it("remede as posições quando o conteúdo do editor muda de tamanho (achado 0247)", () => {
    const observers: { cb: () => void; targets: Element[] }[] = [];
    const original = global.ResizeObserver;
    global.ResizeObserver = class {
      targets: Element[] = [];
      constructor(public cb: () => void) {
        observers.push(this as unknown as { cb: () => void; targets: Element[] });
      }
      observe(target: Element) {
        this.targets.push(target);
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    try {
      const { editor, coordsAtPos, dom } = makeEditor();
      render(<BlockInserter editor={editor} />);
      const watcher = observers.find((o) => o.targets.includes(dom));
      expect(watcher).toBeDefined();
      const initial = coordsAtPos.mock.calls.length;
      act(() => watcher!.cb());
      expect(coordsAtPos.mock.calls.length).toBeGreaterThan(initial);
    } finally {
      global.ResizeObserver = original;
    }
  });

  /*
    Achado 0180: a faixa da lacuna ocupa a largura inteira da coluna de texto e
    fica centrada no topo do bloco seguinte, ou seja, por cima da primeira linha
    dele. Sendo `pointer-events-auto`, ela engolia o clique do professor (o foco
    caía no wrapper do passo e o que se digitava sumia). Só o alvo estreito do
    "+" pode capturar ponteiro; o resto da faixa é decoração.
  */
  it("não captura o clique na largura da faixa, só no alvo do + (achado 0180)", () => {
    const { editor } = makeEditor();
    render(<BlockInserter editor={editor} />);
    const trigger = screen.getAllByRole("button", { name: "Inserir bloco" })[0];
    const zone = trigger.closest("[data-block-gap]") as HTMLElement;
    expect(zone.className).toContain("pointer-events-none");
    expect(zone.className).not.toContain("pointer-events-auto");
    for (const line of Array.from(zone.querySelectorAll("span.flex-1"))) {
      expect(line.className).not.toContain("pointer-events-auto");
    }
    expect((trigger.parentElement as HTMLElement).className).toContain("pointer-events-auto");
  });

  /*
    Achado 0246: a folha inteira (overlay incluso) leva `transform: scale()`.
    `getBoundingClientRect` e `coordsAtPos` medem em coordenadas de VIEWPORT,
    ou seja, já multiplicadas pela escala; aplicar esse número como `top` de um
    filho do elemento escalado multiplica a escala outra vez e encolhe as faixas
    contra o topo da folha. O `top` gravado tem de ser de LAYOUT.
  */
  it("grava o top em coordenadas de layout quando a folha está escalada (achado 0246)", () => {
    const SCALE = 0.4181;
    const LAYOUT_WIDTH = 794;
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: 0,
      left: 0,
      right: LAYOUT_WIDTH * SCALE,
      bottom: 0,
      width: LAYOUT_WIDTH * SCALE,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    const width = vi
      .spyOn(HTMLElement.prototype, "offsetWidth", "get")
      .mockReturnValue(LAYOUT_WIDTH);
    try {
      // Lacunas a 0, 150 e 900 px de layout, medidas já escaladas pelo browser.
      const { editor } = makeEditor([0, 150 * SCALE, 900 * SCALE]);
      render(<BlockInserter editor={editor} />);
      expect(zoneTops().map((t) => Math.round(parseFloat(t)))).toEqual([0, 150, 900]);
    } finally {
      rect.mockRestore();
      width.mockRestore();
    }
  });

  /*
    Achado 0207: em ponteiro grosso (tablet/celular) não existe hover, então o
    "+" ficava em `opacity: 0` na tela inteira — presente no DOM e clicável, mas
    sem desenhar um pixel. O invólucro precisa de um gatilho que não dependa de
    hover.
  */
  it("revela o + onde não há hover (achado 0207)", () => {
    const { editor } = makeEditor();
    render(<BlockInserter editor={editor} />);
    const wrappers = screen
      .getAllByRole("button", { name: "Inserir bloco" })
      .map((b) => b.parentElement as HTMLElement);
    expect(wrappers).toHaveLength(3);
    for (const wrapper of wrappers) {
      expect(wrapper.className).toContain("[@media(hover:none)]:opacity-100");
    }
  });

  it("recomputes positions on window resize", () => {
    const { editor, coordsAtPos } = makeEditor();
    render(<BlockInserter editor={editor} />);
    const initial = coordsAtPos.mock.calls.length;
    fireEvent(window, new Event("resize"));
    expect(coordsAtPos.mock.calls.length).toBeGreaterThan(initial);
  });
});
