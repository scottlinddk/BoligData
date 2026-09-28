#!/usr/bin/env python3
"""Read the supplied workbook without editing it and emit reproducible JSON.

Requires Python 3.10+ and openpyxl (read-only use). Formula caches are checked
against independently computed counts, median and inclusive quartiles before
anything is written. The dated snapshot is historical evidence, not live data.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import statistics
from collections import Counter
from datetime import date, datetime
from pathlib import Path

import openpyxl


FIELDS = [
    "id", "address", "soldDate", "firstAsking", "soldPrice", "discountAmount",
    "discountFraction", "firstAskingMonth", "status", "notes", "sourceUrl",
    "latestEpisodeDays", "daysSoldDate", "daysStatus", "daysSourceUrl", "daysNotes",
    "latestEpisodeStartDate", "street", "soldYear", "firstAskingExactDate",
    "originalSourceRow", "previousEpisodeFlag", "validPricePair", "validDays",
    "selectedPeriodFlag", "calculatedDiscountFraction", "selectionStatus", "fullHistory",
]


def scalar(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError("Non-finite workbook number")
    return value


def quartile(values, probability):
    ordered = sorted(values)
    index = (len(ordered) - 1) * probability
    left = math.floor(index)
    right = math.ceil(index)
    return ordered[left] + (ordered[right] - ordered[left]) * (index - left)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def same_number(actual, expected, context):
    require(isinstance(actual, (int, float)) and math.isclose(actual, expected, abs_tol=1e-10),
            f"Workbook cache mismatch at {context}: {actual!r} != {expected!r}")


def extract(source):
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    workbook = openpyxl.load_workbook(source, data_only=True, read_only=False)
    ground = workbook["Grunddata"]
    intervals = workbook["Intervaller"]
    calculator = workbook["Prisberegner"]
    records = []
    for row in range(7, ground.max_row + 1):
        if ground.cell(row, 1).value is None:
            continue
        record = {"sourceRow": row}
        record.update({field: scalar(ground.cell(row, col).value)
                       for col, field in enumerate(FIELDS, 1)})
        record["eligible"] = record["selectedPeriodFlag"] == 1
        records.append(record)

    eligible = [record for record in records if record["eligible"]]
    require(len(records) == 437, "Expected all 437 original Grunddata rows")
    require(len(eligible) == 281, "Expected the workbook's 281 eligible trades")
    require(len({record["id"] for record in records}) == len(records), "Duplicate source IDs")
    sale_years = {"from": intervals["D6"].value, "to": intervals["G6"].value}
    for record in records:
        expected_price_pair = (isinstance(record["firstAsking"], (int, float)) and record["firstAsking"] > 0
                               and isinstance(record["soldPrice"], (int, float)) and record["soldPrice"] > 0
                               and record["status"] == "Dokumenteret")
        expected_days = (isinstance(record["latestEpisodeDays"], (int, float))
                         and record["latestEpisodeDays"] >= 0
                         and record["soldDate"] is not None
                         and record["soldDate"] == record["daysSoldDate"])
        expected_eligible = bool(expected_price_pair and expected_days
                                 and sale_years["from"] <= record["soldYear"] <= sale_years["to"])
        require(record["validPricePair"] == expected_price_pair,
                f"Price flag mismatch at Grunddata row {record['sourceRow']}")
        require(record["validDays"] == expected_days,
                f"Days flag mismatch at Grunddata row {record['sourceRow']}")
        require(record["eligible"] == expected_eligible,
                f"Eligibility mismatch at Grunddata row {record['sourceRow']}")
        if expected_price_pair:
            same_number(record["calculatedDiscountFraction"],
                        (record["firstAsking"] - record["soldPrice"]) / record["firstAsking"],
                        f"Grunddata!Z{record['sourceRow']}")

    brackets = []
    for row in range(10, 20):
        bracket = {
            "sourceRange": f"Intervaller!B{row}:K{row}",
            "label": intervals.cell(row, 2).value,
            "count": intervals.cell(row, 3).value,
            "medianDiscountFraction": intervals.cell(row, 4).value,
            "meanDiscountFraction": intervals.cell(row, 5).value,
            "q1DiscountFraction": intervals.cell(row, 6).value,
            "q3DiscountFraction": intervals.cell(row, 7).value,
            "sensitivityCount": intervals.cell(row, 8).value,
            "sensitivityMedianDiscountFraction": intervals.cell(row, 9).value,
            "fromDays": intervals.cell(row, 10).value,
            "toDays": intervals.cell(row, 11).value,
        }
        selected = [record for record in eligible
                    if bracket["fromDays"] <= record["latestEpisodeDays"] <= bracket["toDays"]]
        values = [record["calculatedDiscountFraction"] for record in selected]
        sensitive = [record["calculatedDiscountFraction"] for record in selected
                     if record["previousEpisodeFlag"] == 0]
        same_number(bracket["count"], len(values), f"Intervaller!C{row}")
        same_number(bracket["medianDiscountFraction"], statistics.median(values), f"Intervaller!D{row}")
        same_number(bracket["meanDiscountFraction"], statistics.mean(values), f"Intervaller!E{row}")
        same_number(bracket["q1DiscountFraction"], quartile(values, .25), f"Intervaller!F{row}")
        same_number(bracket["q3DiscountFraction"], quartile(values, .75), f"Intervaller!G{row}")
        same_number(bracket["sensitivityCount"], len(sensitive), f"Intervaller!H{row}")
        same_number(bracket["sensitivityMedianDiscountFraction"], statistics.median(sensitive), f"Intervaller!I{row}")
        brackets.append(bracket)

    observed_days = [record["latestEpisodeDays"] for record in eligible]
    # Pool the actual eligible observations, never the medians of unequal bins.
    all_discounts = [record["calculatedDiscountFraction"] for record in eligible]
    all_sensitive = [record["calculatedDiscountFraction"] for record in eligible
                     if record["previousEpisodeFlag"] == 0]
    aggregate = {
        "sourceRange": "Grunddata!A7:AB443",
        "label": "Alle liggetider",
        "count": len(all_discounts),
        "medianDiscountFraction": statistics.median(all_discounts),
        "meanDiscountFraction": statistics.mean(all_discounts),
        "q1DiscountFraction": quartile(all_discounts, .25),
        "q3DiscountFraction": quartile(all_discounts, .75),
        "sensitivityCount": len(all_sensitive),
        "sensitivityMedianDiscountFraction": statistics.median(all_sensitive),
        "fromDays": min(observed_days),
        "toDays": max(observed_days),
    }
    same_number(calculator["J5"].value, min(observed_days), "Prisberegner!J5")
    same_number(calculator["J6"].value, max(observed_days), "Prisberegner!J6")
    metadata = {
        "version": "workbook-liggetid/2026-09-27",
        "calculationVersion": "workbook-price-scenario/3.0",
        "sourceFilename": source.name,
        "sourceSha256": digest,
        "snapshotDate": "2026-09-27",
        "collectedFrom": "2026-09-23",
        "collectedTo": "2026-09-24",
        "sourceSheets": {"records": "Grunddata!A7:AB443", "brackets": "Intervaller!B10:K19"},
        "rowCount": len(records),
        "eligibleCount": len(eligible),
        "minimumSample": intervals["I6"].value,
        "observedMinDays": min(observed_days),
        "observedMaxDays": max(observed_days),
        # Display precision is an application choice; preserve the original workbook setting.
        "roundingDkk": 10_000,
        "sourceRoundingDkk": calculator["E9"].value,
        "saleYears": sale_years,
        "propertyTypes": ["villa"],
        "postalCodes": ["9000"],
        "scopeDescription": "Udvalgte villaer i kildearkets kortudsnit i Aalborg/Hasseris; ikke alle salg i Aalborg eller et landsdækkende udvalg.",
        "methodDescription": "Oprindelig udbudspris × (1 − median historisk prisfald). Dagens udbudspris bruges kun til sammenligning. Kendt liggetid bruger den matchende eller nærmeste observerede tidsgruppe; ukendt liggetid bruger alle 281 handler. Afrundet til 10.000 kr.",
        "limitations": [
            "Historisk prisreference; liggetid alene dokumenterer hverken markedsværdi eller acceptchance.",
            "Q1–Q3 dækker de midterste 50 % af historiske prisfald og er ikke et konfidensinterval for boligens værdi.",
            "Første udbud og seneste liggetid kan dække forskellige perioder; genudbud kan nulstille liggetiden.",
            "Udvalget er ikke matchet på stand, areal, grund eller præcis beliggenhed. 2026 er ufuldstændigt.",
            "Postnummer 9000 og villa er en grov områdeafgrænsning; kildearkets præcise kortpolygon er ikke tilgængelig.",
            "Burde koste kræver oprindelig udbudspris; dagens eller en allerede nedsat pris bruges aldrig som erstatning. En kildebaseret rekonstruktion af oprindelig pris markeres som omtrentlig.",
            "Uden for observeret liggetid genbruges nærmeste gruppe uden fremskrivning; ved ukendt liggetid er scenariet ikke tidsmatchet.",
        ],
    }
    audit = {
        "metadata": metadata,
        "columns": [{"column": openpyxl.utils.get_column_letter(col), "field": field,
                     "header": ground.cell(6, col).value} for col, field in enumerate(FIELDS, 1)],
        "selectionCounts": dict(sorted(Counter(record["selectionStatus"] for record in records).items())),
        "records": records,
    }
    model = {"metadata": metadata, "aggregate": aggregate, "brackets": brackets}
    workbook.close()
    require(hashlib.sha256(source.read_bytes()).hexdigest() == digest, "Source workbook changed during import")
    return audit, model


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--output-dir", type=Path,
                        default=Path(__file__).resolve().parents[1] / "packages/shared/src/data")
    parser.add_argument("--check", action="store_true", help="Compare deterministic output without writing")
    args = parser.parse_args()
    audit, model = extract(args.workbook)
    for name, payload in [("liggetid-transactions-2026-09-27.json", audit),
                          ("liggetid-price-reference-2026-09-27.json", model)]:
        target = args.output_dir / name
        encoded = json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
        if args.check:
            require(target.exists() and target.read_text(encoding="utf-8") == encoded,
                    f"Generated snapshot differs: {target}")
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(encoded, encoding="utf-8", newline="\n")
    print("Verified 437 source rows, 281 eligible trades, 10 pooled groups, all-sale aggregate and all quartiles; source unchanged.")


if __name__ == "__main__":
    main()
