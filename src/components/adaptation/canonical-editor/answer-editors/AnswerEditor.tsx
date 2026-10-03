/**
 * AnswerEditor — interactive editor for a question's discriminated `answer`.
 *
 * Presentational only: it renders the correct UI per `answer.kind` and dispatches
 * the pure `answerOps` mutations, calling `onChange` with the new answer. All the
 * mutation logic lives in `answerOps.ts` (100% unit-tested).
 *
 * It is rendered ONLY inside the expanded question card (plano Fase 2), where the
 * teacher edits structure. So every structural / answer-key control (add·remove·
 * reorder, the correct radio/checkbox, the V/F toggle, the gap answer key, the
 * answer-lines config) is always available — there is no editor mode to hide it.
 */

import { useEffect, useId, useRef, useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FOLHA_BUTTON } from "@/components/adaptation/canonical-editor/folhaChrome";

/** Filled state of a sheet toggle: same accent as "Concluir" and the inserter "+". */
const FOLHA_BUTTON_FILLED =
  "border-surface-accent bg-surface-accent text-white hover:bg-surface-accent-ink hover:text-white";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { indexToLetter } from "@/components/adaptation/render/letters";
import { RichTextField } from "../RichTextField";
import { tableCellLabel } from "./tableCellLabel";
import {
  setCorrectAlternative,
  addAlternative,
  removeAlternative,
  setAlternativeContent,
  setTrueFalseValue,
  setTrueFalseContent,
  toggleCheckbox,
  setCheckboxContent,
  setMatchingSide,
  addMatchingPair,
  removeMatchingPair,
  setOrderingContent,
  reorderOrdering,
  setGapAnswer,
  setGapTip,
  setGapAlternatives,
  addGap,
  removeGap,
  setAnswerLines,
  setTableCell,
  addTrueFalseItem,
  removeTrueFalseItem,
  addCheckboxItem,
  removeCheckboxItem,
  addOrderingItem,
  removeOrderingItem,
  addTableRow,
  removeTableRow,
  addTableColumn,
  removeTableColumn,
} from "./answerOps";

interface AnswerEditorProps {
  answer: QuestionAnswer;
  onChange: (answer: QuestionAnswer) => void;
  disabled?: boolean;
  /**
   * Achado 0503: a lacuna impressa (`___` no enunciado) e a entrada do gabarito
   * são coisas separadas. Estes dois avisos deixam o dono do enunciado inserir
   * ou apagar o `___` correspondente; sem eles o card só mexe no gabarito (é o
   * caso de quem renderiza o AnswerEditor fora do editor canônico).
   */
  onGapAdded?: () => void;
  onGapRemoved?: (index: number) => void;
}

/**
 * Achado 0372: os marcadores de gabarito (rádio da múltipla escolha e caixa do
 * checkbox) ficam dentro de um `<label>` de 24 x 24 px, o alvo mínimo do WCAG
 * 2.2 (SC 2.5.8); o controle visível continua pequeno. A caixa leva
 * `rounded-[3px]` porque o `rounded-sm` do projeto vale 8px e a deixava redonda,
 * igual ao rádio, contradizendo a caixa quadrada impressa na folha.
 */
const MARKER_TARGET = "inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center";

/**
 * Achado 0371: `label` é o nome acessível e cita o item afetado ("Remover
 * alternativa B"); o `title` (tooltip) continua curto, porque quem vê o botão
 * já vê a linha em que ele está.
 */
function IconButton({
  onClick,
  title,
  label = title,
  disabled,
  children,
}: {
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  title: string;
  label?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onClick} title={title} aria-label={label} disabled={disabled}>
      {children}
    </Button>
  );
}

