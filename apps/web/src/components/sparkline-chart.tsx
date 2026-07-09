import { useI18n } from "@/i18n/i18n";

interface SparklineChartProps {
  points: number[];
  width?: number;
  height?: number;
}

export function SparklineChart({ points, width = 240, height = 60 }: SparklineChartProps) {
  const { t } = useI18n();

  if (points.length === 0) {
    return <div className="text-xs text-slate-400 dark:text-slate-500">{t("comparables.noHistory")}</div>;
  }
  if (points.length === 1) {
    return <div className="text-xs text-slate-500 dark:text-slate-400">{t("comparables.onePoint")}</div>;
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
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible text-brand-600 dark:text-blue-400"
    >
      <polyline points={coords.join(" ")} fill="none" stroke="currentColor" strokeWidth={2} />
      {coords.map((point, i) => {
        const [x, y] = point.split(",").map(Number);
        return <circle key={i} cx={x} cy={y} r={2.5} fill="currentColor" />;
      })}
    </svg>
  );
}
