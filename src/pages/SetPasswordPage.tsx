import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useSetInitialPassword } from "@/hooks/useSubscription";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// First access of an account born from a payment: the account has a random
// password nobody knows, so this screen is mandatory (ProtectedRoute sends
// every route here while must_set_password is on). Leaving is only possible by
// signing out.
export default function SetPasswordPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const setPassword = useSetInitialPassword();
  const [password, setPasswordValue] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Screen readers land on the instruction, not on the brand header.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) return setError("A senha deve ter pelo menos 6 caracteres.");
    if (password !== confirmation) return setError("As senhas não coincidem.");

    try {
      await setPassword.mutateAsync({ password });
      toast.success("Senha definida! Bem-vindo à plataforma.");
      navigate("/dashboard", { replace: true });
    } catch {
      // The hook already toasted; keep the form so the user can try again.
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <AuthLayout title="Crie sua senha" description="Sua conta foi criada com o pagamento. Escolha a senha que vai usar para entrar.">
      <h2 ref={headingRef} tabIndex={-1} className="sr-only">
        Defina a senha da sua conta
      </h2>
      {user?.email && (
        <p className="mb-4 text-sm text-muted-foreground">
          Conta: <strong className="text-foreground">{user.email}</strong>
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="new-password">Senha</Label>
          <div className="relative">
            <Input
              id="new-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPasswordValue(e.target.value)}
              placeholder="Mínimo de 6 caracteres"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirme a senha</Label>
          <Input
            id="confirm-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={setPassword.isPending}>
          {setPassword.isPending ? "Salvando..." : "Salvar senha e entrar"}
        </Button>
      </form>
      <button type="button" onClick={handleSignOut} className="mt-4 w-full text-center text-sm text-muted-foreground underline">
        Sair
      </button>
    </AuthLayout>
  );
}
