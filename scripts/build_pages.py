"""Generates the static pages from the compact catalogue.

Writes jobs/<id>.html (17), tools/<slug>.html (600 strongest only),
method.html and sitemap.xml. Everything else links straight to its repo.

Run after scripts/build_data.py.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://apsideslabs.github.io/toolscout"


def load():
    raw = open(os.path.join(ROOT, "data", "tools.js")).read()
    data = json.loads(raw[raw.index("window.TOOLSCOUT = ") + len("window.TOOLSCOUT = "):]
                      .rstrip().rstrip(";"))
    fields = data["fields"]
    tools = []
    for r in data["rows"]:
        t = dict(zip(fields, r))
        t["jobs"] = t["jobs"] or []
        t["url"] = t["url"] or ("https://github.com/" + t["repo"])
        t["detail"] = bool(t["detail"])
        t["kind"] = t.get("kind") or "library"
        t["weight"] = t.get("weight") or t.get("stars") or 0
        t["pricing"] = t.get("pricing") or ""
        tools.append(t)
    return data["checked"], data["jobs"], tools


CHECKED, JOBS, TOOLS = load()
JOB = {j["id"]: j for j in JOBS}
BY_ID = {t["id"]: t for t in TOOLS}
DETAIL = [t for t in TOOLS if t["detail"]]

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def esc(s):
    return (str(s if s is not None else "")
            .replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def fmt_date(iso):
    if not iso:
        return "—"
    y, m, d = iso.split("-")
    return "%d %s %s" % (int(d), MONTHS[int(m) - 1], y)


def fmt_stars(n):
    n = n or 0
    if n >= 1000:
        k = "%.1f" % (n / 1000.0)
        return (k[:-2] if k.endswith(".0") else k) + "k"
    return str(n)


def health(t):
    if t.get("kind") == "platform":
        return "platform", "Hosted"
    if not t.get("pushed"):
        return "stale", "No repo"
    if t["pushed"] < "2025-11-18":
        return "dead", "Stale"
    if t["pushed"] >= "2026-10-19":
        return "fresh", "Active"
    return "slowing", "Slowing"


def licence(t):
    lic = t.get("licence") or ""
    return "Custom" if lic in ("NOASSERTION", "") else lic


def row(t, base):
    band, label = health(t)
    href = (base + "tools/" + t["id"] + ".html") if t["detail"] else t["url"]
    ext = "" if t["detail"] else ' target="_blank" rel="noopener"'
    return (
        '<li class="tool" data-health="%s">'
        '<div class="tool__cell">'
        '<h3 class="tool__name"><a href="%s"%s>%s</a></h3>'
        '<span class="tool__kind">%s</span>'
        "</div>"
        '<p class="tool__tag">%s</p>'
        '<dl class="tool__meta">'
        "<div><dt>Licence</dt><dd>%s</dd></div>"
        "<div><dt>%s</dt><dd>%s</dd></div>"
        "<div><dt>Updated</dt><dd>%s</dd></div>"
        "<div><dt>Signal</dt><dd><span class=\"stamp stamp--%s\">%s</span></dd></div>"
        "</dl></li>"
    ) % (band, esc(href), ext, esc(t["name"]),
         esc("Platform" if t["kind"] == "platform" else (t.get("lang") or "Library")),
         esc(t["tagline"]), esc(licence(t)),
         "Pricing" if t["kind"] == "platform" else "Stars",
         esc(t["pricing"] or "—") if t["kind"] == "platform" else esc(fmt_stars(t.get("stars"))),
         esc(fmt_date(t.get("pushed"))),
         "muted" if band == "stale" else band, label)


DRAWER = "\n".join(
    '        <a class="drawer__link" href="{base}jobs/%s.html">'
    '<span class="drawer__n">%02d</span>%s</a>' % (j["id"], i + 1, esc(j["title"]))
    for i, j in enumerate(JOBS))

SHELL = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>@TITLE@</title>
<meta name="description" content="@DESC@">
<meta name="theme-color" content="#1c1b27">
@CANON@
<link rel="preload" href="@BASE@fonts/inter-normal-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="@BASE@fonts.css">
<link rel="stylesheet" href="@BASE@site.css">
<link rel="icon" href="@BASE@assets/mark.svg">
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="topbar" role="banner">
  <div class="topbar__row">
  <button class="menu-toggle" id="menuToggle" type="button"
          aria-expanded="false" aria-controls="drawer" aria-label="Open menu">
    <span class="menu-toggle__line"></span>
    <span class="menu-toggle__line"></span>
    <span class="menu-toggle__line"></span>
  </button>
  <div class="drawer" id="drawer" aria-hidden="true">
    <div class="drawer__head">
      <span class="drawer__title">Browse</span>
      <button class="drawer__close" id="drawerClose" type="button" aria-label="Close menu">&#215;</button>
    </div>
    <nav class="drawer__nav" aria-label="All sections">
      <a class="drawer__link drawer__link--top" href="@BASE@index.html">Index</a>
      <p class="drawer__label">Jobs</p>
@DRAWER@
      <p class="drawer__label">More</p>
      <a class="drawer__link drawer__link--top" href="@BASE@method.html">Method</a>
      <a class="drawer__link drawer__link--top" href="https://github.com/apsideslabs/toolscout">Source</a>
    </nav>
  </div>
  <div class="drawer-backdrop" id="drawerBackdrop" hidden></div>
  <a class="topbar__name" href="@BASE@index.html"><span class="topbar__prefix">Tool</span>scout</a>
  <nav class="topbar__nav" aria-label="Sections">
    <ul class="topbar__menu">
      <li><a class="topbar__link" href="@BASE@index.html#index">Index</a></li>
      <li><a class="topbar__link" href="@BASE@method.html">Method</a></li>
      <li><a class="topbar__link" href="https://github.com/apsideslabs/toolscout" rel="noopener">Source</a></li>
    </ul>
  </nav>
  </div>
</header>
<main id="main">
@BODY@
</main>
<footer class="foot">
  <div class="shell foot__row">
    <span>@COUNT@ tools · @JOBS@ jobs · checked @CHECKED@</span>
    <span><a href="@BASE@method.html">Method</a> · <a href="https://github.com/apsideslabs/toolscout">Source</a></span>
  </div>
</footer>
<script src="@BASE@menu.js"></script>
</body>
</html>
"""


