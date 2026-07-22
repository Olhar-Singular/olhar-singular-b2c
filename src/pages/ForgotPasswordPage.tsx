import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { parseAuthError } from "@/lib/utils/errors";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const RESEND_COOLDOWN_SECONDS = 60;

function BackToLogin() {
  return (
    <div className="mt-4 text-center text-sm text-muted-foreground">
      <Link to="/auth" className="text-primary font-medium hover:underline">
        Voltar para login
      </Link>
    </div>
  );
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function sendLink(target: string) {
    setSubmitting(true);
    setError("");
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(target, {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });
      if (err) {
        setError(parseAuthError(err.message));
        return;
      }
      setSentTo(target);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email) return setError("Informe seu e-mail.");
    await sendLink(email);
  }

  const alert = error && (
    <div
      role="alert"
      className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {error}
    </div>
  );

  if (sentTo) {
    return (
      <AuthLayout title="Verifique seu e-mail" description="Enviamos as instruções de redefinição">
        {alert}
        <div className="space-y-4">
          {/* Neutral by design: never reveals whether the account exists. */}
          <p className="text-sm text-muted-foreground">
            Se houver uma conta com <span className="font-medium text-foreground">{sentTo}</span>,
            enviamos um link para redefinir a senha. Verifique sua caixa de entrada e a pasta de
            spam.
          </p>
          <Button
            type="button"
            className="w-full"
            onClick={() => sendLink(sentTo)}
            disabled={submitting || cooldown > 0}
          >
            {cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar e-mail"}
          </Button>
        </div>
        <BackToLogin />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Esqueci minha senha"
      description="Enviaremos um link para você criar uma nova senha"
    >
      {alert}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="forgot-email">E-mail</Label>
          <Input
            id="forgot-email"
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
          />
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Enviando..." : "Enviar link de redefinição"}
        </Button>
      </form>
      <BackToLogin />
    </AuthLayout>
  );
}
