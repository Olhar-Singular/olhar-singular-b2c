// pt-BR copy for Mercado Pago card rejection reasons (payment.status_detail).
// Shown to the buyer inside the card dialog so a declined card is actionable
// instead of a generic failure. Anything not listed falls back to a neutral
// message: MP adds details over time and an unknown one must never crash the UI.

export const STATUS_DETAIL_MESSAGES: Record<string, string> = {
  cc_rejected_insufficient_amount:
    "O cartão não tem limite ou saldo suficiente para esta compra.",
  cc_rejected_bad_filled_card_number:
    "O número do cartão parece incorreto. Confira e tente de novo.",
  cc_rejected_bad_filled_date:
    "A data de validade parece incorreta. Confira e tente de novo.",
  cc_rejected_bad_filled_security_code:
    "O código de segurança parece incorreto. Confira e tente de novo.",
  cc_rejected_bad_filled_other:
    "Algum dado do cartão parece incorreto. Confira e tente de novo.",
  cc_rejected_call_for_authorize:
    "O banco pediu autorização para esta compra. Ligue para o emissor do cartão e tente de novo.",
  cc_rejected_card_disabled:
    "Este cartão está desativado. Fale com o emissor ou use outro cartão.",
  cc_rejected_duplicated_payment:
    "Você já fez um pagamento com este valor há pouco. Se foi engano, aguarde alguns minutos.",
  cc_rejected_high_risk:
    "O pagamento foi recusado pela análise de segurança. Tente outro cartão ou pague com Pix.",
  cc_rejected_max_attempts:
    "Você atingiu o limite de tentativas com este cartão. Tente de novo mais tarde ou use outro.",
  cc_rejected_blacklist:
    "O pagamento não foi autorizado para este cartão. Tente outro cartão ou pague com Pix.",
  cc_rejected_other_reason:
    "O cartão recusou o pagamento. Tente outro cartão ou pague com Pix.",
};

const FALLBACK = "O pagamento não foi aprovado. Tente outro cartão ou pague com Pix.";

export function statusDetailMessage(detail: string | null | undefined): string {
  if (!detail) return FALLBACK;
  return STATUS_DETAIL_MESSAGES[detail] ?? FALLBACK;
}
