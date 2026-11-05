/**
 * createPdfFontStore — um `FontStore` do @react-pdf já com as famílias do
 * projeto registradas, para os testes que rodam o LAYOUT REAL.
 *
 * Esses testes (`footerPlacement`, `imageOverflow`, `answerColumnWidth`, as
 * tabelas…) chamam `layoutDocument(container, new FontStore())`: uma instância
 * nova, que não enxerga o que `registerPdfFonts()` registrou no store global do
 * `@react-pdf/renderer`. Enquanto o documento imprimia nos built-ins Type 1
 * (Helvetica/Times) isso não aparecia — built-in vem pré-registrado em todo
 * store. Desde que o PDF passou a EMBUTIR as clássicas (achado 0445), o store
 * cru levanta "Font family not registered: Liberation Sans".
 *
 * Mora em `src/test/` por ser infra de teste (e por ficar fora do gate de
 * cobertura). A lista de famílias não é duplicada aqui: vem de
 * `PDF_FONT_REGISTRATIONS`, a mesma que a app registra. Só os `src` mudam — no
 * browser são URLs servidas de `public/`, e no Node o fontkit abre um caminho
 * de arquivo.
 */
import FontStore from "@react-pdf/font";
import { join } from "node:path";
import {
  PDF_FONT_REGISTRATIONS,
  hyphenateWord,
  shareAliasedFaces,
} from "@/components/adaptation/render/pdf/registerFonts";

/** `/fonts/X.ttf` (URL servida por `public/`) → caminho absoluto no disco. */
function toFilePath(src: string): string {
  return join(process.cwd(), "public", src.replace(/^\//, ""));
}

/**
 * O tipo publicado do `FontStore` é o da instância; o default export é a
 * classe. Este alias evita repetir o cast em cada teste.
 */
type FontStoreInstance = ReturnType<typeof makeStore>;
const makeStore = () => new (FontStore as unknown as { new (): unknown })();

export function createPdfFontStore(): FontStoreInstance {
  const store = makeStore() as {
    register: (r: { family: string; fonts: { src: string }[] }) => void;
    registerHyphenationCallback: (cb: (word: string | null) => string[]) => void;
    getRegisteredFonts: () => Parameters<typeof shareAliasedFaces>[0];
  };
  store.registerHyphenationCallback(hyphenateWord);
  for (const { family, fonts } of PDF_FONT_REGISTRATIONS) {
    store.register({ family, fonts: fonts.map((f) => ({ ...f, src: toFilePath(f.src) })) });
  }
  shareAliasedFaces(store.getRegisteredFonts());
  return store as FontStoreInstance;
}
