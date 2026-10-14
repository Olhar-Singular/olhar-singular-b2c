// APP_URL as the e-mails and MP back_url need it: no trailing slash (a value
// ending in "/" would produce "https://host//creditos"), no stray whitespace,
// and the local dev URL when the variable is missing.

export const DEFAULT_APP_URL = "http://localhost:8080";

export function normalizeAppUrl(value: string | undefined): string {
  const trimmed = (value ?? "").trim().replace(/\/+$/, "");
  return trimmed || DEFAULT_APP_URL;
}
