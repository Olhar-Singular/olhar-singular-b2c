export function isHtmlContent(content: string): boolean {
  return /<(p|strong|em|u|s|ul|ol|li|br|mark|span|sub|sup)\b/i.test(content);
}

export function textToHtml(text: string): string {
  if (isHtmlContent(text)) return text;
  return text.split("\n").map((line) => `<p>${line || "<br>"}</p>`).join("");
}

export function htmlToText(html: string): string {
  if (!isHtmlContent(html)) return html;
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p><p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}
