import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import type { RichText } from "@/lib/adaptation/canonical/schema";
import { RichTextField } from "./RichTextField";

/**
 * Achado 0179 — o campo aninhado precisa acompanhar o valor que muda POR FORA.
 *
 * O texto de uma alternativa/instrução mora num atributo do nó da questão, e o
 * `Ctrl+Z` da folha pode restaurar esse atributo por baixo do campo (a escrita
 * do campo entra no histórico do editor de fora). Sem re-semear, o ProseMirror
 * aninhado continua desenhando o documento antigo: a folha do Revisar mostra um
 * texto e o que é salvo/exportado (`adaptation_result->'document'`) mostra outro,
 * em silêncio.
 *
 * Roda o ProseMirror de verdade (sem mock de `@tiptap/react`, ao contrário de
 * `RichTextField.test.tsx`): com o editor mockado nada provaria que o conteúdo
 * desenhado mudou. `noBubble` só evita o `tippy`, que não roda no jsdom.
 */
const t = (text: string): RichText => [{ type: "text", text }];

describe("RichTextField — ressincroniza com o valor de fora (achado 0179)", () => {
  it("re-semeia o campo quando `value` muda por fora", async () => {
    const { container, rerender } = render(
      <RichTextField noBubble value={t("resposta")} onChange={vi.fn()} />,
    );

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror")?.textContent).toBe("resposta");
    });

    rerender(<RichTextField noBubble value={t("respostaAAA")} onChange={vi.fn()} />);

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror")?.textContent).toBe("respostaAAA");
    });
  });

  it("não dispara `onChange` ao re-semear (a mudança veio de fora)", async () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<RichTextField noBubble value={t("a")} onChange={onChange} />);

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror")).not.toBeNull();
    });
    onChange.mockClear();

    rerender(<RichTextField noBubble value={t("b")} onChange={onChange} />);

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror")?.textContent).toBe("b");
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
