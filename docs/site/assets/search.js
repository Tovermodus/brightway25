/*
 * Site-wide search box, backed by a Pagefind (https://pagefind.app) index
 * built from docs/site/ by docs/build_search_index.sh. Covers all three
 * kinds of docs on this site in one box: the handwritten module maps, the
 * generated API reference (docs/site/api/), and the examples/tutorials
 * pages.
 *
 * Included on every page — handwritten module pages via assets/nav.js
 * (which loads this alongside itself), and generated API pages via the
 * banner injected by docs/generate_api_docs.py, since those don't load
 * nav.js at all (pdoc has its own header/layout).
 *
 * Include with:
 *   <script src="ROOT/assets/search.js" data-root="ROOT"></script>
 * where ROOT is the same relative path used for assets/nav.js on that page
 * (see nav.js's own header comment).
 *
 * The index itself (docs/site/pagefind/) is generated, not committed (see
 * .gitignore) — like docs/site/api/, it always reflects the last build.
 * Pagefind fetches its index at runtime, which browsers block over plain
 * file:// (CORS); this degrades to a clear message rather than a silent
 * dead button in that case — see showError() below.
 */
(function () {
  "use strict";

  var scriptEl = document.currentScript;
  var ROOT = (scriptEl && scriptEl.getAttribute("data-root")) || "";
  // Pagefind's UI resolves this with a bare `import(bundlePath + "pagefind.js")`
  // internally, which browsers treat as a module *specifier* (not a relative
  // URL) unless it's absolute or starts with "./" — a plain "pagefind/"
  // fails with "Failed to resolve module specifier". Resolve it to a full
  // absolute URL up front so that always works regardless of page depth.
  var BUNDLE_PATH = new URL(ROOT + "pagefind/", document.baseURI).href;

  // Self-contained styling for the search button/modal, injected as a
  // <style> tag rather than living in assets/style.css: this script also
  // runs on the generated pdoc API pages (docs/site/api/**), which have
  // their own stylesheet and never load assets/style.css. Colors are
  // literal (not var(--...) from style.css) for the same reason.
  var SEARCH_CSS =
    ".site-search-btn{margin-left:auto;font-size:0.83rem;padding:0.35rem 0.8rem;" +
    "background:#1b1f27;color:#dbe0e8;border:1px solid #2a2f3a;border-radius:8px;" +
    "cursor:pointer;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif}" +
    ".site-search-btn:hover{border-color:#7ec3ff;color:#7ec3ff}" +
    ".site-search-btn-floating{position:fixed;top:0.6rem;right:0.8rem;z-index:9999;" +
    "margin-left:0;box-shadow:0 2px 10px rgba(0,0,0,0.4)}" +
    ".search-modal{display:none;position:fixed;inset:0;z-index:9999}" +
    ".search-modal.open{display:block}" +
    "body.search-modal-open{overflow:hidden}" +
    ".search-modal-backdrop{position:absolute;inset:0;background:rgba(0,0,0,0.6)}" +
    ".search-modal-panel{position:relative;max-width:640px;margin:8vh auto 0;" +
    "max-height:80vh;overflow-y:auto;background:#171a21;border:1px solid #2a2f3a;" +
    "border-radius:8px;padding:1.2rem 1.3rem 1.4rem;box-shadow:0 12px 40px rgba(0,0,0,0.5);" +
    "font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#dbe0e8}" +
    ".search-modal-close{position:absolute;top:0.6rem;right:0.7rem;background:none;" +
    "border:none;color:#9aa4b2;font-size:1.4rem;line-height:1;cursor:pointer;" +
    "padding:0.2rem 0.4rem}" +
    ".search-modal-close:hover{color:#dbe0e8}" +
    ".search-modal-note{margin-top:0.9rem;font-size:0.78rem;color:#9aa4b2}" +
    ".search-modal-error{font-size:0.85rem;color:#9aa4b2}" +
    "#pagefindSearchMount{min-height:3rem}" +
    ".pagefind-ui{--pagefind-ui-primary:#dbe0e8;--pagefind-ui-text:#dbe0e8;" +
    "--pagefind-ui-background:#171a21;--pagefind-ui-border:#2a2f3a;" +
    "--pagefind-ui-tag:#1b1f27;" +
    "--pagefind-ui-font:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif}" +
    ".pagefind-ui__result-link{color:#7ec3ff}";

  function injectStyles() {
    if (document.getElementById("site-search-style")) return;
    var style = document.createElement("style");
    style.id = "site-search-style";
    style.textContent = SEARCH_CSS;
    document.head.appendChild(style);
  }

  var modal = null;
  var pagefindRequested = false;

  function buildButton() {
    injectStyles();
    if (document.getElementById("siteSearchBtn")) return;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "siteSearchBtn";
    btn.className = "site-search-btn";
    btn.setAttribute("aria-haspopup", "dialog");
    btn.textContent = "🔍 Search docs";
    btn.addEventListener("click", openModal);

    // Handwritten pages: drop it into the shared header bar next to the
    // crumbs. Generated API pages have their own pdoc header instead, so
    // fall back to a fixed corner button there.
    var crumbsWrap = document.querySelector("header.top .wrap");
    if (crumbsWrap) {
      crumbsWrap.appendChild(btn);
    } else {
      btn.classList.add("site-search-btn-floating");
      document.body.appendChild(btn);
    }
  }

  function buildModal() {
    modal = document.createElement("div");
    modal.className = "search-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Search the code map");

    var backdrop = document.createElement("div");
    backdrop.className = "search-modal-backdrop";
    backdrop.addEventListener("click", closeModal);

    var panel = document.createElement("div");
    panel.className = "search-modal-panel";

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "search-modal-close";
    closeBtn.setAttribute("aria-label", "Close search");
    closeBtn.innerHTML = "&times;";
    closeBtn.addEventListener("click", closeModal);

    var mount = document.createElement("div");
    mount.id = "pagefindSearchMount";
    mount.textContent = "Loading search…";

    var note = document.createElement("p");
    note.className = "search-modal-note";
    note.textContent =
      "Searches the handwritten module maps, the generated API reference, " +
      "and the examples/tutorials pages together.";

    panel.appendChild(closeBtn);
    panel.appendChild(mount);
    panel.appendChild(note);
    modal.appendChild(backdrop);
    modal.appendChild(panel);
    document.body.appendChild(modal);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal.classList.contains("open")) closeModal();
    });
  }

  function openModal() {
    if (!modal) buildModal();
    modal.classList.add("open");
    document.body.classList.add("search-modal-open");
    loadPagefind();
    window.setTimeout(function () {
      var input = modal.querySelector("input[type=text], input[type=search]");
      if (input) input.focus();
    }, 50);
  }

  function closeModal() {
    if (modal) modal.classList.remove("open");
    document.body.classList.remove("search-modal-open");
  }

  function loadPagefind() {
    if (pagefindRequested) return;
    pagefindRequested = true;

    // Pagefind UI loads its own <script src> fine over file://, but its
    // index fetch is a dynamic `import()`/`fetch()` of a file:// URL, which
    // Chromium and Firefox both block — that failure surfaces deep inside
    // pagefind-ui's own async handler, after the user has already typed a
    // query, and would otherwise just hang on "Searching…" forever. Skip
    // straight to the explanatory message instead.
    if (window.location.protocol === "file:") return showError();

    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = BUNDLE_PATH + "pagefind-ui.css";
    document.head.appendChild(link);

    var script = document.createElement("script");
    script.src = BUNDLE_PATH + "pagefind-ui.js";
    script.onload = function () {
      var mount = document.getElementById("pagefindSearchMount");
      if (!mount || !window.PagefindUI) return showError();
      mount.textContent = "";
      try {
        // eslint-disable-next-line no-new
        new window.PagefindUI({
          element: "#pagefindSearchMount",
          bundlePath: BUNDLE_PATH,
          showSubResults: true,
          showImages: false,
          excerptLength: 20,
          resetStyles: false
        });
      } catch (err) {
        showError();
      }
    };
    script.onerror = showError;
    document.body.appendChild(script);
  }

  function showError() {
    var mount = document.getElementById("pagefindSearchMount");
    if (!mount) return;
    mount.innerHTML =
      "<p class='search-modal-error'>Search index didn't load. It's generated at " +
      "build time (<code>docs/build_search_index.sh</code>, not committed) and, like " +
      "the API reference, needs the site served over http(s) rather than opened " +
      "directly as <code>file://</code> — browsers block the fetch either way over " +
      "file://. Try <code>python3 -m http.server -d docs/site 8000</code> locally, " +
      "or use the deployed GitHub Pages site.</p>";
  }

  // nav.js injects this script tag dynamically on handwritten pages, which
  // can happen after DOMContentLoaded has already fired — don't miss it.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildButton);
  } else {
    buildButton();
  }
})();
