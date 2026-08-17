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
