/**
 * Normalização Unicode NFC do que vai para o PDF (B1, lote 4b).
 *
 * Texto colado do macOS/iOS chega com o acento DECOMPOSTO (`e` + U+0301). As fontes do
 * arquivo têm o `é` composto e não têm a marca combinante (U+0300-036F), então o par
 * saía como `e` e um sinal solto: texto errado no papel e no texto extraído. Compor
 * antes do layout resolve sem aviso nenhum: o que a professora vê é o `é`.
 *
 * Puro; devolve a MESMA referência quando nada muda.
 */
export function normalizeNfc<T>(value: T): T {
  if (typeof value === "string") return value.normalize("NFC") as T;
  if (Array.isArray(value)) {
    const mapped = value.map(normalizeNfc);
    return mapped.some((item, i) => item !== value[i]) ? (mapped as T) : value;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const mapped = entries.map(([key, item]) => [key, normalizeNfc(item)] as const);
    return mapped.some(([, item], i) => item !== entries[i][1])
      ? (Object.fromEntries(mapped) as T)
      : value;
  }
  return value;
}
