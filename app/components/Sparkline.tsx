// Tiny inline OI sparkline — dependency-free SVG. Grows as snapshots accumulate.
// Renders nothing until at least 3 snapshots exist (a 2-point line is just a
// slope, not a trend) — no placeholder, so sparse rows read as blank, not broken.
export function Sparkline({
  data,
  width = 64,
  height = 18,
}: {
  data: number[] | undefined;
  width?: number;
  height?: number;
}) {
  if (!data || data.length < 3) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const up = (data[data.length - 1] ?? 0) >= (data[0] ?? 0);
  const stroke = up ? "var(--color-green)" : "var(--color-red)";
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      className="inline-block align-middle"
    >
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1" />
    </svg>
  );
}
