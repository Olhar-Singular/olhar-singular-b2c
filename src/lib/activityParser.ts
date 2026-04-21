// Activity DSL parser — ported from prototype-editor.html
// Parses a markdown-like DSL into a structured activity tree for preview rendering.

import { normalizeAIText } from "./normalizeAIText";

export type QuestionType =
  | "multiple_choice"
  | "multiple_answer"
  | "open_ended"
  | "fill_blank"
  | "true_false"
  | "matching"
  | "ordering"
  | "table";

export type ParsedAlternative = {
  letter: string;
  text: string;
  correct: boolean;
  continuations: string[]; // lines that follow this alternative before the next one
  tfItems: TfItem[]; // V/F items nested inside this alternative (sub-question structure)
};
export type CheckItem = { text: string; checked: boolean };
export type TfItem = { text: string; marked: boolean | null };
export type MatchPair = { left: string; right: string };
export type OrderItem = { n: number; text: string };

export type ParsedQuestion = {
  number: number;
  statement: string;
  type: QuestionType;
  alternatives: ParsedAlternative[];
  checkItems: CheckItem[];
  tfItems: TfItem[];
  matchPairs: MatchPair[];
  orderItems: OrderItem[];
  tableRows: string[][];
  images: string[];
  answerLines: number;
  wordbank: string[] | null;
  points: number | null;
  difficulty: string | null;
  // Lines that precede the first alternative/check/tf/etc. item.
  // Rendered inline with the statement (before question body).
  continuations: string[];
  // Lines that appear AFTER alternatives/body items but are question-scoped
  // (Apoio, images, page breaks). Rendered after the question body.
  trailingContinuations: string[];
};

export type SectionItem =
  | { kind: "question"; data: ParsedQuestion }
  | { kind: "instruction"; text: string }
  | { kind: "separator" }
  | { kind: "spacer" }
  | { kind: "mathblock"; expr: string }
  | { kind: "unrecognized"; text: string; lineNo: number };

export type ParsedSection = {
  title: string | null;
  level: number;
  items: SectionItem[];
};

export type ParsedActivity = {
  sections: ParsedSection[];
};

// ── Regex patterns ──

const RE = {
  section: /^(#{1,2})\s+(.+)/,
  question: /^(\d+)\s*[.):\-]\s+(.+)/,
  questionAlt: /^[Qq]uest[aãã]o\s+(\d+)\s*[:\-]?\s*(.*)/,
  alt: /^(?:([a-fA-F])\*?\s*[.)]\s*|(?:\(([a-fA-F])\*?\))\s*)(.+)/,
  checkbox: /^\[([xX ])\]\s+(.+)/,
  tfBlank: /^\(\s*\)\s+(.+)/,
  tfMarked: /^\([VvFfTt]\)\s+(.+)/,
  matching: /^(.+?)\s+--\s+(.+)/,
  ordering: /^\[(\d+)\]\s+(.+)/,
  tableRow: /^\|(.+)\|$/,
  image: /^\[img[:\s](.+?)\]$/i,
  lines: /^\[linhas?[:\s]\s*(\d+)\s*\]$/i,
  wordbank: /^\[banco[:\s]\s*(.+)\]$/i,
  instruction: /^>\s+(.+)/,
  separator: /^-{3,}$/,
  points: /\{(\d+)\s*(?:pts?|pontos?)\}/i,
  difficulty: /\{(f[aá]cil|m[eé]dio|dif[ií]cil)\}/i,
  blank: /_{3,}/g,
  mathBlock: /^\$\$(.+?)\$\$$/,
};

function detectType(q: Omit<ParsedQuestion, "type">): QuestionType {
  if (q.tableRows.length > 0) return "table";
  if (q.orderItems.length > 0) return "ordering";
  if (q.matchPairs.length > 0) return "matching";
  if (q.tfItems.length > 0) return "true_false";
  if (q.checkItems.length > 0) return "multiple_answer";
  if (q.alternatives.length > 0) return "multiple_choice";
  if (RE.blank.test(q.statement)) {
    RE.blank.lastIndex = 0;
    return "fill_blank";
  }
  return "open_ended";
}

function normDiff(d: string): string {
  const l = d
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (l.startsWith("f")) return "fácil";
  if (l.startsWith("m")) return "médio";
  return "difícil";
}

type PartialQuestion = Omit<ParsedQuestion, "type">;

function makeEmptyQuestion(number: number, statement: string): PartialQuestion {
  return {
    number,
    statement,
    alternatives: [],
    checkItems: [],
    tfItems: [],
    matchPairs: [],
    orderItems: [],
    tableRows: [],
    images: [],
    answerLines: 0,
    wordbank: null,
    points: null,
    difficulty: null,
    continuations: [],
    trailingContinuations: [],
  };
}

