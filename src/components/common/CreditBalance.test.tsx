import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreditBalance } from "./CreditBalance";
import { buildAuthState } from "@/test/helpers";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "@/hooks/useAuth";

function mockProfile(profile: Record<string, unknown> | null) {
  vi.mocked(useAuth).mockReturnValue(
    buildAuthState({ profile: profile as never }) as never,
  );
}

describe("CreditBalance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the credit balance from profile", () => {
    mockProfile({ credit_balance: 42 });
    render(<CreditBalance />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders fallback dash when profile is null", () => {
    mockProfile(null);
    render(<CreditBalance />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders fallback dash when credit_balance is undefined", () => {
    mockProfile({});
    render(<CreditBalance />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders zero balance distinctly from fallback", () => {
    mockProfile({ credit_balance: 0 });
    render(<CreditBalance />);
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("forwards className to the badge wrapper", () => {
    mockProfile({ credit_balance: 5 });
    const { container } = render(<CreditBalance className="custom-class" />);
    const badge = container.querySelector(".custom-class");
    expect(badge).not.toBeNull();
    expect(badge).toHaveTextContent("5");
  });
});
