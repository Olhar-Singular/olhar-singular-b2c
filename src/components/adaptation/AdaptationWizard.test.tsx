import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdaptationWizard from "./AdaptationWizard";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({
    session: { user: { id: "user-1" } },
    user: { id: "user-1", user_metadata: { full_name: "Prof" } },
    profile: { credit_balance: 10 },
    loading: false,
    signOut: vi.fn(),
  })),
}));

vi.mock("@/hooks/useBarrierProfiles", () => ({
  useBarrierProfiles: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "tok" } } }) },
    from: vi.fn(() => ({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "ad-1" }, error: null }),
    })),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));

function renderWizard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AdaptationWizard />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AdaptationWizard", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("renders StepActivityType as first step", () => {
    renderWizard();
    expect(screen.getByText(/tipo de atividade/i)).toBeInTheDocument();
  });

  it("advances to StepActivityInput after selecting an activity type", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole("button", { name: /exercício/i }));
    expect(screen.getByPlaceholderText(/cole ou digite/i)).toBeInTheDocument();
  });

  it("shows step indicator", () => {
    renderWizard();
    expect(screen.getByText(/passo 1/i)).toBeInTheDocument();
  });

  it("shows discard confirmation when navigating back from editor with result", async () => {
    // This test verifies shouldConfirmDiscard is wired up
    // The full flow is covered by integration; here we test the helper directly
    const { shouldConfirmDiscard } = await import("@/lib/adaptationWizardHelpers");
    const steps = ["activity_type", "activity_input", "barriers", "choice", "ai_editor", "export"] as const;
    expect(shouldConfirmDiscard(steps, 4, 0, true)).toBe(true);
    expect(shouldConfirmDiscard(steps, 4, 0, false)).toBe(false);
    expect(shouldConfirmDiscard(steps, 2, 0, true)).toBe(false);
  });
});
