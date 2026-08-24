"""Enforce that every worked example in docs/site/examples/index.html actually runs.

Each example on that page is documented as "a complete, standalone Python
script" whose "Output" block is "actually executed against the installed
source" (see the blockquote at the top of examples/index.html). This test
is what makes that claim true instead of just asserted: it extracts every
example's Code block, runs it against the currently installed packages in
an isolated project, and fails if the script raises or its stdout no longer
matches the captured Output block.

Run it the same way CI does, from the repo root, after the usual
``pip install -e ".[dev]"`` (see root CLAUDE.md):

    python docs/tests/test_examples_executable.py

Exit code 0 means every example still runs and still prints what the page
says it prints. A non-zero exit means the page has drifted from the real
behavior of the installed packages -- fix the docs/site page (or the code,
if the docs caught a real regression), don't silence this script.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
from html import unescape
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
EXAMPLES_PAGE = REPO_ROOT / "docs" / "site" / "examples" / "index.html"

ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")

# Log noise the examples page explicitly says it strips from captured
# Output blocks (progress bars, structlog info/warning lines) -- strip the
# same lines from a fresh run's stdout before comparing, or every example
# would fail on cosmetic library chatter that isn't part of the documented
# output. structlog's "info"/"warning" lines carry a HH:MM:SS+ZZZZ prefix;
# the "Using environment variable BRIGHTWAY2_DIR..." message wraps onto a
# second, unprefixed line (the tmp path), so that gets its own rule.
NOISE_PATTERNS = [
    re.compile(r"^\d+%\|.*\|.*it/s\]?$"),  # tqdm progress bars
    re.compile(r"^\d{2}:\d{2}:\d{2}[+-]\d{4}\s+\[(info|warning)\s*\]\s.*$"),  # structlog lines
    re.compile(r"^\s*/tmp/bw25-example-.*$"),  # continuation line of the BRIGHTWAY2_DIR message
]

EXAMPLE_RE = re.compile(
    r'<div class="ex" id="(?P<id>[^"]+)">.*?'
    r'<p class="label">Code</p>\s*<pre><code>(?P<code>.*?)</code></pre>\s*'
    r'<p class="label">Output</p>\s*<pre class="output"><code>(?P<output>.*?)</code></pre>',
    re.DOTALL,
)


def clean(text: str) -> list[str]:
    text = ANSI_RE.sub("", text)
    lines = text.strip("\n").splitlines()
    return [line for line in lines if not any(p.match(line) for p in NOISE_PATTERNS)]


def extract_examples(html: str):
    for match in EXAMPLE_RE.finditer(html):
        yield (
            match.group("id"),
            unescape(match.group("code")),
            unescape(match.group("output")),
        )


def run_example(code: str, project_dir: Path) -> tuple[int, str, str]:
    env = dict(os.environ)
    env["BRIGHTWAY2_DIR"] = str(project_dir)
    # Every example uses a fixed literal project name ("my-project"); giving
    # each example its own isolated BRIGHTWAY2_DIR (below) is enough to keep
    # them from colliding, so no renaming is needed.
    proc = subprocess.run(
        [sys.executable, "-c", code],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    return proc.returncode, proc.stdout, proc.stderr


def main() -> int:
    if not EXAMPLES_PAGE.exists():
        print(f"no examples page found at {EXAMPLES_PAGE}", file=sys.stderr)
        return 1

    html = EXAMPLES_PAGE.read_text()
    examples = list(extract_examples(html))
    if not examples:
        print(
            f'found zero <div class="ex"> examples in {EXAMPLES_PAGE} -- regex drifted '
            "from the page's markup?",
            file=sys.stderr,
        )
        return 1

    failures = []
    for ex_id, code, expected_output in examples:
        tmp = Path(tempfile.mkdtemp(prefix=f"bw25-example-{ex_id}-"))
        try:
            returncode, stdout, stderr = run_example(code, tmp)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

        if returncode != 0:
            failures.append(
                f"[{ex_id}] script exited with code {returncode}\n--- stderr ---\n{stderr}"
            )
            continue

        actual_lines = clean(stdout)
        expected_lines = clean(expected_output)
        if actual_lines != expected_lines:
            failures.append(
                f"[{ex_id}] stdout no longer matches the documented Output block\n"
                f"--- expected ---\n{os.linesep.join(expected_lines)}\n"
                f"--- actual ---\n{os.linesep.join(actual_lines)}\n"
                f"--- stderr ---\n{stderr}"
            )
        else:
            print(f"[{ex_id}] OK")

    if failures:
        print("\n".join(failures), file=sys.stderr)
        print(f"\n{len(failures)}/{len(examples)} example(s) failed", file=sys.stderr)
        return 1

    print(f"all {len(examples)} example(s) executed and matched their documented output")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
