import { useAuth } from "@/hooks/useAuth";
import Layout from "@/components/common/Layout";
import PublicShell from "@/components/common/PublicShell";
import SubscribePage from "@/pages/SubscribePage";

// /assinar is one URL with two shells: the app layout for a logged-in user
// (menu, credits badge, banner) and the public shell for a visitor paying
// first. Nothing renders until the session is known, so the shell never flips.
export function SubscribeRoute() {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (session) {
    return (
      <Layout>
        <SubscribePage />
      </Layout>
    );
  }
  return (
    <PublicShell>
      <SubscribePage />
    </PublicShell>
  );
}
