import { AdminClient } from "@/components/admin-client";
import { getInitialEnvelope } from "@/lib/server/bootstrap";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return <AdminClient initial={getInitialEnvelope()} />;
}
