import type { OilTankRecord, RiskFlags } from "@shared/types/index";
import { formatDkk } from "@shared/utils/price";
import { landStatus, riskStatuses, standingTanks } from "@shared/utils/risk-status";
import { useI18n, type TranslateFn } from "@/i18n/i18n";

const MILJOEGIS_NOISE_MAP_URL = "https://miljoegis.mim.dk/spatialmap?profile=noise";
const MILJOEPORTAL_SOIL_MAP_URL = "https://arealinformation.miljoeportal.dk/";
const BBR_URL = "https://bbr.dk/";
const TINGLYSNING_URL = "https://www.tinglysning.dk/";
const MATRIKLEN_URL = "https://www.matriklen.dk/";
const VURDERINGSPORTALEN_URL = "https://www.vurdering.skat.dk/";

interface ChecklistItem {
  label: string;
  status: "ok" | "warning" | "unknown";
  detail: string;
  /** When set, `detail` is rendered as a link (e.g. the tinglysning.dk deep-link for the encumbrance item). */
  href?: string | null;
  /** Where this flag's value comes from — shown under the status line, linked out when a public lookup exists. */
  source: string;
  sourceHref?: string | null;
}

const nf = new Intl.NumberFormat("da-DK");

function tankFacts(tank: OilTankRecord, t: TranslateFn): string {
  return t("dueDiligence.oilTank.tank.facts", {
    size: tank.sizeLiters !== null ? t("dueDiligence.oilTank.tank.size", { liters: nf.format(tank.sizeLiters) }) : t("dueDiligence.oilTank.tank.unknownSize"),
    made: tank.manufacturedYear !== null ? t("dueDiligence.oilTank.tank.made", { year: tank.manufacturedYear }) : "",
    deadline: tank.decommissionDeadline !== null ? t("dueDiligence.oilTank.tank.deadline", { date: tank.decommissionDeadline }) : "",
  });
}

/** What BBR's tank register adds to the oil tank answer, or null when it was not asked. */
function tankDetail(riskFlags: RiskFlags, t: TranslateFn): string | null {
  const registry = riskFlags.oilTanks;
  if (!registry) return null;
  const standing = registry.tanks.filter((tank) => !tank.decommissioned);
  const gone = registry.tanks.length - standing.length;
  const parts: string[] = [];
  if (standing.length > 0) {
    const facts = standing.map((tank) => tankFacts(tank, t)).join("; ");
    parts.push(standing.length === 1
      ? t("dueDiligence.oilTank.tank.standingOne", { facts })
      : t("dueDiligence.oilTank.tank.standingMany", { count: standing.length, facts }));
    if (standingTanks(riskFlags).overdue > 0) parts.push(t("dueDiligence.oilTank.tank.overdue"));
  }
  if (gone > 0) parts.push(t("dueDiligence.oilTank.tank.decommissioned", { count: gone }));
  if (registry.tanks.length === 0) parts.push(t("dueDiligence.oilTank.tank.none"));
  return parts.join(" ");
}

function landDetail(riskFlags: RiskFlags, t: TranslateFn): string {
  const land = riskFlags.landRegistration;
  if (!land) return t("dueDiligence.land.unknown");
  const area = (sqm: number) => nf.format(sqm);
  const findings = [
    land.forestReserve && t("dueDiligence.land.forest", { area: area(land.forestReserve.areaSqm) }),
    land.beachProtection && t("dueDiligence.land.beach", { area: area(land.beachProtection.areaSqm) }),
    land.duneProtection && t("dueDiligence.land.dune", { area: area(land.duneProtection.areaSqm) }),
    land.entailedForest && t("dueDiligence.land.entail"),
    land.agriculturalNote && t("dueDiligence.land.farm", { note: land.agriculturalNote }),
  ].filter((finding): finding is string => Boolean(finding));
  const notes = [
    land.commonLot && t("dueDiligence.land.commonLot"),
    land.condominiumParent && t("dueDiligence.land.condominium"),
    land.totalAreaSqm !== null && t("dueDiligence.land.area", { area: area(land.totalAreaSqm) }),
  ].filter((note): note is string => Boolean(note));
  return [...(findings.length > 0 ? findings : [t("dueDiligence.land.clear")]), ...notes].join(" ");
}

const percentFormat = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0, signDisplay: "exceptZero" });

