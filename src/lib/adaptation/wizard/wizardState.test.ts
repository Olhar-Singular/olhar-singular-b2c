import { describe, it, expect } from "vitest";
import {
  INITIAL_WIZARD_DATA,
  activeUploadedExam,
  setDocument,
  setPageStyle,
  setHeader,
  setResult,
  clearResult,
  type UploadedExam,
  type WizardData,
} from "./wizardState";
import { validateDocument } from "@/lib/adaptation/canonical/validate";
import type { AdaptationResult, CanonicalDocument } from "@/lib/adaptation/canonical/schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const doc: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [{ id: id(1), type: "paragraph", content: [{ type: "text", text: "hi" }] }],
};

const result: AdaptationResult = {
  schemaVersion: 1,
  document: doc,
  strategies_applied: ["s"],
  pedagogical_justification: "j",
  implementation_tips: ["t"],
};

describe("INITIAL_WIZARD_DATA", () => {
  it("starts with empty input and no result", () => {
    expect(INITIAL_WIZARD_DATA).toEqual({
      activityType: null,
      activityText: "",
      activityInputMode: "bank",
      uploadedExam: null,
      selectedQuestions: [],
      barriers: [],
      barrierProfileId: null,
      result: null,
    });
  });
});

describe("setResult", () => {
  it("replaces the whole result", () => {
    const next = setResult(INITIAL_WIZARD_DATA, result);
    expect(next.result).toBe(result);
  });

  it("does not mutate the input", () => {
    const prev = { ...INITIAL_WIZARD_DATA };
    setResult(prev, result);
    expect(prev.result).toBeNull();
  });
});

describe("clearResult", () => {
  it("sets result back to null", () => {
    const withResult = setResult(INITIAL_WIZARD_DATA, result);
    expect(clearResult(withResult).result).toBeNull();
  });
});

describe("setDocument", () => {
  it("replaces result.document and keeps a valid document", () => {
    const withResult = setResult(INITIAL_WIZARD_DATA, result);
    const newDoc: CanonicalDocument = {
      schemaVersion: 1,
      blocks: [{ id: id(2), type: "paragraph", content: [{ type: "text", text: "edited" }] }],
    };
    const next = setDocument(withResult, newDoc);
    expect(next.result?.document).toBe(newDoc);
    expect(validateDocument(next.result!.document)).toBeTruthy();
  });

  it("preserves the surrounding result metadata", () => {
    const withResult = setResult(INITIAL_WIZARD_DATA, result);
    const newDoc: CanonicalDocument = {
      schemaVersion: 1,
      blocks: [{ id: id(3), type: "paragraph", content: [{ type: "text", text: "x" }] }],
    };
    const next = setDocument(withResult, newDoc);
    expect(next.result?.strategies_applied).toEqual(["s"]);
    expect(next.result?.pedagogical_justification).toBe("j");
  });

  it("is a no-op when there is no result", () => {
    const data: WizardData = { ...INITIAL_WIZARD_DATA, result: null };
    expect(setDocument(data, doc)).toBe(data);
  });

  it("does not mutate the input result", () => {
    const withResult = setResult(INITIAL_WIZARD_DATA, result);
    const newDoc: CanonicalDocument = {
      schemaVersion: 1,
      blocks: [{ id: id(4), type: "paragraph", content: [{ type: "text", text: "y" }] }],
    };
    setDocument(withResult, newDoc);
    expect(withResult.result?.document).toBe(doc);
  });
});

describe("setPageStyle", () => {
  it("sets result.pageStyle while preserving document and metadata", () => {
    const withResult = setResult(INITIAL_WIZARD_DATA, result);
    const next = setPageStyle(withResult, { fontFamily: "lexend", fontSize: 14 });
    expect(next.result?.pageStyle).toEqual({ fontFamily: "lexend", fontSize: 14 });
    expect(next.result?.document).toBe(doc);
    expect(next.result?.strategies_applied).toEqual(["s"]);
  });

  it("is a no-op when there is no result", () => {
    const data: WizardData = { ...INITIAL_WIZARD_DATA, result: null };
    expect(setPageStyle(data, { fontSize: 12 })).toBe(data);
  });

  it("does not mutate the input result", () => {
    const withResult = setResult(INITIAL_WIZARD_DATA, result);
    setPageStyle(withResult, { blockSpacing: 24 });
    expect(withResult.result?.pageStyle).toBeUndefined();
  });
});

describe("setHeader", () => {
  it("sets result.header while preserving document and metadata", () => {
    const withResult = setResult(INITIAL_WIZARD_DATA, result);
    const next = setHeader(withResult, { title: "Prova", school: "Escola Singular" });
    expect(next.result?.header).toEqual({ title: "Prova", school: "Escola Singular" });
    expect(next.result?.document).toBe(doc);
    expect(next.result?.strategies_applied).toEqual(["s"]);
  });

  it("is a no-op when there is no result", () => {
    const data: WizardData = { ...INITIAL_WIZARD_DATA, result: null };
    expect(setHeader(data, { title: "x" })).toBe(data);
  });

  it("does not mutate the input result", () => {
    const withResult = setResult(INITIAL_WIZARD_DATA, result);
    setHeader(withResult, { teacher: "Ana" });
    expect(withResult.result?.header).toBeUndefined();
  });
});

describe("activeUploadedExam", () => {
  const exam: UploadedExam = {
    fileName: "prova.pdf",
    fileType: "pdf",
    text: "1) Q1",
    pageImages: [],
    file: new File(["x"], "prova.pdf", { type: "application/pdf" }),
  };

  it("returns the attached file while the teacher is in the upload mode", () => {
    expect(activeUploadedExam({ ...INITIAL_WIZARD_DATA, activityInputMode: "upload", uploadedExam: exam })).toBe(exam);
  });

  it("ignores a file left attached after the teacher went back to paste/pick questions", () => {
    // "Voltar" on the upload screen and re-picking the activity type both flip
    // the mode to "bank" and keep the file around: generating must follow the
    // mode, or the abandoned file is read (and charged) instead of the text.
    expect(activeUploadedExam({ ...INITIAL_WIZARD_DATA, activityInputMode: "bank", uploadedExam: exam })).toBeNull();
  });

  it("returns null in the upload mode when no file is attached", () => {
    expect(activeUploadedExam({ ...INITIAL_WIZARD_DATA, activityInputMode: "upload", uploadedExam: null })).toBeNull();
    expect(activeUploadedExam({ ...INITIAL_WIZARD_DATA, activityInputMode: "upload", uploadedExam: undefined })).toBeNull();
  });
});
