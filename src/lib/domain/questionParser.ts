export type ExtractedQuestion = {
  text: string;
  subject: string;
  topic?: string;
  options?: string[];
  correct_answer?: number | null;
};

export function validateExtractedQuestions(data: unknown): ExtractedQuestion[] {
  if (!Array.isArray(data)) return [];
  return data
    .filter(
      (q: unknown) =>
        q != null &&
        typeof (q as any).text === "string" &&
        (q as any).text.trim() !== "" &&
        typeof (q as any).subject === "string" &&
        (q as any).subject.trim() !== ""
    )
    .map((q: any) => ({
      text: q.text.trim(),
      subject: q.subject.trim(),
      topic: typeof q.topic === "string" ? q.topic.trim() : undefined,
      options: Array.isArray(q.options) ? q.options : undefined,
      correct_answer: typeof q.correct_answer === "number" ? q.correct_answer : null,
    }));
}
