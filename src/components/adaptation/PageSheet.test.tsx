import { describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { PageSheet } from "./PageSheet";
import { PAGE_CONTENT_HEIGHT_PX } from "./render/pageTokens";
import { FOOTER_BOTTOM_PX } from "./render/footerLabel";

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
    const mesa = screen.getByTestId("page-mesa");
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
    const mesa = screen.getByTestId("page-mesa");
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
        // Conteúdo de uma folha só: o que está em jogo aqui é a escala.
        withHeight(900, () => {
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
      Achado 0216: a escala do 0215 não tinha piso nenhum, e numa moldura
      absurdamente estreita a folha virava miniatura. O piso continua (0,4, o
      mesmo das duas superfícies desde o 0240); o que mudou é que ele não é mais
      0,75 na prévia — a legibilidade do corpo virou degrau de zoom (0240), e o
      piso só impede a miniatura.
    */
    it("não encolhe a folha até virar miniatura (achado 0216)", () => {
      withClientWidth(200, () => {
        withHeight(900, () => {
          render(<PageSheet paginated toolbar={null}><span>x</span></PageSheet>);
          const sheet = screen.getByTestId("page-sheet");
          expect(sheet.style.transform).toBe("scale(0.4)");
          // O vão reserva a folha no tamanho mínimo, maior que a moldura.
          const slot = sheet.parentElement!;
          expect(Number.parseFloat(slot.style.width)).toBeCloseTo(317.6, 3);
          expect(Number.parseFloat(slot.style.height)).toBeCloseTo(449.2, 3);
        });
      });
    });

    it("deixa a folha rolar na horizontal quando não cabe na moldura (achado 0216)", () => {
      withClientWidth(200, () => {
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
      withClientWidth(200, () => {
        withHeight(1123, () => {
          render(<PageSheet paginated toolbar={null}><span>x</span></PageSheet>);
          expect(screen.getByTestId("page-count").style.width).toBe("200px");
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
      withClientWidth(200, () => {
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
      withClientWidth(200, () => {
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
        withHeight(2032, () => {
          withTops(() => {
            render(
              <PageSheet paginated toolbar={null}>
                <span>questão 1</span>
                {/* 1016px de conteúdo vistos a 0,5 de escala (o ajuste em 397px). */}
                <div className="adaptar-page-break" data-test-top="508" />
                <span>questão 2</span>
              </PageSheet>,
            );
            // 2032px = 2 áreas úteis exatas; a quebra cai no fim da 1ª folha.
            // Medindo o corte na geometria escalada dariam 3 folhas.
            expect(screen.getByTestId("page-count")).toHaveTextContent("2 páginas A4");
          });
        });
      });
    });

    /*
      Achado 0234: a folha do Revisar tinha a altura travada em múltiplos de A4
      (0329/0151) e a largura ainda fluida (`max-w-full`), então numa mesa de
      332px ela virava um papel 332 x 1123 (3,38:1) que mentia sobre quanto da
      página estava cheio. A correção do 0215 (escalar em vez de deixar a largura
      ceder) passa a valer também fora do modo paginado.
    */
    it("escala a folha do Revisar em vez de deixá-la reflowar (achado 0234)", () => {
      withClientWidth(332, () => {
        withHeight(900, () => {
          render(<PageSheet toolbar={null}><span>x</span></PageSheet>);
          const sheet = screen.getByTestId("page-sheet");
          expect(sheet.className).toContain("w-[794px]");
          expect(sheet.className).not.toContain("max-w-full");
          // A razão A4 continua vindo do `scale` (e não de largura fluida): o
          // vão reserva exatamente a folha escalada, 1,41:1 preservado.
          const factor = Number(/scale\(([\d.]+)\)/.exec(sheet.style.transform)![1]);
          expect(factor).toBeLessThan(1);
          const slot = sheet.parentElement!;
          expect(Number.parseFloat(slot.style.width)).toBeCloseTo(794 * factor, 3);
          expect(Number.parseFloat(slot.style.height)).toBeCloseTo(1123 * factor, 3);
        });
      });
    });

    it("deixa a folha do Revisar rolar na horizontal quando não cabe (achado 0234)", () => {
      // Abaixo do piso de edição (0,4) a folha volta a passar da mesa.
      withClientWidth(200, () => {
        withHeight(900, () => {
          render(<PageSheet toolbar={null}><span>x</span></PageSheet>);
          const frame = screen.getByTestId("page-sheet").parentElement!.parentElement!;
          expect(frame.className).toContain("overflow-x-auto");
          // O Revisar tem focáveis dentro da folha (o texto é editável): a
          // parada de tabulação do 0222 é só da prévia, que não tem nenhum.
          expect(frame).not.toHaveAttribute("tabindex");
          expect(screen.getByTestId("page-overflow-hint")).toBeInTheDocument();
        });
      });
    });

    /*
      Achado 0235: o piso 0,75 nasceu para a PRÉVIA (0216), tela onde ninguém
      digita, e o 0234 levou o `scale` para o Revisar sem reexaminá-lo. Em 390px
      de viewport a mesa mede 332px e a folha era desenhada com 595,5px: 44% de
      CADA LINHA ficava fora do recorte, na tela em que se edita o texto.
    */
    it("faz a folha do Revisar caber na mesa em tela estreita (achado 0235)", () => {
      withClientWidth(332, () => {
        withHeight(900, () => {
          render(<PageSheet toolbar={null}><span>x</span></PageSheet>);
          const sheet = screen.getByTestId("page-sheet");
          const factor = Number(/scale\(([\d.]+)\)/.exec(sheet.style.transform)![1]);
          expect(794 * factor).toBeLessThanOrEqual(332);
          // Nada escondido: sem rolagem horizontal e sem o aviso do 0222.
          expect(screen.queryByTestId("page-overflow-hint")).not.toBeInTheDocument();
        });
      });
    });

    /*
      Achado 0240: a prévia recebeu o mesmo ajuste da edição. O 0235 tinha
      mantido nela o piso de 0,75, e era ele que fabricava os 283px de rolagem
      obrigatória da tela que promete mostrar o arquivo.
    */
    it("dá à prévia o mesmo ajuste da edição em tela estreita (achado 0240)", () => {
      withClientWidth(332, () => {
        withHeight(900, () => {
          render(<PageSheet paginated toolbar={null}><span>x</span></PageSheet>);
          const sheet = screen.getByTestId("page-sheet");
          const factor = Number(/scale\(([\d.]+)\)/.exec(sheet.style.transform)![1]);
          expect(794 * factor).toBeLessThanOrEqual(332);
        });
      });
    });

    it("não pagina por padrão (a folha do Revisar continua contínua)", () => {
      render(<PageSheet toolbar={null}><span>x</span></PageSheet>);
      const sheet = screen.getByTestId("page-sheet");
      // Cabendo numa folha não há virada para desenhar (achado 0151).
      expect(sheet.style.backgroundImage).toBe("none");
      // A folha cabe inteira na mesa: escala neutra (achado 0234).
      expect(sheet.style.transform).toBe("scale(1)");
      expect(screen.queryByTestId("page-count")).toBeNull();
    });

    it("dá altura mínima de uma folha A4 ao papel do Revisar (achado 0329)", () => {
      // Sem paginação a folha só tinha a altura do conteúdo: com pouco texto o
      // papel encolhia (725px medidos em produção) e deixava de ter forma de
      // página. A borda inferior é o que responde "isto cabe numa folha?".
      render(<PageSheet toolbar={null}><span>x</span></PageSheet>);
      expect(screen.getByTestId("page-sheet").style.minHeight).toBe("1123px");
    });

    it("cresce em folhas inteiras e marca a virada também no Revisar (achado 0151)", () => {
      // O piso do 0329 fechou só a metade de baixo: passando de uma página o
      // papel do Revisar crescia num valor qualquer (1,21 folha nos pixels do
      // achado) e não havia nenhuma marca de onde a página 1 termina.
      withHeight(1500, () => {
        render(<PageSheet toolbar={null}><span>x</span></PageSheet>);
        const sheet = screen.getByTestId("page-sheet");
        // 2 áreas úteis + as duas margens do fluxo contínuo (achado 0157).
        expect(sheet.style.minHeight).toBe("2139.34px");
        expect(sheet.style.backgroundImage).toContain("1069.67px");
        // Continua sem paginar de verdade: nenhum contador de folhas.
        expect(screen.queryByTestId("page-count")).toBeNull();
      });
    });

    /*
      Achado 0153: a contagem dividia o conteúdo pela A4 INTEIRA (1123px), mas o
      conteúdo só ocupa a área útil da página — 1123 menos as duas margens de
      `PAGE_MARGIN_PT` (53,33px cada) = 1016,34px. Os 107px de margem contados
      como conteúdo faziam a folha do Revisar terminar no meio da página, sem
      régua (o 0151 reaberto), e o contador anunciar uma folha a menos que o PDF.
    */
    it("conta a folha pela área útil da página, não pela A4 inteira (achado 0153)", () => {
      withHeight(1070.7, () => {
        render(<PageSheet toolbar={null}><span>x</span></PageSheet>);
        const sheet = screen.getByTestId("page-sheet");
        // 1070,7px cabem na A4 inteira, mas não nos 1016,34px de área útil.
        expect(sheet.style.minHeight).toBe("2139.34px");
        expect(sheet.style.backgroundImage).toContain("1069.67px");
      });
    });

    it("anuncia a folha extra que o PDF emite quando o conteúdo passa da área útil (achado 0153)", () => {
      withHeight(1070.7, () => {
        render(<PageSheet paginated toolbar={null}><span>x</span></PageSheet>);
        expect(screen.getByTestId("page-count")).toHaveTextContent("2 páginas A4");
      });
    });

    /*
      Achado 0157: contagem e desenho usavam dois modelos de página diferentes.
      A contagem é paginada (cada folha recebe só `PAGE_CONTENT_HEIGHT_PX`,
      porque o `<Page>` do PDF reserva a margem em cima e embaixo de CADA
      página); o desenho é fluxo contínuo, e `pageTokensToCss` aplica a margem
      uma vez só, no topo e no pé da folha inteira. Multiplicar a contagem por
      `PAGE_HEIGHT_PX` somava 106,66px de papel por virada que o fluxo não
      gasta: com 1058px de conteúdo o Revisar desenhava 2246px de papel, com a
      régua em 1123px e a segunda A4 INTEIRAMENTE em branco, para um documento
      que sai do arquivo com uma página e meia.
    */
    it("não desenha folha em branco: papel e régua seguem a área útil (achado 0157)", () => {
      withHeight(1058, () => {
        render(<PageSheet toolbar={null}><span>x</span></PageSheet>);
        const sheet = screen.getByTestId("page-sheet");
        // 2 folhas de área útil + as DUAS margens do fluxo contínuo, não 2 x 1123.
        expect(sheet.style.minHeight).toBe("2139.34px");
        expect(sheet.parentElement!.style.height).toBe("2139.34px");
        // A virada cai no ponto do FLUXO onde a área imprimível da página 1
        // acaba (53,33 + 1016,34), e o conteúdo (53,33 + 1058 = 1111,33px)
        // passa dela: a folha 2 tem tinta.
        expect(sheet.style.backgroundImage).toContain("1069.67px");
        expect(sheet.style.backgroundImage).not.toContain("1123px");
      });
    });

    it("dá altura de página A4 à folha", () => {
      render(<PageSheet paginated toolbar={null}><span>x</span></PageSheet>);
      const sheet = screen.getByTestId("page-sheet");
      expect(sheet.style.minHeight).toBe("1123px");
    });

    it("desenha a régua da virada no fim da área útil quando não há quebra forçada", () => {
      withHeight(1500, () => {
        render(<PageSheet paginated toolbar={null}><span>x</span></PageSheet>);
        const sheet = screen.getByTestId("page-sheet");
        expect(screen.getByTestId("page-count")).toHaveTextContent("2 páginas A4");
        expect(sheet.style.backgroundImage).toContain("1069.67px");
        // A folha vai até o fim da 2ª página: o branco que sobra fica visível.
        expect(sheet.style.minHeight).toBe("2139.34px");
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
      Achado 0242: o rodapé do PDF é `fixed` e sai em TODA página; a folha da
      prévia não desenhava nenhum. A moldura chama de volta uma vez por folha
      contada, como o `render` do `<Text fixed>` recebe `pageNumber`/`totalPages`.
    */
    it("desenha o rodapé uma vez por folha contada", () => {
      withHeight(2300, () => {
        render(
          <PageSheet paginated toolbar={null} footer={(n, total) => <span>{`pé ${n}/${total}`}</span>}>
            <span>x</span>
          </PageSheet>,
        );
        expect(screen.getByText("pé 1/3")).toBeInTheDocument();
        expect(screen.getByText("pé 2/3")).toBeInTheDocument();
        expect(screen.getByText("pé 3/3")).toBeInTheDocument();
      });
    });

    it("põe cada rodapé dentro da margem inferior da sua página, como o PDF", () => {
      withHeight(2300, () => {
        render(
          <PageSheet paginated toolbar={null} footer={(n) => <span>{`pé ${n}`}</span>}>
            <span>x</span>
          </PageSheet>,
        );
        const bottomOf = (n: number) =>
          parseFloat((screen.getByText(`pé ${n}`).parentElement as HTMLElement).style.bottom);
        // A base da página N é o fim da área útil dela mais a margem, então o pé
        // fica a (total - N) áreas úteis + FOOTER_BOTTOM do fim do papel — e na
        // última folha isso é exatamente o pé do arquivo.
        expect(bottomOf(3)).toBeCloseTo(FOOTER_BOTTOM_PX, 2);
        expect(bottomOf(2)).toBeCloseTo(PAGE_CONTENT_HEIGHT_PX + FOOTER_BOTTOM_PX, 2);
        expect(bottomOf(1)).toBeCloseTo(2 * PAGE_CONTENT_HEIGHT_PX + FOOTER_BOTTOM_PX, 2);
      });
    });

    it("não desenha rodapé nenhum quando a moldura não recebe um", () => {
      withHeight(900, () => {
        render(<PageSheet paginated toolbar={null}><span>x</span></PageSheet>);
        // A folha do Revisar (sem `footer`) continua sem pé: lá não há arquivo
        // para espelhar.
        expect(screen.getByTestId("page-sheet").textContent).toBe("x");
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
          expect(sheet.style.backgroundImage).toContain("1069.67px");
          expect(sheet.style.backgroundImage).not.toContain("500px");
          // A folha vai até o fim da 2ª página: o branco do fim fica visível.
          expect(sheet.style.minHeight).toBe("2139.34px");
          expect(sheet.parentElement!.style.height).toBe("2139.34px");
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
          // 2 páginas anunciadas => 2 folhas inteiras de papel, não 796 + folha.
          expect(sheet.style.minHeight).toBe("2139.34px");
          expect(sheet.parentElement!.style.height).toBe("2139.34px");
          // A virada fica no fim da página 1, onde o papel realmente acaba.
          expect(sheet.style.backgroundImage).toContain("1069.67px");
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
          // página 2 e também gasta 2. As três viradas caem no fim da área útil
          // de cada folha (achado 0157).
          const rules = sheet.style.backgroundImage.match(/[\d.]+px/g) ?? [];
          expect(new Set(rules)).toEqual(
            new Set([
              "1068.67px",
              "1069.67px",
              "2085.01px",
              "2086.01px",
              "3101.35px",
              "3102.35px",
            ]),
          );
          expect(sheet.style.minHeight).toBe("4172.02px");
        });
      });
    });

    /*
      Achado 0158: a medição só rodava quando o React re-renderizava o passo
      (`[paginated, children, scale]`). O conteúdo, porém, cresce DEPOIS do
      layout por caminhos que não passam por render nenhum: a imagem que carrega,
      a fonte do KaTeX, uma transação do Tiptap. A folha ficava com o piso de uma
      A4 e o conteúdo escorria 54px para fora do papel, sem régua nem contagem —
      a mesma tela dava geometrias diferentes conforme se chegava nela por carga
      direta ou pelo `Voltar` do passo Exportar.
    */
    const withContentObserver = (
      run: (resize: (height: number) => void) => void,
      height = 900,
    ) => {
      const observers: { cb: () => void; targets: Element[] }[] = [];
      const original = global.ResizeObserver;
      let current = height;
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
      const spy = vi
        .spyOn(HTMLElement.prototype, "offsetHeight", "get")
        .mockImplementation(() => current);
      try {
        run((next) => {
          current = next;
          const content = screen.getByTestId("page-sheet").firstElementChild!;
          const watcher = observers.find((o) => o.targets.includes(content));
          expect(watcher).toBeDefined();
          act(() => watcher!.cb());
        });
      } finally {
        spy.mockRestore();
        global.ResizeObserver = original;
      }
    };

    it("remede a folha quando o conteúdo cresce sem novo render (achado 0158)", () => {
      withContentObserver((resize) => {
        render(<PageSheet toolbar={null}><span>x</span></PageSheet>);
        const sheet = screen.getByTestId("page-sheet");
        expect(sheet.style.minHeight).toBe("1123px");
        // A imagem do bloco carregou: o conteúdo passa da área útil da página.
        resize(1500);
        expect(sheet.style.minHeight).toBe("2139.34px");
        expect(sheet.style.backgroundImage).toContain("1069.67px");
        expect(sheet.parentElement!.style.height).toBe("2139.34px");
      });
    });

    it("remede a contagem de folhas da prévia quando o conteúdo cresce (achado 0158)", () => {
      withContentObserver((resize) => {
        render(<PageSheet paginated toolbar={null}><span>x</span></PageSheet>);
        expect(screen.getByTestId("page-count")).toHaveTextContent("1 página A4");
        resize(2300);
        expect(screen.getByTestId("page-count")).toHaveTextContent("3 páginas A4");
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

  /*
    Achado 0238: em 390px de viewport a mesa mede 332px, o ajuste automático
    desenha a folha a 0,42 e o corpo de 12pt chega ao olho com ~6,7px — na
    ÚNICA tela em que se digita. O piso de edição (0235) fez a linha inteira
    caber, mas escolheu pelo professor: sem nenhuma saída, ele lê 6,7px e mira
    o cursor entre linhas de 9,4px. A folha continua começando ajustada; o que
    passa a existir é um zoom explícito para ampliar até um corpo legível.
  */
  describe("zoom da folha de edição (achado 0238)", () => {
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

    const factorOf = () =>
      Number(/scale\(([\d.]+)\)/.exec(screen.getByTestId("page-sheet").style.transform)![1]);

    it("oferece zoom quando a folha de edição não cabe em tamanho real", () => {
      withClientWidth(332, () => {
        render(<PageSheet toolbar={null}><span>x</span></PageSheet>);
        // Começa ajustada à mesa (0235): nada escondido de saída.
        expect(factorOf() * 794).toBeLessThanOrEqual(332);
        expect(screen.getByTestId("page-zoom")).toBeInTheDocument();
        expect(screen.getByTestId("page-zoom")).toHaveTextContent("42%");
      });
    });

    it("amplia a folha até um corpo legível ao comando do professor", () => {
      withClientWidth(332, () => {
        render(<PageSheet toolbar={null}><span>x</span></PageSheet>);
        const zoomIn = screen.getByRole("button", { name: "Aumentar zoom" });
        act(() => {
          zoomIn.click();
          zoomIn.click();
        });
        // 0,75 devolve ao corpo de 12pt os 12px que o ajuste automático tirava.
        expect(factorOf()).toBe(0.75);
        expect(screen.getByTestId("page-zoom")).toHaveTextContent("75%");
        // Ampliada, a folha passa da mesa e a pista de rolagem reaparece.
        expect(screen.getByTestId("page-overflow-hint")).toBeInTheDocument();
      });
    });

    it("volta ao ajuste da mesa ao reduzir o zoom", () => {
      withClientWidth(332, () => {
        render(<PageSheet toolbar={null}><span>x</span></PageSheet>);
        const zoomIn = screen.getByRole("button", { name: "Aumentar zoom" });
        const zoomOut = screen.getByRole("button", { name: "Diminuir zoom" });
        expect(zoomOut).toBeDisabled();
        act(() => {
          zoomIn.click();
        });
        expect(factorOf()).toBe(0.5);
        act(() => {
          zoomOut.click();
        });
        expect(factorOf() * 794).toBeLessThanOrEqual(332);
        expect(zoomOut).toBeDisabled();
      });
    });

    it("para de ampliar no tamanho real do arquivo", () => {
      withClientWidth(332, () => {
        render(<PageSheet toolbar={null}><span>x</span></PageSheet>);
        const zoomIn = screen.getByRole("button", { name: "Aumentar zoom" });
        act(() => {
          zoomIn.click();
          zoomIn.click();
          zoomIn.click();
          zoomIn.click();
          zoomIn.click();
        });
        expect(factorOf()).toBe(1);
        expect(zoomIn).toBeDisabled();
      });
    });

    /*
      Achado 0241: o percentual era um <span> decorativo e a pista de corte um
      <p> mudo. Quem usa leitor de tela ouvia só "Aumentar zoom, botão", clicava,
      e nem o novo valor nem o fato de a folha ter passado a mesa eram falados.
    */
    it("expõe o percentual aos botões e anuncia cada mudança de degrau (achado 0241)", () => {
      withClientWidth(332, () => {
        render(<PageSheet toolbar={null}><span>x</span></PageSheet>);
        const value = screen.getByTestId("page-zoom-value");
        expect(value).toHaveAttribute("aria-live", "polite");
        expect(value).toHaveAttribute("aria-atomic", "true");
        expect(value.id).not.toBe("");
        for (const name of ["Diminuir zoom", "Aumentar zoom"]) {
          expect(screen.getByRole("button", { name })).toHaveAttribute(
            "aria-describedby",
            value.id,
          );
        }
      });
    });

    it("anuncia a folha que passou a estar cortada pelo zoom (achado 0241)", () => {
      withClientWidth(332, () => {
        render(<PageSheet toolbar={null}><span>x</span></PageSheet>);
        act(() => {
          screen.getByRole("button", { name: "Aumentar zoom" }).click();
        });
        expect(screen.getByTestId("page-overflow-hint")).toHaveAttribute("role", "status");
      });
    });

    it("não oferece zoom quando a folha já cabe em tamanho real", () => {
      withClientWidth(1200, () => {
        render(<PageSheet toolbar={null}><span>x</span></PageSheet>);
        expect(screen.queryByTestId("page-zoom")).toBeNull();
      });
    });
  });

  /*
    Achado 0240: a prévia do Exportar herdou do 0216 um piso de 0,75 e nenhuma
    saída. Em 390px de viewport a mesa mede 332px e a folha era desenhada com
    595,5px: 283px de rolagem horizontal OBRIGATÓRIA, com o enunciado cortado no
    meio da palavra já na posição inicial, na tela cuja promessa é "é isto que
    vai sair". A escada do 0238 passa a valer nas duas superfícies: a folha abre
    ajustada (cabe inteira em qualquer viewport) e quem quiser o corpo maior sobe
    o zoom, como já acontece no Revisar.
  */
  describe("zoom da prévia do Exportar (achado 0240)", () => {
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

    const factorOf = () =>
      Number(/scale\(([\d.]+)\)/.exec(screen.getByTestId("page-sheet").style.transform)![1]);

    it("abre a prévia com a folha inteira dentro da mesa em tela estreita", () => {
      withClientWidth(332, () => {
        render(<PageSheet paginated toolbar={null}><span>x</span></PageSheet>);
        expect(factorOf() * 794).toBeLessThanOrEqual(332);
        // Sem rolagem obrigatória: nada do arquivo fica fora da vista de saída.
        expect(screen.queryByTestId("page-overflow-hint")).not.toBeInTheDocument();
      });
    });

    it("oferece à prévia a mesma escada de zoom da edição", () => {
      withClientWidth(332, () => {
        render(<PageSheet paginated toolbar={null}><span>x</span></PageSheet>);
        expect(screen.getByTestId("page-zoom")).toBeInTheDocument();
        expect(screen.getByTestId("page-zoom")).toHaveTextContent("42%");
        const zoomIn = screen.getByRole("button", { name: "Aumentar zoom" });
        act(() => {
          zoomIn.click();
          zoomIn.click();
        });
        // 0,75 (o antigo piso do 0216) vira um degrau escolhido pelo professor.
        expect(factorOf()).toBe(0.75);
        // Ampliada por escolha, a rolagem volta a existir — e volta anunciada.
        expect(screen.getByTestId("page-overflow-hint")).toBeInTheDocument();
      });
    });

    it("não oferece zoom à prévia quando a folha já cabe em tamanho real", () => {
      withClientWidth(1200, () => {
        render(<PageSheet paginated toolbar={null}><span>x</span></PageSheet>);
        expect(screen.queryByTestId("page-zoom")).toBeNull();
        expect(factorOf()).toBe(1);
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
