"""Build packages/shared/src/data/sold-properties.json from the two user-supplied files.

Usage:
  python3 -I analysis/sold/build_sold_data.py <Kaerby.xlsx> <Gl-hasseris.csv> <out.json>

Kærby comes from an XLSX (BBR area, weighted area, plot, original ask, sale price, days on market,
build year, energy label). Gl. Hasseris comes from a CSV with fewer columns: no days on market, an
ask price on only some rows, and sale dates that are sometimes year-month only or missing.
Nothing is estimated: missing means null.
"""
import csv, json, re, sys
import openpyxl

kaerby_path, hasseris_path, out_path = sys.argv[1:4]

def num(v):
    if v is None or v == "": return None
    return float(v) if "." in str(v) else int(v)

def outlier_reason(address, note, area, ask, sold):
    n = (note or "").lower()
    if n.startswith("afvigende pris"):
        return "Afvigende pris (sandsynligt delsalg/familiehandel)"
    if "nedrivningshus" in n:
        return "Nedrivningshus (grundkøb)"
    if address == "Åvangen 14":
        return "Grund/ruin-lignende: 42 m², solgt 66 % under udbud"
    return None

rows = []
wb = openpyxl.load_workbook(kaerby_path, data_only=False)
ws = wb.active
for r in ws.iter_rows(min_row=2, values_only=True):
    address = r[0]
    if not address or address.startswith("Gennemsnit"): continue
    rows.append(dict(
        area="kaerby", address=address, soldDate=r[1], areaSqm=num(r[2]), weightedAreaSqm=num(r[3]),
        plotSqm=num(r[4]), askPrice=num(r[5]), soldPrice=num(r[6]), daysOnMarket=num(r[7]),
        builtYear=num(r[11]), energyLabel=r[12], note=None,
    ))

with open(hasseris_path, encoding="utf-8", newline="") as fh:
    for r in csv.DictReader(fh):
        rows.append(dict(
            area="gl-hasseris", address=r["address"], soldDate=r["date"] or None, areaSqm=num(r["kvm"]),
            weightedAreaSqm=None, plotSqm=num(r["plot"]), askPrice=num(r["ask"]) , soldPrice=num(r["sold"]),
            daysOnMarket=None, builtYear=None, energyLabel=None, note=r["note"] or None,
        ))

for row in rows:
    row["id"] = re.sub(r"[^a-z0-9]+", "-", (row["area"] + "-" + row["address"]).lower().replace("æ","ae").replace("ø","oe").replace("å","aa")).strip("-")
    row["outlierReason"] = outlier_reason(row["address"], row["note"], row["areaSqm"], row["askPrice"], row["soldPrice"])
    row["areaUncertain"] = "areal usikkert" in (row["note"] or "").lower()

ids = [r["id"] for r in rows]
assert len(ids) == len(set(ids)), "duplicate ids"
rows.sort(key=lambda r: (r["area"], r["address"]))
with open(out_path, "w", encoding="utf-8") as fh:
    json.dump(rows, fh, ensure_ascii=False, indent=1)
    fh.write("\n")
print(len(rows), "rows;", sum(r["area"]=="kaerby" for r in rows), "Kærby,", sum(r["area"]=="gl-hasseris" for r in rows), "Gl. Hasseris")
