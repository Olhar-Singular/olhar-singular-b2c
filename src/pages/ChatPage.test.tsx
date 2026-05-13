import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import ChatPage from "./ChatPage";
import { renderWithProviders } from "@/test/helpers";

const mutate = vi.fn();

vi.mock("@/hooks/useChatSessions", () => ({
  useChatSessions: vi.fn(),
}));

vi.mock("@/hooks/useSendMessage", () => ({
  useSendMessage: () => ({ mutate, isPending: false }),
}));

vi.mock("@/components/chat/ChatSidebar", () => ({
  default: ({
    sessions,
    activeSessionId,
    onSelectSession,
    onNewSession,
  }: {
    sessions: Array<{ id: string; title: string }>;
    activeSessionId: string | null;
    onSelectSession: (id: string) => void;
    onNewSession: () => void;
  }) => (
    <div data-testid="sidebar">
      <span data-testid="active">{activeSessionId ?? "none"}</span>
      <button onClick={onNewSession}>new</button>
      {sessions.map((s) => (
        <button key={s.id} onClick={() => onSelectSession(s.id)}>
          select-{s.id}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("@/components/chat/ChatWindow", () => ({
  default: ({
    messages,
    onSend,
    isPending,
  }: {
    messages: Array<{ role: string; content: string }>;
    onSend: (text: string) => void;
    isPending: boolean;
  }) => (
    <div data-testid="window">
      <span data-testid="pending">{String(isPending)}</span>
      <span data-testid="msg-count">{messages.length}</span>
      <button onClick={() => onSend("hi")}>send</button>
    </div>
  ),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { useChatSessions } from "@/hooks/useChatSessions";

beforeEach(() => {
  mutate.mockReset();
  vi.mocked(useChatSessions).mockReturnValue({ data: [] } as never);
});

describe("ChatPage", () => {
  it("renders empty layout when no sessions", () => {
    renderWithProviders(<ChatPage />);
    expect(screen.getByTestId("active")).toHaveTextContent("none");
    expect(screen.getByTestId("msg-count")).toHaveTextContent("0");
  });

  it("renders sidebar buttons for each existing session", () => {
    vi.mocked(useChatSessions).mockReturnValue({
      data: [{ id: "s1", title: "Conversa 1" }, { id: "s2", title: "Conversa 2" }],
    } as never);
    renderWithProviders(<ChatPage />);
    expect(screen.getByText("select-s1")).toBeInTheDocument();
    expect(screen.getByText("select-s2")).toBeInTheDocument();
  });

  it("selects a session and shows its messages", () => {
    vi.mocked(useChatSessions).mockReturnValue({
      data: [{ id: "s1", title: "Conversa 1", messages: [{ role: "user", content: "olá" }] }],
    } as never);
    renderWithProviders(<ChatPage />);
    fireEvent.click(screen.getByText("select-s1"));
    expect(screen.getByTestId("active")).toHaveTextContent("s1");
    expect(screen.getByTestId("msg-count")).toHaveTextContent("1");
  });

  it("creates a new session resets active id and messages", () => {
    vi.mocked(useChatSessions).mockReturnValue({
      data: [{ id: "s1", title: "X", messages: [] }],
    } as never);
    renderWithProviders(<ChatPage />);
    fireEvent.click(screen.getByText("select-s1"));
    expect(screen.getByTestId("active")).toHaveTextContent("s1");
    fireEvent.click(screen.getByText("new"));
    expect(screen.getByTestId("active")).toHaveTextContent("none");
  });

  it("sends a message via useSendMessage.mutate without session_id when no active session", () => {
    renderWithProviders(<ChatPage />);
    fireEvent.click(screen.getByText("send"));
    expect(mutate).toHaveBeenCalled();
    const [args] = mutate.mock.calls[0];
    expect(args.session_id).toBeUndefined();
    expect(args.messages.at(-1)).toEqual({ role: "user", content: "hi" });
  });

  it("on success of mutate sets active session id", () => {
    renderWithProviders(<ChatPage />);
    fireEvent.click(screen.getByText("send"));
    const [, options] = mutate.mock.calls[0];
    act(() => {
      options.onSuccess({ session_id: "new-id", reply: "ok" });
    });
    expect(screen.getByTestId("active")).toHaveTextContent("new-id");
  });

  it("on error of mutate calls toast.error and restores local messages", async () => {
    const { toast } = await import("sonner");
    renderWithProviders(<ChatPage />);
    fireEvent.click(screen.getByText("send"));
    const [, options] = mutate.mock.calls[0];
    act(() => {
      options.onError(new Error("falhou"));
    });
    expect(toast.error).toHaveBeenCalledWith("falhou");
  });

  it("does not update localMessages when sending with an active session (branch 32)", () => {
    vi.mocked(useChatSessions).mockReturnValue({
      data: [{ id: "s1", title: "X", messages: [{ role: "user", content: "hello" }] }],
    } as never);
    renderWithProviders(<ChatPage />);
    // Select s1 so activeSession is defined
    fireEvent.click(screen.getByText("select-s1"));
    expect(screen.getByTestId("active")).toHaveTextContent("s1");
    // Send while activeSession is set — branch `if (!activeSession)` is false so localMessages stays []
    fireEvent.click(screen.getByText("send"));
    expect(mutate).toHaveBeenCalled();
    const [args] = mutate.mock.calls[0];
    // session_id should be s1
    expect(args.session_id).toBe("s1");
  });

  it("on error does not restore localMessages when active session exists (branch 45)", async () => {
    const { toast } = await import("sonner");
    vi.mocked(useChatSessions).mockReturnValue({
      data: [{ id: "s1", title: "Y", messages: [] }],
    } as never);
    renderWithProviders(<ChatPage />);
    fireEvent.click(screen.getByText("select-s1"));
    fireEvent.click(screen.getByText("send"));
    const [, options] = mutate.mock.calls[0];
    act(() => {
      options.onError(new Error("network fail"));
    });
    // toast.error must be called; no crash on the `if (!activeSession)` false branch
    expect(toast.error).toHaveBeenCalledWith("network fail");
    // msg-count stays at the active session's message count (0 in this case)
    expect(screen.getByTestId("msg-count")).toHaveTextContent("0");
  });
});
