import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { userDisplayName } from "@/lib/utils/adminFormat";
import type { GrantCreditsInput } from "@/types/admin";

const PRESETS = [10, 50, 100];

interface GrantCreditsButtonProps {
  user: { id: string; full_name: string | null; email: string | null };
  onGrant: (input: GrantCreditsInput) => void;
  disabled?: boolean;
}

export function GrantCreditsButton({ user, onGrant, disabled = false }: GrantCreditsButtonProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(10);

  function confirm() {
    onGrant({ userId: user.id, amount });
    setOpen(false);
    setAmount(10);
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-label={`Adicionar créditos para ${userDisplayName(user)}`}
        className="gap-1"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        Créditos
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar créditos</DialogTitle>
            <DialogDescription>
              Créditos gratuitos para {userDisplayName(user)}. Não entram nos custos da plataforma.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(Math.floor(Number(e.target.value)) || 0)}
              aria-label="Quantidade de créditos"
            />
            <div className="flex gap-2">
              {PRESETS.map((p) => (
                <Button key={p} type="button" size="sm" variant="secondary" onClick={() => setAmount(p)}>
                  +{p}
                </Button>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={confirm} disabled={amount < 1}>
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
