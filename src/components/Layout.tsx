import { Link, useLocation, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Wand2, Users, MessageSquare,
  Coins, LogOut, Menu, X,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";

const NAV_ITEMS = [
  { path: "/dashboard",        label: "Dashboard",          icon: LayoutDashboard },
  { path: "/adaptar",          label: "Adaptar",             icon: Wand2 },
  { path: "/perfis-barreira",  label: "Perfis de Barreira",  icon: Users },
  { path: "/chat",             label: "Chat com a ISA",      icon: MessageSquare },
];

export default function Layout({ children }: { children?: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, profile } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (path: string) =>
    path === "/dashboard"
      ? location.pathname === "/dashboard"
      : location.pathname.startsWith(path);

  async function handleLogout() {
    await signOut();
    navigate("/");
  }

  const linkClass = (path: string) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive(path)
        ? "bg-white/15 text-primary-foreground"
        : "text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10"
    }`;

  return (
    <div className="min-h-screen flex bg-background">
      {/* Skip to content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-background focus:px-4 focus:py-2 focus:rounded focus:text-sm focus:font-medium focus:shadow"
      >
        Pular para o conteúdo
      </a>

      {/* ── Desktop Sidebar ── */}
      <aside
        className="hidden lg:flex flex-col w-60 gradient-hero text-primary-foreground shrink-0 sticky top-0 h-screen overflow-y-auto"
        role="navigation"
        aria-label="Menu principal"
      >
        {/* Logo */}
        <div className="px-4 py-5">
          <Link to="/dashboard" className="text-xs font-bold tracking-widest uppercase text-primary-foreground">
            Olhar Singular
          </Link>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 space-y-0.5" aria-label="Navegação do app">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              aria-current={isActive(item.path) ? "page" : undefined}
              className={linkClass(item.path)}
            >
              <item.icon className="w-4.5 h-4.5 shrink-0" aria-hidden="true" />
              {item.label}
            </Link>
          ))}

          {/* Créditos — com saldo */}
          <Link
            to="/creditos"
            aria-current={isActive("/creditos") ? "page" : undefined}
            className={linkClass("/creditos")}
          >
            <Coins className="w-4.5 h-4.5 shrink-0" aria-hidden="true" />
            <span className="flex-1">Créditos</span>
            {profile?.credit_balance != null && (
              <span className="text-xs font-semibold bg-white/20 rounded px-1.5 py-0.5 tabular-nums">
                {profile.credit_balance}
              </span>
            )}
          </Link>
        </nav>

        {/* Logout */}
        <div className="px-3 pb-3">
          <button
            onClick={handleLogout}
            aria-label="Sair da conta"
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10 w-full transition-colors"
          >
            <LogOut className="w-4.5 h-4.5" aria-hidden="true" />
            Sair
          </button>
        </div>

        {/* Disclaimer */}
        <div className="mx-3 mb-4 p-3 rounded-lg bg-white/10 text-[11px] text-primary-foreground/60 leading-relaxed" role="note">
          Ferramenta pedagógica. Não realiza diagnóstico. A decisão final é sempre do profissional.
        </div>
      </aside>

      {/* ── Mobile Header ── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 gradient-hero text-primary-foreground px-4 py-3 flex items-center justify-between">
        <Link to="/dashboard" className="text-xs font-bold tracking-widest uppercase text-primary-foreground">
          Olhar Singular
        </Link>
        <div className="flex items-center gap-3">
          {profile?.credit_balance != null && (
            <span className="text-xs font-semibold flex items-center gap-1">
              <Coins className="w-3.5 h-3.5" aria-hidden="true" />
              {profile.credit_balance}
            </span>
          )}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen
              ? <X className="w-5 h-5" aria-hidden="true" />
              : <Menu className="w-5 h-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* ── Mobile Drawer ── */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-foreground/50"
          onClick={() => setMobileOpen(false)}
        >
          <nav
            className="absolute top-14 left-0 right-0 gradient-hero text-primary-foreground p-4 space-y-1 max-h-[calc(100vh-3.5rem)] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            aria-label="Menu de navegação mobile"
          >
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                aria-current={isActive(item.path) ? "page" : undefined}
                className={linkClass(item.path)}
              >
                <item.icon className="w-4.5 h-4.5 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            ))}
            <Link
              to="/creditos"
              onClick={() => setMobileOpen(false)}
              aria-current={isActive("/creditos") ? "page" : undefined}
              className={linkClass("/creditos")}
            >
              <Coins className="w-4.5 h-4.5 shrink-0" aria-hidden="true" />
              <span className="flex-1">Créditos</span>
              {profile?.credit_balance != null && (
                <span className="text-xs font-semibold bg-white/20 rounded px-1.5 py-0.5 tabular-nums">
                  {profile.credit_balance}
                </span>
              )}
            </Link>
            <button
              onClick={() => { setMobileOpen(false); handleLogout(); }}
              aria-label="Sair da conta"
              className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10 w-full transition-colors"
            >
              <LogOut className="w-4.5 h-4.5" aria-hidden="true" />
              Sair
            </button>
          </nav>
        </div>
      )}

      <div aria-live="polite" aria-atomic="true" className="sr-only" id="live-announcer" />

      {/* ── Main content ── */}
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 mt-14 lg:mt-0 overflow-auto outline-none"
        role="main"
      >
        {children ?? <Outlet />}
      </main>
    </div>
  );
}
