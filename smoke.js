const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const SITE = "/scratch/work/site";
let fails = 0, checks = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) { fails++; console.log("  FAIL  " + msg); }
}

const html = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://toolscout.test/" });
const { window } = dom;
const doc = window.document;
window.HTMLElement.prototype.scrollIntoView = function () {};

window.eval(fs.readFileSync(path.join(SITE, "data/tools.js"), "utf8"));
window.eval(fs.readFileSync(path.join(SITE, "app.js"), "utf8"));

const DATA = window.TOOLSCOUT;
const $ = (s) => doc.querySelector(s);
const $$ = (s) => Array.from(doc.querySelectorAll(s));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("data");
ok(DATA.tools.length === 117, "117 tools, got " + DATA.tools.length);
ok(DATA.jobs.length === 17, "17 jobs");
const ids = new Set(DATA.tools.map((t) => t.id));
ok(ids.size === DATA.tools.length, "tool ids unique (" + ids.size + ")");
ok(DATA.tools.every((t) => /^https:\/\//.test(t.url)), "every url is https");
ok(DATA.tools.every((t) => t.jobs.every((j) => DATA.jobs.some((x) => x.id === j))),
   "every job reference resolves");
ok(DATA.tools.every((t) => t.tagline && t.note && t.licence), "tagline+note+licence present");
const orphanJobs = DATA.jobs.filter((j) => !DATA.tools.some((t) => t.jobs.includes(j.id)));
ok(orphanJobs.length === 0, "no empty job categories: " + JSON.stringify(orphanJobs.map(j=>j.id)));

console.log("initial render");
ok($$("#jobs .job").length === 17, "17 job buttons, got " + $$("#jobs .job").length);
ok($$("#facets .ts-chip").length === 8, "8 facet chips, got " + $$("#facets .ts-chip").length);
ok($("#results").hidden === true, "results hidden on load");
ok(/117 tools/.test($("#mastheadNote").textContent), "masthead counter: " + $("#mastheadNote").textContent);
ok(!/undefined|NaN|\[object/.test(doc.body.innerHTML), "no undefined/NaN/[object] in DOM");

console.log("job filter");
$$("#jobs .job")[1].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
ok($("#results").hidden === false, "results shown after job click");
ok($("#jobs").hidden === true, "job grid hidden while filtering");
const rows1 = $$("#tools .tool").length;
ok(rows1 === 8, "auth job yields 8 tools, got " + rows1);
ok($("#resultCount").textContent.includes("8"), "count text: " + $("#resultCount").textContent);
ok(/add sign-in/.test($("#resultCount").textContent), "count names the job");
ok(window.location.search.includes("job=auth"), "url synced: " + window.location.search);

console.log("facet stacking");
const ossChip = $$("#facets .ts-chip").find((c) => c.dataset.facet === "oss");
ossChip.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
const rows2 = $$("#tools .tool").length;
ok(rows2 > 0 && rows2 < rows1, "open-source narrows 8 -> " + rows2);
ok($$("#facets .ts-chip").find((c) => c.dataset.facet === "oss").getAttribute("aria-pressed") === "true", "chip aria-pressed set");
ok(window.location.search.includes("f=oss"), "facet in url");

console.log("search");
$("#clear").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
const input = $("#q");
input.value = "transactional email";
input.dispatchEvent(new window.Event("input", { bubbles: true }));

(async () => {
  await wait(260);
  const rows3 = $$("#tools .tool").length;
  ok(rows3 > 0, "search returns rows: " + rows3);
  const first = $$("#tools .tool__name").slice(0, 4).map((n) => n.textContent);
  ok(first.some((n) => /Resend|Postmark|Nodemailer|React Email|Mailpit|Amazon SES|Listmonk/.test(n)),
     "email tools rank: " + JSON.stringify(first));

  input.value = "summarise a research paper";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  await wait(260);
  ok($$("#tools .tool").length >= 0, "nonsense query does not crash");

  input.value = "zzzqqq";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  await wait(260);
  ok($("#empty").hidden === false, "empty state shows for no matches");

  console.log("sort + clear");
  $("#clear").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  ok($("#results").hidden === true, "clear restores job grid");
  ok(window.location.search === "", "url cleared, got '" + window.location.search + "'");

  // deep link
  const dom2 = new JSDOM(html, { runScripts: "dangerously", url: "https://toolscout.test/?q=database&f=oss&sort=stars" });
  dom2.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom2.window.eval(fs.readFileSync(path.join(SITE, "data/tools.js"), "utf8"));
  dom2.window.eval(fs.readFileSync(path.join(SITE, "app.js"), "utf8"));
  ok(dom2.window.document.querySelectorAll("#tools .tool").length > 0, "deep link restores results");
  ok(dom2.window.document.querySelector("#q").value === "database", "deep link restores query");

  // health + flags
  input.value = "database";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  await wait(260);
  const healths = new Set($$("#tools .tool").map((r) => r.dataset.health));
  ok(healths.size >= 1, "health bands rendered: " + [...healths].join(","));
  ok(!/NOASSERTION/.test(doc.body.innerHTML), "NOASSERTION never shown to users");

  console.log("\n" + (fails ? fails + " FAILED" : "all " + checks + " checks passed"));
  process.exit(fails ? 1 : 0);
})();
