# bw2data — core data model

Source: `.venv/lib/python3.11/site-packages/bw2data/` (installed from PyPI
`bw2data>=4.4.2`, currently `4.7`). Upstream: `brightway-lca/bw2data` (not
directly readable in this session — use the installed copy).

## What it does

Owns the persistent data model for Brightway: **projects**, **databases**
(collections of activities), **activities/exchanges** (the graph nodes/edges
of the technosphere + biosphere), **LCIA methods**, **parameters**, and
**metadata**. Everything else in the ecosystem (`bw2calc`, `bw2io`,
`bw2analyzer`, `multifunctional`) reads/writes through this layer. Backed by
SQLite via `peewee` (see `sqlite.py`, `backends/schema.py`).

## Key files

| File | Role |
|---|---|
| `project.py` | `ProjectManager` (the global `projects` singleton) and `ProjectDataset` — each Brightway "project" is an isolated SQLite DB + data dir. `writable_project` decorator gates mutating ops. |
| `configuration.py` | `config`, `labels` — global config object and string-label constants (node/edge types etc.) |
| `data_store.py` | `DataStore` / `ProcessedDataStore` — base classes for anything that (de)serializes to disk and can be "processed" into a `bw_processing` datapackage |
| `database.py` | `DatabaseChooser(name, backend="sqlite")` — factory returning the right backend class (this is what users call as `bd.Database(...)`) |
| `backends/base.py` | `SQLiteBackend(ProcessedDataStore)` — the default database backend; `.process()` builds the `bw_processing` datapackage bw2calc will consume |
| `backends/proxies.py` | `Activity`/`Exchange` (and `Exchanges` iterable) — the row-level ORM-like proxy objects users interact with (`act['name']`, `act.exchanges()`, `act.new_exchange(...)`) |
| `backends/schema.py` | peewee `Model` definitions (`ActivityDataset`, `ExchangeDataset`) — actual SQL table schema |
| `backends/iotable/` | Alternate backend for large I/O-style (matrix-native) databases, e.g. exiobase — bypasses per-row Activity objects for bulk arrays |
| `backends/wurst_extraction.py` | `extract_brightway_databases` — dumps a database to plain Python dicts (the "wurst" format used by other tooling) |
| `meta.py` | Metadata singletons: `databases`, `methods`, `geomapping`, `normalizations`, `weightings`, `calculation_setups`, `preferences` — small `DataStore`-like registries persisted as JSON, listed in a database's `config.metadata` |
| `method.py` | `Method(ImpactAssessmentDataStore)` — an LCIA method (characterization factors) |
| `weighting_normalization.py` | `Weighting`, `Normalization` classes, same pattern as `Method` |
| `parameters.py` | Parameterized exchanges/activities — formulas evaluated via `bw2parameters` |
| `query.py` | `Query`/`Filter`/`Result` — a small filter DSL for searching in-memory activity dicts |
| `search/` | Whoosh-based full text search (`Searcher`, `IndexManager`) over activity names/products |
| `compat.py` | Backwards-compat shims: `prepare_lca_inputs`, `Mapping`, `get_multilca_data_objs` — bridges old bw2 code style to bw2calc's newer datapackage-based API |
| `utils.py` | `get_activity`, `get_node`, `set_data_dir`, misc helpers |
| `signals.py` | `blinker` signal wiring — e.g. database-write triggers reprocessing |
| `revisions.py` | Change-tracking/revision log for syncing project state (cloud-collaboration feature) |
| `snowflake_ids.py` | ID generation scheme for nodes (`Node`/`Edge`, see `backends/__init__.py`) |

## Entry points (`__init__.py` `__all__`)

