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

  var JOB_BY_ID = {};
  JOBS.forEach(function (j) { JOB_BY_ID[j.id] = j; });

  /* ---------------------------------------------------------- helpers */

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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

  function score(t, toks) {
    if (!toks.length) return { score: 1, hits: 0 };
    var h = HAY[t.id], total = 0, hits = 0;
    for (var i = 0; i < toks.length; i++) {
      var k = toks[i], s = 0;
      if (h.name.indexOf(k) === 0) s += 10;
      else if (h.name.indexOf(k) > -1) s += 7;
      if (h.tags.indexOf(k) > -1) s += 4;
      if (h.jobs.indexOf(k) > -1) s += 3;
      if (h.tagline.indexOf(k) > -1) s += 3;
      if (h.note.indexOf(k) > -1) s += 1;
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
    var toks = tokens(state.q);
    var rows = [];

    TOOLS.forEach(function (t) {
      if (state.job && t.jobs.indexOf(state.job) === -1) return;
      if (!passesFacets(t)) return;
      var sc = score(t, toks);
      if (toks.length && sc.score < 2) return;
      rows.push({ t: t, score: sc.score, hits: sc.hits });
    });

    var sort = state.sort;
    if (sort === "relevance" && !toks.length) sort = "name";

    rows.sort(function (a, b) {
      if (sort === "relevance") {
        if (b.hits !== a.hits) return b.hits - a.hits;
        if (b.score !== a.score) return b.score - a.score;
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
      return '<button class="chip" type="button" data-facet="' + f.id + '" aria-pressed="' +
        (state.facets[f.id] ? "true" : "false") + '">' + esc(f.label) +
        '<span class="chip__n">' + n + "</span></button>";
    }).join("");
  }

  /* ---------------------------------------------------------- render: jobs */

  var jobsEl = document.getElementById("jobs");

  function jobCount(id) {
    return TOOLS.filter(function (t) { return t.jobs.indexOf(id) > -1; }).length;
  }

  function renderJobs() {
    jobsEl.innerHTML = JOBS.map(function (j, i) {
      var n = String(i + 1).padStart(2, "0");
      return '<button class="job" type="button" data-job="' + j.id + '"' +
        (state.job === j.id ? ' aria-current="true"' : "") + ">" +
        '<span class="job__n">' + n + "</span>" +
        '<span class="job__t">' + esc(j.title) + "</span>" +
        '<span class="job__b">' + esc(j.blurb) + "</span>" +
        '<span class="job__c">' + jobCount(j.id) + " tools</span>" +
        "</button>";
    }).join("");
  }

  /* ---------------------------------------------------------- render: tools */

  var toolsEl = document.getElementById("tools");
  var resultsEl = document.getElementById("results");
  var emptyEl = document.getElementById("empty");
  var countEl = document.getElementById("resultCount");
  var browseTitle = document.getElementById("browseTitle");
  var indexHead = document.getElementById("indexHead");

  function toolRow(t) {
    var h = health(t);
    var flags = [];
    if (t.archived) flags.push('<span class="flag flag--warn">Repository archived</span>');
    if (t.selfhost) flags.push('<span class="flag">Self-hostable</span>');
    if (isOpen(t)) flags.push('<span class="flag">' + esc(fmtLicence(t.licence)) + "</span>");
    if (t.lang) flags.push('<span class="flag">' + esc(t.lang) + "</span>");

    var costLabel = t.cost === "free" ? "Free / OSS"
      : t.cost === "freemium" ? "Freemium" : "Paid";

    var healthClass = h.band === "fresh" ? "is-healthy"
      : h.band === "slowing" ? "is-slowing"
      : h.band === "dead" ? "is-dead" : "is-muted";

    return '<li class="tool" data-health="' + h.band + '">' +
      '<div class="tool__body">' +
        '<h3 class="tool__name"><a href="' + esc(t.url) + '" target="_blank" rel="noopener">' +
          esc(t.name) + "</a></h3>" +
        '<p class="tool__tag">' + esc(t.tagline) + "</p>" +
        '<p class="tool__note"><span>Trade-off</span>' + esc(t.note) + "</p>" +
        (flags.length ? '<div class="tool__flags">' + flags.join("") + "</div>" : "") +
      "</div>" +
      '<dl class="tool__meta">' +
        "<div><dt>Licence</dt><dd>" + esc(fmtLicence(t.licence)) + "</dd></div>" +
        "<div><dt>Cost</dt><dd>" + esc(costLabel) + "</dd></div>" +
        "<div><dt>Updated</dt><dd>" + esc(fmtDate(t.pushed)) + "</dd></div>" +
        "<div><dt>Stars</dt><dd>" + esc(fmtStars(t.stars)) + "</dd></div>" +
        "<div><dt>Signal</dt><dd class=\"" + healthClass + '">' + esc(h.label) + "</dd></div>" +
        "<div><dt>Type</dt><dd>" + esc(KIND[t.kind] || t.kind) + "</dd></div>" +
      "</dl>" +
      "</li>";
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
    toolsEl.innerHTML = rows.map(function (r) { return toolRow(r.t); }).join("");
    emptyEl.hidden = rows.length > 0;

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

  jobsEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-job]");
    if (!b) return;
    var id = b.getAttribute("data-job");
    state.job = state.job === id ? "" : id;
    apply();
    if (state.job) {
      document.getElementById("results").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  sortEl.addEventListener("change", function () {
    state.sort = sortEl.value;
    apply();
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

  /* ---------------------------------------------------------- boot */

  var withRepo = TOOLS.filter(function (t) { return !!t.repo; }).length;
  document.getElementById("mastheadNote").textContent =
    TOOLS.length + " tools · " + JOBS.length + " jobs · " +
    withRepo + " with live repo data · checked " + fmtDate(CHECKED);
  document.getElementById("footData").textContent =
    withRepo + " of " + TOOLS.length + " entries carry metadata read from the GitHub API on " +
    fmtDate(CHECKED) + ". Counts are as published on that date.";

  if (window.matchMedia && window.matchMedia("(max-width: 560px)").matches) {
    input.placeholder = "what are you trying to do?";
  }

  readURL();
  input.value = state.q;
  sortEl.value = state.sort;
  if (state.q) hint.textContent = "Matching on name, job, tag and trade-off text.";
  render();
})();
