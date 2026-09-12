import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { parseAuthError } from "@/lib/utils/errors";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Login only. There is no public signup anymore: accounts are born either by
// the paid checkout (subscription) or by an admin invite (trial / courtesy).
// The old ?signup=1 deep link is still honoured with an explanation, since it
// lives in e-mails and bookmarks out there.
export default function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session, loading } = useAuth();
  const cameForSignup = searchParams.get("signup") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && session) navigate("/dashboard", { replace: true });
  }, [session, loading, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email || !password) return setError("Preencha todos os campos.");
    if (password.length < 6) return setError("A senha deve ter pelo menos 6 caracteres.");

    setSubmitting(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) {
        setError(parseAuthError(err.message, "login"));
        return;
      }
      navigate("/dashboard", { replace: true });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Entrar" description="Acesse sua conta para continuar">
      {cameForSignup && (
        <p
          role="status"
          className="mb-4 rounded-md bg-primary/10 px-3 py-2 text-sm text-foreground"
        >
          O cadastro é feito pela assinatura ou por convite. Se você já recebeu um convite,
          use o link do e-mail; se já tem conta, entre abaixo.
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="auth-email">E-mail</Label>
          <Input
            id="auth-email"
            type="email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="auth-password">Senha</Label>
          <div className="relative">
            <Input
              id="auth-password"
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete="current-password"
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
          <div className="text-right">
            <Link to="/esqueci-senha" className="text-sm text-primary font-medium hover:underline">
              Esqueci minha senha
            </Link>
          </div>
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Aguarde..." : "Entrar"}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        Ainda não tem conta?{" "}
        <Link to="/" className="text-primary font-medium hover:underline">
          Conheça os planos
        </Link>
      </p>
    </AuthLayout>
  );
}
