import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { AppearanceControls, AppearancePopover } from "./AppearancePopover";
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

  it("exibe a microcopy sobre as fontes de acessibilidade", () => {
    setupControls();
    expect(screen.getByText(/acessibilidade/i)).toBeInTheDocument();
  });

  it("não exibe a seção 'Tamanho por elemento'", () => {
    setupControls();
    expect(screen.queryByText(/tamanho por elemento/i)).not.toBeInTheDocument();
  });

  it("exibe aviso de que o tamanho afeta toda a prova", () => {
    setupControls();
    expect(screen.getByText(/toda a prova/i)).toBeInTheDocument();
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
});