function valuationDetail(riskFlags: RiskFlags, askingPriceDkk: number | null, t: TranslateFn): string {
  const valuation = riskFlags.valuation;
  if (!valuation || valuation.propertyValueDkk === null) return t("dueDiligence.valuation.unknown");
  const parts = [
    valuation.landValueDkk !== null
      ? t("dueDiligence.valuation.value", { year: valuation.year, value: formatDkk(valuation.propertyValueDkk), land: formatDkk(valuation.landValueDkk) })
      : t("dueDiligence.valuation.valueOnly", { year: valuation.year, value: formatDkk(valuation.propertyValueDkk) }),
  ];
  if (valuation.previousYear !== null && valuation.previousPropertyValueDkk !== null && valuation.previousPropertyValueDkk > 0) {
    const change = ((valuation.propertyValueDkk - valuation.previousPropertyValueDkk) / valuation.previousPropertyValueDkk) * 100;
    parts.push(t("dueDiligence.valuation.change", { percent: `${percentFormat.format(change)} %`, year: valuation.previousYear }));
  }
  if (askingPriceDkk !== null && askingPriceDkk > 0 && valuation.propertyValueDkk > 0) {
    const gap = ((askingPriceDkk - valuation.propertyValueDkk) / valuation.propertyValueDkk) * 100;
    const rounded = Math.round(gap);
    parts.push(rounded === 0
      ? t("dueDiligence.valuation.priceEqual")
      : t(rounded > 0 ? "dueDiligence.valuation.priceAbove" : "dueDiligence.valuation.priceBelow", { percent: `${Math.abs(rounded)} %` }));
  }
  return parts.join(" ");
}

function buildChecklist(riskFlags: RiskFlags | null, t: TranslateFn, askingPriceDkk: number | null): ChecklistItem[] {
  if (!riskFlags) {
    // Nothing has been checked, but each item still names where it would come from. Repeating "no data" as the
    // source told the reader nothing about what to look at.
    const sources = {
      noise: ["dueDiligence.noise.source", MILJOEGIS_NOISE_MAP_URL],
      encumbrance: ["dueDiligence.encumbrance.source", TINGLYSNING_URL],
      sewer: ["dueDiligence.sewer.source", null],
      buildingCases: ["dueDiligence.buildingCases.source", null],
      oilTank: ["dueDiligence.oilTank.source.bbr", BBR_URL],
      land: ["dueDiligence.land.source", MATRIKLEN_URL],
      valuation: ["dueDiligence.valuation.source", VURDERINGSPORTALEN_URL],
      soil: ["dueDiligence.soil.source", MILJOEPORTAL_SOIL_MAP_URL],
    } as const;
    return (Object.keys(sources) as Array<keyof typeof sources>).map((key) => ({
      label: t(`dueDiligence.${key}.label`),
      status: "unknown" as const,
      detail: t("dueDiligence.noData"),
      source: t(sources[key][0]),
      sourceHref: sources[key][1],
    }));
  }

  // Older enrichment rows were written before soilContamination existed on
  // RiskFlags, so the stored JSON can still lack it — guard against that
  // instead of trusting the type to match what's actually in the DB.
  const soilClassification = riskFlags.soilContamination?.classification ?? "unknown";
  const states = riskStatuses(riskFlags);
  const soilDetailKey =
    soilClassification === "v2"
      ? "dueDiligence.soil.v2"
      : soilClassification === "v1"
        ? "dueDiligence.soil.v1"
        : soilClassification === "unknown"
          ? "dueDiligence.soil.unknown"
          : "dueDiligence.soil.none";

  const band = riskFlags.noiseBand ?? null;
  const noiseDetail = band
    ? t(band.upperDb === null ? "dueDiligence.noise.bandTop" : "dueDiligence.noise.band", {
        lower: band.lowerDb, upper: band.upperDb ?? "", source: t(`dueDiligence.noise.from.${band.source}`),
      })
    : riskFlags.noiseChecked
      ? t("dueDiligence.noise.clear")
      : states.noise !== "unknown"
        ? t("dueDiligence.noise.value", { value: riskFlags.noiseExposureLden! })
        : t("dueDiligence.noise.none");
  const heating = riskFlags.heatingInstallation ?? null;
  const standing = standingTanks(riskFlags).count > 0;
  const heatingDetail = states.oilTank === "unknown"
    ? heating ? t("dueDiligence.oilTank.unknownFuel", { heating }) : t("dueDiligence.oilTank.unknown")
    : riskFlags.oilTankRisk
      ? t(riskFlags.oilTankRiskSource === "bbr" ? "dueDiligence.oilTank.warning.bbr" : "dueDiligence.oilTank.warning")
      : heating ? t("dueDiligence.oilTank.ok.bbr", { heating }) : t("dueDiligence.oilTank.ok");
  // A registered tank is the finding; the heating line would only repeat "district heating" next to it, or
  // say "oil heating" when the tank is what BBR actually registers.
  const registeredTanks = tankDetail(riskFlags, t);
  const oilDetail = registeredTanks === null ? heatingDetail : standing ? registeredTanks : `${heatingDetail} ${registeredTanks}`;
  const siteName = riskFlags.soilContaminationSiteName ?? null;

  return [
    {
      label: t("dueDiligence.noise.label"),
      status: states.noise,
      detail: noiseDetail,
      source: t(riskFlags.noiseChecked || band ? "dueDiligence.noise.source.mapped" : "dueDiligence.noise.source"),
      sourceHref: MILJOEGIS_NOISE_MAP_URL,
    },
    {
      label: t("dueDiligence.encumbrance.label"),
      status: "warning",
      // No register answers this automatically: the tingbogsattest is always the reader's own step.
      detail: t("dueDiligence.encumbrance.warning"),
      source: t("dueDiligence.encumbrance.source"),
      sourceHref: riskFlags.encumbranceLookupUrl ?? TINGLYSNING_URL,
    },
    {
      label: t("dueDiligence.sewer.label"),
      status: "warning",
      detail: riskFlags.sewerSeparationLookupUrl
        ? t("dueDiligence.sewer.linkLabel")
        : t("dueDiligence.sewer.warning"),
      href: riskFlags.sewerSeparationLookupUrl,
      source: t("dueDiligence.sewer.source"),
      sourceHref: riskFlags.sewerSeparationLookupUrl,
    },
    {
      label: t("dueDiligence.buildingCases.label"),
      status: "warning",
      // Older rows predate the field, so it can be undefined at runtime.
      detail: riskFlags.buildingCaseArchiveUrl
        ? t("dueDiligence.buildingCases.linkLabel")
        : t("dueDiligence.buildingCases.warning"),
      href: riskFlags.buildingCaseArchiveUrl ?? null,
      source: t("dueDiligence.buildingCases.source"),
      sourceHref: riskFlags.buildingCaseArchiveUrl ?? null,
    },
    {
      label: t("dueDiligence.oilTank.label"),
      status: states.oilTank,
      // A warning from BBR's registered heating is not "building age suggests", which is the heuristic's wording.
      detail: oilDetail,
      // An unknown result used no heuristic, so it must not be labelled as one; BBR is where the answer would come from.
      source:
        riskFlags.oilTanks
          ? t("dueDiligence.oilTank.source.tanks")
          : riskFlags.oilTankRiskSource === "bbr" || states.oilTank === "unknown"
            ? t("dueDiligence.oilTank.source.bbr")
            : t("dueDiligence.oilTank.source.heuristic"),
      sourceHref: riskFlags.oilTankRiskSource === "bbr" || states.oilTank === "unknown" ? BBR_URL : null,
    },
    {
      label: t("dueDiligence.land.label"),
      status: landStatus(riskFlags),
      detail: landDetail(riskFlags, t),
      source: t("dueDiligence.land.source"),
      sourceHref: MATRIKLEN_URL,
    },
    {
      label: t("dueDiligence.valuation.label"),
      // A valuation is context for the price, not a risk: it is known or it is not.
      status: riskFlags.valuation ? "ok" : "unknown",
      detail: valuationDetail(riskFlags, askingPriceDkk, t),
      source: t("dueDiligence.valuation.source"),
      sourceHref: VURDERINGSPORTALEN_URL,
    },
    {
      label: t("dueDiligence.soil.label"),
      status: states.soil,
      detail: siteName && states.soil === "warning" ? `${t(soilDetailKey)} ${t("dueDiligence.soil.site", { name: siteName })}` : t(soilDetailKey),
      // Deep link to the parcel's jordforureningsattest (jord.miljoeportal.dk)
      // when cadastral data allowed building one; the source line keeps the
      // general map as fallback either way.
      href: riskFlags.soilContaminationAttestUrl ?? null,
      source: riskFlags.soilContaminationAttestUrl
        ? t("dueDiligence.soil.source.attest")
        : t("dueDiligence.soil.source"),
      sourceHref: riskFlags.soilContaminationAttestUrl ?? MILJOEPORTAL_SOIL_MAP_URL,
    },
  ];
}

