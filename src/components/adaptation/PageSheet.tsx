/**
 * PageSheet — moldura visual da superfície "Revisar".
 *
 * A barra (`toolbar`) fica PRESA no topo (sticky) enquanto a página rola, com a
 * folha A4 branca centralizada sobre a "mesa". A mesa NÃO tem eixo de rolagem
 * próprio: quando tinha (`overflow-auto` + `max-h-[calc(100vh-280px)]`), a altura
 * chutada não batia com o chrome real do wizard e o passo Revisar exibia duas
 * barras verticais ao mesmo tempo. Rola só a página.
 * As cores da mesa/folha vêm dos tokens de superfície
 * (`--sf-*`, plano §4). A tipografia/margem da folha vêm de `pageTokensToCss`
 * (paridade com o PDF — não mexer aqui). É só apresentação — não conhece o documento.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  pageTokensToCss,
  PAGE_HEIGHT_PX,
  PAGE_MARGIN_PX,
  PAGE_CONTENT_HEIGHT_PX,
} from "./render/pageTokens";
import { resolvePageStyle } from "./render/pageStyle";
import type { PageStyle } from "@/lib/adaptation/canonical/schema";

interface PageSheetProps {
  /**
   * Barra fixa opcional no topo. A superfície "Revisar" não usa mais barra (a
   * inserção é o overlay "+" entre blocos, §6.4); quando ausente, a folha ocupa
   * todo o quadro.
   */
  toolbar?: ReactNode;
  /** Estilo do documento (fonte/tamanho/espaçamento) vindo da Aparência. */
  pageStyle?: PageStyle;
  /**
   * Liga o modo "impresso": a folha ganha a contagem de folhas acima dela.
   *
   * A GEOMETRIA da folha é a mesma nos dois modos: largura travada em A4 com
   * escala quando a mesa é menor (achados 0215 e 0234), altura em múltiplos
   * exatos de página com a régua da virada (achados 0329 e 0151).
   *
   * Só a prévia do Exportar pagina (achado 0118) — é a tela que promete mostrar
   * o arquivo. A folha do Revisar continua contínua de propósito: lá se edita
   * texto, e uma quebra rígida no meio da edição atrapalharia mais do que ajuda.
   */
  paginated?: boolean;
  children: ReactNode;
}

/**
 * Largura da folha A4 na tela, em px (o mesmo valor do `w-[794px]` abaixo —
 * Tailwind exige a classe literal, então o número vive nos dois lugares).
 */
const SHEET_WIDTH_PX = 794;

/**
 * Piso da escala da PRÉVIA (achado 0216). Abaixo disso a folha deixa de ser
 * conferível: em 390px de viewport a moldura mede ~332px, o fator caía para
 * 0,42 e o corpo de 12pt saía com ~6,7px efetivos. Em 0,75 o mesmo corpo fica
 * com 12px e a folha, quando não cabe, rola na horizontal dentro da mesa.
 * Ali ninguém digita: trocar tamanho de letra por rolagem é negócio justo.
 */
const MIN_SCALE = 0.75;

/**
 * Piso da escala da EDIÇÃO (achado 0235). Na superfície onde se digita, o
 * mesmo 0,75 desenhava a folha com 595,5px numa mesa de 332px e escondia 44%
 * de CADA LINHA atrás da rolagem horizontal: editava-se texto que não se via.
 * Aqui a troca se inverte — corpo menor em troca da linha inteira — e o piso
 * só existe para a folha não virar miniatura em molduras absurdamente
 * estreitas (0,4 cobre qualquer viewport de celular; 390px pede ~0,42).
 */
const EDIT_MIN_SCALE = 0.4;

