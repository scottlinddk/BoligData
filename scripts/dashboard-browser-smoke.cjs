/* Local dashboard browser checks. Start Vite first, then run this file with Node.
 * All API/auth/image requests are intercepted; no real account or API is changed.
 * Overrides: SMOKE_BASE_URL, SMOKE_OUTPUT_DIR, SMOKE_THEME=light|dark,
 * SMOKE_LANGUAGE=da|en, SMOKE_ROLE=user|advisor, SMOKE_SCENARIO=populated|empty|error,
 * PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE, SMOKE_ENV_FILE.
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:5174";
assert(["127.0.0.1", "localhost"].includes(new URL(baseUrl).hostname), "Use a local development server only");
const theme = process.env.SMOKE_THEME || "light";
const language = process.env.SMOKE_LANGUAGE || "da";
const role = process.env.SMOKE_ROLE || "user";
const scenario = process.env.SMOKE_SCENARIO || "populated";
assert(["light", "dark"].includes(theme));
assert(["da", "en"].includes(language));
assert(["user", "advisor"].includes(role));
assert(["populated", "empty", "error"].includes(scenario));
const tx = (da, en) => language === "da" ? da : en;
const empty = scenario === "empty";
const outputDir = process.env.SMOKE_OUTPUT_DIR || path.join(root, `node_modules/.cache/dashboard-smoke-${scenario}-${role}-${language}-${theme}`);
fs.mkdirSync(outputDir, { recursive: true });
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || "playwright"); }
catch { playwright = require(path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright")); }

const envFile = fs.readFileSync(process.env.SMOKE_ENV_FILE || path.join(root, "apps/web/.env.production"), "utf8");
const publicUrl = envFile.match(/^VITE_SUPABASE_URL\s*=\s*["']?([^\r\n"']+)/m)?.[1]?.trim();
assert(publicUrl, "Public Supabase URL is required only to calculate the fixture's local storage key");
const authStorageKey = `sb-${new URL(publicUrl).hostname.split(".")[0]}-auth-token`;
const now = new Date().toISOString();
const daysAgo = days => new Date(Date.now() - days * 86_400_000).toISOString();
const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const userId = id(1);
const advisorId = id(2);
const testUser = { id: userId, aud: "authenticated", role: "authenticated", email: "dashboard-fixture@example.invalid", email_confirmed_at: now, app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, created_at: now };
const profile = { id: userId, role, organization_name: null, full_name: "Dashboard Fixture", created_at: now, notification_channels: {}, contact_pref: "app", best_time: "anytime" };
const exp = Math.floor(Date.now() / 1000) + 3600;
const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, aud: "authenticated", role: "authenticated", exp })).toString("base64url")}.fixture-signature`;
const session = { access_token: token, refresh_token: "local-fixture-only", token_type: "bearer", expires_in: 3600, expires_at: exp, user: testUser };
const properties = ["Bøgevej 12", "Strandvejen 48", "Skovbrynet 7", "Parkvej 22", "Havnegade 5"].map((address, index) => ({
  id: id(10 + index), address: `${address}, 9000 Aalborg`, municipality: "Aalborg", postalCode: "9000",
  price: [3_450_000, 4_850_000, 2_950_000, 4_100_000, 3_800_000][index], sqm: [146, 175, 130, 162, 141][index],
  listingDate: daysAgo(30 + index * 15).slice(0, 10), listingSource: "boligsiden", externalId: `dashboard-fixture-${index}`,
  dataMode: "real", lat: 57.04 + index * .001, lon: 9.87 + index * .001, status: "active", buildingYear: 1970 + index * 5,
  propertyType: "villa", rooms: 4 + index % 2, images: index === 4 ? [] : [{ url: `${baseUrl}/fixture/property-${index}.svg`, category: "photo", sources: [] }],
  description: "Lys bolig med plads til familien og en have tæt på byen.", agentName: "Fixture ejendomsmægler", listingUrl: null,
  agentUserId: null, isPromoted: false, promotedAt: null, promotedBy: null, idLokalid: null, matrikelnr: null,
  ejerlav: null, zone: null, bfeNummer: null, registeredAreaSqm: null, bbrData: null, riskFlags: null, createdAt: daysAgo(10 + index), updatedAt: now,
}));
let project = { name: "Vores næste hjem", totalBudget: 5_000_000, minResidentialArea: 130, minBedrooms: 3, acceptedPropertyTypes: ["villa"], primaryAreas: ["Aalborg"], secondaryAreas: [], excludedAddresses: [], excludedRoads: [], excludedAreas: [], preferences: [], tracks: ["move_in_ready", "renovation"] };
const assessments = properties.map(property => ({
  revision: 1, updatedAt: now, property: { id: property.id, address: property.address, price: property.price, sqm: property.sqm, propertyType: property.propertyType },
  assessment: { propertyId: property.id, legalBedrooms: 3, bedroomEvidence: "verified", bedroomSource: "Plantegning", residentialArea: property.sqm,
    areaEvidence: "verified", areaSource: "BBR", hardRequirements: [], budgetItems: [{ id: "costs", label: "Handel og arbejder", category: "transaction", low: 200_000, high: 300_000, vat: "included", vatRate: null, status: "assumption", source: "Local fixture", observedAt: now.slice(0, 10), necessary: true, include: true, coveredByItemId: null }],
    selectedPurchasePrice: null, questions: [{ id: "q1", text: "Kan vi se plantegningen?", resolved: false }], notes: "Privat fixture", comparables: [], documents: [], brokerDraft: "", budgetScenario: "base" },
}));
const history = { campaigns: [], episodes: [], events: [], transactions: [], observations: [], conditionEvidence: [], dataVersion: "dashboard-fixture-v1", retrievedAt: now, truncated: false };
let recommendations = ["pending", "pending", "accepted", "dismissed"].map((status, index) => ({
  id: id(30 + index), batchId: id(40), propertyId: index === 1 ? id(99) : properties[index].id, advisorId, userId,
  message: `Anbefaling ${index + 1}: Denne bolig er værd at undersøge.`, status, responseMessage: index === 2 ? "Tak, den ser interessant ud." : null,
  createdAt: daysAgo(index + 1), respondedAt: status === "pending" ? null : now,
}));
const filters = { location: "Aalborg", postnummer: "9000", propertyTypes: ["villa"], minPrice: null, maxPrice: 5_000_000, minSqm: 130, maxSqm: null, maxDaysOnMarket: null, minBuildingYear: null, maxBuildingYear: null };
let searches = ["Familieboliger i Aalborg", "Villaer med have"].map((name, index) => ({ id: id(50 + index), userId, name, filters, alertFrequency: index ? "weekly" : "daily", createdAt: daysAgo(20), lastAlertAt: index ? null : daysAgo(1) }));
let notifications = [{ id: id(60), userId, type: "new_match", searchId: searches[0].id, propertyId: properties[0].id, alertId: null, conversationId: null, title: "Nyt match", body: "Ny bolig i din søgning", linkPath: `/property/${properties[0].id}`, readAt: null, createdAt: now }];
const connections = [{ id: id(70), otherUserId: role === "advisor" ? userId : advisorId, otherUserEmail: "raadgiver.med.et.langt.navn@example.invalid", otherUserRole: role === "advisor" ? "user" : "advisor", direction: role === "advisor" ? "client" : "professional", createdAt: daysAgo(90) }];

async function main() {
  const executablePath = process.env.BROWSER_EXECUTABLE || ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"].find(file => fs.existsSync(file));
  const browser = await playwright.chromium.launch({ headless: true, executablePath, args: ["--disable-background-networking"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block", locale: language === "da" ? "da-DK" : "en-GB" });
  const report = { theme, language, role, scenario, checks: [], apiWrites: [], pageErrors: [], unmockedApiRequests: [], screenshots: [], layouts: [] };
  const delayedReads = new Set();
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await context.addInitScript(({ key, session, theme, language }) => { localStorage.setItem(key, JSON.stringify(session)); localStorage.setItem("boligdata.lang", language); localStorage.setItem("boligdata.theme", theme); }, { key: authStorageKey, session, theme, language });
  if (context.routeWebSocket) await context.routeWebSocket("**/*", socket => socket.close());
  await context.route("**/*", async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin !== new URL(baseUrl).origin) {
      if (url.pathname.includes("/rest/v1/user_profiles")) return json(route, profile);
      if (url.pathname.includes("/auth/v1/user")) return json(route, testUser);
      if (url.pathname.includes("/auth/v1/")) return json(route, session);
      return route.fulfill({ status: 204, body: "" });
    }
    if (url.pathname.startsWith("/fixture/")) {
      // Deliberately synthetic, local-only image fixture for testing image layout.
      const number = Number(url.pathname.match(/property-(\d)/)?.[1] || 0);
      return route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><rect width="800" height="500" fill="#c7dbe7"/><rect y="330" width="800" height="170" fill="#8caa76"/><path d="M0 440 800 360V500H0Z" fill="#a6bb91"/><rect x="180" y="190" width="440" height="180" fill="${["#e3c6a3", "#edf0e9", "#c9b29a", "#ddd4bd"][number]}"/><path d="m130 210 270-160 270 160Z" fill="#546471"/><rect x="347" y="245" width="80" height="125" fill="#556c79"/><g fill="#a5c8dc" stroke="#f7f4ed" stroke-width="10"><rect x="225" y="240" width="80" height="70"/><rect x="475" y="240" width="80" height="70"/></g><text x="24" y="474" font-family="sans-serif" font-size="18" fill="#344b35">LOCAL TEST FIXTURE</text></svg>` });
    }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const resource = url.searchParams.get("resource");
    const body = request.method() === "GET" ? null : request.postDataJSON();
    if (scenario === "populated" && !delayedReads.has(request.url()) && (url.pathname === "/api/favorites" || resource === "research-assessments")) { delayedReads.add(request.url()); await new Promise(resolve => setTimeout(resolve, 1200)); }
    if (request.method() !== "GET") report.apiWrites.push({ path: url.pathname, resource, id: url.searchParams.get("id"), method: request.method(), body });
    if (scenario === "error" && (url.pathname === "/api/favorites" || url.pathname === "/api/searches" || url.pathname === "/api/recommendations" || resource?.startsWith("research-"))) return json(route, { error: "Local fixture service unavailable" }, 503);
    if (resource === "research-project") { if (body) project = body.project; return json(route, { project: empty ? null : project, updatedAt: now }); }
    if (resource === "research-assessments") return json(route, { assessments: empty ? [] : assessments });
    if (resource === "research-history") return json(route, history);
    if (resource === "research-find") return json(route, { properties: empty ? [] : properties.slice(0, 1).map(({ id, address }) => ({ id, address })) });
    if (resource === "connections") return json(route, { connections: empty ? [] : connections });
    if (resource === "conversations") return json(route, { conversations: [] });
    if (url.pathname === "/api/properties") return json(route, url.searchParams.has("id") ? { property: properties.find(property => property.id === url.searchParams.get("id")), enrichment: null } : { authenticated: true, properties: empty ? [] : properties, summaries: [], total: empty ? 0 : properties.length, limit: 20, offset: 0, page: 1, totalPages: 1 });
    if (url.pathname === "/api/favorites") return json(route, { favorites: empty ? [] : properties.map((property, index) => ({ id: id(80 + index), propertyId: property.id, userId, createdAt: property.createdAt })), properties: empty ? [] : properties });
    if (url.pathname === "/api/searches") { if (body) searches = searches.map(search => search.id === url.searchParams.get("id") ? { ...search, ...body } : search); return json(route, body ? searches.find(search => search.id === url.searchParams.get("id")) : empty ? [] : searches); }
    if (url.pathname === "/api/notifications") { if (body) notifications = notifications.map(notification => notification.id === url.searchParams.get("id") ? { ...notification, readAt: now } : notification); return json(route, { notifications: empty ? [] : notifications.filter(notification => !url.searchParams.get("unreadOnly") || !notification.readAt) }); }
    if (url.pathname === "/api/recommendations") {
      if (body) recommendations = recommendations.map(recommendation => recommendation.id === url.searchParams.get("id") ? { ...recommendation, ...body, respondedAt: now } : recommendation);
      return json(route, body ? recommendations.find(recommendation => recommendation.id === url.searchParams.get("id")) : { recommendations: empty ? [] : recommendations, properties: empty ? [] : properties });
    }
    report.unmockedApiRequests.push(`${request.method()} ${url.pathname}?${url.searchParams}`);
    return json(route, { error: "Unmocked dashboard fixture endpoint" }, 501);
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on("pageerror", error => report.pageErrors.push(error.message));
  const main = page.locator("main");
  const snapshot = async name => { const target = path.join(outputDir, `${name}.png`); await page.locator('[role="status"].fixed').waitFor({ state: "hidden", timeout: 5000 }); await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" })); await page.screenshot({ path: target, fullPage: true, animations: "disabled" }); report.screenshots.push(target); };
  const dismissAlerts = async () => { const close = page.locator('[role="status"]').getByRole("button", { name: tx("Annuller", "Cancel"), exact: true }); while (await close.count()) await close.first().click(); };
  const go = async route => {
    await page.goto(`${baseUrl}${route}`); await main.getByRole("heading", { level: 1 }).waitFor();
    if (scenario === "populated" && page.viewportSize().width === 1440 && ["/dashboard", "/research"].includes(route)) {
      await main.getByRole("status").filter({ hasText: /Henter|Loading|Indlæser/ }).first().waitFor();
      await snapshot(`${route.slice(1)}-loading`);
      report.checks.push(`${route} announces loading while fixture data is pending`);
    }
    if (scenario === "error") await main.getByText(/could not|kunne ikke|unavailable/i).first().waitFor();
    await page.waitForLoadState("networkidle"); await dismissAlerts();
  };
  const checkLayout = async label => {
    const layout = await page.evaluate(() => {
      const textOverflow = [];
      const walker = document.createTreeWalker(document.querySelector("main"), NodeFilter.SHOW_TEXT);
      let node;
      while (node = walker.nextNode()) {
        if (!node.textContent.trim() || !node.parentElement?.getClientRects().length || node.parentElement.closest(".sr-only, select, option")) continue;
        const range = document.createRange(); range.selectNodeContents(node);
        for (const rect of range.getClientRects()) if (rect.right > innerWidth + 1 && rect.width) textOverflow.push({ text: node.textContent.slice(0, 100), right: rect.right });
      }
      return { viewport: innerWidth, width: document.documentElement.scrollWidth, textOverflow: textOverflow.slice(0, 5), offenders: [...document.querySelectorAll("main *")].filter(element => element.getClientRects().length && element.getBoundingClientRect().right > innerWidth + 1).slice(0, 5).map(element => ({ tag: element.tagName, className: element.className, right: element.getBoundingClientRect().right })) };
    });
    report.layouts.push({ label, ...layout }); assert(layout.width <= layout.viewport + 1, `${label} horizontal overflow: ${JSON.stringify(layout)}`);
    assert.equal(layout.textOverflow.length, 0, `${label} text exceeds viewport: ${JSON.stringify(layout.textOverflow)}`);
  };
  try {
    await go("/dashboard");
    if (scenario === "populated") await overviewChecks(main, page, report, tx, properties, searches);
    await snapshot("overview-desktop");
    await checkLayout("overview-desktop");
    await go("/recommendations");
    if (scenario === "populated") await recommendationChecks(main, page, report, tx, role, id);
    await snapshot("recommendations-desktop");
    await checkLayout("recommendations-desktop");
    await go("/research");
    if (scenario === "populated") await researchChecks(main, page, report, tx, properties);
    await snapshot("research-desktop");
    await checkLayout("research-desktop");
    for (const width of scenario === "populated" ? [768, 390, 320] : [320]) {
      await page.setViewportSize({ width, height: 844 });
      for (const [route, name] of [["/dashboard", "overview"], ["/recommendations", "recommendations"], ["/research", "research"]]) {
        await go(route);
        if (width === 320 && scenario === "populated") {
          const filtersToggle = main.getByRole("button", { name: tx("Visninger og filtre", "Views and filters"), exact: false });
          await filtersToggle.click(); assert.equal(await filtersToggle.getAttribute("aria-expanded"), "true");
          await checkLayout(`${name}-${width}-filters`);
          await filtersToggle.click();
          const preview = main.locator('button[aria-controls="workspace-detail"]').first();
          await preview.click();
          assert.equal(await main.locator("#workspace-detail").evaluate(element => document.activeElement === element), true, "Compact preview must move keyboard focus to the detail panel");
        }
        await checkLayout(`${name}-${width}`); await snapshot(`${name}-${width}`);
      }
    }
    assert.equal(await page.locator("html").evaluate(element => element.classList.contains("dark")), theme === "dark");
    assert.equal(report.pageErrors.length, 0, `Browser errors: ${report.pageErrors.join("; ")}`);
    assert.equal(report.unmockedApiRequests.length, 0, `Unmocked API calls: ${report.unmockedApiRequests.join("; ")}`);
    if (scenario !== "populated") { assert.equal(report.apiWrites.length, 0); report.checks.push(`${scenario} states remain visible without API mutations`); }
    report.checks.push("All three routes render at every tested viewport without horizontal document/text overflow or browser exceptions");
  } catch (error) {
    report.failure = error.stack;
    await snapshot("failure").catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ checks: report.checks, screenshots: report.screenshots, layouts: report.layouts, report: path.join(outputDir, "report.json") }, null, 2));
    await browser.close();
  }
}

