import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QuestionForm from "./QuestionForm";

const insertSpy = vi.fn();
const updateSpy = vi.fn();
const eqSpy = vi.fn();
const uploadSpy = vi.fn();
const getPublicUrlSpy = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((_t: string) => ({
      insert: (...args: unknown[]) => insertSpy(...args),
      update: (...args: unknown[]) => {
        updateSpy(...args);
        return { eq: (...e: unknown[]) => eqSpy(...e) };
      },
    })),
    storage: {
      from: vi.fn(() => ({
        upload: (...args: unknown[]) => uploadSpy(...args),
        getPublicUrl: (...args: unknown[]) => getPublicUrlSpy(...args),
      })),
    },
  },
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// Replace Radix Select with a plain native select so JSDOM can interact with it.
vi.mock("@/components/ui/select", () => {
  const Select = ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: React.ReactNode }) => (
    <div data-testid="select-root" data-value={value}>
      <select aria-label="select-mock" value={value} onChange={(e) => onValueChange(e.target.value)}>
        {children}
      </select>
    </div>
  );
  return {
    Select,
    SelectTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    SelectValue: () => null,
    SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => (
      <option value={value}>{children}</option>
    ),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  insertSpy.mockResolvedValue({ error: null });
  updateSpy.mockReturnValue(undefined);
  eqSpy.mockResolvedValue({ error: null });
  uploadSpy.mockResolvedValue({ error: null });
  getPublicUrlSpy.mockReturnValue({ data: { publicUrl: "https://uploaded.png" } });
});

describe("QuestionForm — render", () => {
  it("does not render when closed", () => {
    render(<QuestionForm open={false} onOpenChange={vi.fn()} question={null} onSaved={vi.fn()} />);
    expect(screen.queryByText(/Adicionar Questão|Editar Questão/)).toBeNull();
  });

  it("shows 'Adicionar Questão' header when no question prop", () => {
    render(<QuestionForm open onOpenChange={vi.fn()} question={null} onSaved={vi.fn()} />);
    expect(screen.getByText("Adicionar Questão")).toBeInTheDocument();
  });

  it("shows 'Editar Questão' and prefills when editing", () => {
    render(
      <QuestionForm
        open
        onOpenChange={vi.fn()}
        question={{ id: "q1", text: "Original", subject: "Física", topic: "Cinemática", difficulty: "dificil", resolution: "" }}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText("Editar Questão")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Original")).toBeInTheDocument();
  });

  it("prefills options when editing an objective question", () => {
    render(
      <QuestionForm
        open
        onOpenChange={vi.fn()}
        question={{ id: "q2", text: "Q", subject: "X", options: ["a", "b"], correct_answer: 1, difficulty: "medio" }}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue("a")).toBeInTheDocument();
    expect(screen.getByDisplayValue("b")).toBeInTheDocument();
  });
});

describe("QuestionForm — validation", () => {
  it("toasts error when text or subject is missing on save", async () => {
    const { toast } = await import("sonner");
    render(<QuestionForm open onOpenChange={vi.fn()} question={null} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Adicionar/ }));
    expect(toast.error).toHaveBeenCalled();
  });
});

describe("QuestionForm — save flow", () => {
  it("updates an existing question and calls onSaved + onOpenChange(false) on success", async () => {
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();
    render(
      <QuestionForm
        open
        onOpenChange={onOpenChange}
        question={{ id: "q1", text: "x", subject: "Física", difficulty: "medio" }}
        onSaved={onSaved}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Atualizar/ }));
    await waitFor(() => expect(eqSpy).toHaveBeenCalledWith("id", "q1"));
    expect(updateSpy).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSaved).toHaveBeenCalled();
  });

  it("inserts a new question (no id) with created_by set", async () => {
    const onSaved = vi.fn();
    render(
      <QuestionForm
        open
        onOpenChange={vi.fn()}
        question={null}
        onSaved={onSaved}
      />,
    );
    // Fill enunciado
    const textareas = screen.getAllByRole("textbox");
    fireEvent.change(textareas[0], { target: { value: "novo enunciado" } });
    // Pick subject via mocked native select
    const selects = screen.getAllByLabelText("select-mock") as HTMLSelectElement[];
    fireEvent.change(selects[0], { target: { value: "Física" } });
    // Click submit
    fireEvent.click(screen.getByRole("button", { name: /^Adicionar$/ }));
    await waitFor(() => expect(insertSpy).toHaveBeenCalled());
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ created_by: "u1", text: "novo enunciado" }));
    expect(onSaved).toHaveBeenCalled();
  });

  it("toasts error when update returns error", async () => {
    eqSpy.mockResolvedValue({ error: new Error("DB falhou") });
    const { toast } = await import("sonner");
    render(
      <QuestionForm
        open
        onOpenChange={vi.fn()}
        question={{ id: "q1", text: "x", subject: "Física", difficulty: "medio" }}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Atualizar/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Erro", expect.objectContaining({ description: "DB falhou" })));
  });
});

describe("QuestionForm — alternatives flow", () => {
  it("adds and edits alternatives in objetiva mode", async () => {
    const user = userEvent.setup();
    render(
      <QuestionForm
        open
        onOpenChange={vi.fn()}
        question={{ id: "q1", text: "x", subject: "Física", difficulty: "medio", options: ["A1"] }}
        onSaved={vi.fn()}
      />,
    );
    // Already in objetiva (options array provided). Add another alternative.
    await user.click(screen.getByRole("button", { name: /^Adicionar$/ }));
    const inputs = screen.getAllByPlaceholderText(/Alternativa/);
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it("marks an alternative as correct when its letter button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <QuestionForm
        open
        onOpenChange={vi.fn()}
        question={{ id: "q1", text: "x", subject: "Física", difficulty: "medio", options: ["A", "B"] }}
        onSaved={vi.fn()}
      />,
    );
    const allButtons = screen.getAllByRole("button");
    const letterB = allButtons.find((b) => b.textContent === "B");
    if (letterB) {
      await user.click(letterB);
      expect(letterB.textContent).toBe("✓");
    }
  });

  it("removes an alternative via the X button", async () => {
    const user = userEvent.setup();
    render(
      <QuestionForm
        open
        onOpenChange={vi.fn()}
        question={{ id: "q1", text: "x", subject: "Física", difficulty: "medio", options: ["A", "B", "C"] }}
        onSaved={vi.fn()}
      />,
    );
    const before = screen.getAllByPlaceholderText(/Alternativa/).length;
    const xButtons = screen.getAllByRole("button").filter((b) => b.querySelector("svg.lucide-x"));
    if (xButtons[0]) await user.click(xButtons[0]);
    const after = screen.getAllByPlaceholderText(/Alternativa/).length;
    expect(after).toBeLessThan(before);
  });
});

describe("QuestionForm — image flow", () => {
  it("renders Upload Imagem button when no image is attached", () => {
    render(
      <QuestionForm
        open
        onOpenChange={vi.fn()}
        question={{ id: "q1", text: "x", subject: "Física", difficulty: "medio" }}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Upload Imagem/i })).toBeInTheDocument();
  });

  it("renders Trocar/Remover buttons when an image is preloaded", () => {
    render(
      <QuestionForm
        open
        onOpenChange={vi.fn()}
        question={{ id: "q1", text: "x", subject: "Física", difficulty: "medio", image_url: "https://x.png" }}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Remover/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Trocar/i })).toBeInTheDocument();
  });
});
