import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AdaptarPage from "./AdaptarPage";

vi.mock("@/components/adaptation/AdaptationWizard", () => ({
  default: () => <div data-testid="wizard-stub" />,
}));

describe("AdaptarPage", () => {
  it("renders the AdaptationWizard component", () => {
    render(<AdaptarPage />);
    expect(screen.getByTestId("wizard-stub")).toBeInTheDocument();
  });
});
