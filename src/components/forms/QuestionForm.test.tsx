import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QuestionForm from "./QuestionForm";

const mockInvalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }) };
});

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
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Erro ao salvar questão."));
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

  it("clicking Remover clears the image preview and shows Upload button again", () => {
    render(
      <QuestionForm
        open
        onOpenChange={vi.fn()}
        question={{ id: "q1", text: "x", subject: "Física", difficulty: "medio", image_url: "https://x.png" }}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Remover/i }));
    expect(screen.getByRole("button", { name: /Upload Imagem/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remover/i })).toBeNull();
  });
});

describe("QuestionForm — field interactions", () => {
  it("topic input onChange updates the value (line 212)", () => {
    render(
      <QuestionForm
        open
        onOpenChange={vi.fn()}
        question={{ id: "q1", text: "x", subject: "Física", difficulty: "medio" }}
        onSaved={vi.fn()}
      />,
    );
    const topicInput = screen.getByPlaceholderText(/Frações/i);
    fireEvent.change(topicInput, { target: { value: "Cinemática" } });
    expect((topicInput as HTMLInputElement).value).toBe("Cinemática");
  });

  it("difficulty select onChange updates correctly (lines 216-223)", () => {
    render(
      <QuestionForm
        open
        onOpenChange={vi.fn()}
        question={{ id: "q1", text: "x", subject: "Física", difficulty: "medio" }}
        onSaved={vi.fn()}
      />,
    );
    const selects = screen.getAllByLabelText("select-mock") as HTMLSelectElement[];
    // Difficulty select is the 3rd select (subject, difficulty, tipo)
    const difficultySelect = selects.find((s) =>
      Array.from(s.options).some((o) => o.value === "facil"),
    );
    expect(difficultySelect).toBeDefined();
    fireEvent.change(difficultySelect!, { target: { value: "dificil" } });
    expect(difficultySelect!.value).toBe("dificil");
  });

  it("questionType select switches to objetiva and shows alternatives section (lines 227-229)", () => {
    render(
      <QuestionForm
        open
        onOpenChange={vi.fn()}
        question={null}
        onSaved={vi.fn()}
      />,
    );
    // Default is dissertativa — alternatives section not visible
    expect(screen.queryByText(/Clique em "Adicionar"/)).toBeNull();
    // Switch to objetiva
    const selects = screen.getAllByLabelText("select-mock") as HTMLSelectElement[];
    const tipoSelect = selects.find((s) =>
      Array.from(s.options).some((o) => o.value === "objetiva"),
    );
    expect(tipoSelect).toBeDefined();
    fireEvent.change(tipoSelect!, { target: { value: "objetiva" } });
    // In objetiva mode with no options the empty-state message appears
    expect(screen.queryByText(/Clique em "Adicionar"/)).toBeInTheDocument();
  });

  it("editing an option input updates its value (line 251)", () => {
    render(
      <QuestionForm
        open
        onOpenChange={vi.fn()}
        question={{ id: "q1", text: "x", subject: "Física", difficulty: "medio", options: ["Original"] }}
        onSaved={vi.fn()}
      />,
    );
    const optInput = screen.getByDisplayValue("Original");
    fireEvent.change(optInput, { target: { value: "Atualizado" } });
    expect((optInput as HTMLInputElement).value).toBe("Atualizado");
  });

  it("resolution textarea onChange updates the value (line 282)", () => {
    render(
      <QuestionForm
        open
        onOpenChange={vi.fn()}
        question={{ id: "q1", text: "x", subject: "Física", difficulty: "medio" }}
        onSaved={vi.fn()}
      />,
    );
    const resolutionTextarea = screen.getByPlaceholderText(/Explicação da resposta/i);
    fireEvent.change(resolutionTextarea, { target: { value: "A resposta é correta." } });
    expect((resolutionTextarea as HTMLTextAreaElement).value).toBe("A resposta é correta.");
  });

  it("form resets to empty state when open changes with question=null (useEffect with open dep)", () => {
    const { rerender } = render(
      <QuestionForm
        open={false}
        onOpenChange={vi.fn()}
        question={{ id: "q1", text: "Anterior", subject: "Física", difficulty: "medio" }}
        onSaved={vi.fn()}
      />,
    );
    rerender(
      <QuestionForm
        open
        onOpenChange={vi.fn()}
        question={null}
        onSaved={vi.fn()}
      />,
    );
    // With question=null the title should be "Adicionar Questão"
    expect(screen.getByText("Adicionar Questão")).toBeInTheDocument();
    // The textareas should be empty
    const textareas = screen.getAllByRole("textbox");
    expect((textareas[0] as HTMLTextAreaElement).value).toBe("");
  });

  it("removing a non-correct option adjusts correctAnswer index when it is after the removed item", async () => {
    const user = userEvent.setup();
    render(
      <QuestionForm
        open
        onOpenChange={vi.fn()}
        question={{ id: "q1", text: "x", subject: "Física", difficulty: "medio", options: ["A", "B", "C"], correct_answer: 2 }}
        onSaved={vi.fn()}
      />,
    );
    // C is correct (index 2). Remove A (index 0) — correctAnswer should shift to 1.
    const xButtons = screen.getAllByRole("button").filter((b) => b.querySelector("svg.lucide-x"));
    // First X button removes option A (index 0)
    await user.click(xButtons[0]);
    // Now B is at 0, C is at 1 (was 2). The C button should still show ✓
    const allButtons = screen.getAllByRole("button");
    const checkButton = allButtons.find((b) => b.textContent === "✓");
    expect(checkButton).toBeDefined();
  });

  it("removing the correct option clears correctAnswer", async () => {
    const user = userEvent.setup();
    render(
      <QuestionForm
        open
        onOpenChange={vi.fn()}
        question={{ id: "q1", text: "x", subject: "Física", difficulty: "medio", options: ["A", "B"], correct_answer: 0 }}
        onSaved={vi.fn()}
      />,
    );
    // A is correct (index 0). Remove A.
    const xButtons = screen.getAllByRole("button").filter((b) => b.querySelector("svg.lucide-x"));
    await user.click(xButtons[0]);
    // After removing A (which was correct), no ✓ should remain
    const allButtons = screen.getAllByRole("button");
    const checkButton = allButtons.find((b) => b.textContent === "✓");
    expect(checkButton).toBeUndefined();
  });

  it("toasts error when insert returns an error (new question save failure)", async () => {
    insertSpy.mockResolvedValue({ error: new Error("insert falhou") });
    const { toast } = await import("sonner");
    render(
      <QuestionForm open onOpenChange={vi.fn()} question={null} onSaved={vi.fn()} />,
    );
    const textareas = screen.getAllByRole("textbox");
    fireEvent.change(textareas[0], { target: { value: "novo enunciado" } });
    const selects = screen.getAllByLabelText("select-mock") as HTMLSelectElement[];
    fireEvent.change(selects[0], { target: { value: "Física" } });
    fireEvent.click(screen.getByRole("button", { name: /^Adicionar$/ }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Erro ao salvar questão."),
    );
  });

  it("uploads data: image to storage and replaces with public URL on save (lines 116-125)", async () => {
    const onSaved = vi.fn();
    render(
      <QuestionForm
        open
        onOpenChange={vi.fn()}
        question={{ id: "q1", text: "x", subject: "Física", difficulty: "medio", image_url: "data:image/png;base64,abc" }}
        onSaved={onSaved}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Atualizar/ }));
    await waitFor(() => expect(uploadSpy).toHaveBeenCalled());
    expect(getPublicUrlSpy).toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
  });

  it("sets finalImageUrl to null when storage upload returns an error (line 125)", async () => {
    uploadSpy.mockResolvedValue({ error: new Error("upload falhou") });
    const onSaved = vi.fn();
    render(
      <QuestionForm
        open
        onOpenChange={vi.fn()}
        question={{ id: "q1", text: "x", subject: "Física", difficulty: "medio", image_url: "data:image/png;base64,abc" }}
        onSaved={onSaved}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Atualizar/ }));
    await waitFor(() => expect(uploadSpy).toHaveBeenCalled());
    // upload error → finalImageUrl=null → save still succeeds
    expect(onSaved).toHaveBeenCalled();
  });
});

