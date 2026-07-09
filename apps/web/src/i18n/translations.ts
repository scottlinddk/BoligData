export type Language = "da" | "en";

export const LANGUAGES: Language[] = ["da", "en"];
export const DEFAULT_LANGUAGE: Language = "da";

/**
 * Danish is the source of truth for the translation shape. English is typed
 * against it (see `Translations` below), so both dictionaries must stay in
 * sync at compile time — a missing key in `en` is a type error.
 */
const da = {
  "app.name": "BoligData",
  "app.tagline": "Research og due diligence for danske boliginvestorer",

  "nav.search": "Søg",
  "nav.dashboard": "Overblik",
  "nav.signIn": "Log ind",
  "nav.signOut": "Log ud",

  "controls.language": "Sprog",
  "controls.theme.toLight": "Skift til lyst tema",
  "controls.theme.toDark": "Skift til mørkt tema",

  "search.loading": "Indlæser boliger...",
  "search.error": "Kunne ikke indlæse boliger.",
  "search.noResults": "Ingen resultater",
  "search.range": "{from}-{to} af {total}",
  "search.previous": "Forrige",
  "search.next": "Næste",

  "filters.location": "Område",
  "filters.locationPlaceholder": "f.eks. Aalborg",
  "filters.minPrice": "Min. pris",
  "filters.maxPrice": "Maks. pris",
  "filters.minSqm": "Min. m²",
  "filters.maxSqm": "Maks. m²",
  "filters.minBuildingYear": "Byggeår fra",
  "filters.maxBuildingYear": "Byggeår til",
  "filters.maxDaysOnMarket": "Maks. dage til salg",
  "filters.sortBy": "Sortér efter",

  "sort.listingDate:desc": "Nyeste først",
  "sort.pricePerSqm:asc": "Pris/m² (lav til høj)",
  "sort.pricePerSqm:desc": "Pris/m² (høj til lav)",
  "sort.price:asc": "Pris (lav til høj)",
  "sort.price:desc": "Pris (høj til lav)",
  "sort.daysOnMarket:asc": "Dage til salg",

  "property.daysOnMarket": "{days} dage til salg",
  "property.sqm": "{sqm} m²",
  "property.pricePerSqm": "{price}/m²",

  "detail.loading": "Indlæser...",
  "detail.notFound": "Bolig ikke fundet.",
  "detail.price": "Pris",
  "detail.size": "Størrelse",
  "detail.pricePerSqm": "Pris/m²",
  "detail.daysOnMarket": "Dage til salg",
  "detail.rooms": "Værelser",
  "detail.built": "Bygget",
  "detail.energyLabel": "Energimærke",
  "detail.renovated": "Renoveret",
  "detail.listedBy": "Udbudt af {name}",
  "detail.empty": "—",

  "dueDiligence.title": "Due diligence-tjekliste",
  "dueDiligence.noData": "Ingen berigelsesdata endnu.",
  "dueDiligence.noise.label": "Støjbelastning",
  "dueDiligence.noise.value": "Lden {value} dB",
  "dueDiligence.noise.none": "Ingen trafikstøjdata tilgængelig.",
  "dueDiligence.encumbrance.label": "Hæftelser (tingbogsattest)",
  "dueDiligence.encumbrance.warning": "Bestil en tingbogsattest før du giver et bud.",
  "dueDiligence.encumbrance.ok": "Ingen udestående hæftelser fundet.",
  "dueDiligence.sewer.label": "Kloakseparering",
  "dueDiligence.sewer.warning": "Boligen kan kræve separering af regn- og spildevand.",
  "dueDiligence.sewer.ok": "Intet krav om separering registreret.",
  "dueDiligence.oilTank.label": "Risiko for olietank",
  "dueDiligence.oilTank.warning": "Bygningens alder tyder på en mulig gammel olietank.",
  "dueDiligence.oilTank.ok": "Ingen risiko for olietank angivet.",
  "dueDiligence.soil.label": "Risiko for jordforurening",
  "dueDiligence.soil.warning": "Området har en registreret markering for jordforurening.",
  "dueDiligence.soil.ok": "Ingen markering for jordforurening registreret.",

  "comparables.soldHistory": "Historik for salgspriser",
  "comparables.noHistory": "Ingen prishistorik tilgængelig.",
  "comparables.onePoint": "Kun ét datapunkt registreret.",
  "comparables.title": "Sammenlignelige boliger (seneste 12 mdr.)",
  "comparables.neighborhoodAvg": "Områdegennemsnit: {price}/m²",
  "comparables.none": "Ingen sammenlignelige salg fundet i nærheden.",
  "comparables.soldEntry": "Solgt {date} · {price} · {pricePerSqm}/m² · {distance} m væk",
  "comparables.historyEntry": "{date}: {price} ({pricePerSqm}/m²)",

  "dashboard.title": "Gemte søgninger",
  "dashboard.loading": "Indlæser...",
  "dashboard.empty":
    "Ingen gemte søgninger endnu. Gem et filter fra søgesiden for at få besked om nye matches.",
  "dashboard.lastAlert": "Seneste besked: {date}",
  "dashboard.never": "aldrig",

  "alerts.none": "Ingen beskeder",
  "alerts.immediate": "Med det samme",
  "alerts.daily": "Dagligt",
  "alerts.weekly": "Ugentligt",

  "auth.email": "E-mail",
  "auth.password": "Adgangskode",
  "auth.signIn.title": "Log ind",
  "auth.signIn.submit": "Log ind",
  "auth.signIn.submitting": "Logger ind...",
  "auth.signIn.createAccount": "Opret en konto",
  "auth.signIn.forgotPassword": "Glemt adgangskode?",
  "auth.signUp.title": "Opret en konto",
  "auth.signUp.passwordPlaceholder": "Adgangskode (min. 8 tegn)",
  "auth.signUp.submit": "Opret konto",
  "auth.signUp.submitting": "Opretter konto...",
  "auth.signUp.checkEmail": "Tjek din e-mail",
  "auth.signUp.confirmationSent": "Vi har sendt et bekræftelseslink til {email}.",
  "auth.signUp.haveAccount": "Har du allerede en konto?",
  "auth.reset.title": "Nulstil adgangskode",
  "auth.reset.submit": "Send nulstillingslink",
  "auth.reset.submitting": "Sender...",
  "auth.reset.sent": "Hvis der findes en konto for {email}, er der sendt et nulstillingslink.",
} as const;

