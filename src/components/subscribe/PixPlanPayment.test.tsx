import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import PixPlanPayment from "./PixPlanPayment";
import { renderWithProviders } from "@/test/helpers";
import { DEFAULT_PREPAID_PLANS } from "@/lib/domain/prepaid";

const create = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const pixStatus = vi.hoisted(() => ({ value: "pending" as string }));
vi.mock("@/hooks/usePrepaid", () => ({
  useCreatePixPlan: () => create,
  usePixPlanStatus: (purchaseId: string | null) => (purchaseId ? pixStatus.value : "idle"),
}));

const refreshProfile = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ refreshProfile }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const THREE = DEFAULT_PREPAID_PLANS[1];
const ONE = DEFAULT_PREPAID_PLANS[0];
const ACCOUNT = { fullName: "Ana Souza", email: "ana@x.com", termsVersion: "2026-11.1" };
const QR = {
  purchaseId: "pur-1",
  qrCode: "00020126580014br.gov.bcb.pix",
  qrCodeBase64: "iVBOR",
  expiresAt: "2099-01-01T00:00:00.000Z",
  amountBrl: 89.9,
  credits: 900,
  months: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  create.isPending = false;
  create.mutateAsync.mockResolvedValue(QR);
  pixStatus.value = "pending";
});

async function generate() {
  await userEvent.click(screen.getByRole("button", { name: /Gerar meu código Pix/ }));
}

