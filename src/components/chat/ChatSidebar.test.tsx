import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import ChatSidebar from "./ChatSidebar";
import type { ChatSession } from "@/types/chat";

const sessions: ChatSession[] = [
  { id: "s1", user_id: "u1", title: "Estratégias para TEA", messages: [], created_at: "2026-01-02T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" },
  { id: "s2", user_id: "u1", title: "Adaptar prova de math", messages: [], created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
];

describe("ChatSidebar", () => {
  it("renders session titles", () => {
    render(<ChatSidebar sessions={sessions} activeSessionId={null} onSelectSession={vi.fn()} onNewSession={vi.fn()} />);
    expect(screen.getByText("Estratégias para TEA")).toBeInTheDocument();
    expect(screen.getByText("Adaptar prova de math")).toBeInTheDocument();
  });

  it("click on session calls onSelectSession with its id", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ChatSidebar sessions={sessions} activeSessionId={null} onSelectSession={onSelect} onNewSession={vi.fn()} />);
    await user.click(screen.getByText("Estratégias para TEA"));
    expect(onSelect).toHaveBeenCalledWith("s1");
  });

  it("shows Nova conversa button", () => {
    render(<ChatSidebar sessions={[]} activeSessionId={null} onSelectSession={vi.fn()} onNewSession={vi.fn()} />);
    expect(screen.getByRole("button", { name: /nova conversa/i })).toBeInTheDocument();
  });

  it("shows session count badge", () => {
    render(<ChatSidebar sessions={sessions} activeSessionId={null} onSelectSession={vi.fn()} onNewSession={vi.fn()} />);
    expect(screen.getByText("2/10")).toBeInTheDocument();
  });

  it("highlights active session", () => {
    render(<ChatSidebar sessions={sessions} activeSessionId="s1" onSelectSession={vi.fn()} onNewSession={vi.fn()} />);
    const item = screen.getByText("Estratégias para TEA").closest("button");
    expect(item?.className).toMatch(/primary|active|bg-/);
  });
});
