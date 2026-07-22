import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { parseAuthError } from "@/lib/utils/errors";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Google "G" mark (official multicolor), inline to avoid an image asset. */
function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export default function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session, loading } = useAuth();
  const [isLogin, setIsLogin] = useState(searchParams.get("signup") !== "1");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!loading && session) navigate("/dashboard", { replace: true });
  }, [session, loading, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email || !password) return setError("Preencha todos os campos.");
    if (!isLogin && !name) return setError("Informe seu nome.");
    if (password.length < 6) return setError("A senha deve ter pelo menos 6 caracteres.");

    setSubmitting(true);
    try {
      if (isLogin) {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) {
          setError(parseAuthError(err.message, "login"));
          return;
        }
        navigate("/dashboard", { replace: true });
      } else {
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name } },
        });
        if (err) {
          setError(parseAuthError(err.message, "signup"));
          return;
        }
        toast.success("Conta criada! Verifique seu e-mail para confirmar o cadastro.");
        setPendingEmail(email);
        setCooldown(60);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError("");
    try {
      const { error: err } = await supabase.auth.resend({ type: "signup", email: pendingEmail });
      if (err) {
        setError(parseAuthError(err.message, "signup"));
        return;
      }
      toast.success("E-mail de confirmação reenviado.");
      setCooldown(60);
    } finally {
      setResending(false);
    }
  }

  async function handleGoogle() {
    setError("");
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (err) setError(parseAuthError(err.message, "login"));
  }

  function handleBackToLogin() {
    setPendingEmail("");
    setCooldown(0);
    setError("");
    setPassword("");
    setIsLogin(true);
  }

  return (
    <AuthLayout
      title={pendingEmail ? "Verifique seu e-mail" : isLogin ? "Entrar" : "Criar conta"}
      description={
        pendingEmail
          ? "Falta só confirmar o cadastro"
          : isLogin
            ? "Acesse sua conta para continuar"
            : "Crie sua conta e comece a adaptar atividades"
      }
    >
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {pendingEmail ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Enviamos um link de confirmação para{" "}
            <span className="font-medium text-foreground">{pendingEmail}</span>. Verifique sua
            caixa de entrada e a pasta de spam.
          </p>
          <Button
            type="button"
            className="w-full"
            onClick={handleResend}
            disabled={resending || cooldown > 0}
          >
            {resending
              ? "Reenviando..."
              : cooldown > 0
                ? `Reenviar em ${cooldown}s`
                : "Reenviar e-mail"}
          </Button>
          <div className="text-center text-sm text-muted-foreground">
            <button
              type="button"
              onClick={handleBackToLogin}
              className="text-primary font-medium hover:underline"
            >
              Voltar para login
            </button>
          </div>
        </div>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="name">Nome completo</Label>
                <Input
                  id="name"
                  name="name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                />
              </div>
            )}
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
                  autoComplete={isLogin ? "current-password" : "new-password"}
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
              {isLogin && (
                <div className="text-right">
                  <Link
                    to="/esqueci-senha"
                    className="text-sm text-primary font-medium hover:underline"
                  >
                    Esqueci minha senha
                  </Link>
                </div>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Aguarde..." : isLogin ? "Entrar" : "Criar conta"}
            </Button>
          </form>

          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            ou
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            onClick={handleGoogle}
          >
            <GoogleIcon />
            Continuar com Google
          </Button>

          <div className="mt-4 text-center text-sm text-muted-foreground">
            {isLogin ? (
              <>
                Não tem conta?{" "}
                <button
                  type="button"
                  onClick={() => { setIsLogin(false); setError(""); }}
                  className="text-primary font-medium hover:underline"
                >
                  Cadastre-se
                </button>
              </>
            ) : (
              <>
                Já tem conta?{" "}
                <button
                  type="button"
                  onClick={() => { setIsLogin(true); setError(""); }}
                  className="text-primary font-medium hover:underline"
                >
                  Entrar
                </button>
              </>
            )}
          </div>
        </>
      )}
    </AuthLayout>
  );
}
