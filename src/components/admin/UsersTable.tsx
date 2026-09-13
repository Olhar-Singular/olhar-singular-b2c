import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatUsd, formatLastAccess, userDisplayName } from "@/lib/utils/adminFormat";
import {
  ACCESS_STATE_LABELS,
  adminAccessState,
  adminPlanCredits,
  formatPeriodEnd,
  formatSubscription,
  type AdminAccessState,
} from "@/lib/utils/adminAccess";
import { GrantCreditsButton } from "@/components/admin/GrantCreditsButton";
import { AccessMenu } from "@/components/admin/AccessMenu";
import type { AdminUser, SetUserStatusInput, GrantCreditsInput, SetAccessInput, ChangeEmailInput } from "@/types/admin";

interface UsersTableProps {
  users: AdminUser[];
  onToggleStatus: (input: SetUserStatusInput) => void;
  onGrantCredits: (input: GrantCreditsInput) => void;
  onSetAccess?: (input: SetAccessInput) => void;
  onChangeEmail?: (input: ChangeEmailInput) => void | Promise<unknown>;
  onCancelSubscription?: (input: { userId: string }) => void;
  isUpdating?: boolean;
  isGranting?: boolean;
  isSettingAccess?: boolean;
  /** Injected for deterministic tests. */
  now?: Date;
}

type StateFilter = "all" | AdminAccessState;

const STATE_BADGE: Record<AdminAccessState, "default" | "secondary" | "destructive" | "outline"> = {
  subscriber: "default",
  past_due: "destructive",
  trial: "secondary",
  trial_expired: "outline",
  exempt: "secondary",
  legacy: "outline",
  blocked: "destructive",
  inactive: "destructive",
};

export function UsersTable({
  users,
  onToggleStatus,
  onGrantCredits,
  onSetAccess = () => {},
  onChangeEmail = () => {},
  onCancelSubscription = () => {},
  isUpdating = false,
  isGranting = false,
  isSettingAccess = false,
  now = new Date(),
}: UsersTableProps) {
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [confirmUser, setConfirmUser] = useState<AdminUser | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => {
        if (stateFilter !== "all" && adminAccessState(u, now) !== stateFilter) return false;
        if (!q) return true;
        return (u.full_name ?? "").toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q);
      })
      .sort((a, b) => b.total_usd - a.total_usd);
  }, [users, query, stateFilter, now]);

  function handleToggle(user: AdminUser, checked: boolean) {
    if (checked) {
      onToggleStatus({ userId: user.id, action: "unban" });
    } else {
      setConfirmUser(user);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[12rem]">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou e-mail"
            aria-label="Buscar por nome ou e-mail"
            className="pl-8"
          />
        </div>
        {/* Native select: the support question is "who is blocked / in trial", one click away. */}
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value as StateFilter)}
          aria-label="Filtrar por estado de acesso"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">Todos os estados</option>
          {(Object.keys(ACCESS_STATE_LABELS) as AdminAccessState[]).map((state) => (
            <option key={state} value={state}>
              {ACCESS_STATE_LABELS[state]}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm" aria-label="Usuários da plataforma">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <th scope="col" className="px-3 py-2 font-medium">Nome</th>
              <th scope="col" className="px-3 py-2 font-medium">E-mail</th>
              <th scope="col" className="px-3 py-2 font-medium">Acesso</th>
              <th scope="col" className="px-3 py-2 font-medium">Assinatura</th>
              <th scope="col" className="px-3 py-2 font-medium">Último acesso</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Plano</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Extras</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Gasto (IA)</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
              <th scope="col" className="px-3 py-2 font-medium">Ação</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            ) : (
              visible.map((user) => {
                const state = adminAccessState(user, now);
                const periodEnd = formatPeriodEnd(user, now);
                const subscription = formatSubscription(user);
                return (
                <tr key={user.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <span className="font-medium text-foreground">{user.full_name || "—"}</span>
                    {user.is_super_admin && (
                      <Badge variant="secondary" className="ml-2 align-middle">Admin</Badge>
                    )}
                    {user.cpf_masked && (
                      <span className="block text-xs text-muted-foreground tabular-nums">CPF {user.cpf_masked}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{user.email || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <Badge variant={STATE_BADGE[state]} data-testid={`access-${user.id}`}>
                        {ACCESS_STATE_LABELS[state]}
                      </Badge>
                      <AccessMenu
                        user={user}
                        onSetAccess={onSetAccess}
                        onChangeEmail={onChangeEmail}
                        onCancelSubscription={onCancelSubscription}
                        disabled={user.is_super_admin || isSettingAccess}
                      />
                    </div>
                    {periodEnd && <span className="block text-xs text-muted-foreground">{periodEnd}</span>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground" data-testid={`subscription-${user.id}`}>
                    {subscription ? (
                      <>
                        <span className="text-foreground">{subscription.label}</span>
                        {subscription.detail && <span className="block text-xs">{subscription.detail}</span>}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{formatLastAccess(user.last_sign_in_at)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{adminPlanCredits(user, now)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <div className="flex items-center justify-end gap-2">
                      <span>{user.credit_balance}</span>
                      <GrantCreditsButton user={user} onGrant={onGrantCredits} disabled={isGranting} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatUsd(user.total_usd)}</td>
                  <td className="px-3 py-2">
                    <Badge variant={user.is_active ? "secondary" : "destructive"}>
                      {user.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Switch
                      checked={user.is_active}
                      disabled={user.is_super_admin || isUpdating}
                      onCheckedChange={(checked) => handleToggle(user, checked)}
                      aria-label={`Ativar ou inativar ${userDisplayName(user)}`}
                    />
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {confirmUser && (
        <AlertDialog open onOpenChange={() => setConfirmUser(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Inativar usuário?</AlertDialogTitle>
              <AlertDialogDescription>
                {userDisplayName(confirmUser)} não poderá mais acessar a plataforma até ser reativado.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  onToggleStatus({ userId: confirmUser.id, action: "ban" });
                  setConfirmUser(null);
                }}
              >
                Inativar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
