import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractExamQuestions } from "./extractExamQuestions";
import type { UploadedExam } from "@/lib/adaptation/wizard/wizardState";

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

const autoCropFromBboxMock = vi.fn();
vi.mock("@/lib/utils/extraction-utils", () => ({
  autoCropFromBbox: (...a: unknown[]) => autoCropFromBboxMock(...a),
  dataUrlToBlob: vi.fn(() => new Blob(["x"], { type: "image/png" })),
}));

const pdfExam: UploadedExam = {
  fileName: "prova.pdf",
  fileType: "pdf",
  text: "1) Q1",
  pageImages: [],
  file: new File(["pdf-bytes"], "prova.pdf", { type: "application/pdf" }),
};

beforeEach(() => {
  vi.clearAllMocks();
  storageUploadMock.mockResolvedValue({ error: null });
  storageGetPublicUrlMock.mockReturnValue({ data: { publicUrl: "https://bucket.example/img.png" } });
});

describe("extractExamQuestions", () => {
  it("invokes extract-exam-for-adaptation with the locally-parsed payload", async () => {
    invokeMock.mockResolvedValueOnce({ data: { questions: [{ text: "Q1" }] }, error: null });
    await extractExamQuestions(pdfExam, "user-1");
    expect(invokeMock).toHaveBeenCalledWith("extract-exam-for-adaptation", {
      body: { pdfText: "1) Q1", pdfFileName: "prova.pdf", pageImages: [] },
      signal: undefined,
    });
  });

  it("forwards an AbortSignal when given one", async () => {
    invokeMock.mockResolvedValueOnce({ data: { questions: [{ text: "Q1" }] }, error: null });
    const controller = new AbortController();
    await extractExamQuestions(pdfExam, "user-1", controller.signal);
    expect(invokeMock).toHaveBeenCalledWith(
      "extract-exam-for-adaptation",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("returns the resolved questions (no options, no image)", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { questions: [{ text: "Primeira" }, { text: "Segunda", options: ["X", "Y"] }] },
      error: null,
    });
    const result = await extractExamQuestions(pdfExam, "user-1");
    expect(result).toEqual({
      status: "ok",
      questions: [
        { text: "Primeira", options: null, image_url: null },
        { text: "Segunda", options: ["X", "Y"], image_url: null },
      ],
    });
  });

  it("returns status 'empty' when no questions come back", async () => {
    invokeMock.mockResolvedValueOnce({ data: { questions: [] }, error: null });
    const result = await extractExamQuestions(pdfExam, "user-1");
    expect(result).toEqual({ status: "empty" });
  });

  it("treats a missing `questions` field as empty", async () => {
    invokeMock.mockResolvedValueOnce({ data: {}, error: null });
    const result = await extractExamQuestions(pdfExam, "user-1");
    expect(result).toEqual({ status: "empty" });
  });

  it("throws with the real backend error message on edge function failure", async () => {
    const fnError = Object.assign(new Error("Edge Function returned a non-2xx status code"), {
      context: { json: async () => ({ error: "Limite de requisições IA atingido. Tente novamente em alguns minutos." }) },
    });
    invokeMock.mockResolvedValueOnce({ data: null, error: fnError });
    await expect(extractExamQuestions(pdfExam, "user-1")).rejects.toThrow(
      /Limite de requisições IA atingido/,
    );
  });

  it("throws a generic fallback when the edge function fails without a parseable body", async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(extractExamQuestions(pdfExam, "user-1")).rejects.toThrow(
      /Não foi possível processar o arquivo enviado/,
    );
  });

  it("crops the page image via bbox for a PDF figure and embeds the resolved URL", async () => {
    const exam: UploadedExam = { ...pdfExam, pageImages: ["data:image/jpeg;base64,PAGE1"] };
    autoCropFromBboxMock.mockResolvedValue("data:image/png;base64,CROPPED");
    invokeMock.mockResolvedValueOnce({
      data: {
        questions: [
          { text: "Com figura", has_figure: true, image_page: 1, figure_bbox: { x: 0, y: 0, width: 1, height: 1 } },
        ],
      },
      error: null,
    });
    const result = await extractExamQuestions(exam, "user-1");
    expect(autoCropFromBboxMock).toHaveBeenCalledWith("data:image/jpeg;base64,PAGE1", { x: 0, y: 0, width: 1, height: 1 });
    expect(storageUploadMock).toHaveBeenCalled();
    expect(result).toEqual({
      status: "ok",
      questions: [{ text: "Com figura", options: null, image_url: "https://bucket.example/img.png" }],
    });
  });

  it("uses the DOCX image directly (no bbox crop) for a DOCX figure", async () => {
    const exam: UploadedExam = {
      fileName: "prova.docx",
      fileType: "docx",
      text: "1) Q1",
      pageImages: ["data:image/png;base64,DOCXIMG"],
    };
    invokeMock.mockResolvedValueOnce({
      data: { questions: [{ text: "Com figura docx", has_figure: true, image_page: 1 }] },
      error: null,
    });
    const result = await extractExamQuestions(exam, "user-1");
    expect(autoCropFromBboxMock).not.toHaveBeenCalled();
    expect(storageUploadMock).toHaveBeenCalled();
    expect(result).toEqual({
      status: "ok",
      questions: [{ text: "Com figura docx", options: null, image_url: "https://bucket.example/img.png" }],
    });
  });

  it("keeps the question without an image marker when the figure upload fails", async () => {
    const exam: UploadedExam = { ...pdfExam, pageImages: ["data:image/jpeg;base64,PAGE1"] };
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
    const result = await extractExamQuestions(exam, "user-1");
    expect(result).toEqual({
      status: "ok",
      questions: [{ text: "Com figura", options: null, image_url: null }],
    });
  });

  it("does not resolve an image when image_page is out of range", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { questions: [{ text: "Sem figura válida", has_figure: true, image_page: 5 }] },
      error: null,
    });
    const result = await extractExamQuestions(pdfExam, "user-1");
    expect(storageUploadMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "ok",
      questions: [{ text: "Sem figura válida", options: null, image_url: null }],
    });
  });
});
