/** Pure array helpers for the scaffolding step list (unit-tested at 100%). */

export function setStep(items: string[], index: number, value: string): string[] {
  if (index < 0 || index >= items.length) return items;
  return items.map((item, i) => (i === index ? value : item));
}

export function addStep(items: string[]): string[] {
  return [...items, ""];
}

export function removeStep(items: string[], index: number): string[] {
  if (index < 0 || index >= items.length) return items;
  return items.filter((_, i) => i !== index);
}
