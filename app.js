/* ============================================================
   Toolscout — filtering, ranking and rendering
   Data arrives from data/tools.js as window.TOOLSCOUT.
   ============================================================ */
(function () {
  "use strict";

  var DATA = window.TOOLSCOUT;
  if (!DATA || !DATA.tools) {
    document.getElementById("jobs").innerHTML =
      '<p class="empty">Catalogue failed to load. Check that data/tools.js is present.</p>';
    return;
  }

  var TOOLS = DATA.tools;
  var JOBS = DATA.jobs;
  var CHECKED = DATA.checked;
  var CHECKED_MS = Date.parse(CHECKED + "T00:00:00Z");
  var DAY = 86400000;

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  var PALETTE = ["blue", "purple", "teal", "magenta", "red", "green",
                 "cyan", "cool-gray", "blue", "purple", "teal", "magenta",
                 "red", "green", "cyan", "cool-gray", "blue"];

  var JOB_COLOR = {};
  JOBS.forEach(function (j, i) {
    JOB_COLOR[j.id] = "var(--cds-tag-color-" + PALETTE[i % PALETTE.length] + ")";
  });

  var JOB_BY_ID = {};
  JOBS.forEach(function (j) { JOB_BY_ID[j.id] = j; });

  /* ---------------------------------------------------------- helpers */

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /* wrap matched query terms in <mark>, escaping every fragment */
  function highlight(text, toks) {
    var s = String(text == null ? "" : text);
    if (!toks || !toks.length) return esc(s);
    var re = new RegExp("(" + toks.map(escapeRe).join("|") + ")", "gi");
    return s.split(re).map(function (part, i) {
      return i % 2 ? "<mark>" + esc(part) + "</mark>" : esc(part);
    }).join("");
  }

  function daysSince(iso) {
    if (!iso) return Infinity;
    return Math.round((CHECKED_MS - Date.parse(iso + "T00:00:00Z")) / DAY);
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    var p = iso.split("-");
    return Number(p[2]) + " " + MONTHS[Number(p[1]) - 1] + " " + p[0];
  }

  function fmtStars(n) {
    if (!n && n !== 0) return "—";
    if (n >= 100000) return (n / 1000).toFixed(0) + "k";
    if (n >= 1000) {
      var k = (n / 1000).toFixed(1);
      return (k.slice(-2) === ".0" ? k.slice(0, -2) : k) + "k";
    }
    return String(n);
  }

  function fmtLicence(l) {
    if (!l || l === "NOASSERTION") return "Custom";
    if (l === "Unknown") return "Unclear";
    return l;
  }

  var KIND = { library: "Library", service: "Service", app: "App", cli: "CLI" };
  var PROPRIETARY = { Proprietary: 1, Unknown: 1, NOASSERTION: 1, Unclear: 1, Custom: 1 };
  function isOpen(t) { return !PROPRIETARY[fmtLicence(t.licence)]; }

  function health(t) {
    if (t.archived) return { band: "dead", label: "Archived" };
    if (!t.pushed) return { band: "stale", label: "No repo" };
    var d = daysSince(t.pushed);
    if (d <= 30) return { band: "fresh", label: "Active" };
    if (d <= 365) return { band: "slowing", label: "Slowing" };
    return { band: "dead", label: "Stale" };
  }

  /* ---------------------------------------------------------- facets */

  var FACETS = [
    { id: "free",     label: "Free tier",     test: function (t) { return t.cost === "free" || t.cost === "freemium"; } },
    { id: "oss",      label: "Open source",   test: isOpen },
    { id: "selfhost", label: "Self-hostable", test: function (t) { return !!t.selfhost; } },
    { id: "active",   label: "Active",        test: function (t) { return health(t).band === "fresh"; } },
    { id: "library",  label: "Library",       test: function (t) { return t.kind === "library"; } },
    { id: "service",  label: "Service",       test: function (t) { return t.kind === "service"; } },
    { id: "app",      label: "App",           test: function (t) { return t.kind === "app"; } },
    { id: "cli",      label: "CLI",           test: function (t) { return t.kind === "cli"; } }
  ];
  var FACET_BY_ID = {};
  FACETS.forEach(function (f) { FACET_BY_ID[f.id] = f; });

  /* ---------------------------------------------------------- state */

  var state = { q: "", job: "", facets: {}, sort: "relevance" };

  function readURL() {
    var p = new URLSearchParams(location.search);
    state.q = p.get("q") || "";
    var j = p.get("job") || "";
    state.job = JOB_BY_ID[j] ? j : "";
    state.sort = ["relevance", "health", "stars", "name"].indexOf(p.get("sort")) > -1
      ? p.get("sort") : "relevance";
    (p.get("f") || "").split(",").forEach(function (id) {
      if (FACET_BY_ID[id]) state.facets[id] = true;
    });
  }

  function writeURL() {
    var p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    if (state.job) p.set("job", state.job);
    var f = Object.keys(state.facets);
    if (f.length) p.set("f", f.join(","));
    if (state.sort !== "relevance") p.set("sort", state.sort);
    var qs = p.toString();
    history.replaceState(null, "", qs ? "?" + qs : location.pathname);
  }

  function isFiltering() {
    return !!state.q || !!state.job || Object.keys(state.facets).length > 0;
  }

  /* ---------------------------------------------------------- search */

  var STOP = ("a an the and or for to of in on at with without my me i we need want " +
    "some something that this is are be can how do does it its from by as no not " +
    "you your our there here what which who when where why tool tools app apps").split(" ");

  /* People do not search in our vocabulary. Map their phrasing to jobs. */
  var INTENTS = [
    { re: /log ?in|sign ?in|sign ?up|auth|sso|oauth|password|account|session/i, jobs: ["auth"] },
    { re: /email|mail|newsletter|notif/i, jobs: ["email"] },
    { re: /pay|billing|checkout|subscri|invoice|money|stripe|razorpay/i, jobs: ["payments"] },
    { re: /database|store (data|stuff)|persist|sql|query|table|schema/i, jobs: ["database"] },
    { re: /deploy|host|ship|production|server|vps|container|docker/i, jobs: ["deploy"] },
    { re: /monitor|observ|metric|trace|logging|\blogs?\b(?!\s*in\b)|uptime|error track|alert/i, jobs: ["observe"] },
    { re: /ci|pipeline|automat.*test|build.*test|continuous/i, jobs: ["ci"] },
    { re: /search|find|typo|relevance|autocomplete/i, jobs: ["search"] },
    { re: /upload|file|image|media|storage|cdn|asset/i, jobs: ["files"] },
    { re: /ai|llm|model|gpt|claude|chatbot|embedding|vector|prompt/i, jobs: ["ai"] },
    { re: /docs|documentation|api reference|manual/i, jobs: ["docs"] },
    { re: /design|prototype|mockup|icon|wireframe|figma/i, jobs: ["design"] },
    { re: /editor|ide|vim|code editor|lint|format/i, jobs: ["editor"] },
    { re: /terminal|shell|command line|cli|prompt/i, jobs: ["terminal"] },
    { re: /ui|front ?end|react|component|css|landing page|website|site/i, jobs: ["frontend"] },
    { re: /api|rest|graphql|endpoint|openapi|webhook/i, jobs: ["api", "automate"] },
    { re: /background job|queue|cron|job runner|retry|workflow/i, jobs: ["automate"] }
  ];

  var SYNONYMS = {
    login: ["auth", "sso"], signin: ["auth"], signup: ["auth"],
    mail: ["email"], emails: ["email"], newsletter: ["email"],
    db: ["database"], postgres: ["database"], sql: ["database"],
    host: ["deploy"], hosting: ["deploy"], server: ["deploy"], prod: ["deploy"],
    monitoring: ["observe"], logs: ["observe"], metrics: ["observe"],
    tests: ["ci"], testing: ["ci", "api"],
    files: ["files"], uploads: ["files"], images: ["files"],
    llm: ["ai"], gpt: ["ai"], chatbot: ["ai"],
    docs: ["docs"], documentation: ["docs"],
    money: ["payments"], billing: ["payments"], checkout: ["payments"],
    ui: ["frontend"], website: ["frontend"], site: ["frontend"]
  };

  function expand(toks) {
    var out = toks.slice();
    toks.forEach(function (t) {
      var s = t.replace(/s$/, "");
      if (SYNONYMS[t]) out = out.concat(SYNONYMS[t]);
      else if (SYNONYMS[s]) out = out.concat(SYNONYMS[s]);
    });
    return out.filter(function (v, i, a) { return a.indexOf(v) === i; });
  }

  function intentsFor(q) {
    var hit = [];
    INTENTS.forEach(function (it) { if (it.re.test(q)) hit = hit.concat(it.jobs); });
    return hit.filter(function (v, i, a) { return a.indexOf(v) === i; });
  }

  function tokens(q) {
    return q.toLowerCase().split(/[^a-z0-9+.#-]+/).filter(function (w) {
      return w.length > 1 && STOP.indexOf(w) === -1;
    });
  }

  function haystack(t) {
    return {
      name: t.name.toLowerCase(),
      tags: t.tags.join(" ").toLowerCase(),
      tagline: t.tagline.toLowerCase(),
      note: t.note.toLowerCase(),
      jobs: t.jobs.map(function (id) {
        return (JOB_BY_ID[id] ? JOB_BY_ID[id].title + " " + JOB_BY_ID[id].blurb : id);
      }).join(" ").toLowerCase()
    };
  }

  var HAY = {};
  TOOLS.forEach(function (t) { HAY[t.id] = haystack(t); });

  function wordPrefixMatch(hay, k) {
    /* "deploy" should find "deployment"; "postgres" should find "PostgreSQL" */
    if (k.length < 4) return false;
    return hay.indexOf(k) > -1;
  }

  function score(t, toks, intents) {
    if (!toks.length && !(intents && intents.length)) return { score: 1, hits: 0 };
    var h = HAY[t.id], total = 0, hits = 0;
    if (intents && intents.length) {
      /* intent must outrank stray word hits: "log in" should not surface
         a tool that merely says "logs" in its tagline */
      intents.forEach(function (jid) {
        if (t.jobs.indexOf(jid) > -1) total += 30;
        if (t.jobs[0] === jid) total += 12;
      });
    }
    for (var i = 0; i < toks.length; i++) {
      var k = toks[i], s = 0;
      if (h.name.indexOf(k) === 0) s += 10;
      else if (h.name.indexOf(k) > -1) s += 7;
      if (h.tags.indexOf(k) > -1) s += 4;
      if (h.jobs.indexOf(k) > -1) s += 3;
      if (h.tagline.indexOf(k) > -1) s += 3;
      if (h.note.indexOf(k) > -1) s += 1;
      if (!s && wordPrefixMatch(h.name, k)) s += 5;
      if (s > 0) hits++;
      total += s;
    }
    return { score: total, hits: hits };
  }

  /* ---------------------------------------------------------- filtering */

  function passesFacets(t) {
    for (var id in state.facets) {
      if (state.facets[id] && !FACET_BY_ID[id].test(t)) return false;
    }
    return true;
  }

  function select() {
    var raw = tokens(state.q);
    var toks = expand(raw);
    var intents = intentsFor(state.q);
    var rows = [];

    TOOLS.forEach(function (t) {
      if (state.job && t.jobs.indexOf(state.job) === -1) return;
      if (!passesFacets(t)) return;
      var sc = score(t, toks, intents);
      if ((raw.length || intents.length) && sc.score < 2) return;
      rows.push({ t: t, score: sc.score, hits: sc.hits });
    });

    var sort = state.sort;
    if (sort === "relevance" && !toks.length) sort = "name";

    rows.sort(function (a, b) {
      if (sort === "relevance") {
        if (b.score !== a.score) return b.score - a.score;
        if (b.hits !== a.hits) return b.hits - a.hits;
        return a.t.name.localeCompare(b.t.name);
      }
      if (sort === "health") {
        var da = a.t.pushed ? daysSince(a.t.pushed) : 1e9;
        var db = b.t.pushed ? daysSince(b.t.pushed) : 1e9;
        return da - db;
      }
      if (sort === "stars") return (b.t.stars || 0) - (a.t.stars || 0);
      return a.t.name.localeCompare(b.t.name);
    });

    return rows;
  }

  /* ---------------------------------------------------------- render: facets */

  var facetsEl = document.getElementById("facets");

  function renderFacets() {
    facetsEl.innerHTML = FACETS.map(function (f) {
      var n = TOOLS.filter(f.test).length;
      return '<button class="cds--tag ts-chip" type="button" data-facet="' + f.id +
        '" aria-pressed="' + (state.facets[f.id] ? "true" : "false") + '">' +
        esc(f.label) + '<span class="ts-chip__n">' + n + "</span></button>";
    }).join("");
  }

  /* ---------------------------------------------------------- render: jobs */

  var jobsEl = document.getElementById("jobs");

  function jobCount(id) {
    return TOOLS.filter(function (t) { return t.jobs.indexOf(id) > -1; }).length;
  }

  function samples(id) {
    return TOOLS.filter(function (t) { return t.jobs.indexOf(id) > -1; })
      .sort(function (a, b) { return (b.stars || 0) - (a.stars || 0); })
      .slice(0, 3)
      .map(function (t) { return t.name; })
      .join(" · ");
  }

  function renderJobs() {
    jobsEl.innerHTML = JOBS.map(function (j, i) {
      var n = String(i + 1).padStart(2, "0");
      var on = state.job === j.id;
      return '<a class="job" href="jobs/' + j.id + '.html" data-job="' + j.id + '"' +
        ' aria-pressed="' + (on ? "true" : "false") + '"' +
        ' style="--job-c:' + JOB_COLOR[j.id] + '"' +
        (on ? ' aria-current="true"' : "") + ">" +
        '<span class="job__n">' + n + "</span>" +
        '<span class="job__t">' + esc(j.title) + "</span>" +
        '<span class="job__tools">' + esc(samples(j.id)) + "</span>" +
        '<span class="job__c">' + jobCount(j.id) + " tools</span>" +
        "</a>";
    }).join("");
  }

  /* ---------------------------------------------------------- render: tools */

  var toolsEl = document.getElementById("tools");
  var resultsEl = document.getElementById("results");
  var emptyEl = document.getElementById("empty");
  var countEl = document.getElementById("resultCount");
  var browseTitle = document.getElementById("browseTitle");
  var indexHead = document.getElementById("indexHead");

  function toolRow(t, toks) {
    var h = health(t);
    var band = h.band === "stale" ? "muted" : h.band;

    return '<li class="tool" data-health="' + h.band + '">' +
      '<div class="tool__cell">' +
        '<h3 class="tool__name"><a href="tools/' + esc(t.id) + '.html">' +
          highlight(t.name, toks) + "</a></h3>" +
        '<span class="tool__kind">' + esc(KIND[t.kind] || t.kind) + "</span>" +
      "</div>" +
      '<p class="tool__tag">' + highlight(t.tagline, toks) + "</p>" +
      '<dl class="tool__meta">' +
        "<div><dt>Licence</dt><dd>" + esc(fmtLicence(t.licence)) + "</dd></div>" +
        "<div><dt>Updated</dt><dd>" + esc(fmtDate(t.pushed)) + "</dd></div>" +
        "<div><dt>Signal</dt><dd><span class=\"stamp stamp--" + band + "\">" +
          esc(h.label) + "</span></dd></div>" +
      "</dl>" +
      "</li>";
  }

  var SUGGESTIONS = ["log in", "send email", "take payments", "store data",
                     "deploy", "monitoring", "open source", "self-hostable"];

  function renderSuggestions() {
    var row = document.getElementById("suggestRow");
    if (!row) return;
    row.innerHTML = SUGGESTIONS.map(function (s) {
      return '<button class="suggest" type="button" data-suggest="' + esc(s) + '">' +
        esc(s) + "</button>";
    }).join("");
  }

  function describe() {
    var bits = [];
    if (state.q) bits.push('“' + state.q + '”');
    if (state.job) bits.push(JOB_BY_ID[state.job].title.toLowerCase());
    Object.keys(state.facets).forEach(function (id) {
      bits.push(FACET_BY_ID[id].label.toLowerCase());
    });
    return bits.join(" · ");
  }

  function render() {
    var filtering = isFiltering();
    resultsEl.hidden = !filtering;
    jobsEl.hidden = filtering;
    browseTitle.hidden = filtering;
    indexHead.hidden = filtering;

    renderFacets();
    renderJobs();

    if (!filtering) {
      countEl.textContent = "";
      toolsEl.innerHTML = "";
      emptyEl.hidden = true;
      paintMatrix(null);
      return;
    }

    var rows = select();
    var toks = tokens(state.q);
    toolsEl.innerHTML = rows.map(function (r) { return toolRow(r.t, toks); }).join("");
    emptyEl.hidden = rows.length > 0;
    if (!rows.length) renderSuggestions();
    paintMatrix(rows.map(function (r) { return r.t; }));

    var total = TOOLS.length;
    countEl.innerHTML = "<b>" + rows.length + "</b> of " + total +
      " tools" + (describe() ? " — " + esc(describe()) : "");
  }

  /* ---------------------------------------------------------- wiring */

  var input = document.getElementById("q");
  var hint = document.getElementById("needHint");
  var sortEl = document.getElementById("sort");

  function apply() {
    writeURL();
    render();
  }

  document.getElementById("need").addEventListener("submit", function (e) {
    e.preventDefault();
    state.q = input.value.trim();
    apply();
    document.getElementById("index").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  var t;
  input.addEventListener("input", function () {
    clearTimeout(t);
    t = setTimeout(function () {
      state.q = input.value.trim();
      apply();
    }, 160);
  });

  facetsEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-facet]");
    if (!b) return;
    var id = b.getAttribute("data-facet");
    if (state.facets[id]) delete state.facets[id];
    else state.facets[id] = true;
    apply();
  });

  sortEl.addEventListener("change", function () {
    state.sort = sortEl.value;
    apply();
  });

  document.addEventListener("click", function (e) {
    var s = e.target.closest("[data-suggest]");
    if (!s) return;
    state.q = s.getAttribute("data-suggest");
    input.value = state.q;
    apply();
  });

  var shareBtn = document.getElementById("share");
  if (shareBtn) {
    shareBtn.addEventListener("click", function () {
      var url = location.href;
      var done = function () {
        shareBtn.textContent = "Copied";
        setTimeout(function () { shareBtn.textContent = "Copy link"; }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, function () { window.prompt("Copy this link", url); });
      } else {
        window.prompt("Copy this link", url);
      }
    });
  }

  document.getElementById("clear").addEventListener("click", function () {
    state.q = "";
    state.job = "";
    state.facets = {};
    input.value = "";
    apply();
    document.getElementById("index").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
      input.select();
    }
    if (e.key === "Escape" && document.activeElement === input) {
      input.value = "";
      state.q = "";
      apply();
      input.blur();
    }
  });

  /* ---------------------------------------------------------- matrix */

  var matrixEl = document.getElementById("matrix");
  var matrixCaption = document.getElementById("matrixCaption");
  var matrixDots = [];

  function renderMatrix() {
    if (!matrixEl) return;
    matrixEl.innerHTML = TOOLS.map(function (t) {
      return '<span data-tool="' + esc(t.id) + '" style="--c:' +
        (JOB_COLOR[t.jobs[0]] || "var(--cds-border-subtle-01)") + '" title="' +
        esc(t.name + " — " + (JOB_BY_ID[t.jobs[0]] ? JOB_BY_ID[t.jobs[0]].title : t.jobs[0])) +
        '"></span>';
    }).join("");
    matrixDots = Array.prototype.slice.call(matrixEl.children);
  }

  function paintMatrix(matches) {
    if (!matrixDots.length) return;
    var on = matches ? new Set(matches.map(function (t) { return t.id; })) : null;
    matrixDots.forEach(function (d) {
      var id = d.getAttribute("data-tool");
      if (!on) {
        d.classList.remove("is-dim", "is-match");
      } else if (on.has(id)) {
        d.classList.remove("is-dim");
        d.classList.add("is-match");
      } else {
        d.classList.remove("is-match");
        d.classList.add("is-dim");
      }
    });
    if (matrixCaption) {
      matrixCaption.textContent = on
        ? matches.length + " of " + TOOLS.length + " tools match"
        : "One square per tool, coloured by job";
    }
  }

  /* ---------------------------------------------------------- boot */

  var withRepo = TOOLS.filter(function (t) { return !!t.repo; }).length;
  document.getElementById("mastheadNote").textContent =
    TOOLS.length + " tools · " + JOBS.length + " jobs · " +
    withRepo + " with live repo data · checked " + fmtDate(CHECKED);

  var setText = function (id, v) {
    var el = document.getElementById(id);
    if (el) el.textContent = v;
  };
  setText("statTools", TOOLS.length);
  setText("statJobs", JOBS.length);
  setText("statRepos", withRepo);
  setText("statDate", fmtDate(CHECKED));
  setText("indexMeta", TOOLS.length + " tools across " + JOBS.length + " jobs");
  setText("coloDate", fmtDate(CHECKED));
  document.getElementById("footData").textContent =
    TOOLS.length + " tools · " + JOBS.length + " jobs · checked " + fmtDate(CHECKED);

  if (window.matchMedia && window.matchMedia("(max-width: 560px)").matches) {
    input.placeholder = "what are you trying to do?";
  }

  renderMatrix();

  readURL();
  input.value = state.q;
  sortEl.value = state.sort;
  if (hint && state.q) hint.textContent = "Matching on intent, name, job, tag and trade-off text.";
  render();
})();