describe("PixPlanPayment", () => {
  it("before the QR: the step, the amount due today and the one-off note", () => {
    renderWithProviders(<PixPlanPayment plan={THREE} getAccount={() => ACCOUNT} />);
    expect(screen.getByRole("heading", { level: 2, name: "2. Pague com o app do seu banco" })).toBeInTheDocument();
    const bar = screen.getByTestId("checkout-cta");
    expect(bar).toHaveTextContent(/Você paga hoje\s*R\$\s89,90/);
    expect(bar).toHaveTextContent("Pagamento único. Sem renovação automática.");
    expect(bar).toHaveTextContent("Pagamento único. Nada é cobrado de novo sem você pedir.");
    // The release note lives under the plans (PrepaidPlanPicker); the button does not repeat it.
    expect(bar).not.toHaveTextContent(/entram no 8º dia/);
    expect(screen.queryByRole("img", { name: "QR code do Pix" })).toBeNull();
  });

  it("an anonymous buyer sends the account with the plan and gets the QR, the copy-and-paste code and the waiting status", async () => {
    renderWithProviders(<PixPlanPayment plan={THREE} getAccount={() => ACCOUNT} />);
    await generate();
    expect(create.mutateAsync).toHaveBeenCalledWith({ planSlug: "pix-3-meses", account: ACCOUNT });
    expect(screen.getByRole("img", { name: "QR code do Pix" })).toHaveAttribute("src", "data:image/png;base64,iVBOR");
    expect(screen.getByText("Escaneie o QR code no app do seu banco.")).toBeInTheDocument();
    expect(screen.getByText("Ou use o Pix copia e cola")).toBeInTheDocument();
    expect(screen.getByText(QR.qrCode)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Assim que o pagamento cair, seu acesso é liberado automaticamente. Normalmente leva alguns segundos.",
    );
    expect(screen.queryByTestId("checkout-cta")).toBeNull();
  });

  it("a logged-in buyer sends only the plan", async () => {
    renderWithProviders(<PixPlanPayment plan={THREE} />);
    await generate();
    expect(create.mutateAsync).toHaveBeenCalledWith({ planSlug: "pix-3-meses" });
  });

  it("copies the code, and says so when the browser refuses", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PixPlanPayment plan={THREE} getAccount={() => ACCOUNT} />);
    await user.click(screen.getByRole("button", { name: /Gerar meu código Pix/ }));
    const write = vi.spyOn(navigator.clipboard, "writeText");
    await user.click(screen.getByRole("button", { name: /Copiar/ }));
    expect(write).toHaveBeenCalledWith(QR.qrCode);
    expect(toast.success).toHaveBeenCalledWith("Código Pix copiado.");

    write.mockRejectedValueOnce(new Error("denied"));
    await user.click(screen.getByRole("button", { name: /Copiar/ }));
    expect(toast.error).toHaveBeenCalledWith("Não foi possível copiar. Selecione o código e copie manualmente.");
  });

  it("confirmed, anonymous: points to the access link sent to the e-mail", async () => {
    pixStatus.value = "approved";
    renderWithProviders(<PixPlanPayment plan={THREE} getAccount={() => ACCOUNT} />);
    await generate();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Pagamento confirmado! Enviamos para ana@x.com o link de acesso. Abra o e-mail para entrar e criar sua senha.",
    );
    expect(screen.getByRole("link", { name: "Ir para a tela de entrada" })).toHaveAttribute("href", "/auth");
    expect(screen.queryByRole("img", { name: "QR code do Pix" })).toBeNull();
    expect(refreshProfile).not.toHaveBeenCalled();
  });

  it("confirmed, logged in: the credits already in the account and the way to start, once", async () => {
    pixStatus.value = "approved";
    const { rerender } = renderWithProviders(<PixPlanPayment plan={THREE} />);
    await generate();
    expect(screen.getByRole("status")).toHaveTextContent("Pagamento confirmado! 300 créditos já estão na sua conta.");
    expect(screen.getByRole("link", { name: /Começar a adaptar/ })).toHaveAttribute("href", "/adaptar");
    expect(screen.getByRole("link", { name: /Começar a adaptar/ })).toHaveClass("text-[1.1875rem]", "font-bold");
    expect(refreshProfile).toHaveBeenCalledTimes(1);
    rerender(<PixPlanPayment plan={THREE} />);
    expect(refreshProfile).toHaveBeenCalledTimes(1);
  });

  it.each(["expired", "failed"])("%s: offers a new code", async (value) => {
    pixStatus.value = value;
    renderWithProviders(<PixPlanPayment plan={ONE} getAccount={() => ACCOUNT} />);
    await generate();
    expect(screen.getByRole("status")).toHaveTextContent("O Pix expirou ou não foi concluído. Gere um novo código para tentar de novo.");
    await userEvent.click(screen.getByRole("button", { name: "Gerar novo código" }));
    expect(create.mutateAsync).toHaveBeenCalledTimes(2);
  });

  it("shows the server's refusal inline, with the way in for an e-mail that has an account", async () => {
    create.mutateAsync.mockRejectedValueOnce(Object.assign(new Error("Este e-mail já tem conta. Entre para pagar."), { code: "email_exists" }));
    renderWithProviders(<PixPlanPayment plan={THREE} getAccount={() => ACCOUNT} />);
    await generate();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Este e-mail já tem conta. Entre para pagar.");
    expect(within(alert).getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/auth");
    expect(screen.getByTestId("checkout-cta")).toBeInTheDocument();
  });

  it("other refusals carry no login link; a new attempt clears the message", async () => {
    create.mutateAsync.mockRejectedValueOnce(new Error("Erro ao gerar o Pix. Tente novamente."));
    renderWithProviders(<PixPlanPayment plan={THREE} getAccount={() => ACCOUNT} />);
    await generate();
    expect(screen.getByRole("alert")).toHaveTextContent("Erro ao gerar o Pix. Tente novamente.");
    expect(screen.queryByRole("link", { name: "Entrar" })).toBeNull();
    await generate();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("an anonymous buyer with an incomplete account generates nothing (the page shows what is missing)", async () => {
    renderWithProviders(<PixPlanPayment plan={THREE} getAccount={() => null} />);
    await generate();
    expect(create.mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByTestId("checkout-cta")).toBeInTheDocument();
  });

  it("numbers its heading after the steps above it", () => {
    renderWithProviders(<PixPlanPayment plan={THREE} step={3} />);
    expect(screen.getByRole("heading", { level: 2, name: "3. Pague com o app do seu banco" })).toBeInTheDocument();
  });

  it("disables the button while the QR is being generated", () => {
    create.isPending = true;
    renderWithProviders(<PixPlanPayment plan={THREE} getAccount={() => ACCOUNT} />);
    expect(screen.getByRole("button", { name: /Gerar meu código Pix/ })).toBeDisabled();
  });

  it("a 1-month plan has no release note under the button", () => {
    renderWithProviders(<PixPlanPayment plan={ONE} getAccount={() => ACCOUNT} />);
    expect(screen.getByTestId("checkout-cta")).toHaveTextContent("Pagamento único. Nada é cobrado de novo sem você pedir.");
  });
});
