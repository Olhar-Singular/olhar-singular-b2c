import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CreateUserInput } from "@/types/admin";

interface Props {
  onCreate: (input: CreateUserInput) => Promise<unknown>;
  disabled?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const MODE_COPY: Record<CreateUserInput["mode"], { label: string; hint: string }> = {
  trial: { label: "Teste", hint: "7 dias e 50 créditos, contados a partir do aceite do convite. Depois, paywall." },
  exempt: { label: "Cortesia", hint: "Acesso sem cobrança e sem prazo. Nada é debitado." },
};

// The only way an account is born outside the paid checkout (decision 15):
// the admin invites by e-mail, Supabase sends the link, the person creates the
// password on /redefinir-senha?convite=1.
export function CreateUserDialog({ onCreate, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [mode, setMode] = useState<CreateUserInput["mode"]>("trial");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setEmail("");
    setFullName("");
    setMode("trial");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (fullName.trim().length < 2) return setError("Informe o nome completo.");
    if (!EMAIL_RE.test(cleanEmail)) return setError("Informe um e-mail válido.");
    setError(null);
    setSubmitting(true);
    try {
      await onCreate({ email: cleanEmail, fullName: fullName.trim(), mode });
      setOpen(false);
      reset();
    } catch {
      // The hook already toasted the reason; keep the form for a retry.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5" disabled={disabled}>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Criar usuário
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Criar usuário por convite</DialogTitle>
            <DialogDescription>
              A pessoa recebe um e-mail para criar a senha. Contas pagas nascem pelo checkout, não por aqui.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="invite-name">Nome completo</Label>
            <Input id="invite-name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">E-mail</Label>
            <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Tipo de acesso</legend>
            {(Object.keys(MODE_COPY) as CreateUserInput["mode"][]).map((option) => (
              <label key={option} className="flex items-start gap-2 rounded-md border border-border p-3 text-sm has-[:checked]:border-primary">
                <input
                  type="radio"
                  name="invite-mode"
                  value={option}
                  checked={mode === option}
                  onChange={() => setMode(option)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">{MODE_COPY[option].label}</span>
                  <span className="block text-muted-foreground">{MODE_COPY[option].hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Enviando..." : "Enviar convite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
