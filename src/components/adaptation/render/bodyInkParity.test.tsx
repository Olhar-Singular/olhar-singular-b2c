/**
 * Contrato da TINTA DO CORPO no renderer de leitura (achado 0335).
 *
 * O número da questão e o enunciado eram os únicos pontos de
 * `src/components/adaptation/render/` que pintavam com `text-foreground`,
 * token do tema do APP e não do papel. Resultado: na prévia do Exportar o "1."
 * saía `rgb(20, 36, 41)` enquanto o Revisar e o PDF usavam a tinta do documento
 * `#22201C` = `rgb(34, 32, 28)`. Pior, com o tema escuro ligado `--foreground`
 * vira quase-branco e a folha continua branca (os tokens `--sf-*` são
 * deliberadamente não sobrescritos no `.dark`), então a numeração some.
 *
 * A tinta do corpo tem ponto único (`DEFAULT_INK` em `pageTokens.ts`, servido na
 * tela pela classe `text-surface-ink` da folha): quem desenha o documento herda
 * dela ou a nomeia, nunca o token do chrome do app.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import type { Block } from "@/lib/adaptation/canonical/schema";
import { QuestionView } from "./blocks/QuestionView";

const QUESTION: Extract<Block, { type: "question" }> = {
  id: "00000000-0000-4000-8000-000000000335",
  type: "question",
  stem: [
    {
      id: "00000000-0000-4000-8000-000000000336",
      type: "paragraph",
      content: [{ type: "text", text: "Quanto é 2 + 2?" }],
    },
  ],
  enunciado: [{ type: "text", text: "Leia com atenção." }],
  enunciadoPosition: "above",
  answer: { kind: "open", lines: 2 },
};

/** Lista recursiva dos fontes .tsx/.ts do renderer (sem testes). */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry.name)) return [];
    if (/\.test\.tsx?$/.test(entry.name)) return [];
    return [path];
  });
}

describe("tinta do corpo no renderer de leitura (0335)", () => {
  it("pinta o número da questão com a tinta do papel, não com o tema do app", () => {
    render(<QuestionView block={QUESTION} number={1} />);
    const number = screen.getByTestId("question-number");
    expect(number).not.toHaveClass("text-foreground");
    expect(number).toHaveClass("text-surface-ink");
  });

  it("pinta o enunciado com a tinta do papel, não com o tema do app", () => {
    render(<QuestionView block={QUESTION} number={1} />);
    const enunciado = screen.getByTestId("question-enunciado");
    expect(enunciado).not.toHaveClass("text-foreground");
    expect(enunciado).toHaveClass("text-surface-ink");
  });

  it("nenhum arquivo do renderer usa `text-foreground` (token do chrome do app)", () => {
    const offenders = sourceFiles(join(__dirname)).filter((path) =>
      /\btext-foreground\b/.test(readFileSync(path, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
