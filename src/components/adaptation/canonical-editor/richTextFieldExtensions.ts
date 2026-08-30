/**
 * Extensões do `RichTextField` (o editor Tiptap ANINHADO dos campos da folha).
 *
 * Vive fora do componente por dois motivos: manter o `RichTextField.tsx` como
 * arquivo só-de-componente (fast refresh) e permitir montar um ProseMirror de
 * verdade nos testes, sem mock, para exercitar o keymap real
 * (`RichTextField.history.test.tsx`).
 *
 * Conjunto MÍNIMO e inline-only (Document restrito a exatamente um parágrafo,
 * Paragraph, Text, as quatro marcas inline, TextStyle+AllowlistedColor e o átomo
 * canônico InlineMath). Sem nós de bloco, para o campo nunca produzir heading /
 * lista / divisor que o `RichText` de um parágrafo só não consegue guardar.
 */

import { ReactNodeViewRenderer } from "@tiptap/react";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Underline from "@tiptap/extension-underline";
import Strike from "@tiptap/extension-strike";
import History from "@tiptap/extension-history";
import TextStyle from "@tiptap/extension-text-style";
import { FontSize } from "@/lib/tiptap/fontSizeExtension";
import { AllowlistedColor, InlineMathNode } from "@/lib/adaptation/tiptap/schema";
import { InlineMathNodeView } from "./nodeviews/InlineMathNodeView";

/** Build the InlineMath node with its React NodeView bound (so math renders). */
function buildInlineMathExtension() {
  const renderer = ReactNodeViewRenderer(InlineMathNodeView);
  // The `addNodeView` callback is invoked by Tiptap when wiring the real editor;
  // it is unreachable under jsdom because `@tiptap/react` is mocked in tests.
  /* v8 ignore next */
  return InlineMathNode.extend({ addNodeView: () => renderer });
}

/** Single-paragraph Document — content is exactly one paragraph, no blocks. */
const SingleParagraphDocument = Document.extend({ content: "paragraph" });

export function buildRichTextFieldExtensions() {
  return [
    SingleParagraphDocument,
    // Histórico PRÓPRIO do campo (achado 0248). O campo é um editor aninhado e
    // independente: o NodeView React segura o keydown aqui, então o histórico da
    // folha (StarterKit, no editor de fora) nunca vê `Mod-z`. Sem esta extensão
    // não havia keymap de desfazer em NENHUM texto da folha (enunciado, instrução,
    // alternativas, legenda e alt) e, como o autosave persiste a cada tecla, um
    // caractere digitado por engano virava estado salvo sem volta.
    History,
    Paragraph,
    Text,
    Bold,
    Italic,
    Underline,
    Strike,
    TextStyle,
    AllowlistedColor,
    FontSize,
    buildInlineMathExtension(),
  ];
}
