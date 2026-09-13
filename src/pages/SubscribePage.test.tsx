import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, buildAuthState } from "@/test/helpers";
import SubscribePage from "./SubscribePage";
import { pickInitialPlan, replacementNotice } from "@/lib/domain/subscriptionUi";
import type { Access } from "@/lib/domain/access";

const { mockSubscribe, brickProps, mockUsePlans, mockUseSubscription, mockVerifyOtp, mockSignInWithOtp, navigateSpy } = vi.hoisted(() => ({
  mockSubscribe: vi.fn(),
  brickProps: vi.fn(),
  mockUsePlans: vi.fn(),
  mockUseSubscription: vi.fn(),
  mockVerifyOtp: vi.fn(),
  mockSignInWithOtp: vi.fn(),
  navigateSpy: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { verifyOtp: mockVerifyOtp, signInWithOtp: mockSignInWithOtp } },
}));

vi.mock("react-router-dom", async (orig) => {
  const actual = await orig<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateSpy };
});

const CARD = { token: "tok_1", payment_method_id: "master" };

vi.mock("@/components/payments/MpCardBrick", () => ({
  default: (props: { amount: number; payerEmail?: string; onSubmit: (c: unknown) => Promise<void>; onError?: (m: string) => void }) => {
    brickProps(props);
    return (
      <div data-testid="card-brick">
        <button type="button" onClick={() => props.onSubmit(CARD).then(() => brickProps("resolved"), () => brickProps("rejected"))}>Assinar agora</button>
        <button type="button" onClick={() => props.onError?.("brick quebrou")}>Erro do Brick</button>
      </div>
    );
  },
}));

vi.mock("@/hooks/useSubscription", async (orig) => {
  const actual = await orig<typeof import("@/hooks/useSubscription")>();
  return {
    ...actual,
    usePlans: mockUsePlans,
    useSubscription: mockUseSubscription,
    useSubscribe: () => ({ mutateAsync: mockSubscribe, isPending: false }),
  };
});

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const BASIC = { id: "pl-basic", slug: "basico", name: "Básico", priceBrl: 19.9, monthlyCredits: 60, highlight: false, adminOnly: false };
const PRO = { id: "pl-pro", slug: "profissional", name: "Profissional", priceBrl: 59.9, monthlyCredits: 240, highlight: true, adminOnly: false };
const ADV = { id: "pl-adv", slug: "avancado", name: "Avançado", priceBrl: 99.9, monthlyCredits: 500, highlight: false, adminOnly: false };
const PLANS = [BASIC, PRO, ADV];

const LEGACY = { access_kind: "legacy", plan_credits: 0, plan_period_end: null, credit_balance: 3, trial_started_at: null, must_set_password: false };
const TRIAL = { ...LEGACY, access_kind: "trial", plan_credits: 42, plan_period_end: "2099-01-05T00:00:00Z", trial_started_at: "2098-12-29T00:00:00Z" };

async function setProfile(profile: Record<string, unknown> | null) {
  const auth = await import("@/hooks/useAuth");
  vi.mocked(auth.useAuth).mockReturnValue(
    buildAuthState({ session: { access_token: "t" }, user: { id: "u1", email: "a@b.c" }, profile }) as never,
  );
}

async function setAnonymous() {
  const auth = await import("@/hooks/useAuth");
  vi.mocked(auth.useAuth).mockReturnValue(buildAuthState({ session: null, user: null, profile: null }) as never);
}

async function fillAccount(user: ReturnType<typeof userEvent.setup>, email = "nova@example.com") {
  await user.type(screen.getByLabelText("Nome completo"), "Nova Pessoa");
  await user.type(screen.getByLabelText("E-mail"), email);
  await user.type(screen.getByLabelText("Confirme o e-mail"), email);
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: /Continuar para o pagamento/ }));
}

function renderPage(route = "/assinar") {
  return renderWithProviders(<SubscribePage />, { route });
}