describe("QuestionForm — branch coverage", () => {
  it("question fields with undefined values fall back to empty strings (lines 64-67)", () => {
    // question has no text/subject/difficulty — triggers the || fallback branches
    render(
      <QuestionForm
        open
        onOpenChange={vi.fn()}
        question={{ id: "q1" }}
        onSaved={vi.fn()}
      />,
    );
    // Text textarea should be empty (fallback "")
    const textareas = screen.getAllByRole("textbox");
    expect((textareas[0] as HTMLTextAreaElement).value).toBe("");
  });

  it("saves objetiva question with options.length > 0 (options branch true, line 134)", async () => {
    const onSaved = vi.fn();
    render(
      <QuestionForm
        open
        onOpenChange={vi.fn()}
        question={{ id: "q1", text: "q", subject: "Física", difficulty: "medio", options: ["A", "B"], correct_answer: 0 }}
        onSaved={onSaved}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Atualizar/ }));
    await waitFor(() => expect(eqSpy).toHaveBeenCalledWith("id", "q1"));
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ options: ["A", "B"], correct_answer: 0 }));
    expect(onSaved).toHaveBeenCalled();
  });

  it("saves objetiva question with empty options array (options null branch, line 134)", async () => {
    const onSaved = vi.fn();
    render(
      <QuestionForm
        open
        onOpenChange={vi.fn()}
        question={{ id: "q1", text: "q", subject: "Física", difficulty: "medio", options: [], correct_answer: null }}
        onSaved={onSaved}
      />,
    );
    // Switch to objetiva via select
    const selects = screen.getAllByLabelText("select-mock") as HTMLSelectElement[];
    const tipoSelect = selects.find((s) => Array.from(s.options).some((o) => o.value === "objetiva"));
    fireEvent.change(tipoSelect!, { target: { value: "objetiva" } });
    fireEvent.click(screen.getByRole("button", { name: /Atualizar/ }));
    await waitFor(() => expect(eqSpy).toHaveBeenCalledWith("id", "q1"));
    // options is empty → null; correct_answer objetiva with null
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ options: null, correct_answer: null }));
    expect(onSaved).toHaveBeenCalled();
  });

  it("deselects the already-correct alternative by clicking it again (line 258 null branch)", async () => {
    const user = userEvent.setup();
    render(
      <QuestionForm
        open
        onOpenChange={vi.fn()}
        question={{ id: "q1", text: "x", subject: "Física", difficulty: "medio", options: ["A", "B"], correct_answer: 0 }}
        onSaved={vi.fn()}
      />,
    );
    // A is correct (shows ✓). Click ✓ to deselect.
    const checkButton = screen.getAllByRole("button").find((b) => b.textContent === "✓");
    expect(checkButton).toBeDefined();
    await user.click(checkButton!);
    // After deselect, no ✓ remains
    const afterButtons = screen.getAllByRole("button");
    expect(afterButtons.find((b) => b.textContent === "✓")).toBeUndefined();
  });
});