const STATUS_STYLES: Record<ChecklistItem["status"], { row: string; icon: string }> = {
  ok: { row: "border-success-soft bg-success-soft text-success-text", icon: "✓" },
  warning: { row: "border-warning-soft bg-warning-soft text-warning-text", icon: "!" },
  unknown: { row: "border-unknown-soft bg-unknown-soft text-unknown-text", icon: "?" },
};

export function DueDiligenceChecklist({ riskFlags, askingPriceDkk = null }: { riskFlags: RiskFlags | null; askingPriceDkk?: number | null }) {
  const { t } = useI18n();
  const items = buildChecklist(riskFlags, t, askingPriceDkk);

  return (
    <div className="rounded-[20px] border border-border bg-surface p-4 shadow-card">
      <h3 className="mb-3 text-[15px] font-extrabold text-ink">{t("dueDiligence.title")}</h3>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.label} className={`rounded-[9px] border px-3 py-2 text-sm ${STATUS_STYLES[item.status].row}`}>
            <div className="flex items-center gap-1.5 text-[13px] font-bold">
              <span aria-hidden="true">{STATUS_STYLES[item.status].icon}</span>
              {item.label}
            </div>
            <div className="mt-0.5 text-[11.5px] opacity-85">
              {item.href ? (
                <a href={item.href} target="_blank" rel="noreferrer" className="underline">
                  {item.detail}
                </a>
              ) : (
                item.detail
              )}
            </div>
            <div className="mt-1 text-[11px] opacity-70">
              {item.sourceHref ? (
                <a href={item.sourceHref} target="_blank" rel="noreferrer" className="underline">
                  {t("dueDiligence.source", { source: item.source })}
                </a>
              ) : (
                t("dueDiligence.source", { source: item.source })
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
