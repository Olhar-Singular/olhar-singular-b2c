import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, buildAuthState } from "@/test/helpers";
import SubscriptionCard from "./SubscriptionCard";
import { canRefundLastCharge, formatCard } from "@/lib/domain/subscriptionUi";
import type { Access } from "@/lib/domain/access";
import type { LastChargeView, SubscriptionView } from "@/hooks/useSubscription";

const { mockCancel, mockUpdateCard, mockRefund, mockUseLastCharge, brickProps, cancelOpts } = vi.hoisted(() => ({
  mockCancel: vi.fn(),
  mockUpdateCard: vi.fn(),
  mockRefund: vi.fn(),
  mockUseLastCharge: vi.fn(),
  brickProps: vi.fn(),
  cancelOpts: vi.fn(),
}));

const CARD = { token: "tok_new", payment_method_id: "visa" };

vi.mock("@/components/payments/MpCardBrick", () => ({
  default: (props: { amount: number; payerEmail?: string; onSubmit: (c: unknown) => Promise<void>; onError?: (m: string) => void }) => {
    brickProps(props);
    return (
      <div data-testid="card-brick">
        <button type="button" onClick={() => props.onSubmit(CARD).then(() => brickProps("resolved"), () => brickProps("rejected"))}>Salvar cartão</button>
        <button type="button" onClick={() => props.onError?.("brick quebrou")}>Erro do Brick</button>
      </div>
    );
  },
}));

vi.mock("@/hooks/useSubscription", async (orig) => {
  const actual = await orig<typeof import("@/hooks/useSubscription")>();
  return {
    ...actual,
    useCancelSubscription: (opts?: unknown) => {
      cancelOpts(opts);
      return { mutate: mockCancel, isPending: false };
    },
    useUpdateSubscriptionCard: () => ({ mutateAsync: mockUpdateCard, isPending: false }),
    useLastCharge: (id: string | null | undefined) => mockUseLastCharge(id),
    useRefundLastCharge: () => ({ mutate: mockRefund, isPending: false }),
  };
});

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const PLAN = { id: "pl", slug: "profissional", name: "Profissional", priceBrl: 59.9, monthlyCredits: 480, highlight: true, adminOnly: false };

function access(overrides: Partial<Access> = {}): Access {
  return {
    kind: "subscriber",
    planCredits: 200,
    extraCredits: 5,
    total: 205,
    unlimited: false,
    paywalled: false,
    periodEnd: new Date("2026-10-12T12:00:00Z"),
    daysLeft: null,
    trialExpired: false,
    mustSetPassword: false,
    ...overrides,
  };
}

function sub(overrides: Partial<SubscriptionView> = {}): SubscriptionView {
  return {
    id: "sub-1",
    status: "authorized",
    statusDetail: null,
    plan: PLAN,
    nextPaymentDate: new Date("2026-10-12T12:00:00Z"),
    currentPeriodEnd: new Date("2026-10-12T12:00:00Z"),
    cancelledAt: null,
    cardBrand: "master",
    cardLastFour: "1234",
    firstPaymentConfirmed: true,
    trialEndsAt: null,
    createdAt: new Date("2026-09-12T12:00:00Z"),
    ...overrides,
  };
}

function renderCard(s: SubscriptionView | null | undefined, a: Access | null = access()) {
  return renderWithProviders(<SubscriptionCard subscription={s} access={a} />);
}

describe("formatCard", () => {
  it("names the brand and the last four", () => {
    expect(formatCard("master", "1234")).toBe("Master final 1234");
    expect(formatCard(null, "1234")).toBe("Cartão final 1234");
    expect(formatCard("visa", null)).toBe("Visa");
    expect(formatCard(null, null)).toBeNull();
  });
});

function lastCharge(overrides: Partial<LastChargeView> = {}): LastChargeView {
  return {
    id: "inv-1",
    amountBrl: 39.9,
    debitDate: new Date("2026-09-12T12:00:00Z"),
    refundedAt: null,
    ...overrides,
  };
}

