import {
  scanAndRegisterUrls,
  expandImageRegistry,
  type ImageRegistry,
} from "@/components/editor/imageManagerUtils";

declare const __rawDsl: unique symbol;
declare const __canonicalDsl: unique symbol;

export type RawDsl = string & { readonly [__rawDsl]: true };
export type CanonicalDsl = string & { readonly [__canonicalDsl]: true };

export function asRawDsl(text: string): RawDsl {
  return text as RawDsl;
}

export function toCanonicalDsl(
  raw: RawDsl | string,
  registry: ImageRegistry = {},
): { dsl: CanonicalDsl; registry: ImageRegistry } {
  const scanned = scanAndRegisterUrls(String(raw), registry);
  if (!scanned) {
    return { dsl: String(raw) as CanonicalDsl, registry };
  }
  return {
    dsl: scanned.cleanText as CanonicalDsl,
    registry: scanned.updatedRegistry,
  };
}

export function toRawDsl(
  canonical: CanonicalDsl | string,
  registry: ImageRegistry,
): RawDsl {
  return expandImageRegistry(String(canonical), registry) as RawDsl;
}
