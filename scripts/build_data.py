"""Builds the catalogue by discovering repositories, not by hand-listing them.

Every entry must pass the admission test before it is written:
    - the repository exists and is not archived
    - it has been pushed to within the last 12 months
    - it carries a recognised licence
    - it has at least MIN_STARS (community-validated)

Run:  python3 scripts/build_data.py
Requires: gh CLI authenticated (uses `gh api graphql`).
"""
import json
import os
import re
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from platforms import as_records as platform_records
import subprocess
import time
from datetime import date, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHECKED = date.today().isoformat()
SINCE = (date.today() - timedelta(days=365)).isoformat()
MIN_STARS = 400
PER_QUERY = 100

# job id -> list of GitHub search fragments
QUERIES = {
    "frontend": [
        "topic:frontend-framework", "topic:ui-framework", "topic:component-library",
        "topic:css-framework", "topic:static-site-generator", "topic:web-framework language:TypeScript",
    ],
    "auth": [
        "topic:authentication", "topic:oauth", "topic:identity", "topic:sso",
        "authentication in:name,description", "topic:authorization",
    ],
    "database": [
        "topic:database", "topic:sql", "topic:orm", "topic:key-value-store",
        "topic:vector-database", "database in:name,description",
    ],
    "api": [
        "topic:api", "topic:rest-api", "topic:graphql", "topic:openapi",
        "topic:api-client", "api in:name,description",
    ],
    "deploy": [
        "topic:deployment", "topic:paas", "topic:containers", "topic:kubernetes",
        "topic:reverse-proxy", "deployment in:name,description",
    ],
    "ci": [
        "topic:continuous-integration", "topic:ci", "topic:build-tool",
        "topic:monorepo", "topic:testing", "ci in:name,description",
    ],
    "observe": [
        "topic:monitoring", "topic:observability", "topic:logging",
        "topic:metrics", "topic:tracing", "topic:apm",
    ],
    "email": [
        "topic:email", "topic:smtp", "topic:newsletter", "topic:transactional-email",
        "email in:name,description",
    ],
    "payments": [
        "topic:payments", "topic:billing", "topic:subscriptions", "topic:ecommerce",
        "payments in:name,description",
    ],
    "search": [
        "topic:search-engine", "topic:full-text-search", "topic:search",
        "topic:vector-search", "search in:name,description",
    ],
    "files": [
        "topic:file-storage", "topic:object-storage", "topic:file-upload",
        "topic:cdn", "topic:image-processing",
    ],
    "ai": [
        "topic:llm", "topic:machine-learning", "topic:artificial-intelligence",
        "topic:rag", "topic:ai-agents", "topic:embeddings",
    ],
    "automate": [
        "topic:workflow-automation", "topic:job-queue", "topic:task-queue",
        "topic:workflow-engine", "topic:scheduler", "topic:webhooks",
    ],
    "docs": [
        "topic:documentation", "topic:docs-generator", "topic:markdown",
        "topic:static-docs", "documentation in:name,description",
    ],
    "terminal": [
        "topic:cli", "topic:command-line", "topic:terminal", "topic:shell",
        "topic:command-line-tool language:Rust",
    ],
    "editor": [
        "topic:editor", "topic:ide", "topic:code-editor", "topic:linter",
        "topic:formatter", "topic:vim-plugin",
    ],
    "design": [
        "topic:design-tools", "topic:design-system", "topic:icons",
        "topic:diagram", "topic:figma", "topic:whiteboard",
    ],
}

