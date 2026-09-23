/**
 * RichTextField — a single-paragraph inline rich-text editor that edits and
 * emits canonical `RichText`.
 *
 * Used by the answer editors (alternatives, true/false, checkbox, matching,
 * ordering items, table cells) and the image caption — anywhere the edited
 * value is `RichText`. Replaces the plain `<Input>`s that flattened bold /
 * italic / color / inline-math into plain text.
 *
 * A lista de extensões (conjunto mínimo inline-only, mais o `History` próprio do
 * campo) vive em `richTextFieldExtensions.ts`, com o porquê de cada peça.
 *
 * The color extension is `AllowlistedColor`, NOT the raw `@tiptap/extension-color`:
 * this field edits `answer.*`, `caption`, `enunciado` and `instruction`, i.e.
 * values that go straight into the canonical document, whose `Color` accepts only
 * the palette. A color pasted from Word — or from our OWN clipboard, which the DOM
 * serializes as `rgb(220, 38, 38)` — used to reach the model verbatim, so
 * `tryProseMirrorToCanonical` rejected the WHOLE document and the autosave froze
 * in silence (the B8 failure, one surface over). Same coercion as the folha.
 *
 * RichText <-> ProseMirror-inline mapping reuses the proven, round-trip-tested
 * `richTextToPM` / `pmToRichText` mappers. `onChange` only fires when the mapped
 * RichText actually changed (deep compare) to avoid render/onChange loops.
 *
 * No toolbar chrome — selection formatting lives in the folha's BubbleMenu
 * (§6.2). Inline marks (bold / italic / underline / strike / color) and inline
 * math are still parsed and rendered (extensions stay) but insertion of new
 * math nodes is reserved for a future dedicated UI. The value contract is
 * unchanged: the field always emits canonical `RichText`.
 */

import { useEffect, useRef } from "react";
import { useEditor, EditorContent, BubbleMenu } from "@tiptap/react";
import { SelectionBubble } from "./SelectionBubble";
import { SELECTION_BUBBLE_TIPPY_OPTIONS } from "./selectionBubbleTippy";
import { cn } from "@/lib/utils";
import type { RichText } from "@/lib/adaptation/canonical/schema";
import { type PMNode } from "@/lib/adaptation/tiptap/fromCanonical";
import { docFromRichText, richTextFromDoc, richTextEqual } from "./richTextFieldMapping";
import { buildRichTextFieldExtensions } from "./richTextFieldExtensions";

interface RichTextFieldProps {
  value: RichText;
  onChange: (rt: RichText) => void;
  placeholder?: string;
  disabled?: boolean;
  /**
   * Non-editable without the opacity/fading of `disabled`. Used for the
   * enunciado in QuestionPreview: text is locked but renders at full opacity
   * so the folha at rest looks like the printed document.
   */
  readOnly?: boolean;
  ariaLabel?: string;
  /**
   * Worksheet-faithful variant: no border and no toolbar — just editable text.
   * Used in the question PREVIEW so the folha at rest reads like the printed PDF
   * (plano §6.3 / D2) while still being click-to-edit. The card uses the default.
   */
  plain?: boolean;
  /** Suppress the BubbleMenu formatting bar — used in image caption/alt fields. */
  noBubble?: boolean;
}

