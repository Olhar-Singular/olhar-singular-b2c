import { Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  className?: string;
}

export function CreditBalance({ className }: Props) {
  const { profile } = useAuth();
  return (
    <Badge variant="secondary" className={className}>
      <Coins className="w-3.5 h-3.5 mr-1" />
      {profile?.credit_balance ?? "—"}
    </Badge>
  );
}
