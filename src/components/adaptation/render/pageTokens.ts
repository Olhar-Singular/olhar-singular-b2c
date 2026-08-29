/**
 * pageTokens — fonte única dos valores-base da PÁGINA, compartilhada entre o
 * PDF (@react-pdf, em pt) e a folha da tela (CSS, em px). Mexer aqui move as
 * duas superfícies juntas: é o contrato de paridade do design (§3.1).
 *
 * Desde a Fase 4a as funções aceitam um `ResolvedPageStyle` (fonte/tamanho/
 * espaçamento do documento, vindo do popover Aparência). Chamar sem argumento
 * devolve os defaults atuais — paridade preservada para docs sem `pageStyle`.
 */
import type { CSSProperties } from "react";
import type { ResolvedPageStyle } from "./pageStyle";
import { fontFamilyToCss, fontFamilyToPdf } from "@/lib/adaptation/canonical/fontFamily";

/** Margem da página A4, em pontos (1pt = 1/72in) — igual ao PDF atual. */
export const PAGE_MARGIN_PT = 40;
/**
 * Altura útil da página A4, em pontos (o `size="A4"` do react-pdf é 595x842pt).
 *
 * Existe para a prévia do Exportar saber o que o PDF sempre soube: onde a folha
 * acaba. Antes só a LARGURA da página vivia na tela (os 794px do `PageSheet`), e
 * a altura era livre — o mesmo documento saía com N páginas no arquivo e aparecia
 * como uma folha só, esticada, na única tela feita para conferir a impressão
 * (achado 0118).
 */
export const PAGE_HEIGHT_PT = 842;

/** Tamanho de fonte base, em pontos. */
export const BASE_FONT_PT = 12;

/**
 * Corpo do TÍTULO por nível, em pontos (text-2xl/xl/lg da tela = 24/20/18px
 * convertidos px→pt). Ponto único do PDF (`PdfHeading`) e do Word
 * (`blockToDocxParagraphs`): sem ele o .docx caía no estilo `Heading1` da lib
 * `docx` e o título saía em 16pt azul, enquanto o PDF imprimia 18pt preto
 * (achado 0164).
 */
export const HEADING_PT: Record<1 | 2 | 3, number> = { 1: 18, 2: 15, 3: 13.5 };
/** Entrelinha base (multiplicador). */
export const BASE_LINE_HEIGHT = 1.4;
/** Espaçamento default entre blocos top-level, em px (≈ `1rem` do CSS atual). */
export const BASE_BLOCK_SPACING_PX = 16;

/**
 * Largura default (px, unidade da tela) de uma imagem SEM `width` explícito.
 * Contrato de paridade das imagens: o resizer do editor, a prévia da exportação
 * e o PDF caem todos neste valor quando a imagem não foi redimensionada — assim
 * o tamanho que o usuário vê editando é o tamanho que sai no PDF. Sem ele, o
 * react-pdf estica uma imagem sem largura por toda a caixa de conteúdo (a folha
 * mostra o natural / o editor mostra 300px), e os tamanhos divergem.
 */
export const DEFAULT_IMAGE_WIDTH_PX = 300;

/**
 * Cor da linha pautada da questão aberta — a pauta em que o aluno escreve.
 *
 * Ponto único das TRÊS superfícies (folha do Revisar, prévia do Exportar e PDF).
 * Antes cada uma tinha a sua: a folha herdava `--sf-line-2` (1,38:1 sobre o
 * branco), a prévia herdava `--border`, que é token do chrome do app e nem sequer
 * é cor de papel (1,33:1), e o PDF trazia `#999999` literal (2,85:1). Nenhuma
 * alcançava os 3:1 que a WCAG 1.4.11 exige de objeto gráfico, e a 1,3:1 a linha
 * simplesmente some numa impressão a laser em preto e branco.
 *
 * `#767676` é o cinza mais claro que ainda dá 4,5:1 sobre papel branco: contraste
 * de texto, não só de objeto gráfico, porque esta linha precisa aparecer depois de
 * fotocopiada.
 */
