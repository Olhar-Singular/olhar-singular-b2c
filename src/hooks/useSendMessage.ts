import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseEdgeFnError } from "@/lib/utils/errors";
import type { ChatMessage } from "@/types/chat";

export type SendMessageInput = {
  messages: ChatMessage[];
  session_id?: string;
};

export type SendMessageResult = {
  reply: string;
  session_id: string;
  title?: string;
};

async function sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Sessão expirada. Faça login novamente.");
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;

  let resp: Response;
  try {
    resp = await fetch(`${baseUrl}/functions/v1/chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: input.messages,
        ...(input.session_id ? { session_id: input.session_id } : {}),
      }),
    });
  } catch (e) {
    throw new Error(parseEdgeFnError(e, "Erro ao enviar mensagem."));
  }

  if (!resp.ok) {
    if (resp.status === 401) throw new Error("Sessão expirada. Faça login novamente.");
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao enviar mensagem.");
  }

  return resp.json();
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation<SendMessageResult, Error, SendMessageInput>({
    mutationFn: sendMessage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
    },
  });
}
