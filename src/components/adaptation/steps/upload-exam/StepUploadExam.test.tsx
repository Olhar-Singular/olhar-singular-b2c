import { StrictMode, useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/helpers";
import { StepUploadExam } from "./StepUploadExam";
import type { WizardData } from "@/lib/adaptation/wizard/wizardState";

const parsePdfMock = vi.fn();
vi.mock("@/lib/utils/pdf-utils", () => ({
  parsePdf: (...a: unknown[]) => parsePdfMock(...a),
}));

const extractDocxWithImagesMock = vi.fn();
vi.mock("@/lib/utils/docx-utils", () => ({
  extractDocxWithImages: (...a: unknown[]) => extractDocxWithImagesMock(...a),
}));

const detectFileTypeMock = vi.fn();
vi.mock("@/lib/utils/fileValidation", () => ({
  detectFileType: (...a: unknown[]) => detectFileTypeMock(...a),
}));

const baseData: WizardData = {
  activityType: "prova",
  activityText: "",
  activityInputMode: "upload",
  uploadedExam: null,
  selectedQuestions: [],
  barriers: [],
  barrierProfileId: null,
  result: null,
};

function pdfFile(name = "prova.pdf") {
  return new File(["pdf-bytes"], name, { type: "application/pdf" });
}

/** An already-attached uploadedExam fixture — used where the exact file identity isn't asserted. */
function attachedExam() {
  return { fileName: "prova.pdf", fileType: "pdf" as const, text: "1) Q1", pageImages: [], file: pdfFile() };
}

function selectFile(file: File) {
  const input = document.querySelector("input[data-upload-input]") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Flushes pending microtasks so a promise resolved/rejected after unmount settles. */
function flushMicrotasks() {
  return new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  detectFileTypeMock.mockReturnValue("pdf");
  parsePdfMock.mockResolvedValue({ text: "1) Q1", pageImages: [], pageCount: 1, pagesProcessed: [1] });
});

describe("StepUploadExam", () => {
  it("renders the dropzone with instructions", () => {
    renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    expect(screen.getByText(/Adaptar direto do arquivo/i)).toBeInTheDocument();
    expect(screen.getByText(/Arraste um PDF ou Word/i)).toBeInTheDocument();
  });

  it("Voltar returns to the tabs (bank mode) instead of leaving the step", () => {
    const updateData = vi.fn();
    const onPrev = vi.fn();
    renderWithProviders(<StepUploadExam data={baseData} updateData={updateData} onNext={vi.fn()} onPrev={onPrev} />);
    fireEvent.click(screen.getByRole("button", { name: /voltar/i }));
    expect(updateData).toHaveBeenCalledWith({ activityInputMode: "bank" });
    expect(onPrev).not.toHaveBeenCalled();
  });

  it("rejects a file that fails magic-byte detection, without parsing it", async () => {
    detectFileTypeMock.mockReturnValue("png");
    renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    selectFile(pdfFile());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/PDF ou Word/i));
    expect(parsePdfMock).not.toHaveBeenCalled();
  });

  it("rejects a file over the size cap", async () => {
    renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    const big = pdfFile();
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    selectFile(big);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/muito grande/i));
    expect(parsePdfMock).not.toHaveBeenCalled();
  });

  it("stores the locally-parsed file as uploadedExam and shows the ready state, without advancing yet", async () => {
    const updateData = vi.fn();
    const onNext = vi.fn();
    renderWithProviders(<StepUploadExam data={baseData} updateData={updateData} onNext={onNext} onPrev={vi.fn()} />);
    const file = pdfFile();
    selectFile(file);
    await waitFor(() => expect(updateData).toHaveBeenCalledWith({
      uploadedExam: { fileName: "prova.pdf", fileType: "pdf", text: "1) Q1", pageImages: [], file },
      result: null,
    }));
    expect(onNext).not.toHaveBeenCalled();
  });

  // StepGenerate only generates when `data.result` is empty, so a leftover
  // result from a previous adaptation makes the Gerar step silently do
  // nothing: the teacher uploads a second exam and lands back on the FIRST
  // adaptation. The generated row is already saved server-side, so dropping
  // the local copy costs nothing — it stays in "Minhas adaptações".
  it("discards the previous adaptation when a different exam is attached", async () => {
    const updateData = vi.fn();
    const withPreviousResult = {
      ...baseData,
      result: { schemaVersion: 1, document: { schemaVersion: 1, blocks: [] } },
    } as unknown as typeof baseData;
    renderWithProviders(
      <StepUploadExam data={withPreviousResult} updateData={updateData} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    selectFile(pdfFile());
    await waitFor(() =>
      expect(updateData).toHaveBeenCalledWith(expect.objectContaining({ result: null })),
    );
  });

  it("parses a DOCX file via extractDocxWithImages", async () => {
    detectFileTypeMock.mockReturnValue("docx");
    extractDocxWithImagesMock.mockResolvedValue({ text: "1) Q1", images: ["data:image/png;base64,IMG"] });
    const updateData = vi.fn();
    renderWithProviders(<StepUploadExam data={baseData} updateData={updateData} onNext={vi.fn()} onPrev={vi.fn()} />);
    const file = new File(["docx-bytes"], "prova.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    selectFile(file);
    await waitFor(() => expect(updateData).toHaveBeenCalledWith({
      uploadedExam: { fileName: "prova.docx", fileType: "docx", text: "1) Q1", pageImages: ["data:image/png;base64,IMG"], file },
      result: null,
    }));
  });

  it("shows the attached file card once uploadedExam is set, and Continuar advances without touching activityText", () => {
    const onNext = vi.fn();
    const attachedData: WizardData = {
      ...baseData,
      uploadedExam: attachedExam(),
    };
    renderWithProviders(<StepUploadExam data={attachedData} updateData={vi.fn()} onNext={onNext} onPrev={vi.fn()} />);
    expect(screen.getByText("prova.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /voltar/i })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /^continuar$/i }));
    expect(onNext).toHaveBeenCalled();
  });

  it("clicking the dropzone opens the file picker", () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByText(/Arraste um PDF ou Word/i).closest("div")!);
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it("disables the dropzone (no file picker, disabled input) once a file is attached", () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    const attachedData: WizardData = {
      ...baseData,
      uploadedExam: attachedExam(),
    };
    renderWithProviders(<StepUploadExam data={attachedData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByText(/Arquivo pronto para adaptar/i).closest("div")!);
    expect(clickSpy).not.toHaveBeenCalled();
    expect(document.querySelector("input[data-upload-input]")).toBeDisabled();
    clickSpy.mockRestore();
  });

  // Regression (1115): the dashed area was a <div> with no role/tabindex and the
  // file input was display:none, so keyboard and screen-reader users could not
  // reach the only way to pick a file.
  describe("1115: the dropzone is keyboard-operable", () => {
    function render(data: WizardData = baseData) {
      renderWithProviders(<StepUploadExam data={data} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
      return screen.getByRole("button", { name: /escolher arquivo/i });
    }

    it("exposes the area as a focusable named button reachable by Tab", async () => {
      const user = userEvent.setup();
      const dropzone = render();
      expect(dropzone).toHaveAttribute("tabindex", "0");
      for (let i = 0; i < 5 && document.activeElement !== dropzone; i++) await user.tab();
      expect(document.activeElement).toBe(dropzone);
    });

    it("opens the file picker with Enter and Space, ignoring other keys", () => {
      const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
      const dropzone = render();
      fireEvent.keyDown(dropzone, { key: "a" });
      expect(clickSpy).not.toHaveBeenCalled();
      fireEvent.keyDown(dropzone, { key: "Enter" });
      expect(clickSpy).toHaveBeenCalledTimes(1);
      fireEvent.keyDown(dropzone, { key: " " });
      expect(clickSpy).toHaveBeenCalledTimes(2);
      clickSpy.mockRestore();
    });

    it("is aria-disabled, out of the tab order and inert to keys once a file is attached", () => {
      const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
      const dropzone = render({ ...baseData, uploadedExam: attachedExam() });
      expect(dropzone).toHaveAttribute("aria-disabled", "true");
      expect(dropzone).toHaveAttribute("tabindex", "-1");
      fireEvent.keyDown(dropzone, { key: "Enter" });
      expect(clickSpy).not.toHaveBeenCalled();
      clickSpy.mockRestore();
    });
  });

  // Regression (1114): the dropzone says "Arraste ... aqui" but had no drag
  // handlers, so dropping a file let the browser open it in the tab, taking the
  // teacher out of the app and losing Tipo/Atividade.
  describe("drag and drop", () => {
    function dropzone() {
      return (document.querySelector("input[data-upload-input]") as HTMLInputElement).parentElement!;
    }

    it("prevents the browser default on dragover and drop, and parses the dropped file", async () => {
      const updateData = vi.fn();
      renderWithProviders(<StepUploadExam data={baseData} updateData={updateData} onNext={vi.fn()} onPrev={vi.fn()} />);
      const file = pdfFile();
      expect(fireEvent.dragOver(dropzone(), { dataTransfer: { files: [file], dropEffect: "none" } })).toBe(false);
      expect(fireEvent.drop(dropzone(), { dataTransfer: { files: [file] } })).toBe(false);
      await waitFor(() =>
        expect(updateData).toHaveBeenCalledWith({
          uploadedExam: { fileName: "prova.pdf", fileType: "pdf", text: "1) Q1", pageImages: [], file },
          result: null,
        }),
      );
    });

    it("highlights the zone while a file is dragged over it and clears it on leave", () => {
      renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
      fireEvent.dragOver(dropzone(), { dataTransfer: { files: [], dropEffect: "none" } });
      expect(screen.getByText(/Solte o arquivo aqui/i)).toBeInTheDocument();
      fireEvent.dragLeave(dropzone());
      expect(screen.queryByText(/Solte o arquivo aqui/i)).not.toBeInTheDocument();
      expect(screen.getByText(/Arraste um PDF ou Word/i)).toBeInTheDocument();
    });

    it("ignores a drop with no file, still blocking the browser default", () => {
      renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
      expect(fireEvent.drop(dropzone(), { dataTransfer: { files: [] } })).toBe(false);
      expect(parsePdfMock).not.toHaveBeenCalled();
    });

    it("blocks the browser default but ignores the drop once a file is attached", () => {
      const dataTransfer = { files: [pdfFile()], dropEffect: "copy" };
      renderWithProviders(
        <StepUploadExam data={{ ...baseData, uploadedExam: attachedExam() }} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
      );
      expect(fireEvent.dragOver(dropzone(), { dataTransfer })).toBe(false);
      expect(dataTransfer.dropEffect).toBe("none");
      expect(screen.queryByText(/Solte o arquivo aqui/i)).not.toBeInTheDocument();
      expect(fireEvent.drop(dropzone(), { dataTransfer })).toBe(false);
      expect(parsePdfMock).not.toHaveBeenCalled();
    });

    it("ignores a second drop while the first file is still being parsed", async () => {
      const pending = deferred<{ text: string; pageImages: string[] }>();
      parsePdfMock.mockReturnValue(pending.promise);
      renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
      fireEvent.drop(dropzone(), { dataTransfer: { files: [pdfFile()] } });
      await waitFor(() => expect(screen.getByText(/Lendo o arquivo/i)).toBeInTheDocument());
      fireEvent.drop(dropzone(), { dataTransfer: { files: [pdfFile("outra.pdf")] } });
      await flushMicrotasks();
      expect(parsePdfMock).toHaveBeenCalledTimes(1);
      pending.resolve({ text: "1) Q1", pageImages: [] });
      await waitFor(() => expect(screen.queryByText(/Lendo o arquivo/i)).not.toBeInTheDocument());
    });
  });

  it("removing the attached file clears uploadedExam and re-enables the dropzone", () => {
    const updateData = vi.fn();
    const attachedData: WizardData = {
      ...baseData,
      uploadedExam: attachedExam(),
    };
    renderWithProviders(<StepUploadExam data={attachedData} updateData={updateData} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /remover arquivo/i }));
    expect(updateData).toHaveBeenCalledWith({ uploadedExam: null });
  });

  describe("1116: removing the file keeps keyboard focus and announces it", () => {
    function Harness() {
      const [data, setData] = useState<WizardData>({ ...baseData, uploadedExam: attachedExam() });
      return (
        <StepUploadExam
          data={data}
          updateData={(partial) => setData((d) => ({ ...d, ...partial }))}
          onNext={vi.fn()}
          onPrev={vi.fn()}
        />
      );
    }

    it("moves focus to the re-enabled dropzone instead of dropping it on <body>", async () => {
      const user = userEvent.setup();
      renderWithProviders(<Harness />);
      screen.getByRole("button", { name: /remover arquivo/i }).focus();
      await user.keyboard("{Enter}");
      const zone = screen.getByRole("button", { name: /escolher arquivo pdf ou word/i });
      expect(document.activeElement).toBe(zone);
      expect(document.activeElement).not.toBe(document.body);
    });

    it("announces the removal in a polite live region", async () => {
      const user = userEvent.setup();
      renderWithProviders(<Harness />);
      await user.click(screen.getByRole("button", { name: /remover arquivo/i }));
      expect(screen.getByRole("status")).toHaveTextContent(/arquivo removido/i);
    });

    it("does not steal focus on first render without an attached file", () => {
      renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
      expect(document.activeElement).toBe(document.body);
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
    });
  });

  it("ignores a change event with no selected file", () => {
    renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    const input = document.querySelector("input[data-upload-input]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    expect(parsePdfMock).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when a non-Error value is thrown during parsing", async () => {
    parsePdfMock.mockRejectedValueOnce("plain string failure");
    renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    selectFile(pdfFile());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Não foi possível ler este arquivo/i));
  });

  it("shows a pt-BR message instead of the raw pdf.js error for a corrupted PDF (1113)", async () => {
    parsePdfMock.mockRejectedValueOnce(new Error("Invalid PDF structure."));
    renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    selectFile(pdfFile());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Não foi possível ler este arquivo/i);
    expect(alert).not.toHaveTextContent(/Invalid PDF structure/i);
  });

  it("shows a pt-BR message instead of the raw JSZip error for a corrupted DOCX (1113)", async () => {
    detectFileTypeMock.mockReturnValue("docx");
    extractDocxWithImagesMock.mockRejectedValueOnce(new Error("Corrupted zip: can't find end of central directory"));
    renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    selectFile(pdfFile());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Não foi possível ler este arquivo/i);
    expect(alert).not.toHaveTextContent(/Corrupted zip/i);
  });

  it("disables Voltar while processing", async () => {
    parsePdfMock.mockImplementation(() => new Promise(() => undefined));
    renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    selectFile(pdfFile());
    await waitFor(() => expect(screen.getByText(/Lendo o arquivo/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /voltar/i })).toBeDisabled();
  });

  it("re-enables Voltar once processing finishes (error path)", async () => {
    detectFileTypeMock.mockReturnValue("png");
    renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    selectFile(pdfFile());
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /voltar/i })).not.toBeDisabled();
  });

  it("reports loading state via onLoadingChange while processing, then false once done", async () => {
    const onLoadingChange = vi.fn();
    renderWithProviders(
      <StepUploadExam data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} onLoadingChange={onLoadingChange} />,
    );
    selectFile(pdfFile());
    await waitFor(() => expect(onLoadingChange).toHaveBeenLastCalledWith(false));
    expect(onLoadingChange).toHaveBeenNthCalledWith(1, true);
  });

  it("reports loading state as false after a failed parse too", async () => {
    parsePdfMock.mockRejectedValueOnce(new Error("boom"));
    const onLoadingChange = vi.fn();
    renderWithProviders(
      <StepUploadExam data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} onLoadingChange={onLoadingChange} />,
    );
    selectFile(pdfFile());
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(onLoadingChange).toHaveBeenLastCalledWith(false);
  });

  it("does not call updateData if the component unmounts while the parse is still resolving", async () => {
    const d = deferred<{ text: string; pageImages: string[]; pageCount: number; pagesProcessed: number[] }>();
    parsePdfMock.mockReturnValueOnce(d.promise);
    const updateData = vi.fn();
    const { unmount } = renderWithProviders(
      <StepUploadExam data={baseData} updateData={updateData} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    selectFile(pdfFile());
    await waitFor(() => expect(parsePdfMock).toHaveBeenCalled());
    unmount();
    d.resolve({ text: "1) Q1", pageImages: [], pageCount: 1, pagesProcessed: [1] });
    await flushMicrotasks();
    expect(updateData).not.toHaveBeenCalled();
  });

  it("does not throw if a parse rejection settles after the component has unmounted", async () => {
    const d = deferred<never>();
    parsePdfMock.mockReturnValueOnce(d.promise);
    const { unmount } = renderWithProviders(
      <StepUploadExam data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    selectFile(pdfFile());
    await waitFor(() => expect(parsePdfMock).toHaveBeenCalled());
    unmount();
    d.reject(new Error("boom"));
    await expect(flushMicrotasks()).resolves.toBeUndefined();
  });

  it("reaches the ready state under StrictMode's double-invoked effects (regression: loading never stopped)", async () => {
    // <StrictMode> (the app's real setup, per main.tsx) mounts effects twice:
    // mount → cleanup → mount. mountedRef used to be set to `true` only via the
    // initial useRef(true), never inside the effect itself — so the throwaway
    // first cleanup left it permanently `false`, and every guard downstream
    // treated a perfectly live component as unmounted forever.
    const updateData = vi.fn();
    const onLoadingChange = vi.fn();
    renderWithProviders(
      <StrictMode>
        <StepUploadExam
          data={baseData}
          updateData={updateData}
          onNext={vi.fn()}
          onPrev={vi.fn()}
          onLoadingChange={onLoadingChange}
        />
      </StrictMode>,
    );
    selectFile(pdfFile());
    await waitFor(() => expect(updateData).toHaveBeenCalled());
    expect(onLoadingChange).toHaveBeenLastCalledWith(false);
  });
});
