export const SUBJECTS = [
  "Física",
  "Matemática",
  "Química",
  "Biologia",
  "Português",
  "História",
  "Geografia",
  "Inglês",
  "Ciências",
  "Arte",
  "Ed. Física",
  "Geral",
] as const;

export type Subject = (typeof SUBJECTS)[number];

// Known aliases returned by the AI that don't match SUBJECTS exactly.
const SUBJECT_ALIASES: Partial<Record<string, Subject>> = {
  "língua portuguesa": "Português",
  "lingua portuguesa": "Português",
  "língua inglesa": "Inglês",
  "lingua inglesa": "Inglês",
  "educação física": "Ed. Física",
  "educacao fisica": "Ed. Física",
  "ciências da natureza": "Ciências",
  "ciencias da natureza": "Ciências",
  "artes": "Arte",
};

/**
 * Maps any AI-returned subject string to a canonical SUBJECTS value.
 * Order: exact match → alias map → case-insensitive match → "Geral".
 */
export function normalizeSubject(raw: string): Subject {
  const trimmed = raw.trim();
  if ((SUBJECTS as readonly string[]).includes(trimmed)) return trimmed as Subject;
  const lower = trimmed.toLowerCase();
  const alias = SUBJECT_ALIASES[lower];
  if (alias) return alias;
  const found = SUBJECTS.find((s) => s.toLowerCase() === lower);
  if (found) return found;
  return "Geral";
}
