#!/usr/bin/env python3
"""Generate per-package API reference docs (from docstrings) into docs/site/api/.

This is the "generated" half of the code map at docs/site/index.html: the
handwritten CLAUDE.md-derived pages under docs/site/<package>/ describe how a
package fits into the Brightway stack, while docs/site/api/<package>/ (built
by this script, via pdoc <https://pdoc.dev>) is the full auto-generated
API reference for every public class/function/module in that package,
straight from its installed docstrings.

Usage:
    source .venv/bin/activate
    pip install pdoc          # already in the "dev" extra as of this script
    python docs/generate_api_docs.py [package ...]

With no arguments, it auto-discovers the package list from the site itself:
every subdirectory of docs/site/ that has an index.html (excluding assets/
and api/ itself) is treated as a documented package name and, if it is
importable in the current environment, gets API docs generated for it.

This means the generator needs *no edits* to pick up a new package: to add
API docs for another Brightway package, just add docs/site/<newpkg>/index.html
(the handwritten map page — copy an existing one as a template) and make sure
<newpkg> is installed (add it to pyproject.toml dependencies); the next run
of this script (and the next Pages deploy) will pick it up automatically.
You can also pass explicit package names as CLI args to generate docs for a
package that doesn't have a handwritten map page yet.

Augmenting the generated pages with our own notes: the API reference comes
straight from each package's installed (third-party) docstrings, which this
repo doesn't own and can't durably edit. To still add our own callouts —
corrections, gotchas, cross-references to a tutorial — without touching that
source, drop an inner-HTML snippet at docs/site/<package>/api_notes.html;
inject_supplementary_notes() splices it into the top of the generated
api/<package>/index.html page on every run. Optional per package; see e.g.
docs/site/bw2calc/api_notes.html.

Output is NOT committed to git (see docs/site/api/ in .gitignore) — it is
regenerated on every GitHub Pages deploy (.github/workflows/pages.yml) and
can be regenerated locally at any time; it will always match whatever
version of each package is actually installed in .venv.
"""
from __future__ import annotations

import importlib
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SITE_DIR = REPO_ROOT / "docs" / "site"
API_DIR = SITE_DIR / "api"

# Inserted into every generated pdoc page, right after <body>, so a reader who
# lands on an API page directly (deep link, search engine) can get back to
# the handwritten module map and the rest of the code map. pdoc's own template
# knows nothing about docs/site/, so this is injected as plain inline-styled
# HTML rather than relying on assets/style.css classes. Kept intentionally
# tiny — it must not fight pdoc's own layout.
#
# data-pagefind-ignore keeps this banner (nav links, not content) out of the
# search index built by docs/build_search_index.sh. The trailing <script>
# loads assets/search.js, which adds the same site-wide search box these
# pages would get from assets/nav.js on the handwritten pages — pdoc pages
# don't include nav.js (pdoc has its own header/layout), so it's wired in
# here instead.
_BACKLINK_TEMPLATE = (
    '<div data-pagefind-ignore style="background:#171a21;color:#9aa4b2;'
    'font:0.82rem -apple-system,Helvetica,Arial,sans-serif;padding:0.5rem 1rem;'
    'border-bottom:1px solid #2a2f3a">'
    '<a href="{home}" style="color:#7ec3ff;text-decoration:none">'
    "← brightway25 code map</a>"
    ' &middot; <a href="{module}" style="color:#7ec3ff;text-decoration:none">'
    "{package} module map</a>"
    ' &middot; <a href="{examples}" style="color:#7ec3ff;text-decoration:none">'
    "Examples</a>"
    "</div>"
    '<script src="{site_rel}assets/search.js" data-root="{site_rel}"></script>'
)


def inject_supplementary_notes(out_dir: Path, package: str) -> None:
    """Splice our own handwritten notes into the top-level generated API page.

    The generated API reference comes straight from each installed
    third-party package's own docstrings — we don't own that source and
    can't durably edit it (`.venv` is gitignored and reinstalled fresh every
    session). This is the escape hatch: if `docs/site/<package>/api_notes.html`
    exists, its contents (an inner-HTML snippet, not a full document — a
    couple of paragraphs/callouts) are inserted right after the backlink
    banner on the generated `api/<package>/index.html` page. Author it once;
    every regeneration (including the GitHub Pages deploy) picks it up
    automatically. A package with no such file is untouched — this is
    opt-in per package, not required.

    Must run after `inject_backlinks` (it reuses the banner's closing
    `</script>` tag as the insertion point) and is best-effort: any surprise
    in pdoc's output shape just skips this package's notes rather than
    failing the build.
    """
    notes_file = SITE_DIR / package / "api_notes.html"
    if not notes_file.exists():
        return
    top_page = out_dir / package / "index.html"
    if not top_page.exists():
        top_page = out_dir / f"{package}.html"  # single-module fallback shape
    if not top_page.exists():
        print(f"  (skip api_notes for {package}: no top-level page found)", file=sys.stderr)
        return
    try:
        text = top_page.read_text(encoding="utf-8")
        if 'id="brightway25-api-notes"' in text:
            return  # already injected (e.g. re-run without a clean)
        marker = "</script>"
        idx = text.find(marker)
        if idx == -1:
            return
        idx += len(marker)
        notes_html = notes_file.read_text(encoding="utf-8")
        wrapped = (
            '<div id="brightway25-api-notes" data-pagefind-ignore '
            'style="background:#1d2129;color:#c8cdd6;border-bottom:1px solid #2a2f3a;'
            'padding:0.9rem 1.2rem;font:0.9rem -apple-system,Helvetica,Arial,sans-serif">'
            + notes_html
            + "</div>"
        )
        top_page.write_text(text[:idx] + wrapped + text[idx:], encoding="utf-8")
    except Exception as exc:  # noqa: BLE001 - supplementary, never fatal
        print(f"  (skip api_notes for {package}: {exc})", file=sys.stderr)


