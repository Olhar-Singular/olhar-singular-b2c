import { useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { userDisplayName } from "@/lib/utils/adminFormat";
import { isCardTrialUser } from "@/lib/utils/adminAccess";
import type { AdminUser, ChangeEmailInput, SetAccessInput } from "@/types/admin";

interface AccessMenuProps {
  user: AdminUser;
  onSetAccess: (input: SetAccessInput) => void;
  /** Resolves when saved; a rejection keeps the dialog (and the typed value) open. */
  onChangeEmail?: (input: ChangeEmailInput) => void | Promise<unknown>;
  onCancelSubscription?: (input: { userId: string }) => void;
  disabled?: boolean;
}

const LIVE_SUBSCRIPTION = ["authorized", "past_due", "paused"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const KIND_LABELS = {
  trial: "Período de teste (7 dias, 50 créditos)",
  exempt: "Cortesia (sem cobrança)",
  legacy: "Legado (só créditos extras)",
} as const;

const EXTEND_PRESETS = [7, 14, 30] as const;

// Support actions on one account: change how it gets in (trial / courtesy /
// legacy) or give a running trial more days. Kind changes are confirmed
// because they move the user across the paywall; extensions are one click.
export function AccessMenu({
  user,
  onSetAccess,
  onChangeEmail = () => {},
  onCancelSubscription = () => {},
  disabled = false,
}: AccessMenuProps) {
  const [pendingKind, setPendingKind] = useState<keyof typeof KIND_LABELS | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const cardTrial = isCardTrialUser(user);
  const canExtend = user.access_kind === "trial" && user.trial_started_at !== null && !cardTrial;
  const hasLiveSubscription = !!user.subscription && LIVE_SUBSCRIPTION.includes(user.subscription.status);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      setEmailError("Informe um e-mail válido.");
      return;
    }
    if (email === (user.email ?? "").toLowerCase()) {
      setEmailError("É o mesmo e-mail atual.");
      return;
    }
    setSavingEmail(true);
    try {
      await onChangeEmail({ userId: user.id, email });
      setEmailOpen(false);
      setNewEmail("");
      setEmailError(null);
    } catch {
      // The hook toasted the reason; keep the value so the admin can fix it.
    } finally {
      setSavingEmail(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            aria-label={`Alterar acesso de ${userDisplayName(user)}`}
          >
            <Settings2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Alterar acesso</DropdownMenuLabel>
          {(Object.keys(KIND_LABELS) as Array<keyof typeof KIND_LABELS>).map((kind) => (
            <DropdownMenuItem
              key={kind}
              disabled={user.access_kind === kind}
              onSelect={() => setPendingKind(kind)}
            >
              {KIND_LABELS[kind]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Estender período de teste</DropdownMenuLabel>
          {cardTrial && (
            <p className="px-2 pb-1.5 text-xs text-muted-foreground">
              Teste com cartão: a cobrança do 8º dia é fixa no Mercado Pago. Conceda créditos extras ou cancele o teste.
            </p>
          )}
          {EXTEND_PRESETS.map((days) => (
            <DropdownMenuItem
              key={days}
              disabled={!canExtend}
              onSelect={() => onSetAccess({ userId: user.id, extendDays: days })}
            >
              +{days} dias
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Conta</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setEmailOpen(true)}>Alterar e-mail</DropdownMenuItem>
          <DropdownMenuItem disabled={!hasLiveSubscription} onSelect={() => setConfirmCancel(true)}>
            Cancelar assinatura
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={emailOpen} onOpenChange={(open) => { setEmailOpen(open); setEmailError(null); }}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submitEmail} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>Alterar e-mail</DialogTitle>
              <DialogDescription>
                {userDisplayName(user)} passa a entrar com o novo e-mail, já confirmado. Use para corrigir um erro de digitação no checkout.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor={`new-email-${user.id}`}>Novo e-mail</Label>
              <Input
                id={`new-email-${user.id}`}
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder={user.email ?? "novo@exemplo.com"}
              />
              {emailError && (
                <p role="alert" className="text-sm text-destructive">
                  {emailError}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={savingEmail}>{savingEmail ? "Salvando..." : "Salvar e-mail"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar a assinatura?</AlertDialogTitle>
            <AlertDialogDescription>
              A cobrança mensal de {userDisplayName(user)} para no Mercado Pago. Os créditos do período já pago continuam até o fim.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter</AlertDialogCancel>
            <AlertDialogAction onClick={() => onCancelSubscription({ userId: user.id })}>Cancelar assinatura</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {pendingKind && (
        <AlertDialog open onOpenChange={() => setPendingKind(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Alterar acesso?</AlertDialogTitle>
              <AlertDialogDescription>
                {userDisplayName(user)} passa a: {KIND_LABELS[pendingKind]}.
                {pendingKind === "trial" && " O período de teste começa agora, se o e-mail já estiver confirmado."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  onSetAccess({ userId: user.id, kind: pendingKind });
                  setPendingKind(null);
                }}
              >
                Confirmar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