`Database` (= `DatabaseChooser`), `DataStore`, `ProcessedDataStore`,
`Method`, `Node` (= `backends.proxies.Activity`), `Edge` (=
`backends.proxies.Exchange`), `Searcher`, `IndexManager`, `Weighting`,
`Normalization`, singletons `projects`, `databases`, `methods`, `geomapping`,
`mapping`, `preferences`, `config`, `labels`, `parameters`
(`ParameterManager` instance), `calculation_setups`,
`dynamic_calculation_setups`, `normalizations`, `weightings`, and helpers
`get_activity`, `get_node`, `get_id`, `set_data_dir`, `prepare_lca_inputs`,
`get_multilca_data_objs`, `convert_backend`, `extract_brightway_databases`,
`JsonWrapper`. `__version__ = "4.7"`. At import time it also tries `import
multifunctional` so that package can register its custom backend.

Typical usage seen across the ecosystem: `import bw2data as bd`, then
`bd.projects.set_current("name")`, `bd.Database("name")`,
`activity = bd.get_node(...)`, `activity.exchanges()`.

## Creating an empty database and filling it yourself

Verified against the installed source (`backends/base.py`, `backends/proxies.py`):

```python
import bw2data as bd

bd.projects.set_current("my_project")   # projects are created on first use

db = bd.Database("example_db")
db.register()                            # required before writing; also auto-writes {} (write_empty=True)

activity = db.new_activity(code="steel_production", name="steel production", unit="kilogram", location="GLO")
activity.save()                           # new_activity()/new_node() return an in-memory proxy — nothing
                                           # persists until .save() is called
activity.new_exchange(input=activity.key, amount=1, type="production").save()
```

- `Database(name)` (`database.py` `DatabaseChooser`) just returns a `SQLiteBackend` handle — it
  writes nothing.
- `SQLiteBackend.register()` (`backends/base.py:381`) registers the name in the `databases` meta
  store and, by default (`write_empty=True`), calls `self.write({}, searchable=False,
  signal=False)` — so a freshly registered database is already empty-but-processed (has a valid,
  loadable `bw_processing` datapackage).
- `SQLiteBackend.new_activity`/`new_node` (`backends/base.py:774`) build an `Activity` proxy
  (`backends/proxies.py:205`) that must be `.save()`d to persist.
- `Activity.new_exchange`/`new_edge` (`backends/proxies.py:529`) build an `Exchange` proxy with
  `output` pre-set to the activity's key; also needs `.save()`.
- For bulk loading (all data already assembled as a dict), skip the per-activity dance and call
  `db.write({(db_name, code): {...}, ...})` directly — this is the path `bw2io` importers use; it
  replaces the database's entire contents in one call.
- Full step-by-step walkthrough with a worked example: `docs/site/tutorials/create-empty-database.html`.
- `docs/site/bw2data/index.html` leads with a short **Examples** teaser (before the reference
  tables) pointing at the site-wide `docs/site/examples/index.html#bw2data` section — three
  verified, runnable scripts: create a database + activity + look it up, chimaera vs.
  non-chimaera node types, and a full biosphere-flow + `Method` + `bw2calc.LCA` round trip. There's
  also a second, `#bw2data-projects` section further down the same examples page (`#ex4`, `#ex5`)
  covering the project lifecycle — see below. Keep this page short: one central Examples page for
  the whole site, a handful of examples per module section, not a page per example.

## Projects & databases on disk (the project lifecycle)

Verified in `project.py` (`ProjectManager`, the `projects` singleton created once at import time,
and `ProjectDataset`, the peewee row backing each project). Worked examples:
`docs/site/examples/index.html#ex4` (list/create/switch/delete projects, see where data lives) and
`#ex5` (multiple databases in one project + a cross-database exchange).

- **Where data lives.** All project data lives under one base directory,
  `projects._base_data_dir`, resolved **once**, when the `projects` singleton is constructed
  (`ProjectManager.__init__` → `_get_base_directories()`, `project.py:356`): if `BRIGHTWAY2_DIR` is
  set and points at an existing directory, that's used; otherwise it falls back to an OS-specific
  per-user data dir via `platformdirs.PlatformDirs("Brightway3", "pylca")`. Because it's resolved
  at import time, `BRIGHTWAY2_DIR` must be set **before** `import bw2data`.
