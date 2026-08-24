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
_BACKLINK_TEMPLATE = (
    '<div style="background:#171a21;color:#9aa4b2;font:0.82rem -apple-system,'
    "Helvetica,Arial,sans-serif;padding:0.5rem 1rem;border-bottom:1px solid "
    '#2a2f3a">'
    '<a href="{home}" style="color:#7ec3ff;text-decoration:none">'
    "← brightway25 code map</a>"
    ' &middot; <a href="{module}" style="color:#7ec3ff;text-decoration:none">'
    "{package} module map</a>"
    ' &middot; <a href="{examples}" style="color:#7ec3ff;text-decoration:none">'
    "Examples</a>"
    "</div>"
)


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
    cmd = [sys.executable, "-m", "pdoc", package, "-o", str(out_dir)]
    print(f"  pdoc {package} -> {out_dir.relative_to(REPO_ROOT)}")
    result = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  FAILED: {package}\n{result.stdout}\n{result.stderr}", file=sys.stderr)
        return False
    inject_backlinks(out_dir, package)
    return True


def main() -> int:
    packages = sys.argv[1:] or discover_packages()
    if not packages:
        print("No packages found (no docs/site/*/index.html and none passed as args).")
        return 1

    print(f"Generating API docs for {len(packages)} package(s): {', '.join(packages)}")
    API_DIR.mkdir(parents=True, exist_ok=True)

    ok, failed = [], []
    for package in packages:
        if not is_importable(package):
            failed.append(package)
            continue
        (ok if generate(package) else failed).append(package)

    print(f"\nDone: {len(ok)} generated, {len(failed)} skipped/failed.")
    if failed:
        print(f"Skipped/failed: {', '.join(failed)}")
    # A partial run (e.g. one package failing to import) shouldn't fail CI —
    # the handwritten map pages are more important than 100% API coverage.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
