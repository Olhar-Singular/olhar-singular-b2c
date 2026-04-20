import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

type BarrierProfile = Database["public"]["Tables"]["barrier_profiles"]["Row"];
type CreateInput = Pick<BarrierProfile, "barriers" | "observation">;
type UpdateInput = { id: string } & Partial<CreateInput>;

const QUERY_KEY = ["barrier_profiles"] as const;

export function useBarrierProfiles() {
  const { user } = useAuth();
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("barrier_profiles")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreateBarrierProfile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateInput) => {
      const { error } = await supabase
        .from("barrier_profiles")
        .insert({ ...input, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Perfil criado com sucesso.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateBarrierProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateInput) => {
      const { data, error } = await supabase
        .from("barrier_profiles")
        .update(input)
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Perfil atualizado.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteBarrierProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("barrier_profiles")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Perfil excluído.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
