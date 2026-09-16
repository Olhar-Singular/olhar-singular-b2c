import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, buildAuthState } from "@/test/helpers";
import SubscribePage from "./SubscribePage";
import { cheapestPublicPlan, formatDate, isCardTrial, pickInitialPlan, replacementNotice, TERMS_VERSION, TRIAL_CREDITS, TRIAL_DAYS, trialFirstChargeDate } from "@/lib/domain/subscriptionUi";
import type { Access } from "@/lib/domain/access";

const { mockSubscribe, brickProps, mockUsePlans, mockUseSubscription, mockSignInWithOtp } = vi.hoisted(() => ({
  mockSubscribe: vi.fn(),
  brickProps: vi.fn(),
  mockUsePlans: vi.fn(),
  mockUseSubscription: vi.fn(),
  mockSignInWithOtp: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signInWithOtp: mockSignInWithOtp } },
}));

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

const BASIC = { id: "pl-basic", slug: "basico", name: "Básico", priceBrl: 39.9, monthlyCredits: 300, highlight: false, adminOnly: false };
const PRO = { id: "pl-pro", slug: "profissional", name: "Profissional", priceBrl: 59.9, monthlyCredits: 480, highlight: true, adminOnly: false };
const ADV = { id: "pl-adv", slug: "avancado", name: "Avançado", priceBrl: 99.9, monthlyCredits: 900, highlight: false, adminOnly: false };
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

describe("trial helpers", () => {
  it("cheapestPublicPlan picks the lowest price among non-admin plans", () => {
    const smoke = { ...BASIC, id: "t", slug: "teste-admin", priceBrl: 1, adminOnly: true };
    expect(cheapestPublicPlan([PRO, ADV, BASIC, smoke])).toBe(BASIC);
    expect(cheapestPublicPlan([smoke])).toBeNull();
    expect(cheapestPublicPlan([])).toBeNull();
  });

  it("trialFirstChargeDate is 7 days ahead", () => {
    expect(TRIAL_DAYS).toBe(7);
    expect(TRIAL_CREDITS).toBe(50);
    expect(trialFirstChargeDate(new Date("2026-09-15T12:00:00Z"))).toEqual(new Date("2026-09-22T12:00:00Z"));
  });

  it("isCardTrial is a live row born as a trial that MP has not charged yet", () => {
    const base = {
      id: "s", status: "authorized" as const, statusDetail: null, plan: null, nextPaymentDate: null,
      currentPeriodEnd: null, cancelledAt: null, cardBrand: null, cardLastFour: null,
      firstPaymentConfirmed: false, trialEndsAt: new Date("2026-09-22T12:00:00Z"), createdAt: null,
    };
    expect(isCardTrial(base)).toBe(true);
    expect(isCardTrial({ ...base, status: "past_due" })).toBe(true);
    expect(isCardTrial({ ...base, firstPaymentConfirmed: true })).toBe(false);
    expect(isCardTrial({ ...base, trialEndsAt: null })).toBe(false);
    expect(isCardTrial({ ...base, status: "cancelled" })).toBe(false);
    expect(isCardTrial(null)).toBe(false);
    expect(isCardTrial(undefined)).toBe(false);
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
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Assinatura ativa! 480 créditos/));
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

  it("lets a super-admin on a courtesy account subscribe (smoke plan)", async () => {
    await setProfile({ ...LEGACY, access_kind: "exempt", is_super_admin: true });
    renderPage();
    expect(screen.queryByText(/Sua conta tem cortesia/)).toBeNull();
    expect(screen.getByTestId("card-brick")).toBeInTheDocument();
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
    expect(brickProps).toHaveBeenCalledWith(expect.objectContaining({ amount: 39.9, payerEmail: "nova@example.com" }));
  });

  it("lets the buyer go back and fix the account", async () => {
    const user = userEvent.setup();
    renderPage();
    await fillAccount(user);
    await user.click(screen.getByRole("button", { name: "Corrigir" }));
    expect(screen.getByLabelText("Nome completo")).toHaveValue("Nova Pessoa");
    expect(screen.queryByTestId("card-brick")).toBeNull();
  });

  it("sends the account with the terms version and, on an accepted card, mails the login link instead of opening a session", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue({ status: "authorized", subscriptionId: "sub-1", accountCreated: true });
    renderPage();
    await fillAccount(user);
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Assinatura ativa! 480 créditos/));
    expect(mockSubscribe).toHaveBeenCalledWith({
      planSlug: "profissional",
      card: CARD,
      account: { fullName: "Nova Pessoa", email: "nova@example.com", termsVersion: TERMS_VERSION },
    });
    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: "nova@example.com",
      options: { emailRedirectTo: `${window.location.origin}/definir-senha`, shouldCreateUser: false },
    });
    expect(screen.getByText(/Enviamos um link de acesso/)).toBeInTheDocument();
    expect(screen.getByText(/crie sua senha/)).toBeInTheDocument();
    expect(screen.queryByTestId("card-brick")).toBeNull();
    expect(screen.queryByText(/tente outro cartão/)).toBeNull();
  });

  it("mails the login link on pending too, with the analysis copy", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue({ status: "pending", subscriptionId: "sub-1", accountCreated: true });
    renderPage();
    await fillAccount(user);
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/em análise/));
    expect(mockSignInWithOtp).toHaveBeenCalled();
  });

  it("on a refused card with a new account, mails the login link and points to another card", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue({ status: "rejected", subscriptionId: "sub-1", accountCreated: true, message: "Recusado." });
    renderPage();
    await fillAccount(user);
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Recusado."));
    expect(mockSignInWithOtp).toHaveBeenCalledWith(expect.objectContaining({ email: "nova@example.com" }));
    expect(screen.getByText(/tente outro cartão em Créditos/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /tela de entrada/ })).toHaveAttribute("href", "/auth");
    expect(screen.queryByTestId("card-brick")).toBeNull();
  });

  it("uses the generic refusal when the server sent no message", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue({ status: "rejected", subscriptionId: "sub-1", accountCreated: true });
    renderPage();
    await fillAccount(user);
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/não foi aceito para a assinatura/));
  });

  it("tells the buyer to use the password reset when the login e-mail could not be sent", async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockSubscribe.mockResolvedValue({ status: "authorized", subscriptionId: "sub-1", accountCreated: true });
    mockSignInWithOtp.mockResolvedValue({ error: { message: "smtp" } });
    renderPage();
    await fillAccount(user);
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));
    await waitFor(() => expect(screen.getByText(/Esqueci minha senha/)).toBeInTheDocument());
    consoleError.mockRestore();
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