export type TranslationKey = keyof typeof da;
export type Translations = Record<TranslationKey, string>;

const en: Translations = {
  "app.name": "BoligDataResearch",
  "app.tagline": "Research and due diligence for Danish property investors",

  "nav.search": "Search",
  "nav.dashboard": "Dashboard",
  "nav.signIn": "Sign in",
  "nav.signOut": "Sign out",

  "controls.language": "Language",
  "controls.theme.toLight": "Switch to light theme",
  "controls.theme.toDark": "Switch to dark theme",

  "search.loading": "Loading properties...",
  "search.error": "Failed to load properties.",
  "search.noResults": "No results",
  "search.range": "{from}-{to} of {total}",
  "search.previous": "Previous",
  "search.next": "Next",

  "filters.location": "Location",
  "filters.locationPlaceholder": "e.g. Aalborg",
  "filters.minPrice": "Min price",
  "filters.maxPrice": "Max price",
  "filters.minSqm": "Min sqm",
  "filters.maxSqm": "Max sqm",
  "filters.minBuildingYear": "Min year built",
  "filters.maxBuildingYear": "Max year built",
  "filters.maxDaysOnMarket": "Max days on market",
  "filters.sortBy": "Sort by",

  "sort.listingDate:desc": "Newest first",
  "sort.pricePerSqm:asc": "Price/sqm (low to high)",
  "sort.pricePerSqm:desc": "Price/sqm (high to low)",
  "sort.price:asc": "Price (low to high)",
  "sort.price:desc": "Price (high to low)",
  "sort.daysOnMarket:asc": "Days on market",

  "property.daysOnMarket": "{days} days on market",
  "property.sqm": "{sqm} m²",
  "property.pricePerSqm": "{price}/m²",

  "detail.loading": "Loading...",
  "detail.notFound": "Property not found.",
  "detail.price": "Price",
  "detail.size": "Size",
  "detail.pricePerSqm": "Price/m²",
  "detail.daysOnMarket": "Days on market",
  "detail.rooms": "Rooms",
  "detail.built": "Built",
  "detail.energyLabel": "Energy label",
  "detail.renovated": "Renovated",
  "detail.listedBy": "Listed by {name}",
  "detail.empty": "—",

  "dueDiligence.title": "Due diligence checklist",
  "dueDiligence.noData": "No enrichment data yet.",
  "dueDiligence.noise.label": "Noise exposure",
  "dueDiligence.noise.value": "Lden {value} dB",
  "dueDiligence.noise.none": "No traffic noise data available.",
  "dueDiligence.encumbrance.label": "Encumbrance check (tingbogsattest)",
  "dueDiligence.encumbrance.warning": "Order a tingbogsattest before making an offer.",
  "dueDiligence.encumbrance.ok": "No outstanding encumbrance flags found.",
  "dueDiligence.sewer.label": "Sewer separation",
  "dueDiligence.sewer.warning": "Property may require separation of rain/waste water.",
  "dueDiligence.sewer.ok": "No separation requirement on record.",
  "dueDiligence.oilTank.label": "Oil tank risk",
  "dueDiligence.oilTank.warning": "Building age suggests a possible legacy oil tank.",
  "dueDiligence.oilTank.ok": "No oil tank risk indicated.",
  "dueDiligence.soil.label": "Soil contamination risk",
  "dueDiligence.soil.warning": "Area has a recorded soil contamination flag.",
  "dueDiligence.soil.ok": "No soil contamination flag on record.",

  "comparables.soldHistory": "Sold price history",
  "comparables.noHistory": "No price history available.",
  "comparables.onePoint": "Only one data point on record.",
  "comparables.title": "Comparable properties (last 12mo)",
  "comparables.neighborhoodAvg": "Neighborhood avg: {price}/m²",
  "comparables.none": "No comparable sales found nearby.",
  "comparables.soldEntry": "Sold {date} · {price} · {pricePerSqm}/m² · {distance}m away",
  "comparables.historyEntry": "{date}: {price} ({pricePerSqm}/m²)",

  "dashboard.title": "Saved searches",
  "dashboard.loading": "Loading...",
  "dashboard.empty":
    "No saved searches yet. Save a filter from the search page to get alerted about new matches.",
  "dashboard.lastAlert": "Last alert: {date}",
  "dashboard.never": "never",

  "alerts.none": "No alerts",
  "alerts.immediate": "Immediate",
  "alerts.daily": "Daily",
  "alerts.weekly": "Weekly",

  "auth.email": "Email",
  "auth.password": "Password",
  "auth.signIn.title": "Sign in",
  "auth.signIn.submit": "Sign in",
  "auth.signIn.submitting": "Signing in...",
  "auth.signIn.createAccount": "Create an account",
  "auth.signIn.forgotPassword": "Forgot password?",
  "auth.signUp.title": "Create an account",
  "auth.signUp.passwordPlaceholder": "Password (min 8 characters)",
  "auth.signUp.submit": "Sign up",
  "auth.signUp.submitting": "Creating account...",
  "auth.signUp.checkEmail": "Check your email",
  "auth.signUp.confirmationSent": "We sent a confirmation link to {email}.",
  "auth.signUp.haveAccount": "Already have an account?",
  "auth.reset.title": "Reset password",
  "auth.reset.submit": "Send reset link",
  "auth.reset.submitting": "Sending...",
  "auth.reset.sent": "If an account exists for {email}, a reset link has been sent.",
};

export const translations: Record<Language, Translations> = { da, en };

export const LANGUAGE_LABELS: Record<Language, string> = {
  da: "Dansk",
  en: "English",
};
