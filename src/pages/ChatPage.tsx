import { useState } from "react";
import { useChatSessions } from "@/hooks/useChatSessions";
import { useSendMessage } from "@/hooks/useSendMessage";
import ChatSidebar from "@/components/chat/ChatSidebar";
import ChatWindow from "@/components/chat/ChatWindow";
import type { ChatMessage } from "@/types/chat";
import { toast } from "sonner";

export default function ChatPage() {
  const { data: sessions = [] } = useChatSessions();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const { mutate: sendMessage, isPending } = useSendMessage();

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;
  const messages: ChatMessage[] = activeSession ? (activeSession.messages as ChatMessage[]) : localMessages;

  function handleNewSession() {
    setActiveSessionId(null);
    setLocalMessages([]);
  }

  function handleSelectSession(id: string) {
    setActiveSessionId(id);
    setLocalMessages([]);
  }

  function handleSend(text: string) {
    const userMsg: ChatMessage = { role: "user", content: text };
    const next = [...messages, userMsg];

    if (!activeSession) {
      setLocalMessages(next);
    }

    sendMessage(
      { messages: next, session_id: activeSessionId ?? undefined },
      {
        onSuccess: (result) => {
          setActiveSessionId(result.session_id);
          setLocalMessages([]);
        },
        onError: (err) => {
          toast.error(err.message);
          if (!activeSession) {
            setLocalMessages(messages);
          }
        },
      }
    );
  }

  const displayMessages: ChatMessage[] =
    activeSession
      ? (activeSession.messages as ChatMessage[])
      : localMessages;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen bg-background">
      <ChatSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
      />
      <div className="flex-1 min-w-0">
        <ChatWindow
          messages={displayMessages}
          onSend={handleSend}
          isPending={isPending}
        />
      </div>
    </div>
  );
}
