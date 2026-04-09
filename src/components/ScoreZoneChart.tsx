"use client";

interface ScoreZoneChartProps {
  scores: number[]; // ordered oldest → newest
}

export default function ScoreZoneChart({ scores }: ScoreZoneChartProps) {
  if (scores.length < 2) return null;

  const w = 600, h = 250, padL = 36, padR = 100, padY = 16;
  const chartW = w - padL - padR, chartH = h - padY * 2;

  const toX = (i: number) => padL + (i / (scores.length - 1)) * chartW;
  const toY = (v: number) => padY + chartH - (v / 100) * chartH;

  const dotColor = (s: number) => {
    if (s >= 85) return "#3b82f6";
    if (s >= 70) return "#22c55e";
    if (s >= 60) return "#f59e0b";
    return "#ef4444";
  };

  const zones = [
    { y0: 0, y1: 59, color: "#ef4444", label: "Struggling" },
    { y0: 60, y1: 69, color: "#f59e0b", label: "Needs attention" },
    { y0: 70, y1: 84, color: "#22c55e", label: "Growth zone", opacity: 0.10 },
    { y0: 85, y1: 100, color: "#3b82f6", label: "Ready to advance" },
  ];

  // 5-session simple moving average
  const smaPoints: { x: number; y: number }[] = [];
  for (let i = 0; i < scores.length; i++) {
    if (i < 4) continue;
    const avg = (scores[i] + scores[i - 1] + scores[i - 2] + scores[i - 3] + scores[i - 4]) / 5;
    smaPoints.push({ x: toX(i), y: toY(avg) });
  }

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
        {/* Zone bands */}
        {zones.map((z) => (
          <rect
            key={z.label}
            x={padL}
            y={toY(z.y1)}
            width={chartW}
            height={toY(z.y0) - toY(z.y1)}
            fill={z.color}
            opacity={z.opacity ?? 0.08}
          />
        ))}

        {/* Zone labels (right side) */}
        {zones.map((z) => (
          <text
            key={`label-${z.label}`}
            x={padL + chartW + 8}
            y={(toY(z.y1) + toY(z.y0)) / 2 + 4}
            fill="var(--muted)"
            fontSize="9"
          >
            {z.label}
          </text>
        ))}

        {/* Y axis ticks */}
        {[0, 20, 40, 60, 80, 100].map((v) => (
          <g key={v}>
            <line x1={padL} y1={toY(v)} x2={padL + chartW} y2={toY(v)} stroke="var(--border)" strokeWidth="0.5" />
            <text x={padL - 8} y={toY(v) + 4} textAnchor="end" fill="var(--muted)" fontSize="10">{v}</text>
          </g>
        ))}

        {/* Connecting line between raw dots */}
        <polyline
          points={scores.map((s, i) => `${toX(i)},${toY(s)}`).join(" ")}
          fill="none"
          stroke="var(--muted)"
          strokeWidth="1"
          strokeOpacity="0.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* SMA line */}
        {smaPoints.length >= 2 && (
          <polyline
            points={smaPoints.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="#22c55e"
            strokeWidth="2.5"
            strokeOpacity="0.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Raw score dots */}
        {scores.map((s, i) => (
          <circle key={i} cx={toX(i)} cy={toY(s)} r="3.5" fill={dotColor(s)} stroke="white" strokeWidth="1.5" />
        ))}
      </svg>
      <p className="text-xs text-[var(--muted)] italic mt-2">
        Growth zone (70–84) means the content is the right challenge — hard enough to build skills, not so hard it causes frustration. SigmaRead adjusts difficulty automatically.
      </p>
    </div>
  );
}
