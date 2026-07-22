import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AuthLayout } from "./AuthLayout";

describe("AuthLayout", () => {
  it("renders the brand, the card title and description, and the children", () => {
    render(
      <AuthLayout title="Entrar" description="Acesse sua conta para continuar">
        <span>conteúdo do card</span>
      </AuthLayout>,
    );

    expect(screen.getByRole("heading", { name: "Olhar Singular" })).toBeInTheDocument();
    expect(screen.getByText("Adaptações inclusivas com IA")).toBeInTheDocument();
    expect(screen.getByText("Entrar")).toBeInTheDocument();
    expect(screen.getByText("Acesse sua conta para continuar")).toBeInTheDocument();
    expect(screen.getByText("conteúdo do card")).toBeInTheDocument();
    expect(screen.getByText(/não realiza diagnóstico/i)).toBeInTheDocument();
  });
});
