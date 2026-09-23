import { describe, it, expect } from "vitest";
import { validateAdaptActivityInput } from "./adaptActivityInput";

const barrier = { dimension: "comunicacao" };

describe("validateAdaptActivityInput", () => {
  it("accepts a complete payload", () => {
    expect(
      validateAdaptActivityInput({
        original_activity: "cenario",
        activity_type: "prova",
        barriers: [barrier],
      }),
    ).toEqual({ ok: true });
  });

  it("blames only the empty barriers, not the fields that are present", () => {
    const result = validateAdaptActivityInput({
      original_activity: "cenario imagem-grande",
      activity_type: "prova",
      barriers: [],
    });
    expect(result).toEqual({ ok: false, error: "Selecione ao menos uma barreira." });
  });

  it("uses the same message when barriers is missing or not a list", () => {
    const expected = { ok: false, error: "Selecione ao menos uma barreira." };
    expect(validateAdaptActivityInput({ original_activity: "x", activity_type: "prova" })).toEqual(expected);
    expect(
      validateAdaptActivityInput({ original_activity: "x", activity_type: "prova", barriers: "todas" }),
    ).toEqual(expected);
  });

  it("names only the missing field, in pt-BR, without API field names", () => {
    const result = validateAdaptActivityInput({ activity_type: "prova", barriers: [barrier] });
    expect(result).toEqual({ ok: false, error: "Preencha antes de continuar: a atividade original." });

    expect(validateAdaptActivityInput({ original_activity: "x", barriers: [barrier] })).toEqual({
      ok: false,
      error: "Preencha antes de continuar: o tipo de atividade.",
    });
  });

  it("lists every missing field when more than one is absent", () => {
    expect(validateAdaptActivityInput({ barriers: [barrier] })).toEqual({
      ok: false,
      error: "Preencha antes de continuar: a atividade original, o tipo de atividade.",
    });
  });

  it("reports missing fields before the empty barriers", () => {
    expect(validateAdaptActivityInput({ barriers: [] })).toEqual({
      ok: false,
      error: "Preencha antes de continuar: a atividade original, o tipo de atividade.",
    });
  });

  it("rejects a body that is not an object", () => {
    const expected = {
      ok: false,
      error: "Preencha antes de continuar: a atividade original, o tipo de atividade.",
    };
    expect(validateAdaptActivityInput(null)).toEqual(expected);
    expect(validateAdaptActivityInput("prova")).toEqual(expected);
  });
});
