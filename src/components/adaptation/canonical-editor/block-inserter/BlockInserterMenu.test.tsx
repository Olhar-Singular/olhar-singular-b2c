import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BlockInserterMenu } from "./BlockInserterMenu";
import type { BlockGap } from "./topLevelGaps";

const followingGap: BlockGap = { index: 1, pos: 4, followingPos: 4 };
const trailingGap: BlockGap = { index: 2, pos: 9, followingPos: null };

function open(gap: BlockGap) {
  const onPick = vi.fn();
  render(<BlockInserterMenu gap={gap} onPick={onPick} />);
  fireEvent.click(screen.getByRole("button", { name: "Inserir bloco" }));
  return onPick;
}

describe("BlockInserterMenu", () => {
  it("opens with both sections", () => {
    open(followingGap);
    expect(screen.getByText("Questão")).toBeInTheDocument();
    expect(screen.getByText("Texto e mídia")).toBeInTheDocument();
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
});
