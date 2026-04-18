export function sanitize(input: string, maxLength = 5000): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[<>"'&]/g, '')
    .slice(0, maxLength)
    .trim();
}
