import { useAdminDashboard, useSetUserStatus } from "@/hooks/useAdminDashboard";
import { StatCards } from "@/components/admin/StatCards";
import { CostChart } from "@/components/admin/CostChart";
import { UsersTable } from "@/components/admin/UsersTable";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminPage() {
  const { data, isLoading, isError, error } = useAdminDashboard();
  const setStatus = useSetUserStatus();

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Painel do Superadmin</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie usuários e acompanhe o custo da plataforma com IA.
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-6" data-testid="admin-loading">
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <Skeleton className="h-72" />
          <Skeleton className="h-64" />
        </div>
      ) : isError ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {(error as Error)?.message ?? "Erro ao carregar o painel."}
        </p>
      ) : data ? (
        <>
          <StatCards metrics={data.metrics} />
          <CostChart daily={data.metrics.daily} monthly={data.metrics.monthly} />
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Usuários ({data.users.length})</h2>
            <UsersTable
              users={data.users}
              onToggleStatus={(input) => setStatus.mutate(input)}
              isUpdating={setStatus.isPending}
            />
          </section>
        </>
      ) : null}
    </div>
  );
}