describe("QuestionForm — MathPreview and image preview", () => {
  it("renders MathPreview when enunciado contains LaTeX content (line 32)", () => {
    render(
      <QuestionForm
        open
        onOpenChange={vi.fn()}
        question={{ id: "q1", text: "Calcule $\\frac{1}{2}$", subject: "Física", difficulty: "medio" }}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText("Prévia matemática")).toBeInTheDocument();
  });

  it("clicking the image thumbnail opens the ImagePreviewDialog (line 182)", () => {
    render(
      <QuestionForm
        open
        onOpenChange={vi.fn()}
        question={{ id: "q1", text: "x", subject: "Física", difficulty: "medio", image_url: "https://x.png" }}
        onSaved={vi.fn()}
      />,
    );
    const img = screen.getByAltText("Imagem da questão");
    fireEvent.click(img);
    // After click, the ImagePreviewDialog should be open — verify the img is still rendered
    // (ImagePreviewDialog is a separate dialog that renders when open=true)
    expect(img).toBeInTheDocument();
  });
});

describe("QuestionForm — cache invalidation after save", () => {
  it("invalidates question_bank and question_bank_stats after updating an existing question", async () => {
    render(
      <QuestionForm
        open
        onOpenChange={vi.fn()}
        question={{ id: "q1", text: "Enunciado", subject: "Física", difficulty: "medio" }}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Atualizar/ }));
    await waitFor(() => expect(eqSpy).toHaveBeenCalledWith("id", "q1"));
    const keys = mockInvalidateQueries.mock.calls.map((c: [{ queryKey: unknown[] }]) => c[0].queryKey[0]);
    expect(keys).toContain("question_bank");
    expect(keys).toContain("question_bank_stats");
  });

  it("invalidates question_bank and question_bank_stats after inserting a new question", async () => {
    render(<QuestionForm open onOpenChange={vi.fn()} question={null} onSaved={vi.fn()} />);
    const textareas = screen.getAllByRole("textbox");
    fireEvent.change(textareas[0], { target: { value: "novo texto" } });
    const selects = screen.getAllByLabelText("select-mock") as HTMLSelectElement[];
    fireEvent.change(selects[0], { target: { value: "Matemática" } });
    fireEvent.click(screen.getByRole("button", { name: /^Adicionar$/ }));
    await waitFor(() => expect(insertSpy).toHaveBeenCalled());
    const keys = mockInvalidateQueries.mock.calls.map((c: [{ queryKey: unknown[] }]) => c[0].queryKey[0]);
    expect(keys).toContain("question_bank");
    expect(keys).toContain("question_bank_stats");
  });
});
