import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CreditBalance } from "./CreditBalance";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({ profile: { credit_balance: 42 } })),
}));

describe("CreditBalance", () => {
  it("renders the credit balance", () => {
    render(<CreditBalance />);
    expect(screen.getByText(/42/)).toBeInTheDocument();
  });

  it("renders a fallback when profile is null", async () => {
    const { useAuth } = await import("@/hooks/useAuth");
    vi.mocked(useAuth).mockReturnValue({ profile: null } as never);
    render(<CreditBalance />);
    expect(screen.getByText(/—/)).toBeInTheDocument();
  });
});
