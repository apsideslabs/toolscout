"""Generates the static pages: 17 job pages, 117 tool pages, sitemap.

Reads data/tools.js (the catalogue) and writes:
    jobs/<id>.html
    tools/<slug>.html
    sitemap.xml
    data/index.json   (slug lookup for the client-side index)

Run after scripts/build_data.py.
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://apsideslabs.github.io/toolscout"


def load():
    raw = open(os.path.join(ROOT, "data", "tools.js")).read()
    raw = raw[raw.index("window.TOOLSCOUT = ") + len("window.TOOLSCOUT = "):]
    return json.loads(raw.rstrip().rstrip(";"))


D = load()
TOOLS = D["tools"]
JOBS = D["jobs"]
CHECKED = D["checked"]
JOB = {j["id"]: j for j in JOBS}
KIND = {"library": "Library", "service": "Service", "app": "App", "cli": "CLI"}

JOB_COLOR = {j["id"]: ["var(--blue)", "var(--red)", "var(--green)"][i % 3]
             for i, j in enumerate(JOBS)}

SIGNAL = {"fresh": "var(--green)", "slowing": "var(--blue)",
          "dead": "var(--red)", "stale": "var(--faint)"}


def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def slug(t):
    return t["id"]


def health(t):
    if t.get("archived"):
        return "dead", "Archived"
    if not t.get("pushed"):
        return "stale", "No repo"
    y, m, d = [int(x) for x in t["pushed"].split("-")]
    cy, cm, cd = [int(x) for x in CHECKED.split("-")]
    days = (cy - y) * 365 + (cm - m) * 30 + (cd - d)
    if days <= 30:
        return "fresh", "Active"
    if days <= 365:
        return "slowing", "Slowing"
    return "dead", "Stale"


def fmt_date(iso):
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    if not iso:
        return "—"
    y, m, d = iso.split("-")
    return "%d %s %s" % (int(d), months[int(m) - 1], y)


def fmt_stars(n):
    if not n:
        return "—"
    if n >= 100000:
        return "%dk" % round(n / 1000)
    if n >= 1000:
        k = "%.1f" % (n / 1000)
        return (k[:-2] if k.endswith(".0") else k) + "k"
    return str(n)


def matrix(active_ids, base, caption):
    """The one graphic idea: a square per tool, the active ones lit."""
    on = set(active_ids)
    dots = []
    for t in TOOLS:
        lit = " is-match" if t["id"] in on else (" is-dim" if active_ids else "")
        dots.append('<span class="%s" style="--c:%s" title="%s"></span>'
                    % (lit.strip(), SIGNAL.get(health(t)[0], "var(--faint)"),
                       esc(t["name"])))
    return ('<div class="matrix">%s</div>\n<p class="matrix__caption">%s</p>'
            % ("".join(dots), esc(caption)))


def shell(title, desc, base, body, canonical=""):
    return """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%s</title>
<meta name="description" content="%s">
<meta name="theme-color" content="#161616">
%s
<link rel="preload" href="%sfonts/ibm-plex-sans-normal-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="%sfonts.css">
<link rel="stylesheet" href="%ssite.css">
<link rel="icon" href="%sassets/mark.svg">
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="topbar" role="banner">
  <div class="topbar__row">
  <a class="topbar__name" href="%sindex.html"><span class="topbar__prefix">Tool</span>scout</a>
  <nav class="topbar__nav" aria-label="Sections">
    <ul class="topbar__menu">
      <li><a class="topbar__link" href="%sindex.html#index">Index</a></li>
      <li><a class="topbar__link" href="%smethod.html">Method</a></li>
      <li><a class="topbar__link" href="https://github.com/apsideslabs/toolscout" rel="noopener">Source</a></li>
    </ul>
  </nav>
  </div>
</header>
<main id="main">
%s
</main>
<footer class="foot">
  <div class="shell foot__row">
    <span>%d tools · %d jobs · checked %s</span>
    <span><a class="link" href="%smethod.html">Method</a> · <a class="link" href="https://github.com/apsideslabs/toolscout">Source</a></span>
  </div>