- **Each project's own directory** is `projects.dir` = `base_data_dir /
  safe_filename(project_name, full=full_hash)` (`_project_dir`, `project.py:408`), where
  `safe_filename` (from `bw_processing.filesystem`) slugifies the name and appends an md5 hash — 8
  hex chars by default (`full_hash=False` for newly created projects) or the full 32-char hash if
  `full_hash=True`. Five subdirectories are created inside on first use: `backups`,
  `intermediate`, `lci`, `processed`, `revisions` (`ProjectManager._basic_directories`). Logs live
  separately under `projects.logs_dir` (same base-dir resolution, unaffected by `BRIGHTWAY2_DIR`).
- **Output directory**: `projects.output_dir` (`project.py:463`) — `BRIGHTWAY2_OUTPUT_DIR` env var
  if valid, else `preferences["output_dir"]` if valid, else an auto-created `output` subdir of the
  current project's own directory.
- **Listing/creating/switching**: no separate "create" call — `projects.set_current(name)` creates
  the project implicitly the first time it sees an unknown name (`set_current` → `create_project`,
  `:420`/`:483`). `projects` is iterable, yielding every registered `ProjectDataset` — `sorted(p.name
  for p in projects)` lists them all. A `"default"` project is auto-created the first time the
  `projects` singleton is built at all (`ProjectManager.__init__` calls `set_current("default",
  update=False)`, `:323`).
- **Deleting**: `projects.delete_project(name=None, delete_dir=False)` (`:537`) always unregisters
  the row; only removes the on-disk directory too if `delete_dir=True` (otherwise switching back to
  that name later resumes with the same data). Refuses to delete the last remaining project;
  switches away first if deleting the current one (to `"default"` if present, else an arbitrary
  remaining project).
- **Copying/renaming**: `copy_project(new_name, switch=True)` (`:498`) does a plain
  `shutil.copytree` of the whole project dir under a new hashed name, then registers a new
  `ProjectDataset` row with the same `data`/`full_hash`. `rename_project(new_name)` (`:623`) is
  copy-then-delete-the-old-one — its own docstring/warning calls this "relatively expensive."
- **Housekeeping**: `projects.purge_deleted_directories()` (`:581`) removes any on-disk project
  directory with no matching registered name, returning the count removed.
  `projects.report()` (`:597`) switches into every project in turn and returns `(name, number of
  databases, total size in GB)` tuples.

### FAQ / troubleshooting (grounded in source, not upstream docs)

- **Deleted a project but disk space didn't free up** — expected: `delete_project` defaults to
  `delete_dir=False`. Pass `delete_dir=True`, or batch-clean with `purge_deleted_directories()`.
- **`delete_project(..., delete_dir=True)` raises `AssertionError` on a project that clearly
  exists** — a real gotcha in `project.py:557`: the directory to delete is recomputed as
  `base_data_dir / safe_filename(victim)`, which uses `safe_filename`'s *default* short-hash form
  and does **not** consult that project's actual `full_hash` flag (unlike `projects.dir` /
  `copy_project`, which do). For a project stored under the full 32-char hash — created with
  `full_hash=True`, or an old project backfilled to `full_hash=1` by the `add_full_hash_column`
  migration in this same file — the recomputed path is wrong and `assert dir_path.is_dir()` fails.
  Workaround: delete `projects.dir` yourself while that project is current, or first call
  `projects.use_short_hash()` (`:639`) to convert it.
- **Non-ASCII project name produces a garbled/missing-character directory name** — verified by
  calling `bw_processing.safe_filename` directly: it NFKD-normalizes the name then strips anything
  that isn't a "word" character before appending the hash. `"café project"` cleanly folds to
  `"cafe-project.<hash>"`. But for combining diacritics/marks — e.g. Japanese dakuten-marked
  katakana — NFKD decomposition splits the base character from its mark, and the mark is then
  silently stripped as "not a word character" (a voiced プ "pu" can come out as unvoiced フ "fu").
  This is cosmetic only, not a collision/data-loss risk: the hash suffix is computed from the
  original un-mangled name, so distinct names that fold to the same slug still get distinct
  directories.

## Node types: process / product / chimaera

Verified in `configuration.py` (`MatrixLabels`) and `utils.py`
`set_correct_process_type()`. Three LCI node `type` values
(`labels.lci_node_types`):

- **`"process"`** (`labels.process_node_default`) — pure process node, no
  product data of its own; links to a separate `"product"` node via a
  production edge (`type="production"`).
- **`"product"`** (`labels.product_node_default`) — pure reference-product
  node: name/unit/categories/properties of the product, separate from the
  process that makes it.
- **`"processwithreferenceproduct"`** (`labels.chimaera_node_default`,
  informally a **chimaera** node in the code/docstrings) — one node carries
  *both* the process and its reference product together, via a
  self-referencing production edge (`input == (database, code)` of the node
  itself). Both process data and reference-product data (name, unit, …)
  come back together from a single lookup or search hit on that node.

`Database.write()` (`backends/base.py:675`) auto-classifies every dataset
via `set_correct_process_type()` (`utils.py:420`): an explicit
self-referencing exchange, or no explicit production edge at all (implicit
self-production), sets `type` to the chimaera default (`utils.py:436`,
`:446`). This auto-classification runs **only** through bulk `write()` —
activities built one at a time via `new_activity()`/`.save()` keep whatever
`type` you passed (or none) unless you set it explicitly, so the
Examples-page activities with a self-referencing production exchange are
chimaera-*shaped* but not auto-labeled as such unless written via `write()`.

The reverse split — chimaera/process → separate process + product nodes —
is `bw2io.strategies.products.separate_processes_from_products()`; see
`modules/bw2io/CLAUDE.md`.

`docs/site/examples/index.html#ex2` builds the same steel-production inventory both ways side by
side (via one `write()` call) and prints the resulting `type` of each node — verified output:
`steel-chimaera` → `processwithreferenceproduct`, `steel-process` → `process`, `steel-product` →
`product`.

