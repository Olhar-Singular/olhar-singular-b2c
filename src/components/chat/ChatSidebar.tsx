import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { MessageSquarePlus } from "lucide-react";
import type { ChatSession } from "@/types/chat";

const MAX_SESSIONS = 10;

type Props = {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
};

export default function ChatSidebar({ sessions, activeSessionId, onSelectSession, onNewSession }: Props) {
  return (
    <div className="flex flex-col h-full border-r border-border w-64 shrink-0">
      {/* Title + badge + button do not fit side by side in w-64, so the
          button gets its own full-width row instead of spilling past the border. */}
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-semibold text-foreground">Conversas</span>
          <Badge variant="secondary" className="shrink-0 text-xs">{sessions.length}/{MAX_SESSIONS}</Badge>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onNewSession}
          disabled={sessions.length >= MAX_SESSIONS}
          className="w-full"
        >
          <MessageSquarePlus className="w-4 h-4" />
          Nova conversa
        </Button>
      </div>

      <Separator />

      <ScrollArea className="flex-1 p-2">
        {sessions.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6 px-2">
            Nenhuma conversa ainda. Clique em "Nova conversa" para começar.
          </p>
        ) : (
          <div className="space-y-1">
            {sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectSession(s.id)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm truncate transition-colors ${
                  s.id === activeSessionId
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                {s.title || "Sem título"}
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
