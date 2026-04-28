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