## Where to look for common questions

- "How is an activity stored on disk?" → `backends/schema.py` (SQL schema) +
  `backends/proxies.py` (`Activity.__getitem__`/`save`)
- "How does bw2data hand off to bw2calc?" → `data_store.py`
  `ProcessedDataStore.process()` (writes a `bw_processing` datapackage) and
  `backends/base.py` `SQLiteBackend.process()`
- "How do projects isolate data?" → `project.py` `ProjectManager`,
  `ProjectDataset` — full lifecycle writeup above ("Projects & databases on
  disk"), including where `BRIGHTWAY2_DIR` fits in and delete/copy/rename
  gotchas
- "How are LCIA methods represented?" → `method.py`, `meta.py` `methods`
- "How do parameterized/formula-driven exchanges work?" → `parameters.py`
  `ParameterManager` (project/database/activity-level parameter classes,
  formula evaluation via `bw2parameters`, `ParameterizedExchange`)
- "How do I look up an activity by key/id?" → `utils.py` `get_node()` /
  `get_activity()`; `backends/schema.py` `get_id(key)`
- "Where are `Node`/`Edge` aliases defined?" → `backends/__init__.py`
  (`Node = Activity`, `Edge = Exchange`)
- "What corresponds to 'functional unit' and 'system boundary' (goal &amp;
  scope definition)?" → there's no dedicated object for either — the
  functional unit is just the `demand` dict passed to `bw2calc.LCA`/
  `MultiLCA` (an amount of one product/activity), and the system boundary is
  implicitly whatever the technosphere graph reachable from that demand via
  `type="technosphere"` exchanges actually includes. See
  `docs/site/tutorials/scope-and-multi-category-impacts.html` for a worked
  cradle-to-gate example and the reasoning behind where the boundary is
  drawn.
