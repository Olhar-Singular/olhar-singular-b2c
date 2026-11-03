/**
 * QuestionCard — the expanded ("editar estrutura") state of a question (plano
 * §6.3 / D4). Accent shell with a "Questão N" bar, the editable stem (passed in
 * as the live NodeViewContent slot), a named Instrução field (with remove / add),
 * the full AnswerEditor (structure + answer key), and footer with Cancelar/Concluir.
 *
 * Answer, instruction and enunciado edits are buffered in LOCAL state — they are
 * only written to the Tiptap document when the teacher clicks Concluir (via
 * onCommit). Clicking Cancelar discards those local changes without touching the
 * document; the parent is responsible for restoring any stem-content edits that
 * happened live.
 *
 * Tiptap note: only the stem slot is outer-editor content. Every other section is
 * chrome and must be contentEditable={false} so ProseMirror does not treat it as
 * editable text — nested editors (RichTextField) re-enable editing on themselves.
 */

import { useEffect, useRef, useState } from "react";
import { AlignStartVertical, AlignEndVertical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { QuestionAnswer, RichText } from "@/lib/adaptation/canonical/schema";
import { AnswerEditor } from "../answer-editors/AnswerEditor";
import { changeAnswerKind } from "../answer-editors/answerOps";
import { QUESTION_KINDS, type QuestionKind } from "../questionKinds";
import { RichTextField } from "../RichTextField";

type EnunciadoPosition = "above" | "below";

/** The card's buffered (not yet committed) values, in onCommit order. */
export interface QuestionCardBuffer {
  answer: QuestionAnswer;
  instruction: RichText | null;
  enunciado: RichText | null;
  enunciadoPosition: EnunciadoPosition;
  customNumber: string | null;
}

interface QuestionCardProps {
  num: number | undefined;
  /** Optional custom number override (e.g. "1a"). Null → auto from position. */
  customNumber?: string | null;
  /** Initial answer value — buffered locally until Concluir. */
  answer: QuestionAnswer;
  /** Initial instruction value — buffered locally until Concluir. */
  instruction: RichText | null;
  /** Initial enunciado value — buffered locally until Concluir. */
  enunciado: RichText | null;
  /** Initial enunciado position — buffered locally until Concluir. */
  enunciadoPosition: EnunciadoPosition;
  disabled: boolean;
  /** Called on Concluir with the committed answer, instruction, enunciado, position and customNumber. */
  onCommit: (
    answer: QuestionAnswer,
    instruction: RichText | null,
    enunciado: RichText | null,
    enunciadoPosition: EnunciadoPosition,
    customNumber: string | null,
  ) => void;
  /** Called on Cancelar — the parent is responsible for restoring stem content. */
  onCancel: () => void;
  /**
   * Achado 0503: o gabarito de uma questão de lacunas vive no `answer` (aqui,
   * bufferizado), mas a lacuna impressa é o `___` do enunciado, que é conteúdo
   * vivo do Tiptap. O card avisa quem manda no enunciado para os dois andarem
   * juntos; sem os avisos ele volta a mexer só no gabarito.
   */
  onGapAdded?: () => void;
  onGapRemoved?: (index: number) => void;
  /**
   * Achado 1106: mirrors the buffered values so the parent can commit them when
   * the card is closed by opening another question's card (no Concluir click).
   */
  bufferRef?: React.MutableRefObject<QuestionCardBuffer | null>;
  stem: React.ReactNode;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wide text-surface-ink-soft">
      {children}
    </div>
  );
}