describe("SubscribePage (trial with card, ?trial=1)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockUsePlans.mockReturnValue({ data: PLANS, isLoading: false });
    mockUseSubscription.mockReturnValue({ data: undefined });
    mockSignInWithOtp.mockResolvedValue({ error: null });
    await setAnonymous();
  });

  it("locks the cheapest plan, shows the first-charge date and labels the Brick button", async () => {
    const user = userEvent.setup();
    renderPage("/assinar?trial=1");
    expect(screen.getByRole("heading", { level: 1, name: "Teste grátis por 7 dias" })).toBeInTheDocument();
    await fillAccount(user);
    expect(screen.queryByRole("group", { name: "Planos" })).toBeNull();
    expect(screen.getByText(/Plano Básico · R\$\s*39,90\/mês · 300 créditos por mês/)).toBeInTheDocument();
    const expected = trialFirstChargeDate(new Date());
    expect(screen.getByRole("note")).toHaveTextContent(`Hoje: R$ 0,00. Em ${formatDate(expected)} cobramos R$ 39,90 no cartão e seu plano vira 300 créditos/mês.`);
    expect(screen.getByRole("note")).toHaveTextContent(/Cancele antes em Créditos e nada é cobrado\. Uma cobrança de validação pode aparecer e é estornada\./);
    expect(brickProps).toHaveBeenCalledWith(expect.objectContaining({ amount: 39.9, payerEmail: "nova@example.com", submitLabel: "Começar o teste" }));
  });

  it("sends trial: true with the account and, when authorized, mails the login link with the trial copy", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue({ status: "authorized", subscriptionId: "sub-1", accountCreated: true, trialEndsAt: "2026-09-22T21:52:15.000Z" });
    window.dataLayer = [];
    renderPage("/assinar?trial=1");
    await fillAccount(user);
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Teste ativado! 50 créditos já estão na sua conta."));
    expect(screen.getByRole("status")).toHaveTextContent(`A primeira cobrança de R$ 39,90 será em ${formatDate(new Date("2026-09-22T21:52:15.000Z"))}.`);
    expect(mockSubscribe).toHaveBeenCalledWith({
      planSlug: "basico",
      card: CARD,
      trial: true,
      account: { fullName: "Nova Pessoa", email: "nova@example.com", termsVersion: TERMS_VERSION },
    });
    expect(mockSignInWithOtp).toHaveBeenCalledWith(expect.objectContaining({ email: "nova@example.com" }));
    expect(window.dataLayer.some((e) => (e as { event: string }).event === "trial_started")).toBe(true);
    expect(window.dataLayer.some((e) => (e as { event: string }).event === "subscription_started")).toBe(false);
  });

  it("on trial_used offers the paid plan with the same card, without a new token", async () => {
    const user = userEvent.setup();
    mockSubscribe
      .mockRejectedValueOnce(Object.assign(new Error("Este CPF já usou o teste."), { code: "trial_used" }))
      .mockResolvedValueOnce({ status: "authorized", subscriptionId: "sub-2", accountCreated: true });
    renderPage("/assinar?trial=1");
    await fillAccount(user);
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Este CPF já usou o teste."));
    expect(screen.queryByTestId("card-brick")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Assinar R\$\s*39,90\/mês/ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Assinatura ativa! 300 créditos/));
    expect(mockSubscribe).toHaveBeenLastCalledWith(expect.objectContaining({ planSlug: "basico", card: CARD }));
    expect(mockSubscribe.mock.calls[1][0]).not.toHaveProperty("trial");
  });

  it("lets the buyer try another card after trial_used", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockRejectedValueOnce(Object.assign(new Error("Este CPF já usou o teste."), { code: "trial_used" }));
    renderPage("/assinar?trial=1");
    await fillAccount(user);
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Este CPF já usou o teste."));
    await user.click(screen.getByRole("button", { name: "Usar outro cartão" }));
    expect(screen.getByTestId("card-brick")).toBeInTheDocument();
  });

  it("hands other refusals back to the Brick as before", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockRejectedValueOnce(Object.assign(new Error("Muitas tentativas."), { code: "rate_limited" }));
    renderPage("/assinar?trial=1");
    await fillAccount(user);
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));
    await waitFor(() => expect(brickProps).toHaveBeenCalledWith("rejected"));
  });

  it("falls back to the day count when the server sends no trial end date", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue({ status: "authorized", subscriptionId: "sub-1", accountCreated: true });
    renderPage("/assinar?trial=1");
    await fillAccount(user);
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Teste ativado! 50 créditos já estão na sua conta."));
    expect(screen.getByRole("status")).toHaveTextContent(`A primeira cobrança de R$ 39,90 será em ${TRIAL_DAYS} dias.`);
  });

  it("shows the trial analysis copy on pending, not the generic subscription one", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue({ status: "pending", subscriptionId: "sub-1", accountCreated: true });
    renderPage("/assinar?trial=1");
    await fillAccount(user);
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Teste em análise. Seus créditos entram assim que o cartão for confirmado."));
  });

  it("omits the plan name from the intro while the catalogue is still loading", () => {
    mockUsePlans.mockReturnValue({ data: [], isLoading: true });
    renderPage("/assinar?trial=1");
    expect(screen.getByText(`Cartão obrigatório, nada é cobrado hoje. Em ${TRIAL_DAYS} dias começa o plano. Cancele antes e não paga nada.`)).toBeInTheDocument();
  });

  it("ignores ?trial=1 for a logged-in user (paid flow, plan selector visible)", async () => {
    await setProfile(LEGACY);
    renderPage("/assinar?trial=1");
    expect(screen.getByRole("heading", { level: 1, name: "Assinar um plano" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Planos" })).toBeInTheDocument();
    expect(brickProps).toHaveBeenCalledWith(expect.not.objectContaining({ submitLabel: expect.anything() }));
  });
});
