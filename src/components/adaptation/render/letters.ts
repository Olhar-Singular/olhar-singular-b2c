/**
 * Pure label helpers for the canonical renderer.
 */

/**
 * Convert a zero-based index to a lowercase alphabetic label, bijective
 * base-26 (a, b, …, z, aa, ab, …). Used for multiple-choice alternative
 * labels.
 */
export function indexToLetter(index: number): string {
  let n = index;
  let label = "";
  do {
    label = String.fromCharCode(97 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}
