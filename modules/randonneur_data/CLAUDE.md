# randonneur_data

## Purpose

`randonneur_data` is a small data-store package: it bundles a set of pre-built
[randonneur](../randonneur/CLAUDE.md) migration/mapping datapackages (JSON files describing
`create`/`replace`/`update`/`delete`/`disaggregate` operations between two named data
sources, e.g. `ecoinvent-3.9.1-cutoff` → `ecoinvent-3.10-cutoff`, or `SimaPro-9` →
`ecoinvent-3.10-cutoff`) and a `Registry` class for looking them up, adding new ones, and
reading their contents. It has essentially no logic of its own beyond dict-like storage
and (de)compression — the actual migration *engine* that applies these datapackages lives
in the separate `randonneur` package.

Version installed: `0.7.2` (see `__version__` in `__init__.py`).

## Key files

| File | Role |
|---|---|
| `__init__.py` | Entire package logic: `Registry` class (`MutableMapping` over `registry.json`), `DEFAULT_DATA_DIR`, `DATA_LABELS` constant, `__version__`. |
| `data/registry.json` | The index: a JSON dict of `{dataset_name: metadata}` for every bundled datapackage — 57 entries. Metadata per entry includes `name`, `description`, `source_id`, `target_id`, `graph_context`, `contributors`, `licenses`, `version`, `created`, `filename`, `compression`, and a `mapping` block (source/target field-expression schema). |
| `data/*.json` | Uncompressed datapackage files (used when the raw JSON is small, < ~200KB). |
| `data/*.gz` | Gzip-compressed datapackage files (used for larger datapackages) — read transparently by `Registry.get_file()`. |

### Sample of bundled datasets (from `data/registry.json`)

The 57 registered datapackages fall into a few families (dataset names, not file paths):

- **ecoinvent version-to-version migrations** — biosphere and cutoff, e.g.
  `ecoinvent-3.9.1-cutoff-ecoinvent-3.10-cutoff`, `ecoinvent-3.7.1-cutoff-ecoinvent-3.8-cutoff`,
  `ecoinvent-3.8-biosphere-ecoinvent-3.9-biosphere`, plus many `*-biosphere-ecoinvent-3.12-biosphere-transitive`
  chains bringing old biosphere flows forward to ecoinvent 3.12.
- **SimaPro → ecoinvent** — e.g. `simapro-ecoinvent-3.10-cutoff`, `simapro-ecoinvent-3.5-apos`,
  `simapro-ecoinvent-3.5-consequential`, `simapro-9-ecoinvent-3-context`,
  `simapro-2025-biosphere-ef-3.1-biosphere-ecoinvent-3.12-biosphere-transitive`.
- **Agribalyse / Agrifootprint → ecoinvent** — e.g.
  `agribalyse-3.1.1-restore-simapro-ecoinvent-names`,
  `agribalyse-3.1.1-delete-aggregated-ecoinvent`,
  `agrifootprint-biosphere-ecoinvent-3.10-biosphere`.
- **Generic/standard units & context normalization** — `generic-brightway-unit-conversions`,
  `generic-brightway-units-normalization`, `standard-units-harmonization`,
  `ecoinvent-2.2-biosphere-context-ecoinvent-3.0-biosphere-context`.

Each entry's `graph_context` says what graph objects the datapackage modifies (typically
`["edges"]` for biosphere/flow mappings or `["nodes"]` for activity/product renames).

## Entry points (`__all__`)

```python
__all__ = (
    "__version__",
    "DEFAULT_DATA_DIR",
    "Registry",
)
```

- `randonneur_data.__version__` — package version string (`"0.7.2"`).
- `randonneur_data.DEFAULT_DATA_DIR` — `Path` to the bundled `data/` directory
  (`Path(__file__).parent.resolve() / "data"`).
- `randonneur_data.Registry` — the main class; see below.

## `Registry` class (in `__init__.py`)

`Registry` is a `collections.abc.MutableMapping` keyed by dataset name, backed by
`registry.json` on disk (no in-memory cache — every read/write reloads/rewrites the whole
JSON file).

