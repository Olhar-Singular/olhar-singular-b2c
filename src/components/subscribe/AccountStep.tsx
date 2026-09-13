import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ACCOUNT_FORM_MESSAGES, validateAccountForm } from "@/lib/domain/subscriptionUi";

export interface AccountDraft {
  fullName: string;
  email: string;
}

interface Props {
  onConfirm: (account: AccountDraft) => void;
  initial?: AccountDraft;
}

// First step of the anonymous checkout: who is buying. The e-mail is typed
// twice on purpose (decision 13: no confirmation e-mail is sent, the paid card
// is the proof, so a typo here would lock the buyer out of their own account).
export default function AccountStep({ onConfirm, initial }: Props) {
  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [emailConfirmation, setEmailConfirmation] = useState(initial?.email ?? "");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateAccountForm({ fullName, email, emailConfirmation, acceptedTerms });
    if (problem) {
      setError(ACCOUNT_FORM_MESSAGES[problem]);
      return;
    }
    setError(null);
    onConfirm({ fullName: fullName.trim(), email: email.trim().toLowerCase() });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="account-name">Nome completo</Label>
        <Input
          id="account-name"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Como quer ser chamado na plataforma"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="account-email">E-mail</Label>
        <Input
          id="account-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@exemplo.com"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="account-email-confirmation">Confirme o e-mail</Label>
        <Input
          id="account-email-confirmation"
          type="email"
          autoComplete="off"
          value={emailConfirmation}
          onChange={(e) => setEmailConfirmation(e.target.value)}
          placeholder="Digite de novo"
        />
        <p className="text-xs text-muted-foreground">
          É com este e-mail que você entra na plataforma. Não enviamos e-mail de confirmação: o pagamento aprovado já libera o acesso.
        </p>
      </div>
      <div className="flex items-start gap-2">
        <Checkbox
          id="account-terms"
          checked={acceptedTerms}
          onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
        />
        <Label htmlFor="account-terms" className="text-sm font-normal leading-snug">
          Li e aceito os{" "}
          <Link to="/termos" className="underline" target="_blank" rel="noreferrer">
            Termos de Uso
          </Link>{" "}
          e a{" "}
          <Link to="/privacidade" className="underline" target="_blank" rel="noreferrer">
            Política de Privacidade
          </Link>
          .
        </Label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full">
        Continuar para o pagamento
      </Button>
    </form>
  );
}
