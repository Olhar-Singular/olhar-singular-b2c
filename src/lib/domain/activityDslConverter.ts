// Bidirectional converter: StructuredActivity <-> Activity DSL (markdown-like text)

import type {
  StructuredActivity,
  StructuredQuestion,
  ActivitySection,
  Alternative,
  ContentBlock,
} from "@/types/adaptation";
import { parseActivity } from "./activityParser";
import type { ParsedQuestion, ParsedSection } from "./activityParser";
import { normalizeAIText } from "./normalizeAIText";
import { parseMarkdownInline } from "./parseMarkdownInline";

let contentBlockCounter = 0;
function nextContentBlockId(): string {
  contentBlockCounter += 1;
  return `cb-${Date.now().toString(36)}-${contentBlockCounter.toString(36)}`;
}

const IMG_LINE_RE = /^\[img:(.+?)\]$/;

/**
 * Convert a StructuredActivity (JSON) into the markdown DSL text format
 * that the editor textarea uses.
 */
export function structuredToMarkdownDsl(activity: StructuredActivity): string {
  const lines: string[] = [];

  // Helper: normalize AI text fields that may contain literal escape sequences
  const n = normalizeAIText;

  if (activity.general_instructions) {
    lines.push("> " + n(activity.general_instructions));
    lines.push("");
  }

  for (let si = 0; si < activity.sections.length; si++) {
    const section = activity.sections[si];

    if (section.title) {
      lines.push("# " + n(section.title));
      lines.push("");
    }

    if (section.introduction) {
      lines.push("> " + n(section.introduction));
      lines.push("");
    }

    for (const q of section.questions) {
      // Instruction before question
      if (q.instruction) {
        lines.push("> " + n(q.instruction));
      }

      // Question body — prefer structured content blocks when available so that
      // multi-paragraph statements and inline images survive the round-trip.
      if (q.content && q.content.length > 0) {
        emitQuestionFromContent(lines, q, n);
      } else {
        lines.push(`${q.number}) ${n(q.statement)}`);
      }

      // Type-specific content
      switch (q.type) {
        case "multiple_choice":
          if (q.alternatives && q.alternatives.length > 0) {
            for (const alt of q.alternatives) {
              const correctMark = alt.is_correct ? "*" : "";
              lines.push(`${alt.letter}${correctMark}) ${n(alt.text)}`);
            }
          }
          break;

        case "multiple_answer":
          if (q.check_items && q.check_items.length > 0) {
            for (const item of q.check_items) {
              const mark = item.checked ? "x" : " ";
              lines.push(`[${mark}] ${n(item.text)}`);
            }
          }
          break;

        case "true_false":
          if (q.tf_items && q.tf_items.length > 0) {
            for (const item of q.tf_items) {
              if (item.marked === true) lines.push(`(V) ${n(item.text)}`);
              else if (item.marked === false) lines.push(`(F) ${n(item.text)}`);
              else lines.push(`( ) ${n(item.text)}`);
            }
          } else {
            lines.push("( ) Verdadeiro");
            lines.push("( ) Falso");
          }
          break;

        case "matching":
          if (q.match_pairs && q.match_pairs.length > 0) {
            for (const pair of q.match_pairs) {
              lines.push(`${n(pair.left)} -- ${n(pair.right)}`);
            }
          }
          break;

        case "ordering":
          if (q.order_items && q.order_items.length > 0) {
            for (const item of q.order_items) {
              lines.push(`[${item.n}] ${n(item.text)}`);
            }
          }
          break;

        case "table":
          if (q.table_rows && q.table_rows.length > 0) {
            for (const row of q.table_rows) {
              lines.push(`| ${row.map((c) => n(c)).join(" | ")} |`);
            }
          }
          break;

        case "fill_blank":
          // Statement already contains ___ blanks typically
          if (q.blank_placeholder) {
            lines.push(`[banco: ${q.blank_placeholder}]`);
          }
          break;

        case "open_ended": {
          const n_lines = q.answerLines && q.answerLines > 0 ? q.answerLines : 4;
          lines.push(`[linhas:${n_lines}]`);
          break;
        }
      }

      // Trailing content blocks (Apoio/image/text placed after the question
      // body). Emit in positional order so the DSL round-trips faithfully.
      if (q.trailingContent && q.trailingContent.length > 0) {
        for (const block of q.trailingContent) {
          if (block.type === "text") {
            lines.push(n(block.content));
          } else if (block.type === "image") {
            lines.push(`[img:${block.src}]`);
          } else if (block.type === "scaffolding") {
            for (const step of block.items) {
              lines.push(`> Apoio: ${n(step)}`);
            }
          }
        }
      }

      // Scaffolding as trailing Apoio lines — only when neither `content` nor
      // `trailingContent` already emitted them inline. Keeps back-compat with
      // structured inputs that carry only `q.scaffolding: string[]`.
      const contentHasScaffolding =
        q.content?.some((b) => b.type === "scaffolding") ?? false;
      const trailingHasScaffolding =
        q.trailingContent?.some((b) => b.type === "scaffolding") ?? false;
      if (
        !contentHasScaffolding &&
        !trailingHasScaffolding &&
        q.scaffolding &&
        q.scaffolding.length > 0
      ) {
        for (const step of q.scaffolding) {
          lines.push("> Apoio: " + n(step));
        }
      }

      // Images — only emit trailing list when blocks did not already position
      // them inline. Prevents duplication during round-trips.
      const contentHasImages = q.content?.some((b) => b.type === "image") ?? false;
      const trailingHasImages =
        q.trailingContent?.some((b) => b.type === "image") ?? false;
      if (!contentHasImages && !trailingHasImages && q.images && q.images.length > 0) {
        for (const img of q.images) {
          lines.push(`[img:${img}]`);
        }
      }

      lines.push("");
    }

    // Section separator (except last section)
    if (si < activity.sections.length - 1) {
      lines.push("---");
      lines.push("");
    }
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Emit the question header and remaining content blocks into the DSL line
 *  buffer. The first text block becomes the question header line (`N) ...`),
 *  and any other blocks (text paragraphs, images) follow separated by a blank
 *  line so the parser can reconstruct them. */
function emitQuestionFromContent(
  lines: string[],
  q: StructuredQuestion,
  n: (s: string) => string,
): void {
  const blocks = q.content ?? [];
  const firstTextIdx = blocks.findIndex((b) => b.type === "text");

  if (firstTextIdx >= 0) {
    const first = blocks[firstTextIdx];
    const headerText = first.type === "text" ? first.content : q.statement;
    lines.push(`${q.number}) ${n(headerText)}`);
  } else {
    lines.push(`${q.number}) ${n(q.statement)}`);
  }

  for (let i = 0; i < blocks.length; i++) {
    if (i === firstTextIdx) continue;
    const block = blocks[i];
    lines.push("");
    if (block.type === "text") {
      lines.push(n(block.content));
    } else if (block.type === "image") {
      lines.push(`[img:${block.src}]`);
    } else if (block.type === "scaffolding") {
      for (const step of block.items) {
        lines.push(`> Apoio: ${n(step)}`);
      }
    }
  }
}

/**
 * Convert markdown DSL text back into a StructuredActivity (JSON).
 * Uses the parser to parse the DSL, then maps to StructuredActivity types.
 */
export function markdownDslToStructured(text: string): StructuredActivity {
  const parsed = parseActivity(text);

  const sections: ActivitySection[] = [];

  for (const sec of parsed.sections) {
    const questions: StructuredQuestion[] = [];
    let sectionInstruction: string | undefined;

    for (const item of sec.items) {
      if (item.kind === "instruction" && questions.length === 0) {
        // Instruction before any question -> section introduction
        sectionInstruction = item.text;
        continue;
      }

      if (item.kind === "question") {
        questions.push(parsedQuestionToStructured(item.data));
      }
    }

    sections.push({
      title: sec.title ?? undefined,
      introduction: sectionInstruction,
      questions,
    });
  }

  // Extract general instruction from first section if it has no title and only instructions
  let generalInstructions: string | undefined;
  if (
    sections.length > 0 &&
    !sections[0].title &&
    sections[0].questions.length === 0 &&
    sections[0].introduction
  ) {
    generalInstructions = sections[0].introduction;
    sections.shift();
  }

  return {
    sections,
    general_instructions: generalInstructions,
  };
}

function parsedQuestionToStructured(pq: ParsedQuestion): StructuredQuestion {
  const content = buildContentBlocks(pq);
  const trailingContent = buildTrailingContentBlocks(pq.trailingContinuations);
  const firstTextBlock = content.find((b) => b.type === "text");
  const statement =
    firstTextBlock && firstTextBlock.type === "text" ? firstTextBlock.content : pq.statement;

  const q: StructuredQuestion = {
    number: pq.number,
    type: mapQuestionType(pq.type),
    statement,
    content,
  };

  if (trailingContent.length > 0) {
    q.trailingContent = trailingContent;
  }

  // Alternatives (multiple choice) — filter out empty entries
  if (pq.alternatives.length > 0) {
    const alts = pq.alternatives
      .filter((a) => a.text.trim())
      .map(
        (a): Alternative => ({
          letter: a.letter,
          text: a.text,
          is_correct: a.correct || undefined,
        })
      );
    if (alts.length > 0) {
      q.alternatives = alts;
    }
  }

  // Multiple-answer checkboxes
  if (pq.checkItems.length > 0) {
    q.check_items = pq.checkItems.map((c) => ({
      text: c.text,
      checked: c.checked,
    }));
  }

  // True/false items
  if (pq.tfItems.length > 0) {
    q.tf_items = pq.tfItems.map((t) => ({ text: t.text, marked: t.marked }));
  }

  // Matching pairs
  if (pq.matchPairs.length > 0) {
    q.match_pairs = pq.matchPairs.map((p) => ({ left: p.left, right: p.right }));
  }

  // Ordering items
  if (pq.orderItems.length > 0) {
    q.order_items = pq.orderItems.map((o) => ({ n: o.n, text: o.text }));
  }

  // Table rows
  if (pq.tableRows.length > 0) {
    q.table_rows = pq.tableRows.map((row) => [...row]);
  }

  // Answer lines (from [linhas:N])
  if (pq.answerLines > 0) {
    q.answerLines = pq.answerLines;
  }

  // Word bank / fill-blank placeholder (from [banco: ...])
  if (pq.wordbank && pq.wordbank.length > 0) {
    q.blank_placeholder = pq.wordbank.join(", ");
  }

  // Images
  if (pq.images.length > 0) {
    q.images = [...pq.images];
  }

  // Extract ALL instructions from continuations (not just the first)
  const instructions = pq.continuations
    .filter((c) => c.startsWith("> ") && !/^>\s*Apoio\s*:/i.test(c))
    .map((c) => c.slice(2));
  if (instructions.length > 0) {
    q.instruction = instructions.join("\n");
  }

  // Scaffolding: derive flat string[] from scaffolding blocks in either content
  // or trailingContent. Kept for back-compat with consumers that read
  // q.scaffolding directly (AI output shape, older renderers, PDF export).
  const scaffolding: string[] = [];
  for (const block of content) {
    if (block.type === "scaffolding") {
      for (const item of block.items) scaffolding.push(item);
    }
  }
  for (const block of trailingContent) {
    if (block.type === "scaffolding") {
      for (const item of block.items) scaffolding.push(item);
    }
  }
  if (scaffolding.length > 0) {
    q.scaffolding = scaffolding;
  }

  return q;
}

function buildFullStatement(pq: ParsedQuestion): string {
  let stmt = pq.statement;
  // Append non-instruction continuations to statement
  const textConts = pq.continuations.filter(
    (c) =>
      !c.startsWith("> ") &&
      !c.startsWith("$$") &&
      c !== "<!--blank-->" &&
      !IMG_LINE_RE.test(c),
  );
  if (textConts.length > 0) {
    stmt += " " + textConts.join(" ");
  }
  return stmt;
}

const APOIO_RE = /^>\s*Apoio\s*:\s*(.*)$/i;

/** Build ContentBlock[] from a ParsedQuestion, preserving the order of text
 *  paragraphs, inline images, and scaffolding (Apoio) blocks as they appeared
 *  in the DSL. Consecutive `> Apoio:` lines coalesce into a single scaffolding
 *  block with numbered items; non-Apoio content between them splits them.
 *  Plain `> instruction` lines and `$$math$$` lines are handled out-of-band
 *  via q.instruction (math-block currently has no dedicated placement). */
function buildContentBlocks(pq: ParsedQuestion): ContentBlock[] {
  return buildBlocksFromLines(pq.continuations, pq.statement);
}

/** Build ContentBlock[] from the trailing (post-body) lines of a question.
 *  No seed statement — the question header is already captured in `content`. */
function buildTrailingContentBlocks(lines: string[]): ContentBlock[] {
  return buildBlocksFromLines(lines, undefined);
}

function buildBlocksFromLines(
  lines: string[],
  seedStatement: string | undefined,
): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const textBuffer: string[] = [];
  let apoioBuffer: string[] = [];

  const flushText = () => {
    if (textBuffer.length === 0) return;
    const text = textBuffer.join("\n").trim();
    textBuffer.length = 0;
    if (text.length === 0) return;
    const richContent = parseMarkdownInline(text);
    blocks.push({
      id: nextContentBlockId(),
      type: "text",
      content: text,
      ...(richContent ? { richContent } : {}),
    });
  };

  const flushApoio = () => {
    if (apoioBuffer.length === 0) return;
    blocks.push({
      id: nextContentBlockId(),
      type: "scaffolding",
      items: apoioBuffer,
    });
    apoioBuffer = [];
  };

  if (seedStatement) textBuffer.push(seedStatement);

  for (const line of lines) {
    const apoioMatch = line.match(APOIO_RE);
    if (apoioMatch) {
      flushText();
      apoioBuffer.push(apoioMatch[1].trim());
      continue;
    }
    if (line === "<!--blank-->") {
      flushText();
      flushApoio();
      continue;
    }
    const imgMatch = line.match(IMG_LINE_RE);
    if (imgMatch) {
      flushText();
      flushApoio();
      blocks.push({
        id: nextContentBlockId(),
        type: "image",
        src: imgMatch[1],
        width: 0.7,
        alignment: "center",
      });
      continue;
    }
    if (line.startsWith("> ") || line.startsWith("$$")) {
      flushApoio();
      continue;
    }
    flushApoio();
    textBuffer.push(line);
  }
  flushText();
  flushApoio();

  return blocks;
}

/**
 * Map parser types to StructuredActivity types.
 * After Fase A, StructuredActivity preserves all 8 types (multiple_choice,
 * multiple_answer, true_false, open_ended, fill_blank, matching, ordering, table).
 */
function mapQuestionType(parserType: string): StructuredQuestion["type"] {
  switch (parserType) {
    case "multiple_choice":
    case "multiple_answer":
    case "true_false":
    case "fill_blank":
    case "matching":
    case "ordering":
    case "table":
    case "open_ended":
      return parserType;
    default:
      return "open_ended";
  }
}
