// Client-side demo gate for every /dashboard/* route. AuthGate renders
// the login form when unauthenticated and leaves the dashboard
// unmounted; routes still return HTTP 200 (no middleware, no redirect).
import AuthGate from "@/components/auth-gate";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGate>{children}</AuthGate>;
}
