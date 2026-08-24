# mrio_common_metadata — shared metadata helpers for MRIO/EXIOBASE datapackages

Source: `.venv/lib/python3.11/site-packages/mrio_common_metadata/` (installed
version `0.2.1`, `version` tuple in `version.py`).

## What it does

A small, mostly-static-data package that defines and reads the common
frictionless-data-style `datapackage.json` metadata format used for
multi-region input-output (MRIO) datasets such as EXIOBASE hybrid
supply-use/input-output tables. The runtime API (`__init__.py`) reads a
directory containing a `datapackage.json` plus bz2-compressed CSV resource
files and returns Python dicts/iterators. The `conversion/` subpackage
holds one-off scripts (with hardcoded EXIOBASE version metadata) that
convert raw EXIOBASE `.xlsb`/spreadsheet source files into that common
datapackage format — this is what `bw2io`'s EXIOBASE importer relies on
having been run ahead of time to produce the packaged data files it loads.

## Key files

| File | Role |
|---|---|
| `__init__.py` | The public runtime API: `list_resources()`, `get_metadata_resource()`, `get_numeric_data_iterator()`, plus private helpers `_get_valid_dirpath`, `_get_resources`, `_get_resource`, `_get_foreign_key` that all read a directory's `datapackage.json`. Also contains a large block of commented-out legacy/draft code (`MissingDataPackage`, `get_datapackage`, `check_resources_integrity`, etc.) — dead code, not part of the current API. |
| `utils.py` | Low-level I/O helpers: `md5()` (file hash), `load_compressed_csv()` / `iterate_compressed_csv()` (read a bz2-compressed CSV resource file, all-at-once or row-by-row), `load_compressed_csv_as_dataframe()` (same, but returns a pandas `DataFrame` indexed by the resource's `primaryKey`, using the resource's own `datapackage.json`-style metadata dict for field names). |
| `version.py` | `version = (0, 2, 1)` tuple, exposed as `__version__` in `__init__.py`. |
| `conversion/__init__.py` | Empty — just makes `conversion` a package. |
| `conversion/exiobase_3_hybrid_io/` | Conversion pipeline for the EXIOBASE 3 hybrid **input-output** (IO) table format. |
| `conversion/exiobase_3_hybrid_io/__init__.py` | Orchestration functions: `convert_exiobase(sourcedir, targetdir=None, version="3.3.17 hybrid")` (top-level entry point — runs the full extraction), `package_exiobase()` (assembles/writes the final `datapackage.json` + resources), `load_metadata()`, `extract_extension_exchanges()`, `extract_production_exchanges()`, `extract_io_exchanges()` (the big row/col "IO table" extraction, `sparse=True` by default), `extract_metadata()` (reformats raw EXIOBASE classification sheets into common `extension`/`location`/`activity`/`product` records via nested `reformat_*` functions). |
| `conversion/exiobase_3_hybrid_io/datapackage.py` | Static `DATAPACKAGE` dict — the frictionless-data-style datapackage skeleton (name, id, licenses, description, version `"3.3.17"`, sources, contributors, `resources` list with schemas) used as the template written out by `package_exiobase()`. |
| `conversion/exiobase_3_hybrid_io/utils.py` | IO-specific conversion helpers: `read_xlsb()` / `convert_xlsb()` (read Excel binary `.xlsb` sheets via `pyxlsb`), `extract_with_pandas()`, `write_compressed_csv()`, `get_numeric_data_iterator()`, `get_headers()`, `md5()` (local copy, not imported from the top-level `utils.py`). |
| `conversion/exiobase_3_hybrid_io/version_config.py` | `VERSIONS` dict keyed by version string (e.g. `"3.3.17 hybrid"`) — hardcodes, per version, which source spreadsheet filenames/worksheets/column-name mappings to use for `nomenclature` (extensions, locations, activities, products) and numeric data sheets. This is what makes `convert_exiobase()`/`extract_*` version-aware instead of hardcoded to one release. |
| `conversion/exiobase_3_hybrid_su/` | Same conversion pipeline, but for the EXIOBASE 3 hybrid **supply-use** (SU) table format (separate supply and use tables/sheets rather than one combined IO table). Structurally mirrors `exiobase_3_hybrid_io/`. |
| `conversion/exiobase_3_hybrid_su/__init__.py` | `convert_exiobase(sourcedir, version="3.3.17 hybrid")` (note: no `targetdir` param, unlike the IO variant — SU writes are apparently expected relative to a fixed layout), `package_exiobase(version)`, `load_metadata(kind)`, `extract_extension_exchanges()`, `extract_su_exchanges(sourcedir, version, kind)` (separate supply/use extraction, dispatched by `kind`), `extract_io_exchanges()`, `extract_metadata()` (same `reformat_*` pattern as the IO variant). |
| `conversion/exiobase_3_hybrid_su/datapackage.py` | Static `DATAPACKAGE` skeleton dict for the SU variant (same shape/purpose as the IO version's). |
| `conversion/exiobase_3_hybrid_su/utils.py` | SU-specific conversion helpers: `read_xlsb()`, `convert_xlsb()`, `extract_with_pandas()`, `write_compressed_csv()`, `get_numeric_data_iterator()`, `get_headers()`, `md5()` — parallels `exiobase_3_hybrid_io/utils.py` with minor signature differences (e.g. `read_xlsb(..., pbar_total=None)` for progress bars). |
| `conversion/exiobase_3_hybrid_su/version_config.py` | `VERSIONS` dict, same role as the IO variant's but describing the SU source spreadsheet layout for each supported EXIOBASE version. |

## Entry points (`__init__.py` `__all__`)

```python
__all__ = ("get_metadata_resource", "get_numeric_data_iterator", "list_resources")
```

- `list_resources(dirpath)` — return the list of resource `name`s declared in `dirpath/datapackage.json`.
- `get_metadata_resource(dirpath, resource_name)` — load one metadata resource's compressed CSV and return it as a list of `dict`s keyed by the resource's schema field names.
- `get_numeric_data_iterator(dirpath, resource_name)` — for a numeric (row, col, value) resource with exactly two `foreignKeys`, yield `(row_metadata_dict, col_metadata_dict, float_value)` tuples, resolving both foreign keys to their referenced metadata resources first.

`__version__` is also exported (from `version.py`).

Note: `conversion/*` functions are **not** re-exported from the top-level
package `__init__.py` — they must be imported explicitly, e.g.
`from mrio_common_metadata.conversion.exiobase_3_hybrid_io import convert_exiobase`.

## Where to look

- **"How do I read an already-built MRIO datapackage (e.g. one bw2io ships/uses for EXIOBASE)?"** → top-level `__init__.py`: `list_resources()` to see what's there, `get_metadata_resource()` for lookup tables (locations, activities, products), `get_numeric_data_iterator()` for the actual matrix data (IO/SU tables), which resolves foreign keys via `_get_foreign_key()`.
- **"What does a `datapackage.json` for this format look like?"** → `conversion/exiobase_3_hybrid_io/datapackage.py` or `conversion/exiobase_3_hybrid_su/datapackage.py` — the static `DATAPACKAGE` template dict shows the full frictionless-data resource/schema/foreignKeys structure that `__init__.py`'s reader functions expect.
- **"How is a raw EXIOBASE `.xlsb` download turned into this datapackage format?"** → `conversion/exiobase_3_hybrid_io/__init__.py`'s `convert_exiobase()` (or the SU equivalent in `conversion/exiobase_3_hybrid_su/__init__.py`) is the entry point; it calls `extract_metadata()`, `extract_extension_exchanges()`, `extract_production_exchanges()`/`extract_su_exchanges()`, `extract_io_exchanges()`, then `package_exiobase()` to assemble everything using `utils.write_compressed_csv()`.
- **"Where are per-version source file/sheet names configured?"** → `conversion/exiobase_3_hybrid_io/version_config.py` and `conversion/exiobase_3_hybrid_su/version_config.py`, both a `VERSIONS` dict keyed by version string (e.g. `"3.3.17 hybrid"`), listing source `.xlsx`/`.xlsb` filenames, worksheet names, and column-name → schema-field mappings for the nomenclature (extensions/locations/activities/products) and numeric sheets.
- **"How is the compressed CSV data itself read/written?"** → `utils.py` (top-level) for the generic reader (`load_compressed_csv`, `iterate_compressed_csv`, `load_compressed_csv_as_dataframe`) used by the runtime API; `conversion/exiobase_3_hybrid_{io,su}/utils.py` for the conversion-time writer `write_compressed_csv()` and `.xlsb` extraction helpers (`read_xlsb`, `convert_xlsb`, `extract_with_pandas`).
