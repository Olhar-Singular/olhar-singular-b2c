// =============================================================================
// Deterministic check of an AI ADAPTATION against the activity it was given (C-04).
//
// Same idea as `examExtractionCheck` (C-03), one stage later. The prompt already says
// "never invent a number for a figure". A rule alone did not hold: a question that only
// said "observe the graph, what is f(2)?" came back with the points (0,1) (1,3) (2,5) the
// teacher never gave, and a "calculate the area" with a 10 cm by 8 cm rectangle. The student
// receives a solvable question whose answer is not the exam's.
//
// A value (number or expression) in a question's statement or alternatives that appears
// nowhere in the activity text is a suspect. The support text (scaffolding) is exempt: its
// worked examples are meant to be new. Pure, no I/O, INFORMATIONAL: it never blocks, charges
// or reasks; the teacher just sees which questions to compare.
// =============================================================================

import type { ExtractionIssue } from "../../../src/lib/domain/examIssues.ts";
import { lostFractions, questionOfFraction } from "./fractionGuard.ts";
import { excerptOf, markersOf, referenceOf } from "./examExtractionCheck.ts";

type Rich = Array<{ type?: string; text?: string; latex?: string }> | undefined;

interface AnyBlock {
  type?: string;
  content?: Rich;
  latex?: string;
  instruction?: Rich;
  enunciado?: Rich;
  stem?: AnyBlock[];
  answer?: {
    kind?: string;
    alternatives?: Array<{ content?: Rich }>;
    items?: Array<{ content?: Rich }>;
    pairs?: Array<{ left?: Rich; right?: Rich }>;
    rows?: Rich[][];
  };
}

/** Anything the model sent, as text. */
const str = (v: unknown): string => (typeof v === "string" ? v : "");

function richText(rich: Rich): string {
  return (Array.isArray(rich) ? rich : []).map((n) => str(n?.text) + str(n?.latex)).join("");
}

/** Statement + instruction + alternatives of a question; never the support text or the key. */
function questionTexts(q: AnyBlock): string[] {
  const parts: string[] = [];
  for (const b of Array.isArray(q.stem) ? q.stem : []) {
    if (b?.type === "paragraph" || b?.type === "heading") parts.push(richText(b.content));
    else if (b?.type === "blockMath") parts.push(str(b.latex));
  }
  parts.push(richText(q.instruction), richText(q.enunciado));
  const a = q.answer;
  for (const alt of Array.isArray(a?.alternatives) ? a.alternatives : []) parts.push(richText(alt?.content));
  for (const item of Array.isArray(a?.items) ? a.items : []) parts.push(richText(item?.content));
  for (const pair of Array.isArray(a?.pairs) ? a.pairs : []) parts.push(richText(pair?.left), richText(pair?.right));
  for (const row of Array.isArray(a?.rows) ? a.rows : []) for (const cell of Array.isArray(row) ? row : []) parts.push(richText(cell));
  return parts.filter(Boolean);
}

/** Every text of the document, support included: what the sheet will print. */
function allText(blocks: AnyBlock[]): string {
  const out: string[] = [];
  const walk = (list: AnyBlock[] | undefined) => {
    for (const b of Array.isArray(list) ? list : []) {
      out.push(richText(b?.content), str(b?.latex), richText(b?.instruction), richText(b?.enunciado));
      for (const item of Array.isArray((b as { items?: unknown })?.items) ? ((b as unknown as { items: unknown[] }).items) : []) {
        out.push(typeof item === "string" ? item : richText((item as { content?: Rich })?.content));
      }
      const a = b?.answer;
      for (const alt of Array.isArray(a?.alternatives) ? a.alternatives : []) out.push(richText(alt?.content));
      for (const item of Array.isArray(a?.items) ? a.items : []) out.push(richText(item?.content));
      for (const pair of Array.isArray(a?.pairs) ? a.pairs : []) out.push(richText(pair?.left), richText(pair?.right));
      walk(b?.stem);
    }
  };
  walk(blocks);
  return out.join("\n");
}

/** A question that points at a figure, graph or table the teacher did not (or could not) give as data. */
const FIGURE_WORD = /\b(?:figura|gr[aá]fico|desenho|imagem|ilustra[cç][aã]o|esquema|diagrama|mapa|tabela|sombread[ao]|ao lado)\b/iu;

/** Values the language itself implies ("ângulo reto" = 90, "por cento" = 100): not data the AI made up. */
const CONVENTIONAL = new Set(["90", "100", "180", "360"]);

/** A word that gives an instruction ("marque", "escreva", "use"), or a limit right before the number ("até", "no máximo"). */
const INSTRUCTION_VERB =
  String.raw`(?:marque|assinale|escolha|selecione|responda|escreva|use|utilize|indique|cite|circule|complete|liste|justifique|explique|resuma|desenhe|ligue|ordene|descreva|redija|elabore|produza|anote|registre|apresente|comente|relate|formule|construa|represente)`;
const INSTRUCTION_LIMIT = String.raw`(?:at[eé]|no\s+m[aá]ximo|no\s+m[ií]nimo|pelo\s+menos|apenas|somente|exatamente)`;
const COUNTED_THING = String.raw`(?:alternativas?|op(?:ção|ções|cao|coes)|respostas?|linhas?|palavras?|frases?|parágrafos?|itens?|item|casas\s+decimais)`;

