# Hedonisk prisanalyse, postnummer 9000 Aalborg

Offline, reproducerbar pipeline, der estimerer, hvad en bolig i 9000 bør koste ud fra faktiske salgspriser, og måler
det mod to enkle baselines. Resultaterne vises på fanen **Analyse** på `/stats`. Webappen regner ikke selv. Den læser
`packages/shared/src/data/hedonic-results.json`, som pipelinen genererer.

Mål: faktisk salgspris (købsaftaledato). Udbudspris er ikke målet, men sammenlignes med estimatet ved scoring.
Det er prædiktion, ikke tidsserieprognose. Intet her er kausalt.

## Kørsel

```sh
python3 -m pip install -r requirements.lock
cd analysis/hedonic
PYTHONPATH=src python3 -m pytest tests          # 11 tests
PYTHONPATH=src python3 -m boligpris dev         # audit, beskrivelse, rolling-origin, geografi, følsomhed, beslutning
PYTHONPATH=src python3 -m boligpris final       # urørt testsæt. Kan kun køres én gang (lås i outputs/)
PYTHONPATH=src python3 -m boligpris score       # scoring af nuværende annoncer
PYTHONPATH=src python3 -m boligpris report      # samler outputs/results.json og kopierer til packages/shared
```

Rækkefølgen er vigtig. `final` kræver `dev_results.json` og gemmer dens hash i `outputs/final_holdout.lock`. En anden
kørsel afvises. `--force` åbner testsættet igen, men resultatet markeres så som ikke urørt.

## Data

Rå eksporter ligger i `data/raw/` (git-ignoreret, skrivebeskyttet) og er lavet med SQL i `sql/`, kørt mod Supabase
(`bolig-data`) med kun læseadgang den 2026-11-02. Ingen adresser, links eller ejeroplysninger eksporteres.

- `sales_9000.csv`: 927 handler siden 2011-01-01, fire boligtyper, med den offentlige vurdering kendt på salgstidspunktet.
- `listings_9000.csv`: 794 nuværende annoncer.
- Markedsniveau: `packages/shared/src/data/zip-9000-stats.json` (månedlig gennemsnitlig salgspris pr. m², 9000).

**Kilde og juridisk forbehold.** Handlerne stammer fra den tidligere Boligsiden-indsamling. Repoets README forklarer, at
indsamlingen er stoppet, fordi Boligsidens datapolitik forbyder scraping uden aftale. Projektets ejer har valgt at bruge
de allerede gemte data til denne analyse. Det bør afklares juridisk, før resultaterne deles uden for projektet. Resultaterne
indeholder kun aggregater. Afrundede punkter (10.000 kr.) i spredningsdiagrammet er det eneste, der ligner enkeltdata.

## Struktur

```
config/config.toml        alt der er fastlagt før resultater (splits, metrikker, regler, seed)
sql/                      eksport-SQL
src/boligpris/
  data_load.py            læsere, skemakontrol
  audit.py                filtre med antal, dubletregel, flag, vurderingsdækning
  features.py             kun oplysninger kendt på salgstidspunktet, markedsindeks fra måneden før
  splits.py               rolling-origin, kalibreringsvindue, blokke, ingen samme-bolig-lækage
  methods.py              A1, A2, B (baselines), ridge, gradient boosting
  intervals.py            split-konforme intervaller
  metrics.py              MdAPE, bias, dækning, bredde, Wilson, parret bootstrap
  evaluation.py           kørsler og beslutningsregel
  descriptive.py          fordelinger pr. år og kvartal
  scoring.py              scoring af annoncer, "ikke vurderbar"
  reporting.py, cli.py    proveniens, JSON, kommandoer
tests/                    enhedstests af dubletter, indekslag, lækage, konform kvantil, baselines
outputs/                  dev_results.json, final_results.json, scoring_summary.json, results.json, lås
```

## Metode i korte træk

- **Målvariabel:** log(pris pr. m² / /stats-indeks for måneden før salget). Indekset er kendt på salgstidspunktet
  og indeholder ikke selve salget. Estimat = exp(ŷ) × indeks × areal.
- **Baselines:** A1 median pris pr. m² for segmentets salg de seneste 12 mdr. (udvides til 24 og 36). A2 /stats-indeks × areal.
  B offentlig vurdering kendt ved salget × lokal median salgspris/vurdering. B dækker kun handler med vurdering og kan ikke
  vælges som generel baseline.
- **Challengers:** ridge og gradient boosting. Tuning kun på træningsdata (kronologiske indre splits).
- **Segmenter:** huse (villa, rækkehus, villalejlighed) og lejligheder, hvert med egne modeller. Valgt før resultater.
- **Validering:** rolling-origin 2021-2024 (træn før 1. januar, test hele året). Samme bolig er aldrig i både træning og test.
  Urørt testsæt: salg fra 2025-01-01. Retningsblokke (NØ, NV, SØ, SV) inden for 9000 som svagere geografitest.
- **Beslutningsregel (fastlagt på forhånd):** en challenger anbefales kun, hvis den er mindst 10 % bedre i MdAPE end den bedste
  baseline (A1/A2), og 90 %-bootstrap-intervallet for forskellen ligger helt under 0. Ellers anbefales baseline.
- **Intervaller:** split-konform kvantil af |log(pris/estimat)| fra de seneste 12 mdr. før testen. Mål 80 %. Dækning måles på senere data.
  Konform garanti forudsætter udskiftelige data, hvilket tidsafhængige salg ikke er, så dækningen er målt og ikke garanteret.

## Hvad der ikke er gjort

- Test på hele nye geografier. Der er kun ét postnummer i data.
- Sammenligning med den eksisterende smart-estimate/SPAR-kode i webappen.
- Ingen korrektion for udvælgelsen (kun boliger, der er udbudt nu, har en salgshistorik her).
- Ingen kausal fortolkning af egenskaber eller feature importance.

## Ændringslog efter at resultater var set

1. **2026-11-02, scoring:** `min_calibration_n = 20` og `calibration_windows_months = [12, 24, 36, 48]` tilføjet i `[scoring]`.
   Årsag: de seneste 12 måneder indeholder 0 hushandler og 5 lejlighedshandler, så et interval blev bygget på 0 eller 5 residualer.
   Ændringen blev lavet efter udviklingsresultaterne var set og efter det urørte testsæt var åbnet, men ændrer hverken modelvalg
   eller evalueringen. Udvidelsen er ikke testet i rolling-origin, som bruger 12 måneder. `dev_results.json` er genkørt og har
   identisk hash som den, låsen refererer til.
2. **2026-11-02, post hoc:** `post_hoc_relative_level` i `scoring_summary.json` er tilføjet efter det urørte testsæt var åbnet,
   for at se, om det seneste niveau afviger. Den er markeret post hoc og påvirker ikke noget valg.
