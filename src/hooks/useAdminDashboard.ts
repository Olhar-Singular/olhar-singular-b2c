import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { parseInvokeError, parseEdgeFnError } from "@/lib/utils/errors";
import type { AdminDashboardData, SetUserStatusInput, GrantCreditsInput, SetAccessInput } from "@/types/admin";

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

const ACCESS_ERRORS: Record<string, string> = {
  not_a_trial: "Só é possível estender o teste de uma conta em período de teste já iniciado.",
  trial_limit_reached: "O período de teste não pode passar de 90 dias no total.",
  cannot_change_self: "Você não pode alterar o próprio acesso.",
  user_not_found: "Usuário não encontrado.",
};

export function useSetAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SetAccessInput) => {
      const { data, error } = await supabase.functions.invoke("admin-set-access", { body: input });
      if (error) {
        const raw = await parseInvokeError(error, "Erro ao alterar o acesso. Tente novamente.");
        throw new Error(ACCESS_ERRORS[raw] ?? raw);
      }
      return data as { success: boolean };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
      toast.success("extendDays" in variables ? `Teste estendido em ${variables.extendDays} dias.` : "Acesso atualizado.");
    },
    onError: (err: Error) => toast.error(parseEdgeFnError(err, "Erro ao alterar o acesso. Tente novamente.")),
  });
}