export const ANSWER_LINE_COLOR = "#767676";

/**
 * Cor do traço da DIVISÓRIA (bloco `divider`), na família de `ANSWER_LINE_COLOR`.
 *
 * Ponto único das TRÊS superfícies: a folha do Revisar (o `<hr>` do editor, que
 * lê a var `--doc-rule-color`), a prévia do Exportar (`DividerView`) e o PDF
 * (`PdfDivider`). Antes eram duas cores diferentes e nenhuma defensável: as duas
 * telas herdavam `--border`, token do chrome do app que nem sequer é cor de
 * papel (rgb(218,224,226), 1,33:1 sobre o branco), e o PDF trazia `#999999`
 * literal (2,85:1). Ambas abaixo dos 3:1 que a WCAG 1.4.11 exige de objeto
 * gráfico, e a 1,33:1 a divisória some numa fotocópia (achado 0148).
 *
 * Quem se move é a tela, que mostrava o traço quase invisível. O valor é o mesmo
 * `ANSWER_LINE_COLOR` da pauta: os dois são traços horizontais do documento e não
 * há razão para pesos diferentes, além de a pauta já ter provado o valor no papel.
 */
export const RULE_COLOR = ANSWER_LINE_COLOR;

/**
 * Espessura de TODO traço estrutural do documento: régua do cabeçalho,
 * divisória, borda da caixa do andaime e pauta da questão aberta. Ponto único
 * das superfícies, fechando a família de `RULE_COLOR` (cor).
 *
 * O `0145` já tinha unificado a pauta; os outros três traços continuavam com `1`
 * literal no `@react-pdf`, que é 1pt, contra o `1px` CSS das telas, que é
 * 0,75pt. Todo traço estrutural saía do papel ~33% mais grosso do que na tela em
 * que o professor conferiu a prova, e a espessura do traço é justamente o que ele
 * não consegue checar antes de imprimir (achado 0150).
 *
 * O valor adotado é o que as telas já mostravam (1px = 0,75pt): quem se move é o
 * PDF. Baixar mais tornaria o traço quase invisível numa laser gasta, exatamente
 * o problema que a escolha de `RULE_COLOR` acabou de fechar.
 */
export const RULE_WIDTH_PX = 1;

/**
 * Distância entre uma pauta e a seguinte — a altura útil que sobra para o aluno
 * escrever. Ponto único das TRÊS superfícies, ao lado de `ANSWER_LINE_COLOR`.
 *
 * Antes cada superfície tinha o seu valor à mão: 18px de gap na folha do Revisar,
 * `space-y-3` (12px) na prévia do Exportar e 10pt (13,3px) de `marginBottom` no
 * PDF. O professor dimensionava a resposta olhando a folha (~5 mm no papel) e o
 * aluno recebia ~3,9 mm impressos — quase 25% menos altura de escrita por linha,
 * exatamente o encolhimento que faz a resposta não caber para quem tem disgrafia
 * ou letra grande.
 *
 * O valor que manda é o do papel, então adota-se o MAIOR dos três (o da folha do
 * Revisar, ~5 mm): reduzir seria piorar a acessibilidade do produto.
 */
export const ANSWER_LINE_GAP_PX = 18;

/**
 * Espessura do traço da pauta da questão aberta. Ponto único das TRÊS superfícies,
 * fechando a família de `ANSWER_LINE_COLOR` (cor) e `ANSWER_LINE_GAP_PX` (passo).
 *
 * Antes a espessura era o último literal solto: as duas telas herdavam o `border-b`
 * do Tailwind (1px CSS = 0,75pt no papel) e o PDF trazia `borderBottomWidth: 1`,
 * que no @react-pdf é 1pt. A mesma pauta saía 33% mais grossa impressa do que na
 * tela em que a professora a conferiu — e a pauta é o único elemento cuja aparência
 * ela não consegue checar antes de imprimir.
 *
 * O valor adotado é o que as duas telas já mostravam (1px = 0,75pt): quem se move é
 * o PDF. Baixar mais tornaria a linha quase invisível numa laser gasta, exatamente o
 * problema que a escolha de `ANSWER_LINE_COLOR` acabou de fechar.
 */
