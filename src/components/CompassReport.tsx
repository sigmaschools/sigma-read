"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { reportJson } from "@/lib/compass-report";

/**
 * A report block for Compass's page agent (Compass app contract 0.2, section 2.2).
 * A <script type="application/json"> is never displayed.
 */
export function CompassReport({ report }: { report: object | null }) {
  if (!report) return null;
  return <script type="application/json" data-compass-report="" dangerouslySetInnerHTML={{ __html: reportJson(report) }} />;
}

/** Fire after something may have changed the student's level, so the level block refreshes. */
export const LEVEL_CHANGED_EVENT = "sigmaread:level-maybe-changed";

/**
 * The student's `level` report, on every signed-in student screen.
 * Refreshes on navigation and on LEVEL_CHANGED_EVENT. While refreshing, the last
 * block stays in the page, so it is only replaced when the level actually changes.
 */
export function CompassLevelReport() {
  const pathname = usePathname();
  const [report, setReport] = useState<object | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick(t => t + 1);
    window.addEventListener(LEVEL_CHANGED_EVENT, bump);
    return () => window.removeEventListener(LEVEL_CHANGED_EVENT, bump);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/student/compass-level")
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled || !d || !d.report) return;
        // Same report: keep the existing element untouched
        setReport(prev => (JSON.stringify(prev) === JSON.stringify(d.report) ? prev : d.report));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pathname, tick]);

  return <CompassReport report={report} />;
}
