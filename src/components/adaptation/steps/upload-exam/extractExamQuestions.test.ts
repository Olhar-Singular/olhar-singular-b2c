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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A fresh object per test: a successful extraction is remembered per attached
// file (object identity), and must not leak from one test into the next.
let pdfExam: UploadedExam;

beforeEach(() => {
  pdfExam = {
    fileName: "prova.pdf",
    fileType: "pdf",
    text: "1) Q1",
    pageImages: [],
    file: new File(["pdf-bytes"], "prova.pdf", { type: "application/pdf" }),
  };
  vi.clearAllMocks();
  storageUploadMock.mockResolvedValue({ error: null });
  storageGetPublicUrlMock.mockReturnValue({ data: { publicUrl: "https://bucket.example/img.png" } });
});

describe("extractExamQuestions", () => {
  it("invokes extract-exam-for-adaptation with the locally-parsed payload and a request_id", async () => {
    invokeMock.mockResolvedValueOnce({ data: { questions: [{ text: "Q1" }] }, error: null });
    await extractExamQuestions(pdfExam, "user-1");
    expect(invokeMock).toHaveBeenCalledWith("extract-exam-for-adaptation", {
      body: { pdfText: "1) Q1", pdfFileName: "prova.pdf", pageImages: [], request_id: expect.stringMatching(UUID) },
      signal: undefined,
    });
  });

  it("uses a FRESH request_id per attempt (a retry is a new charge, not a replay)", async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(extractExamQuestions(pdfExam, "user-1")).rejects.toThrow();
    invokeMock.mockResolvedValueOnce({ data: { questions: [{ text: "Q1" }] }, error: null });
    await extractExamQuestions(pdfExam, "user-1");
    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(invokeMock.mock.calls[0][1].body.request_id).not.toBe(invokeMock.mock.calls[1][1].body.request_id);
  });

  it("reports insufficient credits (402) as a result, not an error", async () => {
    const fnError = Object.assign(new Error("Edge Function returned a non-2xx status code"), {
      context: { status: 402, json: async () => ({ error: "Créditos insuficientes.", reason: "insufficient_credits" }) },
    });
    invokeMock.mockResolvedValueOnce({ data: null, error: fnError });
    await expect(extractExamQuestions(pdfExam, "user-1")).resolves.toEqual({ status: "insufficient_credits" });
  });

  it("reuses a successful extraction of the same file instead of paying for it again", async () => {
    // "Tentar novamente" after a failed adaptation, the >12-question detour and
    // "Regerar" all come back here with the same attached file.
    invokeMock.mockResolvedValueOnce({ data: { questions: [{ text: "Q1" }] }, error: null });
    const first = await extractExamQuestions(pdfExam, "user-1");
    const second = await extractExamQuestions(pdfExam, "user-1");
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ status: "ok", questions: [{ text: "Q1", options: null, image_url: null }], charged: true });
    expect(second).toEqual({ status: "ok", questions: [{ text: "Q1", options: null, image_url: null }], charged: false });
  });

  it("extracts again (and charges) for a newly attached file", async () => {
    invokeMock.mockResolvedValue({ data: { questions: [{ text: "Q1" }] }, error: null });
    await extractExamQuestions(pdfExam, "user-1");
    await extractExamQuestions({ ...pdfExam }, "user-1");
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it("does not remember an empty extraction: trying again runs a new one", async () => {
    invokeMock
      .mockResolvedValueOnce({ data: { questions: [] }, error: null })
      .mockResolvedValueOnce({ data: { questions: [{ text: "Q1" }] }, error: null });
    await expect(extractExamQuestions(pdfExam, "user-1")).resolves.toEqual({ status: "empty" });
    await expect(extractExamQuestions(pdfExam, "user-1")).resolves.toMatchObject({ status: "ok", charged: true });
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
      charged: true,
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
      charged: true,
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
      charged: true,
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
      charged: true,
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
      charged: true,
    });
  });
});
