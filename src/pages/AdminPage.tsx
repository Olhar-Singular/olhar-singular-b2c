import {
  useAdminDashboard,
  useSetUserStatus,
  useGrantCredits,
  useSetAccess,
  useCreateUser,
  useChangeEmail,
  useAdminCancelSubscription,
} from "@/hooks/useAdminDashboard";
import { StatCards } from "@/components/admin/StatCards";
import { CostChart } from "@/components/admin/CostChart";
import { UsersTable } from "@/components/admin/UsersTable";
import { CreateUserDialog } from "@/components/admin/CreateUserDialog";
import { SubscriptionStats } from "@/components/admin/SubscriptionStats";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Three tabs for three support questions: who is in and in what state
// (Usuários), what the business is billing (Assinaturas e receita), and what
// the AI is costing (Custos de IA).
export default function AdminPage() {
  const { data, isLoading, isError, error } = useAdminDashboard();
  const setStatus = useSetUserStatus();
  const grant = useGrantCredits();
  const setAccess = useSetAccess();
  const createUser = useCreateUser();
  const changeEmail = useChangeEmail();
  const cancelSubscription = useAdminCancelSubscription();

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Painel do Superadmin</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie usuários, assinaturas e acompanhe o custo da plataforma com IA.
          </p>
        </div>
        <CreateUserDialog onCreate={(input) => createUser.mutateAsync(input)} disabled={createUser.isPending} />
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
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList>
            <TabsTrigger value="users">Usuários ({data.users.length})</TabsTrigger>
            <TabsTrigger value="subscriptions">Assinaturas e receita</TabsTrigger>
            <TabsTrigger value="costs">Custos de IA</TabsTrigger>
          </TabsList>
          <TabsContent value="users" className="space-y-3">
            <UsersTable
              users={data.users}
              onToggleStatus={(input) => setStatus.mutate(input)}
              onGrantCredits={(input) => grant.mutate(input)}
              onSetAccess={(input) => setAccess.mutate(input)}
              onChangeEmail={(input) => changeEmail.mutate(input)}
              onCancelSubscription={(input) => cancelSubscription.mutate(input)}
              isUpdating={setStatus.isPending}
              isGranting={grant.isPending}
              isSettingAccess={setAccess.isPending || changeEmail.isPending || cancelSubscription.isPending}
            />
          </TabsContent>
          <TabsContent value="subscriptions">
            <SubscriptionStats summary={data.subscriptions} />
          </TabsContent>
          <TabsContent value="costs" className="space-y-6">
            <StatCards metrics={data.metrics} />
            <CostChart daily={data.metrics.daily} monthly={data.metrics.monthly} />
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
}
