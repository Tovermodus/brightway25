// Minimal, dependency-free syntax highlighter for the code map's <pre><code>
// blocks. No CDN, no build step, no external highlight.js/prism: the whole
// site is opened via plain file:// links (see root CLAUDE.md /
// docs/site/examples/index.html), so the highlighter has to work with
// nothing but a <script> tag and no network access.
//
// It tokenizes the *installed-source-derived* code samples on these pages
// (almost all Python, some shell) well enough to color comments, strings,
// numbers, decorators and keywords -- it is not a full Python parser and
// doesn't need to be, since every block it touches is short, working code.
//
// Blocks it deliberately leaves alone: `.output` blocks (captured program
// output, already colored via --accent2 in style.css) and `.arch` blocks
// (plain-text architecture diagrams).
(function () {
  "use strict";

  var KEYWORDS = new Set([
    "False", "None", "True", "and", "as", "assert", "async", "await",
    "break", "class", "continue", "def", "del", "elif", "else", "except",
    "finally", "for", "from", "global", "if", "import", "in", "is",
    "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try",
    "while", "with", "yield", "match", "case",
  ]);

  var BUILTINS = new Set([
    "print", "len", "range", "str", "int", "float", "bool", "list", "dict",
    "set", "tuple", "type", "isinstance", "enumerate", "zip", "map",
    "filter", "sorted", "sum", "min", "max", "open", "super", "self",
    "abs", "round", "getattr", "setattr", "hasattr", "iter", "next",
  ]);

  // One pass over the source: a comment, a string (triple/single/double,
  // with optional f/r/b prefixes), a number, a decorator, or a bare
  // identifier. Anything not matched by one of these falls through as
  // plain text between matches and just gets HTML-escaped.
  var TOKEN_RE =
    /(#[^\n]*)|((?:f|r|b|rb|fr|Rb|bR)?(?:'''[\s\S]*?'''|"""[\s\S]*?"""|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'))|(@[A-Za-z_]\w*)|(\b\d+(?:_\d+)*\.?\d*(?:[eE][+-]?\d+)?\b)|(\b[A-Za-z_]\w*\b)/g;

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function highlight(source) {
    var out = "";
    var last = 0;
    var match;
    TOKEN_RE.lastIndex = 0;
    while ((match = TOKEN_RE.exec(source)) !== null) {
      if (match.index > last) {
        out += escapeHtml(source.slice(last, match.index));
      }
      var comment = match[1];
      var string = match[2];
      var decorator = match[3];
      var number = match[4];
      var identifier = match[5];
      if (comment !== undefined) {
        out += '<span class="tok-c">' + escapeHtml(comment) + "</span>";
      } else if (string !== undefined) {
        out += '<span class="tok-s">' + escapeHtml(string) + "</span>";
      } else if (decorator !== undefined) {
        out += '<span class="tok-dec">' + escapeHtml(decorator) + "</span>";
      } else if (number !== undefined) {
        out += '<span class="tok-n">' + escapeHtml(number) + "</span>";
      } else if (identifier !== undefined) {
        if (KEYWORDS.has(identifier)) {
          out += '<span class="tok-k">' + identifier + "</span>";
        } else if (BUILTINS.has(identifier)) {
          out += '<span class="tok-bi">' + identifier + "</span>";
        } else {
          out += identifier;
        }
      }
      last = TOKEN_RE.lastIndex;
    }
    out += escapeHtml(source.slice(last));
    return out;
  }

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  ready(function () {
    var blocks = document.querySelectorAll("pre > code");
    blocks.forEach(function (block) {
      var pre = block.parentElement;
      if (pre.classList.contains("output") || pre.closest(".arch")) {
        return; // captured program output / plain-text diagrams: leave as-is
      }
      block.innerHTML = highlight(block.textContent);
      pre.classList.add("hl");
    });
  });
})();