export function RichTextField({
  value,
  onChange,
  placeholder = "Digite o texto...",
  disabled = false,
  readOnly = false,
  ariaLabel,
  plain = false,
  noBubble = false,
}: RichTextFieldProps) {
  // Seed once; track the last emitted RichText to guard against feedback loops.
  const initialContentRef = useRef<PMNode>(docFromRichText(value));
  const lastValueRef = useRef<RichText>(value);

  const editor = useEditor({
    extensions: buildRichTextFieldExtensions(),
    content: initialContentRef.current,
    editable: !disabled && !readOnly,
    onUpdate: ({ editor }) => {
      const next = richTextFromDoc(editor.getJSON() as PMNode);
      if (richTextEqual(next, lastValueRef.current)) return;
      lastValueRef.current = next;
      onChange(next);
    },
    editorProps: {
      attributes: {
        class: cn(
          // `rich-text-field` marks this as a NESTED inline editor so the folha's
          // top-level block labels (`.tiptap > p` ⇒ "Instrução" etc., in index.css)
          // never leak onto answer fields. Wrap long answers instead of scrolling.
          "rich-text-field w-full whitespace-normal break-words",
          // Foco visível (achado 0209). `focus:outline-none` do Tailwind 3 não
          // apaga o outline: compila para `outline: 2px solid transparent` e,
          // com especificidade 0,2,0, vencia a regra global `:focus-visible` de
          // `index.css` — o campo ficava sem NENHUM indicador (WCAG 2.4.7), e na
          // folha, onde o campo é só o texto impresso, foco e repouso eram
          // idênticos. O indicador é `outline` com offset: desenha fora do fluxo
          // e não muda a altura do bloco (o que reabriria o achado 0102).
          //
          // O `focus-visible:outline` sem sufixo (achado 0212) é o que declara o
          // `outline-style: solid`: no Tailwind 3 o `-2`, o `-offset-2` e o
          // `-ring` dão só largura, offset e cor. Sem ele o estilo vinha do
          // `outline: auto` do user-agent, que o reset `.tiptap:focus` de
          // `index.css` apagava — e o indicador nunca chegava à tela.
          "rounded-sm focus-visible:outline focus-visible:outline-2",
          "focus-visible:outline-offset-2 focus-visible:outline-ring",
          // Chrome de input (padding + altura mínima de alvo de clique) só no
          // card. Na folha (`plain`) o campo É o texto impresso: `min-h-[2rem]`
          // + `py-1` contra uma linha de ~22px empurrava cada alternativa de
          // 30px para 40px, e a folha inteira crescia ~60% em relação ao PDF
          // (achado 0102). Chrome de edição não entra no fluxo vertical.
          !plain && "px-2 py-1 min-h-[2rem]",
          // Tamanho da fonte: `font-size` é herdada, e o popover Formato move os
          // page tokens (`--doc-fs-*` / font-size da folha) no ancestral. Um valor
          // fixo AQUI vence a herança e congela o campo. Na folha (`plain`) o campo
          // herda — é o que dá paridade com o PDF; no card ele é chrome estrutural
          // e mantém o `text-sm` compacto.
          plain ? "text-[length:inherit] leading-[inherit]" : "text-sm",
          disabled && "opacity-50 cursor-not-allowed",
          readOnly && "cursor-default"
        ),
        // `role=textbox` anda junto do `aria-label` (achado 0217). Este campo é
        // um `contenteditable` ANINHADO no `contenteditable` da folha: sem role
        // o navegador o expõe como `generic`, e a ARIA proíbe nome acessível em
        // `generic` — o leitor de tela descarta o rótulo e a folha inteira vira
        // UM textbox gigante com regiões anônimas dentro. `aria-multiline=false`
        // porque o valor é um parágrafo só; `aria-readonly` quando não editável,
        // já que o role promete um campo e o `contenteditable` está desligado.
        ...(ariaLabel
          ? {
              "aria-label": ariaLabel,
              role: "textbox",
              "aria-multiline": "false",
              ...(disabled || readOnly ? { "aria-readonly": "true" } : {}),
            }
          : {}),
        "data-placeholder": placeholder,
      },
    },
  });

  // Ressincroniza com o valor de FORA (achado 0179).
  //
  // O texto editado aqui mora num atributo do nó da questão, no editor da folha.
  // Esse atributo pode mudar sem passar por este campo: o `Ctrl+Z` da folha
  // desfaz a transação de `updateAttributes` que a edição do campo gerou e
  // restaura o texto antigo. Sem re-semear, o ProseMirror aninhado segue
  // desenhando o documento que ele mesmo montou e a folha do Revisar passa a
  // divergir, em silêncio, do que é salvo e exportado.
  //
  // O guard é `lastValueRef`: durante a digitação o valor que volta é o que o
  // campo acabou de emitir, então nada é re-semeado (re-semear a cada tecla
  // mataria o cursor e o histórico próprio do campo). `setContent` roda com
  // `emitUpdate = false` — a mudança veio de fora, devolvê-la por `onChange`
  // fecharia o laço.
  useEffect(() => {
    if (!editor) return;
    if (richTextEqual(value, lastValueRef.current)) return;
    lastValueRef.current = value;
    editor.commands.setContent(docFromRichText(value), false);
  }, [editor, value]);

  if (!editor) return null;

  return (
    <div
      className={cn(
        "flex-1 min-w-0",
        // Non-plain (card) variant is chrome INSIDE the folha (§6.3 QuestionCard
        // et al.) — always paper-styled regardless of the app theme, same as the
        // rest of the sheet. Was `border-input bg-background`, which picks up the
        // dark theme and rendered as an unreadable near-black box on the white card.
        !plain && "rounded-md border border-surface-line-2 bg-surface-paper text-surface-ink",
        disabled && "opacity-60",
      )}
    >
      {!disabled && !readOnly && !noBubble && (
        <BubbleMenu editor={editor} tippyOptions={SELECTION_BUBBLE_TIPPY_OPTIONS}>
          <SelectionBubble editor={editor} />
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
