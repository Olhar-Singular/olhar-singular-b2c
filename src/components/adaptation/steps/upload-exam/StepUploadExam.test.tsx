import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers";
import { StepUploadExam } from "./StepUploadExam";
import type { WizardData } from "@/lib/adaptation/wizard/wizardState";

const invokeMock = vi.fn();
const storageUploadMock = vi.fn();
const storageGetPublicUrlMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invokeMock(...a) },
    storage: {
      from: () => ({
        upload: (...a: unknown[]) => storageUploadMock(...a),
        getPublicUrl: (...a: unknown[]) => storageGetPublicUrlMock(...a),
      }),
    },
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({ user: { id: "user-1" } })),
}));

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

const autoCropFromBboxMock = vi.fn();
vi.mock("@/lib/utils/extraction-utils", () => ({
  autoCropFromBbox: (...a: unknown[]) => autoCropFromBboxMock(...a),
  dataUrlToBlob: vi.fn(() => new Blob(["x"], { type: "image/png" })),
}));

const baseData: WizardData = {
  activityType: "prova",
  activityText: "",
  activityInputMode: "upload",
  selectedQuestions: [],
  barriers: [],
  barrierProfileId: null,
  result: null,
};

function pdfFile(name = "prova.pdf") {
  return new File(["pdf-bytes"], name, { type: "application/pdf" });
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

/** Clicks the main "Continuar" button (post-ready state), distinct from the truncation dialog's own. */
function clickContinue() {
  fireEvent.click(screen.getByRole("button", { name: /^continuar$/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  detectFileTypeMock.mockReturnValue("pdf");
  parsePdfMock.mockResolvedValue({ text: "1) Q1", pageImages: [], pageCount: 1, pagesProcessed: [1] });
  storageUploadMock.mockResolvedValue({ error: null });
  storageGetPublicUrlMock.mockReturnValue({ data: { publicUrl: "https://bucket.example/img.png" } });
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

  it("rejects a file that fails magic-byte detection, without calling the edge function", async () => {
    detectFileTypeMock.mockReturnValue("png");
    renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    selectFile(pdfFile());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/PDF ou Word/i));
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("rejects a file over the size cap", async () => {
    renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    const big = pdfFile();
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    selectFile(big);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/muito grande/i));
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("extracts and shows the ready state (ArrowLeft: file card + Continuar) without advancing yet", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { questions: [{ text: "Primeira" }, { text: "Segunda", options: ["X", "Y"] }] },
      error: null,
    });
    const onNext = vi.fn();
    renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={onNext} onPrev={vi.fn()} />);
    selectFile(pdfFile());
    await waitFor(() => expect(screen.getByText(/2 questão\(ões\) prontas/i)).toBeInTheDocument());
    expect(screen.getByText("prova.pdf")).toBeInTheDocument();
    expect(onNext).not.toHaveBeenCalled();
  });

  it("only calls updateData/onNext once the user clicks Continuar", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { questions: [{ text: "Primeira" }, { text: "Segunda", options: ["X", "Y"] }] },
      error: null,
    });
    const updateData = vi.fn();
    const onNext = vi.fn();
    renderWithProviders(<StepUploadExam data={baseData} updateData={updateData} onNext={onNext} onPrev={vi.fn()} />);
    selectFile(pdfFile());
    await waitFor(() => screen.getByText(/prontas para adaptar/i));
    clickContinue();
    await waitFor(() => expect(onNext).toHaveBeenCalled());
    expect(updateData).toHaveBeenCalledWith({
      activityText: "1) Primeira\n\n2) Segunda\n   A) X\n   B) Y",
    });
  });

  it("re-enables Voltar and reveals Continuar once processing finishes successfully", async () => {
    invokeMock.mockResolvedValueOnce({ data: { questions: [{ text: "Q1" }] }, error: null });
    renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    selectFile(pdfFile());
    await waitFor(() => screen.getByText(/prontas para adaptar/i));
    expect(screen.getByRole("button", { name: /voltar/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /^continuar$/i })).toBeInTheDocument();
  });

  it("crops the page image via bbox for a PDF figure, uploads it, and embeds the resolved URL on Continuar", async () => {
    parsePdfMock.mockResolvedValue({
      text: "1) Q1",
      pageImages: ["data:image/jpeg;base64,PAGE1"],
      pageCount: 1,
      pagesProcessed: [1],
    });
    autoCropFromBboxMock.mockResolvedValue("data:image/png;base64,CROPPED");
    invokeMock.mockResolvedValueOnce({
      data: {
        questions: [
          { text: "Com figura", has_figure: true, image_page: 1, figure_bbox: { x: 0, y: 0, width: 1, height: 1 } },
        ],
      },
      error: null,
    });
    const updateData = vi.fn();
    const onNext = vi.fn();
    renderWithProviders(<StepUploadExam data={baseData} updateData={updateData} onNext={onNext} onPrev={vi.fn()} />);
    selectFile(pdfFile());
    await waitFor(() => screen.getByText(/prontas para adaptar/i));
    expect(autoCropFromBboxMock).toHaveBeenCalledWith("data:image/jpeg;base64,PAGE1", { x: 0, y: 0, width: 1, height: 1 });
    expect(storageUploadMock).toHaveBeenCalled();
    clickContinue();
    await waitFor(() => expect(onNext).toHaveBeenCalled());
    expect(updateData).toHaveBeenCalledWith({
      activityText: "1) Com figura\n[IMAGEM: https://bucket.example/img.png]",
    });
  });

  it("uses the DOCX image directly (no bbox crop) for a DOCX figure", async () => {
    detectFileTypeMock.mockReturnValue("docx");
    extractDocxWithImagesMock.mockResolvedValue({
      text: "1) Q1",
      images: ["data:image/png;base64,DOCXIMG"],
    });
    invokeMock.mockResolvedValueOnce({
      data: { questions: [{ text: "Com figura docx", has_figure: true, image_page: 1 }] },
      error: null,
    });
    const updateData = vi.fn();
    const onNext = vi.fn();
    renderWithProviders(<StepUploadExam data={baseData} updateData={updateData} onNext={onNext} onPrev={vi.fn()} />);
    selectFile(new File(["docx-bytes"], "prova.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
    await waitFor(() => screen.getByText(/prontas para adaptar/i));
    expect(autoCropFromBboxMock).not.toHaveBeenCalled();
    expect(storageUploadMock).toHaveBeenCalled();
    clickContinue();
    await waitFor(() => expect(onNext).toHaveBeenCalled());
    expect(updateData).toHaveBeenCalledWith({
      activityText: "1) Com figura docx\n[IMAGEM: https://bucket.example/img.png]",
    });
  });

  it("clicking the dropzone opens the file picker", () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByText(/Arraste um PDF ou Word/i).closest("div")!);
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it("disables the dropzone (no file picker, disabled input) once a file is attached", async () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    invokeMock.mockResolvedValueOnce({ data: { questions: [{ text: "Q1" }] }, error: null });
    renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    selectFile(pdfFile());
    await waitFor(() => screen.getByText(/prontas para adaptar/i));
    clickSpy.mockClear();
    fireEvent.click(screen.getByText(/Arquivo pronto para adaptar/i).closest("div")!);
    expect(clickSpy).not.toHaveBeenCalled();
    expect(document.querySelector("input[data-upload-input]")).toBeDisabled();
    clickSpy.mockRestore();
  });

  it("removing the attached file clears the ready state and re-enables the dropzone", async () => {
    invokeMock.mockResolvedValueOnce({ data: { questions: [{ text: "Q1" }] }, error: null });
    const onNext = vi.fn();
    renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={onNext} onPrev={vi.fn()} />);
    selectFile(pdfFile());
    await waitFor(() => screen.getByText(/prontas para adaptar/i));
    fireEvent.click(screen.getByRole("button", { name: /remover arquivo/i }));
    expect(screen.queryByText(/prontas para adaptar/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^continuar$/i })).not.toBeInTheDocument();
    expect(document.querySelector("input[data-upload-input]")).not.toBeDisabled();

    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByText(/Arraste um PDF ou Word/i).closest("div")!);
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
    expect(onNext).not.toHaveBeenCalled();
  });

  it("keeps the question (without an image marker) when the figure upload fails", async () => {
    parsePdfMock.mockResolvedValue({
      text: "1) Q1",
      pageImages: ["data:image/jpeg;base64,PAGE1"],
      pageCount: 1,
      pagesProcessed: [1],
    });
    autoCropFromBboxMock.mockResolvedValue("data:image/png;base64,CROPPED");
    storageUploadMock.mockResolvedValueOnce({ error: { message: "storage down" } });
    invokeMock.mockResolvedValueOnce({
      data: {
        questions: [
          { text: "Com figura", has_figure: true, image_page: 1, figure_bbox: { x: 0, y: 0, width: 1, height: 1 } },
        ],
      },
      error: null,
    });
    const updateData = vi.fn();
    const onNext = vi.fn();
    renderWithProviders(<StepUploadExam data={baseData} updateData={updateData} onNext={onNext} onPrev={vi.fn()} />);
    selectFile(pdfFile());
    await waitFor(() => screen.getByText(/prontas para adaptar/i));
    clickContinue();
    await waitFor(() => expect(onNext).toHaveBeenCalled());
    expect(updateData).toHaveBeenCalledWith({ activityText: "1) Com figura" });
  });

  it("ignores a change event with no selected file", () => {
    renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    const input = document.querySelector("input[data-upload-input]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("treats a missing `questions` field in the response as no questions found", async () => {
    invokeMock.mockResolvedValueOnce({ data: {}, error: null });
    const onNext = vi.fn();
    renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={onNext} onPrev={vi.fn()} />);
    selectFile(pdfFile());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Não foi possível identificar questões/i));
    expect(onNext).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when a non-Error value is thrown", async () => {
    parsePdfMock.mockRejectedValueOnce("plain string failure");
    const onNext = vi.fn();
    renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={onNext} onPrev={vi.fn()} />);
    selectFile(pdfFile());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Falha ao processar o arquivo/i));
    expect(onNext).not.toHaveBeenCalled();
  });

  it("shows an error and does not advance when no questions are extracted", async () => {
    invokeMock.mockResolvedValueOnce({ data: { questions: [] }, error: null });
    const onNext = vi.fn();
    renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={onNext} onPrev={vi.fn()} />);
    selectFile(pdfFile());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Não foi possível identificar questões/i));
    expect(onNext).not.toHaveBeenCalled();
  });

  it("shows an error and does not advance when the edge function fails", async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const onNext = vi.fn();
    renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={onNext} onPrev={vi.fn()} />);
    selectFile(pdfFile());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Não foi possível processar/i));
    expect(onNext).not.toHaveBeenCalled();
  });

  it("warns before proceeding when more than 12 questions are extracted, and does not show Continuar yet", async () => {
    const questions = Array.from({ length: 15 }, (_, i) => ({ text: `Questão ${i + 1}` }));
    invokeMock.mockResolvedValueOnce({ data: { questions }, error: null });
    const onNext = vi.fn();
    renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={onNext} onPrev={vi.fn()} />);
    selectFile(pdfFile());
    await waitFor(() => expect(screen.getByText(/15 questões/i)).toBeInTheDocument());
    expect(screen.getByText(/limite para essa adaptação é 12/i)).toBeInTheDocument();
    expect(screen.queryByText(/prontas para adaptar/i)).not.toBeInTheDocument();
    expect(onNext).not.toHaveBeenCalled();
  });

  it("truncates to the first 12 questions, enters the ready state, and only advances on Continuar", async () => {
    const questions = Array.from({ length: 15 }, (_, i) => ({ text: `Questão ${i + 1}` }));
    invokeMock.mockResolvedValueOnce({ data: { questions }, error: null });
    const updateData = vi.fn();
    const onNext = vi.fn();
    renderWithProviders(<StepUploadExam data={baseData} updateData={updateData} onNext={onNext} onPrev={vi.fn()} />);
    selectFile(pdfFile());
    await waitFor(() => screen.getByText(/15 questões/i));
    fireEvent.click(screen.getByRole("button", { name: /^continuar$/i })); // confirms the truncation dialog
    await waitFor(() => screen.getByText(/12 questão\(ões\) prontas/i));
    expect(onNext).not.toHaveBeenCalled();
    clickContinue();
    await waitFor(() => expect(onNext).toHaveBeenCalled());
    const text = updateData.mock.calls[0][0].activityText as string;
    expect(text).toContain("12) Questão 12");
    expect(text).not.toContain("Questão 13");
  });

  it("cancelling the 12-question warning does not advance and does not enter the ready state", async () => {
    const questions = Array.from({ length: 13 }, (_, i) => ({ text: `Questão ${i + 1}` }));
    invokeMock.mockResolvedValueOnce({ data: { questions }, error: null });
    const onNext = vi.fn();
    renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={onNext} onPrev={vi.fn()} />);
    selectFile(pdfFile());
    await waitFor(() => screen.getByText(/13 questões/i));
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    await waitFor(() => expect(screen.queryByText(/limite para essa adaptação/i)).not.toBeInTheDocument());
    expect(screen.queryByText(/prontas para adaptar/i)).not.toBeInTheDocument();
    expect(onNext).not.toHaveBeenCalled();
  });

  it("disables Voltar while processing", async () => {
    invokeMock.mockImplementation(() => new Promise(() => undefined));
    renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    selectFile(pdfFile());
    await waitFor(() => expect(screen.getByText(/Lendo/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /voltar/i })).toBeDisabled();
  });

  it("re-enables Voltar once processing finishes (error path)", async () => {
    invokeMock.mockResolvedValueOnce({ data: { questions: [] }, error: null });
    renderWithProviders(<StepUploadExam data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    selectFile(pdfFile());
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /voltar/i })).not.toBeDisabled();
  });

  it("reports loading state via onLoadingChange while processing, then false once ready", async () => {
    invokeMock.mockResolvedValueOnce({ data: { questions: [{ text: "Q1" }] }, error: null });
    const onLoadingChange = vi.fn();
    renderWithProviders(
      <StepUploadExam data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} onLoadingChange={onLoadingChange} />,
    );
    selectFile(pdfFile());
    await waitFor(() => screen.getByText(/prontas para adaptar/i));
    expect(onLoadingChange).toHaveBeenNthCalledWith(1, true);
    expect(onLoadingChange).toHaveBeenLastCalledWith(false);
  });

  it("reports loading state as false after a failed extraction too", async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const onLoadingChange = vi.fn();
    renderWithProviders(
      <StepUploadExam data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} onLoadingChange={onLoadingChange} />,
    );
    selectFile(pdfFile());
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(onLoadingChange).toHaveBeenLastCalledWith(false);
  });

  it("does not enter the ready state if the component unmounts while the extraction request is still resolving", async () => {
    const d = deferred<{ data: unknown; error: unknown }>();
    invokeMock.mockReturnValueOnce(d.promise);
    const updateData = vi.fn();
    const onNext = vi.fn();
    const { unmount } = renderWithProviders(
      <StepUploadExam data={baseData} updateData={updateData} onNext={onNext} onPrev={vi.fn()} />,
    );
    selectFile(pdfFile());
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    unmount();
    d.resolve({ data: { questions: [{ text: "Q1" }] }, error: null });
    await flushMicrotasks();
    expect(updateData).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  it("does not enter the ready state if the component unmounts while resolving a figure image", async () => {
    parsePdfMock.mockResolvedValue({
      text: "1) Q1",
      pageImages: ["data:image/jpeg;base64,PAGE1"],
      pageCount: 1,
      pagesProcessed: [1],
    });
    invokeMock.mockResolvedValueOnce({
      data: { questions: [{ text: "Com figura", has_figure: true, image_page: 1 }] },
      error: null,
    });
    const d = deferred<{ error: unknown }>();
    storageUploadMock.mockReturnValueOnce(d.promise);
    const updateData = vi.fn();
    const onNext = vi.fn();
    const { unmount } = renderWithProviders(
      <StepUploadExam data={baseData} updateData={updateData} onNext={onNext} onPrev={vi.fn()} />,
    );
    selectFile(pdfFile());
    await waitFor(() => expect(storageUploadMock).toHaveBeenCalled());
    unmount();
    d.resolve({ error: null });
    await flushMicrotasks();
    expect(updateData).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
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
    // treated a perfectly live component as unmounted forever. The symptom was
    // exactly what showed up in the browser: the edge function returned 200,
    // but the spinner never stopped, because `finally`'s setProcessing(false)
    // was itself gated on the same (wrongly false) ref.
    invokeMock.mockResolvedValueOnce({ data: { questions: [{ text: "Q1" }] }, error: null });
    const onLoadingChange = vi.fn();
    renderWithProviders(
      <StrictMode>
        <StepUploadExam
          data={baseData}
          updateData={vi.fn()}
          onNext={vi.fn()}
          onPrev={vi.fn()}
          onLoadingChange={onLoadingChange}
        />
      </StrictMode>,
    );
    selectFile(pdfFile());
    await waitFor(() => screen.getByText(/prontas para adaptar/i));
    expect(onLoadingChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("button", { name: /^continuar$/i })).toBeInTheDocument();
  });
});