export const ANSWER_LINE_WIDTH_PX = RULE_WIDTH_PX;

/**
 * Cadência do tracejado da pauta: comprimento do traço e do vão, em px de tela.
 * Ponto único das TRÊS superfícies, fechando a família de `ANSWER_LINE_COLOR`
 * (cor), `ANSWER_LINE_GAP_PX` (passo) e `ANSWER_LINE_WIDTH_PX` (espessura).
 *
 * Os valores transcrevem o que o `border-dashed` do Tailwind já desenha nas duas
 * telas (no Chrome, 3px de traço e 2px de vão para uma borda de 1px), que é a
 * referência: é na tela que o professor confere a prova.
 *
 * Existiam para o papel resolver sozinho: o @react-pdf deriva o dash da borda
 * (`ctx.dash(w * 2, { space: w * 1.2 })`), então a cadência era FUNÇÃO da
 * espessura. Quando o achado 0145 baixou a borda de 1pt para 0,75pt, o tracejado
 * encolheu junto e a divergência com a tela pulou de 17% para 56% — o papel saía
 * quase pontilhado onde a tela mostrava traços. Com o dash explícito, ajustar a
 * espessura não mexe mais no ritmo (achado 0154).
 */
export const ANSWER_LINE_DASH_PX = 3;

/** Vão entre um traço e o seguinte, par de `ANSWER_LINE_DASH_PX`. */
export const ANSWER_LINE_DASH_SPACE_PX = 2;

/**
 * Vão entre um item de lista de resposta e o seguinte (alternativas de múltipla
 * escolha). Ponto único das TRÊS superfícies, na mesma família de
 * `ANSWER_LINE_GAP_PX`, que o achado 0111 unificou para a pauta da questão aberta.
 *
 * Antes cada superfície tinha o seu: `gap-2` (8px) na folha do Revisar,
 * `space-y-2` (8px) na prévia do Exportar e `marginBottom: 3` (3pt = 4px) no PDF.
 * As duas telas concordavam e o papel saía ~14% mais compacto por linha, então o
 * professor dimensionava a prova olhando a tela e a paginação impressa não batia.
 *
 * O valor adotado é o que as duas telas já mostravam (8px = 6pt): quem se move é
 * o PDF, que passa a imprimir o que o professor vê.
 */
export const ANSWER_ITEM_GAP_PX = 8;

/**
 * Coluna do MARCADOR de alternativa: `ALTERNATIVE_MARKER_COLUMN_PT` é a distância
 * do x do ordinal ("a)") ao x do texto, e `ALTERNATIVE_MARKER_GAP_PX` é o vão
 * entre os dois. Ponto único das TRÊS superfícies (achado 0340).
 *
 * O achado 0202 unificou só a LARGURA do marcador na tela; o vão continuou
 * escrito à mão uma vez por superfície e as cópias discordavam — `gap-2.5`
 * (10px) na folha do Revisar contra `gap-2` (8px) na prévia do Exportar e 22pt
 * de coluna no PDF. O texto da alternativa começava 1,7pt mais à direita
 * justamente na tela onde o professor julga a impressão, e sobrava menos largura
 * útil por linha do que no papel, mudando onde a alternativa longa quebra.
 *
 * O valor adotado é o do papel (22pt, o que o PDF já imprimia): a largura em `em`
 * do marcador da tela é DERIVADA dele menos o vão, então a coluna acompanha o
 * `pageStyle.fontSize` sem se descolar do PDF na base de 12pt.
 */
export const ALTERNATIVE_MARKER_COLUMN_PT = 22;
export const ALTERNATIVE_MARKER_GAP_PX = 8;

