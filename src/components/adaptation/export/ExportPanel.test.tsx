import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ExportPanel } from "./ExportPanel";
import type { CanonicalDocument, DocumentHeader, PageStyle } from "@/lib/adaptation/canonical/schema";
import type { PanelSettings } from "./panelSettings";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const document: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [
    { id: id(1), type: "paragraph", content: [{ type: "text", text: "olá mundo" }] },
    {
      id: id(2),
      type: "question",
      number: 1,
      stem: [{ id: id(3), type: "paragraph", content: [{ type: "text", text: "q1" }] }],
      answer: { kind: "open" },
    },
  ],
};

beforeEach(() => vi.clearAllMocks());

/** Stateful harness: the header is controlled, owned by the parent (like the wizard). */
function Harness({
  onDownload,
  onDownloadWord,
  pageStyle,
  initialHeader = {},
}: {
  onDownload: (d: CanonicalDocument, s: PanelSettings, ps?: PageStyle) => Promise<void>;
  onDownloadWord?: (d: CanonicalDocument, s: PanelSettings, ps?: PageStyle) => Promise<void>;
  pageStyle?: PageStyle;
  initialHeader?: DocumentHeader;
}) {
  const [header, setHeader] = useState<DocumentHeader>(initialHeader);
  return (
    <ExportPanel
      document={document}
      header={header}
      onHeaderChange={setHeader}
      onDownload={onDownload}
      onDownloadWord={onDownloadWord}
      pageStyle={pageStyle}
    />
  );
}

