import { useMemo, useRef, useEffect } from "react";
import { parseActivity } from "@/lib/activityParser";
import type {
  ParsedQuestion,
  ParsedSection,
  SectionItem,
  QuestionType,
} from "@/lib/activityParser";
import { formatInline, renderKatexBlock } from "@/lib/activityFormatter";
import { FileText, Info, ImageIcon, Check } from "lucide-react";
import ImageResizer from "./ImageResizer";
import { resolveImageSrc } from "./imageManagerUtils";
import type { ImageRegistry } from "./imageManagerUtils";
import "katex/dist/katex.min.css";

type Props = {
  text: string;
  onImageResize?: (url: string, width: number) => void;
  imageRegistry?: ImageRegistry;
  activeQuestion?: number | null;
};

// ── Type labels & badge styles ──

const TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: "Múltipla escolha",
  multiple_answer: "Multi-resposta",
  open_ended: "Discursiva",
  fill_blank: "Lacuna",
  true_false: "V / F",
  matching: "Associação",
  ordering: "Ordenação",
  table: "Tabela",
};

const TYPE_BADGE_CLASSES: Record<QuestionType, string> = {
  multiple_choice: "bg-blue-100 text-blue-700",
  multiple_answer: "bg-cyan-100 text-cyan-700",
  open_ended: "bg-green-100 text-green-700",
  fill_blank: "bg-yellow-100 text-yellow-800",
  true_false: "bg-pink-100 text-pink-700",
  matching: "bg-violet-100 text-violet-700",
  ordering: "bg-orange-100 text-orange-700",
  table: "bg-indigo-100 text-indigo-700",
};

// ── Rendering helpers ──

function InlineHtml({ html }: { html: string }) {
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

const APOIO_RE = /^>\s*Apoio\s*:\s*(.*)$/i;

function isApoioLine(line: string): boolean {
  return APOIO_RE.test(line);
}

function apoioInner(line: string): string {
  const m = APOIO_RE.exec(line);
  return m ? m[1] : line.slice(2);
}

function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const cls =
    difficulty === "fácil"
      ? "bg-green-100 text-green-700"
      : difficulty === "médio"
      ? "bg-yellow-100 text-yellow-800"
      : "bg-red-100 text-red-700";
  return (
    <span className={`text-[0.58rem] font-semibold px-1.5 py-0.5 rounded-full ${cls}`}>
      {difficulty}
    </span>
  );
}

// ── Question renderers ──

