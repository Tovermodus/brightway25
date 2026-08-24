#!/usr/bin/env bash
# Build the site-wide search index (Pagefind <https://pagefind.app>) over
# docs/site/ — the handwritten module maps, the generated API reference
# (docs/site/api/, see generate_api_docs.py), and the examples/tutorials
# pages, all in one index.
#
# Usage:
#   python docs/generate_api_docs.py   # first, so the API pages exist to index
#   docs/build_search_index.sh
#
# Output goes to docs/site/pagefind/ (NOT committed — see .gitignore,
# same as docs/site/api/) and is rebuilt on every GitHub Pages deploy
# (.github/workflows/pages.yml). Needs Node/npx; nothing else to install
# ahead of time, npx fetches the `pagefind` CLI package on first run.
#
# Note: the resulting search box (assets/search.js) fetches this index at
# runtime, which browsers block over plain file:// (CORS). Serve docs/site/
# over http(s) to try it locally, e.g.:
#   python3 -m http.server -d docs/site 8000
# It works without a local server once deployed to GitHub Pages.
#
# Note: Pagefind links a result to the specific matched section (not just
# the page) by anchoring to the nearest h1-h6 *with an id* above the match —
# it crawls this static HTML directly and never runs assets/nav.js, so a
# heading only gets a real anchor if its `id="..."` is already in the
# committed markup. Any new h2-h6 added to a handwritten page should carry
# a static id (slugified heading text, matching assets/nav.js's slugify())
# or its search results will just jump to the top of the page.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# --exclude-selectors:
#   nav.pdoc                     pdoc's own module-tree sidebar, repeated
#                                 verbatim on every generated API page —
#                                 indexing it would bury real results under
#                                 hundreds of duplicate class-name matches.
# The handwritten pages' own sidebar (#sidebar) and per-page banner
# (header.top / the pdoc backlink banner) are marked data-pagefind-ignore
# directly in their markup instead.
npx --yes pagefind \
  --site docs/site \
  --output-subdir pagefind \
  --exclude-selectors "nav.pdoc"
