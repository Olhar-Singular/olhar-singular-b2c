import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BarrierProfileForm } from "./BarrierProfileForm";

describe("BarrierProfileForm", () => {
  it("renders all barrier dimension headings", () => {
    render(<BarrierProfileForm onSubmit={vi.fn()} />);
    expect(screen.getByText(/TEA/)).toBeInTheDocument();
    expect(screen.getByText(/TDAH/)).toBeInTheDocument();
    expect(screen.getByText(/Dislexia/i)).toBeInTheDocument();
  });

  it("shows zero selected initially", () => {
    render(<BarrierProfileForm onSubmit={vi.fn()} />);
    expect(screen.queryByText(/selecionada\(s\)/i)).toBeNull();
  });

  it("shows the count badge when barriers are selected", () => {
    render(<BarrierProfileForm onSubmit={vi.fn()} />);
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    expect(screen.getByText(/1 selecionada/i)).toBeInTheDocument();
  });

  it("toggles barriers (click twice deselects)", () => {
    render(<BarrierProfileForm onSubmit={vi.fn()} />);
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[0]);
    expect(screen.queryByText(/selecionada\(s\)/i)).toBeNull();
  });

  it("shows zod validation error when submitting with no barriers", async () => {
    const onSubmit = vi.fn();
    render(<BarrierProfileForm onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: /Salvar perfil/i }));
    await waitFor(() => expect(screen.getByText(/pelo menos uma barreira/i)).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("links the name error to the input and announces it", async () => {
    render(<BarrierProfileForm onSubmit={vi.fn()} />);
    const input = screen.getByLabelText(/Nome do perfil/i);
    expect(input).not.toHaveAttribute("aria-invalid", "true");
    fireEvent.click(screen.getByRole("button", { name: /Salvar perfil/i }));
    const msg = await screen.findByText(/Nome do perfil é obrigatório/i);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/Nome do perfil é obrigatório/i);
    expect(msg).toHaveAttribute("role", "alert");
  });

  it("shows the barriers error right under the group heading, linked and announced", async () => {
    render(<BarrierProfileForm onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Nome do perfil/i), { target: { value: "Perfil" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar perfil/i }));
    const msg = await screen.findByText(/pelo menos uma barreira/i);
    expect(msg).toHaveAttribute("role", "alert");
    const group = screen.getByRole("group", { name: /Barreiras de aprendizagem/i });
    expect(group).toHaveAccessibleDescription(/pelo menos uma barreira/i);
    // Error must come before the first checkbox, not after the whole list.
    const firstCheckbox = screen.getAllByRole("checkbox")[0];
    expect(msg.compareDocumentPosition(firstCheckbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("submits with selected barriers when valid", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<BarrierProfileForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/Nome do perfil/i), { target: { value: "Meu Perfil" } });
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: /Salvar perfil/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].barriers.length).toBe(1);
  });

  it("seeds the form from defaultValues", () => {
    render(
      <BarrierProfileForm
        onSubmit={vi.fn()}
        defaultValues={{ barriers: ["tea_abstracao"], observation: "obs" }}
      />,
    );
    expect(screen.getByText(/1 selecionada/i)).toBeInTheDocument();
    expect((screen.getByLabelText(/Observações/) as HTMLTextAreaElement).value).toBe("obs");
  });

  it("converts empty observation to null on change", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <BarrierProfileForm
        onSubmit={onSubmit}
        defaultValues={{ name: "Perfil Teste", barriers: ["tea_abstracao"], observation: "x" }}
      />,
    );
    const ta = screen.getByLabelText(/Observações/);
    fireEvent.change(ta, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar perfil/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].observation).toBeNull();
  });

  it("disables submit button when isPending is true and shows label 'Salvando...'", () => {
    render(<BarrierProfileForm onSubmit={vi.fn()} isPending />);
    const btn = screen.getByRole("button", { name: /Salvando/i });
    expect(btn).toBeDisabled();
  });
});
