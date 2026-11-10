// Client-side demo gate for the /disputes/[id] detail route. AuthGate
// renders the login form when unauthenticated and leaves the dispute
// detail unmounted; the route still returns HTTP 200 (no middleware,
// no redirect).
import AuthGate from "@/components/auth-gate";

export default function DisputesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGate>{children}</AuthGate>;
}
