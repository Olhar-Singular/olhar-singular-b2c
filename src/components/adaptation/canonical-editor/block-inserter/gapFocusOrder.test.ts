import { describe, it, expect } from "vitest";
import { collectEditorStops, interleaveGapStops } from "./gapFocusOrder";

/*
  Achado 0274: o overlay de "+" é irmão do `EditorContent`, então na ordem do
  DOM todos os "+" vêm depois do documento inteiro. A ordem de tabulação desejada
  põe cada "+" no limite de bloco que ele representa.
*/

function el(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html.trim();
  return host.firstElementChild as HTMLElement;
}

describe("collectEditorStops", () => {
  it("pega a raiz editável, botões e editores aninhados, na ordem do DOM", () => {
    const root = el(`
      <div contenteditable="true" id="root">
        <p id="title">Título</p>
        <div id="q1" contenteditable="false">
          <button id="b1">Editar</button>
          <button id="off" tabindex="-1">fora</button>
          <button id="dis" disabled>desabilitado</button>
          <div id="rt" contenteditable="true"><p><span contenteditable="true" id="inner">x</span></p></div>
          <input id="in" />
        </div>
      </div>
    `);
    expect(collectEditorStops(root).map((e) => e.id)).toEqual(["root", "b1", "rt", "in"]);
  });
});

describe("interleaveGapStops", () => {
  const root = el(`
    <div contenteditable="true" id="root">
      <h1 id="blk0">T</h1>
      <div id="blk1" contenteditable="false"><button id="a1">a</button><button id="a2">b</button></div>
      <p id="blk2">p</p>
      <div id="blk3" contenteditable="false"><button id="c1">c</button></div>
    </div>
  `);
  const q = (id: string) => root.querySelector(`#${id}`) as HTMLElement;
  const plus = (n: number) => {
    const b = document.createElement("button");
    b.id = `plus${n}`;
    return b;
  };

  it("põe cada + antes do primeiro focável do bloco que vem depois dele", () => {
    const pluses = [0, 1, 2, 3, 4].map(plus);
    const anchors = [q("blk0"), q("blk1"), q("blk2"), q("blk3"), null];
    const order = interleaveGapStops(collectEditorStops(root), anchors, pluses);
    expect(order.map((e) => e.id)).toEqual([
      "root",
      "plus0",
      "plus1",
      "a1",
      "a2",
      "plus2",
      "plus3",
      "c1",
      "plus4",
    ]);
  });

  it("manda para o fim o + cuja âncora não existe no DOM", () => {
    const pluses = [0, 1].map(plus);
    const order = interleaveGapStops([q("a1")], [null, null], pluses);
    expect(order.map((e) => e.id)).toEqual(["a1", "plus0", "plus1"]);
  });
});
