import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AdaptarPage from "./AdaptarPage";

vi.mock("@/components/adaptation/CanonicalAdaptationWizard", () => ({
  default: () => <div data-testid="wizard-stub" />,
}));

describe("AdaptarPage", () => {
  it("renders the CanonicalAdaptationWizard component", () => {
    render(<AdaptarPage />);
    expect(screen.getByTestId("wizard-stub")).toBeInTheDocument();
  });
});
