# bw_processing — processed-data / datapackage format

Source: `.venv/lib/python3.11/site-packages/bw_processing/` (installed
version `1.6`, `__version__` in `__init__.py`).

## What it does

Defines Brightway's on-disk **"datapackage"** format: a directory, zip, or
in-memory filesystem holding structured numpy arrays (indices + data +
optional uncertainty/flip/rescale/reference) plus JSON metadata
(frictionless-data-style `datapackage.json` fields), used to store
technosphere/biosphere/characterization matrix data efficiently, with
lazy/streaming/proxy loading. This is the file format `bw2data` writes and
`bw2calc`/`matrix_utils` read to build actual scipy matrices. Uncertainty
type codes stored here are the same codes defined by `stats_arrays`.

## Key files

| File | Role |
|---|---|
| `datapackage.py` | The main API (1700+ lines). `DatapackageBase` (ABC) — common read/query logic; `Datapackage` — the concrete read/write class with all `add_*` methods; `FilteredDatapackage` — read-only view returned by `filter_by_attribute`/`exclude`. Module-level functions `create_datapackage()`, `load_datapackage()`, `simple_graph()` (deprecated). |
| `matrix_entry.py` | Modern, **recommended** high-level API: `MatrixEntry` (frozen dataclass — one row/col/amount/uncertainty entry), `ArrayEntry` (dataclass for a whole scenario-array resource group), `MatrixName` (str Enum: `technosphere`, `biosphere`, `characterization`), `create_datapackage_from_entries()` — builds a `Datapackage` straight from `{MatrixName: [MatrixEntry, ...]}` without touching numpy directly. |
| `constants.py` | `INDICES_DTYPE` (`row`/`col` int64), `UNCERTAINTY_DTYPE` (`uncertainty_type`, `loc`, `scale`, `shape`, `minimum`, `maximum`, `negative`), `MatrixSerializeFormat` (`NUMPY` default / `PARQUET`), `DEFAULT_LICENSES`, `NAME_RE` — the fixed numpy structured dtypes every datapackage array uses. |
| `array_creation.py` | `create_array`, `create_structured_array`, plus low-level helpers `peek`, `get_ncols`, `chunked`, `create_chunked` used to build numpy arrays from iterators/generators in bounded-memory chunks. |
| `param_labels.py` | `StringLabelSchema`, `ParamLabelField`, `ParamLabelSchema`, `AnyLabelSchema` (type alias), `schema_from_json_schema()` — schema helpers for labelling the optional `params_array` attached to a resource group (independent-variable/model-parameter provenance). |
| `indexing.py` | `reindex()`, `reset_index()` — remapping row/col indices in-place (e.g. after merging/renumbering databases); `_get_csv_data()` internal helper. |
| `merging.py` | `merge_datapackages_with_mask()` — combine multiple datapackages, keeping a boolean mask of rows per package; helpers `mask_resource`, `update_nrows`, `add_resource_suffix`, `write_data_to_fs`. |
| `filesystem.py` | `clean_datapackage_name`, `safe_filename`, `md5` — filesystem-safety helpers. |
| `io_helpers.py` | `generic_directory_filesystem()`, `generic_zipfile_filesystem()` — wrap `fsspec`/`DirFileSystem` so a datapackage can live on plain disk or inside a zip; `file_reader()`/`file_writer()` — read/write a single resource (numpy `.npy`, CSV, JSON, or Parquet) given its mimetype, with proxy support. |
| `io_parquet_helpers.py`, `io_pyarrow_helpers.py` | Parquet serialization backend (needs optional `pyarrow`): converting between numpy structured arrays (generic/indices/distributions/matrix dtypes) and pyarrow Tables, then to/from `.parquet` files. Used when `matrix_serialize_format_type=MatrixSerializeFormat.PARQUET`. |
| `unique_fields.py` | `greedy_set_cover`, `as_unique_attributes`, `as_unique_attributes_dataframe` — find a minimal set of fields that uniquely identify each row, for `add_csv_metadata`-style linking data. |
| `proxies.py` | `UndefinedInterface` (placeholder for external, non-persisted data interfaces), `Proxy` (deferred-read wrapper returned when `proxy=True`; calls the stored reader function on first use). |
| `utils.py` | `load_bytes`, `check_name`, `check_suffix`, `as_uncertainty_type`, `dictionary_formatter`, `resolve_dict_iterator` (turns an iterator of dicts/`MatrixEntry.as_dict()` into the separate data/indices/distributions/flip/rescale/reference arrays), `utc_now`. |
| `errors.py` | Exception hierarchy off `BrightwayProcessingError`: `InconsistentFields`, `NonUnique`, `WrongDatatype`, `ShapeMismatch`, `InvalidName`, `FileIntegrityError`, `Closed`, `LengthMismatch`, `InvalidMimetype`, `PotentialInconsistency`. |
| `examples/` | `examples_dir`, `interfaces.py` (`ExampleVectorInterface`, `ExampleArrayInterface`), `parquet_files.py` — bundled example datapackages/interfaces used in bw_processing's own tests and docs. |

