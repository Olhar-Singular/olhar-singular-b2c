import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
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
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Falha ao processar o arquivo/i));
  });

  it("surfaces a thrown Error's message when parsing fails", async () => {
    parsePdfMock.mockRejectedValueOnce(new Error("PDF corrompido"));
    renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    selectFile(pdfFile());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/PDF corrompido/i));
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
