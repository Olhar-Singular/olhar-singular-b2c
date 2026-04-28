import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StepActivityInput } from "./StepActivityInput";
import type { WizardData } from "@/lib/domain/adaptationWizardHelpers";

const baseData: WizardData = {
  activityType: "exercício",
  activityText: "",
  barriers: [],
  barrierProfileId: null,
  result: null,
  wizardMode: "ai",
};

describe("StepActivityInput", () => {
  it("renders heading and textarea", () => {
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /Atividade original/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Conteúdo da atividade/i)).toBeInTheDocument();
  });

  it("blocks Next when textarea is empty and shows an alert", () => {
    const onNext = vi.fn();
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={onNext} onPrev={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    expect(onNext).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/Digite ou cole/i);
  });

  it("calls onNext when textarea has content", () => {
    const onNext = vi.fn();
    render(
      <StepActivityInput
        data={{ ...baseData, activityText: "1) Q?" }}
        updateData={vi.fn()}
        onNext={onNext}
        onPrev={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    expect(onNext).toHaveBeenCalled();
  });

  it("clears the alert after a successful next", () => {
    const updateData = vi.fn();
    const onNext = vi.fn();
    const { rerender } = render(
      <StepActivityInput data={baseData} updateData={updateData} onNext={onNext} onPrev={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    rerender(
      <StepActivityInput
        data={{ ...baseData, activityText: "1) Q?" }}
        updateData={updateData}
        onNext={onNext}
        onPrev={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("forwards textarea typing to updateData", () => {
    const updateData = vi.fn();
    render(<StepActivityInput data={baseData} updateData={updateData} onNext={vi.fn()} onPrev={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Conteúdo da atividade/i), { target: { value: "novo texto" } });
    expect(updateData).toHaveBeenCalledWith({ activityText: "novo texto" });
  });

  it("Voltar button triggers onPrev", () => {
    const onPrev = vi.fn();
    render(<StepActivityInput data={baseData} updateData={vi.fn()} onNext={vi.fn()} onPrev={onPrev} />);
    fireEvent.click(screen.getByRole("button", { name: /Voltar/i }));
    expect(onPrev).toHaveBeenCalled();
  });
});
