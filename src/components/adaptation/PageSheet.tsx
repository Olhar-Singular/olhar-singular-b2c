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
import { pageTokensToCss, PAGE_HEIGHT_PX } from "./render/pageTokens";
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
   * Liga o modo "impresso": a folha ganha a ALTURA da página A4, uma régua
   * tracejada a cada página e a contagem de folhas acima dela.
   *
   * Só a prévia do Exportar usa (achado 0118) — é a tela que promete mostrar o
   * arquivo. A folha do Revisar continua contínua de propósito: lá se edita
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
 * Piso da escala da prévia (achado 0216). Abaixo disso a folha deixa de ser
 * conferível: em 390px de viewport a moldura mede ~332px, o fator caía para
 * 0,42 e o corpo de 12pt saía com ~6,7px efetivos. Em 0,75 o mesmo corpo fica
 * com 12px e a folha, quando não cabe, rola na horizontal dentro da mesa.
 */
const MIN_SCALE = 0.75;

export function PageSheet({ toolbar, pageStyle, paginated = false, children }: PageSheetProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(1);
  const [scale, setScale] = useState(1);
  const [sheetHeight, setSheetHeight] = useState(PAGE_HEIGHT_PX);
  /** Posição (px, geometria não escalada) de cada virada de página na folha. */
  const [pageRules, setPageRules] = useState<number[]>([]);

  /*
    Achado 0215: no modo paginado a folha NÃO reflowa. Largura travada em 794px
    (a do A4) e, quando a tela é mais estreita, a folha inteira encolhe por
    `transform: scale`. Antes a largura cedia (`max-w-full`) enquanto a altura
    ficava presa em 1123px, e a prévia mostrava um papel 3,38:1 — nem A4 nem
    coisa nenhuma. Escalando, a razão 1,41:1, a quebra de linha e a contagem de
    folhas continuam iguais às do arquivo em qualquer viewport.
  */
  useLayoutEffect(() => {
    if (!paginated) return;
    const frame = frameRef.current;
    const fit = () => {
      const available = frame.clientWidth;
      // jsdom (e o primeiro layout) devolve 0: sem medida, não encolhe nada.
      // O piso (achado 0216) impede que a folha vire miniatura ilegível; quem
      // absorve o que não coube é a rolagem horizontal da moldura.
      setScale(
        available > 0
          ? Math.min(1, Math.max(MIN_SCALE, available / SHEET_WIDTH_PX))
          : 1,
      );
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
    if (!paginated) return;
    const sheet = sheetRef.current;
    /*
      Achado 0123: a altura medida é a do CONTEÚDO, nunca a da folha. A folha
      passou a crescer até o fim da última página (abaixo), então medi-la aqui
      realimentaria a própria medição a cada layout: mais altura, mais páginas,
      mais altura.
    */
    const height = contentRef.current.offsetHeight;
    /*
      Achado 0121: a quebra por questão, na prévia, é uma régua decorativa de
      ~30px (`PageBreakMark`), não uma quebra de fluxo. Medir a folha inteira
      dizia "1 página A4" enquanto o PDF (onde a quebra é real) saía com N+1.
      Então a contagem soma folha a folha CADA TRECHO entre as réguas: cada
      trecho começa numa página nova, exatamente como no `<View break>` do PDF.

      Achado 0123: o MESMO percurso decide onde desenhar a virada. Antes o
      desenho era um gradiente cego nos múltiplos de 1123px, então a régua nunca
      caía na quebra que a contagem usou: a prévia anunciava "2 páginas A4" e
      mostrava uma folha só, sem nenhuma linha. Agora sai uma régua por virada
      (as internas do trecho e a da própria quebra) e a folha vai até o fim da
      última página, deixando visível o branco que sobra.
    */
    // `offsetHeight` é medida de layout: ignora o `scale` e já vem na geometria
    // do A4. `getBoundingClientRect`, abaixo, vem escalada — daí a divisão.
    const sheetTop = sheet.getBoundingClientRect().top;
    const cuts = Array.from(sheet.querySelectorAll(".adaptar-page-break")).map(
      (mark) => (mark.getBoundingClientRect().top - sheetTop) / scale,
    );
    const ends = [...cuts, height];
    const rules: number[] = [];
    let start = 0;
    let total = 0;
    let paperHeight = PAGE_HEIGHT_PX;
    ends.forEach((end, index) => {
      const sheets = Math.max(1, Math.ceil((end - start) / PAGE_HEIGHT_PX));
      for (let page = 1; page < sheets; page += 1) {
        rules.push(start + page * PAGE_HEIGHT_PX);
      }
      total += sheets;
      // A última folha do trecho sempre vale uma página inteira: é ela que
      // mostra quanto papel sobra.
      paperHeight = start + sheets * PAGE_HEIGHT_PX;
      // Toda quebra (tudo menos o fim do conteúdo) é uma virada desenhada.
      if (index < ends.length - 1) rules.push(end);
      start = end;
    });
    setPageCount(total);
    setSheetHeight(paperHeight);
    setPageRules(rules);
    // `scale` entra nas dependências porque o efeito lê rects já escalados: sem
    // ele a contagem ficaria presa na escala do render anterior.
  }, [paginated, children, scale]);

  /*
    Régua da virada de página: uma linha em CADA posição calculada acima (a
    virada por quebra de questão inclusive). Recortar o fluxo em folhas de
    verdade (empurrando o conteúdo pós-quebra para o topo da folha seguinte)
    exigiria unificar editor/prévia/PDF numa única paginação, fora do escopo
    desta correção.
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

  const sheet = (
    <div
      ref={sheetRef}
      data-testid="page-sheet"
      className={
        paginated
          ? "w-[794px] origin-top-left bg-surface-paper text-surface-ink rounded-[3px]"
          : "mx-auto w-[794px] max-w-full bg-surface-paper text-surface-ink rounded-[3px]"
      }
      style={{
        ...pageTokensToCss(resolvePageStyle(pageStyle)),
        boxShadow: "var(--sf-paper-shadow)",
        ...(paginated
          ? {
              minHeight: `${sheetHeight}px`,
              transform: `scale(${scale})`,
              backgroundImage: pageRulesBackground,
            }
          : {}),
      }}
    >
      {/*
        Envelope do conteúdo: dá a altura NATURAL do documento, que a folha (já
        esticada até o fim da última página) não dá mais (achado 0123).
      */}
      {paginated ? <div ref={contentRef}>{children}</div> : children}
    </div>
  );

  return (
    // `overflow-clip` (e não `overflow-hidden`) porque hidden cria um contexto de
    // rolagem e prenderia a barra sticky a esta moldura em vez do viewport.
    <div className="flex flex-col rounded-md border border-input overflow-clip">
      {toolbar && <div className="sticky top-0 z-10 shrink-0 bg-background">{toolbar}</div>}
      <div
        className="flex-1 p-3 sm:p-6 lg:p-10"
        style={{ background: "var(--sf-mesa-gradient)" }}
      >
        {paginated ? (
          <>
            <p
              data-testid="page-count"
              className="mx-auto mb-2 text-xs text-muted-foreground text-right"
              style={{ width: `${SHEET_WIDTH_PX * scale}px` }}
            >
              {pageCount === 1 ? "1 página A4" : `${pageCount} páginas A4`}
            </p>
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
            <div ref={frameRef} className="overflow-x-auto">
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
          </>
        ) : (
          sheet
        )}
      </div>
    </div>
  );
}

export default PageSheet;