describe("canRefundLastCharge", () => {
  const now = new Date("2026-09-18T12:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  it("is false without a subscription or a charge", () => {
    expect(canRefundLastCharge(null, lastCharge(), now)).toBe(false);
    expect(canRefundLastCharge(sub(), null, now)).toBe(false);
  });

  it("is false once the charge was already refunded", () => {
    expect(canRefundLastCharge(sub(), lastCharge({ refundedAt: new Date("2026-09-17T00:00:00Z") }), now)).toBe(false);
  });

  it("is true while the subscription is live (authorized, past_due or paused)", () => {
    expect(canRefundLastCharge(sub({ status: "authorized" }), lastCharge(), now)).toBe(true);
    expect(canRefundLastCharge(sub({ status: "past_due" }), lastCharge(), now)).toBe(true);
    expect(canRefundLastCharge(sub({ status: "paused" }), lastCharge(), now)).toBe(true);
  });

  it("is true up to 30 days after cancelling", () => {
    expect(canRefundLastCharge(sub({ status: "cancelled", cancelledAt: daysAgo(10) }), lastCharge(), now)).toBe(true);
  });

  it("is false more than 30 days after cancelling", () => {
    expect(canRefundLastCharge(sub({ status: "cancelled", cancelledAt: daysAgo(40) }), lastCharge(), now)).toBe(false);
  });

  it("is false when cancelled without a cancellation date", () => {
    expect(canRefundLastCharge(sub({ status: "cancelled", cancelledAt: null }), lastCharge(), now)).toBe(false);
  });

  it("is false for other non-live statuses (pending, rejected)", () => {
    expect(canRefundLastCharge(sub({ status: "pending" }), lastCharge(), now)).toBe(false);
    expect(canRefundLastCharge(sub({ status: "rejected" }), lastCharge(), now)).toBe(false);
  });
});

