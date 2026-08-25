/*
 * Shared chrome for every docs/site page: the left module sidebar (with a
 * filter box and active-page highlighting), the mobile nav toggle, and an
 * auto-generated "on this page" jump list for pages with several <h2>
 * sections.
 *
 * Single source of truth for the module list so it doesn't have to be
 * hand-duplicated across 19 static HTML files — edit LAYERS/EXTRAS here and
 * every page picks it up. Pure DOM, no fetch, so it works over plain
 * file:// links with no server.
 *
 * Each page includes this with:
 *   <script src="ROOT/assets/nav.js" data-root="ROOT"></script>
 * where ROOT is "" for docs/site/index.html and "../" for every page one
 * level down (docs/site/<pkg>/index.html, docs/site/examples/index.html,
 * docs/site/tutorials/*.html).
 */
(function () {
  "use strict";

  var scriptEl = document.currentScript;
  var ROOT = (scriptEl && scriptEl.getAttribute("data-root")) || "";

  var LAYERS = [
    { label: "Core data model", mods: [
      ["bw2data", "Projects, activities/exchanges, methods, metadata."]
    ] },
    { label: "Processed data & matrices", mods: [
      ["bw_processing", "On-disk datapackage format for matrix-ready arrays."],
      ["matrix_utils", "Builds datapackages into live scipy sparse matrices."],
      ["bw_graph_tools", "Graph traversal of the technosphere / supply chain."]
    ] },
    { label: "Calculation & analysis", mods: [
      ["bw2calc", "LCA calculation engine: builds & solves the matrices."],
      ["bw2analyzer", "Post-calculation analysis: contribution, comparisons, graphs."],
      ["multifunctional", "Allocation of multi-output (“multifunctional”) processes."]
    ] },
    { label: "Parameters & uncertainty", mods: [
      ["bw2parameters", "Formula/parameter interpreter for parameterized exchanges."],
      ["stats_arrays", "Uncertainty distributions + Monte Carlo RNG."]
    ] },
    { label: "Import / export & interop", mods: [
      ["bw2io", "Import/export: ecoinvent, SimaPro, ecospold, Excel, exiobase, etc."],
      ["bw_simapro_csv", "Low-level SimaPro CSV parser used by bw2io."],
      ["ecoinvent_interface", "Authenticated client for downloading ecoinvent releases."],
      ["bw_migrations", "Curated data migrations used during import."],
      ["randonneur", "Generic “migrate/patch a dataset” engine."],
      ["randonneur_data", "Registry of pre-built randonneur migration datasets."],
      ["mrio_common_metadata", "Shared metadata helpers for MRIO datapackages."]
    ] }
  ];

  var EXTRAS = [
    ["examples", "Examples", ROOT + "examples/index.html"],
    ["tutorials", "Tutorials", ROOT + "tutorials/index.html"]
  ];

  var KNOWN_IDS = {};
  LAYERS.forEach(function (layer) {
    layer.mods.forEach(function (mod) { KNOWN_IDS[mod[0]] = true; });
  });
  EXTRAS.forEach(function (ex) { KNOWN_IDS[ex[0]] = true; });

  function currentId() {
    var path = location.pathname.replace(/\/+$/, "");
    var parts = path.split("/");
    parts.pop(); // filename, e.g. index.html
    var dir = parts.pop();
    return dir && KNOWN_IDS[dir] ? dir : "index";
  }

  function buildSidebar() {
    var nav = document.getElementById("sidebar");
    if (!nav) return;
    var cur = currentId();

    var brand = document.createElement("a");
    brand.className = "brand-mini";
    brand.href = ROOT + "index.html";
    brand.innerHTML = "bright<span>way25</span> code map";
    nav.appendChild(brand);

    var search = document.createElement("input");
    search.type = "search";
    search.className = "nav-search";
    search.placeholder = "Filter modules…";
    search.setAttribute("aria-label", "Filter modules");
    nav.appendChild(search);

    var groupsWrap = document.createElement("div");
    groupsWrap.className = "nav-groups";
    nav.appendChild(groupsWrap);

    var noMatch = document.createElement("p");
    noMatch.className = "no-match";
    noMatch.textContent = "No modules match.";
    noMatch.style.display = "none";
    nav.appendChild(noMatch);

    var entries = [];

    LAYERS.forEach(function (layer) {
      var label = document.createElement("div");
      label.className = "layer-label";
      label.textContent = layer.label;
      groupsWrap.appendChild(label);

      var ul = document.createElement("ul");
      layer.mods.forEach(function (mod) {
        var id = mod[0], desc = mod[1];
        var li = document.createElement("li");
        var a = document.createElement("a");
        a.className = "modlink";
        a.href = ROOT + id + "/index.html";
        a.textContent = id;
        a.title = desc;
        if (id === cur) a.setAttribute("aria-current", "page");
        li.appendChild(a);
        ul.appendChild(li);
        entries.push({ li: li, label: label, search: (id + " " + desc).toLowerCase() });
      });
      groupsWrap.appendChild(ul);
    });

    var extraWrap = document.createElement("div");
    extraWrap.className = "extra-links";
    var extraUl = document.createElement("ul");
    EXTRAS.forEach(function (ex) {
      var id = ex[0], label = ex[1], href = ex[2];
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.className = "modlink";
      a.href = href;
      a.textContent = label;
      if (id === cur) a.setAttribute("aria-current", "page");
      li.appendChild(a);
      extraUl.appendChild(li);
    });
    extraWrap.appendChild(extraUl);
    nav.appendChild(extraWrap);

    search.addEventListener("input", function () {
      var q = search.value.trim().toLowerCase();
      var visibleLayers = {};
      var anyVisible = false;
      entries.forEach(function (entry) {
        var match = !q || entry.search.indexOf(q) !== -1;
        entry.li.style.display = match ? "" : "none";
        if (match) {
          visibleLayers[entry.label.textContent] = true;
          anyVisible = true;
        }
      });
      groupsWrap.querySelectorAll(".layer-label").forEach(function (l) {
        l.style.display = visibleLayers[l.textContent] ? "" : "none";
        l.nextElementSibling.style.display = visibleLayers[l.textContent] ? "" : "none";
      });
      noMatch.style.display = anyVisible ? "none" : "";
    });
  }

  function buildToggle() {
    var btn = document.getElementById("navToggle");
    var sidebar = document.getElementById("sidebar");
    if (!btn || !sidebar) return;
    btn.addEventListener("click", function () {
      var open = sidebar.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("click", function (e) {
      if (sidebar.classList.contains("open") && !sidebar.contains(e.target) && e.target !== btn) {
        sidebar.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && sidebar.classList.contains("open")) {
        sidebar.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
      }
    });
  }

  // Kept in sync with the id scheme baked statically into every h2-h6 in
  // docs/site/**/*.html (all handwritten pages already carry these ids in
  // the committed markup — Pagefind crawls the static HTML at build time,
  // never runs this script, so ids added only at runtime here would be
  // invisible to it; see assets/search.js's sub-result anchor note). This
  // function's own `if (!h.id)` below only still fires for a heading some
  // page hasn't been given a static id for yet.
  function slugify(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  // Auto-build a small "on this page" pill list from a page's own <h2>
  // sections, inserted right before the first one. Only worth it once a
  // page has enough sections to be worth jumping around in.
  function buildPageToc() {
    var wrap = document.querySelector(".content > div.wrap");
    if (!wrap) return;
    var heads = wrap.querySelectorAll("h2");
    if (heads.length < 3) return;

    var toc = document.createElement("nav");
    toc.className = "pagetoc";
    toc.setAttribute("aria-label", "On this page");

    var jump = document.createElement("span");
    jump.className = "pagetoc-label";
    jump.textContent = "On this page:";
    toc.appendChild(jump);

    heads.forEach(function (h) {
      if (!h.id) h.id = slugify(h.textContent);
      var a = document.createElement("a");
      a.href = "#" + h.id;
      a.textContent = h.textContent;
      toc.appendChild(a);
    });

    heads[0].parentNode.insertBefore(toc, heads[0]);
  }

  // Which modules have their own section on the site-wide Examples page —
  // kept in step with the <h2 id="..."> anchors on examples/index.html.
  // Update this alongside that page as more modules get worked examples.
  var HAS_EXAMPLES = { bw2data: true };

  // Tutorials indexed by the module id they're about — extend this as more
  // tutorials are added (each module page picks up its own automatically).
  var TUTORIALS = {
    bw2data: [
      ["Create an empty database", "tutorials/create-empty-database.html"],
      ["Scope a study and assess it across several impact categories", "tutorials/scope-and-multi-category-impacts.html"]
    ],
    bw2analyzer: [["Find an LCA result's biggest contributors", "tutorials/contribution-analysis.html"]],
    bw2calc: [
      ["Run a Monte Carlo uncertainty analysis", "tutorials/monte-carlo-uncertainty.html"],
      ["Scope a study and assess it across several impact categories", "tutorials/scope-and-multi-category-impacts.html"]
    ],
    stats_arrays: [["Run a Monte Carlo uncertainty analysis", "tutorials/monte-carlo-uncertainty.html"]],
    multifunctional: [["Allocate a multifunctional process", "tutorials/multifunctional-allocation.html"]],
    bw_migrations: [["Migrate/relink data with bw_migrations", "tutorials/migrating-data-with-bw-migrations.html"]]
  };

  // Every module page gets the same cross-link strip right under its <h1>:
  // the generated API reference for this exact package, this package's
  // section on the site-wide Examples page (if it has one), and any
  // tutorials about it. Keeps API docs / handwritten map / examples
  // reachable from each other in one click, without hand-adding the same
  // links to every module page.
  function buildResourceToolbar() {
    var id = currentId();
    if (!(id in KNOWN_IDS) || id === "examples" || id === "tutorials") return;
    var wrap = document.querySelector(".content > div.wrap");
    if (!wrap) return;
    var h1 = wrap.querySelector("h1");
    if (!h1) return;

    var links = [["API reference →", ROOT + "api/" + id + "/index.html"]];
    if (HAS_EXAMPLES[id]) links.push(["Examples →", ROOT + "examples/index.html#" + id]);
    (TUTORIALS[id] || []).forEach(function (t) {
      links.push([t[0] + " →", ROOT + t[1]]);
    });

    var bar = document.createElement("nav");
    bar.className = "pagetoc";
    bar.setAttribute("aria-label", "This module's docs");
    links.forEach(function (l) {
      var a = document.createElement("a");
      a.href = l[1];
      a.textContent = l[0];
      bar.appendChild(a);
    });

    h1.parentNode.insertBefore(bar, h1.nextSibling);
  }

  // Site-wide search box (assets/search.js, backed by the Pagefind index
  // from docs/build_search_index.sh). Loaded dynamically here rather than
  // hand-added to every page's <script> tags, same reasoning as everything
  // else in this file — one place to edit for all pages.
  function loadSearch() {
    if (document.querySelector('script[src$="assets/search.js"]')) return;
    var s = document.createElement("script");
    s.src = ROOT + "assets/search.js";
    s.setAttribute("data-root", ROOT);
    document.body.appendChild(s);
  }

  document.addEventListener("DOMContentLoaded", function () {
    buildSidebar();
    buildToggle();
    buildResourceToolbar();
    buildPageToc();
    loadSearch();
  });
})();
