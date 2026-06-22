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
});

describe("AppearanceControls — tamanho por elemento", () => {
  it("mostra o tamanho global como fallback quando não há override de elemento", () => {
    setupControls(); // fontSize 12pt → 16px, sem elementFontSizes
    expect(screen.getByTestId("elem-fs-stem").textContent).toBe("16px");
    expect(screen.getByTestId("elem-fs-instruction").textContent).toBe("16px");
    expect(screen.getByTestId("elem-fs-alternative").textContent).toBe("16px");
    expect(screen.getByTestId("elem-fs-caption").textContent).toBe("16px");
  });

  it("mostra o override em px quando definido e global como fallback para os demais", () => {
    setupControls({ elementFontSizes: { stem: 14 } }); // 14pt → ptToPx = 19px
    expect(screen.getByTestId("elem-fs-stem").textContent).toBe("19px");
    expect(screen.getByTestId("elem-fs-instruction").textContent).toBe("16px"); // fallback global
  });

  it("não mostra botão redefinir quando não há override", () => {
    setupControls();
    expect(screen.queryByLabelText("Redefinir enunciado")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Redefinir instrução")).not.toBeInTheDocument();
  });

  it("mostra botão redefinir somente para elementos com override", () => {
    setupControls({ elementFontSizes: { stem: 14 } });
    expect(screen.getByLabelText("Redefinir enunciado")).toBeInTheDocument();
    expect(screen.queryByLabelText("Redefinir instrução")).not.toBeInTheDocument();
  });

  it("aumenta o tamanho de elemento sem override usando o tamanho global como base", () => {
    const { onChange } = setupControls(); // global 12pt → 16px
    fireEvent.click(screen.getByRole("button", { name: "Aumentar enunciado" }));
    // currentPx = 16, next = 17, pxToPt(17) = 12.75
    expect(onChange).toHaveBeenCalledWith({ elementFontSizes: { stem: 12.75 } });
  });

  it("diminui o tamanho de elemento com override existente", () => {
    const { onChange } = setupControls({ elementFontSizes: { stem: 14 } });
    fireEvent.click(screen.getByRole("button", { name: "Diminuir enunciado" }));
    // currentPt=14 → ptToPx=19, next=18, pxToPt(18)=13.5
    expect(onChange).toHaveBeenCalledWith({ elementFontSizes: { stem: 13.5 } });
  });

  it("respeita o limite máximo de tamanho de elemento (28px)", () => {
    const { onChange } = setupControls({ elementFontSizes: { stem: 21 } }); // 21pt → ptToPx=28
    fireEvent.click(screen.getByRole("button", { name: "Aumentar enunciado" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("respeita o limite mínimo de tamanho de elemento (11px)", () => {
    const { onChange } = setupControls({ elementFontSizes: { stem: 8.25 } }); // 8.25pt → ptToPx=11
    fireEvent.click(screen.getByRole("button", { name: "Diminuir enunciado" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("redefinir emite elementFontSizes undefined quando era o único override", () => {
    const { onChange } = setupControls({ elementFontSizes: { stem: 14 } });
    fireEvent.click(screen.getByLabelText("Redefinir enunciado"));
    expect(onChange).toHaveBeenCalledWith({ elementFontSizes: undefined });
  });

  it("redefinir um elemento preserva os demais overrides", () => {
    const { onChange } = setupControls({ elementFontSizes: { stem: 14, instruction: 10 } });
    fireEvent.click(screen.getByLabelText("Redefinir instrução"));
    expect(onChange).toHaveBeenCalledWith({ elementFontSizes: { stem: 14 } });
  });

  it("redefinir preserva overrides de alternativas e legenda", () => {
    const { onChange } = setupControls({ elementFontSizes: { stem: 14, alternative: 12, caption: 9 } });
    fireEvent.click(screen.getByLabelText("Redefinir enunciado"));
    expect(onChange).toHaveBeenCalledWith({ elementFontSizes: { alternative: 12, caption: 9 } });
  });

  it("redefinir alternativa preserva instrução definida", () => {
    const { onChange } = setupControls({ elementFontSizes: { instruction: 10, alternative: 12 } });
    fireEvent.click(screen.getByLabelText("Redefinir alternativas"));
    expect(onChange).toHaveBeenCalledWith({ elementFontSizes: { instruction: 10 } });
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
