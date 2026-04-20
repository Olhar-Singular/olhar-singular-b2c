import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
  const { session, loading } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && session) navigate("/dashboard", { replace: true });
  }, [session, loading, navigate]);

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
          if (err.message?.includes("Invalid login")) {
            setError("E-mail ou senha incorretos.");
          } else {
            setError(err.message || "Erro ao entrar.");
          }
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
          if (err.message?.includes("already registered")) {
            setError("Este e-mail já está cadastrado. Tente entrar.");
          } else {
            setError(err.message || "Erro ao criar conta.");
          }
          return;
        }
        toast.success("Conta criada! Verifique seu e-mail para confirmar o cadastro.");
      }
    } finally {
      setSubmitting(false);
    }
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
              {isLogin ? "Entrar" : "Criar conta"}
            </CardTitle>
            <CardDescription>
              {isLogin
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
                <Input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                />
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
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Ferramenta pedagógica. Não realiza diagnóstico.
        </p>
      </div>
    </div>
  );
}