/**
 * Caixa do bloco ANDAIME: recuo interno, respiro vertical e largura da coluna do
 * ordinal ("1.", "2." …). Ponto único das duas superfícies impressas — a prévia
 * do Exportar e o PDF —, na mesma família de `ANSWER_ITEM_GAP_PX` (achado 0313).
 *
 * Antes cada uma escolhia a sua: na tela, `p-3` (12px) mais `pl-5` (20px) da
 * `<ol>` recuavam os passos 32px; no PDF, `padding: 6` (6pt = 8px) e nenhuma
 * coluna de ordinal (a numeração era texto corrido). O mesmo passo saía 24px à
 * esquerda no papel — o pior desvio horizontal do documento e o único bloco em
 * que a lista de apoio troca de coluna entre a tela e a impressão (achado 0124).
 *
 * O valor adotado é o que a tela já mostrava, porque é ele que dá ao andaime a
 * leitura de caixa de apoio destacada do texto; quem se move é o PDF.
 */
export const SCAFFOLDING_PADDING_PX = 12;
/** Margem acima e abaixo da caixa do andaime (o `my-3` da tela). */
export const SCAFFOLDING_MARGIN_Y_PX = 12;
/** Recuo do texto do passo em relação à caixa (o `pl-5` da `<ol>` da tela). */
export const SCAFFOLDING_STEP_INDENT_PX = 20;

/**
 * Fundo e borda da caixa do ANDAIME. Ponto único das TRÊS superfícies (folha do
 * Revisar, prévia do Exportar e PDF), fechando a família dos tokens de medida
 * acima — a cor era o único atributo da caixa fora da unificação do `0124`.
 *
 * Antes as duas telas liam os tokens bege da folha (`--sf-mesa` a 40% sobre o
 * papel e `--sf-chrome-line`) e o PDF trazia `#F3F4F6`/`#E5E7EB` literais, que
 * são cinzas do Tailwind sem origem em token nenhum deste projeto. O resultado
 * era um hue flip: quente na tela (245 > 243 > 240), frio no papel
 * (246 > 244 > 243). A caixa de apoio é justamente o que precisa se destacar do
 * corpo para o aluno achar a instrução, e esse destaque mudava de leitura entre
 * a tela em que o professor decide e a folha que chega ao aluno (achado 0149).
 *
 * Quem se move é o PDF: o bege é a paleta da folha inteira. Os valores são as
 * cores da tela JÁ COMPOSTAS sobre o papel branco — o `@react-pdf` não recebe
 * alpha, e passar `--sf-mesa` cru deixaria a caixa mais escura no papel.
 */
export const SCAFFOLDING_BG = "#F5F3F0";
/** Borda da caixa do andaime: `--sf-chrome-line` resolvido (rgb(228,223,215)). */
export const SCAFFOLDING_BORDER = "#E4DFD7";

/**
 * Rótulo impresso no topo da caixa do ANDAIME. Ponto único das TRÊS superfícies
 * (folha do Revisar, prévia do Exportar e PDF), fechando a família dos tokens da
 * caixa que o `0124` (medida) e o `0149` (cor) abriram.
 *
 * Antes o rótulo existia uma vez só, como chrome do editor: `ScaffoldingView` e
 * `PdfScaffolding` desenhavam a lista de passos direto, e o aluno recebia um
 * retângulo bege sem título. Os outros rótulos da folha (TÍTULO, PARÁGRAFO,
 * LEGENDA) podem sumir na impressão porque nomeiam elementos que se identificam
 * sozinhos no papel; a caixa do andaime não — impressa ela é um bege claro com
 * uma lista dentro, competindo com as alternativas da questão logo acima, e o
 * rótulo é a ÚNICA coisa que a nomeia. Some justamente para o aluno com barreira
 * de aprendizagem, que é quem o andaime existe para atender (achado 0155).
 *
 * O rótulo é texto do DOCUMENTO, não chrome: as três superfícies o desenham com
 * a tipografia da folha (o tamanho `caption` de `resolveElementFontSizes`), então
 * subir o tamanho do texto no popover "Formato" leva o rótulo junto.
 */
export const SCAFFOLDING_LABEL = "Apoio";

