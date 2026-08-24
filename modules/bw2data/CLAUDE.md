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
- Full step-by-step walkthrough with a worked example: `docs/site/tutorials/create-empty-database.html`
  — module 1 of the site's LCA software course (`docs/site/tutorials/index.html`), which continues
  through `bw2calc` (module 2), `bw2io` (module 3), and parameterized exchanges (module 7).
- `docs/site/bw2data/index.html` leads with a short **Examples** teaser (before the reference
  tables) pointing at the site-wide `docs/site/examples/index.html#bw2data` section — three
  verified, runnable scripts: create a database + activity + look it up, chimaera vs.
  non-chimaera node types, and a full biosphere-flow + `Method` + `bw2calc.LCA` round trip. Keep
  this page short: one central Examples page for the whole site, a handful of examples per
  module section, not a page per example.

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
  `ProjectDataset`
- "How are LCIA methods represented?" → `method.py`, `meta.py` `methods`
- "How do parameterized/formula-driven exchanges work?" → `parameters.py`
  `ParameterManager` (project/database/activity-level parameter classes,
  formula evaluation via `bw2parameters`, `ParameterizedExchange`)
- "How do I look up an activity by key/id?" → `utils.py` `get_node()` /
  `get_activity()`; `backends/schema.py` `get_id(key)`
- "Where are `Node`/`Edge` aliases defined?" → `backends/__init__.py`
  (`Node = Activity`, `Edge = Exchange`)
