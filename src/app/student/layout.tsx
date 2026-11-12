import { CompassLevelReport } from "@/components/CompassReport";
import CompassGate from "@/components/CompassGate";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    // Compass signs the student in from the profile note it opened the page with (app contract 1.1)
    <CompassGate>
      {children}
      {/* Compass reads the student's Lexile level from this hidden block (app contract 0.2, 2.2) */}
      <CompassLevelReport />
    </CompassGate>
  );
}