async function overviewChecks(main, page, report, tx, properties, searches) {
  const search = main.getByLabel(tx("Søg i gemte boliger", "Search saved properties"), { exact: true });
  await search.waitFor();
  await search.fill("Strandvejen");
  await main.getByRole("heading", { name: properties[1].address, exact: true }).first().waitFor();
  await search.fill("IngenFixtureAdresse");
  await main.getByText(tx("Ingen boliger matcher", "No matching properties"), { exact: true }).waitFor();
  await search.fill("");
  const sort = main.getByLabel(tx("Sortér boliger", "Sort properties"), { exact: true });
  await sort.selectOption("price-asc");
  const cards = main.locator(".workspace-property-card");
  assert.equal(await cards.count(), 5);
  assert((await cards.first().innerText()).includes("Skovbrynet"), "Lowest priced property must be first");
  await sort.selectOption("price-desc");
  assert((await cards.first().innerText()).includes("Strandvejen"), "Highest priced property must be first");
  const preview = main.getByRole("button", { name: `${tx("Vis detaljer for", "View details for")} ${properties[3].address}`, exact: true });
  await preview.click();
  assert.equal(await preview.getAttribute("aria-pressed"), "true");
  await main.locator("#workspace-detail").getByRole("heading", { name: properties[3].address, exact: true }).waitFor();
  await main.getByRole("button", { name: tx("Gemte søgninger", "Saved searches"), exact: false }).first().click();
  const alertSelect = main.getByLabel(tx(`Beskedfrekvens for ${searches[0].name}`, `Alert frequency for ${searches[0].name}`), { exact: true });
  await Promise.all([
    page.waitForResponse(response => response.url().includes("/api/searches?") && response.request().method() === "PATCH"),
    alertSelect.selectOption("weekly"),
  ]);
  assert(report.apiWrites.some(write => write.path === "/api/searches" && write.body?.alertFrequency === "weekly"), "Alert-frequency update must reach the mocked endpoint");
  await main.getByRole("button", { name: tx("Gemte boliger", "Saved properties"), exact: false }).first().click();
  report.checks.push("Overview filters saved properties, handles no matches, sorts price both ways, previews a selection and updates a saved search alert");
}

