import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { parseInvokeError, parseEdgeFnError } from "@/lib/utils/errors";
import type { AdminDashboardData, SetUserStatusInput, GrantCreditsInput } from "@/types/admin";

const DASHBOARD_KEY = ["admin", "dashboard"] as const;

export function useAdminDashboard() {
  return useQuery({
    queryKey: DASHBOARD_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-dashboard", { body: {} });
      if (error) {
        const msg = await parseInvokeError(error, "Erro ao carregar o painel. Tente novamente.");
        throw new Error(msg);
      }
      return data as AdminDashboardData;
    },
    staleTime: 1000 * 60,
  });
}

export function useSetUserStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SetUserStatusInput) => {
      const { data, error } = await supabase.functions.invoke("admin-user-status", { body: input });
      if (error) {
        const msg = await parseInvokeError(error, "Erro ao atualizar o usuário. Tente novamente.");
        throw new Error(msg);
      }
      return data as { success: boolean };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
      toast.success(variables.action === "ban" ? "Usuário inativado." : "Usuário reativado.");
    },
    onError: (err: Error) => toast.error(parseEdgeFnError(err, "Erro ao atualizar o usuário. Tente novamente.")),
  });
}

export function useGrantCredits() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: GrantCreditsInput) => {
      const { data, error } = await supabase.functions.invoke("admin-grant-credits", { body: input });
      if (error) {
        const msg = await parseInvokeError(error, "Erro ao adicionar créditos. Tente novamente.");
        throw new Error(msg);
      }
      return data as { success: boolean; new_balance: number };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
      toast.success(`${variables.amount} crédito(s) adicionado(s).`);
    },
    onError: (err: Error) => toast.error(parseEdgeFnError(err, "Erro ao adicionar créditos. Tente novamente.")),
  });
}
