import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;

  const resp = await fetch(`${baseUrl}/functions/v1/chat`, {
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

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `Erro ao enviar mensagem (${resp.status})`);
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
