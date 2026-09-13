import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { parseInvokeError, parseEdgeFnError } from "@/lib/utils/errors";
import type {
  AdminDashboardData,
  SetUserStatusInput,
  GrantCreditsInput,
  SetAccessInput,
  CreateUserInput,
  ChangeEmailInput,
} from "@/types/admin";

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

const CREATE_USER_ERRORS: Record<string, string> = {
  email_exists: "Já existe uma conta com este e-mail.",
  invalid_email: "Informe um e-mail válido.",
  invalid_name: "Informe o nome completo.",
  invalid_mode: "Escolha Teste ou Cortesia.",
  partial_failure: "Convite enviado, mas o tipo de acesso não foi gravado. Ajuste em Alterar acesso.",
};

// Invite flow: Supabase sends the e-mail; the person creates the password on
// /redefinir-senha?convite=1. A trial's clock starts when the invite is accepted.
export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateUserInput) => {
      const { data, error } = await supabase.functions.invoke("admin-create-user", { body: input });
      if (error) {
        const raw = await parseInvokeError(error, "Erro ao enviar o convite. Tente novamente.");
        throw new Error(CREATE_USER_ERRORS[raw] ?? raw);
      }
      return data as { success: boolean; userId: string; mode: "trial" | "exempt" };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
      toast.success(`Convite enviado para ${variables.email}.`);
    },
    onError: (err: Error) => toast.error(parseEdgeFnError(err, "Erro ao enviar o convite. Tente novamente.")),
  });
}

const CHANGE_EMAIL_ERRORS: Record<string, string> = {
  email_exists: "Já existe uma conta com este e-mail.",
  invalid_email: "Informe um e-mail válido.",
  cannot_change_self: "Você não pode alterar o próprio e-mail por aqui.",
  user_not_found: "Usuário não encontrado.",
};

export function useChangeEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ChangeEmailInput) => {
      const { data, error } = await supabase.functions.invoke("admin-change-email", { body: input });
      if (error) {
        const raw = await parseInvokeError(error, "Erro ao alterar o e-mail. Tente novamente.");
        throw new Error(CHANGE_EMAIL_ERRORS[raw] ?? raw);
      }
      return data as { success: boolean };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
      toast.success("E-mail atualizado.");
    },
    onError: (err: Error) => toast.error(parseEdgeFnError(err, "Erro ao alterar o e-mail. Tente novamente.")),
  });
}

// Cancels on behalf of a user: same function the user calls, with userId.
export function useAdminCancelSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string }) => {
      const { data, error } = await supabase.functions.invoke("cancel-subscription", { body: input });
      if (error) throw new Error(await parseInvokeError(error, "Não foi possível cancelar a assinatura."));
      return data as { status: "cancelled"; subscriptionId: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
      toast.success("Assinatura cancelada. Os créditos do período pago continuam até o fim.");
    },
    onError: (err: Error) => toast.error(parseEdgeFnError(err, "Não foi possível cancelar a assinatura.")),
  });
}

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
