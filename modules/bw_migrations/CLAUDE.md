# bw_migrations

## Purpose

`bw_migrations` is a small, standalone utility package for applying **curated
data migrations** to LCA datasets while they are still plain Python
dicts/lists (i.e. before they are written into a `bw2data` database). A
"migration" here is a lookup table that maps `(field, field, ...)` tuples
(e.g. `(name, categories)`) from one naming/unit convention to another,
optionally rescaling numeric values (amount, uncertainty parameters,
formulas) by a multiplier/disaggregation factor along the way.

It ships with one bundled migration file,
`data/exiobase-3-ecoinvent-3.6.json`, which maps EXIOBASE 3 biosphere flow
names/compartments onto ecoinvent 3.6 biosphere flow names/categories/units.
It is used by `bw2io` import strategies (and similar import pipelines) as a
building block — it does not itself read/write any Brightway database; it
only transforms in-memory data structures (and, optionally, joins against a
`bw2data.Database` to resolve flow ids).

Version: `0.2` (see `version.py`).

## Key files

| File | Role |
|---|---|
| `__init__.py` | Package entry point. Sets `__version__` and `__all__`. Defines `load_and_clean_exiobase_3_ecoinvent_36_migration()`, a pandas-based helper that turns the bundled exiobase→ecoinvent migration JSON into a tidy/exploded DataFrame, optionally joined against an ecoinvent biosphere `Database` to attach `id`s. |
| `strategies.py` | Core migration engine: `get_migration()` (resolve a migration by name/path/dict/Mapping into a loaded dict), `modify_object()` (apply one migration replacement dict to one data object, including rescaling), `migrate_data()` (generator that applies a migration to a whole iterable of data dicts). |
| `utils.py` | Low-level numeric helpers: `get_uncertainty_type()` (reads the uncertainty-type field from a data dict, defaulting to 0/undefined) and `rescale_object()` (rescales `amount`, `formula`, and the `stats_arrays`-style uncertainty parameters — normal, lognormal, triangular, uniform — of an object by a constant factor). |
| `version.py` | `version = (0, 2)` tuple, imported by `__init__.py` as `__version__`. |
| `data/exiobase-3-ecoinvent-3.6.json` | Bundled migration data file. JSON dict with keys `fields` (`["name", "categories"]`), `data` (list of `[[value, value, ...], replacement_or_list_of_replacements]` pairs), `license`, `version`, `contributors`, `missing flows`, `comment`. Loaded via `get_migration("exiobase-3-ecoinvent-3.6")`. |

There is no `strategies.py`-adjacent "Migration" class and no on-disk write
API in this version of the package — the large block of commented-out code
at the bottom of `__init__.py` (`create_core_migrations`) references a
`Migration` class and several `get_*_migration_data()` functions that do
**not** exist anywhere in this package; treat that block as dead/aspirational
code, not a real API.

## Entry points (from `__init__.py.__all__`)

- `get_migration(location)` — actually defined in `strategies.py`, re-exported here.
- `migrate_data(data, migration)` — actually defined in `strategies.py`, re-exported here.
- `load_and_clean_exiobase_3_ecoinvent_36_migration(ecoinvent_biosphere_name=None, explode=False)` — defined in `__init__.py` itself.

## Where to look

**"How do I load a bundled or custom migration by name?"**
`strategies.get_migration(location)`. Accepts: a `Mapping` (returned as-is),
a `Path` to an existing JSON file, a string path to an existing JSON file,
or a bare string name (e.g. `"exiobase-3-ecoinvent-3.6"`) that is resolved
against `strategies.DATA_DIR` (`bw_migrations/data/`) by matching
`<location>.json`. Raises plain `ValueError` if none of these match.

**"How do I actually apply a migration to a list of data dicts?"**
`strategies.migrate_data(data, migration)`. It builds a `lookup` dict keyed
by `tuple(row[field] for field in migration["fields"])` and, for each row in
`data`, yields the row unchanged on a `KeyError` (no match), or yields the
row modified by `strategies.modify_object()` when a match is found. If the
matched replacement is a list of dicts, the row is deep-copied and
multiplied out — one yielded row per replacement dict (this is how one
source flow can be split into several target flows).

**"How does rescaling on migration work (multiplier/disaggregation)?"**
`strategies.modify_object(obj, dct)` computes
`scale = dct.get("__disaggregation__", 1) * dct.get("__multiplier__", 1)`; if
`scale != 1` it calls `utils.rescale_object(obj, scale)` (requires an
`amount` key on `obj`, else raises `ValueError`), then copies every key from
`dct` except `__disaggregation__`/`__multiplier__` onto `obj`. See
`utils.rescale_object()` for exactly how `amount`, `loc`, `scale`,
`minimum`/`maximum`, and `formula` are each rescaled per uncertainty type
(`stats_arrays` type ids: undefined/no-uncertainty, normal, lognormal,
triangular, uniform — anything else raises `ValueError`).

**"Where does the EXIOBASE↔ecoinvent biosphere mapping live, and how do I
get it as a clean DataFrame instead of the raw migration JSON?"**
`__init__.load_and_clean_exiobase_3_ecoinvent_36_migration()`. It loads
`"exiobase-3-ecoinvent-3.6"` via `get_migration`, expands the raw
`fields`/`data` pairs into a pandas DataFrame with columns
`exiobase name`, `exiobase compartment`, `ecoinvent name`,
`ecoinvent unit`, `ecoinvent categories`, `multiplier`, `disaggregation`,
and a combined `factor` column. Pass `ecoinvent_biosphere_name=<db name>` to
left-merge against `bw2data.Database(<db name>)` and add a `biosphere index`
(`id`) column. Pass `explode=True` to keep one row per replacement instead
of the default grouped/aggregated-to-list form (grouped by
`("exiobase name", "exiobase compartment")`).

**"What does the raw migration JSON schema look like?"**
See `data/exiobase-3-ecoinvent-3.6.json` directly, or read
`strategies.get_migration`/`strategies.migrate_data` together. Top-level
keys: `fields` (list of field names used as the lookup key), `data` (list of
`[key_tuple_as_list, replacement]` pairs, where `replacement` is either a
single dict or a list of dicts — each dict may carry `__multiplier__` /
`__disaggregation__` plus any real fields to overwrite, e.g. `name`,
`unit`, `categories`), `license`, `version`, `contributors`,
`missing flows` (a plain list of source-side names/labels with no mapping
found), `comment` (free-text caveats from the data curator).

**"How does this relate to `bw2io`'s own `Migration` class?"** Different
mechanisms with overlapping names. `bw2io.migrations.Migration` (see
`modules/bw2io/CLAUDE.md`) is a per-project, on-disk-registered `DataStore`
applied automatically by most importers' strategy lists
(`migrate_datasets`/`migrate_exchanges`), with a plain `"multiplier"` rescale
key. This package's `get_migration`/`migrate_data` are standalone functions
with no project/registration step — load a JSON file or dict directly and
call `migrate_data(data, migration)` yourself — using dunder-style
`__multiplier__`/`__disaggregation__` rescale keys instead. See
[docs/site/examples/index.html#ex6](../../docs/site/examples/index.html#ex6)
for `bw2io`'s own `Migration` mechanism in action (verified/runnable).

**"Is there a way to register/write new named migrations to disk?"**
Not in this version. `get_migration` only *reads* migrations (bundled JSON,
an arbitrary file path, or an in-memory `Mapping`); there is no writer/save
API despite the commented-out `create_core_migrations()` sketch at the
bottom of `__init__.py` referencing a `Migration` class — that class is not
defined anywhere in the installed package.
