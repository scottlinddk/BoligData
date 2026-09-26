/* Run against a local Vite server: node scripts/research-browser-smoke.cjs
 * Every API, Supabase, map and external request is mocked or blocked. No production login or write occurs.
 * PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE, SMOKE_BASE_URL and SMOKE_OUTPUT_DIR can override local defaults.
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:5174";
assert(["127.0.0.1", "localhost"].includes(new URL(baseUrl).hostname), "Only a local development server is allowed");
const outputDir = process.env.SMOKE_OUTPUT_DIR || path.join(root, "node_modules/.cache/research-smoke");
fs.mkdirSync(outputDir, { recursive: true });
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || "playwright"); }
catch { playwright = require(path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright")); }

const envFile = fs.readFileSync(path.join(root, "apps/web/.env.production"), "utf8");
const publicUrl = envFile.match(/^VITE_SUPABASE_URL\s*=\s*["']?([^\r\n"']+)/m)?.[1]?.trim();
assert(publicUrl, "The local frontend needs its public Supabase URL to determine the test storage key");
const authStorageKey = `sb-${new URL(publicUrl).hostname.split(".")[0]}-auth-token`;
const now = new Date().toISOString();
const userId = "00000000-0000-4000-8000-000000000001";
const propertyId = "00000000-0000-4000-8000-000000000002";
const testUser = { id: userId, aud: "authenticated", role: "authenticated", email: "fixture@example.invalid", email_confirmed_at: now, app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, created_at: now };
const profile = { id: userId, role: "user", organization_name: null, full_name: "Browser Fixture", created_at: now, notification_channels: {}, contact_pref: "app", best_time: "anytime" };
const exp = Math.floor(Date.now() / 1000) + 3600;
const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, aud: "authenticated", role: "authenticated", exp })).toString("base64url")}.fixture-signature`;
const session = { access_token: token, refresh_token: "local-test-only", token_type: "bearer", expires_in: 3600, expires_at: exp, user: testUser };
const property = {
  id: propertyId, address: "Testvej 1, 9000 Aalborg", municipality: "Aalborg", postalCode: "9000", price: 4_900_000, sqm: 140,
  listingDate: "2026-01-01", listingSource: "boligsiden", externalId: "fixture-case", dataMode: "real", lat: 57.04, lon: 9.87,
  status: "active", buildingYear: 1970, propertyType: "villa", rooms: 4, images: [], description: "Kræver totalrenovering. Dødsbo.",
  agentName: "Fixture agent", listingUrl: null, agentUserId: null, isPromoted: false, promotedAt: null, promotedBy: null,
  idLokalid: null, matrikelnr: null, ejerlav: null, zone: null, bfeNummer: null, registeredAreaSqm: null, bbrData: null, riskFlags: null,
  createdAt: "2026-01-01T12:00:00Z", updatedAt: now,
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
  id: `transaction-${i}`, transactionIdentity: `verified-transaction-${i}`, propertyId, unitId: null, address: `Referencevej ${i + 1}, Aalborg`,
  municipality: "Aalborg", postalCode: "9000", propertyType: "villa", saleType: "normal", saleDate: "2025-05-01", observedAt: "2026-09-20T12:00:00Z",
  firstAsking: 4_600_000 + i * 100_000, lastAsking: 4_300_000 + i * 100_000, soldPrice: 4_000_000 + i * 100_000, residentialArea: 140 + i,
  areaDefinition: "residential", areaAtSale: true, areaEvidence: "verified", activeDays: 200 + i, latestEpisodeDays: 91 + i,
  calendarDays: 240 + i, condition: null, dataMode: "live", status: "sold", source: "Browser fixture", datePrecision: "day", saleDateEnd: null, sourceUrl: null,
  lat: 57.04 + i * 0.001, lon: 9.87 + i * 0.001,
}));
const history = { campaigns: [], episodes: [], events: [], transactions, observations: [], conditionEvidence: [], dataVersion: "browser-fixture-v1", retrievedAt: now, truncated: false };
const lookup = {
  address: property.address, resolved: { idLokalid: null, matrikelnr: null, ejerlav: null, ejerlavskode: null, bfeNummer: null, zone: null, formattedAddress: property.address, postalCode: "9000", lat: 57.04, lon: 9.87 },
  bbrData: null, publicValuation: null, priceHistory: [], nearbySales: [], renovationCategory: { category: "D", isEstimate: true, symbol: "~", reason: "Unknown", source: "ai" }, screening: [],
  scoringInputs: { locationMatch: null, conditionProxy: null, priceHeadroomDkk: null, areaMarginSqm: null, schoolDistrictScore: null, noiseZoneEstimate: null, legalRiskProxy: null, source: "ai" },
  sources: ["address", "bbr", "publicValuation", "noise", "sales"].map(key => ({ key, register: key, mode: "unavailable", error: "Local browser fixture" })), dataMode: "unavailable", source: "ai",
};

async function main() {
  const browserPath = process.env.BROWSER_EXECUTABLE || ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"].find(p => fs.existsSync(p));
  const browser = await playwright.chromium.launch({ headless: true, executablePath: browserPath, args: ["--disable-background-networking"] });
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, serviceWorkers: "block", locale: "da-DK" });
  const report = { checks: [], apiWrites: [], mockedExternalRequests: 0, unmockedApiRequests: [], pageErrors: [], screenshots: [] };
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await context.addInitScript(({ key, value }) => { localStorage.setItem(key, JSON.stringify(value)); localStorage.setItem("boligdata.lang", "da"); }, { key: authStorageKey, value: session });
  if (context.routeWebSocket) await context.routeWebSocket("**/*", socket => socket.close());
  await context.route("**/*", async route => {
    const request = route.request(); const url = new URL(request.url());
    // This branch handles every non-local request without sending it to its origin.
    if (url.origin !== new URL(baseUrl).origin) {
      report.mockedExternalRequests++;
      if (url.pathname.includes("/rest/v1/user_profiles")) return json(route, profile);
      if (url.pathname.includes("/auth/v1/user")) return json(route, testUser);
      if (url.pathname.includes("/auth/v1/")) return json(route, session);
      if (url.hostname === "tiles.openfreemap.org") return json(route, { version: 8, sources: {}, layers: [{ id: "fixture-background", type: "background", paint: { "background-color": "#e4ebe4" } }] });
      return route.fulfill({ status: 204, body: "" });
    }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const resource = url.searchParams.get("resource");
    if (request.method() !== "GET") report.apiWrites.push({ path: url.pathname, resource, method: request.method(), body: request.postDataJSON() });
    if (url.pathname === "/api/account" && resource === "research-project") {
      if (request.method() === "PUT") project = request.postDataJSON().project;
      return json(route, { project, updatedAt: now });
    }
    if (url.pathname === "/api/account" && resource === "research-assessment") {
      if (request.method() === "PUT") assessment = request.postDataJSON().assessment;
      return json(route, { assessment, revision: 1, updatedAt: now, revisions: [] });
    }
    if (resource === "research-assessments") return json(route, { assessments: [{ assessment, revision: 1, updatedAt: now, property }] });
    if (resource === "research-history") return json(route, history);
    if (resource === "connections") return json(route, { connections: [] });
    if (resource === "conversations") return json(route, { conversations: [] });
    if (url.pathname === "/api/properties") {
      if (url.searchParams.get("comparables")) return json(route, { comparables: [], neighborhoodAvgPricePerSqm: null });
      if (url.searchParams.get("id")) return json(route, { property, enrichment: null });
      return json(route, { authenticated: true, properties: [property], summaries: [], total: 1, limit: 8, offset: 0, page: 1, totalPages: 1 });
    }
    if (url.pathname === "/api/property-lookup") return json(route, lookup);
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
  const screenshot = async (name, locator) => { const target = path.join(outputDir, `${name}.png`); await (locator ?? page).screenshot({ path: target, ...(locator ? {} : { fullPage: true }) }); report.screenshots.push(target); };
  const waitText = async (text, scope = page) => scope.getByText(text, { exact: true }).first().waitFor();
  try {
    await page.goto(`${baseUrl}/research`); await waitText("Mit boligprojekt");
    await page.getByRole("button", { name: "Projektprofil", exact: true }).click();
    assert.equal(await page.getByLabel("Samlet projektloft (kr.)", { exact: true }).inputValue(), "5000000");
    report.checks.push("Private project profile loads");
    await screenshot("research-project-desktop");
    await page.getByRole("button", { name: "Statistik", exact: true }).click();
    await waitText("Handler bag prisreferencen");
    assert((await page.getByRole("table").first().textContent()).includes("Referencevej 1"));
    report.checks.push("Historical statistics render fixture transactions");
    await screenshot("research-statistics-desktop");

    await page.goto(`${baseUrl}/property/${propertyId}`);
    const workbench = page.locator("#research");
    await waitText("Afklar pris først", workbench);
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
