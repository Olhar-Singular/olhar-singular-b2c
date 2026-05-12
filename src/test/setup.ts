import "@testing-library/jest-dom";
import { vi, beforeAll, afterAll } from "vitest";

// Suppress Radix UI accessibility warnings in tests.
// These fire when DialogContent lacks aria-describedby / DialogDescription.
// They are real a11y concerns addressed in production; suppressed here to keep
// test output clean without masking unrelated console calls.
// Radix uses console.warn; React act() warnings use console.error.
const RADIX_PATTERNS = ["Missing `Description`", "aria-describedby={undefined}", "requires a `DialogTitle`"];
const _originalWarn = console.warn.bind(console);
const _originalError = console.error.bind(console);
beforeAll(() => {
  console.warn = (...args: unknown[]) => {
    const msg = typeof args[0] === "string" ? args[0] : "";
    if (RADIX_PATTERNS.some((p) => msg.includes(p))) return;
    _originalWarn(...args);
  };
  console.error = (...args: unknown[]) => {
    const msg = typeof args[0] === "string" ? args[0] : "";
    if (RADIX_PATTERNS.some((p) => msg.includes(p))) return;
    _originalError(...args);
  };
});
afterAll(() => {
  console.warn = _originalWarn;
  console.error = _originalError;
});

// Mock do matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock do ResizeObserver — must be a class (Radix UI calls `new ResizeObserver`)
global.ResizeObserver = class ResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
};

// Mock do IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock scrollTo
window.scrollTo = vi.fn() as any;

// Mock scrollIntoView (not implemented in jsdom)
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// Mock URL.createObjectURL / revokeObjectURL
URL.createObjectURL = vi.fn(() => "blob:test");
URL.revokeObjectURL = vi.fn();