describe("SubscriptionCard", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockUpdateCard.mockResolvedValue({ status: "updated" });
    mockUseLastCharge.mockReturnValue({ data: null, isLoading: false });
    const auth = await import("@/hooks/useAuth");
    vi.mocked(auth.useAuth).mockReturnValue(buildAuthState({ user: { id: "u1", email: "a@b.c" } }) as never);
  });

  it("renders nothing without access, for courtesy accounts, or while the subscription is unknown", () => {
    expect(renderCard(sub(), null).container).toBeEmptyDOMElement();
    expect(renderCard(sub(), access({ kind: "exempt", unlimited: true })).container).toBeEmptyDOMElement();
    expect(renderCard(undefined).container).toBeEmptyDOMElement();
  });

  it("shows the card to a super-admin even on a courtesy account (smoke plan)", () => {
    renderWithProviders(<SubscriptionCard subscription={sub()} access={access({ kind: "exempt", unlimited: true })} isSuperAdmin />);
    expect(screen.getByText("Ativa")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar assinatura" })).toBeInTheDocument();
  });

  it("invites a paying account without a subscription to subscribe", () => {
    renderCard(null, access({ kind: "legacy" }));
    expect(screen.getByText(/Assine um plano mensal/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Assinar um plano/ })).toHaveAttribute("href", "/assinar");
    expect(screen.queryByText(/Ativa/)).toBeNull();
  });

  it("tells a cancelled subscriber until when the plan credits last", () => {
    renderCard(sub({ status: "cancelled", cancelledAt: new Date("2026-09-20T00:00:00Z") }));
    expect(screen.getByText("Cancelada")).toBeInTheDocument();
    expect(screen.getByText(/valem até 12\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Assinar um plano/ })).toBeInTheDocument();
  });

  it("falls back to the generic invite when a cancelled period already ended", () => {
    renderCard(sub({ status: "cancelled" }), access({ kind: "subscriber", planCredits: 0, total: 0, paywalled: true }));
    expect(screen.getByText(/Assine um plano mensal/)).toBeInTheDocument();
  });

  it("shows the analysis line without a CTA while pending", () => {
    renderCard(sub({ status: "pending" }), access({ kind: "legacy" }));
    expect(screen.getByText("Em análise")).toBeInTheDocument();
    expect(screen.getByText(/confirmando o cartão/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("offers another card after a rejection", () => {
    renderCard(sub({ status: "rejected" }), access({ kind: "legacy" }));
    expect(screen.getByText("Cartão recusado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Tentar com outro cartão/ })).toHaveAttribute("href", "/assinar");
  });

  it("shows plan, price, next charge and card for a live subscription", () => {
    renderCard(sub());
    expect(screen.getByText("Ativa")).toBeInTheDocument();
    expect(screen.getByText(/Profissional · R\$\s*59,90\/mês/)).toBeInTheDocument();
    expect(screen.getByText("480 créditos por mês")).toBeInTheDocument();
    expect(screen.getByText("12/10/2026")).toBeInTheDocument();
    expect(screen.getByText("Master final 1234")).toBeInTheDocument();
  });

  it("degrades gracefully without plan, date or card", () => {
    renderCard(sub({ plan: null, nextPaymentDate: null, cardBrand: null, cardLastFour: null }));
    expect(screen.getByText("Plano", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("a confirmar")).toBeInTheDocument();
    expect(screen.getByText("não informado")).toBeInTheDocument();
  });

  it("flags a failed renewal", () => {
    renderCard(sub({ status: "past_due" }));
    expect(screen.getByText("Pagamento pendente")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/última cobrança não foi aprovada/);
  });

  it("cancels only after confirmation, telling until when the credits last", async () => {
    const user = userEvent.setup();
    renderCard(sub());
    await user.click(screen.getByRole("button", { name: "Cancelar assinatura" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/valendo até 12\/10\/2026/);

    await user.click(screen.getByRole("button", { name: "Manter assinatura" }));
    expect(mockCancel).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancelar assinatura" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancelar assinatura" }));
    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(cancelOpts).toHaveBeenCalledWith({ trial: false });
  });

  it("wording of the confirmation without a known period end", async () => {
    const user = userEvent.setup();
    renderCard(sub(), access({ periodEnd: null }));
    await user.click(screen.getByRole("button", { name: "Cancelar assinatura" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/até o fim do período pago/);
  });

  it("changes the card through a fresh Brick and closes on success", async () => {
    const user = userEvent.setup();
    renderCard(sub());
    await user.click(screen.getByRole("button", { name: /Trocar cartão/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent(/próxima cobrança de R\$\s*59,90/);
    expect(brickProps).toHaveBeenCalledWith(expect.objectContaining({ amount: 59.9, payerEmail: "a@b.c" }));

    await user.click(screen.getByRole("button", { name: "Salvar cartão" }));
    expect(mockUpdateCard).toHaveBeenCalledWith({ card: CARD, cardLastFour: null });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(brickProps).toHaveBeenCalledWith("resolved");
  });

  it("keeps the card dialog open when the new card is refused and shows Brick errors", async () => {
    const user = userEvent.setup();
    mockUpdateCard.mockRejectedValueOnce(new Error("recusado"));
    renderCard(sub());
    await user.click(screen.getByRole("button", { name: /Trocar cartão/ }));
    await user.click(screen.getByRole("button", { name: "Salvar cartão" }));
    await waitFor(() => expect(mockUpdateCard).toHaveBeenCalled());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // The Brick contract: a rejected promise re-enables its button.
    await waitFor(() => expect(brickProps).toHaveBeenCalledWith("rejected"));
    expect(screen.getByRole("alert")).toHaveTextContent("recusado");

    await user.click(screen.getByRole("button", { name: "Erro do Brick" }));
    expect(screen.getByRole("alert")).toHaveTextContent("brick quebrou");

    // Closing clears the error for the next attempt.
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: /Trocar cartão/ }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows a generic message when the failure is not an Error", async () => {
    const user = userEvent.setup();
    mockUpdateCard.mockRejectedValueOnce("boom");
    renderCard(sub());
    await user.click(screen.getByRole("button", { name: /Trocar cartão/ }));
    await user.click(screen.getByRole("button", { name: "Salvar cartão" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/não foi aceito/));
  });

  it("uses a placeholder amount and no payer when the plan or e-mail is unknown", async () => {
    const user = userEvent.setup();
    const auth = await import("@/hooks/useAuth");
    vi.mocked(auth.useAuth).mockReturnValue(buildAuthState({ user: { id: "u1" } }) as never);
    renderCard(sub({ plan: null }));
    await user.click(screen.getByRole("button", { name: /Trocar cartão/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent(/próxima cobrança\. Nada é cobrado agora/);
    expect(brickProps).toHaveBeenCalledWith(expect.objectContaining({ amount: 1, payerEmail: undefined }));
  });
});

describe("SubscriptionCard (trial with card)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockUpdateCard.mockResolvedValue({ status: "updated" });
    mockUseLastCharge.mockReturnValue({ data: null, isLoading: false });
    const auth = await import("@/hooks/useAuth");
    vi.mocked(auth.useAuth).mockReturnValue(buildAuthState({ user: { id: "u1", email: "a@b.c" } }) as never);
  });

  const trialSub = () => sub({
    status: "authorized",
    plan: { ...PLAN, slug: "basico", name: "Básico", priceBrl: 39.9, monthlyCredits: 300, highlight: false },
    firstPaymentConfirmed: false,
    trialEndsAt: new Date("2026-09-22T12:00:00Z"),
    nextPaymentDate: new Date("2026-09-22T12:00:00Z"),
    cardBrand: "visa",
    cardLastFour: "5682",
  });
  const trialAccess = () => access({ kind: "trial", planCredits: 42, total: 47, periodEnd: new Date("2026-09-22T12:00:00Z"), daysLeft: 7 });

  it("shows the trial, the first charge and the immediate consequence of cancelling", () => {
    renderWithProviders(<SubscriptionCard subscription={trialSub()} access={trialAccess()} />);
    expect(screen.getByText("Teste grátis")).toBeInTheDocument();
    expect(screen.getByText(/depois Básico · R\$\s*39,90\/mês/)).toBeInTheDocument();
    expect(screen.getByText("Primeira cobrança")).toBeInTheDocument();
    expect(screen.getByText("22/09/2026")).toBeInTheDocument();
    expect(screen.getByText(/42 créditos do teste até 22\/09\/2026\. Cancelar agora encerra o acesso na hora e nada é cobrado\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar teste" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Trocar cartão/ })).toBeInTheDocument();
  });

  it("uses the singular for a single credit left in the trial", () => {
    renderWithProviders(
      <SubscriptionCard subscription={trialSub()} access={access({ kind: "trial", planCredits: 1, total: 6, periodEnd: new Date("2026-09-22T12:00:00Z"), daysLeft: 7 })} />,
    );
    expect(screen.getByText(/Você tem 1 crédito do teste até 22\/09\/2026\. Cancelar agora encerra o acesso na hora e nada é cobrado\./)).toBeInTheDocument();
  });

  it("confirms the trial cancellation with its own copy and cancels", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SubscriptionCard subscription={trialSub()} access={trialAccess()} />);
    await user.click(screen.getByRole("button", { name: "Cancelar teste" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Cancelar o teste?");
    expect(dialog).toHaveTextContent(/Nada será cobrado\. Seus créditos do teste são removidos na hora; os extras não expiram\./);
    await user.click(within(dialog).getByRole("button", { name: "Cancelar teste" }));
    expect(mockCancel).toHaveBeenCalled();
    expect(cancelOpts).toHaveBeenCalledWith({ trial: true });
  });
});

describe("SubscriptionCard (refund)", () => {
  const REFUND_BUTTON = "Pedir estorno da última cobrança";

  beforeEach(async () => {
    vi.clearAllMocks();
    mockUpdateCard.mockResolvedValue({ status: "updated" });
    mockUseLastCharge.mockReturnValue({ data: null, isLoading: false });
    const auth = await import("@/hooks/useAuth");
    vi.mocked(auth.useAuth).mockReturnValue(buildAuthState({ user: { id: "u1", email: "a@b.c" } }) as never);
  });

  it("offers the refund on a live subscription with a charge", () => {
    mockUseLastCharge.mockReturnValue({ data: lastCharge(), isLoading: false });
    renderCard(sub());
    expect(screen.getByRole("button", { name: REFUND_BUTTON })).toBeInTheDocument();
  });

  it("hides the refund button once the charge was already refunded, showing when it was requested instead", () => {
    mockUseLastCharge.mockReturnValue({ data: lastCharge({ refundedAt: new Date("2026-09-17T10:00:00Z") }), isLoading: false });
    renderCard(sub());
    expect(screen.queryByRole("button", { name: REFUND_BUTTON })).toBeNull();
    expect(screen.getByText(/Estorno de R\$\s*39,90 solicitado em 17\/09\/2026\./)).toBeInTheDocument();
  });

  it("falls back to zero when the refunded charge has no amount on record", () => {
    mockUseLastCharge.mockReturnValue({ data: lastCharge({ amountBrl: null, refundedAt: new Date("2026-09-17T10:00:00Z") }), isLoading: false });
    renderCard(sub());
    expect(screen.getByText(/Estorno de R\$\s*0,00 solicitado em 17\/09\/2026\./)).toBeInTheDocument();
  });

  it("hides the refund button during the card trial before any charge exists", () => {
    const trialSub = sub({
      plan: { ...PLAN, slug: "basico", name: "Básico", priceBrl: 39.9, monthlyCredits: 300, highlight: false },
      firstPaymentConfirmed: false,
      trialEndsAt: new Date("2026-09-22T12:00:00Z"),
    });
    renderCard(trialSub, access({ kind: "trial", planCredits: 42, total: 47, periodEnd: new Date("2026-09-22T12:00:00Z"), daysLeft: 7 }));
    expect(screen.queryByRole("button", { name: REFUND_BUTTON })).toBeNull();
  });

  it("offers the refund on a subscription cancelled 10 days ago", () => {
    mockUseLastCharge.mockReturnValue({ data: lastCharge(), isLoading: false });
    const now = new Date("2026-09-18T12:00:00Z");
    renderWithProviders(
      <SubscriptionCard
        subscription={sub({ status: "cancelled", cancelledAt: new Date("2026-09-08T12:00:00Z") })}
        access={access()}
        now={now}
      />,
    );
    expect(screen.getByRole("button", { name: REFUND_BUTTON })).toBeInTheDocument();
  });

  it("does not offer the refund on a subscription cancelled 40 days ago", () => {
    mockUseLastCharge.mockReturnValue({ data: lastCharge(), isLoading: false });
    const now = new Date("2026-09-18T12:00:00Z");
    renderWithProviders(
      <SubscriptionCard
        subscription={sub({ status: "cancelled", cancelledAt: new Date("2026-08-09T12:00:00Z") })}
        access={access()}
        now={now}
      />,
    );
    expect(screen.queryByRole("button", { name: REFUND_BUTTON })).toBeNull();
  });

  it("confirms with the exact copy and calls refund.mutate", async () => {
    const user = userEvent.setup();
    mockUseLastCharge.mockReturnValue({ data: lastCharge(), isLoading: false });
    renderCard(sub(), access({ planCredits: 200 }));
    await user.click(screen.getByRole("button", { name: REFUND_BUTTON }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Estornar a última cobrança?");
    expect(dialog).toHaveTextContent(
      /Devolvemos R\$\s*39,90 no mesmo cartão \(pode levar até duas faturas\), os 200 créditos restantes do plano são removidos e a assinatura é cancelada\. Os créditos extras ficam\./,
    );
    await user.click(within(dialog).getByRole("button", { name: "Manter" }));
    expect(mockRefund).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: REFUND_BUTTON }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Pedir estorno" }));
    expect(mockRefund).toHaveBeenCalledTimes(1);
  });
});