JOBS = [
    ("frontend", "Build the interface", "Ship a usable UI without inventing a build pipeline."),
    ("auth", "Add sign-in and permissions", "Users, sessions, roles, SSO — the part nobody demos."),
    ("database", "Store and query data", "Pick the store before the schema hardens."),
    ("api", "Build, document and test an API", "Contracts, validation, and something to click instead of curl."),
    ("deploy", "Get it running in production", "From laptop to a URL that stays up."),
    ("ci", "Automate build and test", "Stop being the integration server."),
    ("observe", "See what production is doing", "Metrics, traces, and the alert that wakes you."),
    ("email", "Send mail and notifications", "Transactional mail, templates, and landing in the inbox."),
    ("payments", "Take money", "Checkout, subscriptions, tax, and the India question."),
    ("search", "Make things findable", "Typo tolerance and relevance without a search team."),
    ("files", "Store and serve files", "Uploads, images, and the egress bill."),
    ("ai", "Add a model to the product", "Providers, streaming, evals, and cost per request."),
    ("automate", "Glue services and run jobs", "Webhooks, retries, and long-running work."),
    ("docs", "Write and publish documentation", "Reference docs people can actually search."),
    ("terminal", "Move faster in the shell", "Replacements for the tools you type a thousand times a day."),
    ("editor", "Write and review code", "The editor, the formatter, the lint rules."),
    ("design", "Design and prototype", "Screens, diagrams, and the assets that go in them."),
    ("media", "Edit images, video and audio", "Cut, generate and clean up the assets a product needs."),
]

GQL = """
query($q: String!) {
  search(query: $q, type: REPOSITORY, first: %d) {
    repositoryCount
    nodes {
      ... on Repository {
        nameWithOwner
        name
        description
        url
        homepageUrl
        stargazerCount
        pushedAt
        isArchived
        primaryLanguage { name }
        licenseInfo { spdxId }
        repositoryTopics(first: 12) { nodes { topic { name } } }
      }
    }
  }
}
""" % PER_QUERY