/**
 * Raio do canto da caixa do ANDAIME. Ponto único das TRÊS superfícies, fechando
 * a família que o `0124` (medida), o `0149` (cor) e o `0150` (traço) abriram.
 *
 * O raio era o último atributo da caixa fora da unificação, e em três valores:
 * `rounded-lg` (12px) na folha do Revisar, `rounded-md` (10px) na prévia do
 * Exportar e nenhum `borderRadius` no PDF, isto é, quina viva no papel. Uma
 * caixa de canto arredondado lê como cartão de apoio destacado do corpo; de
 * canto reto, como moldura de tabela. O professor decide o destaque num cartão
 * e o aluno recebe um retângulo, justamente no bloco que existe para o aluno
 * com barreira de leitura achar a instrução (achado 0161).
 *
 * Quem se move é o papel, pelo mesmo critério dos achados anteriores da caixa:
 * é na tela que o professor confere a prova. O valor é o da folha do Revisar
 * (12px, o `rounded-lg` que era `var(--radius)`), agora literal aqui para não
 * depender de uma variável de tema do chrome.
 */
export const SCAFFOLDING_RADIUS_PX = 12;

/**
 * Família usada quando o documento NÃO traz `pageStyle.fontFamily` — o caso
 * normal, já que nenhuma UI grava a fonte até o professor escolher uma no
 * popover "Formato".
 *
 * Antes a ausência de override significava "não emitir `fontFamily`", e cada
 * superfície caía no seu próprio default: a folha herdava a fonte do app
 * (`Plus Jakarta Sans`, `index.css`) e o `@react-pdf` caía no built-in
 * Helvetica. O mesmo documento aparecia com tipografias visivelmente diferentes
 * na tela e no papel — exatamente o que o contrato de paridade existe para
 * impedir. Agora as duas superfícies resolvem pelo MESMO token.
 *
 * O token é `sans` (Helvetica/Arial) porque preserva byte a byte o que o PDF já
 * imprimia: quem se move é a folha, que passa a mostrar o que sai no papel.
 * Trocar este default por uma fonte de acessibilidade é decisão de produto e
 * muda o PDF de todo mundo — não cabe aqui.
 */
export const DEFAULT_FONT_FAMILY_TOKEN = "sans";

/**
 * Defaults resolvidos usados quando nenhum `pageStyle` é passado. Definido aqui
 * (a partir das constantes-base) em vez de importado de `pageStyle.ts` para
 * evitar um ciclo de import em tempo de avaliação (pageStyle importa as
 * constantes-base deste módulo).
 */
const DEFAULT_RESOLVED: ResolvedPageStyle = {
  fontFamily: undefined,
  fontSize: BASE_FONT_PT,
  blockSpacing: BASE_BLOCK_SPACING_PX,
};

/** pt -> px na tela (CSS px = pt * 96/72). */
const PT_TO_PX = 96 / 72;
const px = (pt: number) => `${Math.round(pt * PT_TO_PX * 100) / 100}px`;

/** `PAGE_HEIGHT_PT` na unidade da tela (px) — 842pt = 1123px a 96 dpi. */
export const PAGE_HEIGHT_PX = Math.round(PAGE_HEIGHT_PT * PT_TO_PX);

/** `PAGE_MARGIN_PT` na unidade da tela (px) — o mesmo padding que `pageTokensToCss` aplica na folha. */
export const PAGE_MARGIN_PX = Math.round(PAGE_MARGIN_PT * PT_TO_PX * 100) / 100;

/**
 * Área ÚTIL da página A4 na unidade da tela (px): a altura da folha menos as
 * duas margens. É por ela que se divide a altura do CONTEÚDO para saber quantas
 * folhas o documento gasta.
 *
 * Existe porque a contagem do `PageSheet` dividia o conteúdo pela página inteira
 * (1123px), contando os 107px de margem como se fossem texto: a folha do Revisar
 * voltava a terminar no meio de uma página, sem régua de virada, e a prévia
 * anunciava uma folha a menos do que o arquivo emitia (achado 0153). No PDF o
 * `<Page>` reserva `PAGE_MARGIN_PT` em cima e embaixo, então o que cabe por
 * página é isto, não os 842pt cheios.
 */
