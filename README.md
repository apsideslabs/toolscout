# Toolscout

An index of developer tools, ordered by **the job you are trying to do** rather than by product name.

Most directories are alphabetical, which means you need the name before you can find it. Toolscout starts from the problem — "send transactional email", "add sign-in", "see what production is doing" — and every entry carries a maintenance signal read from its own repository instead of a decorative star count.

**117 tools · 17 jobs · 93 entries with live GitHub metadata.**

---

## What makes it different

**Task-first, not category-first.** A tool is filed under the job it solves, and can appear under several. Postgres is both a database and a search option, because it is.

**Health is data, not a badge.** Where a project lives on GitHub, its last push date, licence, primary language and stars are pulled from the GitHub API at build time. Each entry is then banded:

| Band | Rule | Meaning |
| --- | --- | --- |
| Active | pushed within 30 days | a green light |
| Slowing | pushed within a year | still fine, worth watching |
| Stale | no push for over a year | a risk you are choosing |
| Archived | repo closed by maintainer | do not start here |

**Every entry states its own trade-off.** One line, written against the tool, not copied from its marketing page. A directory that only lists strengths is a catalogue of advertisements.

**No paid placement.** Nothing is ranked by who paid. Order comes from your query, from recency, or from stars.

**Built to a system, not a template.** Warm paper field, near-black ink, deep pine for structure, one vermilion for action, gold used maybe five times on the whole page — the 60/30/10 discipline the rest of the studio works to. Newsreader carries the editorial voice, Instrument Sans the interface, JetBrains Mono every label and number. Depth is soft and layered: 1px hairlines, 8–22px radii, four shadow steps, one gradient panel. No flat slabs, no hard-edged boxes, no animation library.

**Searchable by constraint.** Free tier, open source, self-hostable, active, library, service, app, CLI — stackable, encoded in the URL, and copyable with one button, so a filtered view is a shareable link.

**Matched terms are marked.** Searching puts a gold rule under the words that hit, in the name, the tagline and the trade-off line, so you can see *why* a tool surfaced. When nothing matches, the empty state offers recoverable queries instead of a dead end.

---

## Structure

```
index.html          markup, no templating
styles.css          all styling; design tokens at the top
app.js              filtering, ranking, rendering — ~350 lines, no dependencies
fonts.css           @font-face declarations for the self-hosted fonts
data/tools.js       generated catalogue (window.TOOLSCOUT)
scripts/build_data.py   the catalogue source + GitHub metadata fetch
fonts/              five WOFF2 files, OFL 1.1 (see fonts/OFL.txt)
```

There is no build step and no framework. GitHub Pages serves these files directly. The only generated artefact is `data/tools.js`.

### Why `data/tools.js` and not `tools.json`

`fetch()` against a local JSON file fails under `file://`, which would mean the site appears broken to anyone who just double-clicks `index.html`. A script that assigns a global works from the filesystem and from a server, with no build step either way.

---

## Run it locally

```bash
git clone https://github.com/apsideslabs/toolscout.git
cd toolscout
python3 -m http.server 8000
# open http://localhost:8000
```

Opening `index.html` directly also works — that is the point of `data/tools.js`.

---

## Adding or editing a tool

The catalogue is not edited in `data/tools.js`. It is defined once, as a tuple, in `scripts/build_data.py`:

```python
("Resend", "https://resend.com", "", 
 "Transactional email API built for developers.",
 ["email"], "service", "freemium", False, ["email", "api"],
 "Deliverability is shared; dedicated IPs cost extra."),
```

Fields, in order: **name · url · GitHub repo (`owner/name`, or `""`) · tagline · jobs · kind · cost · self-hostable · tags · trade-off.**

- `jobs` must reference ids from the `JOBS` list at the top of the file.
- `kind` is one of `library`, `service`, `app`, `cli`.
- `cost` is one of `free`, `freemium`, `paid`.
- With a repo, the licence, stars, language and last push come from the API — do not type them by hand.

Then regenerate:

```bash
python3 scripts/build_data.py    # requires an authenticated gh CLI
```

The script batches up to 40 repositories per GraphQL query, so the whole catalogue refreshes in three requests.

---

## Refreshing the metadata

Star counts, licences and push dates age, so `.github/workflows/refresh-data.yml` reruns the build at 06:00 UTC on the first of every month and commits `data/tools.js` only if something actually moved. Run it by hand from **Actions → Refresh catalogue metadata → Run workflow**.

The check date is stamped automatically from the system clock (`date.today()`), so a scheduled run can never claim an old one. To rebuild a historical snapshot instead:

```bash
TOOLSCOUT_CHECKED=2026-11-17 python3 scripts/build_data.py
```

Nothing on the page claims to be live — it claims to be *checked on a date*, and that date is visible in the header and footer. If the workflow is ever disabled, the site keeps working and simply reports the date of the last real check.

---

## Deploying

Settings → Pages → Source: **Deploy from a branch** → `main` / `/ (root)`.

That is the whole deployment. `.nojekyll` is present so no file is skipped.

---

## Honest limits

- **117 entries is curation, not coverage.** A category missing a tool you rate is a pull request, not a bug.
- **Health bands measure activity, not quality.** A well-maintained project can still be wrong for you.
- **A listing is not a safety review.** Nothing here audits code, permissions or supply chain. Read the issues tab before you install.
- **Star counts are not comparable across ecosystems.** They reward age and one good Hacker News day.
- **Counts and dates are as published on the check date** shown in the footer.

---

## Licence

Code: [MIT](LICENSE). Bundled webfonts: [SIL OFL 1.1](fonts/OFL.txt).

Catalogue text describes third-party software and is provided for reference. Tool names and marks belong to their owners.