</footer>
</body>
</html>
""" % (esc(title), esc(desc),
       ('<link rel="canonical" href="%s">' % canonical) if canonical else "",
       base, base, base, base, base,
       base, base,
       body, len(TOOLS), len(JOBS), fmt_date(CHECKED), base)


def tool_row(t, base):
    band, label = health(t)
    return """<li class="tool" data-health="%s">
  <div class="tool__cell">
    <h3 class="tool__name"><a href="%stools/%s.html">%s</a></h3>
    <span class="tool__kind">%s</span>
  </div>
  <p class="tool__tag">%s</p>
  <dl class="tool__meta">
    <div><dt>Licence</dt><dd>%s</dd></div>
    <div><dt>Updated</dt><dd>%s</dd></div>
    <div><dt>Signal</dt><dd><span class="stamp stamp--%s">%s</span></dd></div>
  </dl>
</li>""" % (band, base, slug(t), esc(t["name"]),
           esc(KIND.get(t["kind"], t["kind"])),
           esc(t["tagline"]),
           esc("Custom" if t["licence"] in ("NOASSERTION", None) else t["licence"]),
           esc(fmt_date(t.get("pushed"))), band, label)


def write(path, html):
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    open(full, "w").write(html)


# ------------------------------------------------------------------ job pages
for i, j in enumerate(JOBS):
    members = [t for t in TOOLS if j["id"] in t["jobs"]]
    prev_j = JOBS[i - 1]
    next_j = JOBS[(i + 1) % len(JOBS)]
    body = """<section class="page-head">
  <div class="shell">
    <nav class="crumbs" aria-label="Breadcrumb">
      <a href="../index.html">Index</a> <span>/</span> <span>%s</span>
    </nav>
    <p class="label" style="color:%s">%02d · %d tools</p>
    <h1 class="page-title">%s</h1>
    <p class="page-lede">%s</p>
  </div>
</section>
<section class="shell section">
  %s
</section>
<section class="shell section">
  <ol class="tools">%s</ol>
</section>
<section class="shell section pager">
  <a class="link" href="%s.html">← %s</a>
  <a class="link" href="%s.html">%s →</a>
</section>""" % (
        esc(j["title"]), JOB_COLOR[j["id"]], i + 1, len(members),
        esc(j["title"]), esc(j["blurb"]),
        matrix([t["id"] for t in members], "../",
               "%d of %d tools do this job" % (len(members), len(TOOLS))),
        "".join(tool_row(t, "../") for t in members),
        prev_j["id"], esc(prev_j["title"]), next_j["id"], esc(next_j["title"]))

    write("jobs/%s.html" % j["id"], shell(
        "%s — Toolscout" % j["title"],
        "%s %s" % (j["title"], j["blurb"]),
        "../", body, "%s/jobs/%s.html" % (SITE, j["id"])))

# ----------------------------------------------------------------- tool pages
by_id = {t["id"]: t for t in TOOLS}
for idx, t in enumerate(TOOLS):
    band, label = health(t)
    jobs_html = "".join(
        '<a class="tag ts-chip" href="../jobs/%s.html" style="--job-c:%s">%s</a>'
        % (jid, JOB_COLOR[jid], esc(JOB[jid]["title"])) for jid in t["jobs"])
    flags = []
    if t.get("archived"):
        flags.append('<span class="flag flag--warn">Repository archived</span>')
    if t.get("selfhost"):
        flags.append('<span class="flag">Self-hostable</span>')
    if t.get("lang"):
        flags.append('<span class="flag">%s</span>' % esc(t["lang"]))
    repo = ('<a class="link" href="https://github.com/%s" rel="noopener">%s</a>'
            % (esc(t["repo"]), esc(t["repo"]))) if t.get("repo") else "—"

    prev_t = TOOLS[idx - 1]
    next_t = TOOLS[(idx + 1) % len(TOOLS)]

    body = """<section class="page-head">
  <div class="shell">
    <nav class="crumbs" aria-label="Breadcrumb">
      <a href="../index.html">Index</a> <span>/</span>
      <a href="../jobs/%s.html">%s</a> <span>/</span> <span>%s</span>
    </nav>
    <p class="label">%s</p>
    <h1 class="page-title">%s</h1>
    <p class="page-lede">%s</p>
    <p class="page-note"><span>Trade-off</span>%s</p>
    <div class="page-actions">
      <a class="btn btn--primary" href="%s" target="_blank" rel="noopener">Visit %s</a>
      %s
    </div>
  </div>