async function recommendationChecks(main, page, report, tx, role, id) {
  const first = main.getByTestId(`recommendation-card-${id(30)}`);
  await first.waitFor();
  const search = main.getByLabel(tx("Søg i anbefalinger", "Search recommendations"), { exact: true });
  await search.fill("Bøgevej");
  await first.waitFor();
  assert.equal(await main.locator('[data-testid^="recommendation-card-"]').count(), 1);
  await search.fill("");
  await main.getByRole("button", { name: tx("Accepteret", "Accepted"), exact: false }).first().click();
  await main.getByTestId(`recommendation-card-${id(32)}`).waitFor();
  assert.equal(await main.locator('[data-testid^="recommendation-card-"]').count(), 1);
  await main.getByRole("button", { name: tx("Alle anbefalinger", "All recommendations"), exact: false }).first().click();
  if (role === "advisor") {
    await main.getByTestId(`recommendation-card-${id(32)}`).locator('button[aria-controls="workspace-detail"]').click();
    await main.getByText("Tak, den ser interessant ud.", { exact: false }).waitFor();
    assert.equal(await main.locator('[data-testid^="recommendation-reply-"]').count(), 0);
    assert.equal(report.apiWrites.filter(write => write.path === "/api/recommendations").length, 0);
    report.checks.push("Advisor sees sent recommendations and client response without buyer response controls");
    return;
  }
  await first.locator('button[aria-controls="workspace-detail"]').click();
  const firstDetail = main.getByTestId(`recommendation-detail-${id(30)}`);
  await main.getByTestId(`recommendation-reply-${id(30)}`).fill("Tak, vi vil gerne se boligen.");
  await firstDetail.getByRole("button", { name: tx("Accepter", "Accept"), exact: true }).click();
  await main.getByText("Tak, vi vil gerne se boligen.", { exact: false }).waitFor();
  assert(report.apiWrites.some(write => write.path === "/api/recommendations" && write.id === id(30) && write.body?.status === "accepted" && write.body.responseMessage === "Tak, vi vil gerne se boligen."));
  const missing = main.getByTestId(`recommendation-card-${id(31)}`);
  await missing.getByRole("button", { name: tx("Se anbefaling", "View recommendation"), exact: true }).click();
  const missingDetail = main.getByTestId(`recommendation-detail-${id(31)}`);
  await main.getByTestId(`recommendation-reply-${id(31)}`).fill("Den passer ikke til projektet.");
  await missingDetail.getByRole("button", { name: tx("Afvis", "Dismiss"), exact: true }).click();
  await main.getByText("Den passer ikke til projektet.", { exact: false }).waitFor();
  assert(report.apiWrites.some(write => write.path === "/api/recommendations" && write.id === id(31) && write.body?.status === "dismissed"));
  report.checks.push("Recommendations filter by address/status, preserve replies, accept a listing and dismiss an unavailable listing");
}

