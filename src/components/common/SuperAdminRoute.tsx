import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/**
 * Guards admin-only routes. Renders nothing while auth resolves, then redirects
 * non super-admins to /dashboard. The edge functions re-verify is_super_admin
 * server-side — this gate is UX only.
 */
export function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { loading, profile } = useAuth();

  if (loading) return null;
  if (!profile?.is_super_admin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
