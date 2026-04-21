import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { StructuredQuestion } from "@/types/adaptation";
import type { BarrierItem } from "@/lib/adaptationWizardHelpers";

export type RegenerateInput = {
  question: StructuredQuestion;
  version_type: "universal" | "directed";
  activity_type: string;
  barriers: BarrierItem[];
  hint?: string;
};

export type RegenerateResult = {
  question_dsl: string;
  changes_made: string[];
};

async function regenerateQuestion(input: RegenerateInput): Promise<RegenerateResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;

  const creditsResp = await fetch(`${baseUrl}/functions/v1/check-and-deduct-credits`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount: 1, type: "regenerate" }),
  });

  if (!creditsResp.ok) {
    const err = await creditsResp.json().catch(() => ({}));
    if (creditsResp.status === 402) {
      throw new Error("Créditos insuficientes. Adquira mais créditos para continuar.");
    }
    throw new Error(err.error || `Erro ao verificar créditos (${creditsResp.status})`);
  }

  const resp = await fetch(`${baseUrl}/functions/v1/regenerate-question`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      question: input.question,
      version_type: input.version_type,
      activity_type: input.activity_type,
      barriers: input.barriers,
      hint: input.hint,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao regenerar questão.");
  }

  return resp.json();
}

export function useRegenerateQuestion() {
  return useMutation<RegenerateResult, Error, RegenerateInput>({
    mutationFn: regenerateQuestion,
  });
}
