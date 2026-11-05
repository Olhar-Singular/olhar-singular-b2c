import { AlertTriangle } from "lucide-react";

type Props = {
  /** Also the accessible name of the region. */
  title: string;
  lines: string[];
  /** What to do about it, one sentence. */
  hint: string;
  className?: string;
};

const MAX_LINES = 8;

/**
 * Aviso (não bloqueia nada) sobre a leitura da prova: onde o arquivo não deixou ler e
 * onde a leitura pode ter inventado um valor (C-03). Vive no passo do arquivo, antes de
 * qualquer cobrança, e de novo no Revisar, com as questões que a leitura por IA apontou.
 */
export function ExamIssuesNotice({ title, lines, hint, className = "" }: Props) {
  if (lines.length === 0) return null;
  const shown = lines.slice(0, MAX_LINES);
  const rest = lines.length - shown.length;
  return (
    <section
      role="status"
      aria-label={title}
      className={`rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-50 ${className}`}
    >
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
        {title}
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-6">
        {shown.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
        {rest > 0 && <li>e mais {rest}.</li>}
      </ul>
      <p className="mt-2">{hint}</p>
    </section>
  );
}
