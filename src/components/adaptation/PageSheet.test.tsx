import { describe, it, expect } from "vitest";
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
