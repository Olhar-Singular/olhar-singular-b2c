/**
 * useLatexDraft — keeps a math NodeView's input editable without ever writing an
 * empty `latex` into the document, e mantém o `alt` honesto em relação à fórmula
 * que ele descreve.
 *
 * O canônico exige `latex.min(1)`: uma fórmula vazia não renderiza nada e não é
 * representável. Mas as NodeViews escreviam `e.target.value` direto no nó, então
 * no instante em que o professor selecionava a fórmula e apertava Backspace para
 * redigitar, o documento INTEIRO parava de converter para canônico — o autosave
 * congelava em silêncio (ainda mostrando "Salvo") e só voltava se ele terminasse
 * de digitar alguma coisa. Recusar a tecla seria pior (campo inapagável), então o
 * texto digitado vive em estado local e só um valor não vazio é commitado.
 *
 * Achado 0436: o `alt` é o NOME ACESSÍVEL da fórmula, e trocar o LaTeX não
 * mexia nele. Depois de trocar a expressão, a folha mostrava uma fórmula e o
 * leitor de tela anunciava outra, a antiga, sem nenhum sinal de divergência —
 * inclusive com LaTeX válido, que é o caso invisível a olho nu. Vale aqui a
 * mesma regra que a correção do 0317 escreveu para a imagem: *o conteúdo novo
 * não herda o que descrevia o antigo*. Commitar um `latex` diferente derruba o
 * `alt` e acende `altStale`, para que a NodeView avise o professor na folha —
 * zerar em silêncio trocaria uma mentira por um buraco.
 */

import { useEffect, useState } from "react";

export interface LatexDraft {
  /** Value to bind to the input. */
  value: string;
  /** onChange handler for the input. */
  onChange: (next: string) => void;
  /** onBlur handler: restores the committed formula if left empty. */
  onBlur: () => void;
  /** onChange handler do campo de texto alternativo. */
  onAltChange: (next: string) => void;
  /** A descrição caiu porque a fórmula que ela descrevia foi trocada. */
  altStale: boolean;
  /** Nome acessível do nó: nunca um `alt` que descreve a fórmula anterior. */
  accessibleName: string;
}

export function useLatexDraft(
  latex: string,
  alt: string | null,
  updateAttributes: (attrs: { latex?: string; alt?: string | null }) => void
): LatexDraft {
  const [draft, setDraft] = useState(latex);
  const [altStale, setAltStale] = useState(false);

  // Follow the attr when it changes from OUTSIDE this input (undo, re-seed of
  // the document, a sibling editing the same node).
  useEffect(() => {
    setDraft(latex);
  }, [latex]);

  return {
    value: draft,
    altStale,
    accessibleName: altStale ? latex : alt ?? latex,
    onChange: (next: string) => {
      setDraft(next);
      if (next.length === 0) return;
      if (alt !== null && next !== latex) {
        updateAttributes({ latex: next, alt: null });
        setAltStale(true);
        return;
      }
      updateAttributes({ latex: next });
    },
    onBlur: () => {
      if (draft.length === 0) setDraft(latex);
    },
    onAltChange: (next: string) => {
      updateAttributes({ alt: next || null });
      setAltStale(false);
    },
  };
}
