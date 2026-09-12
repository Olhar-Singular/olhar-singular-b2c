import { useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { userDisplayName } from "@/lib/utils/adminFormat";
import type { AdminUser, SetAccessInput } from "@/types/admin";

interface AccessMenuProps {
  user: AdminUser;
  onSetAccess: (input: SetAccessInput) => void;
  disabled?: boolean;
}

const KIND_LABELS = {
  trial: "Período de teste (7 dias, 50 créditos)",
  exempt: "Cortesia (sem cobrança)",
  legacy: "Legado (só créditos extras)",
} as const;

const EXTEND_PRESETS = [7, 14, 30] as const;

// Support actions on one account: change how it gets in (trial / courtesy /
// legacy) or give a running trial more days. Kind changes are confirmed
// because they move the user across the paywall; extensions are one click.
export function AccessMenu({ user, onSetAccess, disabled = false }: AccessMenuProps) {
  const [pendingKind, setPendingKind] = useState<keyof typeof KIND_LABELS | null>(null);
  const canExtend = user.access_kind === "trial" && user.trial_started_at !== null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            aria-label={`Alterar acesso de ${userDisplayName(user)}`}
          >
            <Settings2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Alterar acesso</DropdownMenuLabel>
          {(Object.keys(KIND_LABELS) as Array<keyof typeof KIND_LABELS>).map((kind) => (
            <DropdownMenuItem
              key={kind}
              disabled={user.access_kind === kind}
              onSelect={() => setPendingKind(kind)}
            >
              {KIND_LABELS[kind]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Estender período de teste</DropdownMenuLabel>
          {EXTEND_PRESETS.map((days) => (
            <DropdownMenuItem
              key={days}
              disabled={!canExtend}
              onSelect={() => onSetAccess({ userId: user.id, extendDays: days })}
            >
              +{days} dias
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {pendingKind && (
        <AlertDialog open onOpenChange={() => setPendingKind(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Alterar acesso?</AlertDialogTitle>
              <AlertDialogDescription>
                {userDisplayName(user)} passa a: {KIND_LABELS[pendingKind]}.
                {pendingKind === "trial" && " O período de teste começa agora, se o e-mail já estiver confirmado."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  onSetAccess({ userId: user.id, kind: pendingKind });
                  setPendingKind(null);
                }}
              >
                Confirmar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
