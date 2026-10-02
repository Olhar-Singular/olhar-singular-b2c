import { describe, it, expect, vi, onTestFinished } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { AppearanceControls, AppearancePopover, resolveFormatPlacement } from "./AppearancePopover";
import type { ResolvedPageStyle } from "@/components/adaptation/render/pageStyle";

const value: ResolvedPageStyle = { fontFamily: undefined, fontSize: 12, blockSpacing: 16 };

function setupControls(over: Partial<ResolvedPageStyle> = {}) {
  const onChange = vi.fn();
  render(<AppearanceControls value={{ ...value, ...over }} onChange={onChange} />);
  return { onChange };
}

describe("AppearanceControls", () => {
  it("renderiza os grupos de fonte (Acessibilidade / Clássicas) e a opção Padrão", () => {
    setupControls();
    expect(screen.getByRole("group", { name: "Acessibilidade" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Clássicas" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Padrão" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Lexend" })).toBeInTheDocument();
  });

  it("seleciona 'Padrão' quando não há fontFamily", () => {
    setupControls();
    const select = screen.getByLabelText("Fonte") as HTMLSelectElement;
    expect(select.value).toBe("");
  });

  it("reflete a fontFamily atual quando definida", () => {
    setupControls({ fontFamily: "atkinson" });
    const select = screen.getByLabelText("Fonte") as HTMLSelectElement;
    expect(select.value).toBe("atkinson");
  });

  it("emite a fontFamily escolhida", () => {
    const { onChange } = setupControls();
    fireEvent.change(screen.getByLabelText("Fonte"), { target: { value: "lexend" } });
    expect(onChange).toHaveBeenCalledWith({ fontFamily: "lexend" });
  });

  it("emite fontFamily undefined ao voltar para 'Padrão'", () => {
    const { onChange } = setupControls({ fontFamily: "lexend" });
    fireEvent.change(screen.getByLabelText("Fonte"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith({ fontFamily: undefined });
  });

  it("mostra o tamanho do texto em px (12pt → 16px)", () => {
    setupControls();
    expect(screen.getByTestId("font-size-value").textContent).toBe("16px");
  });

  it("aumenta e diminui o tamanho do texto (px→pt no onChange)", () => {
    const { onChange } = setupControls();
    fireEvent.click(screen.getByRole("button", { name: "Aumentar tamanho do texto" }));
    expect(onChange).toHaveBeenCalledWith({ fontSize: 17 * 0.75 }); // 17px → pt
    onChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Diminuir tamanho do texto" }));
    expect(onChange).toHaveBeenCalledWith({ fontSize: 15 * 0.75 });
  });

  it("respeita o limite máximo do tamanho do texto (28px)", () => {
    const { onChange } = setupControls({ fontSize: 28 * 0.75 });
    fireEvent.click(screen.getByRole("button", { name: "Aumentar tamanho do texto" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("respeita o limite mínimo do tamanho do texto (11px)", () => {
    const { onChange } = setupControls({ fontSize: 11 * 0.75 });
    fireEvent.click(screen.getByRole("button", { name: "Diminuir tamanho do texto" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("mostra o espaçamento entre blocos em px", () => {
    setupControls({ blockSpacing: 24 });
    expect(screen.getByTestId("block-spacing-value").textContent).toBe("24px");
  });

  it("aumenta e diminui o espaçamento entre blocos (passo 2px)", () => {
    const { onChange } = setupControls({ blockSpacing: 16 });
    fireEvent.click(screen.getByRole("button", { name: "Aumentar espaçamento entre blocos" }));
    expect(onChange).toHaveBeenCalledWith({ blockSpacing: 18 });
    onChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Diminuir espaçamento entre blocos" }));
    expect(onChange).toHaveBeenCalledWith({ blockSpacing: 14 });
  });

  it("respeita o limite máximo do espaçamento (40px)", () => {
    const { onChange } = setupControls({ blockSpacing: 40 });
    fireEvent.click(screen.getByRole("button", { name: "Aumentar espaçamento entre blocos" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("respeita o limite mínimo do espaçamento (8px)", () => {
    const { onChange } = setupControls({ blockSpacing: 8 });
    fireEvent.click(screen.getByRole("button", { name: "Diminuir espaçamento entre blocos" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("desabilita apenas o '+' do tamanho do texto no teto (28px)", () => {
    setupControls({ fontSize: 28 * 0.75 });
    expect(screen.getByRole("button", { name: "Aumentar tamanho do texto" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Diminuir tamanho do texto" })).toBeEnabled();
  });

  it("desabilita apenas o '−' do tamanho do texto no piso (11px)", () => {
    setupControls({ fontSize: 11 * 0.75 });
    expect(screen.getByRole("button", { name: "Diminuir tamanho do texto" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Aumentar tamanho do texto" })).toBeEnabled();
  });

  it("desabilita apenas o '+' do espaçamento no teto (40px)", () => {
    setupControls({ blockSpacing: 40 });
    expect(screen.getByRole("button", { name: "Aumentar espaçamento entre blocos" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Diminuir espaçamento entre blocos" })).toBeEnabled();
  });

  it("desabilita apenas o '−' do espaçamento no piso (8px)", () => {
    setupControls({ blockSpacing: 8 });
    expect(screen.getByRole("button", { name: "Diminuir espaçamento entre blocos" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Aumentar espaçamento entre blocos" })).toBeEnabled();
  });

  it("mantém os dois botões habilitados dentro dos limites", () => {
    setupControls();
    expect(screen.getByRole("button", { name: "Aumentar tamanho do texto" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Diminuir tamanho do texto" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Aumentar espaçamento entre blocos" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Diminuir espaçamento entre blocos" })).toBeEnabled();
  });

  it("exibe a microcopy sobre as fontes de acessibilidade", () => {
    setupControls();
    expect(screen.getByText(/acessibilidade/i)).toBeInTheDocument();
  });

  it("não exibe a seção 'Tamanho por elemento'", () => {
    setupControls();
    expect(screen.queryByText(/tamanho por elemento/i)).not.toBeInTheDocument();
  });

  it("anuncia o valor do tamanho do texto: região viva identificada e ligada aos botões", () => {
    setupControls();
    const valueEl = screen.getByTestId("font-size-value");
    expect(valueEl.id).toBe("font-size-value");
    expect(valueEl).toHaveAttribute("aria-live", "polite");
    expect(valueEl).toHaveAttribute("aria-atomic", "true");
    // Achado 0203: o valor continua sendo descrito, agora acompanhado da ajuda.
    expect(screen.getByRole("button", { name: "Aumentar tamanho do texto" })).toHaveAttribute(
      "aria-describedby",
      "font-size-value font-size-help",
    );
    expect(screen.getByRole("button", { name: "Diminuir tamanho do texto" })).toHaveAttribute(
      "aria-describedby",
      "font-size-value font-size-help",
    );
  });

  it("anuncia o valor do espaçamento: região viva identificada e ligada aos botões", () => {
    setupControls();
    const valueEl = screen.getByTestId("block-spacing-value");
    expect(valueEl.id).toBe("block-spacing-value");
    expect(valueEl).toHaveAttribute("aria-live", "polite");
    expect(valueEl).toHaveAttribute("aria-atomic", "true");
    expect(screen.getByRole("button", { name: "Aumentar espaçamento entre blocos" })).toHaveAttribute(
      "aria-describedby",
      "block-spacing-value",
    );
    expect(screen.getByRole("button", { name: "Diminuir espaçamento entre blocos" })).toHaveAttribute(
      "aria-describedby",
      "block-spacing-value",
    );
  });

  it("exibe aviso de que o tamanho afeta toda a prova", () => {
    setupControls();
    expect(screen.getByText(/toda a prova/i)).toBeInTheDocument();
  });

  /*
    Achado 0203: a ajuda sobre as fontes de acessibilidade ficava no rodapé do
    popover, dois controles abaixo do select que ela descreve (colada em
    "Espaçamento entre blocos"), e nenhum dos textos de ajuda estava ligado ao
    controle por `aria-describedby` — leitor de tela ouvia só "Fonte, caixa de
    combinação".
  */
  it("ancora a ajuda das fontes logo abaixo do select Fonte e a liga por aria-describedby", () => {
    setupControls();
    const select = screen.getByLabelText("Fonte");
    const help = screen.getByText(/fontes de acessibilidade/i);
    expect(select.nextElementSibling).toBe(help);
    expect(help.id).toBe("appearance-font-help");
    expect(select).toHaveAttribute("aria-describedby", "appearance-font-help");
  });

  it("liga a ajuda do tamanho aos botões do stepper por aria-describedby", () => {
    setupControls();
    const help = screen.getByText(/toda a prova/i);
    expect(help.id).toBe("font-size-help");
    expect(screen.getByRole("button", { name: "Aumentar tamanho do texto" })).toHaveAttribute(
      "aria-describedby",
      "font-size-value font-size-help",
    );
    expect(screen.getByRole("button", { name: "Diminuir tamanho do texto" })).toHaveAttribute(
      "aria-describedby",
      "font-size-value font-size-help",
    );
  });
});

describe("AppearancePopover", () => {
  it("abre o popover pelo botão Formato e mostra os controles", () => {
    const onChange = vi.fn();
    render(<AppearancePopover value={value} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /formato/i }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Fonte")).toBeInTheDocument();
  });

  /*
    Achado 0159 (corrige o 0152): ancorado no embrulho da mesa e aberto à
    esquerda, o painel caía à esquerda DA MESA, isto é, sobre a sidebar do app
    (1920) ou fora da janela (1366, x = -44). O jsdom não posiciona o popper,
    então o que se trava é a decisão: qual elemento ancora (a folha, nunca o
    embrulho) e qual lado, em função do vão medido entre a folha e a mesa.
  */
  it("sem superfície informada, abre abaixo do gatilho alinhado ao fim (achado 0159)", () => {
    render(<AppearancePopover value={value} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /formato/i }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-side", "bottom");
    expect(dialog).toHaveAttribute("data-align", "end");
    expect(dialog).toHaveAttribute("data-format-anchor", "trigger");
  });

  function mountSurface(rects: { mesa: [number, number]; sheet: [number, number] }) {
    const surface = document.createElement("div");
    const mesa = document.createElement("div");
    mesa.setAttribute("data-testid", "page-mesa");
    const sheet = document.createElement("div");
    sheet.setAttribute("data-testid", "page-sheet");
    mesa.appendChild(sheet);
    surface.appendChild(mesa);
    document.body.appendChild(surface);
    const rect = ([left, right]: [number, number]) =>
      ({ left, right, top: 0, bottom: 100, width: right - left, height: 100, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
    mesa.getBoundingClientRect = () => rect(rects.mesa);
    sheet.getBoundingClientRect = () => rect(rects.sheet);
    return { anchorRef: { current: surface }, sheet };
  }

  it("ancora na folha, não no embrulho da mesa, e abre no vão que comporta o painel (achado 0159)", () => {
    // 1920: mesa 513–1904, folha 676–1470 → vão esquerdo 163 (não cabe), direito 434 (cabe).
    const { anchorRef } = mountSurface({ mesa: [513, 1904], sheet: [676, 1470] });
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { value: 1920, configurable: true });
    // Com a âncora medindo um retângulo real, o autoUpdate do floating-ui
    // instancia um IntersectionObserver com `new`: o mock global não é construtível.
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    onTestFinished(() => {
      Object.defineProperty(window, "innerWidth", { value: originalWidth, configurable: true });
      vi.unstubAllGlobals();
    });
    render(<AppearancePopover value={value} onChange={vi.fn()} anchorRef={anchorRef} />);
    fireEvent.click(screen.getByRole("button", { name: /formato/i }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-format-anchor", "sheet");
    expect(dialog).toHaveAttribute("data-side", "right");
    expect(dialog).toHaveAttribute("data-align", "start");
  });

  it("sem vão na mesa, volta a abrir abaixo do gatilho em vez de sair da janela (achado 0159)", () => {
    // 1366: mesa 256–1334, folha 399–1193 → vãos de 143 e 141 px; nenhum comporta 288 + 12.
    const { anchorRef } = mountSurface({ mesa: [256, 1334], sheet: [399, 1193] });
    render(<AppearancePopover value={value} onChange={vi.fn()} anchorRef={anchorRef} />);
    fireEvent.click(screen.getByRole("button", { name: /formato/i }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-format-anchor", "trigger");
    expect(dialog).toHaveAttribute("data-side", "bottom");
    expect(dialog).toHaveAttribute("data-align", "end");
  });

  it("fecha com Escape e mede de novo ao reabrir (achado 0159)", () => {
    render(<AppearancePopover value={value} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /formato/i }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /formato/i }));
    expect(screen.getByRole("dialog")).toHaveAttribute("data-format-anchor", "trigger");
  });

  it("superfície sem folha montada cai no gatilho (achado 0159)", () => {
    const surface = document.createElement("div");
    document.body.appendChild(surface);
    render(<AppearancePopover value={value} onChange={vi.fn()} anchorRef={{ current: surface }} />);
    fireEvent.click(screen.getByRole("button", { name: /formato/i }));
    expect(screen.getByRole("dialog")).toHaveAttribute("data-format-anchor", "trigger");
  });

  it("dá nome acessível ao painel, igual ao rótulo do gatilho", () => {
    const onChange = vi.fn();
    render(<AppearancePopover value={value} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /formato/i }));
    expect(screen.getByRole("dialog", { name: "Formato" })).toBeInTheDocument();
  });
});

describe("resolveFormatPlacement (achado 0159)", () => {
  const r = (left: number, right: number) => ({ left, right });

  it("prefere o vão à esquerda da folha quando ele comporta o painel", () => {
    expect(resolveFormatPlacement({ mesa: r(0, 2000), sheet: r(400, 1200), viewportWidth: 2000 })).toEqual({
      anchor: "sheet",
      side: "left",
      align: "start",
    });
  });

  it("usa o vão à direita quando só ele comporta o painel", () => {
    expect(resolveFormatPlacement({ mesa: r(513, 1904), sheet: r(676, 1470), viewportWidth: 1920 })).toEqual({
      anchor: "sheet",
      side: "right",
      align: "start",
    });
  });

  it("limita o vão pela janela, não só pela mesa (mesa vazando à direita)", () => {
    expect(resolveFormatPlacement({ mesa: r(513, 2400), sheet: r(676, 1470), viewportWidth: 1500 })).toEqual({
      anchor: "trigger",
      side: "bottom",
      align: "end",
    });
  });

  it("limita o vão esquerdo pela borda da janela", () => {
    expect(resolveFormatPlacement({ mesa: r(-400, 1000), sheet: r(200, 1000), viewportWidth: 1000 })).toEqual({
      anchor: "trigger",
      side: "bottom",
      align: "end",
    });
  });

  it("sem medidas, cai no gatilho", () => {
    expect(resolveFormatPlacement(null)).toEqual({ anchor: "trigger", side: "bottom", align: "end" });
  });
});
