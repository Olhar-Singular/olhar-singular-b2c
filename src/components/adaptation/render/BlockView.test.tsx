import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { BlockView } from "./BlockView";
import type { Block } from "@/lib/adaptation/canonical/schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rt = (t: string) => [{ type: "text" as const, text: t }];

/*
  Achado 0392: a prévia só leva o título junto com o bloco que ele encabeça se
  souber qual bloco impresso é título.
*/
describe("BlockView — marca de título para a paginação (achado 0392)", () => {
  it("marca o título de seção", () => {
    const block: Block = { id: id(1), type: "heading", level: 2, content: rt("Missão 2") };
    const { container } = render(<BlockView block={block} />);
    expect(container.querySelector("[data-folha-bloco]")).toHaveAttribute("data-folha-titulo");
  });

  it("não marca o bloco que não é título", () => {
    const block: Block = { id: id(2), type: "paragraph", content: rt("Texto") };
    const { container } = render(<BlockView block={block} />);
    expect(container.querySelector("[data-folha-bloco]")).not.toHaveAttribute("data-folha-titulo");
  });
});
