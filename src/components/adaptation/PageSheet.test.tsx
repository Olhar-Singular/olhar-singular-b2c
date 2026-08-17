import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageSheet } from "./PageSheet";

describe("PageSheet", () => {
  it("renderiza a barra fixa e a folha com o conteúdo", () => {
    render(
      <PageSheet toolbar={<div>BARRA</div>}>
        <p>conteúdo da folha</p>
      </PageSheet>,
    );
    expect(screen.getByText("BARRA")).toBeInTheDocument();
    expect(screen.getByText("conteúdo da folha")).toBeInTheDocument();
    expect(screen.getByTestId("page-sheet")).toBeInTheDocument();
  });

  it("aplica os tokens de página na folha (fonte base 16px)", () => {
    render(<PageSheet toolbar={null}><span>x</span></PageSheet>);
    const sheet = screen.getByTestId("page-sheet");
    expect(sheet.style.fontSize).toBe("16px");
  });

  it("aplica o gradiente da mesa via token §4 (sem hex no componente)", () => {
    render(<PageSheet toolbar={null}><span>x</span></PageSheet>);
    const mesa = screen.getByTestId("page-sheet").parentElement!;
    expect(mesa.getAttribute("style")).toContain("--sf-mesa-gradient");
  });

  it("aplica o fundo de papel e a sombra da folha via tokens §4", () => {
    render(<PageSheet toolbar={null}><span>x</span></PageSheet>);
    const sheet = screen.getByTestId("page-sheet");
    expect(sheet.className).toContain("bg-surface-paper");
    expect(sheet.getAttribute("style")).toContain("--sf-paper-shadow");
  });

  it("não cria um segundo eixo de rolagem na mesa (achado 0008)", () => {
    render(<PageSheet toolbar={<div>BARRA</div>}><span>x</span></PageSheet>);
    const mesa = screen.getByTestId("page-sheet").parentElement!;
    // A mesa não pode ter altura chutada nem overflow próprio: com
    // `max-h-[calc(100vh-280px)]` + `overflow-auto` o passo Revisar mostrava
    // duas barras verticais ao mesmo tempo (mesa e página).
    expect(mesa.className).not.toContain("overflow-auto");
    expect(mesa.className).not.toMatch(/max-h-\[calc\(/);
  });

  it("mantém a barra visível enquanto a página rola (sticky)", () => {
    render(<PageSheet toolbar={<div>BARRA</div>}><span>x</span></PageSheet>);
    const bar = screen.getByText("BARRA").parentElement!;
    expect(bar.className).toContain("sticky");
    expect(bar.className).toContain("top-0");
    // A moldura não pode ser um contexto de rolagem, senão o sticky gruda nela.
    expect(bar.parentElement!.className).not.toContain("overflow-hidden");
  });

  describe("modo paginado (achado 0118)", () => {
    const withHeight = (height: number, run: () => void) => {
      const spy = vi
        .spyOn(HTMLElement.prototype, "offsetHeight", "get")
        .mockReturnValue(height);
      try {
        run();
      } finally {
        spy.mockRestore();
      }
    };

    const withClientWidth = (width: number, run: () => void) => {
      const spy = vi
        .spyOn(HTMLElement.prototype, "clientWidth", "get")
        .mockReturnValue(width);
      try {
        run();
      } finally {
        spy.mockRestore();
      }
    };

    /*
      Achado 0215: altura travada em A4 + largura fluida davam uma folha 3,38:1
      em 390px (332 x 1123). A prévia escala a folha de 794px em vez de deixar o
      texto reflowar, então a razão continua 1,41:1 em qualquer viewport.
    */
    it("escala a folha em vez de deixá-la reflowar em tela estreita (achado 0215)", () => {
      withClientWidth(397, () => {
        withHeight(1123, () => {
          render(<PageSheet paginated toolbar={null}><span>x</span></PageSheet>);
          const sheet = screen.getByTestId("page-sheet");
          expect(sheet.className).toContain("w-[794px]");
          expect(sheet.className).not.toContain("max-w-full");
          expect(sheet.style.transform).toBe("scale(0.5)");
          // O contêiner reserva a altura JÁ escalada: 1123 * 0,5.
          const slot = sheet.parentElement!;
          expect(slot.style.width).toBe("397px");
          expect(slot.style.height).toBe("561.5px");
        });
      });
    });

    it("não amplia a folha além do tamanho real quando sobra espaço", () => {
      withClientWidth(1200, () => {
        withHeight(1123, () => {
          render(<PageSheet paginated toolbar={null}><span>x</span></PageSheet>);
          expect(screen.getByTestId("page-sheet").style.transform).toBe("scale(1)");
        });
      });
    });

    it("conta as páginas na geometria não escalada (achado 0215)", () => {
      withClientWidth(397, () => {
        withHeight(2246, () => {
          withTops(() => {
            render(
              <PageSheet paginated toolbar={null}>
                <span>questão 1</span>
                {/* 1123px de conteúdo vistos a 0,5 de escala. */}
                <div className="adaptar-page-break" data-test-top="561.5" />
                <span>questão 2</span>
              </PageSheet>,
            );
            // 2246px de folha = 2 A4 exatos; a quebra cai no fim da 1ª folha.
            expect(screen.getByTestId("page-count")).toHaveTextContent("2 páginas A4");
          });
        });
      });
    });

    it("não pagina por padrão (a folha do Revisar continua contínua)", () => {
      render(<PageSheet toolbar={null}><span>x</span></PageSheet>);
      expect(screen.getByTestId("page-sheet").style.minHeight).toBe("");
      expect(screen.queryByTestId("page-count")).toBeNull();
    });

    it("dá altura de página A4 à folha e desenha a régua de quebra", () => {
      render(<PageSheet paginated toolbar={null}><span>x</span></PageSheet>);
      const sheet = screen.getByTestId("page-sheet");
      expect(sheet.style.minHeight).toBe("1123px");
      expect(sheet.style.backgroundImage).toContain("1123px");
    });

    it("conta uma página quando o conteúdo cabe numa folha", () => {
      withHeight(900, () => {
        render(<PageSheet paginated toolbar={null}><span>x</span></PageSheet>);
        expect(screen.getByTestId("page-count")).toHaveTextContent("1 página A4");
      });
    });

    it("conta as páginas a partir da altura do conteúdo", () => {
      withHeight(2300, () => {
        render(<PageSheet paginated toolbar={null}><span>x</span></PageSheet>);
        expect(screen.getByTestId("page-count")).toHaveTextContent("3 páginas A4");
      });
    });

    /*
      Achado 0121: a régua de quebra por questão é só chrome (uns 30px no fluxo),
      então medir a folha inteira dizia "1 página A4" enquanto o PDF saía com 2.
      A contagem tem que somar por trecho entre quebras.
    */
    const withTops = (run: () => void) => {
      const spy = vi
        .spyOn(HTMLElement.prototype, "getBoundingClientRect")
        .mockImplementation(function (this: HTMLElement) {
          const top = Number(this.dataset.testTop ?? 0);
          return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
        });
      try {
        run();
      } finally {
        spy.mockRestore();
      }
    };

    it("conta uma folha a mais por quebra forçada, mesmo com a folha curta", () => {
      withHeight(1123, () => {
        withTops(() => {
          render(
            <PageSheet paginated toolbar={null}>
              <span>questão 1</span>
              <div className="adaptar-page-break" data-test-top="500" />
              <span>questão 2</span>
            </PageSheet>,
          );
          expect(screen.getByTestId("page-count")).toHaveTextContent("2 páginas A4");
        });
      });
    });

    it("soma as folhas de cada trecho entre quebras", () => {
      withHeight(3000, () => {
        withTops(() => {
          render(
            <PageSheet paginated toolbar={null}>
              <span>questão 1 longa</span>
              <div className="adaptar-page-break" data-test-top="1500" />
              <span>questão 2</span>
            </PageSheet>,
          );
          // trecho 1: 1500px -> 2 folhas; trecho 2: 1500px -> 2 folhas.
          expect(screen.getByTestId("page-count")).toHaveTextContent("4 páginas A4");
        });
      });
    });
  });

  it("reflete o pageStyle na folha (fonte, tamanho e var de espaçamento)", () => {
    render(
      <PageSheet toolbar={null} pageStyle={{ fontFamily: "mono", fontSize: 18, blockSpacing: 24 }}>
        <span>x</span>
      </PageSheet>,
    );
    const sheet = screen.getByTestId("page-sheet");
    expect(sheet.style.fontSize).toBe("24px"); // 18pt -> 24px
    expect(sheet.style.fontFamily).toContain("Courier New");
    expect(sheet.style.fontFamily).toContain("monospace");
    expect(sheet.style.getPropertyValue("--doc-block-spacing")).toBe("24px");
  });
});
