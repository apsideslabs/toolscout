/* ============================================================
   Toolscout — filtering, ranking and rendering
   Data arrives from data/tools.js as window.TOOLSCOUT.
   ============================================================ */
(function () {
  "use strict";

  var DATA = window.TOOLSCOUT;
  if (!DATA || !DATA.rows) {
    document.getElementById("jobs").innerHTML =
      '<p class="empty">Catalogue failed to load. Check that data/tools.js is present.</p>';
    return;
  }

  var FIELDS = DATA.fields || [];
  var RENDER_CAP = 150;

  var TOOLS = (DATA.rows || []).map(function (r) {
    var o = {};
    FIELDS.forEach(function (k, i) { o[k] = r[i]; });
    o.jobs = o.jobs || [];
    o.url = o.url || ("https://github.com/" + o.repo);
    o.detail = !!o.detail;
    o.kind = o.kind || "library";
    o.weight = o.weight || o.stars || 0;
    o.pricing = o.pricing || "";
    return o;
  });
  var JOBS = DATA.jobs || [];
  var TOPICS = DATA.topics || [];
  var CHECKED = DATA.checked;
  var CHECKED_MS = Date.parse(CHECKED + "T00:00:00Z");
  var DAY = 86400000;

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  var JOB_COLOR = {};
  JOBS.forEach(function (j, i) {
    JOB_COLOR[j.id] = ["var(--blue)", "var(--red)", "var(--green)"][i % 3];
  });

  /* the three colours carry meaning: green alive, blue slowing, red stale */
  function signalColor(t) {
    var b = health(t).band;
    if (b === "fresh") return "var(--green)";
    if (b === "slowing") return "var(--blue)";
    if (b === "dead") return "var(--red)";
    return "var(--faint)";
  }

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

  function passesFacets(t) {
    for (var i = 0; i < FACETS.length; i++) {
      var f = FACETS[i];
      if (state.facets[f.id] && !f.test(t)) return false;
    }
    return true;
  }

  function health(t) {
    if (t.kind === "platform") return { band: "platform", label: "Hosted" };
    if (t.archived) return { band: "dead", label: "Archived" };
    if (!t.pushed) return { band: "stale", label: "No repo" };
    var d = daysSince(t.pushed);
    if (d <= 30) return { band: "fresh", label: "Active" };
    if (d <= 365) return { band: "slowing", label: "Slowing" };
    return { band: "dead", label: "Stale" };
  }

  /* ---------------------------------------------------------- facets */

  var FACETS = [
    { id: "active",  label: "Active",    test: function (t) { return health(t).band === "fresh"; } },
    { id: "popular", label: "10k+ stars", test: function (t) { return (t.stars || 0) >= 10000; } },
    { id: "ts",      label: "TypeScript", test: function (t) { return t.lang === "TypeScript"; } },
    { id: "py",      label: "Python",     test: function (t) { return t.lang === "Python"; } },
    { id: "go",      label: "Go",         test: function (t) { return t.lang === "Go"; } },
    { id: "rust",    label: "Rust",       test: function (t) { return t.lang === "Rust"; } },
    { id: "platform", label: "Hosted platform", test: function (t) { return t.kind === "platform"; } }
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
    { re: /edit (a )?(video|image|photo|audio)|video edit|photo edit|remove background|upscale|transcri|voiceover|dub|subtitle|generate (an? )?(image|video|voice)|music|thumbnail|3d model/i, jobs: ["media"] },
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
      tags: "",
      tagline: (t.tagline || "").toLowerCase(),
      note: (t.note || "").toLowerCase(),
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
    var noQuery = !toks.length && !(intents && intents.length);
    if (noQuery) return { score: 1, hits: 0 };

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

    /* popularity only breaks ties between real matches — never creates one */
    /* for a "what should I use" query the hosted platform is usually the
       answer; libraries are the do-it-yourself route */
    if (t.kind === "platform" && total > 0) total += 14;

    var pop = t.weight || t.stars || 0;
    if (total > 0 && pop) {
      total += Math.min(10, Math.log(pop + 1) / Math.LN10 * 1.6);
    }
    return { score: total, hits: hits };
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
      return '<button class="tag ts-chip" type="button" data-facet="' + f.id +
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
    var byTopic = {};
    JOBS.forEach(function (jb) {
      (byTopic[jb.topic] = byTopic[jb.topic] || []).push(jb);
    });

    jobsEl.innerHTML = TOPICS.map(function (tp) {
      var subs = byTopic[tp.id] || [];
      if (!subs.length) return "";
      var cards = subs.map(function (jb) {
        var i = JOBS.indexOf(jb);
        var on = state.job === jb.id;
        return '<a class="job" href="jobs/' + jb.id + '.html" data-job="' + jb.id + '"' +
          ' aria-pressed="' + (on ? "true" : "false") + '"' +
          ' style="--job-c:' + JOB_COLOR[jb.id] + '">' +
          '<span class="job__n">' + (i + 1 < 10 ? "0" : "") + (i + 1) + "</span>" +
          '<span class="job__t">' + esc(jb.title) + "</span>" +
          '<span class="job__tools">' + esc(samples(jb.id)) + "</span>" +
          '<span class="job__c">' + jobCount(jb.id) + " tools</span>" +
          "</a>";
      }).join("");

      return '<div class="topic">' +
        '<div class="topic__head">' +
          '<h3 class="topic__title">' + esc(tp.title) + "</h3>" +
          '<p class="topic__blurb">' + esc(tp.blurb) + "</p>" +
        "</div>" +
        '<div class="jobs">' + cards + "</div>" +
        "</div>";
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

    return '<li class="tool" data-health="' + h.band + '" data-id="' + esc(t.id) + '">' +
      '<div class="tool__cell">' +
        '<h3 class="tool__name"><a href="' +
          (t.detail ? "tools/" + esc(t.id) + ".html" : esc(t.url)) + '"' +
          (t.detail ? "" : ' target="_blank" rel="noopener"') + ">" +
          highlight(t.name, toks) + "</a></h3>" +
        '<span class="tool__kind">' + esc(t.kind === "platform" ? "Platform" : (t.lang || "Library")) + "</span>" +
      "</div>" +
      '<p class="tool__tag">' + highlight(t.tagline, toks) + "</p>" +
      '<dl class="tool__meta">' +
        "<div><dt>Licence</dt><dd>" + esc(fmtLicence(t.licence)) + "</dd></div>" +
        "<div><dt>" + (t.kind === "platform" ? "Pricing" : "Stars") + "</dt><dd>" +
          esc(t.kind === "platform" ? (t.pricing || "—") : fmtStars(t.stars)) + "</dd></div>" +
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
      return;
    }

    var rows = select();
    var toks = tokens(state.q);
    /* painting thousands of rows janks the browser; show the best 150 */
    var shown = rows.slice(0, RENDER_CAP);
    toolsEl.innerHTML = shown.map(function (r) { return toolRow(r.t, toks); }).join("");
    emptyEl.hidden = rows.length > 0;
    if (!rows.length) renderSuggestions();

    var total = TOOLS.length;
    countEl.innerHTML = "<b>" + rows.length + "</b> of " + total +
      " tools" + (describe() ? " — " + esc(describe()) : "") +
      (rows.length > shown.length
        ? " · showing the first " + shown.length + ", narrow the search for more"
        : "");
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

  document.addEventListener("keydown", function (e) {
    var tag = (e.target && e.target.tagName) || "";
    if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });

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

  /* ------------------------------------------------------ hero panel */

  function renderTop() {
    var el = document.getElementById("topList");
    if (!el) return;
    var top = TOOLS.slice().sort(function (a, b) {
      return (b.stars || 0) - (a.stars || 0);
    }).slice(0, 5);
    var max = top.length ? (top[0].stars || 1) : 1;

    el.innerHTML = top.map(function (t, i) {
      var band = health(t).band;
      var pct = Math.max(6, Math.round(((t.stars || 0) / max) * 100));
      return '<li class="panel__row">' +
        '<a class="panel__link" href="' + (t.detail ? "tools/" + esc(t.id) + ".html" : esc(t.url)) + '"' +
          (t.detail ? "" : ' target="_blank" rel="noopener"') + ">" +
          '<span class="panel__n">' + (i + 1) + "</span>" +
          '<span class="panel__name">' + esc(t.name) + "</span>" +
          '<span class="panel__stars">' + esc(fmtStars(t.stars)) + "</span>" +
        "</a>" +
        '<span class="panel__bar" data-band="' + band + '" style="--w:' + pct + '%"></span>' +
        "</li>";
    }).join("");
  }

  /* -------------------------------------------------- recently updated */

  function renderRecent() {
    var el = document.getElementById("recentGrid");
    if (!el) return;
    var recent = TOOLS.slice().sort(function (a, b) {
      return String(b.pushed || "").localeCompare(String(a.pushed || ""));
    }).slice(0, 6);

    el.innerHTML = recent.map(function (t) {
      var h = health(t);
      var band = h.band === "stale" ? "muted" : h.band;
      return '<a class="rcard" href="tools/' + esc(t.id) + '.html">' +
        '<span class="rcard__name">' + esc(t.name) + "</span>" +
        '<span class="rcard__tag">' + esc(t.tagline) + "</span>" +
        '<span class="rcard__meta">' +
          '<span class="stamp stamp--' + band + '">' + esc(h.label) + "</span>" +
          "<span>" + esc(fmtDate(t.pushed)) + "</span>" +
        "</span>" +
        "</a>";
    }).join("");
  }

  /* ---------------------------------------------------------- boot */

  var withRepo = TOOLS.filter(function (t) { return !!t.repo; }).length;
  var hc = document.getElementById("heroCount");
  if (hc) hc.textContent = TOOLS.length.toLocaleString("en-IN");
  document.getElementById("mastheadNote").textContent =
    TOOLS.length.toLocaleString("en-IN") + " tools · " + TOPICS.length +
    " topics · " + JOBS.length + " subtopics · checked " + fmtDate(CHECKED);

  var setText = function (id, v) {
    var el = document.getElementById(id);
    if (el) el.textContent = v;
  };
  setText("statTools", TOOLS.length);
  setText("statJobs", JOBS.length);
  setText("statRepos", TOOLS.filter(function (t) { return health(t).band === "fresh"; }).length);
  setText("statDate", fmtDate(CHECKED));
  setText("indexMeta", TOOLS.length.toLocaleString("en-IN") + " tools across " +
    TOPICS.length + " topics and " + JOBS.length + " subtopics");
  setText("coloDate", fmtDate(CHECKED));
  document.getElementById("footData").textContent =
    TOOLS.length + " tools · " + JOBS.length + " jobs · checked " + fmtDate(CHECKED);

  if (window.matchMedia && window.matchMedia("(max-width: 560px)").matches) {
    input.placeholder = "what are you trying to do?";
  }

  renderRecent();
  renderTop();

  readURL();
  input.value = state.q;
  sortEl.value = state.sort;
  if (hint && state.q) hint.textContent = "Matching on intent, name, job, tag and trade-off text.";
  render();
})();