export const PAGE_CONTENT_HEIGHT_PX = PAGE_HEIGHT_PX - 2 * PAGE_MARGIN_PX;

/** `ANSWER_LINE_GAP_PX` na unidade do PDF (pt), pela mesma razão 72/96. */
export const ANSWER_LINE_GAP_PT = ANSWER_LINE_GAP_PX / PT_TO_PX;

/** `ANSWER_LINE_WIDTH_PX` na unidade do PDF (pt), pela mesma razão 72/96. */
export const ANSWER_LINE_WIDTH_PT = ANSWER_LINE_WIDTH_PX / PT_TO_PX;

/** `ANSWER_LINE_DASH_PX` na unidade do PDF (pt), pela mesma razão 72/96. */
export const ANSWER_LINE_DASH_PT = ANSWER_LINE_DASH_PX / PT_TO_PX;

/** `ANSWER_LINE_DASH_SPACE_PX` na unidade do PDF (pt), pela mesma razão 72/96. */
export const ANSWER_LINE_DASH_SPACE_PT = ANSWER_LINE_DASH_SPACE_PX / PT_TO_PX;

/** `RULE_WIDTH_PX` na unidade do PDF (pt), pela mesma razão 72/96. */
export const RULE_WIDTH_PT = RULE_WIDTH_PX / PT_TO_PX;

/** `ANSWER_ITEM_GAP_PX` na unidade do PDF (pt), pela mesma razão 72/96. */
export const ANSWER_ITEM_GAP_PT = ANSWER_ITEM_GAP_PX / PT_TO_PX;

/** `ALTERNATIVE_MARKER_GAP_PX` na unidade do PDF (pt), pela mesma razão 72/96. */
export const ALTERNATIVE_MARKER_GAP_PT = ALTERNATIVE_MARKER_GAP_PX / PT_TO_PX;

/**
 * Largura do marcador na TELA, em `em` sobre o corpo do documento: a coluna do
 * papel menos o vão, na base de 12pt. Em `em` para escalar com a fonte da folha.
 */
export const ALTERNATIVE_MARKER_WIDTH_EM =
  Math.round(((ALTERNATIVE_MARKER_COLUMN_PT - ALTERNATIVE_MARKER_GAP_PT) / BASE_FONT_PT) * 1e4) /
  1e4;

/** Tokens da caixa do andaime na unidade do PDF (pt), pela mesma razão 72/96. */
export const SCAFFOLDING_PADDING_PT = SCAFFOLDING_PADDING_PX / PT_TO_PX;
export const SCAFFOLDING_MARGIN_Y_PT = SCAFFOLDING_MARGIN_Y_PX / PT_TO_PX;
export const SCAFFOLDING_STEP_INDENT_PT = SCAFFOLDING_STEP_INDENT_PX / PT_TO_PX;
export const SCAFFOLDING_RADIUS_PT = SCAFFOLDING_RADIUS_PX / PT_TO_PX;

/**
 * Tamanho de cada elemento do documento como FRAÇÃO do tamanho base.
 *
 * Os valores reproduzem as proporções que o PDF fixava em constantes no base de
 * 12pt (instrução/enunciado 10.5pt, legenda 10pt), então um documento sem
 * `elementFontSizes` explícito sai do papel exatamente como antes. O que muda é
 * serem proporções e não constantes: subir o tamanho do texto no popover
 * "Formato" — o controle de acessibilidade que mais importa aqui — escala junto.
 * Antes a folha crescia e a instrução impressa continuava miúda.
 */
export const ELEMENT_FONT_RATIOS = {
  stem: 1,
  instruction: 10.5 / BASE_FONT_PT,
  alternative: 1,
  caption: 10 / BASE_FONT_PT,
} as const;

/** Tamanhos por elemento já resolvidos, em pt. Toda chave presente (sem buracos). */
export type ElementFontSizesPt = { [K in keyof typeof ELEMENT_FONT_RATIOS]: number };

