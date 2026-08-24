# matrix_utils

## Purpose

`matrix_utils` (installed version 0.9) turns one or more `bw_processing`
datapackages into `scipy.sparse` matrices. It is the layer that sits between
raw on-disk/in-memory datapackage resources (vectors, arrays, flip/rescale
masks, indices, distributions) and the matrices that `bw2calc` actually
factorizes/solves. Its jobs are:

- Map arbitrary integer row/column ids (e.g. `bw2data` node/activity ids)
  onto dense, zero-based matrix indices (`ArrayMapper`).
- Merge one or more resource groups (from one or more datapackages) that
  target the same named matrix into a single `scipy.sparse.csr_matrix`
  (`MappedMatrix`, `ResourceGroup`).
- Support Monte Carlo / scenario iteration by advancing "indexers" that pick
  which column of an array resource (or which random draw) is currently
  active, then rebuilding the matrix in place (`indexers.py`,
  `MappedMatrix.rebuild_matrix` / `__next__`).
- Build several related matrices that must share the same row/column mapping
  and the same iteration state at once (`MappedMatrixDict`), and combine the
  results with matrix multiplication (`SparseMatrixDict`).

It has no knowledge of LCA semantics (technosphere/biosphere/characterization)
— that meaning is layered on top by `bw2calc`. It only knows about
datapackages, resource groups, indices, and matrices.

## Key files

| File | Role |
|---|---|
| `matrix_utils/__init__.py` | Package version and public API (`__all__`). |
| `matrix_utils/mapped_matrix.py` | `MappedMatrix` — the core class: takes a list of `Datapackage`s + a matrix label, builds a `scipy.sparse.csr_matrix`, wires up indexers, and exposes `input_*` introspection methods. |
| `matrix_utils/mapped_matrix_dict.py` | `MappedMatrixDict` (dict of `MappedMatrix`, all sharing row/col mappers and a global indexer) and `SparseMatrixDict` (dict of plain sparse matrices with `@` support). |
| `matrix_utils/resource_group.py` | `ResourceGroup` — wraps one datapackage "group" of resources (data + indices + optional flip/rescale/distributions/params) that contributes to one matrix; does index mapping, masking, aggregation, and per-group `calculate()`. Also `FakeRNG`, `mask_array`. |
| `matrix_utils/array_mapper.py` | `ArrayMapper` — maps an arbitrary 1-D array of non-negative integer ids to dense `0..n-1` indices, backed by a sparse lookup matrix; used for both row and column mapping. |
| `matrix_utils/indexers.py` | Iteration/scenario state: `Indexer` (base marker), `RandomIndexer`, `SequentialIndexer`, `CombinatorialIndexer`, and `Proxy` (per-resource-group view into a shared `CombinatorialIndexer`). |
| `matrix_utils/aggregation.py` | `aggregate_with_sparse` — sums duplicate `(row, col)` entries via a throwaway `coo_matrix` round-trip; used when a datapackage group has `sum_intra_duplicates` set. |
| `matrix_utils/utils.py` | Free functions used by `MappedMatrix.__init__`: `filter_groups_for_packages`, `has_relevant_data`, `safe_concatenate_indices`, `unroll` (tuple-key merging for `MappedMatrixDict`/`SparseMatrixDict`), `handle_all_arrays_empty` (builds the detailed `AllArraysEmpty` message). |
| `matrix_utils/errors.py` | `MatrixUtilsError` base, plus `AllArraysEmpty`, `NoArrays`, `EmptyArray`, `EmptyInterface`. |

## Entry points (`__init__.py` `__all__`)

```python
__all__ = (
    "__version__",
    "ArrayMapper",
    "CombinatorialIndexer",
    "MappedMatrix",
    "MappedMatrixDict",
    "Proxy",
    "RandomIndexer",
    "ResourceGroup",
    "SequentialIndexer",
    "SparseMatrixDict",
)
```

- `ArrayMapper` — `matrix_utils/array_mapper.py`
- `CombinatorialIndexer`, `RandomIndexer`, `SequentialIndexer`, `Proxy` —
  `matrix_utils/indexers.py`
- `MappedMatrix` — `matrix_utils/mapped_matrix.py`
- `MappedMatrixDict`, `SparseMatrixDict` — `matrix_utils/mapped_matrix_dict.py`
- `ResourceGroup` — `matrix_utils/resource_group.py`

## Where to look

**"How does a datapackage's row/col ids become matrix positions?"**
`ArrayMapper` in `matrix_utils/array_mapper.py`. It dedupes+sorts the id
array, builds a one-column sparse lookup matrix so `array[i] -> index`, and
exposes `map_array()` (returns `-1` for unmapped ids), `to_dict()` /
`reverse_dict()` for debugging. `MappedMatrix.__init__` builds one
`ArrayMapper` for rows and one for columns (skipped for `diagonal=True`)
from all groups' ids, unless `row_mapper`/`col_mapper` are passed in to force
alignment with an existing mapping (e.g. reuse `bw2calc`'s biosphere row
mapping when building a characterization matrix).

