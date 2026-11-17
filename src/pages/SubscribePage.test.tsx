import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, buildAuthState } from "@/test/helpers";
import SubscribePage from "./SubscribePage";
import { cheapestPublicPlan, formatDate, isCardTrial, pickInitialPlan, replacementNotice, TERMS_VERSION, TRIAL_CREDITS, TRIAL_DAYS, trialFirstChargeDate } from "@/lib/domain/subscriptionUi";
import type { Access } from "@/lib/domain/access";
import { DEFAULT_PREPAID_PLANS, type PrepaidPlanView } from "@/lib/domain/prepaid";

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

// The page submits through the ref (the Brick's own button is hidden), so the
// fake exposes submit() like the real handle: true once onSubmit resolved.
vi.mock("@/components/payments/MpCardBrick", async () => {
  const { forwardRef, useImperativeHandle } = await import("react");
  type Props = { amount: number; payerEmail?: string; onSubmit: (c: unknown) => Promise<void>; onError?: (m: string) => void };
  return {
    default: forwardRef<{ submit(): Promise<boolean> }, Props>(function FakeBrick(props, ref) {
      brickProps(props);
      useImperativeHandle(ref, () => ({
        submit: () =>
          props.onSubmit(CARD).then(
            () => {
              brickProps("resolved");
              return true;
            },
            () => {
              brickProps("rejected");
              return false;
            },
          ),
      }));
      return (
        <div data-testid="card-brick">
          <button type="button" onClick={() => props.onError?.("brick quebrou")}>Erro do Brick</button>
        </div>
      );
    }),
  };
});

vi.mock("@/hooks/useSubscription", async (orig) => {
  const actual = await orig<typeof import("@/hooks/useSubscription")>();
  return {
    ...actual,
    usePlans: mockUsePlans,
    useSubscription: mockUseSubscription,
    useSubscribe: () => ({ mutateAsync: mockSubscribe, isPending: false }),
  };
});

