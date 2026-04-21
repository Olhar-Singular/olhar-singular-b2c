import { useMemo } from "react";
import { parseActivity } from "@/lib/activityParser";
import type { QuestionType } from "@/lib/activityParser";

type Props = {
  text: string;
};

const CHIP_STYLES: Record<
  QuestionType,
  { cls: string; label: string }
> = {
  multiple_choice: { cls: "bg-blue-100 text-blue-700", label: "múltipla" },
  multiple_answer: { cls: "bg-cyan-100 text-cyan-700", label: "multi-resp." },
  open_ended: { cls: "bg-green-100 text-green-700", label: "discursiva" },
  fill_blank: { cls: "bg-yellow-100 text-yellow-800", label: "lacuna" },
  true_false: { cls: "bg-zinc-100 text-zinc-600", label: "V/F" },
  matching: { cls: "bg-violet-100 text-violet-700", label: "associação" },
  ordering: { cls: "bg-orange-100 text-orange-700", label: "ordenação" },
  table: { cls: "bg-blue-100 text-blue-700", label: "tabela" },
};

type Stats = {
  totalQ: number;
  totalPts: number;
  sectionCount: number;
  unrecs: number;
  counts: Record<QuestionType, number>;
  warnings: string[];
};

function computeStats(text: string): Stats {
  const parsed = parseActivity(text);
  const counts: Record<string, number> = {};
  let totalQ = 0;
  let totalPts = 0;
  let unrecs = 0;
  const warnings: string[] = [];

  for (const sec of parsed.sections) {
    for (const it of sec.items) {
      if (it.kind === "question") {
        totalQ++;
        const t = it.data.type;
        counts[t] = (counts[t] || 0) + 1;
        if (it.data.points) totalPts += it.data.points;

        // Warnings
        if (it.data.type === "multiple_choice" && it.data.alternatives.length < 2) {
          warnings.push(
            `Q${it.data.number}: so ${it.data.alternatives.length} alternativa`
          );
        }
      }
      if (it.kind === "unrecognized") unrecs++;
    }
  }

  const sectionCount = parsed.sections.filter((s) => s.title).length;

  return {
    totalQ,
    totalPts,
    sectionCount,
    unrecs,
    counts: counts as Record<QuestionType, number>,
    warnings,
  };
}

function Chip({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium text-[0.68rem] ${cls}`}
    >
      {children}
    </span>
  );
}

export default function ActivityStatusBar({ text }: Props) {
  const stats = useMemo(() => computeStats(text), [text]);

  if (stats.totalQ === 0 && stats.unrecs === 0) return null;

  return (
    <div className="mt-2 px-3.5 py-2 bg-background border border-border rounded-lg flex items-center gap-2 text-[0.72rem] flex-wrap shadow-sm">
      <div className="flex gap-1.5 flex-wrap items-center">
        {stats.totalQ > 0 && (
          <Chip cls="bg-blue-100 text-blue-700">
            {stats.totalQ} questão(ões)
          </Chip>
        )}
        {stats.totalPts > 0 && (
          <Chip cls="bg-violet-100 text-violet-700">{stats.totalPts} pontos</Chip>
        )}
        {stats.sectionCount > 0 && (
          <Chip cls="bg-zinc-100 text-zinc-600">
            {stats.sectionCount} seção(ões)
          </Chip>
        )}

        {(Object.entries(CHIP_STYLES) as [QuestionType, { cls: string; label: string }][]).map(
          ([type, { cls, label }]) =>
            stats.counts[type] ? (
              <Chip key={type} cls={cls}>
                {stats.counts[type]} {label}
              </Chip>
            ) : null
        )}
      </div>

      {(stats.unrecs > 0 || stats.warnings.length > 0) && (
        <div className="ml-auto flex gap-1.5 flex-wrap">
          {stats.unrecs > 0 && (
            <Chip cls="bg-red-100 text-red-700">
              {stats.unrecs} linha(s) não reconhecida(s)
            </Chip>
          )}
          {stats.warnings.map((w, i) => (
            <Chip key={i} cls="bg-yellow-100 text-yellow-800">
              {w}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}
