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
import type { AdminUser, SetUserStatusInput } from "@/types/admin";

interface UsersTableProps {
  users: AdminUser[];
  onToggleStatus: (input: SetUserStatusInput) => void;
  isUpdating?: boolean;
}

export function UsersTable({ users, onToggleStatus, isUpdating = false }: UsersTableProps) {
  const [query, setQuery] = useState("");
  const [confirmUser, setConfirmUser] = useState<AdminUser | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => {
        if (!q) return true;
        return (u.full_name ?? "").toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q);
      })
      .sort((a, b) => b.total_usd - a.total_usd);
  }, [users, query]);

  function handleToggle(user: AdminUser, checked: boolean) {
    if (checked) {
      onToggleStatus({ userId: user.id, action: "unban" });
    } else {
      setConfirmUser(user);
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome ou e-mail"
          aria-label="Buscar por nome ou e-mail"
          className="pl-8"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm" aria-label="Usuários da plataforma">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <th scope="col" className="px-3 py-2 font-medium">Nome</th>
              <th scope="col" className="px-3 py-2 font-medium">E-mail</th>
              <th scope="col" className="px-3 py-2 font-medium">Último acesso</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Créditos</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Gasto (IA)</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
              <th scope="col" className="px-3 py-2 font-medium">Ação</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            ) : (
              visible.map((user) => (
                <tr key={user.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <span className="font-medium text-foreground">{user.full_name || "—"}</span>
                    {user.is_super_admin && (
                      <Badge variant="secondary" className="ml-2 align-middle">Admin</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{user.email || "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{formatLastAccess(user.last_sign_in_at)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{user.credit_balance}</td>
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
              ))
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
