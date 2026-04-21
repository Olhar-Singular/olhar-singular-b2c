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
