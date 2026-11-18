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
  ok(DATA.tools.length === 117, "117 tools");
  ok(DATA.jobs.length === 17, "17 jobs");
  ok(new Set(DATA.tools.map((t) => t.id)).size === 117, "ids unique");
  ok(DATA.tools.every((t) => /^https:\/\//.test(t.url)), "urls are https");

  console.log("pages generated");
  const toolPages = fs.readdirSync(path.join(SITE, "tools")).filter((f) => f.endsWith(".html"));
  const jobPages = fs.readdirSync(path.join(SITE, "jobs")).filter((f) => f.endsWith(".html"));
  ok(toolPages.length === 117, "117 tool pages, got " + toolPages.length);
  ok(jobPages.length === 17, "17 job pages, got " + jobPages.length);
  ok(fs.existsSync(path.join(SITE, "method.html")), "method page exists");
  ok(fs.existsSync(path.join(SITE, "sitemap.xml")), "sitemap exists");
  const sitemap = fs.readFileSync(path.join(SITE, "sitemap.xml"), "utf8");
  ok((sitemap.match(/<url>/g) || []).length === 136, "136 sitemap urls");
  const onePage = fs.readFileSync(path.join(SITE, "tools/react.html"), "utf8");
  ok(onePage.includes("../site.css"), "sub-page asset paths are relative");
  ok(onePage.includes("canonical"), "sub-page has a canonical url");

  console.log("index");
  ok($$("#jobs .job").length === 17, "17 job tiles");
  ok($$("#facets .ts-chip").length === 8, "8 filter chips");
  ok($$("#jobs .job").every((a) => a.tagName === "A"), "job tiles are links");
  ok($("#jobs .job").getAttribute("href").startsWith("jobs/"), "tile links to a job page");
  ok($("#results").hidden === true, "results hidden on load");
  ok(!/undefined|NaN|\[object/.test(doc.body.innerHTML), "no undefined in the DOM");

  console.log("rows link to detail pages");
  await type("email");
  ok($$("#tools .tool").length > 0, "search returns rows");
  ok($("#tools .tool__name a").getAttribute("href").startsWith("tools/"), "row links to a tool page");
  ok($$("#tools .tool__meta dt").length === 3 * $$("#tools .tool").length,
     "each row shows exactly three attributes");

  console.log("automatic intent matching");
  const cases = [
    ["i need people to log in", /Clerk|Keycloak|Kratos|Hanko|Better Auth|Auth\.js/i, "login -> auth"],
    ["take payments", /Stripe|Razorpay|Paddle|Polar|Hyperswitch|Lemon/i, "payments"],
    ["monitoring", /Grafana|Prometheus|Sentry|SigNoz|Netdata|Uptime/i, "monitoring"],
    ["deployment", /Docker|Caddy|Kamal|Coolify|Dokku|Fly\.io|Railway|Render|Vercel/i, "deployment"],
    ["where do i store uploads", /MinIO|Uppy|UploadThing|Cloudflare R2|tusd/i, "file storage"],
  ];
  for (const [q, re, label] of cases) {
    await type(q);
    const got = names();
    ok(got.length > 0, label + ": returns results (" + got.length + ")");
    ok(got.some((n) => re.test(n)), label + ": " + got.slice(0, 3).join(", "));
    ok(re.test(got[0]), label + ": intent tool ranks first, got " + got[0]);
  }

  console.log("filters and sort");
  await type("");
  $("#clear").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const oss = $$("#facets .ts-chip").find((c) => c.dataset.facet === "oss");
  oss.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  ok($$("#tools .tool").length > 0, "facet alone shows results");
  ok($$("#facets .ts-chip").find((c) => c.dataset.facet === "oss")
       .getAttribute("aria-pressed") === "true", "chip pressed state");
  ok(window.location.search.includes("f=oss"), "facet in url");
  $("#clear").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  ok(window.location.search === "", "url cleared");

  console.log("matrix");
  ok($$("#matrix span").length === 117, "117 squares");
  await type("email");
  ok($$("#matrix span.is-match").length > 0, "matches highlighted");
  ok($$("#matrix span.is-dim").length > 0, "others dim");
  ok(/match/.test($("#matrixCaption").textContent), "caption reports the count");

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
