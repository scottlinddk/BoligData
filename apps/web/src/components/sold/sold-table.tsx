import { useMemo, useState } from "react";
import type { SoldFormat } from "@/lib/sold-format";
import { average, sortRows, type SoldRow, type SortKey } from "@/lib/sold-stats";

interface Column {
  key: SortKey;
  label: [string, string];
  align: "left" | "right";
}

const COLUMNS: Column[] = [
  { key: "address", label: ["Adresse", "Address"], align: "left" },
  { key: "area", label: ["Område", "Area"], align: "left" },
  { key: "soldDate", label: ["Solgt", "Sold"], align: "left" },
  { key: "areaSqm", label: ["Boligareal", "Living area"], align: "right" },
  { key: "plotSqm", label: ["Grund", "Plot"], align: "right" },
  { key: "askPrice", label: ["Opr. udbud", "Listing price"], align: "right" },
  { key: "soldPrice", label: ["Salgspris", "Sold price"], align: "right" },
  { key: "pricePerSqm", label: ["Pris/m²", "Price/m²"], align: "right" },
  { key: "daysOnMarket", label: ["Liggetid", "On market"], align: "right" },
  { key: "discountPct", label: ["Afslag", "Discount"], align: "right" },
  { key: "builtYear", label: ["Bygget", "Built"], align: "right" },
  { key: "energyLabel", label: ["Energi", "Energy"], align: "left" },
];

const AREA_LABEL: Record<SoldRow["area"], string> = { kaerby: "Kærby", "gl-hasseris": "Gl. Hasseris" };

/** Every sale, sortable. Rows flagged as distorting stay visible (greyed) so nothing silently disappears. */
export function SoldTable({ rows, excludeOutliers, fmt, tx }: { rows: SoldRow[]; excludeOutliers: boolean; fmt: SoldFormat; tx: (da: string, en: string) => string }) {
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "soldDate", direction: "desc" });
  const sorted = useMemo(() => sortRows(rows, sort.key, sort.direction), [rows, sort]);
  const counted = rows.filter((r) => !(excludeOutliers && r.outlierReason !== null));

  const footer = {
    areaSqm: average(counted.map((r) => (r.areaUncertain ? null : r.areaSqm)))?.mean ?? null,
    plotSqm: average(counted.map((r) => r.plotSqm))?.mean ?? null,
    askPrice: average(counted.map((r) => r.askPrice))?.mean ?? null,
    soldPrice: average(counted.map((r) => r.soldPrice))?.mean ?? null,
    pricePerSqm: average(counted.map((r) => r.pricePerSqm))?.mean ?? null,
    daysOnMarket: average(counted.map((r) => r.daysOnMarket))?.mean ?? null,
    discountPct: average(counted.map((r) => r.discountPct))?.mean ?? null,
  };
  const rounded = (v: number | null) => (v === null ? null : Math.round(v));

  const toggle = (key: SortKey) =>
    setSort((prev) => (prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: key === "address" || key === "area" || key === "energyLabel" ? "asc" : "desc" }));

  const cell = (column: Column) => `px-3 py-2 ${column.align === "right" ? "text-right tabular-nums" : "text-left"}`;
  const body = (row: SoldRow, key: SortKey): string => {
    switch (key) {
      case "address": return row.address;
      case "area": return AREA_LABEL[row.area];
      case "soldDate": return fmt.date(row.soldDate);
      case "areaSqm": return fmt.sqm(row.areaSqm);
      case "plotSqm": return fmt.sqm(row.plotSqm);
      case "askPrice": return fmt.dkk(row.askPrice);
      case "soldPrice": return fmt.dkk(row.soldPrice);
      case "pricePerSqm": return fmt.dkk(rounded(row.pricePerSqm));
      case "daysOnMarket": return row.daysOnMarket === null ? "–" : fmt.int(row.daysOnMarket);
      case "discountPct": return fmt.discount(row.discountPct);
      case "builtYear": return row.builtYear === null ? "–" : String(row.builtYear);
      case "energyLabel": return row.energyLabel ? row.energyLabel.toUpperCase() : "–";
    }
  };
  const foot = (key: SortKey): string => {
    switch (key) {
      case "areaSqm": return fmt.sqm(rounded(footer.areaSqm));
      case "plotSqm": return fmt.sqm(rounded(footer.plotSqm));
      case "askPrice": return fmt.dkk(rounded(footer.askPrice));
      case "soldPrice": return fmt.dkk(rounded(footer.soldPrice));
      case "pricePerSqm": return fmt.dkk(rounded(footer.pricePerSqm));
      case "daysOnMarket": return footer.daysOnMarket === null ? "–" : fmt.int(Math.round(footer.daysOnMarket));
      case "discountPct": return fmt.discount(footer.discountPct);
      default: return "";
    }
  };

  return (
    <section aria-labelledby="sold-table-title" className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <h2 id="sold-table-title" className="mb-1 text-lg font-bold tracking-tight">{tx("Alle salg", "All sales")}</h2>
      <p className="mb-3 text-xs text-ink-soft">
        {tx("Afslag er udbudspris minus salgspris i procent af udbudspris: positivt tal = solgt under udbud, minus = solgt over udbud. Tomme felter betyder, at tallet ikke findes i kilden.", "Discount is listing price minus sold price as a percentage of the listing price: positive = sold under the listing price, minus = sold over it. A dash means the figure is not in the source.")}
      </p>
      <div className="max-h-[40rem] overflow-auto rounded-xl border border-border">
        <table className="w-full min-w-[68rem] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-surface-alt text-xs text-ink-soft">
            <tr>
              {COLUMNS.map((c) => {
                const active = sort.key === c.key;
                return (
                  <th key={c.key} scope="col" aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className={`${cell(c)} font-semibold whitespace-nowrap`}>
                    <button type="button" onClick={() => toggle(c.key)} className="inline-flex items-center gap-1 hover:text-ink">
                      {tx(c.label[0], c.label[1])}
                      <span aria-hidden="true" className={active ? "text-ink" : "text-ink-faint"}>{active ? (sort.direction === "asc" ? "▲" : "▼") : "↕"}</span>
                    </button>
                  </th>
                );
              })}
              <th scope="col" className="px-3 py-2 text-left font-semibold">{tx("Note", "Note")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const dimmed = excludeOutliers && row.outlierReason !== null;
              return (
                <tr key={row.id} className={`border-t border-border ${dimmed ? "text-ink-faint line-through decoration-ink-faint/40" : "text-ink"}`}>
                  {COLUMNS.map((c) => <td key={c.key} className={`${cell(c)} whitespace-nowrap ${c.key === "address" ? "font-medium" : ""}`}>{body(row, c.key)}</td>)}
                  <td className="px-3 py-2 text-xs text-ink-soft">
                    {[row.outlierReason, row.areaUncertain ? tx("Areal usikkert", "Area uncertain") : null, row.note && !row.outlierReason ? row.note : null].filter(Boolean).join(" · ") || ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0 bg-surface-alt font-semibold">
            <tr className="border-t-2 border-border-strong">
              {COLUMNS.map((c, i) => (
                <td key={c.key} className={`${cell(c)} whitespace-nowrap`}>
                  {i === 0 ? `${tx("Gennemsnit", "Average")} (${counted.length})` : foot(c.key)}
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
