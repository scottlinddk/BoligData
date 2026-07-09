interface SparklineChartProps {
  points: number[];
  width?: number;
  height?: number;
  stroke?: string;
}

export function SparklineChart({ points, width = 240, height = 60, stroke = "#1d4ed8" }: SparklineChartProps) {
  if (points.length === 0) {
    return <div className="text-xs text-slate-400">No price history available.</div>;
  }
  if (points.length === 1) {
    return <div className="text-xs text-slate-500">Only one data point on record.</div>;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);

  const coords = points.map((value, i) => {
    const x = i * step;
    const y = height - ((value - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline points={coords.join(" ")} fill="none" stroke={stroke} strokeWidth={2} />
      {coords.map((point, i) => {
        const [x, y] = point.split(",").map(Number);
        return <circle key={i} cx={x} cy={y} r={2.5} fill={stroke} />;
      })}
    </svg>
  );
}