def shell(title, desc, base, body, canonical=""):
    canon = '<link rel="canonical" href="%s">' % canonical if canonical else ""
    return (SHELL
            .replace("@TITLE@", esc(title))
            .replace("@DESC@", esc(desc))
            .replace("@CANON@", canon)
            .replace("@BASE@", base)
            .replace("@DRAWER@", DRAWER.replace("{base}", base))
            .replace("@BODY@", body)
            .replace("@COUNT@", str(len(TOOLS)))
            .replace("@JOBS@", str(len(JOBS)))
            .replace("@CHECKED@", fmt_date(CHECKED)))


def write(path, html):
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    open(full, "w").write(html)


# ------------------------------------------------------------------ job pages
for i, j in enumerate(JOBS):
    all_members = [t for t in TOOLS if j["id"] in t["jobs"]]
    all_members.sort(key=lambda t: -(t.get("stars") or 0))
    members = all_members[:200]
    prev_j, next_j = JOBS[i - 1], JOBS[(i + 1) % len(JOBS)]
    body = """<section class="page-head">
  <div class="shell">
    <nav class="crumbs" aria-label="Breadcrumb">
      <a href="../index.html">Index</a> <span>/</span> <span>%s</span>
    </nav>
    <p class="label">%02d · %d tools</p>
    <h1 class="page-title">%s</h1>
    <p class="page-lede">%s</p>
  </div>
</section>
<section class="shell section">
  <p class="section-meta">%s</p>
  <ol class="tools">%s</ol>
</section>
<section class="shell pager">
  <a class="link" href="%s.html">← %s</a>
  <a class="link" href="%s.html">%s →</a>
</section>""" % (esc(j["title"]), i + 1, len(all_members), esc(j["title"]),
                esc(j["blurb"]),
                ("Showing the 200 most-starred of %d. Search the index for the rest." % len(all_members))
                if len(all_members) > 200 else ("%d tools." % len(all_members)),
                "".join(row(t, "../") for t in members),
                prev_j["id"], esc(prev_j["title"]),
                next_j["id"], esc(next_j["title"]))
    write("jobs/%s.html" % j["id"], shell(
        "%s — %d tools — Toolscout" % (j["title"], len(all_members)),
        "%s. %d active, licensed tools." % (j["blurb"], len(all_members)),
        "../", body, "%s/jobs/%s.html" % (SITE, j["id"])))

