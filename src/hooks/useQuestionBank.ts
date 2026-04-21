import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type QuestionFilters = {
  subject?: string;
  search?: string;
};

export function useQuestions(filters: QuestionFilters = {}) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["question_bank", user?.id, filters],
    queryFn: async () => {
      let query = (supabase.from as any)("question_bank")
        .select("*")
        .eq("created_by", user!.id);

      if (filters.subject) {
        query = query.eq("subject", filters.subject);
      }

      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!user,
    staleTime: 1000 * 30,
  });
}

export function useDeleteQuestion() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)("question_bank")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["question_bank", user?.id] });
      toast.success("Questão removida.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateQuestion() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, any> }) => {
      const { error } = await (supabase.from as any)("question_bank")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["question_bank", user?.id] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

type ExtractedQuestion = {
  text: string;
  subject: string;
  topic?: string | null;
  options?: string[] | null;
  correct_answer?: number | null;
  resolution?: string | null;
  has_figure?: boolean;
  figure_description?: string | null;
  image_url?: string | null;
  source_file_name?: string | null;
  [key: string]: unknown;
};

export function useInsertQuestions() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (rows: ExtractedQuestion[]) => {
      const payload = rows.map((r) => ({
        text: r.text,
        subject: r.subject,
        topic: r.topic ?? null,
        options: r.options ?? null,
        correct_answer: r.correct_answer ?? null,
        resolution: r.resolution ?? null,
        figure_description: r.figure_description ?? null,
        image_url: r.image_url ?? null,
        source_file_name: r.source_file_name ?? null,
        difficulty: "medio",
        source: "ai_extract",
        created_by: user!.id,
      }));

      const { error } = await (supabase.from as any)("question_bank").insert(payload);
      if (error) throw error;
      return payload.length;
    },
    onSuccess: (count: number) => {
      qc.invalidateQueries({ queryKey: ["question_bank", user?.id] });
      qc.invalidateQueries({ queryKey: ["question_bank_stats", user?.id] });
      toast.success(`${count} questão(ões) adicionada(s) ao banco.`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

type QuestionStats = {
  total: number;
  bySubject: Record<string, number>;
};

export function useQuestionStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["question_bank_stats", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("question_bank")
        .select("subject")
        .eq("created_by", user!.id);
      if (error) throw error;

      const rows: Array<{ subject: string }> = data ?? [];
      const bySubject: Record<string, number> = {};
      for (const row of rows) {
        bySubject[row.subject] = (bySubject[row.subject] ?? 0) + 1;
      }
      return { total: rows.length, bySubject } satisfies QuestionStats;
    },
    enabled: !!user,
    staleTime: 1000 * 60,
  });
}
