import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  content: string;
};

/**
 * Renders an assistant chat message written in Markdown (headings, bold, lists,
 * links, code) returned by the ISA/Gemini backend. Styling comes from the
 * `prose` classes (@tailwindcss/typography); the `prose-*:text-foreground`
 * modifiers make text inherit the chat bubble color, and `max-w-none` lets it
 * fill the bubble. react-markdown is safe by default — it does not render raw
 * HTML, so there is no XSS surface.
 */
export default function ChatMarkdown({ content }: Props) {
  return (
    <div
      className="prose prose-sm max-w-none break-words leading-relaxed prose-headings:text-foreground prose-headings:font-semibold prose-p:text-foreground prose-strong:text-foreground prose-li:text-foreground prose-a:text-primary prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 dark:prose-invert"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
