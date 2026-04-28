export function normalizeAIText(text: string): string {
  return (
    text
      .replace(/\u200B|\u200C|\u200D|\uFEFF/g, "")
      .replace(/\x0C/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
  );
}
