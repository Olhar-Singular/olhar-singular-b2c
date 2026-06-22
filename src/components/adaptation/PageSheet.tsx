/**
 * PageSheet — moldura visual da superfície "Revisar".
 *
 * A barra (`toolbar`) fica PRESA no topo; só a "mesa" rola, com a folha A4
 * branca centralizada. As cores da mesa/folha vêm dos tokens de superfície
 * (`--sf-*`, plano §4). A tipografia/margem da folha vêm de `pageTokensToCss`
 * (paridade com o PDF — não mexer aqui). É só apresentação — não conhece o documento.
 */
import type { ReactNode } from "react";
import { pageTokensToCss } from "./render/pageTokens";
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
  children: ReactNode;
}

export function PageSheet({ toolbar, pageStyle, children }: PageSheetProps) {
  return (
    <div className="flex flex-col rounded-md border border-input overflow-hidden">
      {toolbar && <div className="shrink-0 bg-background">{toolbar}</div>}
      <div
        className="flex-1 overflow-auto p-3 sm:p-6 lg:p-10 max-h-[calc(100vh-280px)]"
        style={{ background: "var(--sf-mesa-gradient)" }}
      >
        <div
          data-testid="page-sheet"
          className="mx-auto w-[794px] max-w-full bg-surface-paper text-surface-ink rounded-[3px]"
          style={{ ...pageTokensToCss(resolvePageStyle(pageStyle)), boxShadow: "var(--sf-paper-shadow)" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export default PageSheet;