</section>
<section class="shell section">
  <div class="spec">
    <div><dt>Licence</dt><dd>%s</dd></div>
    <div><dt>Cost</dt><dd>%s</dd></div>
    <div><dt>Type</dt><dd>%s</dd></div>
    <div><dt>Updated</dt><dd>%s</dd></div>
    <div><dt>Stars</dt><dd>%s</dd></div>
    <div><dt>Signal</dt><dd><span class="stamp stamp--%s">%s</span></dd></div>
    <div><dt>Repository</dt><dd>%s</dd></div>
    <div><dt>Appears under</dt><dd class="spec__jobs">%s</dd></div>
  </div>
</section>
<section class="shell section">
  %s
</section>
<section class="shell section pager">
  <a class="link" href="%s.html">← %s</a>
  <a class="link" href="%s.html">%s →</a>
</section>""" % (
        t["jobs"][0], esc(JOB[t["jobs"][0]]["title"]), esc(t["name"]),
        esc(KIND.get(t["kind"], t["kind"])),
        esc(t["name"]), esc(t["tagline"]), esc(t["note"]), esc(t["url"]), esc(t["name"]),
        "".join(flags),
        esc("Custom" if t["licence"] in ("NOASSERTION", None) else t["licence"]),
        esc({"free": "Free / OSS", "freemium": "Freemium", "paid": "Paid"}[t["cost"]]),
        esc(KIND.get(t["kind"], t["kind"])),
        esc(fmt_date(t.get("pushed"))), esc(fmt_stars(t.get("stars"))),
        band, label, repo, jobs_html,
        matrix([t["id"]], "../", "One of %d tools" % len(TOOLS)),
        slug(prev_t), esc(prev_t["name"]), slug(next_t), esc(next_t["name"]))

    write("tools/%s.html" % slug(t), shell(
        "%s — %s — Toolscout" % (t["name"], JOB[t["jobs"][0]]["title"]),
        t["tagline"], "../", body, "%s/tools/%s.html" % (SITE, slug(t))))

# --------------------------------------------------------------- method page
checks = [
    ("Read the last commit and the last release.",
     "Commits this month plus a release this quarter is alive. An eighteen-month-old release is a risk you are choosing to take."),
    ("Treat stars as an order of magnitude.",
     "40,000 against 400 is real information. 12,000 against 9,000 is noise."),
    ("Check the licence, and any recent change to it.",
     "A move from an open licence to source-available is a commercial pivot, and the free tier becomes a business decision."),
    ("Look for a Docker image and a Compose file.",
     "They signal that upgrades, persistent data and reverse proxies have been thought about."),
    ("Read the open issues, not the README.",
     "Sort by most-commented. It shows what actually hurts, and whether maintainers answer."),
]
body = """<section class="page-head">
  <div class="shell">
    <p class="label">Method</p>
    <h1 class="page-title">How an entry gets here</h1>
  </div>
</section>
<section class="shell section">
  <div class="spec spec--method">
    <div><dt>01</dt><dd>Chosen by job, not by category. A tool can sit under several — Postgres is a database and a search option.</dd></div>
    <div><dt>02</dt><dd>Health comes from the repository: last push, licence, language and stars, read from the GitHub API at build time.</dd></div>
    <div><dt>03</dt><dd>Fresh is a push within 30 days, slowing within a year, stale beyond that. Archived means the repository is closed.</dd></div>
    <div><dt>04</dt><dd>No paid placement. Order follows your query, recency, or stars. A listing never proves a tool is safe.</dd></div>
  </div>
</section>
<section class="shell section">
  <h2 class="page-sub">Before you install anything</h2>
  <ol class="checks">%s</ol>
</section>""" % "".join(
    "<li><b>%s</b> %s</li>" % (esc(a), esc(b)) for a, b in checks)

write("method.html", shell("Method — Toolscout",
                           "How entries are chosen and what the health bands mean.",
                           "", body, "%s/method.html" % SITE))

# ------------------------------------------------------------------- sitemap
urls = ["%s/index.html" % SITE, "%s/method.html" % SITE]
urls += ["%s/jobs/%s.html" % (SITE, j["id"]) for j in JOBS]
urls += ["%s/tools/%s.html" % (SITE, slug(t)) for t in TOOLS]
open(os.path.join(ROOT, "sitemap.xml"), "w").write(
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + "".join("<url><loc>%s</loc><lastmod>%s</lastmod></url>\n" % (u, CHECKED) for u in urls)
    + "</urlset>\n")

print("jobs: %d  tools: %d  method: 1  sitemap: %d urls"
      % (len(JOBS), len(TOOLS), len(urls)))
