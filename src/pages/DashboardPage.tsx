import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  const { profile, signOut } = useAuth();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-muted-foreground">
        Créditos disponíveis:{" "}
        <span className="font-semibold text-foreground">
          {profile?.credit_balance ?? "—"}
        </span>
      </p>
      <Button variant="outline" onClick={signOut}>Sair</Button>
    </main>
  );
}
