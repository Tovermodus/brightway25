# brightway25 — root map

## What this repo actually is

`brightway25` (this repo) is **only a meta-package**. `brightway25/__init__.py`
is empty — there is no real code here. It exists to pin and document
installation of the packages that make up the Brightway 2.5 LCA (Life Cycle
Assessment) framework; see `pyproject.toml` `[project].dependencies` for the
authoritative version pins.

Because the real logic lives in those other packages (most under the
`brightway-lca` GitHub org), and because this session's GitHub proxy only
allows access to `tovermodus/*` repos (cross-owner `add_repo` and direct
`git clone`/`ls-remote` of `brightway-lca/bw2data`, `bw2calc`, `bw2io`,
`bw2analyzer`, `bw2parameters` are blocked with 403 — other brightway repos
happen to pass through unauthenticated), **git submodules are not viable
here**. Instead:

```
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

This installs the real source of every dependency into
`.venv/lib/python3.11/site-packages/<package>/`. `.venv/` is gitignored, so
recreate it in any fresh session/container with the two commands above —
it's the actual way to "pull in" the other brightway modules here.

## Module map — where the real answer lives

Each installed package has its own map at `modules/<package>/CLAUDE.md`
describing its purpose, key files, and main classes/entry points, with
pointers to the real source under `.venv/lib/python3.11/site-packages/`.
Read the relevant one before answering a question about that package's
internals — don't answer from general LCA knowledge or upstream docs
(the user has found upstream Brightway documentation to be unreliable/stale;
the installed source is ground truth).

There is also a browsable **HTML version** of the same maps at
`docs/site/index.html` — open it directly in a browser (plain `file://`
links, no server needed) for human reading. Every module page there links
back to the index and to related module pages. When you update a module's
`CLAUDE.md`, update its `docs/site/<package>/index.html` counterpart to
match (same content, styled with `docs/site/assets/style.css`).

| Package | Role | Map |
|---|---|---|
| `bw2data` | Core data model: projects, SQLite-backed activities/exchanges (nodes/edges), metadata stores, search | [modules/bw2data/CLAUDE.md](modules/bw2data/CLAUDE.md) |
| `bw2calc` | LCA calculation engine: builds & solves the matrices | [modules/bw2calc/CLAUDE.md](modules/bw2calc/CLAUDE.md) |
| `bw_processing` | On-disk "datapackage" format for processed/matrix-ready arrays | [modules/bw_processing/CLAUDE.md](modules/bw_processing/CLAUDE.md) |
| `matrix_utils` | Builds `bw_processing` datapackages into live scipy sparse matrices | [modules/matrix_utils/CLAUDE.md](modules/matrix_utils/CLAUDE.md) |
| `bw_graph_tools` | Graph traversal of the technosphere (supply-chain graphs) | [modules/bw_graph_tools/CLAUDE.md](modules/bw_graph_tools/CLAUDE.md) |
| `bw2io` | Import/export: ecoinvent, SimaPro, ecospold, Excel, exiobase, etc. | [modules/bw2io/CLAUDE.md](modules/bw2io/CLAUDE.md) |
| `bw_simapro_csv` | Low-level SimaPro CSV parser used by `bw2io` | [modules/bw_simapro_csv/CLAUDE.md](modules/bw_simapro_csv/CLAUDE.md) |
| `ecoinvent_interface` | Authenticated client for downloading ecoinvent releases | [modules/ecoinvent_interface/CLAUDE.md](modules/ecoinvent_interface/CLAUDE.md) |
| `bw_migrations` | Curated data migrations (e.g. exiobase↔ecoinvent) used during import | [modules/bw_migrations/CLAUDE.md](modules/bw_migrations/CLAUDE.md) |
| `randonneur` | Generic "migrate/patch a dataset" engine (JSON-diff-like) | [modules/randonneur/CLAUDE.md](modules/randonneur/CLAUDE.md) |
| `randonneur_data` | Registry of pre-built randonneur migration datasets | [modules/randonneur_data/CLAUDE.md](modules/randonneur_data/CLAUDE.md) |
| `mrio_common_metadata` | Shared metadata helpers for MRIO (exiobase-style) datapackages | [modules/mrio_common_metadata/CLAUDE.md](modules/mrio_common_metadata/CLAUDE.md) |
| `multifunctional` | Allocation of multi-output ("multifunctional") processes | [modules/multifunctional/CLAUDE.md](modules/multifunctional/CLAUDE.md) |
| `bw2parameters` | Formula/parameter interpreter used for parameterized exchanges | [modules/bw2parameters/CLAUDE.md](modules/bw2parameters/CLAUDE.md) |
| `stats_arrays` | Uncertainty distributions + Monte Carlo RNG | [modules/stats_arrays/CLAUDE.md](modules/stats_arrays/CLAUDE.md) |
| `bw2analyzer` | Post-calculation analysis: contribution, comparisons, graphs | [modules/bw2analyzer/CLAUDE.md](modules/bw2analyzer/CLAUDE.md) |

## How the pieces fit together (dependency layers, bottom to top)

```
stats_arrays  bw2parameters          (leaf utility libs: uncertainty, formulas)
        \        /
     bw_processing  ── matrix_utils ── bw_graph_tools
              \            |              /
               \           |             /
                bw2data (projects, activities, exchanges)
                     |
              multifunctional (allocation, sits on top of bw2data)
                     |
                  bw2calc (LCA solving; consumes bw2data + bw_processing via matrix_utils)
                     |
                  bw2analyzer (post-processing of bw2calc results)

Import/export side (independent of the calc stack, writes into bw2data):
  bw_simapro_csv, ecoinvent_interface, bw_migrations, randonneur,
  randonneur_data, mrio_common_metadata  ──►  bw2io  ──►  bw2data
```

Concretely, a typical LCA calculation flow:
1. `bw2io` importers parse external formats (ecospold, SimaPro CSV, Excel,
   exiobase) into `bw2data` — see `bw2io/importers/base.py` `ImportBase`.
2. `bw2data.Database`/`DataStore.process()` writes a `bw_processing`
   datapackage of the technosphere/biosphere/characterization matrices.
3. `bw2calc.LCA` loads those datapackages, uses `matrix_utils.MappedMatrix`
   to build scipy sparse matrices, and solves them (`lca.py`, `dense_lca.py`).
4. `bw2analyzer` and `bw_graph_tools` operate on a solved `LCA` object to
   produce contribution analyses, supply-chain graphs, etc.

## Standing instruction for this repo

**Whenever the user asks a question about how Brightway (any of the modules
above) actually works, don't just answer in chat** — produce or update
high-quality code documentation that captures the answer, so the map stays
useful for next time:

- Update the relevant `modules/<package>/CLAUDE.md` with what was learned
  (key classes/functions involved, file:line references, call flow) — treat
  these files as living documentation, not one-shot answers.
- If the question spans multiple packages, update each one touched and
  make sure the "how the pieces fit together" picture above still holds;
  correct it if the investigation showed it's wrong.
- Prefer reading from `.venv/lib/python3.11/site-packages/<package>/` (the
  actual installed source, ground truth) over remembered/upstream docs.
- Still answer the user's question directly in chat — the documentation
  update is in addition to that, not instead of it.
