import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import CreditsSuccessPage from "./CreditsSuccessPage";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CreditsSuccessPage />
    </MemoryRouter>
  );
}

describe("CreditsSuccessPage", () => {
  it("confirms the payment when the card checkout returns", () => {
    renderAt("/creditos/sucesso");
    expect(screen.getByText(/pagamento confirmado/i)).toBeInTheDocument();
    expect(screen.getByText(/foram adicionados/i)).toBeInTheDocument();
  });

  // Pix credits only when the async webhook lands, which can trail the redirect —
  // promising an updated balance here would be a lie the user can see.
  it("tells Pix payers the balance updates after the payment clears", () => {
    renderAt("/creditos/sucesso?metodo=pix");
    expect(screen.getByText(/pagamento recebido/i)).toBeInTheDocument();
    expect(screen.getByText(/assim que o pix for compensado/i)).toBeInTheDocument();
    expect(screen.queryByText(/foram adicionados/i)).not.toBeInTheDocument();
  });
});
