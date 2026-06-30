/**
 * Word (.docx) export.
 *
 * `docxFileName`  — pure filename derivation (fully tested).
 * `downloadDocx`  — side-effecting blob + DOM download (v8 ignore).
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import type { CanonicalDocument, DocumentHeader, Block, Inline } from "@/lib/adaptation/canonical/schema";

/** Derive a safe .docx filename from the document header title. */
export function docxFileName(header: DocumentHeader): string {
  const title = header.title?.trim();
  if (!title) return "atividade-adaptada.docx";
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "atividade-adaptada"}.docx`;
}

function richTextToRuns(nodes: Inline[]): TextRun[] {
  return nodes.flatMap((node) => {
    if (node.type !== "text") return [];
    return [
      new TextRun({
        text: node.text,
        bold: node.marks?.includes("bold"),
        italics: node.marks?.includes("italic"),
        underline: node.marks?.includes("underline") ? {} : undefined,
      }),
    ];
  });
}

function blockToDocxParagraphs(block: Block, number: number): Paragraph[] {
  if (block.type === "heading") {
    const level = block.level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2;
    return [new Paragraph({ heading: level, children: richTextToRuns(block.content) })];
  }

  if (block.type === "paragraph") {
    return [new Paragraph({ children: richTextToRuns(block.content) })];
  }

  if (block.type === "question") {
    const label = block.customNumber ?? String(number);
    const stemRuns = block.stem.flatMap((p) =>
      p.type === "paragraph" ? richTextToRuns(p.content) : [],
    );
    const paragraphs: Paragraph[] = [
      new Paragraph({
        children: [new TextRun({ text: `${label}. `, bold: true }), ...stemRuns],
      }),
    ];

    const answer = block.answer;
    if (answer.kind === "open") {
      const lines = answer.answerLines ?? 3;
      for (let i = 0; i < lines; i++) {
        paragraphs.push(new Paragraph({ children: [new TextRun({ text: "_".repeat(60) })] }));
      }
    } else if (answer.kind === "multipleChoice" && answer.choices) {
      answer.choices.forEach((choice, idx) => {
        const letter = String.fromCharCode(65 + idx);
        paragraphs.push(
          new Paragraph({
            indent: { left: 360 },
            children: [
              new TextRun({ text: `${letter}) `, bold: true }),
              ...richTextToRuns(choice.content),
            ],
          }),
        );
      });
    } else if (answer.kind === "trueFalse") {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "(  ) Verdadeiro      (  ) Falso" })],
        }),
      );
    }

    paragraphs.push(new Paragraph({ children: [] }));
    return paragraphs;
  }

  if (block.type === "divider") {
    return [new Paragraph({ children: [new TextRun({ text: "─".repeat(40) })] })];
  }

  return [];
}

function headerParagraphs(header: DocumentHeader): Paragraph[] {
  const lines: [string, string][] = [
    ["Título", header.title ?? ""],
    ["Escola", header.school ?? ""],
    ["Professor(a)", header.teacher ?? ""],
    ["Data", header.date ?? ""],
  ].filter(([, v]) => v) as [string, string][];

  return lines.map(
    ([label, value]) =>
      new Paragraph({
        children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun({ text: value })],
      }),
  );
}

/* v8 ignore start */
export async function downloadDocx(
  document: CanonicalDocument,
  header: DocumentHeader,
): Promise<void> {
  let questionIndex = 0;
  const contentParagraphs = document.blocks.flatMap((block) => {
    if (block.type === "question") questionIndex++;
    return blockToDocxParagraphs(block, questionIndex);
  });

  const doc = new Document({
    sections: [
      {
        children: [...headerParagraphs(header), new Paragraph({ children: [] }), ...contentParagraphs],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = docxFileName(header);
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
/* v8 ignore stop */
