// Inline OI sparkline — dependency-free SVG with area fill.
// Renders nothing until ≥3 snapshots exist (a 2-point line isn't a trend).
export function Sparkline({
  data,
  width = 64,
  height = 20,
}: {
  data: number[] | undefined;
  width?: number;
  height?: number;
}) {
  if (!data || data.length < 3) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 3) - 1;
    return { x: parseFloat(x.toFixed(1)), y: parseFloat(y.toFixed(1)) };
  });

  const linePoints = pts.map((p) => `${p.x},${p.y}`).join(" ");
  // Close the path at the bottom for the area fill
  const areaPoints = [
    ...pts.map((p) => `${p.x},${p.y}`),
    `${pts[pts.length - 1]!.x},${height}`,
    `${pts[0]!.x},${height}`,
  ].join(" ");

  const up = (data[data.length - 1] ?? 0) >= (data[0] ?? 0);
  const color = up ? "var(--color-green)" : "var(--color-red)";
  const fillId = `sf-${up ? "g" : "r"}-${width}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      className="inline-block align-middle"
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.18} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${fillId})`} />
      <polyline points={linePoints} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
