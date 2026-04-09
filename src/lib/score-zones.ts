export function getScoreZone(score: number): { label: string; color: string } {
  if (score < 60) return { label: "Struggling", color: "#DC2626" };
  if (score < 70) return { label: "Needs Attention", color: "#F59E0B" };
  if (score < 85) return { label: "Growth Zone", color: "#16A34A" };
  return { label: "Ready to Advance", color: "#2563EB" };
}

export function getScoreTrend(
  thisWeek: number,
  lastWeek: number
): { label: string; arrow: string } {
  const diff = thisWeek - lastWeek;
  if (diff > 3) return { label: "Improving", arrow: "↑" };
  if (diff < -3) return { label: "Declining", arrow: "↓" };
  return { label: "Stable", arrow: "→" };
}
