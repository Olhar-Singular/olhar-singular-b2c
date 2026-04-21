import { describe, it, expect } from "vitest";
import {
  validatePdfMagicBytes,
  validateDocxMagicBytes,
  validateImageMagicBytes,
  detectFileType,
} from "./fileValidation";

const pdf  = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00]); // %PDF
const docx = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0x00]); // PK..
const jpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0x00]);
const png  = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);
const junk = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
const short = new Uint8Array([0x25]);                          // too short

describe("validatePdfMagicBytes", () => {
  it("returns true for PDF magic bytes", () => {
    expect(validatePdfMagicBytes(pdf)).toBe(true);
  });
  it("returns false for non-PDF bytes", () => {
    expect(validatePdfMagicBytes(docx)).toBe(false);
  });
  it("returns false for too-short buffer", () => {
    expect(validatePdfMagicBytes(short)).toBe(false);
  });
});

describe("validateDocxMagicBytes", () => {
  it("returns true for DOCX/ZIP magic bytes", () => {
    expect(validateDocxMagicBytes(docx)).toBe(true);
  });
  it("returns false for PDF bytes", () => {
    expect(validateDocxMagicBytes(pdf)).toBe(false);
  });
  it("returns false for too-short buffer", () => {
    expect(validateDocxMagicBytes(short)).toBe(false);
  });
});

describe("validateImageMagicBytes", () => {
  it("returns 'jpeg' for JPEG magic bytes", () => {
    expect(validateImageMagicBytes(jpeg)).toBe("jpeg");
  });
  it("returns 'png' for PNG magic bytes", () => {
    expect(validateImageMagicBytes(png)).toBe("png");
  });
  it("returns null for non-image bytes", () => {
    expect(validateImageMagicBytes(pdf)).toBeNull();
  });
  it("returns null for junk bytes", () => {
    expect(validateImageMagicBytes(junk)).toBeNull();
  });
});

describe("detectFileType", () => {
  it("detects pdf", () => expect(detectFileType(pdf)).toBe("pdf"));
  it("detects docx", () => expect(detectFileType(docx)).toBe("docx"));
  it("detects jpeg", () => expect(detectFileType(jpeg)).toBe("jpeg"));
  it("detects png", () => expect(detectFileType(png)).toBe("png"));
  it("returns null for unknown", () => expect(detectFileType(junk)).toBeNull());
});
