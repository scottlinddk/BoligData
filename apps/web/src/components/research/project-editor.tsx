import type { BuyingProject } from "@shared/analysis";
import type { PropertyType } from "@shared/types/index";
import { NumberField, Panel, TextField, useResearchText } from "./fields";

const types: [PropertyType, string, string][] = [["villa", "Villa", "House"], ["terraced_house", "Rækkehus", "Terraced house"], ["apartment", "Lejlighed", "Apartment"], ["villa_apartment", "Villalejlighed", "House apartment"], ["farm", "Landejendom", "Farm"], ["summer_house", "Sommerhus", "Summer house"], ["cooperative", "Andelsbolig", "Cooperative"], ["other", "Anden type", "Other"]];
export function ProjectEditor({ project, onChange }: { project: BuyingProject; onChange: (value: BuyingProject) => void }) {
  const tx = useResearchText();
  const update = (v: Partial<BuyingProject>) => onChange({ ...project, ...v });
  const list = (key: "primaryAreas" | "secondaryAreas" | "excludedAddresses" | "excludedRoads" | "excludedAreas" | "preferences", da: string, en: string) => <TextField key={key} label={tx(da, en)} value={project[key].join("\n")} multiline onChange={v => update({ [key]: v.split("\n") })} />;
  return <Panel title={tx("Privat købsprojekt", "Private buying project")}>
    <p className="mb-4 text-sm text-ink-soft">{tx("Kravene tilhører dit projekt. Ændringer genberegner dine boliger; historiske observationer bevares.", "Requirements belong to your project. Changes recalculate your candidates while preserving historical observations.")}</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField label={tx("Projektnavn", "Project name")} value={project.name} onChange={name => update({ name })} />
      <NumberField label={tx("Samlet projektloft (kr.)", "Total project ceiling (DKK)")} value={project.totalBudget} onChange={n => update({ totalBudget: n ?? 0 })} />
      <NumberField label={tx("Mindste boligareal (m²)", "Minimum residential area (m²)")} value={project.minResidentialArea} onChange={n => update({ minResidentialArea: n ?? 0 })} />
      <NumberField label={tx("Lovligt anvendelige soveværelser", "Legally usable bedrooms")} value={project.minBedrooms} onChange={n => update({ minBedrooms: n ?? 0 })} />
    </div>
    <fieldset className="mt-4"><legend className="mb-2 text-sm font-semibold">{tx("Godtagne boligtyper", "Accepted property types")}</legend><div className="flex flex-wrap gap-3">{types.map(([value, da, en]) => <label className="text-sm" key={value}><input type="checkbox" checked={project.acceptedPropertyTypes.includes(value)} onChange={e => update({ acceptedPropertyTypes: e.target.checked ? [...project.acceptedPropertyTypes, value] : project.acceptedPropertyTypes.filter(t => t !== value) })} /> {tx(da, en)}</label>)}</div></fieldset>
    <fieldset className="mt-4"><legend className="mb-2 text-sm font-semibold">{tx("Købsspor", "Buying tracks")}</legend><div className="flex gap-4">{(["move_in_ready", "renovation"] as const).map(v => <label className="text-sm" key={v}><input type="checkbox" checked={project.tracks.includes(v)} onChange={e => update({ tracks: e.target.checked ? [...project.tracks, v] : project.tracks.filter(t => t !== v) })} /> {v === "renovation" ? tx("Renovering", "Renovation") : tx("Indflytningsklart", "Move-in ready")}</label>)}</div></fieldset>
    <p className="mb-2 mt-5 text-xs text-ink-soft">{tx("Én værdi pr. linje. Personlige fravalg er ikke offentlige støjvurderinger.", "One entry per line. Personal exclusions are not public noise assessments.")}</p>
    <div className="grid gap-4 sm:grid-cols-2">{list("primaryAreas", "Primære områder", "Primary areas")}{list("secondaryAreas", "Sekundære områder", "Secondary areas")}{list("excludedAddresses", "Fravalgte adresser (hårdt krav)", "Excluded addresses (hard requirement)")}{list("excludedRoads", "Fravalgte veje (hårdt krav)", "Excluded roads (hard requirement)")}{list("excludedAreas", "Fravalgte områdenavne (hårdt krav)", "Excluded area names (hard requirement)")}{list("preferences", "Præferencer (ikke hårde krav)", "Preferences (not hard requirements)")}</div>
  </Panel>;
}
