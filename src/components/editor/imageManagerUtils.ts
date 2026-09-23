import { PAGE_MARGIN_PT } from "@/components/adaptation/render/pageTokens";

export type ImageAlign = "left" | "center" | "right";

export type ImageItem = {
  id: string;
  src: string;
  align: ImageAlign;
  /**
   * `true` só depois de o usuário clicar num alinhamento na modal. Sem essa
   * marca, o padrão `center` de um item recém-adicionado é indistinguível de
   * uma escolha e apaga o alinhamento já definido na folha (achado 0317).
   */
  alignTouched?: boolean;
};

export type ImageRegistry = Record<string, string>;

export function nextImageName(registry: ImageRegistry): string {
  let n = 1;
  while (registry[`imagem-${n}`]) n++;
  return `imagem-${n}`;
}

export function registerAndGenerateDsl(
  images: ImageItem[],
  registry: ImageRegistry
): { dsl: string; updatedRegistry: ImageRegistry } {
  const updated = { ...registry };
  const lines: string[] = [];

  for (const img of images) {
    const name = nextImageName(updated);
    updated[name] = img.src;
    const parts = [`[img:${name}`];
    if (img.align !== "left") parts.push(`align=${img.align}`);
    parts[parts.length - 1] += "]";
    lines.push(parts.join(" "));
  }

  return { dsl: lines.join("\n"), updatedRegistry: updated };
}

export function resolveImageSrc(
  ref: string,
  registry: ImageRegistry
): string {
  return Object.prototype.hasOwnProperty.call(registry, ref) ? registry[ref] : ref;
}

export function scanAndRegisterUrls(
  text: string,
  registry: ImageRegistry
): { cleanText: string; updatedRegistry: ImageRegistry } | null {
  const pattern = /\[img:((?:https?:\/\/|data:)[^\s\]]+)((?:\s[^\]]*)?)\]/g;
  if (!pattern.test(text)) return null;

  pattern.lastIndex = 0;
  const updated = { ...registry };
  let cleanText = text;
  let match: RegExpExecArray | null;

  const matches: { full: string; url: string; params: string }[] = [];
  while ((match = pattern.exec(text)) !== null) {
    matches.push({ full: match[0], url: match[1], params: match[2] || "" });
  }

  for (const m of matches) {
    const existingName = Object.entries(updated).find(([, src]) => src === m.url)?.[0];
    const name = existingName || nextImageName(updated);
    if (!existingName) updated[name] = m.url;
    cleanText = cleanText.replace(m.full, () => `[img:${name}${m.params}]`);
  }

  return { cleanText, updatedRegistry: updated };
}

export function expandImageRegistry(
  text: string,
  registry: ImageRegistry,
): string {
  const pattern = /\[img:([^\s\]]+)((?:\s[^\]]*)?)\]/g;
  return text.replace(pattern, (full, name: string, params: string) => {
    if (/^(https?:\/\/|data:)/i.test(name)) return full;
    if (!Object.prototype.hasOwnProperty.call(registry, name)) return full;
    const url = registry[name];
    if (!url) return full;
    /* v8 ignore next -- regex capture group is always a string (""), never
     * null/undefined, so the ?? "" fallback is structurally unreachable. */
    return `[img:${url}${params ?? ""}]`;
  });
}

/** Formats that can carry an alpha channel: re-encoding them as JPEG would
 * composite the transparent pixels over black (per the HTML spec). */
const ALPHA_CAPABLE_MIME = new Set([
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/svg+xml",
]);

export const JPEG_QUALITY = 0.85;

export function chooseImageEncoding(fileType: string): {
  mime: string;
  quality: number | undefined;
} {
  return ALPHA_CAPABLE_MIME.has(fileType.toLowerCase())
    ? { mime: "image/png", quality: undefined }
    : { mime: "image/jpeg", quality: JPEG_QUALITY };
}

/** Largura da página A4 em pontos (o `size="A4"` do react-pdf é 595,28 x 842pt). */
const A4_WIDTH_PT = 595.28;
/** Resolução alvo de impressão, em pixels por polegada. */
const PRINT_PPI = 300;

/**
 * Teto de pixels de uma imagem enviada pela modal, dimensionado pela FOLHA e
 * não por um número solto: a coluna de texto impressa mede
 * `595,28 - 2 x PAGE_MARGIN_PT` = 515,28pt = 7,157in, e uma figura que ocupe
 * essa largura inteira só chega aos 300 ppi de padrão de impressão com ~2148px
 * de origem. O teto anterior (800px) imprimia a ~112 ppi e borrava todo texto
 * pequeno dentro da figura — mapa, rótulo de eixo, numeração (achado 0320).
 *
 * A redução é destrutiva: só a data URI já reduzida vai para o `src` do nó, o
 * arquivo original não fica em lugar nenhum. Por isso o teto é o do pior caso
 * de layout (imagem ocupando a coluna inteira), não o do caso médio.
 */
export const MAX_IMAGE_DIMENSION_PX = Math.ceil(
  ((A4_WIDTH_PT - 2 * PAGE_MARGIN_PT) / 72) * PRINT_PPI
);

/**
 * Encolhe a imagem só no que ultrapassa `MAX_IMAGE_DIMENSION_PX`, preservando
 * a proporção. Dentro do teto, devolve as dimensões originais intactas.
 */
export function fitToPrintResolution(
  width: number,
  height: number
): { width: number; height: number } {
  if (width <= MAX_IMAGE_DIMENSION_PX && height <= MAX_IMAGE_DIMENSION_PX) {
    return { width, height };
  }
  const ratio = Math.min(MAX_IMAGE_DIMENSION_PX / width, MAX_IMAGE_DIMENSION_PX / height);
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}
