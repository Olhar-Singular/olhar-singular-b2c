import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import ChatWindow from "./ChatWindow";
import { MAX_CHAT_MESSAGE_CHARS } from "@/lib/domain/chatLimits";
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

  it("renders assistant Markdown as formatted HTML, not raw syntax", () => {
    const withMarkdown: ChatMessage[] = [
      { role: "assistant", content: "### Instruções\n\n**Linguagem direta:**" },
    ];
    render(<ChatWindow messages={withMarkdown} onSend={noop} isPending={false} />);
    expect(
      screen.getByRole("heading", { level: 3, name: "Instruções" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Linguagem direta:").tagName).toBe("STRONG");
    expect(screen.queryByText(/###/)).not.toBeInTheDocument();
  });

  it("keeps user message text literal (no Markdown parsing)", () => {
    const userMarkdown: ChatMessage[] = [
      { role: "user", content: "**não deve ficar negrito**" },
    ];
    render(<ChatWindow messages={userMarkdown} onSend={noop} isPending={false} />);
    expect(screen.getByText("**não deve ficar negrito**")).toBeInTheDocument();
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

  it("submits on Enter without shift", async () => {
    const onSend = vi.fn();
    render(<ChatWindow messages={[]} onSend={onSend} isPending={false} />);
    const input = screen.getByPlaceholderText(/mensagem/i);
    fireEvent.change(input, { target: { value: "via-enter" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("via-enter");
  });

  it("does not submit when Shift+Enter is pressed", () => {
    const onSend = vi.fn();
    render(<ChatWindow messages={[]} onSend={onSend} isPending={false} />);
    const input = screen.getByPlaceholderText(/mensagem/i);
    fireEvent.change(input, { target: { value: "linha 1" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not submit empty/whitespace-only messages", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<ChatWindow messages={[]} onSend={onSend} isPending={false} />);
    await user.type(screen.getByPlaceholderText(/mensagem/i), "   ");
    expect(screen.getByRole("button", { name: /enviar/i })).toBeDisabled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not submit while isPending even with content", async () => {
    const onSend = vi.fn();
    render(<ChatWindow messages={[]} onSend={onSend} isPending={true} />);
    const input = screen.getByPlaceholderText(/mensagem/i);
    fireEvent.change(input, { target: { value: "x" } });
    fireEvent.submit(input.closest("form")!);
    expect(onSend).not.toHaveBeenCalled();
  });

  it("renders the loader bubble while isPending and there are messages", () => {
    const { container } = render(
      <ChatWindow messages={messages} onSend={noop} isPending={true} />,
    );
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  // The chat edge function refuses a turn longer than MAX_CHAT_MESSAGE_CHARS
  // (400): the input stops the teacher before, instead of after the round trip.
  describe("limite de tamanho da mensagem", () => {
    it("caps the input at the length the server accepts", () => {
      render(<ChatWindow messages={[]} onSend={noop} isPending={false} />);
      expect(screen.getByPlaceholderText(/mensagem/i)).toHaveAttribute(
        "maxLength",
        String(MAX_CHAT_MESSAGE_CHARS),
      );
    });

    it("does not send a message over the limit that got past the cap", () => {
      // A programmatic value skips maxLength; submit must still refuse it.
      const onSend = vi.fn();
      render(<ChatWindow messages={[]} onSend={onSend} isPending={false} />);
      const input = screen.getByPlaceholderText(/mensagem/i);
      fireEvent.change(input, { target: { value: "a".repeat(MAX_CHAT_MESSAGE_CHARS + 1) } });
      expect(screen.getByRole("button", { name: /enviar/i })).toBeDisabled();
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onSend).not.toHaveBeenCalled();
    });

    it("sends a message exactly at the limit", () => {
      const onSend = vi.fn();
      render(<ChatWindow messages={[]} onSend={onSend} isPending={false} />);
      const input = screen.getByPlaceholderText(/mensagem/i);
      const atLimit = "a".repeat(MAX_CHAT_MESSAGE_CHARS);
      fireEvent.change(input, { target: { value: atLimit } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onSend).toHaveBeenCalledWith(atLimit);
    });

    it("shows a character counter tied to the input only when nearing the limit", () => {
      render(<ChatWindow messages={[]} onSend={noop} isPending={false} />);
      const input = screen.getByPlaceholderText(/mensagem/i);

      fireEvent.change(input, { target: { value: "curta" } });
      expect(screen.queryByText(`5/${MAX_CHAT_MESSAGE_CHARS}`)).not.toBeInTheDocument();
      expect(input).not.toHaveAttribute("aria-describedby");

      const near = MAX_CHAT_MESSAGE_CHARS - 100;
      fireEvent.change(input, { target: { value: "a".repeat(near) } });
      const counter = screen.getByText(`${near}/${MAX_CHAT_MESSAGE_CHARS}`);
      expect(input).toHaveAttribute("aria-describedby", counter.id);
    });
  });
});