export function QuestionCard({
  num,
  customNumber = null,
  answer,
  instruction,
  enunciado,
  enunciadoPosition,
  disabled,
  onCommit,
  onCancel,
  onGapAdded,
  onGapRemoved,
  bufferRef,
  stem,
}: QuestionCardProps) {
  const [localAnswer, setLocalAnswer] = useState<QuestionAnswer>(answer);
  const [localInstruction, setLocalInstruction] = useState<RichText | null>(instruction);
  const [localEnunciado, setLocalEnunciado] = useState<RichText | null>(enunciado);
  const [localPosition, setLocalPosition] = useState<EnunciadoPosition>(enunciadoPosition);
  const [localCustomNumber, setLocalCustomNumber] = useState<string | null>(customNumber);
  useEffect(() => {
    if (!bufferRef) return;
    bufferRef.current = {
      answer: localAnswer,
      instruction: localInstruction,
      enunciado: localEnunciado,
      enunciadoPosition: localPosition,
      customNumber: localCustomNumber,
    };
  });
  // Local "adding" reveals the instruction field before any text is persisted.
  const [adding, setAdding] = useState(false);
  const showInstruction = localInstruction != null || adding;
  const currentLabel = QUESTION_KINDS.find((k) => k.kind === localAnswer.kind)!.label;

  /**
   * Achado 0363: o card nasce no lugar do rail, então o botão "Editar questão"
   * que recebeu o clique (ou o Enter) é desmontado no mesmo commit. Como nenhum
   * controle do card reivindicava o foco, o navegador o devolvia ao `<body>`:
   * o card abria com quinze controles novos e nenhum anel na tela, e o leitor
   * de tela não anunciava nada. O primeiro controle do card (o número da
   * questão) assume o foco na montagem; quando ele está desabilitado, quem
   * assume é o próprio card, que carrega o nome acessível da questão.
   */
  const numberInputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (disabled) cardRef.current?.focus();
    else numberInputRef.current?.focus();
    // Só na montagem: depois disso quem manda no foco é o professor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cardName = `Questão ${customNumber ?? num?.toString() ?? ""}, editar estrutura`.replace(" ,", "");

  return (
    <div
      data-testid="question-card"
      ref={cardRef}
      tabIndex={-1}
      role="group"
      aria-label={cardName}
      className="my-0.5 overflow-hidden rounded-[10px] border border-surface-accent bg-surface-paper shadow-[0_8px_28px_rgba(44,90,160,0.13)] focus:outline-none focus-visible:ring-2 focus-visible:ring-surface-accent"
    >
      <div
        contentEditable={false}
        className="flex items-center gap-2.5 border-b border-surface-accent-soft bg-surface-accent-soft px-4 py-2.5"
      >
        <span className="text-[13px] font-semibold text-surface-accent-ink">
          Questão{" "}
          <input
            type="text"
            ref={numberInputRef}
            aria-label="Número da questão"
            data-testid="question-number-input"
            value={localCustomNumber ?? (num?.toString() ?? "")}
            onChange={(e) => setLocalCustomNumber(e.target.value.trim() || null)}
            placeholder={num?.toString() ?? ""}
            disabled={disabled}
            /**
             * Achado 0368: o campo media 32 x 19 px. A largura de 32 px basta
             * para "1" ou "1a", mas a altura era só a da linha de 13 px do
             * `<span>` que o envolve: abaixo dos 24 px que o WCAG 2.5.8 pede
             * para o alvo, e este é o primeiro controle que o Tab encontra
             * quando o card abre (achado 0363). `h-6` dá os 24 px sem mexer no
             * `py-2.5` do cabeçalho.
             *
             * O `outline-none` deixava o foco visível por conta de um fio de
             * 1 px trocando de tom (`border-b`). O anel segue o mesmo padrão do
             * 0212/0422: `focus-visible:outline` é quem declara o
             * `outline-style` no Tailwind 3. Sem ele, `-2`/`-offset`/`-ring`
             * só dão largura, offset e cor, e nada chega à tela.
             */
            className="inline-block h-6 w-8 bg-transparent text-center border-b border-surface-accent focus:border-surface-accent-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-60"
          />
        </span>
        <Select
          value={localAnswer.kind}
          onValueChange={(kind) => setLocalAnswer(changeAnswerKind(localAnswer, kind as QuestionKind))}
          disabled={disabled}
        >
          <SelectTrigger
            data-testid="question-type-trigger"
            title="Tipo da questão"
            className="ml-auto h-7 w-auto gap-1 border-0 bg-transparent px-2 text-[12.5px] font-medium text-surface-accent-ink shadow-none hover:bg-surface-paper/60 focus:ring-1 focus:ring-surface-accent"
          >
            {currentLabel}
          </SelectTrigger>
          <SelectContent className="border-surface-chrome-line bg-surface-chrome text-surface-ink">
            {QUESTION_KINDS.map(({ kind, label }) => (
              <SelectItem key={kind} value={kind}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-4 px-4 py-4">

        {/* Enunciado acima do stem */}
        {localEnunciado !== null && localPosition === "above" && (
          <div contentEditable={false}>
            <FieldLabel>
              Enunciado
              <button
                type="button"
                className="-my-1 ml-auto inline-flex min-h-6 min-w-6 items-center justify-center rounded px-1.5 text-[11px] font-medium normal-case tracking-normal text-surface-ink-soft hover:text-destructive disabled:opacity-50"
                disabled={disabled}
                onClick={() => setLocalEnunciado(null)}
                aria-label="Remover enunciado"
              >
                remover ×
              </button>
            </FieldLabel>
            <div className="mb-1 flex gap-1">
              <Button
                type="button"
                size="icon"
                variant="default"
                className="h-6 w-6"
                disabled={disabled}
                onClick={() => setLocalPosition("above")}
                aria-label="Enunciado acima da imagem"
                title="Acima"
              >
                <AlignStartVertical className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                disabled={disabled}
                onClick={() => setLocalPosition("below")}
                aria-label="Enunciado abaixo da imagem"
                title="Abaixo"
              >
                <AlignEndVertical className="h-3.5 w-3.5" />
              </Button>
            </div>
            <RichTextField
              value={localEnunciado}
              placeholder="Escreva o enunciado da questão…"
              disabled={disabled}
              onChange={(rt) => setLocalEnunciado(rt.length > 0 ? rt : null)}
              ariaLabel="Enunciado da questão"
            />
          </div>
        )}

        <div>
          <div contentEditable={false}>
            <FieldLabel>Imagem / Conteúdo</FieldLabel>
          </div>
          {stem}
        </div>

        {/* Enunciado abaixo do stem */}
        {localEnunciado !== null && localPosition === "below" && (
          <div contentEditable={false}>
            <FieldLabel>
              Enunciado
              <button
                type="button"
                className="-my-1 ml-auto inline-flex min-h-6 min-w-6 items-center justify-center rounded px-1.5 text-[11px] font-medium normal-case tracking-normal text-surface-ink-soft hover:text-destructive disabled:opacity-50"
                disabled={disabled}
                onClick={() => setLocalEnunciado(null)}
                aria-label="Remover enunciado"
              >
                remover ×
              </button>
            </FieldLabel>
            <div className="mb-1 flex gap-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                disabled={disabled}
                onClick={() => setLocalPosition("above")}
                aria-label="Enunciado acima da imagem"
                title="Acima"
              >
                <AlignStartVertical className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="default"
                className="h-6 w-6"
                disabled={disabled}
                onClick={() => setLocalPosition("below")}
                aria-label="Enunciado abaixo da imagem"
                title="Abaixo"
              >
                <AlignEndVertical className="h-3.5 w-3.5" />
              </Button>
            </div>
            <RichTextField
              value={localEnunciado}
              placeholder="Escreva o enunciado da questão…"
              disabled={disabled}
              onChange={(rt) => setLocalEnunciado(rt.length > 0 ? rt : null)}
              ariaLabel="Enunciado da questão"
            />
          </div>
        )}

        {/* Botão adicionar enunciado (quando não existe) */}
        {localEnunciado === null && (
          <div contentEditable={false}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1 self-start border border-dashed border-surface-accent/40 text-surface-accent hover:border-surface-accent hover:bg-surface-accent hover:text-white"
              disabled={disabled}
              onClick={() => { setLocalEnunciado([]); setLocalPosition("below"); }}
              aria-label="Adicionar enunciado"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar enunciado
            </Button>
          </div>
        )}

        <div contentEditable={false}>
          <FieldLabel>
            Instrução
            {showInstruction && (
              <button
                type="button"
                className="-my-1 ml-auto inline-flex min-h-6 min-w-6 items-center justify-center rounded px-1.5 text-[11px] font-medium normal-case tracking-normal text-surface-ink-soft hover:text-destructive disabled:opacity-50"
                disabled={disabled}
                onClick={() => {
                  setLocalInstruction(null);
                  setAdding(false);
                }}
                aria-label="Remover instrução"
              >
                remover ×
              </button>
            )}
          </FieldLabel>
          {showInstruction ? (
            <RichTextField
              value={localInstruction ?? []}
              placeholder="Ex.: Marque a resposta correta."
              disabled={disabled}
              onChange={(rt) => setLocalInstruction(rt.length > 0 ? rt : null)}
              ariaLabel="Instrução da questão"
            />
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1 self-start border border-dashed border-surface-accent/40 text-surface-accent hover:border-surface-accent hover:bg-surface-accent hover:text-white"
              disabled={disabled}
              onClick={() => setAdding(true)}
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar instrução
            </Button>
          )}
        </div>

        <div contentEditable={false}>
          <AnswerEditor
            answer={localAnswer}
            disabled={disabled}
            onChange={setLocalAnswer}
            onGapAdded={onGapAdded}
            onGapRemoved={onGapRemoved}
          />
        </div>
      </div>

      <div contentEditable={false} className="flex justify-end gap-2 border-t border-surface-line px-4 py-3">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onCancel}
          className="text-surface-ink-soft hover:text-surface-ink"
          aria-label="Cancelar edição"
        >
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => onCommit(localAnswer, localInstruction, localEnunciado, localPosition, localCustomNumber)}
          className="bg-surface-accent text-white hover:bg-surface-accent-ink"
        >
          Concluir
        </Button>
      </div>
    </div>
  );
}

export default QuestionCard;
