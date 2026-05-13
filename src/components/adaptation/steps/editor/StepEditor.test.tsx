import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StepEditor } from "./StepEditor";
import type { WizardData } from "@/lib/domain/adaptationWizardHelpers";

vi.mock("@/components/editor/ActivityEditor", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <div>
      <textarea data-testid="editor-textarea" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  ),
}));

const baseData: WizardData = {
  activityType: "exercício",
  activityText: "1) Pergunta inicial?",
  barriers: [],
  barrierProfileId: null,
  result: null,
  wizardMode: "manual",
};

describe("StepEditor", () => {
  it("renders the heading and editor", () => {
    render(
      <StepEditor data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    );
    expect(screen.getByRole("heading", { name: /Editar Atividade/i })).toBeInTheDocument();
    expect(screen.getByTestId("editor-textarea")).toBeInTheDocument();
  });

  it("seeds editor from data.activityText when no result is present", () => {
    render(<StepEditor data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    expect(screen.getByTestId("editor-textarea")).toHaveValue("1) Pergunta inicial?");
  });

  it("seeds editor from result.version_universal when present", () => {
    const data: WizardData = {
      ...baseData,
      result: {
        version_universal: { sections: [{ title: "Seç", questions: [{ number: 1, type: "open_ended", statement: "Q1" }] }] },
        version_directed: { sections: [] },
        strategies_applied: [],
        pedagogical_justification: "",
        implementation_tips: [],
      },
    };
    render(<StepEditor data={data} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    const ta = screen.getByTestId("editor-textarea") as HTMLTextAreaElement;
    expect(ta.value).toContain("Seç");
  });

  it("calls onPrev when Voltar is clicked", () => {
    const onPrev = vi.fn();
    render(<StepEditor data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={onPrev} />);
    fireEvent.click(screen.getByRole("button", { name: /Voltar/i }));
    expect(onPrev).toHaveBeenCalled();
  });

  it("on Avançar: parses DSL into structured result and calls onNext", () => {
    const onNext = vi.fn();
    const updateData = vi.fn();
    render(<StepEditor data={baseData} updateData={updateData} onNext={onNext} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Avançar/i }));
    expect(onNext).toHaveBeenCalled();
    const lastCall = updateData.mock.calls.at(-1)?.[0];
    expect(lastCall.result).toBeDefined();
    expect(lastCall.result.version_universal).toBeDefined();
    expect(lastCall.result.version_directed).toBeDefined();
  });

  it("propagates editor onChange to wizard data via editorContentManual", () => {
    const updateData = vi.fn();
    render(<StepEditor data={baseData} updateData={updateData} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.change(screen.getByTestId("editor-textarea"), { target: { value: "2) Nova" } });
    const calls = updateData.mock.calls.map(([arg]) => arg);
    expect(calls.some((c) => c.editorContentManual !== undefined)).toBe(true);
  });

  it("seeds editor with empty string when activityText is empty and no result (line 22 falsy branch)", () => {
    const emptyData: WizardData = { ...baseData, activityText: "", result: null };
    render(<StepEditor data={emptyData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    expect(screen.getByTestId("editor-textarea")).toHaveValue("");
  });
});
