import type { CadastralReport } from "@shared/types/cadastral";

/** A north-up plot plan in the register's native metre grid; no guessed map position. */
export function CadastralMap({ report, language }: { report: CadastralReport; language: "da" | "en" }) {
  const parcels = report.parcels.filter(parcel => parcel.geometry);
  const completeParcels = report.parcelsComplete && report.parcels.length > 0 && parcels.length === report.parcels.length;
  const shapes = completeParcels ? parcels.map(parcel => ({ label: parcel.number ?? parcel.id, geometry: parcel.geometry! }))
    : report.geometry ? [{ label: `BFE ${report.bfeNumber}`, geometry: report.geometry }] : [];
  const points = shapes.flatMap(shape => shape.geometry.polygons.flat(2));
  if (!points.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const span = Math.max(maxX - minX, maxY - minY, 1), padding = span * 0.12;
  const width = maxX - minX + 2 * padding, height = maxY - minY + 2 * padding;
  const paths = shapes.map(shape => ({ label: shape.label, d: shape.geometry.polygons.map(polygon => polygon.map(ring => ring.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x - minX + padding} ${maxY - y + padding}`).join(" ") + " Z").join(" ")).join(" ") }));
  return <figure className="mt-5 overflow-hidden rounded-xl border border-border bg-surface">
    <div className="flex justify-between px-4 pt-3 text-xs text-ink-soft"><span>{language === "da" ? "Matrikelkort · skeloversigt" : "Cadastral map · boundary plan"}</span><span aria-label={language === "da" ? "Nord opad" : "North is up"}>N ↑</span></div>
    <svg role="img" aria-label={language === "da" ? "Registrerede matrikelskel for ejendommen" : "Registered property parcel boundaries"} viewBox={`0 0 ${width} ${height}`} className="h-[280px] w-full text-brand-text sm:h-[340px]">
      {paths.map((path, i) => <path key={i} d={path.d} fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" fillRule="evenodd"><title>{path.label}</title></path>)}
    </svg>
    <figcaption className="px-4 pb-4 text-xs leading-5 text-ink-soft">
      {language === "da" ? "Geodatastyrelsen / Matriklen. Vejledende skeloversigt uden baggrundskort; skel er ikke en landmåling." : "Geodatastyrelsen / Matriklen. Indicative boundaries without a basemap; this is not a boundary survey."}
      <span className="block">{language === "da" ? "Kortets bredde" : "Map width"}: {Math.round(width).toLocaleString(language === "da" ? "da-DK" : "en-GB")} m · {shapes.map(shape => shape.label).join(", ")}</span>
    </figcaption>
  </figure>;
}