## Entry points (`__init__.py` `__all__`)

High-level: `create_datapackage`, `create_datapackage_from_entries`,
`load_datapackage`, `Datapackage`, `DatapackageBase`, `FilteredDatapackage`,
`simple_graph` (deprecated).
Building-block classes: `MatrixEntry`, `ArrayEntry`, `MatrixName`.
Arrays/dtypes: `create_array`, `create_structured_array`, `INDICES_DTYPE`,
`UNCERTAINTY_DTYPE`, `MatrixSerializeFormat`, `DEFAULT_LICENSES`.
Utilities: `reindex`, `reset_index`, `merge_datapackages_with_mask`,
`clean_datapackage_name`, `md5`, `safe_filename`,
`generic_directory_filesystem`, `generic_zipfile_filesystem`,
`as_unique_attributes`, `as_unique_attributes_dataframe`,
`ParamLabelField`, `ParamLabelSchema`, `AnyLabelSchema`,
`StringLabelSchema`, `schema_from_json_schema`, `examples_dir`,
`UndefinedInterface`.

## Where it sits in the pipeline

`bw2data.DataStore.process()` calls into this package to write out
technosphere/biosphere/characterization arrays → `bw2calc`/`matrix_utils`
call `load_datapackage()` to read them back and build live scipy matrices.
Also used directly by `bw2io` importers for staging processed data, and by
`multifunctional`/`randonneur` for storing generated migration/allocation
data.

## Where to look for common questions

- "What does a datapackage actually contain on disk?" →
  `constants.py` (`INDICES_DTYPE`, `UNCERTAINTY_DTYPE`) + `datapackage.py`
  `Datapackage.add_persistent_vector` / `add_persistent_array` (numpy
  `.npy`/`.parquet` files + a JSON metadata resource list, see
  `Datapackage._create` / `finalize_serialization`).
- "How is uncertainty stored?" → `UNCERTAINTY_DTYPE` in `constants.py`,
  paired with `stats_arrays` distribution-type codes (`uncertainty_type`
  int); see `matrix_entry.MatrixEntry` docstring for the field meanings.
- "What's the easiest way to build a datapackage from Python data (no raw
  numpy)?" → `matrix_entry.create_datapackage_from_entries()` with a
  `{MatrixName: [MatrixEntry(...), ...]}` dict; internally goes through
  `Datapackage.add_entries` → `add_persistent_vector_from_iterator` →
  `utils.resolve_dict_iterator`.
- "How do I read a datapackage back?" → `datapackage.load_datapackage()`
  (accepts an `fsspec` filesystem or an existing `DatapackageBase`;
  `mmap_mode`/`proxy=True` for lazy loading), then
  `Datapackage.get_resource(name_or_index)`.
- "How does flip/rescale/reference work?" → per-entry fields on
  `MatrixEntry`/`ArrayEntry`; stored as separate resources
  (`kind="flip"`/`"rescale"`/`"reference"`) alongside the main data/indices
  arrays inside `Datapackage.add_persistent_vector` /
  `add_persistent_array`.
- "How are multiple datapackages combined or reindexed?" →
  `merging.merge_datapackages_with_mask()` and `indexing.reindex()` /
  `indexing.reset_index()`.
- "Numpy vs Parquet serialization?" → `constants.MatrixSerializeFormat`
  (`NUMPY` default, `PARQUET` needs `pyarrow`); conversion logic in
  `io_pyarrow_helpers.py` / `io_parquet_helpers.py`, dispatched from
  `io_helpers.file_reader` / `file_writer`.