**"How do I build a matrix from a set of datapackages?"**
`MappedMatrix(packages=[...], matrix="some_label", ...)` in
`matrix_utils/mapped_matrix.py`. Constructor flow: filter each package's
resource groups down to ones tagged with `matrix="some_label"`
(`utils.filter_groups_for_packages`) → wrap each surviving group in a
`ResourceGroup` → build/attach row & col `ArrayMapper`s → call
`group.map_indices()` on each group → assemble a `scipy.sparse.coo_matrix`
skeleton sized to `(row_mapper.max_index+1, col_mapper.max_index+1)` →
`.tocsr()` → `self.rebuild_matrix()` to fill in data. Raises
`AllArraysEmpty` (via `utils.handle_all_arrays_empty` for a detailed message)
unless `empty_ok=True`.

**"How does Monte Carlo / scenario iteration (advancing to the next
column/sample) work?"**
`matrix_utils/indexers.py` defines the indexer types; each datapackage gets
one indexer (`MappedMatrix.add_indexers`), attached to every `ResourceGroup`
it owns. Calling `next(mapped_matrix)` (i.e. `MappedMatrix.__next__`) calls
`iterate_indexers()` (advances each package's indexer) then
`rebuild_matrix()` (recomputes `row, col, data` per group via
`ResourceGroup.calculate()` and re-fills `self.matrix.data`). Indexer choice
per package (in `add_indexers`): explicit `indexer_override` wins; else
`combinatorial` metadata → `CombinatorialIndexer` (+ per-group `Proxy`
offset); else `sequential` metadata (and no seed override) →
`SequentialIndexer`; else `RandomIndexer` seeded from `seed_override` or the
package's own `seed` metadata. `MappedMatrix.indexers` /
`.local_indexers` / `.indexers_by_type()` / `.indexers_are_unique` are
inspection helpers.

**"How do several matrices (e.g. one per scenario/database) stay
consistent with each other?"**
`MappedMatrixDict` in `matrix_utils/mapped_matrix_dict.py`. It takes a
`dict[key, list[Datapackage]]`, builds one `MappedMatrix` per key but forces
them all to share the same `row_mapper`/`col_mapper` and the same
`global_indexer` (`get_global_indexer`, a `RandomIndexer` or
`SequentialIndexer` unless `indexer_override` is given), so `next(mmd)`
advances every matrix in lockstep. `SparseMatrixDict` is a plain `dict` of
`scipy.sparse` matrices with `__matmul__` overloaded so
`mapped_matrix_dict @ some_sparse_matrix` (or `sparse_matrix_dict @ other`)
produces a new `SparseMatrixDict`/results dict without a Python loop at the
call site; `utils.unroll` merges dict keys that are themselves tuples.

**"What does a single resource group actually contain, and what's the
difference between `.row_mapped` and `.row`?"**
`ResourceGroup` in `matrix_utils/resource_group.py` — read the class
docstring (lines ~28-54) first, it has a worked example. Short version:
`.row_mapped`/`.col_mapped` are the datapackage's raw ids run through the
`ArrayMapper` (may contain `-1` for unmapped/missing ids); `.row`/`.col`
(via `row_matrix`/`col_matrix` used by `MappedMatrix`) are what's actually
inserted into the matrix after optional intra-group aggregation
(`sum_intra_duplicates`, uses `aggregation.aggregate_with_sparse`) and
masking out unmapped/filtered elements (`apply_masks`, `build_mask`).
`ResourceGroup.calculate()` is what `MappedMatrix.rebuild_matrix()` calls
each iteration to get fresh `(row, col, data)`.

**"How do I trace a specific matrix element back to the original
datapackage row it came from, or get uncertainty info for Monte Carlo?"**
The `input_*` methods on `MappedMatrix` (`matrix_utils/mapped_matrix.py`,
roughly lines 317-503): `input_data_vector()`, `input_row_col_indices()`,
`input_raw_indices()` (original ids pre-mapping, same order/length as the
others), `input_rescale_vector()`, `input_flip_vector()`,
`input_provenance()` (which `(datapackage, group_label, slice)` each stacked
element came from), `input_params()`, `input_indexer_vector()`, and
`input_uncertainties()` (builds a `stats_arrays`-compatible distributions
array, using custom uncertainty types `98`=array-estimated and
`99`=interface).

**"What exceptions can this package raise, and when?"**
`matrix_utils/errors.py`: `AllArraysEmpty` (no data at all to build the
requested matrix — raised via `utils.handle_all_arrays_empty`, which builds
a detailed diagnostic listing every candidate resource group and why it was
empty), `EmptyArray` (an `ArrayMapper` was given/asked to map an empty array
without `empty_ok=True`), `EmptyInterface` (a datapackage interface resource
is "dehydrated" and needs rehydrating before it can be used — checked in
`MappedMatrix.__init__`), `NoArrays` (defined but not currently raised
anywhere in this package — kept for API compatibility / external use).

## Where this fits in Brightway

`matrix_utils` consumes `bw_processing.Datapackage` objects (see
`modules/bw_processing/CLAUDE.md`) and is consumed by `bw2calc`
(`modules/bw2calc/CLAUDE.md`), which passes in datapackages assembled by
`bw2data`/`bw2io` and interprets the resulting matrices as
technosphere/biosphere/characterization matrices. The integer ids that
`ArrayMapper` maps to matrix rows/columns are `bw2data` database "row ids".