/**
 * Resolve os tamanhos por elemento (pt) de um documento.
 *
 * UM resolvedor alimenta as três superfícies — a folha do editor (via CSS vars
 * `--doc-fs-*`), o renderer read-only e o PDF —, então a paridade vem por
 * construção, não de três conjuntos de constantes que alguém precisa manter
 * iguais. Um `pageStyle.elementFontSizes` explícito sobrescreve POR CHAVE; as
 * chaves ausentes continuam seguindo o tamanho base.
 */
export function resolveElementFontSizes(resolved: ResolvedPageStyle): ElementFontSizesPt {
  const overrides = resolved.elementFontSizes;
  const derive = (key: keyof typeof ELEMENT_FONT_RATIOS) =>
    overrides?.[key] ?? resolved.fontSize * ELEMENT_FONT_RATIOS[key];
  return {
    stem: derive("stem"),
    instruction: derive("instruction"),
    alternative: derive("alternative"),
    caption: derive("caption"),
  };
}

/**
 * Altura de CAIXA ALTA (cap height) das famílias que desenham texto do
 * documento, em em. Existe para converter a razão de tinta da fórmula
 * (`MATH_INK_RATIO`) no tamanho de fonte de cada superfície.
 *
 * Comparar `fontSize` entre famílias diferentes não diz nada: o que o professor
 * enxerga é a altura da tinta, e ela é o produto do tamanho pela caixa alta da
 * família. Foi exatamente esse degrau que inverteu a proporção da fórmula entre
 * a tela e o papel no achado 0424.
 *
 * `body` e `mathPdf` são os valores de `CapHeight` dos AFM das famílias base do
 * PostScript (Helvetica 718, Courier 572); `mathScreen` é a caixa alta efetiva da
 * KaTeX_Main, derivada da medição do 0424 na folha do Revisar.
 */
export const CAP_HEIGHT_EM = {
  /** Corpo do documento (Helvetica na base, Arial na tela). */
  body: 0.718,
  /** Fórmula no PDF (Courier). */
  mathPdf: 0.572,
  /** Fórmula na tela (KaTeX_Main). */
  mathScreen: 0.663,
} as const;

/**
 * Quanto a tinta da FÓRMULA mede em relação à tinta do CORPO, na mesma linha.
 * Ponto único das superfícies — a decisão do produto sobre o peso da matemática
 * dentro da frase.
 *
 * Antes eram duas decisões independentes, e nenhuma delas daqui: na tela valia o
 * `1.21em` que a folha de estilo do KaTeX traz de fábrica (1,12x de tinta) e no
 * papel um `fontSize: 11` fixo numa família de caixa alta bem mais baixa que a do
 * corpo (0,74x). A proporção não só divergia, INVERTIA de lado: o professor
 * revisava uma linha em que a matemática se destacava e imprimia uma em que ela
 * encolhia dentro do parágrafo (achado 0424).
 *
 * O valor adotado é o que a folha do Revisar já mostrava, porque é nela que o
 * professor confere a prova; quem se move é o PDF. Baixar para 1 encolheria a
 * fórmula na tela de todo mundo, o oposto do que um produto de acessibilidade
 * deve fazer com o elemento mais denso da linha.
 */
export const MATH_INK_RATIO = 1.12;

/**
 * Tamanho da fórmula na TELA, como múltiplo do corpo ao redor (`em`).
 *
 * Relativo de propósito: a fórmula dentro de uma instrução ou de uma legenda
 * acompanha o tamanho daquele contexto, como acompanhava com o `1.21em` do
 * KaTeX. O que muda é a razão passar a ser nossa e não da biblioteca.
 */
export const MATH_FONT_SIZE_EM =
  (MATH_INK_RATIO * CAP_HEIGHT_EM.body) / CAP_HEIGHT_EM.mathScreen;

