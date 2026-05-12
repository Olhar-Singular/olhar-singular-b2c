import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import QuestionRegeneratePanel from "./QuestionRegeneratePanel";
import type { AdaptationResult } from "@/lib/domain/adaptationWizardHelpers";
import type { BarrierItem } from "@/lib/domain/adaptationWizardHelpers";

const mutateMock = vi.fn();
let isPendingFor: number | null = null;

vi.mock("@/hooks/useRegenerateQuestion", () => ({
  useRegenerateQuestion: () => ({
    mutate: mutateMock,
    isPending: false,
  }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function makeResult(numQuestions = 2): AdaptationResult {
  const makeSection = (n: number) => ({
    title: undefined,
    introduction: undefined,
    questions: Array.from({ length: n }, (_, i) => ({
      number: i + 1,
      type: "open_ended" as const,
      statement: `Questão ${i + 1} statement text here`,
      answerLines: 3,
    })),
  });

  return {
    version_universal: { sections: [makeSection(numQuestions)] },
    version_directed: { sections: [makeSection(numQuestions)] },
    strategies_applied: [],
    pedagogical_justification: "",
    implementation_tips: [],
  };
}

const barriers: BarrierItem[] = [
  { dimension: "d1", barrier_key: "b1", label: "Barrier 1", is_active: true },
];

const defaultProps = {
  result: makeResult(2),
  versionType: "universal" as const,
  activityType: "prova",
  barriers,
  currentDsl: "1) Questão 1 original\n[linhas:3]\n\n2) Questão 2 original\n[linhas:3]",
  onDslUpdate: vi.fn(),
  onCreditRefresh: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  isPendingFor = null;
});

describe("QuestionRegeneratePanel", () => {
  it("renders a 'Regerar' button for each question", () => {
    render(<QuestionRegeneratePanel {...defaultProps} />);
    const buttons = screen.getAllByRole("button", { name: /Regerar Q\d+/i });
    expect(buttons).toHaveLength(2);
  });

  it("shows truncated question statement", () => {
    render(<QuestionRegeneratePanel {...defaultProps} />);
    expect(screen.getByText(/Questão 1 statement/)).toBeInTheDocument();
    expect(screen.getByText(/Questão 2 statement/)).toBeInTheDocument();
  });

  it("calls mutate with correct args when Regerar is clicked", () => {
    render(<QuestionRegeneratePanel {...defaultProps} />);
    const buttons = screen.getAllByRole("button", { name: /Regerar Q1/i });
    fireEvent.click(buttons[0]);

    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        version_type: "universal",
        activity_type: "prova",
        question: expect.objectContaining({ number: 1 }),
        barriers: expect.any(Array),
      }),
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );
  });

  it("calls onDslUpdate and onCreditRefresh on success", async () => {
    const onDslUpdate = vi.fn();
    const onCreditRefresh = vi.fn();
    render(
      <QuestionRegeneratePanel
        {...defaultProps}
        onDslUpdate={onDslUpdate}
        onCreditRefresh={onCreditRefresh}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Regerar Q1/i })[0]);

    const [, { onSuccess }] = mutateMock.mock.calls[0];
    onSuccess({ question_dsl: "1) Nova questão regenerada\n[linhas:3]", changes_made: ["Simplificou"] });

    await waitFor(() => expect(onDslUpdate).toHaveBeenCalled());
    expect(onCreditRefresh).toHaveBeenCalled();
  });

  it("shows credit error toast on 402 error", async () => {
    const { toast } = await import("sonner");
    render(<QuestionRegeneratePanel {...defaultProps} />);

    fireEvent.click(screen.getAllByRole("button", { name: /Regerar Q1/i })[0]);

    const [, { onError }] = mutateMock.mock.calls[0];
    onError(new Error("Créditos insuficientes. Adquira mais créditos para continuar."));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/Créditos insuficientes/i)
      )
    );
  });

  it("shows generic error toast on other errors", async () => {
    const { toast } = await import("sonner");
    render(<QuestionRegeneratePanel {...defaultProps} />);

    fireEvent.click(screen.getAllByRole("button", { name: /Regerar Q1/i })[0]);

    const [, { onError }] = mutateMock.mock.calls[0];
    onError(new Error("Erro de rede"));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Erro de rede")
    );
  });

  it("renders nothing when result has no questions", () => {
    const result = makeResult(0);
    render(<QuestionRegeneratePanel {...defaultProps} result={result} />);
    expect(screen.queryByRole("button", { name: /Regerar/i })).toBeNull();
  });

  it("passes only active barriers to mutate", () => {
    const barriersWithInactive: BarrierItem[] = [
      { dimension: "d1", barrier_key: "b1", label: "Active", is_active: true },
      { dimension: "d2", barrier_key: "b2", label: "Inactive", is_active: false },
    ];
    render(<QuestionRegeneratePanel {...defaultProps} barriers={barriersWithInactive} />);

    fireEvent.click(screen.getAllByRole("button", { name: /Regerar Q1/i })[0]);

    const [{ barriers: passedBarriers }] = mutateMock.mock.calls[0];
    expect(passedBarriers).toHaveLength(1);
    expect(passedBarriers[0].barrier_key).toBe("b1");
  });
});