export function AnswerEditor({
  answer,
  onChange,
  disabled = false,
  onGapAdded,
  onGapRemoved,
}: AnswerEditorProps) {
  /**
   * 0312 — os campos deste card não tinham `id`/`name`: o Chrome reporta "A
   * form field element should have an id or name attribute" e os rótulos
   * visíveis ("Lacuna N", "Linhas de resposta") eram `<span>`, então clicar no
   * rótulo não levava o foco ao campo. O prefixo é único por card.
   */
  const fieldIdPrefix = useId();
  // Achado 0370: "+ Lacuna" leva o foco ao campo Resposta da lacuna criada,
  // assim que ela aparecer na resposta re-renderizada.
  const focusGapId = useRef<string | null>(null);
  useEffect(() => {
    if (!focusGapId.current) return;
    const field = document.getElementById(`${fieldIdPrefix}-gap-${focusGapId.current}`);
    if (!field) return;
    focusGapId.current = null;
    field.focus();
  }, [answer, fieldIdPrefix]);
  /**
   * Achado 0267: as linhas e as lixeiras da tabela são chaveadas por índice (o
   * canônico não dá `id` a linha/coluna). Removida a do meio, o React reaproveita
   * o botão focado, que passa a apagar a VIZINHA. Por isso: remover leva o foco
   * ao "+ Linha"/"+ Coluna" (alvo estável que não destrói nada) e anuncia a
   * remoção; o segundo clique de um duplo clique é ignorado; e adicionar leva o
   * foco à primeira célula criada, como o "+ Lacuna" (0370).
   */
  const addRowRef = useRef<HTMLButtonElement>(null);
  const addColumnRef = useRef<HTMLButtonElement>(null);
  const [tableStatus, setTableStatus] = useState("");
  /**
   * Foco pendente por nome acessível, procurado dentro do card quando a resposta
   * re-renderizada trouxer o alvo (célula da tabela, 0267; itens das listas, 1102).
   */
  const rootRef = useRef<HTMLDivElement>(null);
  const focusLabel = useRef<string | null>(null);
  useEffect(() => {
    const label = focusLabel.current;
    if (!label || !rootRef.current) return;
    const target = Array.from(rootRef.current.querySelectorAll<HTMLElement>("[aria-label]")).find(
      (el) => el.getAttribute("aria-label") === label,
    );
    if (!target) return;
    focusLabel.current = null;
    target.focus();
  }, [answer]);
  /**
   * Achado 1102: a lixeira vive dentro da linha que apaga (chaveada por `id`);
   * sem isto o botão focado desmontava e o foco caía no `<body>`. Remover foca a
   * lixeira do item que ocupou o lugar (ou a do anterior, se era o último); no
   * mínimo a op devolve a mesma resposta e nada muda. Adicionar foca o campo criado.
   */
  const removeItem = (next: QuestionAnswer, index: number, length: number, trashLabel: (i: number) => string) => {
    if (next === answer) return;
    focusLabel.current = trashLabel(Math.min(index, length - 2));
    onChange(next);
  };
  const addItem = (next: QuestionAnswer, length: number, fieldLabel: (i: number) => string) => {
    focusLabel.current = fieldLabel(length);
    onChange(next);
  };
  const addGapRef = useRef<HTMLButtonElement>(null);
  switch (answer.kind) {
    case "multipleChoice":
      return (
        <div ref={rootRef} className="flex flex-col gap-2" data-testid="answer-multipleChoice">
          {answer.alternatives.map((alt, i) => (
            <div key={alt.id} className="flex items-center gap-2 min-w-0">
              <label className={MARKER_TARGET}>
                <input
                  type="radio"
                  name={`mc-correct`}
                  checked={alt.correct}
                  disabled={disabled}
                  onChange={() => onChange(setCorrectAlternative(answer, alt.id))}
                  title="Marcar como correta"
                  aria-label={`Marcar alternativa ${indexToLetter(i)} como correta`}
                />
              </label>
              <RichTextField
                value={alt.content}
                disabled={disabled}
                onChange={(rt) => onChange(setAlternativeContent(answer, alt.id, rt))}
                placeholder="Alternativa"
                ariaLabel={`Alternativa ${indexToLetter(i)}`}
              />
              <IconButton onClick={() => removeItem(removeAlternative(answer, alt.id), i, answer.alternatives.length, (n) => `Remover alternativa ${indexToLetter(n)}`)} title="Remover alternativa" label={`Remover alternativa ${indexToLetter(i)}`} disabled={disabled}>
                <Trash2 className="w-3.5 h-3.5" />
              </IconButton>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className={cn("self-start gap-1", FOLHA_BUTTON)} onClick={() => addItem(addAlternative(answer), answer.alternatives.length, (n) => `Alternativa ${indexToLetter(n)}`)} disabled={disabled}>
            <Plus className="w-3.5 h-3.5" /> Alternativa
          </Button>
        </div>
      );

    case "trueFalse":
      return (
        <div ref={rootRef} className="flex flex-col gap-2" data-testid="answer-trueFalse">
          {answer.items.map((item, i) => (
            <div key={item.id} className="flex items-center gap-2 min-w-0">
              <RichTextField
                value={item.content}
                disabled={disabled}
                onChange={(rt) => onChange(setTrueFalseContent(answer, item.id, rt))}
                placeholder="Afirmação"
                ariaLabel={`Afirmação ${i + 1}`}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                // On the sheet, never app tokens: in dark mode they painted the
                // "F" as paper ink on a dark teal square (achado 0805).
                className={item.value ? FOLHA_BUTTON_FILLED : FOLHA_BUTTON}
                onClick={() => onChange(setTrueFalseValue(answer, item.id, !item.value))}
                disabled={disabled}
                title="Alternar Verdadeiro/Falso"
                aria-label={`Alternar Verdadeiro/Falso da afirmação ${i + 1}`}
              >
                {item.value ? "V" : "F"}
              </Button>
              <IconButton onClick={() => removeItem(removeTrueFalseItem(answer, item.id), i, answer.items.length, (n) => `Remover afirmação ${n + 1}`)} title="Remover afirmação" label={`Remover afirmação ${i + 1}`} disabled={disabled}>
                <Trash2 className="w-3.5 h-3.5" />
              </IconButton>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className={cn("self-start gap-1", FOLHA_BUTTON)} onClick={() => addItem(addTrueFalseItem(answer), answer.items.length, (n) => `Afirmação ${n + 1}`)} disabled={disabled}>
            <Plus className="w-3.5 h-3.5" /> Afirmação
          </Button>
        </div>
      );

    case "checkbox":
      return (
        <div ref={rootRef} className="flex flex-col gap-2" data-testid="answer-checkbox">
          {answer.items.map((item, i) => (
            <div key={item.id} className="flex items-center gap-2 min-w-0">
              <label className={MARKER_TARGET}>
                <Checkbox
                  className="rounded-[3px]"
                  checked={item.checked}
                  disabled={disabled}
                  onCheckedChange={() => onChange(toggleCheckbox(answer, item.id))}
                  aria-label={`Marcar opção ${i + 1}`}
                />
              </label>
              <RichTextField
                value={item.content}
                disabled={disabled}
                onChange={(rt) => onChange(setCheckboxContent(answer, item.id, rt))}
                placeholder="Opção"
                ariaLabel={`Opção ${i + 1}`}
              />
              <IconButton onClick={() => removeItem(removeCheckboxItem(answer, item.id), i, answer.items.length, (n) => `Remover opção ${n + 1}`)} title="Remover opção" label={`Remover opção ${i + 1}`} disabled={disabled}>
                <Trash2 className="w-3.5 h-3.5" />
              </IconButton>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className={cn("self-start gap-1", FOLHA_BUTTON)} onClick={() => addItem(addCheckboxItem(answer), answer.items.length, (n) => `Opção ${n + 1}`)} disabled={disabled}>
            <Plus className="w-3.5 h-3.5" /> Opção
          </Button>
        </div>
      );

    case "matching":
      return (
        <div ref={rootRef} className="flex flex-col gap-2" data-testid="answer-matching">
          {answer.pairs.map((pair, i) => (
            <div key={pair.id} className="flex items-center gap-2 min-w-0">
              <RichTextField
                value={pair.left}
                disabled={disabled}
                onChange={(rt) => onChange(setMatchingSide(answer, pair.id, "left", rt))}
                placeholder="Coluna A"
                ariaLabel={`Coluna A, par ${i + 1}`}
              />
              <span className="text-surface-ink-faint">↔</span>
              <RichTextField
                value={pair.right}
                disabled={disabled}
                onChange={(rt) => onChange(setMatchingSide(answer, pair.id, "right", rt))}
                placeholder="Coluna B"
                ariaLabel={`Coluna B, par ${i + 1}`}
              />
              <IconButton onClick={() => removeItem(removeMatchingPair(answer, pair.id), i, answer.pairs.length, (n) => `Remover par ${n + 1}`)} title="Remover par" label={`Remover par ${i + 1}`} disabled={disabled}>
                <Trash2 className="w-3.5 h-3.5" />
              </IconButton>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className={cn("self-start gap-1", FOLHA_BUTTON)} onClick={() => addItem(addMatchingPair(answer), answer.pairs.length, (n) => `Coluna A, par ${n + 1}`)} disabled={disabled}>
            <Plus className="w-3.5 h-3.5" /> Par
          </Button>
        </div>
      );

    case "ordering":
      return (
        <div ref={rootRef} className="flex flex-col gap-2" data-testid="answer-ordering">
          {answer.items.map((item, index) => (
            <div key={item.id} className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-surface-ink-faint w-5">{index + 1}.</span>
              <RichTextField
                value={item.content}
                disabled={disabled}
                onChange={(rt) => onChange(setOrderingContent(answer, item.id, rt))}
                placeholder="Item"
                ariaLabel={`Item ${index + 1}`}
              />
              <IconButton onClick={() => onChange(reorderOrdering(answer, index, index - 1))} title="Mover para cima" label={`Mover item ${index + 1} para cima`} disabled={disabled}>
                <ArrowUp className="w-3.5 h-3.5" />
              </IconButton>
              <IconButton onClick={() => onChange(reorderOrdering(answer, index, index + 1))} title="Mover para baixo" label={`Mover item ${index + 1} para baixo`} disabled={disabled}>
                <ArrowDown className="w-3.5 h-3.5" />
              </IconButton>
              <IconButton onClick={() => removeItem(removeOrderingItem(answer, item.id), index, answer.items.length, (n) => `Remover item ${n + 1}`)} title="Remover item" label={`Remover item ${index + 1}`} disabled={disabled}>
                <Trash2 className="w-3.5 h-3.5" />
              </IconButton>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className={cn("self-start gap-1", FOLHA_BUTTON)} onClick={() => addItem(addOrderingItem(answer), answer.items.length, (n) => `Item ${n + 1}`)} disabled={disabled}>
            <Plus className="w-3.5 h-3.5" /> Item
          </Button>
        </div>
      );

    case "fillBlank":
      return (
        <div ref={rootRef} className="flex flex-col gap-2" data-testid="answer-fillBlank">
          {answer.gaps.map((gap, index) => (
            <div key={gap.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <label htmlFor={`${fieldIdPrefix}-gap-${gap.id}`} className="text-xs text-surface-ink-faint w-16 shrink-0 whitespace-nowrap">
                  Lacuna {index + 1}
                </label>
                {/* The gap answer is the answer key (plain text, not formattable). */}
                <Input
                  id={`${fieldIdPrefix}-gap-${gap.id}`}
                  name="fillblank-gap"
                  value={gap.answer}
                  disabled={disabled}
                  onChange={(e) => onChange(setGapAnswer(answer, gap.id, e.target.value))}
                  placeholder="Resposta"
                  className="border-surface-line-2 bg-surface-paper text-surface-ink"
                />
                <IconButton
                  onClick={() => {
                    const next = removeGap(answer, gap.id);
                    const { gaps } = next as typeof answer;
                    // 1102: foco no campo da lacuna que ocupou o lugar (ou da
                    // anterior); sem lacunas, no "+ Lacuna", que não desmonta.
                    const neighbour = gaps[Math.min(index, gaps.length - 1)];
                    if (neighbour) focusGapId.current = neighbour.id;
                    onChange(next);
                    onGapRemoved?.(index);
                    if (!neighbour) addGapRef.current?.focus();
                  }}
                  title="Remover lacuna"
                  disabled={disabled}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </IconButton>
              </div>
              {/*
                Achado 0502: a IA grava `tip` e `alternatives` na lacuna e nenhuma
                superfície os mostrava. Aqui o professor finalmente os vê e edita —
                é ele quem corrige à mão e precisa da forma acentuada.
              */}
              <div className="flex items-center gap-2 pl-[4.5rem]">
                <Input
                  name="fillblank-gap-tip"
                  aria-label={`Dica da lacuna ${index + 1}`}
                  value={gap.tip ?? ""}
                  disabled={disabled}
                  onChange={(e) => onChange(setGapTip(answer, gap.id, e.target.value))}
                  placeholder="Dica (opcional)"
                  className="h-8 text-xs border-surface-line-2 bg-surface-paper text-surface-ink"
                />
                <Input
                  name="fillblank-gap-alternatives"
                  aria-label={`Outras respostas aceitas na lacuna ${index + 1}, separadas por vírgula`}
                  value={(gap.alternatives ?? []).join(", ")}
                  disabled={disabled}
                  onChange={(e) => onChange(setGapAlternatives(answer, gap.id, e.target.value))}
                  placeholder="Outras respostas, separadas por vírgula"
                  className="h-8 text-xs border-surface-line-2 bg-surface-paper text-surface-ink"
                />
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("self-start gap-1", FOLHA_BUTTON)}
            ref={addGapRef}
            onClick={() => {
              const next = addGap(answer);
              const { gaps } = next as typeof answer;
              focusGapId.current = gaps[gaps.length - 1].id;
              onChange(next);
              onGapAdded?.();
            }}
            disabled={disabled}
          >
            <Plus className="w-3.5 h-3.5" /> Lacuna
          </Button>
        </div>
      );

    case "table":
      return (
        <div ref={rootRef} className="flex flex-col gap-1.5" data-testid="answer-table">
          <p role="status" className="sr-only">{tableStatus}</p>
          {/* Achado 0369: uma lixeira por coluna, acima dela, e uma por linha. */}
          <div className="flex gap-1 min-w-0 pr-8">
            {Array.from({ length: Math.max(0, ...answer.rows.map((r) => r.length)) }, (_, ci) => (
              <div key={ci} className="flex flex-1 justify-center min-w-0">
                <IconButton
                  onClick={(e) => {
                    const next = removeTableColumn(answer, ci);
                    if (e.detail > 1 || next === answer) return;
                    onChange(next);
                    setTableStatus(`Coluna ${ci + 1} removida`);
                    addColumnRef.current?.focus();
                  }}
                  title="Remover coluna" label={`Remover coluna ${ci + 1}`} disabled={disabled}>
                  <Trash2 className="w-3.5 h-3.5" />
                </IconButton>
              </div>
            ))}
          </div>
          {answer.rows.map((row, ri) => (
            <div key={ri} className="flex items-center gap-1 min-w-0">
              {row.map((cell, ci) => (
                <RichTextField
                  key={ci}
                  value={cell}
                  disabled={disabled}
                  onChange={(rt) => onChange(setTableCell(answer, ri, ci, rt))}
                  placeholder="Célula"
                  // Achado 0371: a linha 0 é o cabeçalho (é o que a folha, o PDF
                  // e o Word imprimem como tal); os nomes seguem os da folha.
                  ariaLabel={
                    ri === 0
                      ? `Cabeçalho da coluna ${ci + 1}`
                      : tableCellLabel(answer.rows[0][ci], ri - 1, ci)
                  }
                />
              ))}
              <IconButton
                onClick={(e) => {
                  const next = removeTableRow(answer, ri);
                  if (e.detail > 1 || next === answer) return;
                  onChange(next);
                  setTableStatus(ri === 0 ? "Linha do cabeçalho removida" : `Linha ${ri} removida`);
                  addRowRef.current?.focus();
                }}
                title="Remover linha"
                label={ri === 0 ? "Remover linha do cabeçalho" : `Remover linha ${ri}`}
                disabled={disabled}>
                <Trash2 className="w-3.5 h-3.5" />
              </IconButton>
            </div>
          ))}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" className={cn("gap-1", FOLHA_BUTTON)} ref={addRowRef}
              onClick={() => {
                const next = addTableRow(answer) as typeof answer;
                focusLabel.current = tableCellLabel(next.rows[0][0], next.rows.length - 2, 0);
                onChange(next);
              }}
              disabled={disabled}>
              <Plus className="w-3.5 h-3.5" /> Linha
            </Button>
            <Button type="button" variant="outline" size="sm" className={cn("gap-1", FOLHA_BUTTON)} ref={addColumnRef}
              onClick={() => {
                const next = addTableColumn(answer) as typeof answer;
                focusLabel.current = `Cabeçalho da coluna ${next.rows[0].length}`;
                onChange(next);
              }}
              disabled={disabled}>
              <Plus className="w-3.5 h-3.5" /> Coluna
            </Button>
          </div>
        </div>
      );

    /* v8 ignore next 2 -- exhaustive switch; "open" is the only remaining kind */
    case "open":
    default:
      return (
        <div className="flex items-center gap-2" data-testid="answer-open">
          <label htmlFor={`${fieldIdPrefix}-answer-lines`} className="text-xs text-surface-ink-faint">
            Linhas de resposta:
          </label>
          <Input
            id={`${fieldIdPrefix}-answer-lines`}
            name="open-answer-lines"
            type="number"
            min={0}
            className="w-20 border-surface-line-2 bg-surface-paper text-surface-ink"
            value={answer.answerLines ?? 0}
            disabled={disabled}
            onChange={(e) => onChange(setAnswerLines(answer, Number(e.target.value)))}
          />
        </div>
      );
  }
}