- `Registry(filepath: Optional[Path] = None)` — `filepath` overrides which registry JSON
  to use; defaults to `DEFAULT_DATA_DIR / "registry.json"`. `self.data_dir` is set to
  `filepath.parent`, i.e. wherever the registry JSON lives, and datapackage files are
  resolved relative to it.
- Dict protocol: `registry[name]`, `registry[name] = metadata_dict`, `del registry[name]`,
  `name in registry`, `len(registry)`, `iter(registry)`, `.keys()/.values()/.items()`
  (inherited from `MutableMapping`) — these all operate on the *metadata* dicts, not the
  full datapackage contents.
- `get_file(label: str) -> dict` — loads and returns the **full datapackage JSON** for
  dataset `label` (decompressing gzip/lzma transparently based on the registry metadata's
  `compression` field). This is the main way to get actual migration data out.
- `schema(label: str) -> dict` — shortcut for `get_file(label)["mapping"]`, the
  source/target field-expression schema.
- `sample(label: str, number: int = 2, verb: Optional[str] = None) -> dict` — returns a
  random sample of `number` transformation entries per verb (`create`/`replace`/`update`/
  `delete`/`disaggregate`) for quick inspection without loading everything.
- `add_file(filepath: Path, replace: bool = False) -> Path` — validates (via
  `validate_file`) and copies an external datapackage JSON into `data_dir`, gzip-compressing
  it first if > 200 KB, then registers its metadata under `data["name"]`. Returns the new
  path.
- `validate_file(filepath: Path) -> None` — validates a datapackage JSON's `contributors`,
  `mapping`, and per-verb data against `randonneur.validation` schemas. **Raises
  `ImportError` if the `randonneur` package is not installed** — this is the only place
  `randonneur_data` depends on `randonneur`.
- `__str__` — human-readable multi-line summary of every registered file (name,
  description, source/target ids, graph_context, authors, version, licenses); used by
  `print(registry)`.
- `__repr__` — one-line summary with `data_dir`, count, and `id()`.

`DATA_LABELS = {"create", "replace", "update", "delete", "disaggregate"}` — the five verb
keys a datapackage's top-level JSON may contain; used by `sample()` to know which keys are
"data" vs. metadata.

## Where to look

- **"How do I find what migration datasets are available?"** → `Registry()` and iterate it
  (`for name in registry:`) or `print(registry)` for the formatted `__str__` output; each
  key is a dataset name registered in `data/registry.json`.
- **"How do I get the actual migration data (the create/replace/... lists) for a dataset?"**
  → `Registry().get_file(name)` in `__init__.py` — handles gzip/lzma decompression
  transparently.
- **"How do I know what fields/expressions a datapackage's source and target use?"** →
  `Registry().schema(name)`, or read `mapping` directly from `get_file(name)` / the
  registry metadata.
- **"How do I add a new bundled datapackage?"** → `Registry.add_file()` in `__init__.py`;
  note it requires `randonneur` installed (calls `validate_file`, which imports
  `randonneur.validation`).
- **"Where are the actual JSON/gz data files?"** → `randonneur_data/data/` next to
  `__init__.py`; `registry.json` is the index, everything else is one file per dataset
  (`.json` if small, `.gz` if compressed).
- **"What applies these migrations to real data?"** → not this package — see the separate
  `randonneur` package (`modules/randonneur/CLAUDE.md`), which is the engine that consumes
  datapackages like these.
- **"Who calls `Registry.get_file()` during an actual bw2io import?"** →
  `bw2io`'s `importers/base_lci.py` `LCIImporter.randonneur(label=..., ...)`
  (line ~675, no `datapackage=` given) — internally
  `randonneur.migrate_edges_with_stored_data`/`migrate_nodes_with_stored_data`
  build a `randonneur_data.Registry(data_registry_path)` and call
  `.get_file(label)` to fetch the datapackage by name, e.g. one of the
  ecoinvent-version or SimaPro-to-ecoinvent entries listed above. See
  `modules/bw2io/CLAUDE.md`.