export function PageSheet({ toolbar, pageStyle, paginated = false, children }: PageSheetProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(1);
  const [scale, setScale] = useState(1);
  /**
   * Largura da MESA (a moldura visível), medida junto com a escala. O chrome da
   * prévia se alinha por ela, não pela folha: com a escala no piso a folha fica
   * mais larga que a mesa (achado 0221).
   */
  const [frameWidth, setFrameWidth] = useState(SHEET_WIDTH_PX);
  const [sheetHeight, setSheetHeight] = useState(PAGE_HEIGHT_PX);
  /** Posição (px, geometria não escalada) de cada virada de página na folha. */
  const [pageRules, setPageRules] = useState<number[]>([]);

  /*
    Achado 0215: a folha NÃO reflowa. Largura travada em 794px (a do A4) e,
    quando a tela é mais estreita, a folha inteira encolhe por `transform:
    scale`. Antes a largura cedia (`max-w-full`) enquanto a altura ficava presa
    em 1123px, e saía um papel 3,38:1 — nem A4 nem coisa nenhuma. Escalando, a
    razão 1,41:1, a quebra de linha e a proporção de papel cheio continuam
    iguais às do arquivo em qualquer viewport.

    Achado 0234: isto vale nos DOIS modos. A escala tinha ficado só na prévia
    enquanto o piso de altura em múltiplos de A4 (0329/0151) valia nos dois, e
    as duas juntas reproduziam no Revisar o papel 332 x 1123 que o 0215 tinha
    acabado de eliminar — a folha que existe para ser a referência de página
    mostrava 64% dela cheia onde o PDF sai com 34%.

    Achado 0235: o que NÃO vale nos dois modos é o piso. Ele veio da prévia
    (0216) e entrou no Revisar de carona no 0234: numa mesa de 332px a folha
    era desenhada com 595,5px e 44% de cada linha ficava fora do recorte, na
    única tela em que se digita. O `scale` (e com ele a razão 1,41:1 e a quebra
    de linha do arquivo) fica; o piso é que passa a ser o de edição.
  */
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const fit = () => {
      // jsdom (e o primeiro layout) devolve 0: sem medida, vale a folha inteira
      // e nada encolhe. O piso impede que a folha vire miniatura ilegível, e é
      // diferente por superfície (achado 0235): a prévia prefere corpo legível
      // e empurra o resto para a rolagem horizontal; a edição prefere a linha
      // inteira na tela, porque ali se lê o que se está digitando.
      const available = frame.clientWidth || SHEET_WIDTH_PX;
      const floor = paginated ? MIN_SCALE : EDIT_MIN_SCALE;
      setScale(Math.min(1, Math.max(floor, available / SHEET_WIDTH_PX)));
      setFrameWidth(available);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [paginated]);

  /*
    Medição pós-layout em vez de altura declarada: a quantidade de folhas depende
    do que o conteúdo ocupa depois de renderizado (fonte, imagens, quebras), e é
    exatamente esse número que o professor não tinha antes de baixar. `children`
    entra nas dependências para remedir quando o conteúdo muda (ligar a quebra por
    questão, por exemplo); `setState` com o mesmo valor não re-renderiza, sem laço.
  */
  useLayoutEffect(() => {
    const content = contentRef.current;
    /*
      Achado 0151: a medição vale nos DOIS modos. O 0329 tinha dado ao Revisar
      só um piso fixo de uma folha, então passando de uma página o papel crescia
      num valor qualquer (1,21 folha nos pixels do achado) e não havia nenhuma
      marca de onde a página 1 termina. Medindo aqui também no modo contínuo, a
      folha do Revisar cresce em múltiplos exatos de A4 e ganha a mesma régua.
      O que continua exclusivo da prévia é o `scale` (que fora do modo paginado
      vale 1) e o contador de folhas.
    */
    const sheet = sheetRef.current;
    const measure = () => {
      /*
        Achado 0123: a altura medida é a do CONTEÚDO, nunca a da folha. A folha
        passou a crescer até o fim da última página (abaixo), então medi-la aqui
        realimentaria a própria medição a cada layout: mais altura, mais páginas,
        mais altura.
      */
      const height = content.offsetHeight;
      /*
        Achado 0121: a quebra por questão, na prévia, é uma régua decorativa de
        ~30px (`PageBreakMark`), não uma quebra de fluxo. Medir a folha inteira
        dizia "1 página A4" enquanto o PDF (onde a quebra é real) saía com N+1.
        Então a contagem soma folha a folha CADA TRECHO entre as réguas: cada
        trecho começa numa página nova, exatamente como no `<View break>` do PDF.

        Achado 0123: o MESMO percurso decide onde desenhar a virada. Antes o
        desenho era um gradiente cego, sem relação com a contagem: a prévia
        anunciava "2 páginas A4" e mostrava uma folha só, sem nenhuma linha. Agora
        sai uma régua por virada e a folha vai até o fim da última página,
        deixando visível o branco que sobra.
      */
      // `offsetHeight` é medida de layout: ignora o `scale` e já vem na geometria
      // do A4. `getBoundingClientRect`, abaixo, vem escalada — daí a divisão.
      const sheetTop = sheet.getBoundingClientRect().top;
      const cuts = Array.from(sheet.querySelectorAll(".adaptar-page-break")).map(
        (mark) => (mark.getBoundingClientRect().top - sheetTop) / scale,
      );
      const ends = [...cuts, height];
      let start = 0;
      let total = 0;
      ends.forEach((end) => {
        // O comprimento do trecho é medido no CONTEÚDO (do corte até o próximo),
        // porque é isso que o leitor vê na tela; só a origem dele é que passa a
        // ser o fim da página anterior.
        /*
          Achado 0153: o divisor é a área ÚTIL da página (`PAGE_CONTENT_HEIGHT_PX`),
          não a A4 inteira. O que se mede aqui é a altura do CONTEÚDO, e o conteúdo
          vive DENTRO das margens que `pageTokensToCss` (e o `<Page>` do react-pdf)
          aplicam: dividir por 1123px contava os 107px de margem como texto, uma vez
          por folha. A folha do Revisar voltava a terminar no meio de uma página sem
          régua (o 0151 reaberto) e o contador anunciava menos folhas que o arquivo.
          Achado 0157: a área útil passou a ser TAMBÉM o passo das réguas e da
          altura do papel (abaixo), porque o fluxo contínuo desta folha só gasta
          margem uma vez — contar por uma régua e desenhar por outra era o que
          fabricava a folha em branco no fim.
        */
        total += Math.max(1, Math.ceil((end - start) / PAGE_CONTENT_HEIGHT_PX));
        start = end;
      });
      /*
        Achado 0131: a folha é N páginas INTEIRAS, e as viradas caem no fim de
        cada uma. Antes o papel era medido a partir do corte (`corte + folhas *
        1123px`), então a prévia anunciava "2 páginas A4" e desenhava 1,71 folha:
        sumia justamente o pé em branco da página 1 que o PDF tem, e o professor
        lia "2 páginas" sem ver nenhuma página 2. Cada trecho entre quebras começa
        numa página nova (como o `<View break>` do PDF), logo toda origem de trecho
        cai numa virada e toda virada também.

        Achado 0157: mas o fim de cada página, MEDIDO NO FLUXO desta folha, não
        é o múltiplo de `PAGE_HEIGHT_PX`. A contagem acima é paginada (cada folha
        recebe só a área útil, porque o `<Page>` do react-pdf reserva
        `PAGE_MARGIN_PT` em cima e embaixo de CADA página); o desenho aqui é um
        fluxo contínuo, e `pageTokensToCss` aplica esse padding UMA VEZ SÓ, no
        topo e no pé da folha inteira. Multiplicar por 1123px somava ao papel
        106,66px de margem por virada que o fluxo não gasta, e o erro é
        cumulativo: com 1058px de conteúdo saíam 2246px de papel com a régua em
        1123px e a segunda A4 inteiramente EM BRANCO, para um documento que o
        arquivo emite com uma página. As duas contas passam a ser a mesma: o
        papel são as duas margens do fluxo mais N áreas úteis, e a virada N cai
        onde a área imprimível da página N acaba.

        O conteúdo pós-quebra continua encostado na régua do `PageBreakMark` (que é
        chrome de ~30px, não quebra de fluxo): empurrá-lo até o topo da folha
        seguinte exigiria unificar editor/prévia/PDF numa única paginação, fora do
        escopo desta correção.
      */
      setPageCount(total);
      setSheetHeight(2 * PAGE_MARGIN_PX + total * PAGE_CONTENT_HEIGHT_PX);
      setPageRules(
        Array.from(
          { length: total - 1 },
          (_, page) => PAGE_MARGIN_PX + (page + 1) * PAGE_CONTENT_HEIGHT_PX,
        ),
      );
    };
    measure();
    /*
      Achado 0158: as dependencias do efeito (`children` e companhia) so disparam
      quando o REACT re-renderiza. O conteudo, porem, cresce depois do layout por
      caminhos que nao passam por render nenhum: a `<img>` do bloco de imagem, que
      so ganha altura quando o arquivo carrega; o KaTeX, que remede quando a fonte
      chega; o Tiptap, que escreve no DOM por transacao do editor. A medicao ficava
      congelada no que existia antes disso: a folha mantinha o piso de uma A4 e o
      conteudo era desenhado fora do papel, sem regua e sem contagem, e a mesma
      tela dava geometrias diferentes conforme se chegava nela por carga direta ou
      pelo `Voltar` do passo Exportar. Observar o proprio conteudo (irmao do
      observador que ja mede a mesa) faz a geometria ser funcao do que esta
      renderizado, e nao de quantas vezes o React passou por ali.

      Sem laco: o que a medicao altera e a altura da FOLHA (piso e reguas), nunca
      a do envelope observado.
    */
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
    // `scale` entra nas dependências porque o efeito lê rects já escalados: sem
    // ele a contagem ficaria presa na escala do render anterior.
  }, [paginated, children, scale]);

  /*
    Régua da virada de página: uma linha no fim da área imprimível de cada folha
    (achado 0131 — todo trecho entre quebras começa numa página nova; achado
    0157 — no fluxo contínuo desta folha o fim da página N é
    `PAGE_MARGIN_PX + N x PAGE_CONTENT_HEIGHT_PX`, não o múltiplo de A4).
    Recortar o fluxo em folhas de verdade (empurrando o conteúdo pós-quebra para
    o topo da folha seguinte) exigiria unificar editor/prévia/PDF numa única
    paginação, fora do escopo desta correção.
  */
  const ruleColor = "hsl(var(--sf-line-2))";
  const pageRulesBackground = pageRules.length
    ? `linear-gradient(to bottom, ${pageRules
        .map(
          (y) =>
            `transparent ${y - 1}px, ${ruleColor} ${y - 1}px, ${ruleColor} ${y}px, transparent ${y}px`,
        )
        .join(", ")})`
    : "none";

  /*
    Achado 0222: a folha passa da mesa quando a escala trava no piso, e o que
    sobra só é alcançável rolando. Saber disso aqui (e não só no CSS) é o que
    permite dar rota de teclado e pista visual apenas quando fazem falta: uma
    parada de tabulação numa moldura que não rola seria ruído.
  */
  const overflows = SHEET_WIDTH_PX * scale > frameWidth + 0.5;
  /*
    Achado 0234: a parada de tabulação (0222) continua exclusiva da prévia. Lá
    dentro não há nada focável, então sem ela metade da folha só existiria para
    quem descobre o gesto; no Revisar a folha é editável — o caret já leva a
    rolagem, e um tab stop a mais seria só ruído.
  */
  const needsKeyboardScroll = overflows && paginated;

  const sheet = (
    <div
      ref={sheetRef}
      data-testid="page-sheet"
      /* [color-scheme:light] — a folha é papel e continua clara sob qualquer
         tema do app. Os controles nativos (o radio de "alternativa correta",
         checkboxes) são pintados pelo NAVEGADOR a partir de color-scheme, não
         das classes do Tailwind, e no tema escuro saíam como círculos escuros
         sobre papel branco. Fixar aqui cobre todo controle nativo da folha,
         inclusive os que ainda não existem. */
      className="w-[794px] origin-top-left bg-surface-paper text-surface-ink rounded-[3px] [color-scheme:light] [accent-color:hsl(var(--sf-accent))]"
      style={{
        ...pageTokensToCss(resolvePageStyle(pageStyle)),
        boxShadow: "var(--sf-paper-shadow)",
        /*
          Altura em múltiplos INTEIROS de A4 nos dois modos (achados 0329 e
          0151): com pouco texto o papel do Revisar encolhia a 0,65 de página e
          deixava de ter forma de folha; passando de uma página crescia num
          valor qualquer (1,21 folha), sem nenhuma marca de virada. `minHeight`
          é piso, não trava: o fluxo de edição continua contínuo (a régua é
          decorativa) e a folha nunca termina no meio de uma página.
        */
        minHeight: `${sheetHeight}px`,
        backgroundImage: pageRulesBackground,
        transform: `scale(${scale})`,
      }}
    >
      {/*
        Envelope do conteúdo: dá a altura NATURAL do documento, que a folha (já
        esticada até o fim da última página) não dá mais (achado 0123).
      */}
      <div ref={contentRef}>{children}</div>
    </div>
  );

  return (
    // `overflow-clip` (e não `overflow-hidden`) porque hidden cria um contexto de
    // rolagem e prenderia a barra sticky a esta moldura em vez do viewport.
    <div className="flex flex-col rounded-md border border-input overflow-clip">
      {toolbar && <div className="sticky top-0 z-10 shrink-0 bg-background">{toolbar}</div>}
      <div
        data-testid="page-mesa"
        className="flex-1 p-3 sm:p-6 lg:p-10"
        style={{ background: "var(--sf-mesa-gradient)" }}
      >
        {paginated && (
          <p
            data-testid="page-count"
            className="mx-auto mb-2 text-xs text-muted-foreground text-right"
            /*
              Achado 0221: a largura acompanha a folha ATÉ o limite da mesa.
              Com a escala no piso a folha passa da moldura, e copiar sua
              largura empurrava o texto (alinhado à direita) para fora do
              `overflow-clip` da mesa — irrecuperável, porque o contador fica
              fora do quadro rolável.
            */
            style={{ width: `${Math.min(SHEET_WIDTH_PX * scale, frameWidth)}px` }}
          >
            {pageCount === 1 ? "1 página A4" : `${pageCount} páginas A4`}
          </p>
        )}
        {/*
          A moldura mede a largura disponível; o "vão" interno reserva o
          tamanho JÁ escalado da folha (que, por estar em `transform`, não
          ocupa espaço no fluxo) e a centraliza.

          Achado 0216: a centralização é `mx-auto` de bloco, não
          `flex justify-center`. Com a escala pisada o vão pode ficar MAIOR
          que a moldura, e o flex centralizado empurraria a borda esquerda
          da folha para fora do alcance da rolagem; a margem automática
          colapsa para zero nesse caso e a folha rola inteira.
        */}
        <div className="relative">
          <div
            ref={frameRef}
            className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            /*
              Achado 0222: sem nenhum focável dentro (a prévia é render de
              leitura), o Chrome só dá rolagem por seta a um container que
              seja ele mesmo focável. Sem isto o Tab pulava da folha direto
              para os botões do rodapé e o texto escondido ficava
              inalcançável por teclado (WCAG 2.1.1).
            */
            tabIndex={needsKeyboardScroll ? 0 : undefined}
            role={needsKeyboardScroll ? "region" : undefined}
            aria-label={needsKeyboardScroll ? "Prévia da folha A4" : undefined}
          >
            <div
              className="mx-auto"
              style={{
                width: `${SHEET_WIDTH_PX * scale}px`,
                height: `${sheetHeight * scale}px`,
              }}
            >
              {sheet}
            </div>
          </div>
          {/*
            Máscara na borda direita: no touch a barra de rolagem é
            sobreposta e só aparece durante o gesto, então a folha terminava
            cortada na borda sem nenhuma pista de que continua.
          */}
          {overflows && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-black/15 to-transparent"
            />
          )}
        </div>
        {overflows && (
          <p
            data-testid="page-overflow-hint"
            className="mt-2 text-xs text-muted-foreground"
          >
            A folha é mais larga que a tela: role na horizontal para ver o resto.
          </p>
        )}
      </div>
    </div>
  );
}

export default PageSheet;
