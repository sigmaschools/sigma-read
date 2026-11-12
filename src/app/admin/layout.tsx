import AdminShell from "@/components/AdminShell";
import CompassGate from "@/components/CompassGate";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    // Compass Admin opens these pages with an adult's note (app contract 1.2); the gate signs the admin in first
    <CompassGate kind="admin">
      <AdminShell>{children}</AdminShell>
    </CompassGate>
  );
}
