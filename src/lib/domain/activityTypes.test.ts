import { describe, it, expect } from "vitest";
import { ACTIVITY_TYPES, activityTypeLabel } from "./activityTypes";

describe("ACTIVITY_TYPES", () => {
  it("carries the four types the wizard offers", () => {
    expect(ACTIVITY_TYPES.map((t) => t.value)).toEqual([
      "exercício",
      "prova",
      "texto",
      "projeto",
    ]);
  });
});

describe("activityTypeLabel", () => {
  it("gives the human label for a stored value", () => {
    expect(activityTypeLabel("prova")).toBe("Prova");
    expect(activityTypeLabel("projeto")).toBe("Projeto / Pesquisa");
  });

  it("shows an unknown value as itself instead of hiding it", () => {
    // Legacy rows carry free text ("exercicio" without the accent was written
    // by an older build). Showing it raw beats showing nothing.
    expect(activityTypeLabel("exercicio")).toBe("exercicio");
  });

  it("names the absence of a type", () => {
    expect(activityTypeLabel(null)).toBe("Sem tipo");
    expect(activityTypeLabel(undefined)).toBe("Sem tipo");
    expect(activityTypeLabel("")).toBe("Sem tipo");
  });
});
