import { CompassLevelReport } from "@/components/CompassReport";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {/* Compass reads the student's Lexile level from this hidden block (app contract 0.2, 2.2) */}
      <CompassLevelReport />
    </>
  );
}