describe("pickInitialPlan", () => {
  it("prefers the requested slug, then the highlighted plan, then the first", () => {
    expect(pickInitialPlan(PLANS, "basico")).toBe(BASIC);
    expect(pickInitialPlan(PLANS, "nope")).toBe(PRO);
    expect(pickInitialPlan(PLANS, null)).toBe(PRO);
    expect(pickInitialPlan([BASIC, ADV], null)).toBe(BASIC);
    expect(pickInitialPlan([], "basico")).toBeNull();
  });
});

describe("replacementNotice", () => {
  const base: Access = {
    kind: "trial", planCredits: 42, extraCredits: 0, total: 42, unlimited: false, paywalled: false,
    periodEnd: new Date("2099-01-05T00:00:00Z"), daysLeft: 7, trialExpired: false, mustSetPassword: false,
  };

  it("warns a trial or a subscriber that the plan bucket is replaced, never summed", () => {
    expect(replacementNotice(base)).toMatch(/42 créditos do período de teste até 05\/01\/2099.*substituídos/);
    expect(replacementNotice({ ...base, kind: "subscriber", planCredits: 1 })).toMatch(/1 crédito do plano atual/);
  });

  it("is silent without plan credits or a period", () => {
    expect(replacementNotice(null)).toBeNull();
    expect(replacementNotice({ ...base, planCredits: 0 })).toBeNull();
    expect(replacementNotice({ ...base, periodEnd: null })).toBeNull();
  });
});

