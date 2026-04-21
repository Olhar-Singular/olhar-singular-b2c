export type ImageAlign = "left" | "center" | "right";

export type ImageItem = {
  id: string;
  src: string;
  align: ImageAlign;
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
    return `[img:${url}${params ?? ""}]`;
  });
}
