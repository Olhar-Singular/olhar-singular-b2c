// Input validation for the adapt-activity edge function, kept pure so the
// message that reaches the teacher is unit-tested.
//
// The old check collapsed every case into one sentence listing the three API
// field names, so a request with only `barriers` empty was told that
// `original_activity` and `activity_type` were missing too. That sent whoever
// was debugging to the wrong place and leaked snake_case field names into a
// pt-BR product. Here the two cases are separated: a field that is absent and
// a barrier list that came through empty.

export type AdaptActivityInputResult = { ok: true } | { ok: false; error: string };

const REQUIRED_FIELDS: Array<{ key: string; label: string }> = [
  { key: "original_activity", label: "a atividade original" },
  { key: "activity_type", label: "o tipo de atividade" },
];

export function validateAdaptActivityInput(body: unknown): AdaptActivityInputResult {
  const payload = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;

  const missing = REQUIRED_FIELDS.filter(({ key }) => !payload[key]).map(({ label }) => label);
  if (missing.length > 0) {
    return { ok: false, error: `Preencha antes de continuar: ${missing.join(", ")}.` };
  }

  const barriers = payload.barriers;
  if (!Array.isArray(barriers) || barriers.length === 0) {
    return { ok: false, error: "Selecione ao menos uma barreira." };
  }

  return { ok: true };
}
