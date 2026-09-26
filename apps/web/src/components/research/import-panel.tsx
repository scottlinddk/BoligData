import { useState } from "react";
import type { ResearchImportField, ResearchImportPreviewResponse, SourceDataMode } from "@shared/types/research-api";
import { commitResearchImport, previewResearchImport } from "@/lib/research-api";
import { buttonClass, Field, inputClass, Panel, primaryClass, TextField, useResearchText } from "./fields";
import { readImportFile, toImportCsv, type ImportSheet } from "./import-workbook";

const fields: { key: ResearchImportField; da: string; en: string; required?: boolean }[] = [
  { key: "propertyId", da: "Bolig-id (eksakt enhed)", en: "Property ID (exact unit)", required: true },
  { key: "soldDate", da: "Handelsdato", en: "Sale date", required: true },
  { key: "salePrice", da: "Salgspris", en: "Sale price", required: true },
  { key: "saleType", da: "Handelstype", en: "Transfer type" },
  { key: "firstAskingPrice", da: "Første udbudspris", en: "First asking price" },
  { key: "lastAskingPrice", da: "Sidste udbud før salg", en: "Last asking price before sale" },
  { key: "residentialArea", da: "Boligareal", en: "Residential area" },
  { key: "areaDefinition", da: "Arealdefinition", en: "Area definition" },
  { key: "areaAsOf", da: "Arealets gyldighedsdato", en: "Area effective date" },
  { key: "documentedActiveDays", da: "Dokumenteret aktiv liggetid", en: "Documented active days" },
  { key: "latestEpisodeDays", da: "Seneste udbudsperiode, dage", en: "Latest listing episode, days" },
  { key: "calendarDays", da: "Kalendertid siden første udbud", en: "Calendar days since first listing" },
  { key: "sourceUrl", da: "Kildelink", en: "Source URL" },
  { key: "conditionText", da: "Historisk standstekst", en: "Historical condition text" },
  { key: "conditionAsOf", da: "Standstekstens gyldighedsdato", en: "Condition text effective date" },
];
export function ResearchImportPanel({ onImported }: { onImported?: () => void } = {}) {
  const tx = useResearchText();
  const [sheets, setSheets] = useState<ImportSheet[]>([]); const [sheetIndex, setSheetIndex] = useState(0);
  const [fileName, setFileName] = useState(""); const [mapping, setMapping] = useState<Partial<Record<ResearchImportField, string>>>({});
  const [sourceVersion, setSourceVersion] = useState(""); const [collectedAt, setCollectedAt] = useState("");
  const [dataMode, setDataMode] = useState<SourceDataMode>("unknown");
  const [preview, setPreview] = useState<ResearchImportPreviewResponse | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [committed, setCommitted] = useState(false); const [statusFilter, setStatusFilter] = useState("all");
  const sheet = sheets[sheetIndex];
  function invalidatePreview() { setPreview(null); setCommitted(false); setMessage(""); }
  function initialMapping(next: ImportSheet) {
    setMapping(Object.fromEntries(fields.filter((field) => next.columns.includes(field.key)).map((field) => [field.key, field.key])));
  }
  async function read(file?: File) {
    if (!file) return;
    setBusy(true); setError(""); invalidatePreview(); setSheets([]);
    try { const next = await readImportFile(file); setSheets(next); setSheetIndex(0); setFileName(file.name); initialMapping(next[0]!); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not read file"); }
    finally { setBusy(false); }
  }
  async function preparePreview() {
    if (!sheet) return;
    setBusy(true); setError(""); invalidatePreview();
    try {
      const collected = new Date(collectedAt);
      if (!collectedAt || !Number.isFinite(collected.getTime())) throw new Error(tx("Angiv det dokumenterede indsamlingstidspunkt.", "Enter the documented collection time."));
      const next = await previewResearchImport({ csv: toImportCsv(sheet), mapping, fileName, sheetName: sheet.name, sourceVersion, collectedAt: collected.toISOString(), dataMode, delimiter: ";" });
      setPreview(next);
    } catch (e) { setError(e instanceof Error ? e.message : "Preview failed"); }
    finally { setBusy(false); }
  }
  async function commit() {
    if (!preview || committed) return;
    setBusy(true); setError("");
    try { const result = await commitResearchImport(preview.batchId); setCommitted(true); setMessage(result.alreadyCommitted ? tx("Denne import er allerede gemt.", "This import was already saved.") : tx(`${result.imported ?? 0} handler importeret; ${result.duplicates ?? 0} yderligere dubletter bevaret i loggen.`, `${result.imported ?? 0} transactions imported; ${result.duplicates ?? 0} additional duplicates kept in the log.`)); onImported?.(); }
    catch (e) { setError(e instanceof Error ? e.message : "Import failed"); }
    finally { setBusy(false); }
  }
  function downloadLog() {
    if (!preview) return;
    const blob = new Blob([JSON.stringify({ fileName, sheet: sheet?.name, sourceVersion, collectedAt, dataMode, committed, ...preview }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "boligdata-import-log.json"; a.click(); URL.revokeObjectURL(url);
  }
  const requiredMapped = fields.filter((f) => f.required).every((f) => !!mapping[f.key]);
  const visibleRows = preview?.rows.filter((r) => statusFilter === "all" || r.status === statusFilter) ?? [];
  return <div className="space-y-4">
    <Panel title={tx("Kontrolleret Excel- og CSV-import", "Controlled Excel and CSV import")}>
      <p className="mb-3 text-sm text-ink-soft">{tx("Vælg en XLSX-, CSV- eller TSV-fil. Faner og kildeværdier læses lokalt; først ved preview sendes den valgte fane til din private importkø. Gamle prisvurderinger og rangeringer importeres ikke.", "Choose an XLSX, CSV or TSV file. Worksheets and source values are read locally; preview sends the chosen sheet to your private import queue. Previous valuations and rankings are not imported.")}</p>
      <Field label={tx("Kildefil (højst 5 MB, 2.000 rækker pr. fane)", "Source file (maximum 5 MB, 2,000 rows per sheet)")}><input type="file" accept=".xlsx,.csv,.tsv" className={inputClass} disabled={busy} onChange={e => { void read(e.target.files?.[0]); }} /></Field>
      {busy && !sheet && <p role="status" className="mt-3 text-sm">{tx("Læser filen…", "Reading file…")}</p>}
      {sheet && <div className="mt-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tx("Fane", "Worksheet")}><select className={inputClass} value={sheetIndex} disabled={busy} onChange={e => { const i = Number(e.target.value); setSheetIndex(i); initialMapping(sheets[i]!); invalidatePreview(); }}>{sheets.map((s, i) => <option key={s.name} value={i}>{s.name} · {s.rows.length} {tx("rækker", "rows")}</option>)}</select></Field>
          <TextField label={tx("Kildeversion", "Source version")} value={sourceVersion} onChange={v => { setSourceVersion(v); invalidatePreview(); }} />
          <Field label={tx("Dokumenteret indsamlingstidspunkt (lokal tid)", "Documented collection time (local time)")}><input type="datetime-local" className={inputClass} value={collectedAt} onChange={e => { setCollectedAt(e.target.value); invalidatePreview(); }} /></Field>
          <Field label={tx("Datatilstand", "Data mode")}><select className={inputClass} value={dataMode} onChange={e => { setDataMode(e.target.value as SourceDataMode); invalidatePreview(); }}><option value="unknown">{tx("Ukendt — ikke med i prisreferencer", "Unknown — excluded from price references")}</option><option value="real">{tx("Virkelige kildeobservationer", "Real source observations")}</option><option value="demo">Demo</option><option value="mock">Mock</option></select></Field>
        </div>
        {sheet.warnings.map((warning) => <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning" key={warning}>{warning}</p>)}
        <p className="rounded-xl bg-unknown-soft p-3 text-sm">{tx("Bolig-id er UUID'et i BoligData-boligens URL. Knyt hver række til den præcise bolig/enhed; en næsten ens adresse er ikke tilstrækkelig. Ukendte koblinger sættes i kontrolkø. Handelstype: normal, family, auction, other eller unknown. Arealdefinition: residential, weighted eller unknown.", "Property ID is the UUID in the BoligData property URL. Match each row to the exact property/unit; a similar address is insufficient. Unknown matches are quarantined. Transfer type: normal, family, auction, other or unknown. Area definition: residential, weighted or unknown.")}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{fields.map(field => <Field key={field.key} label={`${tx(field.da, field.en)}${field.required ? " *" : ""}`}><select className={inputClass} value={mapping[field.key] ?? ""} onChange={e => { const next = { ...mapping }; if (e.target.value) next[field.key] = e.target.value; else delete next[field.key]; setMapping(next); invalidatePreview(); }}><option value="">{tx("Ikke valgt / ukendt", "Unmapped / unknown")}</option>{sheet.columns.map(column => <option key={column} value={column}>{column}</option>)}</select></Field>)}</div>
        <details><summary className="cursor-pointer text-sm font-semibold">{tx("Se de første fem kilderækker", "Inspect the first five source rows")}</summary><div className="mt-2 overflow-x-auto"><table className="text-left text-xs"><thead><tr>{sheet.columns.map(c => <th className="border-b border-border p-2" key={c}>{c}</th>)}</tr></thead><tbody>{sheet.rows.slice(0, 5).map((row, i) => <tr key={i}>{row.map((cell, j) => <td className="max-w-64 truncate border-b border-border p-2" key={j} title={cell}>{cell || "—"}</td>)}</tr>)}</tbody></table></div></details>
        <button className={primaryClass} disabled={busy || !requiredMapped || !sourceVersion.trim() || !collectedAt} onClick={() => { void preparePreview(); }}>{busy ? tx("Validerer…", "Validating…") : tx("Valider og vis preview", "Validate and preview")}</button>
      </div>}
      {error && <p role="alert" className="mt-3 rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      {message && <p role="status" className="mt-3 rounded-xl bg-success-soft p-3 text-sm text-success">{message}</p>}
    </Panel>
    {preview && <Panel title={tx("Preview og afstemning", "Preview and reconciliation")}>
      <div className="mb-4 flex flex-wrap gap-3 text-sm">{[["total", "Rækker", "Rows"], ["accepted", "Accepteret", "Accepted"], ["duplicate", "Dubletter", "Duplicates"], ["quarantined", "Kontrolkø", "Quarantined"], ["rejected", "Afvist", "Rejected"]].map(([key, da, en]) => <span key={key} className="rounded-xl border border-border px-3 py-2"><strong>{preview.counts[key as keyof typeof preview.counts]}</strong> {tx(da!, en!)}</span>)}</div>
      <p className="mb-3 text-sm text-ink-soft">{preview.reconciliation.note}</p>
      <div className="mb-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">{tx("Kontrolmål", "Control measure")}</th><th className="p-2">{tx("Historisk udvalg", "Historical selection")}</th><th className="p-2">{tx("Accepteret i denne fil", "Accepted in this file")}</th></tr></thead><tbody>{(["rows", "pricePairs", "pairsWithDays"] as const).map(key => <tr className="border-t border-border" key={key}><td className="p-2">{key === "rows" ? tx("Salgsrækker", "Sale rows") : key === "pricePairs" ? tx("Første pris + salg", "First price + sale") : tx("Prispar + dokumenteret aktiv tid", "Price pair + documented active time")}</td><td className="p-2">{preview.reconciliation.historicalControl[key]}</td><td className="p-2">{preview.reconciliation.actual[key]}</td></tr>)}</tbody></table></div>
      <p className="mb-4 text-sm">{tx("Tidsgrupper 0–30 / 31–90 / 91–180 / 181–365 / >365", "Time groups 0–30 / 31–90 / 91–180 / 181–365 / >365")}: {preview.reconciliation.actual.groups.join(" / ")} ({tx("historisk", "historical")}: 79 / 77 / 65 / 44 / 16)</p>
      <Field label={tx("Vis rækker", "Show rows")}><select className={inputClass} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>{[["all", "Alle", "All"], ["accepted", "Accepteret", "Accepted"], ["duplicate", "Dubletter", "Duplicates"], ["quarantined", "Kontrolkø", "Quarantined"], ["rejected", "Afvist", "Rejected"]].map(([value, da, en]) => <option key={value} value={value}>{tx(da!, en!)}</option>)}</select></Field>
      <div className="my-3 max-h-96 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">{tx("Række", "Row")}</th><th className="p-2">Status</th><th className="p-2">{tx("Begrundelse / normaliserede værdier", "Reason / normalized values")}</th></tr></thead><tbody>{visibleRows.slice(0, 100).map(row => <tr className="border-t border-border" key={row.rowNumber}><td className="p-2">{row.rowNumber}</td><td className="p-2">{row.status}</td><td className="p-2">{row.reasons.join(" · ") || `${row.normalized?.soldDate ?? "?"} · ${row.normalized?.salePrice ?? "?"} DKK · ${row.normalized?.saleType ?? "unknown"} · ${row.normalized?.datePrecision ?? "unknown"}`}</td></tr>)}</tbody></table></div>
      {visibleRows.length > 100 && <p className="mb-3 text-xs text-ink-soft">{tx("De første 100 rækker vises. Download loggen for alle rækker.", "First 100 rows shown. Download the log for all rows.")}</p>}
      <p className="mb-3 text-sm text-ink-soft">{tx("Kun accepterede rækker gemmes som handler. Ret afviste eller tvivlsomme kilder i filen og opret et nyt preview. Ingen historiske rækker overskrives.", "Only accepted rows are saved as transactions. Correct rejected or ambiguous source rows and create a new preview. Historical rows are not overwritten.")}</p>
      <div className="flex flex-wrap gap-2"><button className={primaryClass} disabled={busy || committed || !preview.counts.accepted} onClick={() => { void commit(); }}>{committed ? tx("Import gemt", "Import saved") : tx(`Importér ${preview.counts.accepted} accepterede rækker`, `Import ${preview.counts.accepted} accepted rows`)}</button><button className={buttonClass} onClick={downloadLog}>{tx("Download importlog", "Download import log")}</button></div>
    </Panel>}
  </div>;
}
