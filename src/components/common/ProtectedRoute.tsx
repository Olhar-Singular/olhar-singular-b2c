import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export const SET_PASSWORD_PATH = "/definir-senha";

// Session gate. An account born from a payment carries must_set_password until
// the user picks a password: every protected route is redirected to that
// screen first (and the screen itself is released once the flag is cleared).
// Nothing renders while the session or the profile is still loading, so the
// redirect never fires on a stale profile.
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, user, loading, profile, profileLoading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!session) return <Navigate to="/auth" replace />;
  if (profileLoading && !profile) return null;

  // The profile column is the source of truth; the auth metadata stamped at
  // account creation is the fallback for a profile write that failed, so an
  // account with a random password is never let in without setting one.
  const mustSetPassword = !!profile?.must_set_password || (!profile && user?.user_metadata?.must_set_password === true);

  const onSetPassword = location.pathname === SET_PASSWORD_PATH;
  if (mustSetPassword && !onSetPassword) return <Navigate to={SET_PASSWORD_PATH} replace />;
  if (!mustSetPassword && onSetPassword) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}