describe("ExportPanel", () => {
  it("copies the plain-text projection", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { toast } = await import("sonner");
    render(<ExportPanel document={document} onDownload={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Copiar/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Copiado para a área de transferência!"));
  });

  it("shows an error toast when copy fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });
    const { toast } = await import("sonner");
    render(<ExportPanel document={document} onDownload={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Copiar/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Erro ao copiar."));
  });

  it("builds the PDF with header (from controlled state) and page-break toggle (no font select)", async () => {
    const onDownload = vi.fn<(d: CanonicalDocument, s: PanelSettings, ps?: PageStyle) => Promise<void>>().mockResolvedValue(undefined);
    const { toast } = await import("sonner");
    render(<Harness onDownload={onDownload} />);

    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Minha Prova" } });
    fireEvent.change(screen.getByLabelText("Escola"), { target: { value: "Escola X" } });
    fireEvent.change(screen.getByLabelText("Professor(a)"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-06-04" } });
    fireEvent.click(screen.getByRole("switch"));

    fireEvent.click(screen.getByRole("button", { name: /Exportar PDF/i }));

    await waitFor(() => expect(onDownload).toHaveBeenCalled());
    const [doc, settings] = onDownload.mock.calls[0];
    expect(doc).toBe(document);
    expect(settings).toEqual({
      header: { title: "Minha Prova", school: "Escola X", teacher: "Ana", date: "2026-06-04" },
      pageBreakPerQuestion: true,
    });
    // No fontFamily in settings anymore — font comes from pageStyle.
    expect("fontFamily" in settings).toBe(false);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("PDF gerado!"));
  });

  /**
   * Regressão (achado 0110): o estado do switch nascia e morria dentro do painel,
   * então a prévia irmã não tinha como reagir a ele.
   */
  it("reports every page-break toggle change to the parent", () => {
    const onPageBreakPerQuestionChange = vi.fn();
    render(
      <ExportPanel
        document={document}
        onDownload={vi.fn()}
        onPageBreakPerQuestionChange={onPageBreakPerQuestionChange}
      />,
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(onPageBreakPerQuestionChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("switch"));
    expect(onPageBreakPerQuestionChange).toHaveBeenLastCalledWith(false);
  });

  it("is safe to toggle the page break without a parent listener", () => {
    render(<ExportPanel document={document} onDownload={vi.fn()} />);
    expect(() => fireEvent.click(screen.getByRole("switch"))).not.toThrow();
  });

  it("is safe to use without an onHeaderChange handler (a field change does not throw)", () => {
    render(<ExportPanel document={document} onDownload={vi.fn()} />);
    expect(() =>
      fireEvent.change(screen.getByLabelText("Título"), { target: { value: "x" } }),
    ).not.toThrow();
  });

  it("renders the header field values from the header prop (controlled)", () => {
    render(
      <ExportPanel
        document={document}
        header={{ title: "Pré-preenchido", school: "Escola Y", teacher: "Bia", date: "2026-01-15" }}
        onHeaderChange={vi.fn()}
        onDownload={vi.fn()}
      />,
    );
    expect((screen.getByLabelText("Título") as HTMLInputElement).value).toBe("Pré-preenchido");
    expect((screen.getByLabelText("Escola") as HTMLInputElement).value).toBe("Escola Y");
    expect((screen.getByLabelText("Professor(a)") as HTMLInputElement).value).toBe("Bia");
    expect((screen.getByLabelText("Data") as HTMLInputElement).value).toBe("2026-01-15");
  });

  it("fires onHeaderChange with the merged header when a field changes", () => {
    const onHeaderChange = vi.fn();
    render(
      <ExportPanel
        document={document}
        header={{ school: "Escola Y" }}
        onHeaderChange={onHeaderChange}
        onDownload={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Novo Título" } });
    expect(onHeaderChange).toHaveBeenCalledWith({ school: "Escola Y", title: "Novo Título" });
  });

  it("does not render a font select (font comes from pageStyle, not the panel)", () => {
    render(<ExportPanel document={document} onDownload={vi.fn()} />);
    expect(screen.queryByLabelText("Fonte")).toBeNull();
  });

  it("passes pageStyle from props to onDownload", async () => {
    const onDownload = vi.fn<(d: CanonicalDocument, s: PanelSettings, ps?: PageStyle) => Promise<void>>().mockResolvedValue(undefined);
    const pageStyle: PageStyle = { fontFamily: "lexend", fontSize: 14 };
    render(<ExportPanel document={document} onDownload={onDownload} pageStyle={pageStyle} />);

    fireEvent.click(screen.getByRole("button", { name: /Exportar PDF/i }));
    await waitFor(() => expect(onDownload).toHaveBeenCalled());
    const [, , ps] = onDownload.mock.calls[0];
    expect(ps).toBe(pageStyle);
  });

  it("shows an error toast when the export fails", async () => {
    const onDownload = vi.fn().mockRejectedValue(new Error("boom"));
    const { toast } = await import("sonner");
    render(<ExportPanel document={document} onDownload={onDownload} />);
    fireEvent.click(screen.getByRole("button", { name: /Exportar PDF/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Erro ao gerar PDF."));
  });

  it("defaults to the downloadPdf trigger when no override is given", () => {
    render(<ExportPanel document={document} />);
    expect(screen.getByRole("button", { name: /Exportar PDF/i })).toBeInTheDocument();
  });

  it("mostra botão 'Exportar Word'", () => {
    render(<ExportPanel document={document} onDownload={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Exportar Word/i })).toBeInTheDocument();
  });

  it("clicar 'Exportar Word' chama onDownloadWord com o documento e o cabeçalho", async () => {
    const onDownloadWord = vi.fn<(d: CanonicalDocument, s: PanelSettings, ps?: PageStyle) => Promise<void>>().mockResolvedValue(undefined);
    const { toast } = await import("sonner");
    render(<Harness onDownload={vi.fn()} onDownloadWord={onDownloadWord} initialHeader={{ title: "Minha Prova" }} />);
    fireEvent.click(screen.getByRole("button", { name: /Exportar Word/i }));
    await waitFor(() => expect(onDownloadWord).toHaveBeenCalled());
    const [doc, settings] = onDownloadWord.mock.calls[0];
    expect(doc).toBe(document);
    expect(settings.header).toMatchObject({ title: "Minha Prova" });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Word gerado!"));
  });

  /**
   * Achado 0132: o switch chegava ao PDF e ao "Copiar" e não ao Word — a
   * professora ligava a quebra e baixava um .docx em fluxo contínuo.
   */
  it("repassa o switch de quebra por questão ao Word, como faz com o PDF", async () => {
    const onDownloadWord = vi.fn<(d: CanonicalDocument, s: PanelSettings, ps?: PageStyle) => Promise<void>>().mockResolvedValue(undefined);
    render(<Harness onDownload={vi.fn()} onDownloadWord={onDownloadWord} />);
    fireEvent.click(screen.getByLabelText(/Quebra de página por questão/i));
    fireEvent.click(screen.getByRole("button", { name: /Exportar Word/i }));
    await waitFor(() => expect(onDownloadWord).toHaveBeenCalled());
    expect(onDownloadWord.mock.calls[0][1].pageBreakPerQuestion).toBe(true);
  });

  it("mostra toast de erro quando exportar Word falha", async () => {
    const onDownloadWord = vi.fn().mockRejectedValue(new Error("boom"));
    const { toast } = await import("sonner");
    render(<ExportPanel document={document} onDownload={vi.fn()} onDownloadWord={onDownloadWord} />);
    fireEvent.click(screen.getByRole("button", { name: /Exportar Word/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Erro ao gerar Word."));
  });

  it("date input has type='date' for native browser date picker", () => {
    render(<ExportPanel document={document} onDownload={vi.fn()} />);
    const dateInput = screen.getByLabelText("Data") as HTMLInputElement;
    expect(dateInput.type).toBe("date");
  });

  it("title input enforces maxLength of 120 characters", () => {
    render(<ExportPanel document={document} onDownload={vi.fn()} />);
    const titleInput = screen.getByLabelText("Título") as HTMLInputElement;
    expect(titleInput.maxLength).toBe(120);
  });

  it("school input enforces maxLength of 100 characters", () => {
    render(<ExportPanel document={document} onDownload={vi.fn()} />);
    const schoolInput = screen.getByLabelText("Escola") as HTMLInputElement;
    expect(schoolInput.maxLength).toBe(100);
  });

  it("teacher input enforces maxLength of 80 characters", () => {
    render(<ExportPanel document={document} onDownload={vi.fn()} />);
    const teacherInput = screen.getByLabelText("Professor(a)") as HTMLInputElement;
    expect(teacherInput.maxLength).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// B15 — nada de "Word gerado!" por cima de conteúdo que não foi
// ---------------------------------------------------------------------------

/** Um documento com imagem e fórmula: os dois casos que o Word não carrega fiel. */
const lossyDocument: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [
    { id: id(1), type: "image", src: "https://example.com/a.png", alt: "figura" },
    { id: id(2), type: "blockMath", latex: "x^2" },
  ],
};

describe("aviso antes do download do Word (B15)", () => {
  it("não baixa direto: avisa o que não vai para o Word e espera confirmação", async () => {
    const onDownloadWord = vi.fn().mockResolvedValue(undefined);
    render(
      <ExportPanel document={lossyDocument} onDownload={vi.fn()} onDownloadWord={onDownloadWord} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Exportar Word/i }));

    // O aviso aparece ANTES de qualquer download...
    expect(await screen.findByText(/não são embutidas no Word/i)).toBeInTheDocument();
    expect(screen.getByText(/fórmulas saem como texto LaTeX/i)).toBeInTheDocument();
    expect(onDownloadWord).not.toHaveBeenCalled();
    const { toast } = await import("sonner");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("confirmar baixa o arquivo e só então diz que gerou", async () => {
    const { toast } = await import("sonner");
    const onDownloadWord = vi.fn().mockResolvedValue(undefined);
    render(
      <ExportPanel document={lossyDocument} onDownload={vi.fn()} onDownloadWord={onDownloadWord} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Exportar Word/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Baixar mesmo assim/i }));

    await waitFor(() => expect(onDownloadWord).toHaveBeenCalled());
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Word gerado!"));
  });

  it("cancelar não baixa nada", async () => {
    const { toast } = await import("sonner");
    const onDownloadWord = vi.fn().mockResolvedValue(undefined);
    render(
      <ExportPanel document={lossyDocument} onDownload={vi.fn()} onDownloadWord={onDownloadWord} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Exportar Word/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Cancelar/i }));

    await waitFor(() =>
      expect(screen.queryByText(/não são embutidas no Word/i)).not.toBeInTheDocument(),
    );
    expect(onDownloadWord).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("documento sem perdas baixa direto, sem diálogo", async () => {
    const onDownloadWord = vi.fn().mockResolvedValue(undefined);
    render(<ExportPanel document={document} onDownload={vi.fn()} onDownloadWord={onDownloadWord} />);

    fireEvent.click(screen.getByRole("button", { name: /Exportar Word/i }));

    await waitFor(() => expect(onDownloadWord).toHaveBeenCalled());
    expect(screen.queryByText(/Baixar mesmo assim/i)).not.toBeInTheDocument();
  });

  it("avisa quando a fonte de acessibilidade pode não existir na máquina do leitor", async () => {
    render(
      <ExportPanel
        document={document}
        pageStyle={{ fontFamily: "opendyslexic" }}
        onDownload={vi.fn()}
        onDownloadWord={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Exportar Word/i }));

    expect(await screen.findByText(/OpenDyslexic/i)).toBeInTheDocument();
  });

  it("repassa o pageStyle para o gerador do Word (a fonte precisa chegar ao arquivo)", async () => {
    const onDownloadWord = vi.fn().mockResolvedValue(undefined);
    const pageStyle: PageStyle = { fontFamily: "lexend", fontSize: 14 };
    render(
      <ExportPanel
        document={document}
        pageStyle={pageStyle}
        onDownload={vi.fn()}
        onDownloadWord={onDownloadWord}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Exportar Word/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Baixar mesmo assim/i }));

    await waitFor(() => expect(onDownloadWord).toHaveBeenCalled());
    expect(onDownloadWord.mock.calls[0][2]).toEqual(pageStyle);
  });
});

// ---------------------------------------------------------------------------
// 0003 — a prévia mostra a fórmula tipografada, o PDF imprime o LaTeX cru
// ---------------------------------------------------------------------------

const mathDocument: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [
    { id: id(1), type: "paragraph", content: [{ type: "inlineMath", latex: "E = mc^2" }] },
    { id: id(2), type: "blockMath", latex: "a^2 + b^2 = c^2" },
  ],
};

describe("aviso antes do download do PDF (0003)", () => {
  it("não baixa direto quando há fórmula: avisa que o PDF sai em LaTeX", async () => {
    const onDownload = vi.fn().mockResolvedValue(undefined);
    render(<ExportPanel document={mathDocument} onDownload={onDownload} />);

    fireEvent.click(screen.getByRole("button", { name: /Exportar PDF/i }));

    expect(await screen.findByText(/fórmulas saem como texto LaTeX/i)).toBeInTheDocument();
    expect(onDownload).not.toHaveBeenCalled();
    const { toast } = await import("sonner");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("confirmar baixa o PDF e só então diz que gerou", async () => {
    const { toast } = await import("sonner");
    const onDownload = vi.fn().mockResolvedValue(undefined);
    render(<ExportPanel document={mathDocument} onDownload={onDownload} />);

    fireEvent.click(screen.getByRole("button", { name: /Exportar PDF/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Baixar mesmo assim/i }));

    await waitFor(() => expect(onDownload).toHaveBeenCalled());
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("PDF gerado!"));
  });

  it("cancelar não baixa o PDF", async () => {
    const { toast } = await import("sonner");
    const onDownload = vi.fn().mockResolvedValue(undefined);
    render(<ExportPanel document={mathDocument} onDownload={onDownload} />);

    fireEvent.click(screen.getByRole("button", { name: /Exportar PDF/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Cancelar/i }));

    await waitFor(() =>
      expect(screen.queryByText(/fórmulas saem como texto LaTeX/i)).not.toBeInTheDocument(),
    );
    expect(onDownload).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("com fórmula, o aviso do Word não empurra mais o professor para o PDF", async () => {
    render(
      <ExportPanel
        document={mathDocument}
        onDownload={vi.fn()}
        onDownloadWord={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Exportar Word/i }));

    expect(await screen.findByText(/fórmulas saem como texto LaTeX/i)).toBeInTheDocument();
    expect(screen.queryByText(/Para fidelidade total, exporte em PDF/i)).not.toBeInTheDocument();
  });

  it("documento sem fórmula baixa o PDF direto, sem diálogo", async () => {
    const onDownload = vi.fn().mockResolvedValue(undefined);
    render(<ExportPanel document={document} onDownload={onDownload} />);

    fireEvent.click(screen.getByRole("button", { name: /Exportar PDF/i }));

    await waitFor(() => expect(onDownload).toHaveBeenCalled());
    expect(screen.queryByText(/Baixar mesmo assim/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 0408 — o aviso compara com a prévia, e não afirma diferença onde não há
// ---------------------------------------------------------------------------

/** Só imagem: aqui o PDF é de fato mais fiel que o Word. */
const imageOnlyDocument: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [{ id: id(1), type: "image", src: "https://example.com/a.png", alt: "figura" }],
};

describe("referência do aviso de exportação (0408)", () => {
  it("com fórmula, o aviso do Word não afirma que o item sai diferente do PDF", async () => {
    render(
      <ExportPanel
        document={mathDocument}
        onDownload={vi.fn()}
        onDownloadWord={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Exportar Word/i }));

    expect(await screen.findByText(/fórmulas saem como texto LaTeX/i)).toBeInTheDocument();
    expect(screen.queryByText(/não saem iguais ao PDF/i)).not.toBeInTheDocument();
    expect(screen.getByText(/não saem como aparecem na prévia/i)).toBeInTheDocument();
  });

  it("com imagem e sem fórmula, o Word continua podendo recomendar o PDF", async () => {
    render(
      <ExportPanel
        document={imageOnlyDocument}
        onDownload={vi.fn()}
        onDownloadWord={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Exportar Word/i }));

    expect(await screen.findByText(/não são embutidas no Word/i)).toBeInTheDocument();
    expect(screen.getByText(/não saem como aparecem na prévia/i)).toBeInTheDocument();
    expect(screen.getByText(/Para fidelidade total, exporte em PDF/i)).toBeInTheDocument();
  });
});

describe("ExportPanel — Copiar leva o cabeçalho (achado 0127)", () => {
  it("copies the header fields the preview and the PDF print", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<Harness onDownload={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Minha Prova" } });
    fireEvent.change(screen.getByLabelText("Escola"), { target: { value: "Escola X" } });
    fireEvent.change(screen.getByLabelText("Professor(a)"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-06-04" } });

    fireEvent.click(screen.getByRole("button", { name: /Copiar/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain("Título: Minha Prova");
    expect(copied).toContain("Escola: Escola X");
    expect(copied).toContain("Professor(a): Ana");
    expect(copied).toContain("Data: 04/06/2026");
    expect(copied).toContain("olá mundo");
  });

  it("copies the page break marker when the switch is on", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const twoQuestions: CanonicalDocument = {
      ...document,
      blocks: [
        ...document.blocks,
        {
          id: id(4),
          type: "question",
          stem: [{ id: id(5), type: "paragraph", content: [{ type: "text", text: "q2" }] }],
          answer: { kind: "open" },
        },
      ],
    };
    render(<ExportPanel document={twoQuestions} onDownload={vi.fn()} />);

    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: /Copiar/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toContain("QUEBRA DE PÁGINA");
  });
});
