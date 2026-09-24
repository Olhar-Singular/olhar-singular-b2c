/**
 * useMathEditing — abre e fecha o chrome de edição de uma fórmula (inline ou em
 * bloco) com a mesma saída por teclado que o resto do Revisar já dá às suas
 * superfícies transitórias.
 *
 * Achado 0416: as duas NodeViews de fórmula eram as únicas superfícies
 * transitórias da folha sem saída por teclado — o único caminho de volta era
 * achar e clicar "Pronto". Como o alvo de clique da fórmula é generoso (ele é
 * chrome sobreposto, achado 0414), abrir o editor sem querer é fácil, e quem
 * abria ficava preso num estado que só saía no mouse.
 *
 * Duas decisões aqui não são cosméticas:
 *
 * - **`stopPropagation` no Escape.** No Revisar o Escape sobe e fecha o wizard
 *   inteiro; cancelar a superfície mais interna não pode custar a atividade.
 *   Mesma armadilha anotada em `steps/review/StepReview.tsx`.
 * - **O foco volta ao gatilho por `autoFocus`, não por `ref.current.focus()`.**
 *   O botão da fórmula não existe no DOM enquanto o editor está aberto: ele
 *   *monta* quando o editor fecha, e `autoFocus` é exatamente o gancho de
 *   montagem. Um `focus()` imperativo dependeria de a ref já estar preenchida
 *   no efeito.
 *
 * Achado 0417: o "Pronto" fechava sem devolver o foco, no pressuposto de que
 * fechar ali era sempre gesto de mouse. Não é: o "Pronto" é um botão, e quem
 * chega nele pelo teclado é justamente quem paga o preço — ele é o próprio
 * elemento que some, então o navegador manda o foco para o `BODY` e a próxima
 * tabulação recomeça do topo da página. Por isso as duas saídas devolvem o
 * foco; `returnFocus` distingue só a primeira montagem, em que ninguém editou
 * nada e roubar o foco seria o erro oposto.
 */

import { useState, type KeyboardEvent } from "react";

export interface MathEditing {
  /** O chrome de edição está aberto. */
  editing: boolean;
  /** `autoFocus` do gatilho: falso só antes da primeira edição. */
  returnFocus: boolean;
  /** onClick do gatilho da fórmula. */
  open: () => void;
  /** onClick do "Pronto". */
  close: () => void;
  /** onKeyDown do container do editor. */
  onKeyDown: (event: KeyboardEvent) => void;
}

/**
 * @param onEscape rodado antes de fechar pelo Escape — as NodeViews usam para
 * devolver o rascunho vazio à fórmula commitada (ver `useLatexDraft.onBlur`),
 * já que o input sai do DOM sem disparar `blur`.
 */
export function useMathEditing(onEscape: () => void): MathEditing {
  const [editing, setEditing] = useState(false);
  const [returnFocus, setReturnFocus] = useState(false);

  return {
    editing,
    returnFocus,
    open: () => setEditing(true),
    close: () => {
      setReturnFocus(true);
      setEditing(false);
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onEscape();
      setReturnFocus(true);
      setEditing(false);
    },
  };
}
