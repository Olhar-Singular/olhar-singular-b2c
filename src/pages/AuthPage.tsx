import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { parseAuthError } from "@/lib/utils/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

  function handleBackToLogin() {
    setPendingEmail("");
    setCooldown(0);
    setError("");
    setPassword("");
    setIsLogin(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Olhar Singular</h1>
          <p className="text-sm text-muted-foreground mt-1">Adaptações inclusivas com IA</p>
        </div>

        <Card className="shadow-card-hover">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">
              {pendingEmail ? "Verifique seu e-mail" : isLogin ? "Entrar" : "Criar conta"}
            </CardTitle>
            <CardDescription>
              {pendingEmail
                ? "Falta só confirmar o cadastro"
                : isLogin
                  ? "Acesse sua conta para continuar"
                  : "Crie sua conta e comece a adaptar atividades"}
            </CardDescription>
          </CardHeader>

          <CardContent>
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
                  <span className="font-medium text-foreground">{pendingEmail}</span>. Verifique
                  sua caixa de entrada e a pasta de spam.
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
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Aguarde..." : isLogin ? "Entrar" : "Criar conta"}
              </Button>
            </form>

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
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Ferramenta pedagógica. Não realiza diagnóstico.
        </p>
      </div>
    </div>
  );
}
