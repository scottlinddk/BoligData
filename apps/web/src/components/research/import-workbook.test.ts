import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { readCsvRows, readImportFile, toImportCsv } from "./import-workbook";

describe("research workbook reader", () => {
  it("roundtrips quoted CSV and preserves blank source rows for provenance", () => {
    const rows = readCsvRows('id;tekst\r\na;"Nyt køkken;\nmen taget skal skiftes"\r\n\r\nb;"siger ""god stand"""');
    expect(rows).toEqual([["id", "tekst"], ["a", "Nyt køkken;\nmen taget skal skiftes"], [""], ["b", 'siger "god stand"']]);
    const encoded = toImportCsv({ name: "Salg", columns: rows[0]!, rows: rows.slice(1), warnings: [] });
    expect(readCsvRows(encoded)).toEqual(rows);
  });
  it("reads native XLSX sheets, numeric source values and dates but omits formulas", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Historiske salg");
    sheet.addRow(["propertyId", "soldDate", "salePrice", "gammelVurdering"]);
    sheet.addRow(["property", new Date("2026-08-01T00:00:00Z"), 4_000_000, { formula: "C2*0.87", result: 3_480_000 }]);
    const next = workbook.addWorksheet("Kilder"); next.addRow(["source", "text"]); next.addRow(["Register", "Dokumenteret"]);
    const buffer = await workbook.xlsx.writeBuffer();
    const file = new File([new Uint8Array(buffer)], "Boligsalg.xlsx");
    const result = await readImportFile(file);
    expect(result.map((s) => s.name)).toEqual(["Historiske salg", "Kilder"]);
    expect(result[0]?.rows[0]).toEqual(["property", "2026-08-01", "4000000", ""]);
    expect(result[0]?.warnings).toHaveLength(1);
  });
  it("rejects unsupported legacy XLS files and unterminated CSV cells", async () => {
    await expect(readImportFile(new File(["data"], "unknown.xls"))).rejects.toThrow("XLSX");
    expect(() => readCsvRows('a;b\n1;"bad')).toThrow("Unclosed");
  });
});
