import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type ActivityLogItem =
  | {
      kind: "adaptation";
      id: string;
      title: string;
      activityType: string | null;
      status: string;
      creditsSpent: number;
      date: string;
    }
  | {
      kind: "extraction";
      id: string;
      fileName: string;
      questionsExtracted: number;
      creditsSpent: number;
      wasFree: boolean;
      date: string;
    };

export function useActivityLog() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["activity_log", user?.id],
    queryFn: async (): Promise<ActivityLogItem[]> => {
      const [adaptResult, extractResult] = await Promise.all([
        (supabase.from as any)("adaptations")
          .select("id,title,activity_type,status,credits_spent,updated_at")
          .eq("user_id", user!.id),
        (supabase.from as any)("pdf_uploads")
          .select("id,file_name,questions_extracted,credits_spent,was_free,uploaded_at")
          .eq("user_id", user!.id),
      ]);

      if (adaptResult.error) throw adaptResult.error;
      if (extractResult.error) throw extractResult.error;

      const adaptations: ActivityLogItem[] = (adaptResult.data ?? []).map((a: any) => ({
        kind: "adaptation" as const,
        id: a.id,
        title: a.title || "Adaptação sem título",
        activityType: a.activity_type ?? null,
        status: a.status,
        creditsSpent: a.credits_spent ?? 0,
        date: a.updated_at,
      }));

      const extractions: ActivityLogItem[] = (extractResult.data ?? []).map((e: any) => ({
        kind: "extraction" as const,
        id: e.id,
        fileName: e.file_name,
        questionsExtracted: e.questions_extracted ?? 0,
        creditsSpent: e.credits_spent ?? 0,
        wasFree: e.was_free ?? false,
        date: e.uploaded_at,
      }));

      return [...adaptations, ...extractions].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
    },
    enabled: !!user,
    staleTime: 1000 * 60,
  });
}