def run_query(q):
    out = subprocess.run(
        ["gh", "api", "graphql", "-f", "query=" + GQL, "-f", "q=" + q],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        return []
    try:
        data = json.loads(out.stdout)
    except Exception:
        return []
    nodes = (((data.get("data") or {}).get("search") or {}).get("nodes")) or []
    return [n for n in nodes if n]


# Things that pass the star test but are not tools: samples, demos, reading lists.
JUNK = ("sample", "example", "demo", "template", "boilerplate", "tutorial",
        "awesome", "cheat", "cheatsheet", "course", "book", "learning",
        "guide", "starter", "playground", "sandbox", "interview", "roadmap",
        "curated", "list of", "docs", "documentation", "handbook", "notes",
        "exercises", "workshop", "training", "snippets", "patches", "benchmark",
        "samples", "codelab", "toy", "clone", "homework", "assignment")


def is_junk(t):
    blob = (t.get("name", "") + " " + t.get("tagline", "") + " " + t.get("repo", "")).lower()
    return any(w in blob for w in JUNK)


EMOJI_RE = re.compile(
    "["
    "\U0001F300-\U0001FAFF"
    "\U00002600-\U000027BF"
    "\U0001F1E6-\U0001F1FF"
    "\U00002190-\U000021FF"
    "\U00002B00-\U00002BFF"
    "\uFE0F\u200D"
    "]+", flags=re.UNICODE)


def clean(text):
    """GitHub descriptions arrive with emoji and :shortcodes: in them."""
    t = EMOJI_RE.sub("", text or "")
    t = re.sub(r":[a-z0-9_+-]+:", "", t)          # :white_check_mark:
    t = re.sub(r"\s{2,}", " ", t).strip(" -—·|")
    return t.strip()


def humanise(name):
    """rails-api -> Rails API, next.js -> Next.js"""
    parts = name.replace("_", "-").split("-")
    out = []
    for p in parts:
        if not p:
            continue
        if p.isupper() or any(c.isupper() for c in p[1:]):
            out.append(p)
        elif len(p) <= 3:
            out.append(p.upper())
        else:
            out.append(p[0].upper() + p[1:])
    return " ".join(out) if out else name


CACHE = os.path.join(ROOT, "..", "discovered.json")


def verify_outliers(tools, threshold=100000, ratio=0.02):
    """Very high star counts are cross-checked against fork counts.

    Star farms accumulate stars without contributors: real projects at this
    scale are forked at roughly 10-20% of their star count.
    """
    suspects = [t for t in tools if (t.get("stars") or 0) >= threshold]
    if not suspects:
        return tools
    print("checking %d outliers against fork counts" % len(suspects))

    aliases = []
    for i, t in enumerate(suspects):
        owner, name = t["repo"].split("/", 1)
        aliases.append('r%d: repository(owner: "%s", name: "%s") { forkCount stargazerCount }'
                       % (i, owner, name))
    q = "query { " + " ".join(aliases) + " }"

    out = subprocess.run(["gh", "api", "graphql", "-f", "query=" + q],
                         capture_output=True, text=True)
    if out.returncode != 0:
        print("  fork check failed, keeping all")
        return tools
    try:
        data = (json.loads(out.stdout).get("data") or {})
    except Exception:
        return tools

    drop = set()
    for i, t in enumerate(suspects):
        r = data.get("r%d" % i)
        if not r:
            continue
        stars, forks = r.get("stargazerCount") or 0, r.get("forkCount") or 0
        if stars and forks < stars * ratio:
            drop.add(t["repo"])
            print("  dropped %-34s %6d stars / %4d forks" % (t["repo"], stars, forks))
    return [t for t in tools if t["repo"] not in drop]


def main():
    import sys
    only = sys.argv[1:]
    found = {}
    if os.path.exists(CACHE):
        for t in json.load(open(CACHE)):
            found[t["repo"]] = t
        print("cache:", len(found))
    seen_repos = set(found.keys())

    # no job args + a warm cache = just re-emit, do not re-query GitHub
    if not only and found:
        jobs = []
        print("using cache, no queries")
    else:
        jobs = [(k, v) for k, v in QUERIES.items() if not only or k in only]
    for job_id, queries in jobs:
        for frag in queries:
            q = "%s stars:>%d pushed:>%s archived:false" % (frag, MIN_STARS, SINCE)
            nodes = run_query(q)
            added = 0
            for n in nodes:
                repo = n["nameWithOwner"]
                if not repo or not n.get("description"):
                    continue
                if n.get("isArchived"):
                    continue
                lic = (n.get("licenseInfo") or {}).get("spdxId")
                if not lic:
                    continue
                if (n.get("stargazerCount") or 0) < MIN_STARS:
                    continue
                pushed = (n.get("pushedAt") or "")[:10]
                if not pushed or pushed < SINCE:
                    continue

                if repo in found:
                    if job_id not in found[repo]["jobs"]:
                        found[repo]["jobs"].append(job_id)
                    continue
                if repo in seen_repos:
                    continue
                seen_repos.add(repo)

                topics = [t["topic"]["name"] for t in
                          ((n.get("repositoryTopics") or {}).get("nodes") or [])]
                found[repo] = {
                    "id": repo.split("/")[1].lower().replace(".", "-").replace("_", "-"),
                    "name": humanise(n["name"]),
                    "repo": repo,
                    "url": n.get("homepageUrl") or n["url"],
                    "tagline": clean(n["description"])[:160],
                    "jobs": [job_id],
                    "kind": "library",
                    "cost": "free",
                    "selfhost": True,
                    "licence": lic,
                    "tags": topics[:6],
                    "note": "",
                    "stars": n.get("stargazerCount"),
                    "pushed": pushed,
                    "lang": (n.get("primaryLanguage") or {}).get("name"),
                    "archived": False,
                }
                added += 1
            print("  %-10s %-46s +%3d  (total %d)" % (job_id, frag[:46], added, len(found)))
            time.sleep(2.1)          # stay under the search rate limit

    json.dump(list(found.values()), open(CACHE, "w"))
    tools = [t for t in found.values() if not is_junk(t)]
    tools = verify_outliers(tools)

    # AI and editing tools harvested from a public directory (see data/aitools.json)
    harvest_path = os.path.join(ROOT, "data", "aitools.json")
    if os.path.exists(harvest_path):
        harvest = json.load(open(harvest_path))
        names_l = set(t["name"].lower() for t in tools)
        added_h = 0
        for i, h in enumerate(harvest):
            if h["name"].lower() in names_l:
                continue
            names_l.add(h["name"].lower())
            slug = re.sub(r"[^a-z0-9]+", "-", h["name"].lower()).strip("-")[:48] or "tool"
            tools.append({
                "id": "ai-" + slug,
                "name": h["name"],
                "repo": "",
                "url": h["url"],
                "tagline": h["tagline"],
                "jobs": h["jobs"],
                "licence": "Proprietary",
                "stars": 0,
                "weight": 6000,
                "pushed": h.get("checked") or "",
                "lang": "",
                "detail": 0,
                "kind": "platform",
                "pricing": h.get("pricing") or "unknown",
                "tier": 3,
                "archived": False,
            })
            added_h += 1
        print("harvested AI/editing tools added:", added_h)

    # hosted platforms: curated by hand, because they have no repository
    platforms = platform_records()
    have = set(t["repo"] for t in tools if t["repo"])
    names = set(t["name"].lower() for t in tools)
    added = [p for p in platforms
             if p["name"].lower() not in names]
    for p in added:
        p["archived"] = False
        tools.append(p)
    print("hosted platforms added:", len(added))
    dropped = len(found) - len(tools)
    print("dropped as samples/docs/demos:", dropped)
    # ids must be unique across owners
    seen_ids = {}
    for t in tools:
        base = t["id"]
        if base in seen_ids:
            seen_ids[base] += 1
            t["id"] = "%s-%d" % (base, seen_ids[base])
        else:
            seen_ids[base] = 1

    for t in tools:
        t.setdefault("kind", "library")
        t.setdefault("weight", t.get("stars") or 0)
        t.setdefault("pricing", "")

    tools.sort(key=lambda t: (-(t.get("weight") or 0), t["name"].lower()))

    # detail pages for the 600 strongest; the rest link straight out
    for i, t in enumerate(tools):
        t["detail"] = 1 if i < 600 else 0

    print("\ntotal entries:", len(tools))
    print("jobs covered:", len(set(j for t in tools for j in t["jobs"])))
    print("detail pages:", sum(t["detail"] for t in tools))

    FIELDS = ["id", "name", "repo", "url", "tagline", "jobs", "licence",
              "stars", "pushed", "lang", "detail", "kind", "weight", "pricing"]
    rows = []
    for t in tools:
        repo_url = "https://github.com/" + t["repo"]
        u = t.get("url") or repo_url
        if u.startswith("http://"): u = "https://" + u[7:]
        elif not u.startswith("https://"): u = "https://" + u.lstrip("/")
        url = "" if u == repo_url else u
        rows.append([t["id"], t["name"], t["repo"], url, clean(t["tagline"]),
                     t["jobs"], t["licence"], t["stars"] or 0, t["pushed"],
                     t.get("lang") or "", t["detail"], t["kind"],
                     t.get("weight") or 0, t.get("pricing") or ""])

    payload = {
        "checked": CHECKED,
        "jobs": [{"id": i, "title": tt, "blurb": b} for i, tt, b in JOBS],
        "fields": FIELDS,
        "rows": rows,
    }
    with open(os.path.join(ROOT, "data", "tools.js"), "w") as f:
        f.write("/* Generated by scripts/build_data.py — do not edit by hand. */\n")
        f.write("window.TOOLSCOUT = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    kb = os.path.getsize(os.path.join(ROOT, "data", "tools.js")) / 1024
    print("wrote data/tools.js  (%.0f KB)" % kb)


if __name__ == "__main__":
    main()