def inject_backlinks(out_dir: Path, package: str) -> None:
    """Best-effort: add a back-to-code-map banner to every page pdoc wrote.

    Runs after a successful `generate()`; never fails the build — a page
    pdoc wrote without a banner is still a usable page, so any surprise in
    pdoc's output format is swallowed per-file rather than raised.
    """
    for html_file in out_dir.rglob("*.html"):
        try:
            text = html_file.read_text(encoding="utf-8")
            if "brightway25 code map</a>" in text:
                continue  # already injected (e.g. re-run without a clean)
            site_rel = os.path.relpath(SITE_DIR, html_file.parent).replace(os.sep, "/")
            if site_rel == ".":
                site_rel = ""
            else:
                site_rel += "/"
            banner = _BACKLINK_TEMPLATE.format(
                home=f"{site_rel}index.html",
                module=f"{site_rel}{package}/index.html",
                examples=f"{site_rel}examples/index.html",
                package=package,
                site_rel=site_rel,
            )
            new_text = text.replace("<body>", "<body>" + banner, 1)
            if new_text == text:
                continue  # unexpected template shape — skip rather than guess
            html_file.write_text(new_text, encoding="utf-8")
        except Exception as exc:  # noqa: BLE001 - cosmetic banner, never fatal
            print(f"  (skip backlink banner for {html_file}: {exc})", file=sys.stderr)

# Directories under docs/site/ that are not package map pages.
NON_PACKAGE_DIRS = {"assets", "api", "examples", "tutorials"}


def discover_packages() -> list[str]:
    """Every docs/site/<name>/index.html directory is a documented package."""
    names = []
    for child in sorted(SITE_DIR.iterdir()):
        if not child.is_dir() or child.name in NON_PACKAGE_DIRS:
            continue
        if (child / "index.html").exists():
            names.append(child.name)
    return names


def is_importable(package: str) -> bool:
    try:
        importlib.import_module(package)
        return True
    except Exception as exc:  # noqa: BLE001 - report and skip, don't crash the build
        print(f"  skip {package}: not importable ({exc})", file=sys.stderr)
        return False


def generate(package: str) -> bool:
    out_dir = API_DIR / package
    # docformat=google: most docstrings across this stack are either plain
    # prose or Google-style ("Args:"/"Returns:"), with a minority of
    # numpy-style ("Parameters\n----------") outliers (e.g. some of
    # bw2calc.LCA's methods). pdoc has no mixed-style auto-detection and the
    # packages are reinstalled from PyPI on every fresh .venv (so we can't
    # add per-module `__docformat__` markers upstream) — "google" renders the
    # majority correctly and degrades the numpy-style minority to plain text
    # instead of mis-parsing it, which is the safer default of the two.
    cmd = [sys.executable, "-m", "pdoc", package, "-o", str(out_dir), "-d", "google"]
    print(f"  pdoc {package} -> {out_dir.relative_to(REPO_ROOT)}")
    result = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  FAILED: {package}\n{result.stdout}\n{result.stderr}", file=sys.stderr)
        return False
    inject_backlinks(out_dir, package)
    inject_supplementary_notes(out_dir, package)
    return True


def docstring_coverage(package: str) -> tuple[int, int]:
    """Return (documented, total) counts of public members with a docstring.

    A quick, approximate signal for "which modules need docstring love" —
    printed as a per-package summary so a maintainer scanning the build log
    can see where the generated API reference is thin, without having to
    click through every page. Best-effort: any introspection failure just
    yields (0, 0) for that package rather than failing the whole build.
    """
    try:
        import pdoc.doc

        mod = pdoc.doc.Module.from_name(package)
    except Exception:  # noqa: BLE001 - coverage is a bonus signal, not a gate
        return (0, 0)

    documented = total = 0
    seen: set[int] = set()

    def walk(node) -> None:
        nonlocal documented, total
        if id(node) in seen:
            return
        seen.add(id(node))
        for member in node.own_members:
            if member.name.startswith("_") and member.name != "__init__":
                continue
            total += 1
            if member.docstring.strip():
                documented += 1
            if hasattr(member, "own_members"):
                walk(member)
        for submodule in getattr(node, "submodules", []):
            walk(submodule)

    walk(mod)
    return (documented, total)


def main() -> int:
    packages = sys.argv[1:] or discover_packages()
    if not packages:
        print("No packages found (no docs/site/*/index.html and none passed as args).")
        return 1

    print(f"Generating API docs for {len(packages)} package(s): {', '.join(packages)}")
    API_DIR.mkdir(parents=True, exist_ok=True)

    ok, failed = [], []
    coverage: dict[str, tuple[int, int]] = {}
    for package in packages:
        if not is_importable(package):
            failed.append(package)
            continue
        if generate(package):
            ok.append(package)
            coverage[package] = docstring_coverage(package)
        else:
            failed.append(package)

    print(f"\nDone: {len(ok)} generated, {len(failed)} skipped/failed.")
    if failed:
        print(f"Skipped/failed: {', '.join(failed)}")

    if coverage:
        print("\nDocstring coverage (public members with a non-empty docstring):")
        for package, (documented, total) in sorted(coverage.items()):
            pct = f"{100 * documented / total:.0f}%" if total else "n/a"
            print(f"  {package:24s} {documented:4d}/{total:<4d} ({pct})")

    # A partial run (e.g. one package failing to import) shouldn't fail CI —
    # the handwritten map pages are more important than 100% API coverage.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
