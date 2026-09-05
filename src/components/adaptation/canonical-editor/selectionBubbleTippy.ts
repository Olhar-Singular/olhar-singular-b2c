/**
 * Opções de posicionamento do BubbleMenu de seleção (caça 0181).
 *
 * A barra é chrome opaco desenhado sobre a folha, e a regra da superfície é que
 * chrome não cobre papel. Com o `placement: "top"` padrão do tippy, qualquer
 * seleção nas primeiras linhas do documento nascia em cima do `<h1>` e da linha
 * anterior — formatar o começo da folha era formatar às cegas.
 *
 * - `bottom-start`: abaixo da seleção, alinhada à esquerda dela. Acima está o
 *   contexto que o usuário já leu (título, linha anterior); abaixo está o texto
 *   que ele ainda vai formatar.
 * - `flip` só para `top-start`, quando não sobra espaço abaixo (fim da tela).
 * - `maxWidth: "none"`: o padrão do tippy é 350px, exatamente a largura em que a
 *   barra quebrava em duas fileiras e passava a cobrir DUAS linhas de papel.
 * - `appendTo: "parent"`: mantém o popover adjacente à referência na ordem do
 *   DOM (caça 0208) — sem isso o tippy o joga no fim do `<body>`.
 */
export const SELECTION_BUBBLE_TIPPY_OPTIONS = {
  duration: 100,
  appendTo: "parent",
  placement: "bottom-start",
  maxWidth: "none",
  offset: [0, 8],
  popperOptions: {
    modifiers: [
      { name: "flip", options: { fallbackPlacements: ["top-start"], padding: 8 } },
      { name: "preventOverflow", options: { padding: 8 } },
    ],
  },
} as const;
