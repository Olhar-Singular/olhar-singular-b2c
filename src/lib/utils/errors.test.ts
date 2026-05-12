import { describe, it, expect } from "vitest";
import {
  isNetworkError,
  parseDbError,
  parseEdgeFnError,
  parseAuthError,
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

  it("returns fallback for non-network errors", () => {
    expect(parseDbError(new Error("duplicate key"), "Erro ao salvar.")).toBe("Erro ao salvar.");
    expect(parseDbError(new Error("row not found"), "Erro.")).toBe("Erro.");
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

  it("returns err.message for backend errors with message", () => {
    expect(parseEdgeFnError(new Error("Créditos insuficientes."), "fallback")).toBe("Créditos insuficientes.");
  });

  it("returns fallback when err has no message", () => {
    expect(parseEdgeFnError({}, "Erro genérico.")).toBe("Erro genérico.");
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

  it("returns generic fallback for undefined", () => {
    expect(parseAuthError(undefined)).toBe("Erro inesperado. Tente novamente.");
  });
});
