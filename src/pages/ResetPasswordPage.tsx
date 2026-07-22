import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { parseAuthError } from "@/lib/utils/errors";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * `checking` resolves via getSession(), which already awaits the client
 * initialization that consumes the `#access_token=...&type=recovery` hash.
 * onAuthStateChange only covers the event landing after mount.
 */
type Phase = "checking" | "ready" | "invalid";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setEmail(session.user.email ?? "");
        setPhase("ready");
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setEmail(data.session.user.email ?? "");
      setPhase((prev) => (data.session || prev === "ready" ? "ready" : "invalid"));
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) return setError("A senha deve ter pelo menos 6 caracteres.");
    if (password !== confirmation) return setError("As senhas não coincidem.");

    setSubmitting(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) {
        setError(parseAuthError(err.message));
        return;
      }
      // The recovery session must not outlive the reset.
      await supabase.auth.signOut();
      toast.success("Senha redefinida! Entre com a nova senha.");
      navigate("/auth", { replace: true });
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === "checking") {
    return (
      <AuthLayout title="Redefinir senha" description="Validando seu link">
        <p className="text-sm text-muted-foreground text-center">Verificando o link...</p>
      </AuthLayout>
    );
  }

  if (phase === "invalid") {
    return (
      <AuthLayout title="Link inválido ou expirado" description="Não foi possível validar seu link">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Este link de redefinição não é mais válido. Ele pode ter expirado ou já ter sido usado.
            Solicite um novo para continuar.
          </p>
          <Button asChild className="w-full">
            <Link to="/esqueci-senha">Solicitar novo link</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Redefinir senha" description="Escolha uma nova senha para sua conta">
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Lets the password manager tie the new password to the account. */}
        <input type="hidden" name="email" autoComplete="username" value={email} />
        <div className="space-y-2">
          <Label htmlFor="new-password">Nova senha</Label>
          <div className="relative">
            <Input
              id="new-password"
              type={showPassword ? "text" : "password"}
              name="new-password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirmar senha</Label>
          <Input
            id="confirm-password"
            type={showPassword ? "text" : "password"}
            name="confirm-password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder="••••••••"
            minLength={6}
          />
        </div>

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Salvando..." : "Redefinir senha"}
        </Button>
      </form>
    </AuthLayout>
  );
}
