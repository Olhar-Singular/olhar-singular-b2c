import { describe, it, expect, vi, afterEach } from "vitest";
import {
  errorResponse,
  INTERNAL_ERROR_CODE,
  INTERNAL_ERROR_MESSAGE,
  PublicError,
} from "./publicError.ts";

const CORS = { "Access-Control-Allow-Origin": "*" };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PublicError", () => {
  it("carries a user-safe message, a 500 status by default and no code", () => {
    const err = new PublicError("A IA demorou demais para responder.");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("PublicError");
    expect(err.message).toBe("A IA demorou demais para responder.");
    expect(err.status).toBe(500);
    expect(err.code).toBeNull();
  });

  it("accepts an explicit status, machine code and the underlying cause", () => {
    const cause = new Error("duplicate key value violates unique constraint \"x\"");
    const err = new PublicError("Créditos insuficientes.", { status: 402, code: "insufficient_credits", cause });
    expect(err.status).toBe(402);
    expect(err.code).toBe("insufficient_credits");
    expect(err.cause).toBe(cause);
  });
});

describe("errorResponse", () => {
  it("answers a PublicError with its own message, status and code, as JSON with the CORS headers", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = new PublicError("Este CPF já usou o teste.", { status: 409, code: "trial_used" });

    const res = errorResponse(err, { label: "subscribe error:", headers: CORS });

    expect(res.status).toBe(409);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await res.json()).toEqual({ error: "Este CPF já usou o teste.", code: "trial_used" });
    // Logged at warn level (a handled refusal, not a crash), with the label.
    expect(warn).toHaveBeenCalledWith("subscribe error:", err);
  });

  it("omits the code field for a PublicError without one", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = errorResponse(new PublicError("Requisição inválida.", { status: 400 }), { label: "x:", headers: CORS });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Requisição inválida." });
  });

  it("never echoes an internal error: logs it in full and answers a generic 500", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const internal = new Error("plans lookup failed: relation \"public.plans\" does not exist");

    const res = errorResponse(internal, { label: "subscribe error:", headers: CORS });

    expect(res.status).toBe(500);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const body = await res.json();
    expect(body).toEqual({ error: INTERNAL_ERROR_MESSAGE, code: INTERNAL_ERROR_CODE });
    expect(JSON.stringify(body)).not.toContain("plans");
    expect(error).toHaveBeenCalledWith("subscribe error:", internal);
  });

  it("treats non-Error throws (strings, objects, undefined) as internal", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const thrown of ["boom", { message: "createUser failed: db down" }, undefined]) {
      const res = errorResponse(thrown, { label: "x:", headers: CORS });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: INTERNAL_ERROR_MESSAGE, code: INTERNAL_ERROR_CODE });
    }
  });

  it("uses the function's own generic message when one is given", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = errorResponse(new Error("User not allowed"), {
      label: "set-initial-password error:",
      headers: CORS,
      fallbackMessage: "Não foi possível definir a senha. Tente de novo.",
    });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Não foi possível definir a senha. Tente de novo.",
      code: INTERNAL_ERROR_CODE,
    });
  });

  it("keeps the generic message identical to the admin panel's internal_error text", () => {
    // src/hooks/useAdminDashboard.ts maps the old { error: "internal_error" }
    // to this exact string; the admin functions now send it directly.
    expect(INTERNAL_ERROR_MESSAGE).toBe("Erro interno. Tente de novo em instantes.");
    expect(INTERNAL_ERROR_CODE).toBe("internal_error");
  });
});
