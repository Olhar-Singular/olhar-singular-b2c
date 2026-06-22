export type ExtractedQuestion = {
  text: string;
  subject: string;
  topic?: string;
  options?: string[];
  correct_answer?: number | null;
  resolution?: string;
  has_figure: boolean;
  figure_description?: string;
  image_page?: number;
  figure_bbox?: { x: number; y: number; width: number; height: number };
};

export type ExtractionResult = {
  questions: ExtractedQuestion[];
  warnings: string[];
};

export function validateExtractedQuestions(data: unknown): ExtractionResult {
  if (!Array.isArray(data)) return { questions: [], warnings: [] };

  const questions: ExtractedQuestion[] = [];
  const warnings: string[] = [];

  data.forEach((raw: unknown, i: number) => {
    const idx = i + 1;
    const q = raw as Record<string, unknown>;

    if (
      raw == null ||
      typeof q.text !== "string" ||
      q.text.trim() === "" ||
      typeof q.subject !== "string" ||
      q.subject.trim() === ""
    ) {
      return;
    }

    const text = q.text.trim();
    const subject = q.subject.trim();

    if (text.length < 20) {
      warnings.push(`Questão ${idx} descartada: enunciado com menos de 20 caracteres`);
      return;
    }

    let options: string[] | undefined;
    if (Array.isArray(q.options)) {
      const opts = q.options as string[];
      if (opts.length === 0) {
        options = undefined;
      } else if (opts.length < 2 || opts.length > 5) {
        warnings.push(`Questão ${idx} descartada: opções inválidas (mínimo 2, máximo 5)`);
        return;
      } else {
        options = opts;
      }
    }

    let correct_answer: number | null = null;
    if (typeof q.correct_answer === "number") {
      const ca = q.correct_answer;
      correct_answer =
        options && ca !== -1 && (ca < 0 || ca >= options.length) ? -1 : ca;
    }

    if (q.has_figure === true) {
      const desc = typeof q.figure_description === "string" ? q.figure_description.trim() : "";
      if (!desc) warnings.push(`Questão ${idx}: figura referenciada sem descrição`);
    }

    const figure_bbox =
      q.figure_bbox &&
      typeof (q.figure_bbox as any).x === "number" &&
      typeof (q.figure_bbox as any).y === "number" &&
      typeof (q.figure_bbox as any).width === "number" &&
      typeof (q.figure_bbox as any).height === "number"
        ? (q.figure_bbox as { x: number; y: number; width: number; height: number })
        : undefined;

    questions.push({
      text,
      subject,
      topic: typeof q.topic === "string" ? q.topic.trim() : undefined,
      options,
      correct_answer,
      resolution:
        typeof q.resolution === "string" && q.resolution.trim()
          ? q.resolution.trim()
          : undefined,
      has_figure: q.has_figure === true,
      figure_description:
        typeof q.figure_description === "string" && q.figure_description.trim()
          ? q.figure_description.trim()
          : undefined,
      image_page: typeof q.image_page === "number" && q.image_page > 0 ? q.image_page : undefined,
      figure_bbox,
    });
  });

  return { questions, warnings };
}
