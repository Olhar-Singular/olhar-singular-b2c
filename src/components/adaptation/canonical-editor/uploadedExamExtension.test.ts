import { describe, it, expect } from "vitest";
import { UploadedExamExtension } from "./uploadedExamExtension";

describe("UploadedExamExtension", () => {
  it("has the correct name", () => {
    expect(UploadedExamExtension.name).toBe("uploadedExam");
  });

  it("defaults options to no file, no pages, no user (Banco de Questões path)", () => {
    const addOptionsFn = (UploadedExamExtension as { config: { addOptions?: () => unknown } }).config.addOptions;
    expect(addOptionsFn?.call({})).toEqual({ file: null, pageImages: [], userId: null });
  });

  it("seeds storage from the configured options", () => {
    const file = new File(["pdf-bytes"], "prova.pdf", { type: "application/pdf" });
    const addStorageFn = (UploadedExamExtension as { config: { addStorage?: () => unknown } }).config.addStorage;
    const storage = addStorageFn?.call({
      options: { file, pageImages: ["data:image/png;base64,PAGE1"], userId: "user-1" },
    });
    expect(storage).toEqual({ file, pageImages: ["data:image/png;base64,PAGE1"], userId: "user-1" });
  });

  it("is a Tiptap Extension (has an extend method)", () => {
    expect(typeof UploadedExamExtension.extend).toBe("function");
  });
});