/** Returns true when the question already has body items (alternatives, check
 *  items, tf items, match pairs, ordering, or table rows) — meaning subsequent
 *  question-scoped lines (Apoio, images) should be classified as "trailing"
 *  (rendered after the question body) rather than "leading". */
function hasBodyItems(q: PartialQuestion): boolean {
  return (
    q.alternatives.length > 0 ||
    q.checkItems.length > 0 ||
    q.tfItems.length > 0 ||
    q.matchPairs.length > 0 ||
    q.orderItems.length > 0 ||
    q.tableRows.length > 0
  );
}

export function parseActivity(rawText: string): ParsedActivity {
  const lines = normalizeAIText(rawText).split("\n");
  const sections: ParsedSection[] = [];
  let curSec: ParsedSection = { title: null, level: 1, items: [] };
  let curQ: PartialQuestion | null = null;
  let tfMode = false;
  let matchMode = false;
  let orderMode = false;
  let checkMode = false;
  let tableMode = false;

  function pushQ() {
    if (!curQ) return;
    const type = detectType(curQ);
    curSec.items.push({ kind: "question", data: { ...curQ, type } });
    curQ = null;
    tfMode = matchMode = orderMode = checkMode = tableMode = false;
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) {
      if (curQ) {
        // Inside a question: reset tf/check mode so the next letter can start a new sub-item.
        if ((tfMode || checkMode) && curQ.alternatives.length > 0) {
          tfMode = checkMode = false;
        }
        // Add a blank-line marker so the renderer can insert visual spacing.
        const lastCont = curQ.continuations[curQ.continuations.length - 1];
        if (lastCont !== "<!--blank-->") {
          curQ.continuations.push("<!--blank-->");
        }
      } else {
        // Outside a question: blank line creates a visual spacer between section items.
        const last = curSec.items[curSec.items.length - 1];
        if (last && last.kind !== "spacer" && last.kind !== "separator") {
          curSec.items.push({ kind: "spacer" });
        }
      }
      continue;
    }

    // Separator ---
    if (RE.separator.test(line)) {
      pushQ();
      curSec.items.push({ kind: "separator" });
      continue;
    }

    // Section headers
    const secM = line.match(RE.section);
    if (secM) {
      pushQ();
      if (curSec.items.length > 0 || curSec.title) sections.push(curSec);
      curSec = { title: secM[2], level: secM[1].length, items: [] };
      continue;
    }

    // Instruction > (only outside question)
    const instrM = line.match(RE.instruction);
    if (instrM && !curQ) {
      pushQ();
      curSec.items.push({ kind: "instruction", text: instrM[1] });
      continue;
    }

    // Math block $$...$$ (only outside question)
    const mathBM = line.match(RE.mathBlock);
    if (mathBM && !curQ) {
      curSec.items.push({ kind: "mathblock", expr: mathBM[1] });
      continue;
    }

    // Image
    const imgM = line.match(RE.image);
    if (imgM) {
      if (curQ) {
        curQ.images.push(imgM[1]);
        // Record position so downstream builders can place the image between
        // paragraphs. If the body has already started (alternatives, V/F, etc.),
        // route to trailingContinuations so the image renders AFTER the body.
        const marker = `[img:${imgM[1]}]`;
        if (hasBodyItems(curQ)) curQ.trailingContinuations.push(marker);
        else curQ.continuations.push(marker);
      }
      continue;
    }

    // Lines directive
    const linesM = line.match(RE.lines);
    if (linesM && curQ) {
      curQ.answerLines = parseInt(linesM[1], 10);
      continue;
    }

    // Word bank
    const bankM = line.match(RE.wordbank);
    if (bankM && curQ) {
      curQ.wordbank = bankM[1]
        .split(",")
        .map((w) => w.trim())
        .filter(Boolean);
      continue;
    }

    // Question start
    let qM = line.match(RE.question);
    if (!qM) {
      const qa = line.match(RE.questionAlt);
      if (qa) qM = [null!, qa[1], qa[2]] as unknown as RegExpMatchArray;
    }
    if (qM) {
      pushQ();
      let stmt = qM[2];
      let pts: number | null = null;
      let diff: string | null = null;

      const ptsM = stmt.match(RE.points);
      if (ptsM) {
        pts = parseInt(ptsM[1], 10);
        stmt = stmt.replace(RE.points, "").trim();
      }
      const diffM = stmt.match(RE.difficulty);
      if (diffM) {
        diff = normDiff(diffM[1]);
        stmt = stmt.replace(RE.difficulty, "").trim();
      }

      curQ = makeEmptyQuestion(parseInt(qM[1], 10), stmt);
      curQ.points = pts;
      curQ.difficulty = diff;
      tfMode = matchMode = orderMode = checkMode = tableMode = false;
      continue;
    }

    // Context-sensitive lines (only inside a question)
    if (curQ) {
      // Table row |...|
      const tblM = line.match(RE.tableRow);
      if (tblM) {
        const cells = tblM[1].split("|").map((c) => c.trim());
        if (!cells.every((c) => /^[-:]+$/.test(c))) {
          curQ.tableRows.push(cells);
          tableMode = true;
          continue;
        }
        continue;
      }

      // Checkbox [x] or [ ]
      const chkM = line.match(RE.checkbox);
      if (chkM) {
        checkMode = true;
        curQ.checkItems.push({ text: chkM[2], checked: /[xX]/.test(chkM[1]) });
        continue;
      }

      // V/F item (blank)
      const tfBM = line.match(RE.tfBlank);
      if (tfBM) {
        const lastAlt = curQ.alternatives[curQ.alternatives.length - 1];
        if (lastAlt) {
          // Nested under an alternative — store per-alt so sub-question structure is preserved
          lastAlt.tfItems.push({ text: tfBM[1], marked: null });
        } else {
          tfMode = true;
          curQ.tfItems.push({ text: tfBM[1], marked: null });
        }
        continue;
      }
      const tfMM = line.match(RE.tfMarked);
      if (tfMM) {
        const lastAlt = curQ.alternatives[curQ.alternatives.length - 1];
        if (lastAlt) {
          lastAlt.tfItems.push({ text: tfMM[1], marked: /[VvTt]/.test(line[1]) });
        } else {
          tfMode = true;
          curQ.tfItems.push({ text: tfMM[1], marked: /[VvTt]/.test(line[1]) });
        }
        continue;
      }

      // Ordering [n]
      const ordM = line.match(RE.ordering);
      if (ordM) {
        orderMode = true;
        curQ.orderItems.push({ n: parseInt(ordM[1], 10), text: ordM[2] });
        continue;
      }

      // Matching item -- item
      const matM = line.match(RE.matching);
      if (matM && !tfMode && !checkMode) {
        if (matchMode || curQ.alternatives.length === 0) {
          matchMode = true;
          curQ.matchPairs.push({ left: matM[1].trim(), right: matM[2].trim() });
          continue;
        }
      }

      // Alternative a) b) etc
      const altM = line.match(RE.alt);
      if (altM && !tfMode && !checkMode && !orderMode && !matchMode && !tableMode) {
        const rawLetter = altM[1] || altM[2];
        const letter = rawLetter.toLowerCase();
        const isCorrect = raw.includes("*");
        curQ.alternatives.push({ letter, text: altM[3], correct: isCorrect, continuations: [], tfItems: [] });
        continue;
      }

      // Instruction inside question
      const instrQ = line.match(RE.instruction);
      if (instrQ) {
        const text = "> " + instrQ[1];
        // Apoio lines are always question-scoped (scaffolding), never alternative-scoped.
        // Position relative to the body is preserved via trailingContinuations.
        const isApoio = /^>\s*Apoio\s*:/i.test(text);
        const lastAlt = curQ.alternatives[curQ.alternatives.length - 1];
        if (isApoio) {
          if (hasBodyItems(curQ)) curQ.trailingContinuations.push(text);
          else curQ.continuations.push(text);
        } else if (lastAlt) {
          lastAlt.continuations.push(text);
        } else {
          curQ.continuations.push(text);
        }
        continue;
      }

      // Math block inside question
      const mathQ = line.match(RE.mathBlock);
      if (mathQ) {
        const text = "$$" + mathQ[1] + "$$";
        const lastAlt = curQ.alternatives[curQ.alternatives.length - 1];
        if (lastAlt) lastAlt.continuations.push(text);
        else curQ.continuations.push(text);
        continue;
      }

      // Continuation line — attach to last alternative if one exists
      {
        const lastAlt = curQ.alternatives[curQ.alternatives.length - 1];
        if (lastAlt && !tfMode && !checkMode && !orderMode && !matchMode && !tableMode) {
          lastAlt.continuations.push(line);
        } else {
          curQ.continuations.push(line);
        }
        continue;
      }
    }

    // Unrecognized line outside question
    curSec.items.push({ kind: "unrecognized", text: line, lineNo: i + 1 });
  }

  pushQ();
  if (curSec.items.length > 0 || curSec.title) sections.push(curSec);

  return { sections };
}