function QuestionAlternatives({ q }: { q: ParsedQuestion }) {
  if (q.type !== "multiple_choice" || q.alternatives.length === 0) return null;

  const hasCorrect = q.alternatives.some((a) => a.correct);

  // Sub-items mode: lettered steps with no correct marker
  if (!hasCorrect) {
    return (
      <div className="mt-3 flex flex-col gap-3 border-l-2 border-zinc-100 pl-3">
        {q.alternatives.map((a, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            <div className="flex items-start gap-2 text-sm text-zinc-800">
              <span className="font-semibold text-zinc-500 flex-shrink-0 w-5">
                {a.letter})
              </span>
              <div className="flex-1">
                <InlineHtml html={formatInline(a.text)} />
                {/* Continuations for this sub-item */}
                {a.continuations.map((c, ci) => {
                  if (c.startsWith("$$") && c.endsWith("$$")) {
                    return (
                      <div
                        key={ci}
                        className="my-1.5 p-2.5 bg-green-50 border border-green-200 rounded-md text-center overflow-x-auto"
                        dangerouslySetInnerHTML={{ __html: renderKatexBlock(c.slice(2, -2)) }}
                      />
                    );
                  }
                  if (c.startsWith("> ")) {
                    if (isApoioLine(c)) {
                      return (
                        <div key={ci} className="mt-1.5 py-1.5 px-3 bg-amber-50 border-l-4 border-amber-400 rounded-r-md text-sm text-amber-900">
                          <div className="text-[0.6rem] font-bold uppercase tracking-wide text-amber-700 mb-0.5">Apoio</div>
                          <InlineHtml html={formatInline(apoioInner(c))} />
                        </div>
                      );
                    }
                    return (
                      <div key={ci} className="mt-1.5 py-1.5 px-3 bg-indigo-50 border-l-4 border-indigo-400 rounded-r-md text-sm text-indigo-800">
                        <InlineHtml html={formatInline(c.slice(2))} />
                      </div>
                    );
                  }
                  return (
                    <div key={ci} className="mt-0.5">
                      <InlineHtml html={formatInline(c)} />
                    </div>
                  );
                })}
                {/* Nested V/F items under this sub-part */}
                {a.tfItems && a.tfItems.length > 0 && (
                  <div className="mt-1.5 flex flex-col gap-0.5">
                    {a.tfItems.map((t, ti) => (
                      <div key={ti} className="flex items-start gap-1.5 text-sm text-zinc-700">
                        <div className="w-4 h-4 border-[1.5px] border-zinc-300 rounded-[3px] flex-shrink-0 mt-0.5" />
                        <span><InlineHtml html={formatInline(t.text)} /></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Multiple choice mode: circular letters with correct marker
  return (
    <div className="mt-2 flex flex-col gap-0.5">
      {q.alternatives.map((a, i) => (
        <div key={i}>
          <div
            className={`flex items-start gap-1.5 text-sm text-zinc-700 ${a.correct ? "font-semibold" : ""}`}
          >
            <div
              className={`w-[22px] h-[22px] border-[1.5px] rounded-full flex items-center justify-center text-[0.63rem] font-bold flex-shrink-0 mt-0.5 ${
                a.correct
                  ? "bg-green-100 border-green-300 text-green-700"
                  : "border-zinc-300 text-zinc-500"
              }`}
            >
              {a.letter.toUpperCase()}
            </div>
            <span>
              <InlineHtml html={formatInline(a.text)} />
            </span>
            {a.correct && <Check className="w-3 h-3 text-green-700 ml-1 flex-shrink-0 mt-1" />}
          </div>
          {/* Continuations for this alternative */}
          {a.continuations.map((c, ci) => (
            <div key={ci} className="ml-7 text-sm text-zinc-600">
              <InlineHtml html={formatInline(c)} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function QuestionCheckboxes({ q }: { q: ParsedQuestion }) {
  if (q.type !== "multiple_answer" || q.checkItems.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-0.5">
      {q.checkItems.map((c, i) => (
        <div
          key={i}
          className={`flex items-start gap-1.5 text-sm text-zinc-700 ${c.checked ? "font-semibold" : ""}`}
        >
          <div
            className={`w-4 h-4 border-[1.5px] rounded-[3px] flex-shrink-0 mt-0.5 flex items-center justify-center ${
              c.checked ? "bg-blue-100 border-blue-400" : "border-zinc-300"
            }`}
          >
            {c.checked && <Check className="w-2.5 h-2.5 text-blue-700" />}
          </div>
          <span>
            <InlineHtml html={formatInline(c.text)} />
          </span>
        </div>
      ))}
    </div>
  );
}

function QuestionTrueFalse({ q }: { q: ParsedQuestion }) {
  if (q.type !== "true_false" || q.tfItems.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-1">
      {q.tfItems.map((t, i) => (
        <div key={i} className="flex items-start gap-1.5 text-sm text-zinc-700">
          <div className="w-4 h-4 border-[1.5px] border-zinc-300 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center text-[0.6rem] font-bold text-zinc-600">
            {t.marked === true ? "V" : t.marked === false ? "F" : ""}
          </div>
          <span>
            <InlineHtml html={formatInline(t.text)} />
          </span>
        </div>
      ))}
    </div>
  );
}

function QuestionMatching({ q }: { q: ParsedQuestion }) {
  if (q.type !== "matching" || q.matchPairs.length === 0) return null;
  return (
    <div className="mt-2.5">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="text-[0.65rem] font-semibold uppercase text-violet-600 px-2.5 py-1 text-left border-b-2 border-violet-100 w-6" />
            <th className="text-[0.65rem] font-semibold uppercase text-violet-600 px-2.5 py-1 text-left border-b-2 border-violet-100">
              Coluna A
            </th>
            <th className="text-center w-[60px] border-b-2 border-violet-100" />
            <th className="text-[0.65rem] font-semibold uppercase text-violet-600 px-2.5 py-1 text-left border-b-2 border-violet-100">
              Coluna B
            </th>
          </tr>
        </thead>
        <tbody>
          {q.matchPairs.map((p, i) => (
            <tr key={i}>
              <td className="text-muted-foreground font-semibold px-2.5 py-1.5 border-b border-zinc-100">
                {i + 1}
              </td>
              <td className="px-2.5 py-1.5 border-b border-zinc-100">
                <InlineHtml html={formatInline(p.left)} />
              </td>
              <td className="text-center text-zinc-300 tracking-widest border-b border-zinc-100">
                .....
              </td>
              <td className="text-violet-700 font-medium px-2.5 py-1.5 border-b border-zinc-100">
                <InlineHtml html={formatInline(p.right)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuestionOrdering({ q }: { q: ParsedQuestion }) {
  if (q.type !== "ordering" || q.orderItems.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-1">
      {q.orderItems.map((o, i) => (
        <div
          key={i}
          className="flex items-center gap-2 text-sm px-2.5 py-1.5 bg-orange-50 border border-orange-200 rounded-md"
        >
          <div className="w-[22px] h-[22px] bg-orange-400 text-white rounded-full flex items-center justify-center text-[0.65rem] font-bold flex-shrink-0">
            {o.n}
          </div>
          <span>
            <InlineHtml html={formatInline(o.text)} />
          </span>
        </div>
      ))}
    </div>
  );
}

function QuestionTable({ q }: { q: ParsedQuestion }) {
  if (q.type !== "table" || q.tableRows.length === 0) return null;
  return (
    <div className="mt-2.5 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <tbody>
        {q.tableRows.map((row, ri) => {
          const Tag = ri === 0 ? "th" : "td";
          return (
            <tr key={ri}>
              {row.map((cell, ci) => {
                let content: React.ReactNode;
                if (ri > 0 && ci > 0) {
                  if (cell === "( )") {
                    content = (
                      <span className="inline-block w-3.5 h-3.5 border-[1.5px] border-zinc-300 rounded-full" />
                    );
                  } else if (cell === "[ ]") {
                    content = (
                      <span className="inline-block w-3.5 h-3.5 border-[1.5px] border-zinc-300 rounded-[3px]" />
                    );
                  } else {
                    content = <InlineHtml html={formatInline(cell)} />;
                  }
                } else {
                  content = <InlineHtml html={formatInline(cell)} />;
                }

                const isHeader = ri === 0;
                const isFirstCol = ci === 0;
                return (
                  <Tag
                    key={ci}
                    className={`px-2.5 py-1.5 border border-zinc-200 ${
                      isHeader
                        ? "bg-zinc-50 font-semibold text-zinc-600 text-center text-[0.72rem]"
                        : isFirstCol
                        ? "text-left font-medium"
                        : "text-center"
                    } ${isHeader && isFirstCol ? "text-left" : ""}`}
                  >
                    {content}
                  </Tag>
                );
              })}
            </tr>
          );
        })}
        </tbody>
      </table>
    </div>
  );
}

function QuestionWordbank({ q }: { q: ParsedQuestion }) {
  if (!q.wordbank || q.wordbank.length === 0) return null;
  return (
    <div className="mt-2 p-2 px-2.5 bg-yellow-50 border border-dashed border-yellow-300 rounded-md flex flex-wrap gap-1.5 items-center">
      <span className="text-[0.65rem] font-semibold text-yellow-800 uppercase tracking-wide mr-1">
        Banco de palavras:
      </span>

      {q.wordbank.map((w, i) => (
        <span
          key={i}
          className="text-sm bg-white border border-yellow-200 px-2.5 py-0.5 rounded-full text-yellow-900 font-medium"
        >
          {w}
        </span>
      ))}
    </div>
  );
}

function QuestionAnswerLines({ q }: { q: ParsedQuestion }) {
  if (q.answerLines <= 0) return null;
  return (
    <div className="mt-2">
      {Array.from({ length: q.answerLines }).map((_, i) => (
        <div key={i} className="h-7 border-b border-zinc-300" />
      ))}
    </div>
  );
}

function SingleImage({
  imgStr,
  onImageResize,
  imageRegistry,
}: {
  imgStr: string;
  onImageResize?: (url: string, width: number) => void;
  imageRegistry?: ImageRegistry;
}) {
  const urlParts = imgStr.split(/\s+/);
  const ref = urlParts[0];
  let width: number | undefined;
  let align = "left";

  for (const part of urlParts.slice(1)) {
    const [key, val] = part.split("=");
    if (key === "width") width = parseInt(val, 10);
    if (key === "align") align = val;
  }

  // Resolve reference through registry (e.g. "imagem-1" → actual base64/URL)
  const resolvedSrc = resolveImageSrc(ref, imageRegistry || {});

  const alignClass =
    align === "center" ? "mx-auto" : align === "right" ? "ml-auto" : "";

  if (resolvedSrc.startsWith("http") || resolvedSrc.startsWith("data:")) {
    if (onImageResize) {
      return (
        <div className={`mt-1.5 ${alignClass}`}>
          <ImageResizer
            src={resolvedSrc}
            initialWidth={width}
            onResize={(w) => onImageResize(ref, w)}
          />
        </div>
      );
    }
    return (
      <div className={`mt-1.5 ${alignClass}`} style={width ? { width } : undefined}>
        <img
          src={resolvedSrc}
          alt="Imagem da questão"
          className="max-w-full rounded-md border border-zinc-200"
          style={width ? { width } : undefined}
        />
      </div>
    );
  }

  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-[0.72rem] text-violet-700 bg-violet-50 px-2 py-1 rounded w-fit">
      <ImageIcon className="w-3 h-3" />
      {ref}
    </div>
  );
}

/** Pull image refs out of a continuations array in the order they appear.
 *  Used to split `q.images` into "leading" vs "trailing" buckets so each
 *  group renders at its authored DSL position, matching the preview 100%. */
const IMG_MARKER_RE = /^\[img[:\s](.+?)\]$/i;
function extractImageRefs(conts: string[]): string[] {
  const refs: string[] = [];
  for (const c of conts) {
    const m = c.match(IMG_MARKER_RE);
    if (m) refs.push(m[1]);
  }
  return refs;
}

function QuestionImages({
  refs,
  onImageResize,
  imageRegistry,
}: {
  refs: string[];
  onImageResize?: (url: string, width: number) => void;
  imageRegistry?: ImageRegistry;
}) {
  if (refs.length === 0) return null;

  return (
    <>
      {refs.map((img, i) => (
        <SingleImage key={i} imgStr={img} onImageResize={onImageResize} imageRegistry={imageRegistry} />
      ))}
    </>
  );
}

// ── Question card ──

function QuestionCard({
  q,
  onImageResize,
  imageRegistry,
  isActive,
}: {
  q: ParsedQuestion;
  onImageResize?: (url: string, width: number) => void;
  imageRegistry?: ImageRegistry;
  isActive?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const badgeCls = TYPE_BADGE_CLASSES[q.type] || "bg-red-100 text-red-700";
  const label = TYPE_LABELS[q.type] || "?";

  useEffect(() => {
    if (isActive && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isActive]);

  // Render continuations as an ordered stream of React nodes so images,
  // Apoio boxes and text all land at the exact position authored in the DSL.
  // The previous implementation concatenated HTML and rendered images out of
  // band, which broke position fidelity whenever an image sat between two
  // text lines.
  const IMG_INLINE_RE = /^\[img[:\s](.+?)\]$/i;
  const renderContinuationStream = (
    conts: string[],
    keyPrefix: string,
  ): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    let textBuffer = "";
    let k = 0;
    const flushText = () => {
      if (!textBuffer) return;
      nodes.push(
        <div
          key={`${keyPrefix}-t-${k++}`}
          className="text-[0.84rem] leading-relaxed text-zinc-800"
          dangerouslySetInnerHTML={{ __html: textBuffer }}
        />,
      );
      textBuffer = "";
    };

    for (const c of conts) {
      const imgM = c.match(IMG_INLINE_RE);
      if (imgM) {
        flushText();
        nodes.push(
          <SingleImage
            key={`${keyPrefix}-img-${k++}`}
            imgStr={imgM[1]}
            onImageResize={onImageResize}
            imageRegistry={imageRegistry}
          />,
        );
        continue;
      }
      if (c.startsWith("$$") && c.endsWith("$$")) {
        textBuffer +=
          '<div class="my-2 p-2.5 bg-green-50 border border-green-200 rounded-md text-center overflow-x-auto">' +
          renderKatexBlock(c.slice(2, -2)) +
          "</div>";
      } else if (c.startsWith("> ")) {
        if (isApoioLine(c)) {
          textBuffer +=
            `<div class="mt-2 py-2.5 px-3.5 bg-amber-50 border-l-4 border-amber-500 rounded-r-lg text-sm text-amber-900 leading-relaxed">` +
            `<div class="text-[0.6rem] font-bold uppercase tracking-wide text-amber-700 mb-0.5">Apoio</div>` +
            formatInline(apoioInner(c)) +
            "</div>";
        } else {
          textBuffer +=
            `<div class="mt-2 py-2.5 px-3.5 bg-indigo-50 border-l-4 border-indigo-500 rounded-r-lg text-sm text-indigo-800 leading-relaxed">` +
            formatInline(c.slice(2)) +
            "</div>";
        }
      } else if (c === "<!--blank-->") {
        textBuffer += "<br>";
      } else {
        textBuffer += (textBuffer ? "<br>" : "") + formatInline(c);
      }
    }
    flushText();
    return nodes;
  };

  const leadingNodes = renderContinuationStream(q.continuations, "lead");
  const trailingNodes = renderContinuationStream(q.trailingContinuations, "trail");

  // When the parser didn't record any image markers (legacy parses) but
  // q.images is populated, fall back to rendering them after the statement
  // to preserve the original behavior.
  const hasAnyImageMarker =
    extractImageRefs(q.continuations).length +
      extractImageRefs(q.trailingContinuations).length >
    0;
  const fallbackLeadingRefs = !hasAnyImageMarker ? q.images : [];

  return (
    <div
      ref={cardRef}
      className={`border rounded-lg p-3 px-3.5 mb-2.5 relative transition-all ${
        isActive
          ? "border-violet-400 ring-2 ring-violet-200 bg-violet-50/30"
          : "border-zinc-200 hover:border-zinc-300"
      }`}
    >
      {/* Question number + metadata */}
      <div className="text-[0.66rem] font-bold text-muted-foreground mb-0.5 flex items-center gap-1.5">
        Questão {q.number}
        {q.points && (
          <span className="text-[0.6rem] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
            {q.points} pt{q.points > 1 ? "s" : ""}
          </span>
        )}
        {q.difficulty && <DifficultyBadge difficulty={q.difficulty} />}
      </div>

      {/* Type badge */}
      <span
        className={`absolute top-2.5 right-2.5 text-[0.6rem] font-semibold px-2 py-0.5 rounded-full ${badgeCls}`}
      >
        {label}
      </span>

      {/* Statement — only the header line. Continuations render as an ordered
          stream below so images/Apoio/text land at their DSL position. */}
      <div
        className="text-[0.84rem] leading-relaxed text-zinc-800 pr-[70px]"
        dangerouslySetInnerHTML={{ __html: formatInline(q.statement) }}
      />

      {/* Leading stream: text + images + Apoio, in DSL order */}
      {leadingNodes}

      {/* Fallback images for legacy parses without position markers */}
      <QuestionImages
        refs={fallbackLeadingRefs}
        onImageResize={onImageResize}
        imageRegistry={imageRegistry}
      />

      {/* Type-specific rendering */}
      <QuestionAlternatives q={q} />
      <QuestionCheckboxes q={q} />
      <QuestionTrueFalse q={q} />
      <QuestionMatching q={q} />
      <QuestionOrdering q={q} />
      <QuestionTable q={q} />
      <QuestionWordbank q={q} />
      <QuestionAnswerLines q={q} />

      {/* Trailing stream: text + images + Apoio authored after the body,
          rendered in DSL order so the preview stays 100% faithful. */}
      {trailingNodes}
    </div>
  );
}

// ── Section + item renderers ──

function SectionItemRenderer({
  item,
  onImageResize,
  imageRegistry,
  activeQuestion,
}: {
  item: SectionItem;
  onImageResize?: (url: string, width: number) => void;
  imageRegistry?: ImageRegistry;
  activeQuestion?: number | null;
}) {
  switch (item.kind) {
    case "question":
      return <QuestionCard q={item.data} onImageResize={onImageResize} imageRegistry={imageRegistry} isActive={activeQuestion === item.data.number} />;
    case "instruction":
      return (
        <div className="py-2.5 px-3.5 bg-indigo-50 border-l-4 border-indigo-500 rounded-r-lg mb-2.5 text-sm text-indigo-800 leading-relaxed flex gap-2 items-start">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <InlineHtml html={formatInline(item.text)} />
        </div>
      );
    case "separator":
      return <div className="my-4 relative text-center"><hr className="border-zinc-300" /></div>;
    case "spacer":
      return <div className="h-3" />;
    case "mathblock":
      return (
        <div
          className="my-2 p-2.5 bg-green-50 border border-green-200 rounded-md text-center overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: renderKatexBlock(item.expr) }}
        />
      );
    case "unrecognized":
      return (
        <div className="text-sm text-red-700 bg-red-50 px-2 py-1.5 rounded border-l-[3px] border-red-300 mb-1">
          {item.text}
        </div>
      );
  }
}

function SectionRenderer({
  section,
  onImageResize,
  imageRegistry,
  activeQuestion,
}: {
  section: ParsedSection;
  onImageResize?: (url: string, width: number) => void;
  imageRegistry?: ImageRegistry;
  activeQuestion?: number | null;
}) {
  return (
    <>
      {section.title && (
        <div
          className={`font-bold uppercase tracking-wide border-b-[2.5px] pb-1.5 mb-3 ${
            section.level === 1
              ? "text-[0.9rem] text-violet-700 border-violet-100"
              : "text-[0.82rem] text-violet-600 border-dashed border-violet-100"
          }`}
        >
          <InlineHtml html={formatInline(section.title)} />
        </div>
      )}
      {section.items.map((item, i) => (
        <SectionItemRenderer key={i} item={item} onImageResize={onImageResize} imageRegistry={imageRegistry} activeQuestion={activeQuestion} />
      ))}
    </>
  );
}

// ── Main preview component ──

export default function ActivityPreview({ text, onImageResize, imageRegistry, activeQuestion }: Props) {
  const parsed = useMemo(() => parseActivity(text), [text]);

  const hasContent = parsed.sections.some(
    (s) => s.title || s.items.length > 0
  );

  if (!hasContent) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2 text-center">
        <FileText className="w-8 h-8 text-zinc-300" />
        A prévia aparece enquanto você digita
      </div>
    );
  }

  return (
    <div className="px-5 py-5">
      {parsed.sections.map((sec, i) => (
        <SectionRenderer key={i} section={sec} onImageResize={onImageResize} imageRegistry={imageRegistry} activeQuestion={activeQuestion} />
      ))}
    </div>
  );
}
