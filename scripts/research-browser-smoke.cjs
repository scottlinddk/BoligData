/* Run against a local Vite server: node scripts/research-browser-smoke.cjs
 * Every API, Supabase, map and external request is mocked or blocked. No production login or write occurs.
 * PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE, SMOKE_BASE_URL, SMOKE_OUTPUT_DIR and SMOKE_THEME can override local defaults.
 * SMOKE_SCENARIO=sparse covers fresh accounts and missing/partial evidence.
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:5174";
assert(["127.0.0.1", "localhost"].includes(new URL(baseUrl).hostname), "Only a local development server is allowed");
const theme = process.env.SMOKE_THEME || "light";
assert(["light", "dark"].includes(theme), "SMOKE_THEME must be light or dark");
const scenario = process.env.SMOKE_SCENARIO || "complete";
assert(["complete", "sparse"].includes(scenario), "SMOKE_SCENARIO must be complete or sparse");
const outputDir = process.env.SMOKE_OUTPUT_DIR || path.join(root, `node_modules/.cache/research-smoke${scenario === "sparse" ? "-sparse" : ""}${theme === "dark" ? "-dark" : ""}`);
fs.mkdirSync(outputDir, { recursive: true });
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || "playwright"); }
catch { playwright = require(path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright")); }

const envFile = fs.readFileSync(path.join(root, "apps/web/.env.production"), "utf8");
const publicUrl = envFile.match(/^VITE_SUPABASE_URL\s*=\s*["']?([^\r\n"']+)/m)?.[1]?.trim();
assert(publicUrl, "The local frontend needs its public Supabase URL to determine the test storage key");
const authStorageKey = `sb-${new URL(publicUrl).hostname.split(".")[0]}-auth-token`;
const now = new Date().toISOString();
const dayBefore = days => new Date(Date.parse(`${now.slice(0, 10)}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
const listingDate = dayBefore(240);
const userId = "00000000-0000-4000-8000-000000000001";
const propertyId = "00000000-0000-4000-8000-000000000002";
const testUser = { id: userId, aud: "authenticated", role: "authenticated", email: "fixture@example.invalid", email_confirmed_at: now, app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, created_at: now };
const profile = { id: userId, role: "user", organization_name: null, full_name: "Browser Fixture", created_at: now, notification_channels: {}, contact_pref: "app", best_time: "anytime" };
const exp = Math.floor(Date.now() / 1000) + 3600;
const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, aud: "authenticated", role: "authenticated", exp })).toString("base64url")}.fixture-signature`;
const session = { access_token: token, refresh_token: "local-test-only", token_type: "bearer", expires_in: 3600, expires_at: exp, user: testUser };
const property = {
  id: propertyId, address: "Testvej 1, 9000 Aalborg", municipality: "Aalborg", postalCode: "9000", price: 4_900_000, sqm: 140,
  listingDate, listingSource: "boligsiden", externalId: "fixture-case", dataMode: "real", lat: 57.04, lon: 9.87,
  status: "active", buildingYear: 1970, propertyType: "villa", rooms: 4, images: [], description: "Kræver totalrenovering. Dødsbo.",
  agentName: "Fixture agent", listingUrl: null, agentUserId: null, isPromoted: false, promotedAt: null, promotedBy: null,
  idLokalid: null, matrikelnr: null, ejerlav: null, zone: null, bfeNummer: null, registeredAreaSqm: null, bbrData: null, riskFlags: null,
  createdAt: `${listingDate}T12:00:00Z`, updatedAt: now,
};
let project = { name: "Privat testprojekt", totalBudget: 5_000_000, minResidentialArea: 130, minBedrooms: 3, acceptedPropertyTypes: ["villa"], primaryAreas: ["Aalborg"], secondaryAreas: [], excludedAddresses: [], excludedRoads: [], excludedAreas: [], preferences: [], tracks: ["move_in_ready", "renovation"] };
const cost = (id, label, amount, category) => ({ id, label, category, low: amount, high: amount, vat: "included", vatRate: null, status: "assumption", source: "Browser fixture", observedAt: now.slice(0, 10), necessary: true, include: true, coveredByItemId: null });
let assessment = {
  propertyId, legalBedrooms: 3, bedroomEvidence: "verified", bedroomSource: "Godkendt plantegning side 2", residentialArea: 140,
  areaEvidence: "verified", areaSource: "BBR boligenhed", hardRequirements: [],
  budgetItems: [cost("fees", "Handel", 150_000, "transaction"), cost("work", "Arbejder", 650_000, "necessary_work"), cost("reserve", "Reserve", 200_000, "reserve")],
  selectedPurchasePrice: null, questions: [{ id: "q1", text: "Kan I sende den godkendte plantegning?", resolved: false }], notes: "Privat testnote — må ikke indgå i mæglerudkast", comparables: [], documents: [], brokerDraft: "", budgetScenario: "base",
};
const transactions = Array.from({ length: 6 }, (_, i) => ({
  id: `transaction-${i}`, transactionIdentity: `verified-transaction-${i}`, propertyId: `00000000-0000-4000-8000-${String(i + 10).padStart(12, "0")}`, unitId: null, address: `Referencevej ${i + 1}, Aalborg`,
  municipality: "Aalborg", postalCode: "9000", propertyType: "villa", saleType: "normal", saleDate: dayBefore(365), observedAt: now,
  firstAsking: 4_600_000 + i * 100_000, lastAsking: 4_300_000 + i * 100_000, soldPrice: i === 5 ? 6_000_000 : 3_800_000 + i * 100_000, residentialArea: 140,
  areaDefinition: "residential", areaAtSale: true, areaEvidence: "verified", activeDays: i === 5 ? 20 : 240, latestEpisodeDays: i === 5 ? 20 : 240,
  calendarDays: null, condition: null, dataMode: "live", status: "sold", source: "Browser fixture", datePrecision: "day", saleDateEnd: null, sourceUrl: null,
  lat: 57.04 + i * 0.001, lon: 9.87 + i * 0.001,
}));
const history = { campaigns: [{ id: "current-campaign", propertyId, linkReason: "Exact fixture listing identity", source: "boligsiden", sourceUrl: null, observedAt: now }], episodes: [{ id: "current-episode", propertyId, campaignId: "current-campaign", source: "boligsiden", sourceListingId: property.externalId, sourceUrl: null, startDate: listingDate, endDate: null, datePrecision: "day", status: "active", agentName: property.agentName, observedAt: now, dataMode: "real" }], events: [], transactions, observations: [], conditionEvidence: [], dataVersion: "browser-fixture-v2", retrievedAt: now, truncated: false };
const lookup = {
  address: property.address, resolved: { idLokalid: null, matrikelnr: null, ejerlav: null, ejerlavskode: null, bfeNummer: null, zone: null, formattedAddress: property.address, postalCode: "9000", lat: 57.04, lon: 9.87 },
  bbrData: null, publicValuation: null, priceHistory: [], nearbySales: [], renovationCategory: { category: "D", isEstimate: true, symbol: "~", reason: "Unknown", source: "ai" }, screening: [],
  scoringInputs: { locationMatch: null, conditionProxy: null, priceHeadroomDkk: null, areaMarginSqm: null, schoolDistrictScore: null, noiseZoneEstimate: null, legalRiskProxy: null, source: "ai" },
  sources: ["address", "bbr", "publicValuation", "noise", "sales"].map(key => ({ key, register: key, mode: "unavailable", error: "Local browser fixture" })), dataMode: "unavailable", source: "ai",
};

// Fresh accounts must not rely on the happy-path fixture's saved budget,
// verified bedrooms, populated campaign or imported duration-matched sales.
const emptyHistory = () => ({ campaigns: [], episodes: [], events: [], transactions: [], observations: [], conditionEvidence: [], dataVersion: "browser-sparse-fixture", retrievedAt: now, truncated: false });
const sparseProperties = [
  { ...property, address: "Legacyvej 14, 9000 Aalborg", externalId: "legacy-case", dataMode: "unknown", listingDate: null, firstSeenAt: `${dayBefore(20)}T12:00:00Z` },
  { ...property, id: "00000000-0000-4000-8000-000000000003", address: "Kildevej 8, 9000 Aalborg", externalId: "live-case", price: 3_650_000, sqm: 125, rooms: 5, listingDate: null },
  { ...property, id: "00000000-0000-4000-8000-000000000004", address: "Tidsløsvej 6, 9000 Aalborg", externalId: "baseline-case", listingDate: null },
  { ...property, id: "00000000-0000-4000-8000-000000000005", address: "Demovej 9, 9000 Aalborg", externalId: "mock-case", dataMode: "mock" },
];
const sparseHistory = subject => subject.id !== sparseProperties[1].id ? emptyHistory() : {
  ...emptyHistory(),
  campaigns: [{ id: "reported-campaign", propertyId: subject.id, linkReason: "Exact source listing identity", source: subject.listingSource, sourceUrl: null, observedAt: now }],
  episodes: [{ id: "reported-episode", propertyId: subject.id, campaignId: "reported-campaign", source: subject.listingSource, sourceListingId: subject.externalId, sourceUrl: null, startDate: null, endDate: null, datePrecision: "unknown", status: "active", agentName: subject.agentName, observedAt: now, dataMode: "real" }],
  observations: [{ id: "reported-duration", propertyId: subject.id, episodeId: "reported-episode", fieldName: "reported_time_on_market", value: { latestEpisodeDays: 464, totalDays: 464 }, source: subject.listingSource, sourceUrl: null, effectiveDate: now.slice(0, 10), datePrecision: "day", observedAt: now, method: "source_reported_duration", verificationStatus: "unverified", dataMode: "real", conflictGroup: null }],
};
const sparseLookup = subject => {
  const result = { ...lookup, address: subject.address, resolved: { ...lookup.resolved, formattedAddress: subject.address }, sources: lookup.sources.map(source => ({ ...source })) };
  if (subject.id === sparseProperties[1].id) {
    // The overall lookup stays unavailable because BBR/noise failed. Its sales
    // group independently carries real evidence and must remain visible.
    result.sources = result.sources.map(source => source.key === "sales" ? { ...source, register: "Boligsiden registered sales fixture", mode: "live", error: null } : source);
    result.priceHistory = [{ soldDate: dayBefore(600), price: 2_750_000, pricePerSqm: null, saleType: "normal", registrationId: "fixture-own-registered-sale" }];
    result.nearbySales = [{ address: "Nabovej 12, 9000 Aalborg", soldDate: dayBefore(90), price: 3_050_000, pricePerSqm: 23828, saleType: "normal", areaSqm: 128, propertyType: "villa", distanceMeters: 180, lat: 57.041, lon: 9.871 }];
  }
  return result;
};
const scopedHistory = subject => ({ ...emptyHistory(),
  transactions: subject.id === sparseProperties[1].id ? transactions.slice(0, 5).map(row => ({ ...row, latestEpisodeDays: 464, activeDays: 464 })) : [sparseProperties[2].id, sparseProperties[3].id].includes(subject.id) ? transactions.slice(0, 5).map(row => ({ ...row })) : [],
  marketScope: { propertyId: subject.id, municipality: subject.municipality, propertyType: subject.propertyType, saleFrom: dayBefore(730), saleTo: now.slice(0, 10), limit: 2000 },
});
let activeSparseProperty = sparseProperties[0];

async function main() {
  const browserPath = process.env.BROWSER_EXECUTABLE || ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"].find(p => fs.existsSync(p));
  const browser = await playwright.chromium.launch({ headless: true, executablePath: browserPath, args: ["--disable-background-networking", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, serviceWorkers: "block", locale: "da-DK" });
  const report = { theme, scenario, checks: [], apiWrites: [], apiReads: [], mockedExternalRequests: 0, unmockedApiRequests: [], pageErrors: [], screenshots: [], contrast: [] };
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await context.addInitScript(({ key, value, theme }) => { localStorage.setItem(key, JSON.stringify(value)); localStorage.setItem("boligdata.lang", "da"); localStorage.setItem("boligdata.theme", theme); }, { key: authStorageKey, value: session, theme });
  if (context.routeWebSocket) await context.routeWebSocket("**/*", socket => socket.close());
  await context.route("**/*", async route => {
    const request = route.request(); const url = new URL(request.url());
    // This branch handles every non-local request without sending it to its origin.
    if (url.origin !== new URL(baseUrl).origin) {
      report.mockedExternalRequests++;
      if (url.pathname.includes("/rest/v1/user_profiles")) return json(route, profile);
      if (url.pathname.includes("/auth/v1/user")) return json(route, testUser);
      if (url.pathname.includes("/auth/v1/")) return json(route, session);
      if (url.hostname === "tiles.openfreemap.org") return json(route, { version: 8, sources: {}, layers: [{ id: "fixture-background", type: "background", paint: { "background-color": url.pathname.endsWith("/dark") ? "#101b27" : "#e4ebe4" } }] });
      return route.fulfill({ status: 204, body: "" });
    }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const resource = url.searchParams.get("resource");
    if (request.method() !== "GET") report.apiWrites.push({ path: url.pathname, resource, method: request.method(), body: request.postDataJSON() });
    else report.apiReads.push({ path: url.pathname, ...Object.fromEntries(url.searchParams) });
    if (url.pathname === "/api/account" && resource === "research-project") {
      if (scenario === "sparse") return json(route, { project: null, updatedAt: null });
      if (request.method() === "PUT") project = request.postDataJSON().project;
      return json(route, { project, updatedAt: now });
    }
    if (url.pathname === "/api/account" && resource === "research-assessment") {
      if (scenario === "sparse") return json(route, { assessment: null, revision: 0, updatedAt: null, revisions: [] });
      if (request.method() === "PUT") assessment = request.postDataJSON().assessment;
      return json(route, { assessment, revision: 1, updatedAt: now, revisions: [] });
    }
    if (resource === "research-assessments") return json(route, { assessments: scenario === "sparse" ? [] : [{ assessment, revision: 1, updatedAt: now, property }] });
    if (resource === "research-history") {
      const marketId = url.searchParams.get("marketForPropertyId");
      if (scenario === "sparse") return json(route, marketId ? scopedHistory(sparseProperties.find(row => row.id === marketId) ?? activeSparseProperty) : sparseHistory(sparseProperties.find(row => row.id === url.searchParams.get("propertyId")) ?? activeSparseProperty));
      return json(route, marketId ? { ...history, campaigns: [], episodes: [], events: [], observations: [], marketScope: { propertyId: marketId, municipality: property.municipality, propertyType: property.propertyType, saleFrom: dayBefore(730), saleTo: now.slice(0, 10), limit: 2000 } } : history);
    }
    if (resource === "connections") return json(route, { connections: [] });
    if (resource === "conversations") return json(route, { conversations: [] });
    if (url.pathname === "/api/properties") {
      if (url.searchParams.get("comparables")) return json(route, { comparables: [], neighborhoodAvgPricePerSqm: null });
      if (url.searchParams.get("id")) return json(route, { property: scenario === "sparse" ? sparseProperties.find(row => row.id === url.searchParams.get("id")) ?? activeSparseProperty : property, enrichment: null });
      return json(route, { authenticated: true, properties: [property], summaries: [], total: 1, limit: 8, offset: 0, page: 1, totalPages: 1 });
    }
    if (url.pathname === "/api/property-lookup") return json(route, scenario === "sparse" ? sparseLookup(sparseProperties.find(row => row.address === url.searchParams.get("address")) ?? activeSparseProperty) : lookup);
    if (url.pathname === "/api/favorites") return json(route, { favorites: [], properties: [] });
    if (url.pathname === "/api/notifications") return json(route, { notifications: [] });
    if (url.pathname === "/api/recommendations") return json(route, { recommendations: [] });
    if (url.pathname === "/api/searches") return json(route, []);
    if (resource === "settings") return json(route, { settings: { broadcastEnabled: false, updatedAt: now } });
    report.unmockedApiRequests.push(`${request.method()} ${url.pathname}?${url.searchParams}`);
    return json(route, { error: "Unmocked local browser fixture endpoint" }, 501);
  });
  const page = await context.newPage();
  page.on("pageerror", error => report.pageErrors.push(error.message));
  const screenshot = async (name, locator, fullPage = true) => { const target = path.join(outputDir, `${name}.png`); await (locator ?? page).screenshot({ path: target, animations: "disabled", ...(locator ? {} : { fullPage }) }); report.screenshots.push(target); };
  const waitText = async (text, scope = page) => scope.getByText(text, { exact: true }).first().waitFor();
  const darkContrast = async (label, locator) => {
    if (theme !== "dark") return;
    const colors = await locator.first().evaluate(element => {
      const rgb = color => color.match(/[\d.]+/g).slice(0, 3).map(Number);
      const style = getComputedStyle(element);
      let backgroundElement = element;
      while (backgroundElement.parentElement && getComputedStyle(backgroundElement).backgroundColor === "rgba(0, 0, 0, 0)") backgroundElement = backgroundElement.parentElement;
      const foreground = rgb(style.color), background = rgb(getComputedStyle(backgroundElement).backgroundColor);
      const luminance = values => values.map(value => { value /= 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
      const a = luminance(foreground), b = luminance(background);
      return { foreground, background, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
    });
    report.contrast.push({ label, ...colors });
    assert(colors.ratio >= 4.5, `${label} contrast must be 4.5:1: ${JSON.stringify(colors)}`);
  };
  try {
    if (scenario === "sparse") {
      const openSparse = async index => {
        activeSparseProperty = sparseProperties[index];
        const marketResponse = page.waitForResponse(response => {
          const url = new URL(response.url());
          return url.pathname === "/api/account" && url.searchParams.get("resource") === "research-history" && url.searchParams.get("marketForPropertyId") === activeSparseProperty.id;
        });
        await page.goto(`${baseUrl}/property/${activeSparseProperty.id}`);
        await marketResponse;
        await page.getByTestId("listing-evidence-overview").waitFor();
        await page.getByTestId("research-project-setup").waitFor();
        assert.equal(await page.locator("#research").getByRole("tablist").count(), 0, "Private research editor must not open before a fresh user opts in");
        assert.equal(await page.locator("#research").getByRole("heading", { name: "Afklar dokumentation først", exact: true }).count(), 0, "An empty private profile must not become a generic property verdict");
        assert.equal(await page.locator(".research-print").count(), 0, "Suggested default requirements must not become a private print decision before setup");
        assert.equal(report.apiWrites.length, 0, "Opening a listing must not create a project or assessment");
        return page.getByTestId("listing-evidence-overview");
      };
      const legacy = await openSparse(0);
      const legacyText = await legacy.innerText();
      for (const value of ["4.900.000", "140", "35.000"]) assert(legacyText.includes(value), `Legacy advertised fact ${value} must remain visible`);
      assert(!/20\s*dage/.test(legacyText), "Crawler first-seen must not become marketing time");
      assert.equal(await page.getByRole("button", { name: "Brug som budgetscenario", exact: true }).count(), 0, "Missing transactions must not produce an actionable estimate");
      await screenshot("research-fresh-legacy", page.locator("#research"));
      report.checks.push("Fresh legacy listing shows its advertised asking price, area and price per m² without a generic verdict or invented market time");
      await page.getByTestId("research-project-setup").getByRole("button", { name: "Tilpas dit boligprojekt", exact: true }).click();
      await page.getByLabel("Samlet projektloft (kr.)", { exact: true }).waitFor();
      assert.equal(await page.locator(".research-print").count(), 0, "Opening setup must not turn suggested defaults into a saved print basis");
      assert.equal(report.apiWrites.length, 0, "Opting into the private editor must remain unsaved until an explicit save");
      report.checks.push("Fresh-account setup explicitly reveals the private project editor without writing an account record");

      const live = await openSparse(1);
      await live.getByText(/3\.050\.000/).waitFor();
      await live.getByText("Liggetid oplyst af kilden", { exact: true }).waitFor();
      const liveText = await live.innerText();
      for (const value of ["3.650.000", "125", "29.200", "2.750.000", "3.050.000", "Nabovej 12"]) assert(liveText.includes(value), `Live listing evidence ${value} must remain visible`);
      assert(!liveText.includes("4.900.000"), "Navigating to another listing must replace the previous asking price");
      assert(/464\s*dage/i.test(liveText), "A dated source duration must remain visible without a listing start date");
      assert(!liveText.includes("Siden oplyst annoncedato") && !liveText.includes("Aktuelt udbudsforløb") && !liveText.includes(dayBefore(464)), "Reported days must not fabricate a start date or documented period");
      assert(!(await page.getByTestId("listing-price-median").innerText()).includes("3.571.429"), "Five sales with the same reported duration must not become a time-matched reference without documented subject chronology");
      assert.equal(await page.getByRole("button", { name: "Brug som budgetscenario", exact: true }).count(), 0, "Source-reported days must not unlock the documented-time reference action");
      await screenshot("research-fresh-live-sales", page.locator("#research"));
      report.checks.push("A different live listing shows 464 source-reported days and real own/nearby sales without inventing a start date or unlocking a time-matched reference");
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Sparse mobile detail must not overflow");
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await screenshot("research-fresh-mobile", null, false);
      report.checks.push("Fresh-account evidence and setup fit a 390px viewport");
      await page.setViewportSize({ width: 1365, height: 900 });

      await openSparse(2);
      const baseline = page.getByTestId("listing-price-baseline");
      await baseline.getByText(/4\.000\.000/).waitFor();
      assert(/uden.*(?:liggetid|tids)|ikke.*tidsjusteret/i.test(await baseline.locator('..').innerText()), "A baseline with missing duration must be explicitly labelled without time matching");
      assert(!(await page.getByTestId("listing-price-median").innerText()).includes("4.000.000"), "The primary time-matched result must remain unavailable");
      assert.equal(await page.getByRole("button", { name: "Brug som budgetscenario", exact: true }).count(), 0, "The primary reference action must not appear for a baseline-only estimate");
      await page.getByRole("button", { name: "Brug basisreference som budgetscenario", exact: true }).waitFor();
      await screenshot("research-fresh-baseline", page.locator("#research"));
      report.checks.push("Five real area-matched sales expose a labelled baseline while missing market time still blocks a time-adjusted estimate");

      await openSparse(3);
      const mockPrice = await page.getByTestId("listing-price-reference").innerText();
      assert(!mockPrice.includes("4.000.000"), "A mock subject must not receive a real price reference even with sufficient real comparison sales");
      assert.equal(await page.getByRole("button", { name: "Brug som budgetscenario", exact: true }).count(), 0);
      assert.equal(report.apiWrites.length, 0);
      assert.deepEqual(report.pageErrors, []);
      assert.deepEqual(report.unmockedApiRequests, []);
      report.checks.push("Mock subjects remain ineligible and all fresh-account browsing/setup produces zero API writes");
      return;
    }
    await page.goto(`${baseUrl}/research`); await waitText("Mit boligprojekt");
    assert.equal(await page.locator("html").evaluate(element => element.classList.contains("dark")), theme === "dark");
    await page.getByRole("button", { name: "Projektprofil", exact: true }).click();
    assert.equal(await page.getByLabel("Samlet projektloft (kr.)", { exact: true }).inputValue(), "5000000");
    report.checks.push("Private project profile loads");
    await screenshot("research-project-desktop");
    await page.getByRole("button", { name: "Statistik", exact: true }).click();
    await waitText("Handler bag prisreferencen");
    assert((await page.getByRole("table").first().textContent()).includes("Referencevej 1"));
    await page.getByRole("button", { name: "Vis kort og områdefilter", exact: true }).click();
    await page.locator(`[data-map-theme="${theme}"][aria-busy="false"]`).waitFor();
    await darkContrast("Dark research warning status", page.locator('.bg-warning-soft[role="status"]'));
    report.checks.push("Historical statistics render fixture transactions");
    await screenshot("research-statistics-desktop");

    await page.goto(`${baseUrl}/property/${propertyId}`);
    const workbench = page.locator("#research");
    await waitText("Afklar pris først", workbench);
    await darkContrast("Dark research success status", workbench.locator('.bg-success-soft'));
    await darkContrast("Dark research save action", workbench.getByRole("button", { name: "Gem projekt og undersøgelse", exact: true }));
    if (theme === "dark") report.checks.push("Dark research warning/success statuses and save action have readable contrast; sales map loads the selected dark style");
    const priceReference = workbench.getByTestId("listing-price-reference");
    const priceMedian = priceReference.getByTestId("listing-price-median");
    const timeDefinition = priceReference.getByLabel("Tidsdefinition til prisreference", { exact: true });
    await priceMedian.filter({ hasText: "4.000.000" }).waitFor();
    const rangeText = await priceReference.getByTestId("listing-price-range").innerText();
    assert(rangeText.includes("3.900.000") && rangeText.includes("4.100.000"), "Five duration-matched sales should give a DKK 3.9m–4.1m Q1/Q3 range");
    assert((await priceReference.innerText()).includes("900.000"), "Asking price should be DKK 900k above the historical median");
    assert((await priceReference.innerText()).includes("4.050.000"), "The six-sale baseline must remain separate from the five-sale time-matched reference");
    assert.equal(await timeDefinition.inputValue(), "latest_episode_days");
    report.checks.push("Five comparable sales in the 181–365-day cohort yield DKK 4m, Q1/Q3 3.9m–4.1m, and a 900k asking gap");
    await screenshot("research-price-reference-desktop", priceReference);

    await timeDefinition.selectOption("active_days");
    await priceMedian.filter({ hasText: "4.000.000" }).waitFor();
    await timeDefinition.selectOption("calendar_days");
    await page.waitForFunction(() => !document.querySelector('[data-testid="listing-price-median"]')?.textContent?.includes("4.000.000"));
    assert(!(await priceMedian.innerText()).includes("4.000.000"), "Missing calendar-time evidence must not retain the previous time-matched numerical estimate");
    await timeDefinition.selectOption("latest_episode_days");
    await priceMedian.filter({ hasText: "4.000.000" }).waitFor();
    report.checks.push("Changing time definitions recalculates the cohort; missing calendar evidence suppresses the estimate");

    await workbench.getByRole("tab", { name: "Sammenligninger", exact: true }).click();
    const comparisonRow = page.getByRole("tabpanel").getByRole("row").filter({ hasText: "Referencevej 1," });
    await comparisonRow.getByLabel("Begrundelse for udvalg", { exact: true }).fill("Fixture exclusion to verify minimum sample");
    await comparisonRow.getByRole("checkbox", { name: "Medtag", exact: true }).uncheck();
    await page.waitForFunction(() => !document.querySelector('[data-testid="listing-price-median"]')?.textContent?.includes("4.000.000"));
    assert(!(await priceMedian.innerText()).includes("4.000.000"), "Four duration-matched comparables must not produce a time-matched estimate");
    assert.equal(await priceReference.getByRole("button", { name: "Brug som budgetscenario", exact: true }).count(), 0, "A separate baseline must not retain the primary reference action");
    await comparisonRow.getByRole("checkbox", { name: "Medtag", exact: true }).check();
    await priceMedian.filter({ hasText: "4.000.000" }).waitFor();
    report.checks.push("Manual exclusion removes a price reference below five sales; restoring the sale restores the estimate");

    const snapshotDownloaded = page.waitForEvent("download");
    await workbench.getByRole("button", { name: "Gem snapshot", exact: true }).click();
    const snapshotFile = await snapshotDownloaded;
    const snapshot = JSON.parse(fs.readFileSync(await snapshotFile.path(), "utf8"));
    assert(snapshot.priceReference, "Private research JSON must include the reproducible price reference");
    assert(JSON.stringify(snapshot.priceReference).includes("transaction-0"), "Export must identify the underlying sales");
    assert.equal(snapshot.assessment.selectedPurchasePrice, null, "Historical price estimate must not replace the private purchase scenario");
    report.checks.push("Private export includes the price reference and selected sale identities without changing the buyer's chosen price");

    await priceReference.getByRole("button", { name: "Brug som budgetscenario", exact: true }).click();
    const scenarioPrice = page.getByLabel("Valgt købspris i scenario (tom = dagens udbud)", { exact: true });
    assert.equal(await scenarioPrice.inputValue(), "4000000", "The reference enters the budget only after the user explicitly chooses it");
    assert((await page.getByRole("tabpanel").innerText()).includes("5.000.000"), "Explicit 4m purchase scenario plus1m costs should total5m");
    assert.equal(report.apiWrites.length, 0, "Choosing the historical reference must remain an unsaved private scenario");
    await scenarioPrice.fill("");
    report.checks.push("Use as budget scenario explicitly selects4m without saving; clearing restores today's asking price");

    await workbench.getByRole("tab", { name: "Projektbudget", exact: true }).click();
    await waitText("Projektbudget", page.getByRole("tabpanel"));
    const budgetText = await page.getByRole("tabpanel").innerText();
    assert(budgetText.includes("4.000.000"), "Budget must leave DKK 4m for purchase");
    assert(budgetText.includes("5.900.000"), "Asking 4.9m plus project costs must show 5.9m total");
    report.checks.push("5m less 150k/650k/200k yields a 4m purchase cap and 5.9m asking-price project");
    await screenshot("research-budget-desktop", workbench);

    await workbench.getByRole("tab", { name: "Stand og dokumentation", exact: true }).click();
    await page.getByLabel("Dokumenteret boligareal (m²)", { exact: true }).fill("116");
    await waitText("Fravalgt", workbench);
    report.checks.push("116 m² forces rejection even when price could fit");
    await page.getByLabel("Dokumenteret boligareal (m²)", { exact: true }).fill("140");
    await waitText("Afklar pris først", workbench);
    await workbench.getByRole("tab", { name: "Mæglerdialog", exact: true }).click();
    await page.getByLabel("Prisniveau til dialog (kr.)", { exact: true }).fill("4000000");
    await page.getByRole("button", { name: "Generér / erstat udkast", exact: true }).click();
    const draft = await page.getByLabel(/^Redigerbart udkast/).inputValue();
    assert(!/4\.000\.000|5\.000\.000|200\.000|Privat testnote|godkendt finansiering|hurtig overtagelse|accepteret bud/.test(draft), "Unconsented private numbers and claims must not leak into drafts");
    assert.equal(report.apiWrites.length, 0, "Generating a draft must not send or save anything");
    report.checks.push("Draft generation reveals no private amount/notes and performs no API write");
    await workbench.getByRole("button", { name: "Gem projekt og undersøgelse", exact: true }).click();
    await waitText("Gemt privat. Beslutningen er arkiveret som en ny version.", workbench);
    assert.deepEqual(report.apiWrites.map(write => write.resource), ["research-project", "research-assessment"]);
    assert.equal(report.apiWrites[1].body.assessment.brokerDraft, draft);
    report.checks.push("Save captures only mocked private project and assessment APIs");

    await page.setViewportSize({ width: 390, height: 844 });
    await workbench.getByRole("tab", { name: "Overblik", exact: true }).click();
    await workbench.scrollIntoViewIfNeeded();
    report.mobileOverflow = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth, offenders: [...document.querySelectorAll("body *")].filter(el => el.getClientRects().length && el.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map(el => ({ tag: el.tagName, className: el.className, right: el.getBoundingClientRect().right })) }));
    await screenshot("research-mobile");
    assert(report.mobileOverflow.width <= 391, `Mobile page overflow: ${JSON.stringify(report.mobileOverflow)}`);
    report.checks.push("390px mobile viewport has no horizontal document overflow");
    await page.setViewportSize({ width: 1365, height: 900 });
    await page.emulateMedia({ media: "print" });
    assert.equal(await page.locator(".research-print").isVisible(), true);
    assert((await page.locator(".research-print").innerText()).includes("Privat fremvisningspakke"));
    assert((await page.locator(".research-print").innerText()).includes("Prisreference"), "Print pack must include the historical price reference");
    const pdf = await page.pdf({ path: path.join(outputDir, "research-print.pdf"), format: "A4", printBackground: true });
    report.printPages = (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
    await screenshot("research-print", page.locator(".research-print"));
    report.checks.push(`Private print pack renders (${report.printPages} PDF pages)`);
    assert.equal(report.pageErrors.length, 0, `Browser exceptions: ${report.pageErrors.join("; ")}`);
    assert.equal(report.unmockedApiRequests.length, 0, `Missing fixture endpoints: ${report.unmockedApiRequests.join("; ")}`);
  } catch (error) {
    report.failure = error.stack;
    await screenshot("research-failure").catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ checks: report.checks, screenshots: report.screenshots, mobileOverflow: report.mobileOverflow, printPages: report.printPages, pageErrors: report.pageErrors, unmockedApiRequests: report.unmockedApiRequests, report: path.join(outputDir, "report.json") }, null, 2));
    await browser.close();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