async function researchChecks(main, page, report, tx, properties) {
  const search = main.getByLabel(tx("Søg i kandidater", "Search candidates"), { exact: true });
  await search.fill("Strandvejen");
  assert.equal(await main.locator(".workspace-property-card").count(), 1);
  await search.fill("IngenFixtureAdresse");
  await main.getByText(tx("Ingen kandidater matcher", "No matching candidates"), { exact: true }).waitFor();
  await search.fill("");
  const compare = main.getByRole("button", { name: tx("Sammenlign valgte", "Compare selected"), exact: true });
  assert.equal(await compare.isDisabled(), true);
  for (const property of properties.slice(0, 4)) await main.getByRole("checkbox", { name: `${tx("Sammenlign", "Compare")} ${property.address}`, exact: true }).check();
  assert.equal(await main.getByRole("checkbox", { name: `${tx("Sammenlign", "Compare")} ${properties[4].address}`, exact: true }).isDisabled(), true, "Comparison must cap selections at four");
  await compare.click();
  assert.equal(await main.getByRole("table").getByRole("row").count(), 5, "Comparison must retain all four selected property rows plus headings");
  await main.getByRole("button", { name: tx("Vis boligkort", "Show property cards"), exact: true }).click();
  await main.getByRole("button", { name: tx("Ryd valg", "Clear selection"), exact: true }).click();
  assert.equal(await compare.isDisabled(), true);
  const address = main.getByLabel(tx("Find adresse eller annoncelink", "Find address or listing link"), { exact: true });
  await address.fill("Bøgevej");
  await main.getByRole("button", { name: tx("Undersøg bolig", "Research property"), exact: true }).click();
  await main.getByRole("link", { name: properties[0].address, exact: true }).waitFor();
  report.checks.push("Buying project filters candidates, caps comparison at four, renders the comparison and looks up a stored address");
  await main.getByRole("button", { name: tx("Projektprofil", "Project profile"), exact: false }).first().click();
  const projectName = main.getByLabel(tx("Projektnavn", "Project name"), { exact: true });
  await projectName.fill("Opdateret lokalt testprojekt");
  await main.getByRole("button", { name: tx("Gem privat profil", "Save private profile"), exact: true }).click();
  await main.getByText(tx("Profil gemt. Kandidater genberegnes med de nye krav.", "Profile saved. Candidates are recalculated with the new requirements."), { exact: true }).waitFor();
  assert(report.apiWrites.some(write => write.resource === "research-project" && write.body?.project.name === "Opdateret lokalt testprojekt"));
  await main.getByRole("button", { name: tx("Statistik", "Statistics"), exact: false }).first().click();
  await main.getByRole("button", { name: "Import", exact: false }).first().click();
  await main.getByRole("button", { name: tx("Kandidater", "Candidates"), exact: false }).first().click();
  report.checks.push("Buying project retains private profile saving and access to candidates, statistics and import");
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