/**
 * Tamanho da fórmula no PDF, em pt: a mesma razão de tinta, compensada pela
 * caixa alta da Courier. Se a família da fórmula um dia for a do resto do
 * documento, a compensação some sozinha e sobra só `MATH_INK_RATIO`.
 */
export const MATH_PDF_FONT_SIZE_PT =
  (BASE_FONT_PT * MATH_INK_RATIO * CAP_HEIGHT_EM.body) / CAP_HEIGHT_EM.mathPdf;

/**
 * Tinta do corpo do documento (título, parágrafo, enunciado e alternativas:
 * tudo o que não é o cinza secundário).
 *
 * Ponto único das TRÊS superfícies, ao lado de fonte, tamanho e espaçamento.
 * Antes a cor era o ÚNICO token de página fora daqui: as duas telas herdavam
 * `text-surface-ink` da moldura do `PageSheet` (`--sf-ink`, rgb(34,32,28)) e o
 * PDF não emitia `color` nenhum, caindo no preto puro do @react-pdf: três
 * superfícies, dois valores, e nenhum teste que reclamasse (achado 0324).
 *
 * Vence o valor das telas, que é o que o professor vê enquanto edita:
 * `--sf-ink: 40 10% 12%` (`src/index.css`) resolvido para hex. Continua bem
 * acima de AA sobre o papel branco (16,26:1).
 */
export const DEFAULT_INK = "#22201C";

/** Estilo base do <Page> do react-pdf (em pt). */
export function pageTokensToPdf(resolved: ResolvedPageStyle = DEFAULT_RESOLVED) {
  return {
    flexDirection: "column" as const,
    padding: PAGE_MARGIN_PT,
    fontSize: resolved.fontSize,
    lineHeight: BASE_LINE_HEIGHT,
    color: DEFAULT_INK,
    fontFamily: fontFamilyToPdf(resolved.fontFamily ?? DEFAULT_FONT_FAMILY_TOKEN),
  };
}

/**
 * Estilo base da folha da tela (em px). Expõe `--doc-block-spacing` e as vars por
 * elemento.
 *
 * As `--doc-fs-*` são emitidas SEMPRE, resolvidas por `resolveElementFontSizes`
 * (proporção do tamanho base, ou o override explícito do documento). Antes só
 * apareciam quando o documento trazia `elementFontSizes` — que nenhuma UI
 * escreve —, então a folha caía nos fallbacks do CSS enquanto o PDF usava
 * constantes absolutas, e as duas superfícies divergiam assim que o professor
 * mexia no tamanho do texto.
 */
export function pageTokensToCss(resolved: ResolvedPageStyle = DEFAULT_RESOLVED): CSSProperties {
  const efs = resolveElementFontSizes(resolved);
  return {
    padding: px(PAGE_MARGIN_PT),
    fontSize: px(resolved.fontSize),
    lineHeight: BASE_LINE_HEIGHT,
    color: DEFAULT_INK,
    fontFamily: fontFamilyToCss(resolved.fontFamily ?? DEFAULT_FONT_FAMILY_TOKEN),
    ["--doc-block-spacing"]: `${resolved.blockSpacing}px`,
    /* Cor do traço da divisória. O `<hr>` do editor não tem NodeView (o schema
       Tiptap só emite a tag), então a folha do Revisar lê o token por CSS, em
       `index.css`; a prévia do Exportar e o PDF leem `RULE_COLOR` direto. */
    ["--doc-rule-color"]: RULE_COLOR,
    ["--doc-fs-stem"]: px(efs.stem),
    ["--doc-fs-instruction"]: px(efs.instruction),
    ["--doc-fs-alternative"]: px(efs.alternative),
    ["--doc-fs-caption"]: px(efs.caption),
    /* Tamanho da fórmula (KaTeX). Como a divisória, o `.katex` não tem NodeView
       nosso — a folha de estilo da biblioteca é que o dimensiona —, então a
       folha publica o token aqui e `index.css` o aplica (achado 0424). */
    ["--doc-fs-math"]: `${MATH_FONT_SIZE_EM}em`,
  } as CSSProperties;
}
