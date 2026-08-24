---
name: brightway-docs
description: Guides writing and updating the brightway25 code-map documentation — modules/<package>/CLAUDE.md and its mirror docs/site/<package>/index.html. Use this any time you've just investigated how a Brightway module (bw2data, bw2calc, bw2io, bw_processing, matrix_utils, bw2analyzer, multifunctional, etc.) actually works and need to write that up, not just answer in chat. Also use it when asked to "document this module", "update the code map", "add this to CLAUDE.md", write or refresh a docs/site page, or when the investigation touched multiple packages and the root CLAUDE.md dependency diagram may need correcting. Covers both WHAT to write (grounded in installed source, file:line references, cross-references) and HOW to write it (concise, reference/explanation style, kept in sync across the markdown and HTML copies).
---

# Writing brightway25 code-map documentation

This repo's documentation is a **reference map of installed source code**, not a
tutorial. Every module gets a `modules/<package>/CLAUDE.md` page and a mirrored
`docs/site/<package>/index.html` page. Both exist so a future investigation (by
you or someone else) can skip re-deriving what you just learned. Write for that
reader: someone who has a specific question about the code and wants the answer
plus exactly enough surrounding context to trust it and navigate further.

## The non-negotiable grounding rule

**Every factual claim must trace back to source you actually read this session**,
in `.venv/lib/python3.11/site-packages/<package>/`. Not memory, not upstream
GitHub docs, not what a similar library usually does — upstream docs for this
stack are known to be stale (see root `CLAUDE.md`), and general LCA/Python
knowledge papers over the actual implementation, which is the only thing that
matters when someone is debugging against this exact installed version.

Practical consequence: before writing a sentence about what a class or function
does, open the file and read it. If you're documenting a call flow across
modules (e.g. "bw2data hands off to bw2calc via..."), read both sides of the
handoff, don't infer one side from the other's docstring.

## Cite locations, not just names

