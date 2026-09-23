import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { NodeViewProps } from "@tiptap/react";
import { ScaffoldNodeView } from "./ScaffoldNodeView";
import { DEFAULT_INK } from "@/components/adaptation/render/pageTokens";

vi.mock("@tiptap/react", () => ({
  NodeViewWrapper: ({ children, ...rest }: { children: React.ReactNode }) => <div {...rest}>{children}</div>,
}));

function makeProps(items: string[], editable = true) {
  const updateAttributes = vi.fn();
  const deleteNode = vi.fn();
  const props = {
    node: { attrs: { items } },
    updateAttributes,
    deleteNode,
    editor: { isEditable: editable },
  } as unknown as NodeViewProps;
  return { props, updateAttributes, deleteNode };
}

beforeEach(() => vi.clearAllMocks());

describe("ScaffoldNodeView", () => {
  it("edits, removes and adds steps", () => {
    const { props, updateAttributes } = makeProps(["a", "b"]);
    render(<ScaffoldNodeView {...props} />);
    fireEvent.change(screen.getByLabelText("Passo 1"), { target: { value: "A" } });
    fireEvent.click(screen.getAllByTitle("Remover passo")[0]);
    fireEvent.click(screen.getByText("Passo"));
    expect(updateAttributes).toHaveBeenCalledWith({ items: ["A", "b"] });
    expect(updateAttributes).toHaveBeenCalledWith({ items: ["b"] });
    expect(updateAttributes).toHaveBeenCalledWith({ items: ["a", "b", ""] });
  });


  // Achado 0312: cada passo é um campo; sem `id` distinto por passo não há
  // identidade de campo nem âncora de rótulo, e o ordinal impresso ao lado
  // ("1.") não leva o clique para o campo.
  it("dá a cada passo um id próprio e um name (achado 0312)", () => {
    const { props } = makeProps(["a", "b"]);
    render(<ScaffoldNodeView {...props} />);
    const first = screen.getByLabelText("Passo 1") as HTMLInputElement;
    const second = screen.getByLabelText("Passo 2") as HTMLInputElement;
    expect(first.id).not.toBe("");
    expect(first.id).not.toBe(second.id);
    expect(first.getAttribute("name")).toBe("scaffold-step");
  });

  it("disables inputs when not editable", () => {
    const { props } = makeProps(["a"], false);
    render(<ScaffoldNodeView {...props} />);
    expect(screen.getByLabelText("Passo 1")).toBeDisabled();
  });

  // "Andaime" is the pedagogical jargon for this block; the teacher reading
  // the sheet needs a word that says what it does. Since 0155 the label is
  // document text, not editor chrome: ScaffoldingView and PdfScaffolding print
  // the same SCAFFOLDING_LABEL on top of the box, so the student's exam gets a
  // named support box instead of an anonymous beige rectangle.
  it("labels the block 'Apoio', not the jargon", () => {
    const { props } = makeProps(["a"]);
    render(<ScaffoldNodeView {...props} />);
    expect(screen.getByText("Apoio")).toBeInTheDocument();
    expect(screen.queryByText(/andaime/i)).not.toBeInTheDocument();
  });

  /*
    Achado 0236: o andaime e desenhado dentro do `transform: scale()` da folha,
    entao os 24px declarados da lixeira chegam ao dedo com 18px (ou menos, no
    piso do ajuste) — abaixo dos 24x24 CSS px do WCAG 2.2 SC 2.5.8.
  */
  it("da aos controles um alvo de toque que sobrevive a escala da folha (achado 0236)", () => {
    const { props } = makeProps(["a"]);
    render(<ScaffoldNodeView {...props} />);
    expect(screen.getByRole("button", { name: "Excluir apoio" }).className).toMatch(
      /(^|\s)folha-touch-target(\s|$)/,
    );
    expect(screen.getByRole("button", { name: "Remover passo 1" }).className).toMatch(
      /(^|\s)folha-touch-target(\s|$)/,
    );
  });

  it("calls deleteNode when the delete button is clicked", () => {
    const { props, deleteNode } = makeProps(["a"]);
    render(<ScaffoldNodeView {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Excluir apoio" }));
    expect(deleteNode).toHaveBeenCalledTimes(1);
  });

  // Achado 0253: o botão sai do DOM junto com o nó; sem devolver o foco à
  // folha, o navegador o larga no <body> e o teclado perde a posição.
  it("devolve o foco à folha depois de excluir o apoio (achado 0253)", () => {
    const { props } = makeProps(["a"]);
    const focus = vi.fn();
    (props.editor as unknown as { commands: unknown; state: unknown }).commands = { focus };
    (props.editor as unknown as { state: unknown }).state = { doc: { content: { size: 50 } } };
    (props as unknown as { getPos: () => number }).getPos = () => 12;
    render(<ScaffoldNodeView {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Excluir apoio" }));
    expect(focus).toHaveBeenCalledWith(12);
  });

  it("disables the delete button when not editable", () => {
    const { props } = makeProps(["a"], false);
    render(<ScaffoldNodeView {...props} />);
    expect(screen.getByRole("button", { name: "Excluir apoio" })).toBeDisabled();
  });
});

// O rótulo e os ordinais dos passos são texto do DOCUMENTO desde o 0155 (as
// duas superfícies impressas os desenham na tinta do corpo). Na folha do
// Revisar eles ainda saíam no token de chrome apagado `--sf-ink-faint`
// (rgb(171,165,155), 2,21:1 sobre o bege da caixa, abaixo dos 4,5:1 da WCAG
// 1.4.3): o professor decidia se o andaime tem destaque olhando um rótulo que
// quase não se lê, e o aluno recebia um título cheio (achado 0160).
describe("ScaffoldNodeView — tinta do documento no que é impresso", () => {
  /** `DEFAULT_INK` em hex; o jsdom normaliza `style.color` para `rgb(...)`. */
  const inkAsRgb = (() => {
    const probe = document.createElement("div");
    probe.style.color = DEFAULT_INK;
    return probe.style.color;
  })();

  it("pinta o rótulo com a tinta do corpo, não com o chrome apagado", () => {
    const { props } = makeProps(["a"]);
    render(<ScaffoldNodeView {...props} />);
    const label = screen.getByTestId("scaffold-label");
    expect(label.style.color).toBe(inkAsRgb);
    expect(label.className).not.toMatch(/ink-faint/);
  });

  it("pinta o ordinal do passo na tinta e no tamanho do documento", () => {
    const { props } = makeProps(["a", "b"]);
    render(<ScaffoldNodeView {...props} />);
    const ordinal = screen.getByTestId("scaffold-step-ordinal-0");
    expect(ordinal).toHaveTextContent("1.");
    expect(ordinal.style.color).toBe(inkAsRgb);
    expect(ordinal.className).not.toMatch(/ink-faint/);
    expect(ordinal.className).not.toMatch(/text-xs/);
  });
  /*
    0172/0113 — a marca `data-folha-chrome` existe para a folha descontar da
    altura medida uma faixa VERTICAL de chrome. Desde o 0113 o "+ Passo" e a
    lixeira do bloco vivem no rail flutuante: não há faixa para descontar, e
    marcar mesmo assim encolheria o papel abaixo do que o arquivo tem.
  */
  it("não marca nada como faixa de chrome, porque nenhuma sobrou no fluxo (0113)", () => {
    const { props } = makeProps(["a", "b"]);
    const { container } = render(<ScaffoldNodeView {...props} />);
    expect(container.querySelectorAll("[data-folha-chrome]")).toHaveLength(0);
    expect(screen.getByTestId("scaffold-label").closest(".folha-rail")).toBeNull();
    expect(screen.getByTestId("scaffold-step-ordinal-0").closest(".folha-rail")).toBeNull();
  });
});

// Achado 0350: os quatro átomos são `atom: true, selectable: true` — o clique
// cria uma NodeSelection que o Backspace apaga inteira, e até então nada disso
// aparecia na folha (a única regra de seleção do CSS mirava uma classe morta).
describe("ScaffoldNodeView — seleção do átomo (achado 0350)", () => {
  it("pinta o anel da folha quando o nó está selecionado", () => {
    const { props } = makeProps(["a"]);
    const { container, rerender } = render(<ScaffoldNodeView {...props} />);
    expect(container.querySelector('[data-testid="scaffold-node"]')!.className).not.toMatch(/ring-2/);

    rerender(<ScaffoldNodeView {...props} selected />);
    const wrapper = container.querySelector('[data-testid="scaffold-node"]')!;
    expect(wrapper.className).toMatch(/ring-2/);
    expect(wrapper.className).toMatch(/ring-surface-accent/);
  });
});

/*
  0113 — o cartão do andaime media 212px no Revisar contra 101px impressos: a
  diferença era chrome empilhado no fluxo (a lixeira do bloco na faixa do
  rótulo, o "+ Passo" numa faixa própria) mais a altura de input do app em cada
  passo (`h-10` + `py-2` do shadcn contra uma linha de lista impressa). O
  chrome vai para o rail flutuante, como na questão e na fórmula, e o campo do
  passo passa a medir a linha que imprime.
*/
describe("ScaffoldNodeView — chrome de edição fora do fluxo da folha (0113)", () => {
  it("leva a lixeira do bloco e o '+ Passo' para o rail flutuante", () => {
    const { props } = makeProps(["a", "b"]);
    const { container } = render(<ScaffoldNodeView {...props} />);
    const rail = container.querySelector<HTMLElement>(".folha-rail");
    expect(rail).not.toBeNull();
    expect(rail!.className).toMatch(/absolute/);
    expect(screen.getByRole("button", { name: "Excluir apoio" }).closest(".folha-rail")).toBe(rail);
    expect(screen.getByText("Passo").closest(".folha-rail")).toBe(rail);
  });

  it("não deixa nenhuma faixa de chrome no fluxo do papel", () => {
    const { props } = makeProps(["a", "b"]);
    const { container } = render(<ScaffoldNodeView {...props} />);
    expect(container.querySelectorAll("[data-folha-chrome]")).toHaveLength(0);
  });

  it("o campo do passo não carrega a altura de input do app", () => {
    const { props } = makeProps(["a"]);
    render(<ScaffoldNodeView {...props} />);
    const campo = screen.getByLabelText("Passo 1");
    expect(campo.className).toMatch(/h-auto/);
    expect(campo.className).toMatch(/py-0/);
  });

  it("hospeda o rail no wrapper, que continua medindo o vão de sempre", () => {
    const { props } = makeProps(["a"]);
    const { getByTestId } = render(<ScaffoldNodeView {...props} />);
    expect(getByTestId("scaffold-node").className).toMatch(/relative/);
    expect(getByTestId("scaffold-node").className).toMatch(/my-3/);
  });
});