describe("SubscribePage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    window.dataLayer = [];
    window.sessionStorage.clear();
    mockUsePlans.mockReturnValue({ data: PLANS, isLoading: false });
    mockUseSubscription.mockReturnValue({ data: null });
    mockSubscribe.mockResolvedValue({ status: "authorized", subscriptionId: "sub-1" });
    await setProfile(LEGACY);
  });

  it("pre-selects Profissional and shows the Brick with its price", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Assinar um plano" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Profissional/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Pagar R\$\s*59,90 por mês/)).toBeInTheDocument();
    expect(brickProps).toHaveBeenCalledWith(expect.objectContaining({ amount: 59.9, payerEmail: "a@b.c" }));
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("sends the stored attribution with the checkout", async () => {
    const user = userEvent.setup();
    window.sessionStorage.setItem("olhar:attribution", JSON.stringify({ utm_source: "meta" }));
    renderPage();
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));
    expect(mockSubscribe).toHaveBeenCalledWith(expect.objectContaining({ attribution: { utm_source: "meta" } }));
    window.sessionStorage.clear();
  });

  it("honours ?plano= and lets the user switch plans", async () => {
    const user = userEvent.setup();
    renderPage("/assinar?plano=basico");
    expect(screen.getByRole("button", { name: /Básico/ })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: /Avançado/ }));
    expect(screen.getByRole("button", { name: /Avançado/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Pagar R\$\s*99,90 por mês/)).toBeInTheDocument();
    expect(brickProps).toHaveBeenLastCalledWith(expect.objectContaining({ amount: 99.9 }));
  });

  it("warns a trial that its credits are replaced", async () => {
    await setProfile(TRIAL);
    renderPage();
    expect(screen.getByRole("note")).toHaveTextContent(/42 créditos do período de teste.*substituídos/);
  });

  it("subscribes with the selected plan and celebrates an authorized answer", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));
    expect(mockSubscribe).toHaveBeenCalledWith({ planSlug: "profissional", card: CARD });
    expect(window.dataLayer?.map((e) => (e as { event: string }).event)).toEqual(
      expect.arrayContaining(["begin_checkout", "add_payment_info", "subscription_started"]),
    );
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Assinatura ativa! 240 créditos/));
    expect(screen.getByRole("link", { name: /Começar a adaptar/ })).toHaveAttribute("href", "/adaptar");
    expect(screen.queryByTestId("card-brick")).toBeNull();
  });

  it("shows the analysis state on pending", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue({ status: "pending", subscriptionId: "sub-1" });
    renderPage();
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/em análise/));
    expect(screen.getByRole("link", { name: "Ver créditos" })).toHaveAttribute("href", "/creditos");
  });

  it("shows the refusal and offers a fresh Brick on retry", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue({ status: "rejected", subscriptionId: "sub-1", message: "Recusado pelo banco." });
    renderPage();
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Recusado pelo banco."));

    await user.click(screen.getByRole("button", { name: "Tentar com outro cartão" }));
    expect(screen.getByTestId("card-brick")).toBeInTheDocument();
  });

  it("falls back to the generic refusal message", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue({ status: "rejected", subscriptionId: "sub-1" });
    renderPage();
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/não foi aceito para a assinatura/));
  });

  it("stays on the form and rejects the Brick promise on a business refusal (already toasted)", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockRejectedValue(new Error("Você já tem uma assinatura ativa."));
    renderPage();
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));
    await waitFor(() => expect(brickProps).toHaveBeenCalledWith("rejected"));
    expect(screen.getByTestId("card-brick")).toBeInTheDocument();
  });

  it("resolves the Brick promise once the backend answered", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));
    await waitFor(() => expect(brickProps).toHaveBeenCalledWith("resolved"));
  });

  it("surfaces Brick errors above the form", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Erro do Brick" }));
    expect(screen.getByRole("alert")).toHaveTextContent("brick quebrou");
  });

  it("shows skeletons while plans load and an empty state when there are none", () => {
    mockUsePlans.mockReturnValue({ data: undefined, isLoading: true });
    const { unmount } = renderPage();
    expect(screen.getByTestId("plans-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("card-brick")).toBeNull();
    unmount();

    mockUsePlans.mockReturnValue({ data: [], isLoading: false });
    renderPage();
    expect(screen.getByText(/Nenhum plano disponível/)).toBeInTheDocument();
  });

  it("marks the admin-only smoke plan", () => {
    mockUsePlans.mockReturnValue({ data: [...PLANS, { ...BASIC, id: "pl-test", slug: "teste-admin", name: "Teste", priceBrl: 1, monthlyCredits: 1, adminOnly: true }], isLoading: false });
    renderPage();
    expect(screen.getByText("Só admins")).toBeInTheDocument();
  });

  it("tells a courtesy account there is nothing to subscribe to", async () => {
    await setProfile({ ...LEGACY, access_kind: "exempt" });
    renderPage();
    expect(screen.getByText(/Sua conta tem cortesia/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver créditos" })).toHaveAttribute("href", "/creditos");
    expect(screen.queryByTestId("card-brick")).toBeNull();
  });

  it("points an existing subscriber to the credits page", () => {
    mockUseSubscription.mockReturnValue({ data: { id: "sub-1", status: "authorized" } });
    renderPage();
    expect(screen.getByText(/Você já tem uma assinatura ativa/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver minha assinatura" })).toHaveAttribute("href", "/creditos");
  });

  it("keeps the success screen even after the subscription query catches up", async () => {
    const user = userEvent.setup();
    const { rerender } = renderPage();
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Assinatura ativa/));

    mockUseSubscription.mockReturnValue({ data: { id: "sub-1", status: "authorized" } });
    rerender(<SubscribePage />);
    expect(screen.getByRole("status")).toHaveTextContent(/Assinatura ativa/);
  });

  it("renders the form without a payer e-mail when the user has none", async () => {
    const auth = await import("@/hooks/useAuth");
    vi.mocked(auth.useAuth).mockReturnValue(buildAuthState({ session: { access_token: "t" }, user: { id: "u1" }, profile: LEGACY }) as never);
    renderPage();
    expect(brickProps).toHaveBeenCalledWith(expect.objectContaining({ payerEmail: undefined }));
  });
});

describe("SubscribePage (anonymous funnel)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockUsePlans.mockReturnValue({ data: PLANS, isLoading: false });
    mockUseSubscription.mockReturnValue({ data: undefined });
    mockVerifyOtp.mockResolvedValue({ error: null });
    mockSignInWithOtp.mockResolvedValue({ error: null });
    await setAnonymous();
  });

  it("asks who is buying before showing the card, then mounts the Brick with that e-mail", async () => {
    const user = userEvent.setup();
    renderPage("/assinar?plano=basico");
    expect(screen.getByText("Quem vai usar a plataforma")).toBeInTheDocument();
    expect(screen.queryByTestId("card-brick")).toBeNull();
    expect(screen.queryByRole("group", { name: "Planos" })).toBeNull();

    await fillAccount(user);
    expect(screen.getByText(/Conta para/)).toHaveTextContent("Nova Pessoa");
    expect(screen.getByRole("button", { name: /Básico/ })).toHaveAttribute("aria-pressed", "true");
    expect(brickProps).toHaveBeenCalledWith(expect.objectContaining({ amount: 19.9, payerEmail: "nova@example.com" }));
  });

  it("lets the buyer go back and fix the account", async () => {
    const user = userEvent.setup();
    renderPage();
    await fillAccount(user);
    await user.click(screen.getByRole("button", { name: "Corrigir" }));
    expect(screen.getByLabelText("Nome completo")).toHaveValue("Nova Pessoa");
    expect(screen.queryByTestId("card-brick")).toBeNull();
  });

  it("sends the account with the terms version, opens the session from the token and goes to /definir-senha", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue({ status: "authorized", subscriptionId: "sub-1", accountCreated: true, sessionTokenHash: "tok-hash" });
    renderPage();
    await fillAccount(user);
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));

    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith("/definir-senha", { replace: true }));
    expect(mockSubscribe).toHaveBeenCalledWith({
      planSlug: "profissional",
      card: CARD,
      account: { fullName: "Nova Pessoa", email: "nova@example.com", termsVersion: "2026-09" },
    });
    expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: "tok-hash", type: "magiclink" });
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it("on a refused card with a new account, sends the login link by e-mail and explains", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue({ status: "rejected", subscriptionId: "sub-1", accountCreated: true, message: "Recusado." });
    renderPage();
    await fillAccount(user);
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Recusado."));
    expect(mockSignInWithOtp).toHaveBeenCalledWith({ email: "nova@example.com" });
    expect(screen.getByText(/Enviamos um link de acesso/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /tela de entrada/ })).toHaveAttribute("href", "/auth");
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId("card-brick")).toBeNull();
  });

  it("tells the buyer to use the password reset when the login e-mail could not be sent", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue({ status: "rejected", subscriptionId: "sub-1", accountCreated: true });
    mockSignInWithOtp.mockResolvedValue({ error: { message: "smtp" } });
    renderPage();
    await fillAccount(user);
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));
    await waitFor(() => expect(screen.getByText(/Esqueci minha senha/)).toBeInTheDocument());
  });

  it("falls back to the e-mail link when the token cannot open a session", async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockSubscribe.mockResolvedValue({ status: "authorized", subscriptionId: "sub-1", accountCreated: true, sessionTokenHash: "bad" });
    mockVerifyOtp.mockResolvedValue({ error: { message: "expired" } });
    renderPage();
    await fillAccount(user);
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Pagamento aceito!/));
    expect(mockSignInWithOtp).toHaveBeenCalledWith({ email: "nova@example.com" });
    expect(navigateSpy).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("falls back to the e-mail link when the server created the account but sent no token", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue({ status: "pending", subscriptionId: "sub-1", accountCreated: true });
    renderPage();
    await fillAccount(user);
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));
    await waitFor(() => expect(mockSignInWithOtp).toHaveBeenCalledWith({ email: "nova@example.com" }));
    expect(screen.getByRole("status")).toHaveTextContent(/Pagamento aceito!/);
  });

  it("shows the plain refusal when the account already existed (no new account)", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue({ status: "rejected", subscriptionId: "sub-1", accountCreated: false, message: "Recusado." });
    renderPage();
    await fillAccount(user);
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Tentar com outro cartão" })).toBeInTheDocument());
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it("does not show the 'already subscribed' screen to an anonymous visitor even if a query leaks data", async () => {
    mockUseSubscription.mockReturnValue({ data: { id: "x", status: "authorized" } });
    renderPage();
    expect(screen.getByText("Quem vai usar a plataforma")).toBeInTheDocument();
  });
});
