import { Link } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface AccountDraft {
  fullName: string;
  email: string;
}

export interface AccountForm {
  fullName: string;
  email: string;
  emailConfirmation: string;
  acceptedTerms: boolean;
}

export const EMPTY_ACCOUNT_FORM: AccountForm = { fullName: "", email: "", emailConfirmation: "", acceptedTerms: false };

interface Props {
  value: AccountForm;
  onChange: (next: AccountForm) => void;
  /** The checkout's validation message, set when its own button is pressed. */
  error: string | null;
}

// Who is buying, on the same screen as the plan and the payment: the page owns
// the values and checks them when its call to action is pressed. The e-mail is
// typed twice on purpose (decision 13: no confirmation e-mail is sent, the paid
// card is the proof, so a typo here would lock the buyer out of their own account).
export default function AccountStep({ value, onChange, error }: Props) {
  const set = (patch: Partial<AccountForm>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="account-name">Nome completo</Label>
        <Input
          id="account-name"
          autoComplete="name"
          value={value.fullName}
          onChange={(e) => set({ fullName: e.target.value })}
          placeholder="Como quer ser chamado na plataforma"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="account-email">E-mail</Label>
        <Input
          id="account-email"
          type="email"
          autoComplete="email"
          value={value.email}
          onChange={(e) => set({ email: e.target.value })}
          placeholder="voce@exemplo.com"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="account-email-confirmation">Confirme o e-mail</Label>
        <Input
          id="account-email-confirmation"
          type="email"
          autoComplete="off"
          value={value.emailConfirmation}
          onChange={(e) => set({ emailConfirmation: e.target.value })}
          placeholder="Digite de novo"
        />
        <p className="text-xs text-muted-foreground">
          É com este e-mail que você entra na plataforma. Não enviamos e-mail de confirmação: o pagamento aprovado já libera o acesso.
        </p>
      </div>
      <div className="flex items-start gap-2">
        <Checkbox
          id="account-terms"
          checked={value.acceptedTerms}
          onCheckedChange={(checked) => set({ acceptedTerms: checked === true })}
        />
        <Label htmlFor="account-terms" className="text-sm font-normal leading-snug">
          Li e aceito os{" "}
          <Link to="/termos" className="underline" target="_blank" rel="noreferrer">
            Termos de Uso
          </Link>
          , a{" "}
          <Link to="/privacidade" className="underline" target="_blank" rel="noreferrer">
            Política de Privacidade
          </Link>{" "}
          e a{" "}
          <Link to="/reembolso" className="underline" target="_blank" rel="noreferrer">
            Política de Reembolso
          </Link>
          .
        </Label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive-strong">
          {error}
        </p>
      )}
    </div>
  );
}
