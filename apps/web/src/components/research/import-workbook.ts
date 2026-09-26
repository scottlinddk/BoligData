export interface ImportSheet { name: string; columns: string[]; rows: string[][]; warnings: string[] }

export function readCsvRows(input: string): string[][] {
  const firstLine = input.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  const delimiter = firstLine.includes(";") ? ";" : firstLine.includes("\t") ? "\t" : ",";
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false, closed = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"') { if (input[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else cell += ch;
    } else if (ch === '"' && !cell && !closed) quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ""; closed = false; }
    else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = ""; closed = false;
      if (rows.length > 2001) throw new Error("Højst 2.000 datarækker pr. import / Maximum 2,000 data rows per import.");
    } else {
      if (ch === '"' || (closed && ch.trim())) throw new Error("Ugyldig CSV / Invalid CSV.");
      if (!closed) cell += ch;
    }
  }
  if (quoted) throw new Error("Uafsluttet CSV-felt / Unclosed CSV field.");
  row.push(cell); if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}
export function toImportCsv(sheet: ImportSheet): string {
  return [sheet.columns, ...sheet.rows].map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(";")).join("\n");
}
function makeSheet(name: string, rawRows: string[][], warnings: string[] = []): ImportSheet {
  if (rawRows.length > 2001) throw new Error("Højst 2.000 datarækker pr. fane / Maximum 2,000 data rows per worksheet.");
  const columns = rawRows[0]?.map((c) => c.trim()) ?? [];
  if (!columns.length || columns.length > 100 || columns.some((c) => !c) || new Set(columns).size !== columns.length) throw new Error("Første række skal indeholde 1–100 entydige kolonnenavne / First row must contain 1–100 unique column names.");
  return { name, columns, rows: rawRows.slice(1), warnings };
}
export async function readImportFile(file: File): Promise<ImportSheet[]> {
  if (file.size > 5_000_000) throw new Error("Filen må højst være 5 MB / Maximum file size is 5 MB.");
  if (/\.(csv|tsv)$/i.test(file.name)) return [makeSheet("CSV", readCsvRows((await file.text()).replace(/^\uFEFF/, "")))];
  if (!/\.xlsx$/i.test(file.name)) throw new Error("Vælg XLSX, CSV eller TSV / Choose XLSX, CSV or TSV.");
  const excel = await import("exceljs");
  const workbook = new excel.default.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheets: ImportSheet[] = [];
  for (const worksheet of workbook.worksheets) {
    if (worksheet.rowCount === 0) continue;
    if (worksheet.rowCount > 2001 || worksheet.columnCount > 100) throw new Error(`Fanen ${worksheet.name} overskrider grænsen på 2.000 rækker / Worksheet exceeds the 2,000-row or 100-column limit.`);
    let formulas = 0; const rows: string[][] = [];
    for (let r = 1; r <= worksheet.rowCount; r++) {
      const row: string[] = [];
      for (let c = 1; c <= worksheet.columnCount; c++) {
        const cell = worksheet.getCell(r, c); const value = cell.value;
        if (value && typeof value === "object" && ("formula" in value || "sharedFormula" in value)) { formulas++; row.push(""); }
        else if (value instanceof Date) row.push(value.toISOString().slice(0, 10));
        else if (value === null || value === undefined) row.push("");
        else if (typeof value === "object" && "richText" in value) row.push(value.richText.map((v) => v.text).join(""));
        else if (typeof value === "object" && "text" in value) row.push(value.text);
        else if (typeof value === "object") row.push("");
        else row.push(String(value));
      }
      rows.push(row);
    }
    sheets.push(makeSheet(worksheet.name, rows, formulas ? [`${formulas} formelfelter er udeladt; indsæt dokumenterede kildeværdier / formula cells omitted; provide documented source values.`] : []));
  }
  if (!sheets.length) throw new Error("Arbejdsbogen har ingen datarækker / Workbook has no data rows.");
  return sheets;
}