// The Pix block's server hooks: the catalogue, the QR and its status.
const { mockUsePrepaidPlans, mockUseActivePrepaid, mockCreatePix, pixStatus } = vi.hoisted(() => ({
  mockUsePrepaidPlans: vi.fn(),
  mockUseActivePrepaid: vi.fn(),
  mockCreatePix: vi.fn(),
  pixStatus: { value: "pending" },
}));
vi.mock("@/hooks/usePrepaid", () => ({
  usePrepaidPlans: mockUsePrepaidPlans,
  useActivePrepaid: mockUseActivePrepaid,
  useCreatePixPlan: () => ({ mutateAsync: mockCreatePix, isPending: false }),
  usePixPlanStatus: (purchaseId: string | null) => (purchaseId ? pixStatus.value : "idle"),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const SMOKE_PIX: PrepaidPlanView = { id: "pp-t", slug: "pix-teste-admin", months: 1, credits: 1, priceBrl: 1, highlight: false, adminOnly: true };
const PIX_QR = {
  purchaseId: "pur-1",
  qrCode: "00020126580014br.gov.bcb.pix",
  qrCodeBase64: "iVBOR",
  expiresAt: "2099-01-01T00:00:00.000Z",
  amountBrl: 89.9,
  credits: 900,
  months: 3,
};
// Implementations survive vi.clearAllMocks(): every describe sees the catalogue.
mockUsePrepaidPlans.mockImplementation(() => ({ data: [...DEFAULT_PREPAID_PLANS, SMOKE_PIX], isLoading: false }));
mockUseActivePrepaid.mockImplementation(() => ({ data: null }));
mockCreatePix.mockImplementation(async () => PIX_QR);

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
}

function renderPage(route = "/assinar") {
  return renderWithProviders(<SubscribePage />, { route });
}

// The page's own call to action (fixed bar on mobile, under the card on desktop).
async function clickCta(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(screen.getByTestId("checkout-cta")).getByRole("button"));
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

  it("cheapestPublicPlan breaks a price tie by slug, same order the server uses", () => {
    const alt = { ...BASIC, id: "pl-alt", slug: "alternativo" };
    expect(cheapestPublicPlan([BASIC, alt])).toBe(alt);
    expect(cheapestPublicPlan([alt, BASIC])).toBe(alt);
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

  it("paid: headline Escolha seu plano, Profissional pre-selected and CTA Assinar por R$ 59,90/mês", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Escolha seu plano" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "1. Plano" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "2. Dados do cartão" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Profissional/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Assinar por R\$\s*59,90\/mês/ })).toBeEnabled();
    // The disclosure sits under the CTA on desktop and in the card on mobile (the fixed bar has no room).
    const disclosure = screen.getAllByText(/A primeira cobrança é feita agora e as próximas todo mês na mesma data/);
    expect(disclosure).toHaveLength(2);
    expect(disclosure[0]).toHaveClass("lg:hidden");
    expect(within(screen.getByTestId("checkout-cta")).getByText(/A primeira cobrança é feita agora/)).toBeInTheDocument();
    expect(brickProps).toHaveBeenCalledWith(expect.objectContaining({ amount: 59.9, payerEmail: "a@b.c", hideSubmit: true }));
    expect(screen.getByRole("complementary", { name: "Resumo e garantias" })).toHaveTextContent(/Você paga hoje\s*R\$\s*59,90/);
    expect(screen.queryByRole("list", { name: "Como funciona o teste" })).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("the CTA is disabled while the subscription is in flight and calls subscribe once", async () => {
    const user = userEvent.setup();
    let release!: (value: unknown) => void;
    mockSubscribe.mockReturnValue(new Promise((resolve) => (release = resolve)));
    renderPage();
    const cta = screen.getByRole("button", { name: /Assinar por/ });
    await user.click(cta);
    expect(cta).toBeDisabled();
    await user.click(cta);
    expect(mockSubscribe).toHaveBeenCalledTimes(1);

    release({ status: "authorized", subscriptionId: "sub-1" });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Assinatura ativa/));
  });

  it("no fixed CTA (nor the room reserved for it) on result stages", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByTestId("checkout-cta-spacer")).toBeInTheDocument();
    await clickCta(user);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Assinatura ativa/));
    expect(screen.queryByTestId("checkout-cta")).toBeNull();
    expect(screen.queryByTestId("checkout-cta-spacer")).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Resumo e garantias" })).toBeNull();
  });

  it("sends the stored attribution with the checkout", async () => {
    const user = userEvent.setup();
    window.sessionStorage.setItem("olhar:attribution", JSON.stringify({ utm_source: "meta" }));
    renderPage();
    await clickCta(user);
    expect(mockSubscribe).toHaveBeenCalledWith(expect.objectContaining({ attribution: { utm_source: "meta" } }));
    window.sessionStorage.clear();
  });

  it("honours ?plano= and lets the user switch plans", async () => {
    const user = userEvent.setup();
    renderPage("/assinar?plano=basico");
    expect(screen.getByRole("button", { name: /Básico/ })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: /Avançado/ }));
    expect(screen.getByRole("button", { name: /Avançado/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Assinar por R\$\s*99,90\/mês/ })).toBeInTheDocument();
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
    await clickCta(user);
    expect(mockSubscribe).toHaveBeenCalledWith({ planSlug: "profissional", card: CARD });
    expect(window.dataLayer?.map((e) => (e as { event: string }).event)).toEqual(
      expect.arrayContaining(["begin_checkout", "add_payment_info", "subscription_started"]),
    );
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Assinatura ativa! 480 créditos/));
    expect(screen.getByRole("link", { name: /Começar a adaptar/ })).toHaveAttribute("href", "/adaptar");
    expect(screen.getByRole("link", { name: /Começar a adaptar/ })).toHaveClass("text-[1.1875rem]", "font-bold");
    expect(screen.queryByTestId("card-brick")).toBeNull();
  });

  it("shows the analysis state on pending", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue({ status: "pending", subscriptionId: "sub-1" });
    renderPage();
    await clickCta(user);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/em análise/));
    expect(screen.getByRole("link", { name: "Ver créditos" })).toHaveAttribute("href", "/creditos");
  });

  it("shows the refusal and offers a fresh Brick on retry", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue({ status: "rejected", subscriptionId: "sub-1", message: "Recusado pelo banco." });
    renderPage();
    await clickCta(user);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Recusado pelo banco."));
    expect(screen.getByRole("status")).toHaveClass("text-destructive-strong");

    await user.click(screen.getByRole("button", { name: "Tentar com outro cartão" }));
    expect(screen.getByTestId("card-brick")).toBeInTheDocument();
  });

  it("falls back to the generic refusal message", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue({ status: "rejected", subscriptionId: "sub-1" });
    renderPage();
    await clickCta(user);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/não foi aceito para a assinatura/));
  });

  it("stays on the form and rejects the Brick promise on a business refusal (already toasted)", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockRejectedValue(new Error("Você já tem uma assinatura ativa."));
    renderPage();
    await clickCta(user);
    await waitFor(() => expect(brickProps).toHaveBeenCalledWith("rejected"));
    expect(screen.getByTestId("card-brick")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Assinar por/ })).toBeEnabled());
  });

  it("resolves the Brick promise once the backend answered", async () => {
    const user = userEvent.setup();
    renderPage();
    await clickCta(user);
    await waitFor(() => expect(brickProps).toHaveBeenCalledWith("resolved"));
  });

  it("surfaces Brick errors above the form", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Erro do Brick" }));
    expect(screen.getByRole("alert")).toHaveTextContent("brick quebrou");
    // Small red text needs the strong variant to reach 4.5:1 (WCAG 1.4.3).
    expect(screen.getByRole("alert")).toHaveClass("text-destructive-strong");
  });

  it("clears the previous Brick error when the buyer tries again", async () => {
    const user = userEvent.setup();
    let release!: (value: unknown) => void;
    mockSubscribe.mockReturnValue(new Promise((resolve) => (release = resolve)));
    renderPage();
    await user.click(screen.getByRole("button", { name: "Erro do Brick" }));
    expect(screen.getByRole("alert")).toHaveTextContent("brick quebrou");
    await clickCta(user);
    expect(screen.queryByRole("alert")).toBeNull();
    release({ status: "authorized", subscriptionId: "sub-1" });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Assinatura ativa/));
  });

  it("shows skeletons while plans load and an empty state when there are none", () => {
    mockUsePlans.mockReturnValue({ data: undefined, isLoading: true });
    const { unmount } = renderPage();
    expect(screen.getByTestId("plans-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("card-brick")).toBeNull();
    expect(screen.queryByTestId("checkout-cta")).toBeNull();
    unmount();

    mockUsePlans.mockReturnValue({ data: [], isLoading: false });
    renderPage();
    expect(screen.getByText(/Nenhum plano disponível/)).toBeInTheDocument();
    expect(screen.queryByTestId("checkout-cta")).toBeNull();
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
    await clickCta(user);
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

  it("one screen: the plans, who is buying and the card together, in that order, with no step button", async () => {
    const user = userEvent.setup();
    const { container } = renderPage("/assinar?plano=basico");
    const plans = screen.getByRole("group", { name: "Planos" });
    // h1 > h2: the account step must not skip a heading level (axe heading-order).
    const who = screen.getByRole("heading", { level: 2, name: "2. Quem vai usar a plataforma" });
    const card = screen.getByRole("heading", { level: 2, name: "3. Dados do cartão" });
    expect(plans.compareDocumentPosition(who) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(who.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("checkout-cta")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Continuar para o pagamento/ })).toBeNull();
    // The Brick reads the payer e-mail once: it waits for the confirmed one (no duplicate e-mail field).
    expect(screen.queryByTestId("card-brick")).toBeNull();
    expect(screen.getByText("Preencha seus dados acima para digitar o cartão.")).toBeInTheDocument();
    expect(container.querySelector(".checkout-theme")).not.toBeNull();

    await fillAccount(user);
    expect(screen.queryByText(/Conta para/)).toBeNull();
    expect(screen.getByRole("button", { name: /Básico/ })).toHaveAttribute("aria-pressed", "true");
    expect(brickProps).toHaveBeenCalledWith(expect.objectContaining({ amount: 39.9, payerEmail: "nova@example.com" }));
  });

  it("keeps the Brick on the last confirmed e-mail while the buyer edits it", async () => {
    const user = userEvent.setup();
    renderPage();
    await fillAccount(user);
    await user.type(screen.getByLabelText("E-mail"), "x");
    expect(brickProps).toHaveBeenLastCalledWith(expect.objectContaining({ payerEmail: "nova@example.com" }));
    expect(screen.getByTestId("card-brick")).toBeInTheDocument();
  });

  it("the call to action checks the account first and points at what is missing", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText("Nome completo"), "Nova Pessoa");
    await clickCta(user);
    expect(screen.getByRole("alert")).toHaveTextContent("Informe um e-mail válido.");
    expect(mockSubscribe).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("E-mail"), "nova@example.com");
    await user.type(screen.getByLabelText("Confirme o e-mail"), "nova@example.com");
    await clickCta(user);
    expect(screen.getByRole("alert")).toHaveTextContent(/aceitar os Termos de Uso/);
    expect(brickProps).not.toHaveBeenCalledWith("resolved");
    expect(mockSubscribe).not.toHaveBeenCalled();

    mockSubscribe.mockResolvedValue({ status: "authorized", subscriptionId: "sub-1", accountCreated: true });
    await user.click(screen.getByRole("checkbox"));
    await clickCta(user);
    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());
  });

  it("sends the account with the terms version and, on an accepted card, mails the login link instead of opening a session", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue({ status: "authorized", subscriptionId: "sub-1", accountCreated: true });
    renderPage();
    await fillAccount(user);
    await clickCta(user);

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
    await clickCta(user);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/em análise/));
    expect(mockSignInWithOtp).toHaveBeenCalled();
  });

  it("on a refused card with a new account, mails the login link and points to another card", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue({ status: "rejected", subscriptionId: "sub-1", accountCreated: true, message: "Recusado." });
    renderPage();
    await fillAccount(user);
    await clickCta(user);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Recusado."));
    expect(screen.getByRole("status")).toHaveClass("text-destructive-strong");
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
    await clickCta(user);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/não foi aceito para a assinatura/));
  });

  it("tells the buyer to use the password reset when the login e-mail could not be sent", async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockSubscribe.mockResolvedValue({ status: "authorized", subscriptionId: "sub-1", accountCreated: true });
    mockSignInWithOtp.mockResolvedValue({ error: { message: "smtp" } });
    renderPage();
    await fillAccount(user);
    await clickCta(user);
    await waitFor(() => expect(screen.getByText(/Esqueci minha senha/)).toBeInTheDocument());
    consoleError.mockRestore();
  });

  it("shows the plain refusal when the account already existed (no new account)", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue({ status: "rejected", subscriptionId: "sub-1", accountCreated: false, message: "Recusado." });
    renderPage();
    await fillAccount(user);
    await clickCta(user);
    await waitFor(() => expect(screen.getByRole("button", { name: "Tentar com outro cartão" })).toBeInTheDocument());
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it("does not show the 'already subscribed' screen to an anonymous visitor even if a query leaks data", async () => {
    mockUseSubscription.mockReturnValue({ data: { id: "x", status: "authorized" } });
    renderPage();
    expect(screen.getByRole("heading", { name: "2. Quem vai usar a plataforma" })).toBeInTheDocument();
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

  it("trial: new headline, Básico pre-selected, plans visible and the first-charge notice without the validation sentence", async () => {
    const user = userEvent.setup();
    renderPage("/assinar?trial=1");
    expect(screen.getByRole("heading", { level: 1, name: "Comece hoje. Você só paga daqui a 7 dias." })).toBeInTheDocument();
    expect(screen.getByText("Hoje você não paga nada. Avisamos por e-mail antes da primeira cobrança, e cancelar leva 2 cliques.")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Como funciona o teste" })).toBeInTheDocument();
    await fillAccount(user);

    expect(screen.getByRole("heading", { name: "1. Escolha seu plano" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Planos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Básico/ })).toHaveAttribute("aria-pressed", "true");
    const expected = trialFirstChargeDate(new Date());
    expect(screen.getByRole("note")).toHaveTextContent(
      `Hoje: R$ 0,00. Em ${formatDate(expected)} começa o plano Básico, R$ 39,90/mês. Cancele em 2 cliques antes dessa data e não é cobrado nada.`,
    );
    expect(screen.queryByText(/cobrança de validação/)).toBeNull();
    expect(screen.queryByText(/Cancele antes em Créditos/)).toBeNull();
    expect(screen.queryByText(/a partir do 8º dia/)).toBeNull();
    expect(screen.getByRole("button", { name: /Começar meus 7 dias grátis/ })).toBeEnabled();
    expect(screen.getByText("Hoje você não paga nada. Cancele em 2 cliques, sem fidelidade e sem multa.")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Resumo e garantias" })).toHaveTextContent(/Você paga hoje\s*R\$\s*0,00/);
    expect(brickProps).toHaveBeenCalledWith(expect.objectContaining({ amount: 39.9, payerEmail: "nova@example.com", hideSubmit: true }));
    expect(brickProps).toHaveBeenCalledWith(expect.not.objectContaining({ submitLabel: expect.anything() }));
  });

  it("trial: choosing Profissional sends its slug with trial: true", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue({ status: "authorized", subscriptionId: "sub-1", accountCreated: true });
    renderPage("/assinar?trial=1");
    await fillAccount(user);
    await user.click(screen.getByRole("button", { name: /Profissional/ }));
    expect(screen.getByRole("note")).toHaveTextContent(/começa o plano Profissional, R\$\s*59,90\/mês/);
    await user.click(screen.getByRole("button", { name: /Começar meus 7 dias grátis/ }));
    expect(mockSubscribe).toHaveBeenCalledWith(expect.objectContaining({ planSlug: "profissional", trial: true }));
  });

  it("trial: honours a public ?plano= and ignores an admin-only one", async () => {
    const user = userEvent.setup();
    const smoke = { ...BASIC, id: "pl-test", slug: "teste-admin", name: "Teste", priceBrl: 1, monthlyCredits: 1, adminOnly: true };
    mockUsePlans.mockReturnValue({ data: [...PLANS, smoke], isLoading: false });
    const { unmount } = renderPage("/assinar?trial=1&plano=avancado");
    await fillAccount(user);
    expect(screen.getByRole("button", { name: /Avançado/ })).toHaveAttribute("aria-pressed", "true");
    unmount();

    renderPage("/assinar?trial=1&plano=teste-admin");
    await fillAccount(user);
    expect(screen.getByRole("button", { name: /Básico/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /Teste/ })).toBeNull();
    expect(screen.queryByText("Só admins")).toBeNull();
  });

  it("sends trial: true with the account and, when authorized, mails the login link with the trial copy", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue({ status: "authorized", subscriptionId: "sub-1", accountCreated: true, trialEndsAt: "2026-09-22T21:52:15.000Z" });
    window.dataLayer = [];
    renderPage("/assinar?trial=1");
    await fillAccount(user);
    await clickCta(user);

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
    await clickCta(user);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Este CPF já usou o teste."));
    expect(screen.queryByTestId("card-brick")).toBeNull();
    // Green button: large bold text keeps white on #00a650 readable.
    expect(screen.getByRole("button", { name: /Assinar R\$\s*39,90\/mês/ })).toHaveClass("text-[1.1875rem]", "font-bold");
    await user.click(screen.getByRole("button", { name: /Assinar R\$\s*39,90\/mês/ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Assinatura ativa! 300 créditos/));
    expect(mockSubscribe).toHaveBeenLastCalledWith(expect.objectContaining({ planSlug: "basico", card: CARD }));
    expect(mockSubscribe.mock.calls[1][0]).not.toHaveProperty("trial");
  });

  it("does not double-track add_payment_info on the trial_used resubmit", async () => {
    const user = userEvent.setup();
    mockSubscribe
      .mockRejectedValueOnce(Object.assign(new Error("Este CPF já usou o teste."), { code: "trial_used" }))
      .mockResolvedValueOnce({ status: "authorized", subscriptionId: "sub-2", accountCreated: true });
    window.dataLayer = [];
    renderPage("/assinar?trial=1");
    await fillAccount(user);
    await clickCta(user);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Este CPF já usou o teste."));
    await user.click(screen.getByRole("button", { name: /Assinar R\$\s*39,90\/mês/ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Assinatura ativa! 300 créditos/));
    expect(window.dataLayer.filter((e) => (e as { event: string }).event === "add_payment_info")).toHaveLength(1);
  });

  it("lets the buyer try another card after trial_used", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockRejectedValueOnce(Object.assign(new Error("Este CPF já usou o teste."), { code: "trial_used" }));
    renderPage("/assinar?trial=1");
    await fillAccount(user);
    await clickCta(user);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Este CPF já usou o teste."));
    await user.click(screen.getByRole("button", { name: "Usar outro cartão" }));
    expect(screen.getByTestId("card-brick")).toBeInTheDocument();
  });

  it("hands other refusals back to the Brick as before", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockRejectedValueOnce(Object.assign(new Error("Muitas tentativas."), { code: "rate_limited" }));
    renderPage("/assinar?trial=1");
    await fillAccount(user);
    await clickCta(user);
    await waitFor(() => expect(brickProps).toHaveBeenCalledWith("rejected"));
  });

  it("falls back to the day count when the server sends no trial end date", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue({ status: "authorized", subscriptionId: "sub-1", accountCreated: true });
    renderPage("/assinar?trial=1");
    await fillAccount(user);
    await clickCta(user);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Teste ativado! 50 créditos já estão na sua conta."));
    expect(screen.getByRole("status")).toHaveTextContent(`A primeira cobrança de R$ 39,90 será em ${TRIAL_DAYS} dias.`);
  });

  it("shows the trial analysis copy on pending, not the generic subscription one", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue({ status: "pending", subscriptionId: "sub-1", accountCreated: true });
    renderPage("/assinar?trial=1");
    await fillAccount(user);
    await clickCta(user);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Teste em análise. Seus créditos entram assim que o cartão for confirmado."));
  });

  it("on a refused trial card, offers another card without keeping a stranded account", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue({ status: "rejected", subscriptionId: "sub-1", accountCreated: false, message: "Recusado." });
    renderPage("/assinar?trial=1");
    await fillAccount(user);
    await clickCta(user);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Recusado."));
    expect(screen.getByRole("button", { name: "Tentar com outro cartão" })).toBeInTheDocument();
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
    expect(screen.queryByText(/Sua conta foi criada/)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Tentar com outro cartão" }));
    expect(screen.getByTestId("card-brick")).toBeInTheDocument();
    expect(brickProps).toHaveBeenLastCalledWith(expect.objectContaining({ hideSubmit: true }));
  });

  it("no timeline, CTA or stray undefined while the catalogue is still loading", async () => {
    const user = userEvent.setup();
    mockUsePlans.mockReturnValue({ data: [], isLoading: true });
    const { container } = renderPage("/assinar?trial=1");
    expect(screen.getByRole("heading", { level: 1, name: "Comece hoje. Você só paga daqui a 7 dias." })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Como funciona o teste" })).toBeNull();
    await fillAccount(user);
    expect(screen.getByTestId("plans-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("checkout-cta")).toBeNull();
    expect(container).not.toHaveTextContent(/undefined/);
  });

  it("ignores ?trial=1 for a logged-in user (paid flow, plan selector visible)", async () => {
    await setProfile(LEGACY);
    renderPage("/assinar?trial=1");
    expect(screen.getByRole("heading", { level: 1, name: "Escolha seu plano" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Planos" })).toBeInTheDocument();
    expect(brickProps).toHaveBeenCalledWith(expect.not.objectContaining({ submitLabel: expect.anything() }));
    expect(screen.getByRole("note")).toHaveTextContent(
      "O teste grátis de 7 dias é só para contas novas. Como você já tem conta, assine um plano.",
    );
  });
});

describe("SubscribePage (Pix à vista)", () => {
  const PIX_TITLE = "Pague no Pix, sem precisar de cartão.";
  const PIX_TRIAL_NOTE =
    "No Pix o pagamento é à vista, então o teste de 7 dias não se aplica. Mas você tem 7 dias de garantia: se não servir, devolvemos o valor integral.";

  beforeEach(async () => {
    vi.clearAllMocks();
    pixStatus.value = "pending";
    mockUsePlans.mockReturnValue({ data: PLANS, isLoading: false });
    mockUseSubscription.mockReturnValue({ data: null });
    mockSubscribe.mockResolvedValue({ status: "authorized", subscriptionId: "sub-1" });
    mockSignInWithOtp.mockResolvedValue({ error: null });
    await setProfile(LEGACY);
  });

  it("logged in: the payment method comes first, card by default", () => {
    renderPage();
    const methods = screen.getByRole("radiogroup", { name: "Forma de pagamento" });
    expect(screen.getByRole("radio", { name: /Cartão de crédito/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Cartão de crédito/ })).toHaveTextContent("Assinatura mensal. Cancele quando quiser.");
    const plansGroup = screen.getByRole("group", { name: "Planos" });
    expect(methods.compareDocumentPosition(plansGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("card-brick")).toBeInTheDocument();
  });

  it("?pagamento=pix opens on Pix: its header, 3 months pre-selected, no card form, and the Pix bar", () => {
    renderPage("/assinar?pagamento=pix");
    expect(screen.getByRole("radio", { name: /Pix/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("heading", { level: 1, name: PIX_TITLE })).toBeInTheDocument();
    expect(screen.getByText("Acesso liberado em segundos depois do pagamento. Quanto mais meses, menor o valor mensal.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "1. Por quanto tempo você quer acesso?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /3 MESES/ })).toHaveAttribute("aria-pressed", "true");
    // The admin smoke offer never shows to a regular buyer.
    expect(screen.queryByRole("button", { name: /Só admins/ })).toBeNull();
    expect(screen.queryByTestId("card-brick")).toBeNull();
    expect(screen.queryByRole("group", { name: "Planos" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "2. Dados do cartão" })).toBeNull();
    expect(within(screen.getByTestId("checkout-cta")).getByRole("button", { name: /Gerar meu código Pix/ })).toBeInTheDocument();
    expect(screen.getByTestId("checkout-cta")).toHaveTextContent(/Você paga hoje\s*R\$\s*89,90/);
    const summary = screen.getByRole("complementary", { name: "Resumo e garantias" });
    expect(summary).toHaveTextContent("Acesso por 3 meses");
    expect(summary).toHaveTextContent("7 dias de garantia");
    expect(screen.queryByText(PIX_TRIAL_NOTE)).toBeNull();
    expect(brickProps).not.toHaveBeenCalled();
  });

  it("switching to Pix and back brings the card form again", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("radio", { name: /Pix/ }));
    expect(screen.getByRole("heading", { level: 1, name: PIX_TITLE })).toBeInTheDocument();
    expect(screen.queryByTestId("card-brick")).toBeNull();
    await user.click(screen.getByRole("radio", { name: /Cartão de crédito/ }));
    expect(screen.getByRole("heading", { level: 1, name: "Escolha seu plano" })).toBeInTheDocument();
    expect(screen.getByTestId("card-brick")).toBeInTheDocument();
  });

  it("honours ?plano= of a prepaid plan, lets the buyer switch, and a logged-in buyer sends only the plan", async () => {
    const user = userEvent.setup();
    renderPage("/assinar?pagamento=pix&plano=pix-12-meses");
    expect(screen.getByRole("button", { name: /12 MESES/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /1 MÊS/ }));
    expect(screen.getByRole("button", { name: /1 MÊS/ })).toHaveAttribute("aria-pressed", "true");
    await clickCta(user);
    expect(mockCreatePix).toHaveBeenCalledWith({ planSlug: "pix-1-mes" });
    expect(screen.getByRole("img", { name: "QR code do Pix" })).toBeInTheDocument();
  });

  it("starts on the first plan when the catalogue highlights none", () => {
    mockUsePrepaidPlans.mockReturnValue({ data: DEFAULT_PREPAID_PLANS.map((p) => ({ ...p, highlight: false })), isLoading: false });
    renderPage("/assinar?pagamento=pix");
    expect(screen.getByRole("button", { name: /1 MÊS/ })).toHaveAttribute("aria-pressed", "true");
    mockUsePrepaidPlans.mockImplementation(() => ({ data: [...DEFAULT_PREPAID_PLANS, SMOKE_PIX], isLoading: false }));
  });

  it("a super-admin sees the admin-only smoke offer", async () => {
    await setProfile({ ...LEGACY, is_super_admin: true });
    renderPage("/assinar?pagamento=pix");
    expect(screen.getByRole("button", { name: /Só admins/ })).toBeInTheDocument();
  });

  it("no Pix payment block while the catalogue loads", () => {
    mockUsePrepaidPlans.mockReturnValue({ data: undefined, isLoading: true });
    renderPage("/assinar?pagamento=pix");
    expect(screen.getByTestId("prepaid-plans-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("checkout-cta")).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Resumo e garantias" })).toBeNull();
    mockUsePrepaidPlans.mockImplementation(() => ({ data: [...DEFAULT_PREPAID_PLANS, SMOKE_PIX], isLoading: false }));
  });

  it("a refused card offers Pagar com Pix, which switches the method", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue({ status: "rejected", subscriptionId: "sub-1", message: "Cartão recusado." });
    renderPage();
    await clickCta(user);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Cartão recusado."));
    await user.click(screen.getByRole("button", { name: "Pagar com Pix" }));
    expect(screen.getByRole("heading", { level: 1, name: PIX_TITLE })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Pix/ })).toHaveAttribute("aria-checked", "true");
  });

  it("a card checkout refused for an active prepaid plan shows the reason by the card, with the way to renew on Pix", async () => {
    const user = userEvent.setup();
    const message = "Você tem um plano à vista ativo até 15/02/2027. Para continuar, renove no Pix ou assine no cartão depois dessa data.";
    mockSubscribe.mockRejectedValue(Object.assign(new Error(message), { code: "prepaid_active" }));
    renderPage();
    await clickCta(user);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(brickProps).toHaveBeenCalledWith("rejected");
    await user.click(within(alert).getByRole("button", { name: "Renovar no Pix" }));
    expect(screen.getByRole("heading", { level: 1, name: PIX_TITLE })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("other business refusals keep the plain toast path (no inline alert)", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockRejectedValue(Object.assign(new Error("Muitas tentativas."), { code: "rate_limited" }));
    renderPage();
    await clickCta(user);
    await waitFor(() => expect(brickProps).toHaveBeenCalledWith("rejected"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("on Pix, warns a trial that its credits are replaced, unless a prepaid plan is running (a rebuy extends it)", async () => {
    await setProfile(TRIAL);
    const { unmount } = renderPage("/assinar?pagamento=pix");
    expect(screen.getByText(/42 créditos do período de teste.*substituídos/)).toBeInTheDocument();
    unmount();

    mockUseActivePrepaid.mockReturnValue({ data: { periodEnd: new Date("2099-01-05T00:00:00Z"), lockedCredits: 0, unlockAt: null } });
    renderPage("/assinar?pagamento=pix");
    expect(screen.queryByText(/substituídos/)).toBeNull();
    mockUseActivePrepaid.mockImplementation(() => ({ data: null }));
  });

  it("a logged-in user with ?trial=1 on Pix gets the Pix note, not the card trial one", () => {
    renderPage("/assinar?trial=1&pagamento=pix");
    expect(screen.getByText(PIX_TRIAL_NOTE)).toBeInTheDocument();
    expect(screen.queryByText(/O teste grátis de 7 dias é só para contas novas/)).toBeNull();
  });

  describe("anonymous", () => {
    beforeEach(async () => {
      mockUseSubscription.mockReturnValue({ data: undefined });
      await setAnonymous();
    });

    it("the method choice, the plans and the account share the screen, and switching keeps the account", async () => {
      const user = userEvent.setup();
      renderPage();
      expect(screen.getByRole("radiogroup", { name: "Forma de pagamento" })).toBeInTheDocument();
      await user.click(screen.getByRole("radio", { name: /Pix/ }));
      expect(screen.getByRole("heading", { level: 2, name: "2. Quem vai usar a plataforma" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 2, name: "3. Pague com o app do seu banco" })).toBeInTheDocument();
      // An incomplete account generates no QR and says what is missing.
      await clickCta(user);
      expect(screen.getByRole("alert")).toHaveTextContent("Informe seu nome completo.");
      expect(mockCreatePix).not.toHaveBeenCalled();

      await fillAccount(user);
      await clickCta(user);
      expect(mockCreatePix).toHaveBeenCalledWith({
        planSlug: "pix-3-meses",
        account: { fullName: "Nova Pessoa", email: "nova@example.com", termsVersion: TERMS_VERSION },
      });

      pixStatus.value = "approved";
      await user.click(screen.getByRole("radio", { name: /Cartão de crédito/ }));
      await user.click(screen.getByRole("radio", { name: /Pix/ }));
      expect(screen.getByLabelText("E-mail")).toHaveValue("nova@example.com");
    });

    it("trial funnel on Pix: Pix header, the trial note, no timeline; the card option keeps the trial copy", async () => {
      const user = userEvent.setup();
      renderPage("/assinar?trial=1&pagamento=pix");
      expect(screen.getByRole("heading", { level: 1, name: PIX_TITLE })).toBeInTheDocument();
      expect(screen.getByText(PIX_TRIAL_NOTE)).toBeInTheDocument();
      expect(screen.queryByRole("list", { name: "Como funciona o teste" })).toBeNull();
      await fillAccount(user);
      expect(screen.getByRole("radio", { name: /Cartão de crédito/ })).toHaveTextContent("Teste 7 dias grátis. Nada é cobrado hoje.");
      expect(screen.queryByRole("list", { name: "Como funciona o teste" })).toBeNull();
      expect(screen.getByRole("heading", { level: 2, name: "3. Pague com o app do seu banco" })).toBeInTheDocument();

      await user.click(screen.getByRole("radio", { name: /Cartão de crédito/ }));
      expect(screen.getByRole("list", { name: "Como funciona o teste" })).toBeInTheDocument();
      expect(screen.queryByText(PIX_TRIAL_NOTE)).toBeNull();
    });
  });
});