/**
 * Numbers that are part of an instruction, not of the data: "marque 1 alternativa", "responda em 3 linhas",
 * "use 2 casas decimais", "Passo 1", "Questão 2", "7º ano" (F6-3). They are taken out of the
 * question text before comparing, so a figure question is not accused of inventing them.
 */
const INSTRUCTION_NUMBER = new RegExp(
  [
    // "marque 1 alternativa", "responda em 3 linhas": only when an instruction verb is in the SAME sentence
    // before the number, or a limit word is right before it. "são 7 casas" or "a figura tem 7 itens" is data (L9A-5).
    String.raw`\b${INSTRUCTION_VERB}\b[^.?!\n]{0,60}?\b\d+\s+${COUNTED_THING}\b`,
    String.raw`\b${INSTRUCTION_LIMIT}\s+\d+\s+${COUNTED_THING}\b`,
    String.raw`\b(?:passo|etapa|quest[aã]o|item|parte|fase)\s+\d+\b`,
    String.raw`\b\d+\s*[ºª]\s*(?:ano|série|bimestre|trimestre|semestre|lugar|dia|fase|etapa|passo)\b`,
  ].join("|"),
  "giu",
);

// "um", "uma", "segundo" and "segunda" are left out on purpose: articles and "second" (time), not numbers.
const WORD_NUMBERS: Record<string, number> = {
  dois: 2, duas: 2, três: 3, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18,
  dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80,
  noventa: 90, cem: 100, cento: 100, mil: 1000,
  primeiro: 1, primeira: 1, terceiro: 3, terceira: 3, quarto: 4, quarta: 4, quinto: 5, quinta: 5,
};
const NUMBER_WORD = new RegExp(`\\b(${Object.keys(WORD_NUMBERS).join("|")})\\b`, "giu");

/** The activity's own number words as digits ("dez" -> 10): the AI may print them as digits. */
function numeralsOfWords(text: string): string {
  return Array.from(text.matchAll(NUMBER_WORD), (m) => String(WORD_NUMBERS[m[1].toLowerCase()])).join(" ");
}

/** Answer kinds whose key is a mark the model must set (a letter, a V/F). */
const KEYED_ANSWERS: ReadonlySet<string> = new Set(["multipleChoice", "trueFalse"]);

export function reviewAdaptation(
  activityText: string,
  adaptation: { document?: { blocks?: unknown } } | null | undefined,
): ExtractionIssue[] {
  const blocks = (Array.isArray(adaptation?.document?.blocks) ? adaptation!.document!.blocks : []) as AnyBlock[];
  const questions = blocks.filter((b) => b?.type === "question");
  const activity = str(activityText);
  const reference = referenceOf(`${activity}\n${numeralsOfWords(activity)}`);
  const issues: ExtractionIssue[] = [];

  questions.forEach((q, index) => {
    const parts = questionTexts(q);
    const joined = parts.join("\n");
    // F6-1: a question with an unread part still has to carry an answer key (the schema asks for
    // one); the prompt makes it a placeholder, and the teacher is told not to trust it.
    if (KEYED_ANSWERS.has(str(q.answer?.kind)) && markersOf(joined).length > 0) {
      issues.push({ question: index + 1, kind: "answer_key", items: [], of: questions.length, excerpt: excerptOf(parts[0]) });
    }
    if (!FIGURE_WORD.test(joined)) return;
    const suspects = reference.suspectsIn(joined.replace(INSTRUCTION_NUMBER, " "), { expressions: false }).filter((n) => !CONVENTIONAL.has(n));
    if (suspects.length) {
      issues.push({ question: index + 1, kind: "new_value", items: suspects, of: questions.length, excerpt: excerptOf(parts[0]) });
    }
  });

  // A grouped fraction of the activity (`(2 x + 1)/3`) that no fraction of the questions matches (N-I-001).
  const allTexts = questions.map((q) => questionTexts(q).join("\n"));
  for (const fraction of lostFractions(str(activityText), allTexts.join("\n"))) {
    const at = questionOfFraction(fraction, allTexts);
    issues.push({
      question: at < 0 ? null : at + 1,
      kind: "fraction",
      items: [fraction.fraction],
      ...(at < 0 ? {} : { of: questions.length, excerpt: excerptOf(allTexts[at]) }),
    });
  }

  // A marker the activity had and the sheet no longer has: the AI completed what was unread.
  const dropped = markersOf(str(activityText)).length - markersOf(allText(blocks)).length;
  if (dropped > 0) issues.push({ question: null, kind: "marker_dropped", items: [] });
  return issues;
}

/**
 * The same check, but it can never fail the request: it runs after the charge is settled, so
 * a surprise shape from the model must cost the teacher a notice, not the adaptation.
 */
export function reviewAdaptationSafely(
  activityText: string,
  adaptation: { document?: { blocks?: unknown } } | null | undefined,
): ExtractionIssue[] {
  try {
    return reviewAdaptation(activityText, adaptation);
  } catch (e) {
    console.warn("adaptation review skipped:", e);
    return [];
  }
}
