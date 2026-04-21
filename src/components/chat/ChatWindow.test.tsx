import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import ChatWindow from "./ChatWindow";
import type { ChatMessage } from "@/types/chat";

const messages: ChatMessage[] = [
  { role: "user", content: "Como adaptar para TDAH?" },
  { role: "assistant", content: "Algumas estratégias úteis são..." },
];

const noop = vi.fn();

describe("ChatWindow", () => {
  it("renders empty state when no messages", () => {
    render(<ChatWindow messages={[]} onSend={noop} isPending={false} />);
    expect(screen.getByPlaceholderText(/mensagem/i)).toBeInTheDocument();
  });

  it("renders user and assistant messages", () => {
    render(<ChatWindow messages={messages} onSend={noop} isPending={false} />);
    expect(screen.getByText("Como adaptar para TDAH?")).toBeInTheDocument();
    expect(screen.getByText("Algumas estratégias úteis são...")).toBeInTheDocument();
  });

  it("calls onSend with message text on submit", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<ChatWindow messages={[]} onSend={onSend} isPending={false} />);
    await user.type(screen.getByPlaceholderText(/mensagem/i), "minha pergunta");
    await user.click(screen.getByRole("button", { name: /enviar/i }));
    expect(onSend).toHaveBeenCalledWith("minha pergunta");
  });

  it("disables submit while isPending", () => {
    render(<ChatWindow messages={[]} onSend={noop} isPending={true} />);
    expect(screen.getByRole("button", { name: /enviar/i })).toBeDisabled();
  });

  it("clears input after submit", async () => {
    const user = userEvent.setup();
    render(<ChatWindow messages={[]} onSend={noop} isPending={false} />);
    const input = screen.getByPlaceholderText(/mensagem/i);
    await user.type(input, "texto");
    fireEvent.submit(input.closest("form")!);
    expect((input as HTMLTextAreaElement).value).toBe("");
  });
});
