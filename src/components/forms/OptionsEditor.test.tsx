import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import OptionsEditor from "./OptionsEditor";

describe("OptionsEditor", () => {
  it("shows the empty-state hint and no inputs when there are no options", () => {
    render(<OptionsEditor options={[]} correctAnswer={null} onChange={vi.fn()} />);
    expect(screen.getByText(/Clique em "Adicionar"/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Alternativa/i)).toBeNull();
  });

  it("renders one input per option", () => {
    render(<OptionsEditor options={["a", "b", "c"]} correctAnswer={null} onChange={vi.fn()} />);
    expect(screen.getAllByPlaceholderText(/Alternativa/i)).toHaveLength(3);
  });

  it("Adicionar appends an empty option", () => {
    const onChange = vi.fn();
    render(<OptionsEditor options={["a"]} correctAnswer={0} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /^Adicionar$/ }));
    expect(onChange).toHaveBeenCalledWith(["a", ""], 0);
  });

  it("editing an input emits the updated option list", () => {
    const onChange = vi.fn();
    render(<OptionsEditor options={["a", "b"]} correctAnswer={null} onChange={onChange} />);
    fireEvent.change(screen.getAllByPlaceholderText(/Alternativa/i)[1], { target: { value: "novo" } });
    expect(onChange).toHaveBeenCalledWith(["a", "novo"], null);
  });

  it("clicking a letter button marks that option as correct", () => {
    const onChange = vi.fn();
    render(<OptionsEditor options={["a", "b"]} correctAnswer={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /alternativa B como correta/i }));
    expect(onChange).toHaveBeenCalledWith(["a", "b"], 1);
  });

  it("clicking the already-correct letter button toggles it off", () => {
    const onChange = vi.fn();
    render(<OptionsEditor options={["a", "b"]} correctAnswer={1} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /alternativa B como correta/i }));
    expect(onChange).toHaveBeenCalledWith(["a", "b"], null);
  });

  it("shows ✓ on the correct option button", () => {
    render(<OptionsEditor options={["a", "b"]} correctAnswer={1} onChange={vi.fn()} />);
    const correctBtn = screen.getByRole("button", { name: /alternativa B como correta/i });
    expect(correctBtn.textContent).toBe("✓");
  });

  it("removing an option emits the filtered list", () => {
    const onChange = vi.fn();
    render(<OptionsEditor options={["a", "b", "c"]} correctAnswer={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /remover alternativa A/i }));
    expect(onChange).toHaveBeenCalledWith(["b", "c"], null);
  });

  it("removing the correct option clears correctAnswer", () => {
    const onChange = vi.fn();
    render(<OptionsEditor options={["a", "b"]} correctAnswer={0} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /remover alternativa A/i }));
    expect(onChange).toHaveBeenCalledWith(["b"], null);
  });

  it("removing an option before the correct index decrements correctAnswer", () => {
    const onChange = vi.fn();
    render(<OptionsEditor options={["a", "b", "c"]} correctAnswer={2} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /remover alternativa A/i }));
    expect(onChange).toHaveBeenCalledWith(["b", "c"], 1);
  });

  it("removing an option after the correct index keeps correctAnswer", () => {
    const onChange = vi.fn();
    render(<OptionsEditor options={["a", "b", "c"]} correctAnswer={0} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /remover alternativa C/i }));
    expect(onChange).toHaveBeenCalledWith(["a", "b"], 0);
  });
});
