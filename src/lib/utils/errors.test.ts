import { describe, it, expect } from "vitest";
import {
  isNetworkError,
  parseDbError,
  parseEdgeFnError,
  parseAuthError,
  parseInvokeError,
  MSG_NETWORK,
} from "./errors";

describe("isNetworkError", () => {
  it("returns true for TypeError", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("returns true for errors matching network patterns", () => {
    expect(isNetworkError(new Error("NetworkError when attempting to fetch"))).toBe(true);
    expect(isNetworkError(new Error("network request failed"))).toBe(true);
    expect(isNetworkError(new Error("Load failed"))).toBe(true);
  });

  it("returns false for non-network errors", () => {
    expect(isNetworkError(new Error("Invalid login credentials"))).toBe(false);
    expect(isNetworkError(new Error("some database error"))).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isNetworkError("string error")).toBe(false);
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(42)).toBe(false);
  });
});

describe("parseDbError", () => {
  it("returns MSG_NETWORK for network errors", () => {
    expect(parseDbError(new TypeError("Failed to fetch"), "fallback")).toBe(MSG_NETWORK);
    expect(parseDbError(new Error("network request failed"), "fallback")).toBe(MSG_NETWORK);
  });

  it("returns fallback for generic non-network errors", () => {
    expect(parseDbError(new Error("duplicate key"), "Erro ao salvar.")).toBe("Erro ao salvar.");
    expect(parseDbError(new Error("row not found"), "Erro.")).toBe("Erro.");
  });

  it("returns user-friendly message for PGRST205 schema cache errors (no code shown)", () => {
    const err = Object.assign(new Error("Could not find the table 'public.question_bank' in the schema cache"), { code: "PGRST205" });
    const result = parseDbError(err, "fallback");
    expect(result).not.toContain("PGRST");
    expect(result).not.toContain("schema cache");
    expect(result).not.toContain("public.");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns user-friendly message when error message contains schema cache text (no code)", () => {
    const err = new Error("Could not find the table 'public.chat_sessions' in the schema cache");
    const result = parseDbError(err, "fallback");
    expect(result).not.toContain("schema cache");
    expect(result).not.toContain("chat_sessions");
  });
});

describe("parseEdgeFnError", () => {
  it("returns MSG_NETWORK for network errors", () => {
    expect(parseEdgeFnError(new TypeError("Failed to fetch"), "fallback")).toBe(MSG_NETWORK);
  });

  it("returns empty string for AbortError", () => {
    const abort = Object.assign(new Error("Aborted"), { name: "AbortError" });
    expect(parseEdgeFnError(abort, "fallback")).toBe("");
  });

  it("returns err.message for backend errors with meaningful message", () => {
    expect(parseEdgeFnError(new Error("Créditos insuficientes."), "fallback")).toBe("Créditos insuficientes.");
  });

  it("returns fallback (not the technical Supabase message) for generic edge function error", () => {
    const err = new Error("Edge Function returned a non-2xx status code");
    const result = parseEdgeFnError(err, "Falha na extração.");
    expect(result).toBe("Falha na extração.");
    expect(result).not.toContain("non-2xx");
    expect(result).not.toContain("Edge Function");
  });

  it("returns fallback when err has no message", () => {
    expect(parseEdgeFnError({}, "Erro genérico.")).toBe("Erro genérico.");
  });
});

describe("parseInvokeError", () => {
  it("returns body.error when context.json() resolves with error field", async () => {
    const fakeResponse = { json: () => Promise.resolve({ error: "Nenhuma chave de IA configurada." }) };
    const err = Object.assign(new Error("Edge Function returned a non-2xx status code"), { context: fakeResponse });
    const result = await parseInvokeError(err, "fallback");
    expect(result).toBe("Nenhuma chave de IA configurada.");
    expect(result).not.toContain("non-2xx");
  });

  it("returns fallback when context.json() rejects", async () => {
    const fakeResponse = { json: () => Promise.reject(new Error("body consumed")) };
    const err = Object.assign(new Error("Edge Function returned a non-2xx status code"), { context: fakeResponse });
    const result = await parseInvokeError(err, "Falha na extração.");
    expect(result).toBe("Falha na extração.");
  });

  it("returns fallback when context is absent", async () => {
    const err = new Error("Edge Function returned a non-2xx status code");
    const result = await parseInvokeError(err, "Falha na extração.");
    expect(result).toBe("Falha na extração.");
  });

  it("returns err.message when it is a meaningful backend message (not the Supabase generic one)", async () => {
    const err = new Error("Créditos insuficientes para esta operação.");
    const result = await parseInvokeError(err, "fallback");
    expect(result).toBe("Créditos insuficientes para esta operação.");
  });

  it("does not expose status codes or technical strings to the user", async () => {
    const fakeResponse = { json: () => Promise.resolve({}) };
    const err = Object.assign(new Error("Edge Function returned a non-2xx status code"), { context: fakeResponse });
    const result = await parseInvokeError(err, "Serviço indisponível.");
    expect(result).not.toMatch(/\d{3}/);
    expect(result).not.toContain("non-2xx");
    expect(result).not.toContain("Edge Function");
  });
});

describe("parseAuthError", () => {
  it("returns MSG_NETWORK for failed to fetch", () => {
    expect(parseAuthError("Failed to fetch")).toBe(MSG_NETWORK);
    expect(parseAuthError("NetworkError when fetching")).toBe(MSG_NETWORK);
  });

  it("maps invalid credentials", () => {
    expect(parseAuthError("Invalid login credentials")).toBe("E-mail ou senha incorretos.");
    expect(parseAuthError("invalid credentials")).toBe("E-mail ou senha incorretos.");
  });

  it("maps already registered", () => {
    expect(parseAuthError("User already registered")).toBe("Este e-mail já está cadastrado. Tente entrar.");
  });

  it("maps email not confirmed", () => {
    expect(parseAuthError("Email not confirmed")).toBe("Confirme seu e-mail antes de entrar.");
  });

  it("maps rate limit", () => {
    expect(parseAuthError("Too many requests")).toBe("Muitas tentativas. Aguarde alguns minutos.");
    expect(parseAuthError("rate limit exceeded")).toBe("Muitas tentativas. Aguarde alguns minutos.");
  });

  it("maps weak password", () => {
    expect(parseAuthError("Password is too weak")).toBe("Senha muito fraca. Use pelo menos 6 caracteres.");
  });

  it("returns generic fallback for unknown messages", () => {
    expect(parseAuthError("some unknown error")).toBe("Erro ao acessar a conta. Tente novamente.");
  });

  it("returns login fallback for undefined with default action", () => {
    expect(parseAuthError(undefined)).toBe("Erro ao entrar. Tente novamente.");
    expect(parseAuthError(undefined, "login")).toBe("Erro ao entrar. Tente novamente.");
  });

  it("returns signup fallback for undefined with signup action", () => {
    expect(parseAuthError(undefined, "signup")).toBe("Erro ao criar conta. Tente novamente.");
  });

  it("returns login fallback for empty string with default action", () => {
    expect(parseAuthError("")).toBe("Erro ao entrar. Tente novamente.");
  });

  it("returns signup fallback for empty string with signup action", () => {
    expect(parseAuthError("", "signup")).toBe("Erro ao criar conta. Tente novamente.");
  });
});
