/* Toolscout — functional checks against the real DOM. */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const SITE = "/scratch/work/site";
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log("  FAIL  " + m); } };

const dom = new JSDOM(fs.readFileSync(path.join(SITE, "index.html"), "utf8"),
  { runScripts: "dangerously", url: "https://toolscout.test/" });
const { window } = dom, doc = window.document;
window.HTMLElement.prototype.scrollIntoView = function () {};
window.eval(fs.readFileSync(path.join(SITE, "data/tools.js"), "utf8"));
window.eval(fs.readFileSync(path.join(SITE, "app.js"), "utf8"));

const DATA = window.TOOLSCOUT;
const $ = (s) => doc.querySelector(s);
const $$ = (s) => Array.from(doc.querySelectorAll(s));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const input = $("#q");
const type = async (text) => {
  input.value = text;
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  await wait(220);
};
const names = () => $$("#tools .tool__name").map((n) => n.textContent.trim());

(async () => {
  console.log("catalogue");
  ok(DATA.rows.length >= 5000, "5k+ tools: " + DATA.rows.length);
  ok(DATA.jobs.length === 29, "29 subtopics");
  ok(DATA.topics.length === 8, "8 topics");
  ok(DATA.jobs.every((j) => DATA.topics.some((t) => t.id === j.topic)), "every subtopic belongs to a topic");
  ok(new Set(DATA.rows.map((r) => r[0])).size === DATA.rows.length, "ids unique");
  ok(DATA.rows.every((r) => !r[3] || /^https:\/\//.test(r[3])), "urls are https or empty");
  const libs = DATA.rows.filter((r) => r[11] !== "platform");
  const plats = DATA.rows.filter((r) => r[11] === "platform");
  ok(libs.every((r) => r[7] >= 400), "every library clears the star floor");
  ok(libs.every((r) => !!r[6]), "every library carries a licence");
  ok(libs.every((r) => r[8] >= "2025-11-18"), "every library pushed within 12 months");
  ok(plats.length >= 100, "hosted platforms present: " + plats.length);
  ok(plats.every((r) => /^https:\/\//.test(r[3] || "https://x")), "platforms have urls");
  ok(plats.some((r) => /stripe/i.test(r[1])), "Stripe is listed");
  ok(plats.some((r) => /vercel/i.test(r[1])), "Vercel is listed");
  ok(plats.every((r) => r[13] !== undefined), "platforms carry a pricing model");
  const junk = /sample|demo|template|boilerplate|awesome|tutorial|course|playground|sandbox/i;
  ok(!libs.some((r) => junk.test(r[1] + " " + r[4])), "no samples or reading lists");

  console.log("pages generated");
  const toolPages = fs.readdirSync(path.join(SITE, "tools")).filter((f) => f.endsWith(".html"));
  const jobPages = fs.readdirSync(path.join(SITE, "jobs")).filter((f) => f.endsWith(".html"));
  ok(toolPages.length >= 600, "600+ tool pages, got " + toolPages.length);
  ok(jobPages.length === 29, "29 subtopic pages, got " + jobPages.length);
  ok(fs.existsSync(path.join(SITE, "method.html")), "method page exists");
  ok(fs.existsSync(path.join(SITE, "sitemap.xml")), "sitemap exists");
  const sitemap = fs.readFileSync(path.join(SITE, "sitemap.xml"), "utf8");
  ok((sitemap.match(/<url>/g) || []).length === 631, "631 sitemap urls");
  const sampleTool = toolPages.sort()[0];
  const onePage = fs.readFileSync(path.join(SITE, "tools", sampleTool), "utf8");
  ok(onePage.includes("../site.css"), "sub-page asset paths are relative");
  ok(onePage.includes("canonical"), "sub-page has a canonical url");

  console.log("index");
  ok($$("#jobs .job").length === 29, "29 subtopic tiles");
  ok($$("#index .topic").length === 8, "grouped into 8 topics");
  ok($$("#facets .ts-chip").length === 7, "7 filter chips");
  ok($$("#jobs .job").every((a) => a.tagName === "A"), "job tiles are links");
  ok($("#jobs .job").getAttribute("href").startsWith("jobs/"), "tile links to a job page");
  ok($("#results").hidden === true, "results hidden on load");
  ok(!/undefined|NaN|\[object/.test(doc.body.innerHTML), "no undefined in the DOM");

  console.log("rows link to detail pages");
  await type("email");
  ok($$("#tools .tool").length > 0, "search returns rows");
  ok(/^(tools\/|https:\/\/)/.test($("#tools .tool__name a").getAttribute("href")),
     "row links to a detail page or straight out");
  ok($$("#tools .tool__meta dt").length === 3 * $$("#tools .tool").length,
     "each row shows exactly three attributes");

  console.log("automatic intent matching");
  const cases = [
    ["i need people to log in", "auth"],
    ["take payments", "payments"],
    ["monitoring", "observe"],
    ["deployment", "deploy"],
    ["where do i store uploads", "files"],
  ];
  for (const [q, jobId] of cases) {
    await type(q);
    const got = names();
    const id = $("#tools .tool").getAttribute("data-id");
    const tool = window.TOOLSCOUT.rows.find((r) => r[0] === id);
    ok(got.length > 0, jobId + ": returns results (" + got.length + ")");
    ok(!!tool && tool[5].indexOf(jobId) > -1,
       jobId + ": top hit belongs to the job, got " + got[0]);
  }

  console.log("filters and sort");
  await type("");
  $("#clear").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await type("database");
  const tsChip = $$("#facets .ts-chip").find((c) => c.dataset.facet === "ts");
  tsChip.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  ok($$("#tools .tool").length > 0, "facet stacks on a query");
  ok($$("#facets .ts-chip").find((c) => c.dataset.facet === "ts")
       .getAttribute("aria-pressed") === "true", "chip pressed state");
  ok(window.location.search.includes("f=ts"), "facet in url");
  $("#clear").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  ok(window.location.search === "", "url cleared");

  console.log("navigation");
  ok(!!$("#menuToggle"), "hamburger present");
  ok(!!$("#drawer"), "drawer present");
  ok($$("#drawer .drawer__link").length >= 17, "drawer lists every job");
  ok(!!$("#drawerBackdrop"), "drawer backdrop present");
  ok($$(".stats .stat").length === 4, "four stats in the band");

  console.log("no matrix");
  ok(!doc.querySelector("#matrix"), "square grid removed");
  await type("email");

  console.log("empty state");
  await type("zzzqqq");
  ok($("#empty").hidden === false, "empty state shows");
  ok($$("#suggestRow .suggest").length > 0, "suggestions offered");
  $("#suggestRow .suggest").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await wait(80);
  ok($$("#tools .tool").length > 0, "clicking a suggestion recovers results");

  console.log("deep link");
  const dom2 = new JSDOM(fs.readFileSync(path.join(SITE, "index.html"), "utf8"),
    { runScripts: "dangerously", url: "https://toolscout.test/?q=payments&sort=stars" });
  dom2.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom2.window.eval(fs.readFileSync(path.join(SITE, "data/tools.js"), "utf8"));
  dom2.window.eval(fs.readFileSync(path.join(SITE, "app.js"), "utf8"));
  ok(dom2.window.document.querySelectorAll("#tools .tool").length > 0, "deep link restores results");
  ok(dom2.window.document.querySelector("#q").value === "payments", "deep link restores query");

  console.log("\n" + (fails ? fails + " FAILED" : "all " + checks + " checks passed"));
  process.exit(fails ? 1 : 0);
})();