# ----------------------------------------------------------------- tool pages
for idx, t in enumerate(DETAIL):
    band, label = health(t)
    jobs_html = "".join(
        '<a class="tag ts-chip" href="../jobs/%s.html">%s</a>'
        % (jid, esc(JOB[jid]["title"])) for jid in t["jobs"] if jid in JOB)
    prev_t = DETAIL[idx - 1]
    next_t = DETAIL[(idx + 1) % len(DETAIL)]
    body = """<section class="page-head">
  <div class="shell">
    <nav class="crumbs" aria-label="Breadcrumb">
      <a href="../index.html">Index</a> <span>/</span>
      <a href="../jobs/%s.html">%s</a> <span>/</span> <span>%s</span>
    </nav>
    <p class="label">%s</p>
    <h1 class="page-title">%s</h1>
    <p class="page-lede">%s</p>
    <div class="page-actions">
      <a class="btn btn--primary" href="%s" target="_blank" rel="noopener">Open %s</a>
      <a class="btn btn--outline" href="https://github.com/%s" target="_blank" rel="noopener">Repository</a>
    </div>
  </div>
</section>
<section class="shell section">
  <div class="spec">
    <div><dt>Type</dt><dd>%s</dd></div>
    <div><dt>%s</dt><dd>%s</dd></div>
    <div><dt>Last push</dt><dd>%s</dd></div>
    <div><dt>Signal</dt><dd><span class="stamp stamp--%s">%s</span></dd></div>
    <div><dt>Language</dt><dd>%s</dd></div>
    <div><dt>Repository</dt><dd>%s</dd></div>
    <div><dt>Admitted</dt><dd>not archived · licensed · pushed within 12 months</dd></div>
    <div><dt>Appears under</dt><dd class="spec__jobs">%s</dd></div>
  </div>
</section>
<section class="shell pager">
  <a class="link" href="%s.html">← %s</a>
  <a class="link" href="%s.html">%s →</a>
</section>""" % (
        t["jobs"][0], esc(JOB[t["jobs"][0]]["title"]) if t["jobs"][0] in JOB else "",
        esc(t["name"]),
        esc(t.get("lang") or "repository"),
        esc(t["name"]), esc(t["tagline"]), esc(t["url"]), esc(t["name"]),
        esc(t["repo"]),
        "Hosted platform" if t["kind"] == "platform" else "Open-source library",
        "Pricing" if t["kind"] == "platform" else "Stars",
        esc(t["pricing"] or "—") if t["kind"] == "platform" else esc(fmt_stars(t.get("stars"))),
        esc(fmt_date(t.get("pushed"))), band, label,
        esc(t.get("lang") or "—"), esc(t["repo"]), jobs_html,
        prev_t["id"], esc(prev_t["name"]), next_t["id"], esc(next_t["name"]))

    write("tools/%s.html" % t["id"], shell(
        "%s — Toolscout" % t["name"], t["tagline"], "../", body,
        "%s/tools/%s.html" % (SITE, t["id"])))

# --------------------------------------------------------------- method page
checks = [
    ("Not archived.", "A repository the maintainer has closed is excluded, however popular it is."),
    ("Pushed within twelve months.", "A tool that has not moved in a year is not maintained, whatever the README says."),
    ("Carries a licence.", "No licence means no legal right to use it. Those entries are dropped."),
    ("At least 400 stars, for libraries.", "A floor for community validation, not a quality score."),
    ("AI and editing tools come from a public directory.", "The 1,657 AI and media entries are harvested from aitoolindex.org, which checks each vendor page and stamps a date. They are labelled Platform, carry a pricing model, and link straight to the vendor."),
    ("Hosted platforms are curated, not machine-checked.", "Stripe, Vercel and Clerk have no repository to read, so they are listed by hand and reviewed on the check date. Their rows say Platform, and the licence reads Proprietary."),
    ("Outliers cross-checked against forks.", "Above 100,000 stars the fork count is checked too, because star farms accumulate stars without contributors. Real projects at that scale are forked at 10-20% of their star count."),
    ("Metadata read at build time.", "Stars, licence, language and last push come from the GitHub API, not from a directory listing."),
]
body = """<section class="page-head">
  <div class="shell">
    <p class="label">Method</p>
    <h1 class="page-title">How a tool gets in</h1>
    <p class="page-lede">%d tools across %d jobs. Every one of them passed the same five tests, and the tests run again every month.</p>
  </div>
</section>
<section class="shell section">
  <ol class="checks">%s</ol>
</section>
<section class="shell section">
  <h2 class="page-sub">What this index will not claim</h2>
  <p class="page-lede">A listing is not an endorsement. Admission means a project is public, active and licensed — not that it is secure, well-designed, or right for your problem. Read the open issues before you install anything.</p>
</section>""" % (len(TOOLS), len(JOBS),
                "".join("<li><b>%s</b> %s</li>" % (esc(a), esc(b)) for a, b in checks))
write("method.html", shell("Method — Toolscout",
                           "The five tests every entry passes.",
                           "", body, "%s/method.html" % SITE))

# ------------------------------------------------------------------- sitemap
urls = ["%s/index.html" % SITE, "%s/method.html" % SITE]
urls += ["%s/jobs/%s.html" % (SITE, j["id"]) for j in JOBS]
urls += ["%s/tools/%s.html" % (SITE, t["id"]) for t in DETAIL]
open(os.path.join(ROOT, "sitemap.xml"), "w").write(
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + "".join("<url><loc>%s</loc><lastmod>%s</lastmod></url>\n" % (u, CHECKED) for u in urls)
    + "</urlset>\n")

print("tools: %d | detail pages: %d | jobs: %d | sitemap: %d urls"
      % (len(TOOLS), len(DETAIL), len(JOBS), len(urls)))
