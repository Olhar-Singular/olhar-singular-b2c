import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BlockInserterMenu } from "./BlockInserterMenu";
import type { BlockGap } from "./topLevelGaps";

const followingGap: BlockGap = { index: 1, pos: 4, followingPos: 4 };
const trailingGap: BlockGap = { index: 2, pos: 9, followingPos: null };

function open(gap: BlockGap) {
  const onPick = vi.fn();
  render(<BlockInserterMenu gap={gap} label="Inserir bloco antes de parágrafo 2" onPick={onPick} />);
  fireEvent.click(screen.getByRole("button", { name: "Inserir bloco antes de parágrafo 2" }));
  return onPick;
}

describe("BlockInserterMenu", () => {
  it("opens with both sections", () => {
    open(followingGap);
    expect(screen.getByText("Questão")).toBeInTheDocument();
    expect(screen.getByText("Texto e mídia")).toBeInTheDocument();
  });

  /*
    Achado 0236: o "+" flutua sobre a folha, dentro do `transform: scale()`
    dela — 24px declarados viravam 18px no dedo, abaixo do minimo de 24x24 CSS
    px do WCAG 2.2 SC 2.5.8. Em ponteiro grosso ele e permanente (0207), entao
    e a porta de insercao de bloco no toque.
  */
  it("da ao gatilho um alvo de toque que sobrevive a escala da folha (achado 0236)", () => {
    render(<BlockInserterMenu gap={followingGap} label="Inserir bloco antes de parágrafo 2" onPick={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Inserir bloco antes de parágrafo 2" }).className,
    ).toMatch(/(^|\s)folha-touch-target(\s|$)/);
  });

  it("names the menu dialog after the trigger", () => {
    open(followingGap);
    expect(screen.getByRole("dialog", { name: "Inserir bloco antes de parágrafo 2" })).toBeInTheDocument();
  });

  it("picks a question type and reports the chosen item", () => {
    const onPick = open(followingGap);
    fireEvent.click(screen.getByRole("button", { name: "Múltipla escolha" }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toMatchObject({ id: "question:multipleChoice", action: { type: "insert" } });
  });

  it("picks a text/media block", () => {
    const onPick = open(followingGap);
    fireEvent.click(screen.getByRole("button", { name: "Parágrafo" }));
    expect(onPick.mock.calls[0][0]).toMatchObject({ id: "paragraph" });
  });

  it("offers Quebra de página when a block follows the gap", () => {
    open(followingGap);
    expect(screen.getByRole("button", { name: "Quebra de página" })).toBeInTheDocument();
  });

  it("hides Quebra de página at the trailing gap", () => {
    open(trailingGap);
    expect(screen.queryByRole("button", { name: "Quebra de página" })).not.toBeInTheDocument();
  });

  /*
    Achado 0207: 24x24 é o mínimo absoluto do WCAG 2.2 SC 2.5.8, sem folga, num
    controle que no toque precisa ser acertado sem pista visual. O resto do
    editor usa 28px.
  */
  it("usa alvo de toque de 28px no + (achado 0207)", () => {
    render(<BlockInserterMenu gap={followingGap} label="Inserir bloco antes de parágrafo 2" onPick={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Inserir bloco antes de parágrafo 2" });
    expect(trigger.className).toContain("h-7");
    expect(trigger.className).toContain("w-7");
  });
});