A claim like "`process()` writes a datapackage" is not verifiable later without
a location. Prefer citing `file.py` (bare filename, since these docs are scoped
to one package's source tree) and add a line number or line range when pointing
at a specific function/method rather than a whole file, especially for anything
non-obvious (a hook, a side effect, a "gotcha") that someone would otherwise
have to grep for again:

- Whole-file / whole-class pointers: `backends/proxies.py` is enough — that's
  what the "Key files" table is for.
- A specific behavior worth re-finding fast: name the function/method **and**
  a line or range, e.g. `backends/base.py` `SQLiteBackend.process()` (line
  ~1022). Existing pages use `~` for an approximate line since source moves
  between versions — keep that convention, don't overclaim precision.
- If you can't quickly find the line, at least name the function — a reader
  can grep for it. Never leave a specific behavioral claim with only a module
  name and nothing to search for.

## Scope: reference + explanation, not tutorial

These pages answer "what is this and how does it work" and "where do I look
for X" — not "here's a 10-step guide to using it." A short *typical usage*
snippet (a handful of lines, as bw2data's page has) is fine and helpful because
it anchors the API concretely, but don't grow it into a walkthrough with
numbered steps, alternatives, or troubleshooting — that content doesn't belong
in a code map and it will rot faster than the reference material around it.

If what you learned is genuinely a "how do I accomplish X" recipe rather than
"how does the code work", that's a signal it may not belong in this doc at
all — say so, and default to still capturing it (better documented than lost)
but keep it short and clearly separated.

## Content shape per module page

Match the structure already established (see `modules/bw2data/CLAUDE.md` /
`docs/site/bw2data/index.html` as the canonical example) rather than inventing
a new layout:

1. **Title + one-line tagline** — what the package's role is in the ecosystem,
   not a restatement of its name.
2. **Source blockquote** — installed path, version, upstream repo pointer.
3. **Key files table** — every file/subpackage worth knowing about, one row
   each, terse role description (one sentence, packed with the specific
   class/function names in that file — this table is the index a reader
   scans first).
4. **Main classes / entry points** — the public API surface (typically
   `__init__.py`'s `__all__`), one card/bullet per exported name with what it
   is and how it's normally reached (e.g. `bd.Database(...)`).
5. **Typical usage** (optional, short) — a minimal realistic code snippet,
   not a tutorial.
6. **"Where to look" / Q&A section** — the actual payload of most
   investigations: a specific question phrased the way someone would ask it,
   answered with file(s) + function/class + line pointers. Add a new entry
   here every time you resolve a specific "how does X work" question — this
   section is what turns a one-off investigation into permanent leverage.
7. **Related modules** — see cross-referencing below.

Keep the table/card format consistent between the `.md` and `.html` versions;
they should read as the same content in two renderings, not diverge in what
they cover.

## Update BOTH copies, every time

`modules/<package>/CLAUDE.md` (markdown, the source of truth Claude reads) and
`docs/site/<package>/index.html` (styled HTML for humans, using
`docs/site/assets/style.css`, plain `file://` links, no server) must stay in
sync. Never edit one without the other. When adding a new module page, add
both files and also add its entry to `docs/site/index.html` (the index/landing
page) in the appropriate architecture layer, plus a row in the root
`CLAUDE.md` module table.

## Cross-reference thoroughly, in both directions

Every module page's HTML version ends with a **Related modules** block: a
short list of the other module pages that matter to this one, each with a
`../<package>/index.html` link and a one-clause reason (not just a name —
*why* it's related, e.g. "runs LCA calculations against the datapackages this
module writes"). The markdown `CLAUDE.md` doesn't need the same block, but any
cross-module fact you state there (a handoff, a shared format, an import-time
dependency) should be too.

When you touch a module's relationships:
- Check whether the *other* module's page already lists this one back — a
  real dependency relationship should usually be visible from both sides.
  Update the other side's "Related modules" if your investigation revealed a
  link it's missing.
- Prefer linking to a specific place on the other page over a bare module
  link when you're pointing at one specific mechanism (e.g. link to
  `bw_processing`'s page and *say* which datapackage function is relevant,
  even though HTML anchors aren't set up — name it in the link text).
- If the investigation spanned multiple packages, treat the root `CLAUDE.md`
  "how the pieces fit together" dependency diagram as part of what you're
  documenting too: read it against what you actually found, and correct it
  if the layering, an arrow, or a listed package is wrong or incomplete —
  don't let it silently drift out of sync with the module pages it summarizes.

## Self-contained but concise

A reader should be able to open one module's page and get a workable mental
model without hopping through five others first — that's "self-contained."
It does not mean re-explaining another module's internals inline: link out
for depth, but give enough of a one-clause summary in place that the sentence
still makes sense unfollowed (e.g. "hands off to `bw2calc` (LCA solving) via
a `bw_processing` datapackage" rather than just "hands off to bw2calc").

Concision is not optional padding-cutting, it's a maintenance property — a
shorter, tighter doc is cheaper to keep correct. Concretely:

- One clear sentence beats three hedging ones. State what the code does,
  plainly, the way you'd document a contract (Google's docstring guidance:
  what it does and how to use it, not a narrated "why" essay) — save "why"
  for cases where the reason is genuinely non-obvious from the code itself
  (a workaround, a compat shim, an ordering constraint).
- Prune as you go, "bonsai" style: if an investigation shows an existing
  line is stale, wrong, or now redundant with something better documented
  elsewhere on the same page, fix or cut it in the same pass — don't just
  append and leave the old claim standing. Docs that only grow become
  untrustworthy exactly where they're most out of date.
- Don't restate the key-files table in prose in the Q&A section — point back
  to the row (`` `X.py` ``) and add only what's not already captured there
  (the specific line, the specific method, the specific gotcha).

## Workflow

1. Do the actual investigation first — read the installed source under
   `.venv/lib/python3.11/site-packages/<package>/` for every package the
   question touches. Don't write documentation from what you assume the
   answer is.
2. Answer the user's question directly in chat. The doc update is additive,
   never a substitute for actually answering — don't reply "see the updated
   CLAUDE.md" in place of a real answer.
3. Update `modules/<package>/CLAUDE.md` for each package touched, using the
   content shape above. If the page doesn't exist yet, create both it and
   its `docs/site/<package>/index.html` counterpart, and register it in
   `docs/site/index.html` and the root `CLAUDE.md` table.
4. Update `docs/site/<package>/index.html` to match — same content, styled
   with `docs/site/assets/style.css`, `../assets/style.css` relative links,
   `../<package>/index.html` for cross-links, `../index.html` back to the
   index (see any existing page as a template for the exact markup/classes).
5. Check cross-references both ways (this page's "Related modules" and the
   related pages' own lists) and fix the root `CLAUDE.md` architecture
   diagram if the investigation showed it's incomplete or wrong.
6. Re-read what you wrote once against the source: does every specific claim
   have a file (and, where it matters, a line) a reader could go check?
