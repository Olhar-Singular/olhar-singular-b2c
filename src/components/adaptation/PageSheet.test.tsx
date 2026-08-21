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
      withClientWidth(714.6, () => {
        withHeight(1123, () => {
          render(<PageSheet paginated toolbar={null}><span>x</span></PageSheet>);
          const sheet = screen.getByTestId("page-sheet");
          expect(sheet.className).toContain("w-[794px]");
          expect(sheet.className).not.toContain("max-w-full");
          expect(sheet.style.transform).toBe("scale(0.9)");
          // O contêiner reserva a altura JÁ escalada: 1123 * 0,9.
          const slot = sheet.parentElement!;
          expect(slot.style.width).toBe("714.6px");
          expect(slot.style.height).toBe("1010.7px");
        });
      });
    });

    /*
      Achado 0216: a escala do 0215 não tinha piso. Em 390px de viewport a
      moldura mede ~332px, o fator caía para 0,42 e o corpo de 12pt virava ~6,7px
      na única tela de conferência antes do download. Agora a folha para de
      encolher no mínimo legível e passa a rolar na horizontal.
    */
    it("não encolhe a folha abaixo do mínimo legível (achado 0216)", () => {
      withClientWidth(332, () => {
        withHeight(1123, () => {
          render(<PageSheet paginated toolbar={null}><span>x</span></PageSheet>);
          const sheet = screen.getByTestId("page-sheet");
          expect(sheet.style.transform).toBe("scale(0.75)");
          // O vão reserva a folha no tamanho mínimo, maior que a moldura.
          const slot = sheet.parentElement!;
          expect(slot.style.width).toBe("595.5px");
          expect(slot.style.height).toBe("842.25px");
        });
      });
    });

    it("deixa a folha rolar na horizontal quando não cabe na moldura (achado 0216)", () => {
      withClientWidth(332, () => {
        withHeight(1123, () => {
          render(<PageSheet paginated toolbar={null}><span>x</span></PageSheet>);
          const frame = screen.getByTestId("page-sheet").parentElement!.parentElement!;
          expect(frame.className).toContain("overflow-x-auto");
          // `justify-center` do flex cortaria a borda esquerda ao rolar: o vão é
          // um bloco centralizado por margem, que colapsa quando não cabe.
          expect(frame.className).not.toContain("justify-center");
          expect(screen.getByTestId("page-sheet").parentElement!.className).toContain("mx-auto");
        });
      });
    });

    /*
      Achado 0221: o contador é chrome da prévia, não parte da folha. Com a
      escala no piso a folha fica MAIOR que a moldura, e a largura do parágrafo,
      copiada da folha, jogava o texto (alinhado à direita) para fora do recorte
      da mesa — sem rolagem que o alcançasse, porque o contador vive fora da
      moldura rolável.
    */
    it("mantém o contador de folhas dentro da mesa quando a escala trava no piso (achado 0221)", () => {
      withClientWidth(332, () => {
        withHeight(1123, () => {
          render(<PageSheet paginated toolbar={null}><span>x</span></PageSheet>);
          expect(screen.getByTestId("page-count").style.width).toBe("332px");
        });
      });
    });

    it("alinha o contador pela borda direita da folha quando ela cabe na mesa", () => {
      withClientWidth(1200, () => {
        withHeight(1123, () => {
          render(<PageSheet paginated toolbar={null}><span>x</span></PageSheet>);
          expect(screen.getByTestId("page-count").style.width).toBe("794px");
        });
      });
    });

    /*
      Achado 0222: a rolagem horizontal que o 0216 deixou como saída era um beco
      para quem não arrasta com o dedo. A moldura não entrava na tabulação, não
      tinha nome acessível e não há nenhum focável dentro dela (a prévia é render
      de leitura), então metade da folha só existia para quem descobria o gesto.
    */
    it("deixa a moldura rolável alcançável por teclado quando a folha não cabe (achado 0222)", () => {
      withClientWidth(332, () => {
        withHeight(1123, () => {
          render(<PageSheet paginated toolbar={null}><span>x</span></PageSheet>);
          const frame = screen.getByTestId("page-sheet").parentElement!.parentElement!;
          expect(frame).toHaveAttribute("tabindex", "0");
          expect(frame).toHaveAttribute("role", "region");
          expect(frame).toHaveAccessibleName("Prévia da folha A4");
        });
      });
    });

    it("anuncia por escrito que a folha continua fora da vista (achado 0222)", () => {
      withClientWidth(332, () => {
        withHeight(1123, () => {
          render(<PageSheet paginated toolbar={null}><span>x</span></PageSheet>);
          // No touch a barra de rolagem é sobreposta e só aparece durante o
          // gesto: sem uma pista visível a folha parece simplesmente cortada.
          expect(screen.getByTestId("page-overflow-hint")).toBeInTheDocument();
        });
      });
    });

    it("não cria parada de tabulação nem aviso quando a folha cabe inteira (achado 0222)", () => {
      withClientWidth(1200, () => {
        withHeight(1123, () => {
          render(<PageSheet paginated toolbar={null}><span>x</span></PageSheet>);
          const frame = screen.getByTestId("page-sheet").parentElement!.parentElement!;
          expect(frame).not.toHaveAttribute("tabindex");
          expect(frame).not.toHaveAttribute("role");
          expect(screen.queryByTestId("page-overflow-hint")).not.toBeInTheDocument();
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
                {/* 1123px de conteúdo vistos a 0,75 de escala (o piso do 0216). */}
                <div className="adaptar-page-break" data-test-top="842.25" />
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

    it("dá altura de página A4 à folha", () => {
      render(<PageSheet paginated toolbar={null}><span>x</span></PageSheet>);
      const sheet = screen.getByTestId("page-sheet");
      expect(sheet.style.minHeight).toBe("1123px");
    });

    it("desenha a régua da virada nos múltiplos de A4 quando não há quebra forçada", () => {
      withHeight(1500, () => {
        render(<PageSheet paginated toolbar={null}><span>x</span></PageSheet>);
        const sheet = screen.getByTestId("page-sheet");
        expect(screen.getByTestId("page-count")).toHaveTextContent("2 páginas A4");
        expect(sheet.style.backgroundImage).toContain("1123px");
        // A folha vai até o fim da 2ª página: o branco que sobra fica visível.
        expect(sheet.style.minHeight).toBe("2246px");
      });
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

    /*
      Achado 0123: a contagem respeitava a quebra por questão e o DESENHO não:
      a régua só aparecia nos múltiplos de 1123px. O rótulo dizia "2 páginas A4"
      e a folha continuava com uma folha só, sem nenhuma linha de virada.
    */
    it("desenha a régua da virada na posição da quebra forçada (achado 0123)", () => {
      withHeight(900, () => {
        withTops(() => {
          render(
            <PageSheet paginated toolbar={null}>
              <span>questão 1</span>
              <div className="adaptar-page-break" data-test-top="500" />
              <span>questão 2</span>
            </PageSheet>,
          );
          const sheet = screen.getByTestId("page-sheet");
          expect(screen.getByTestId("page-count")).toHaveTextContent("2 páginas A4");
          // A quebra forçada gera uma virada desenhada (antes do 0123 não saía
          // régua nenhuma); ela cai no fim da página 1, que é onde o papel acaba
          // (achado 0131 — antes era desenhada em cima do corte, em 500px).
          expect(sheet.style.backgroundImage).toContain("1123px");
          expect(sheet.style.backgroundImage).not.toContain("500px");
          // A folha vai até o fim da 2ª página: o branco do fim fica visível.
          expect(sheet.style.minHeight).toBe("2246px");
          expect(sheet.parentElement!.style.height).toBe("2246px");
        });
      });
    });

    /*
      Achado 0131: a folha era medida a partir do CORTE, não do fim da página em
      que o corte caiu. Com a quebra por questão ligada a prévia anunciava "2
      páginas A4" e desenhava 1919px (1,71 folha), escondendo justamente o pé em
      branco da página 1 que o PDF tem.
    */
    it("desenha N folhas inteiras quando anuncia N páginas (achado 0131)", () => {
      withHeight(1150, () => {
        withTops(() => {
          render(
            <PageSheet paginated toolbar={null}>
              <span>questão 1</span>
              <div className="adaptar-page-break" data-test-top="796" />
              <span>questão 2</span>
            </PageSheet>,
          );
          const sheet = screen.getByTestId("page-sheet");
          expect(screen.getByTestId("page-count")).toHaveTextContent("2 páginas A4");
          // 2 páginas anunciadas => 2 x 1123px de papel, não 796 + 1123.
          expect(sheet.style.minHeight).toBe("2246px");
          expect(sheet.parentElement!.style.height).toBe("2246px");
          // A virada fica no fim da página 1, onde o papel realmente acaba.
          expect(sheet.style.backgroundImage).toContain("1123px");
          expect(sheet.style.backgroundImage).not.toContain("1919px");
        });
      });
    });

    it("desenha uma régua a menos que a contagem de folhas", () => {
      withHeight(3000, () => {
        withTops(() => {
          render(
            <PageSheet paginated toolbar={null}>
              <span>questão 1 longa</span>
              <div className="adaptar-page-break" data-test-top="1500" />
              <span>questão 2</span>
            </PageSheet>,
          );
          const sheet = screen.getByTestId("page-sheet");
          expect(screen.getByTestId("page-count")).toHaveTextContent("4 páginas A4");
          // trecho 1: 1500px de conteúdo -> 2 folhas; trecho 2 começa no fim da
          // página 2 e também gasta 2. As três viradas caem nos múltiplos de A4.
          const rules = sheet.style.backgroundImage.match(/\d+px/g) ?? [];
          expect(new Set(rules)).toEqual(new Set(["1122px", "1123px", "2245px", "2246px", "3368px", "3369px"]));
          expect(sheet.style.minHeight).toBe("4492px");
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

  // The sheet is paper: it stays light whatever the app theme is. Native form
  // controls (the "correct alternative" radio, checkboxes) are painted by the
  // browser from `color-scheme`, NOT from Tailwind classes — under a dark app
  // theme they rendered as dark filled circles sitting on white paper. Pinning
  // the scheme here covers every native control on the sheet at once, instead
  // of restyling each one as it is discovered.
  it("mantém os controles nativos no esquema claro, como o papel", () => {
    render(<PageSheet toolbar={null}><span>x</span></PageSheet>);
    const sheet = screen.getByTestId("page-sheet");
    expect(sheet.className).toContain("[color-scheme:light]");
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
