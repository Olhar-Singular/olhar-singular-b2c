import { Link } from "react-router-dom";
import { useTheme } from "next-themes";
import { Coins, LogOut, Mail, Moon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { SUPPORT_EMAIL } from "@/lib/constants";

type Props = {
  /** Same signOut+navigate sequence the caller already wires today. */
  onLogout: () => void;
};

function initials(fullName?: string | null, email?: string | null): string {
  if (fullName && fullName.trim()) {
    const parts = fullName.trim().split(/\s+/);
    const first = parts[0][0];
    const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (first + last).toUpperCase();
  }
  return email?.[0]?.toUpperCase() ?? "?";
}

export function UserAccountMenu({ onLogout }: Props) {
  const { user, profile } = useAuth();
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Menu da conta"
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10 w-full transition-colors"
        >
          <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-[0.65rem] font-semibold shrink-0">
            {initials(profile?.full_name, user?.email)}
          </span>
          <span className="truncate">{user?.email}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground truncate">
          {user?.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuLabel>Configurações da conta</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link to="/creditos">
            <Coins className="w-4 h-4 mr-2" />
            Comprar créditos
          </Link>
        </DropdownMenuItem>
        <div className="flex items-center justify-between px-2 py-1.5 text-sm">
          <span className="flex items-center gap-2">
            <Moon className="w-4 h-4" aria-hidden="true" />
            Tema escuro
          </span>
          <Switch
            checked={isDark}
            onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
            aria-label="Alternar tema escuro"
          />
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Suporte</DropdownMenuLabel>
        <p className="px-2 pb-1.5 text-xs text-muted-foreground">{SUPPORT_EMAIL}</p>
        <DropdownMenuItem asChild>
          <a href={`mailto:${SUPPORT_EMAIL}`}>
            <Mail className="w-4 h-4 mr-2" />
            Entrar em contato
          </a>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive">
          <LogOut className="w-4 h-4 mr-2" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default UserAccountMenu;
