# bw2calc — LCA calculation engine

Source: `.venv/lib/python3.11/site-packages/bw2calc/` (PyPI `bw2calc`,
installed `2.5.0`). Upstream: `brightway-lca/bw2calc` (not directly readable
in this session).

## What it does

Turns `bw_processing` datapackages (built from `bw2data`) into scipy sparse
matrices (via `matrix_utils`) and solves them for LCA scores: technosphere
demand → supply vector → inventory → characterized impact. This is the
actual "calculation" in Brightway.

## Key files

| File | Role |
|---|---|
| `lca_base.py` | `LCABase(Iterator)` — abstract base: matrix-building plumbing (`load_lci_data`, `decompose_technosphere`, `solve_linear_system`, `lci()`, `lcia()`, `normalize()`, `weight()`), dictionary managers, shared by all LCA variants |
| `lca.py` | `LCA(LCABase)` — the main, standard sparse LCA: builds technosphere/biosphere/characterization/normalization/weighting matrices, solves `A x = f` (technosphere) then `B x` (inventory) then `C · (B x)` (impact); also `to_dataframe()` for tidy results and `switch_method()`/`switch_normalization()`/`switch_weighting()` |
| `dense_lca.py` | `DenseLCA(LCA)` — same but with dense (numpy) matrices instead of sparse; useful for small/debugging cases |
| `caching_lca.py` | `CachingLCA(LCA)` — reuses a factorized technosphere solver across repeated `lci()` calls for speed |
| `iterative_lca.py` | `IterativeLCA(LCA)` — iterative (non-direct-solve, e.g. `scipy.sparse.linalg.cg`-style) technosphere solving |
| `jacobi_gmres_lca.py` | `JacobiGMRESLCA(LCA)` — Jacobi-preconditioned GMRES iterative solver variant |
| `least_squares.py` | `LeastSquaresLCA(LCA)` — least-squares solve, e.g. for overdetermined/non-square systems |
| `partitioned_lca.py` | `PartitionedMonteCarloLCA(Iterator)` — Monte Carlo LCA that pre-solves a static background system once, then samples only a stochastic foreground partition each iteration; `_find_production_exchanges()` uses `bw_graph_tools` heuristics to locate interface products |
| `multi_lca.py` | `MultiLCA(LCABase)` — many functional-unit × method combinations solved together over one shared factorized technosphere; `DemandsValidator(BaseModel)` (pydantic) validates input demand dicts; `.scores` returns a `{(fu_key, method_key): value}` dict |
| `fast_scores.py` | `FastScoresOnlyMultiLCA(MultiLCA, FastSupplyArraysMixin)` — skips storing full inventory/characterized matrices, only accumulates final scores (perf-oriented, for large MC-style batches) |
| `method_config.py` | `MethodConfig(BaseModel)` — pydantic config describing which impact categories, normalizations, and weightings to use and how they relate; feeds `MultiLCA` |
| `dictionary_manager.py` | `ReversibleRemappableDictionary(Mapping)` + `DictionaryManager` — maps between database row ids and matrix row/col indices (the "mapping" layer); `resolved()` decorator lazily resolves a `partial`-built dict on first use |
| `result_cache.py` | `ResultCache(Mapping)` — cache for repeated per-activity results (e.g. reused across Monte Carlo iterations) |
| `restricted_sparse_matrix_dict.py`, `single_value_diagonal_matrix.py`, `fast_supply_arrays.py`, `grid.py` | Lower-level numerical/matrix helper structures used by the solvers above (`SingleValueDiagonalMatrix` builds the demand-array diagonal; `FastSupplyArraysMixin` backs `fast_scores.py`) |
| `utils.py` | Helpers: `get_seed()`, `consistent_global_index()`, `wrap_functional_unit()`, `get_datapackage()`, `utc_now()` |
| `errors.py` | `bw2calc`-specific exceptions, all subclassing `BW2CalcError` (e.g. `OutsideTechnosphere`, `NonsquareTechnosphere`, `EmptyBiosphere`, `CyclicDependencyGraph`, `StaticDependsOnStochastic`) |
| `log_utils.py` | Logging configuration helpers (`log_config` passed to `LCA.__init__`) |

## Solver backend selection (see `__init__.py`)

At import time, tries `pypardiso` (AMD/Intel fast solver) → falls back to
`scikit-umfpack` (ARM) → falls back to `scipy.sparse.linalg.{factorized,
spsolve}`; module-level `PYPARDISO`/`UMFPACK` booleans record which was
found. Also optionally wires in `presamples.PackagesDataLoader` if the
`presamples` package is installed (`PackagesDataLoader = None` otherwise).

## Entry points (`__init__.py` `__all__`)

`LCA`, `DenseLCA`, `CachingLCA`, `IterativeLCA`, `JacobiGMRESLCA`,
`LeastSquaresLCA`, `MultiLCA`, `FastScoresOnlyMultiLCA`,
`PartitionedMonteCarloLCA`, `MethodConfig`.

## Typical flow

```python
lca = bc.LCA({activity: 1}, method=("some", "method"))
lca.lci()    # solve technosphere -> supply array -> biosphere flows
lca.lcia()   # apply characterization matrix -> lca.score
```
Internally `lci()`/`lcia()` (defined on `LCABase`, `lca_base.py`) build
matrices from the `bw2data`-processed datapackages using
`matrix_utils.MappedMatrix`, then solve with scipy/pypardiso/umfpack
depending on what's installed.

## Worked examples

`docs/site/examples/index.html#bw2calc` has two full runnable scripts beyond
the single-method/single-FU case in bw2data's example 3: running
`MultiLCA` over multiple impact categories and functional units at once
(`docs/site/examples/index.html#ex6`), and a stochastic `use_distributions=True`
Monte Carlo LCA seeded with `seed_override` for reproducible output
(`docs/site/examples/index.html#ex7`). Key points verified there:

- `MultiLCA.__init__` (`multi_lca.py` ~line 79) takes `demands: dict[str,
  dict[int, float]]` (functional unit *names* → `{node_id: amount}`, integer
  ids only — no `(database, code)` keys or `Node` objects, unlike `LCA`) and
  `method_config: MethodConfig | dict` with an `impact_categories` list.
  `bw2data.compat.get_multilca_data_objs(functional_units, method_config)`
  (`bw2data/compat.py` ~line 152) builds the matching `data_objs` list —
  it's the `MultiLCA` analogue of `prepare_lca_inputs()`.
- After `mlca.lci(); mlca.lcia()`, `MultiLCA.scores` (`multi_lca.py` ~line
  415) is a `dict` keyed `(impact_category_tuple, functional_unit_name)` →
  score (verified by running example 4, not assumed from the docstring).
- `LCA(demand, method, use_distributions=True, seed_override=42)` makes the
  `LCA` object (it's an `Iterator`, see `lca_base.py` `LCABase(Iterator)`)
  re-sample every uncertain matrix entry on each `next(lca)` call and
  recompute `lca.score`; `seed_override` makes that sampling reproducible
  run-to-run (verified: same seed → identical mean/std/min/max over 1000
  iterations in example 5). Uncertainty is set per-exchange in `bw2data`
  before `.save()`, e.g. `exc["uncertainty type"] = 3; exc["loc"] = 1.8;
  exc["scale"] = 0.2` — field name has a literal space, and the integer id
  matches `stats_arrays.UncertaintyType` (normal == 3); see
  `bw2data/proxies.py` `ExchangeDataset.uncertainty`/`uncertainty_type`
  (~line 246). For a full worked example — multiple uncertain exchanges
  (normal + lognormal), building a distribution of scores, and comparing two
  scenarios with `scipy.stats.ttest_ind` — see
  [docs/site/tutorials/monte-carlo-uncertainty.html](../../docs/site/tutorials/monte-carlo-uncertainty.html).
- `use_arrays=True` is the sibling flag for **scenario** (array-based, not
  random) iteration — same `next(lca)` mechanism, different data source.

## Where to look for common questions

- "How does the technosphere get solved?" → `lca_base.py`
  `LCABase.solve_linear_system()` / `LCABase.lci()`; the actual `A x = f`
  call for the default solver is in `lca.py`
- "How does Monte Carlo uncertainty work?" → the simplest path is plain
  `LCA(demand, method, use_distributions=True, seed_override=...)` +
  repeated `next(lca)` (see Worked examples below, example 5, and the
  step-by-step
  [Monte Carlo uncertainty tutorial](../../docs/site/tutorials/monte-carlo-uncertainty.html));
  for a large system where only a foreground subset is stochastic,
  `partitioned_lca.py` `PartitionedMonteCarloLCA` pre-solves the static
  background once and samples only the stochastic partition per iteration.
  Both ultimately sample via `stats_arrays` (the distributions) +
  `bw_processing`/`matrix_utils` (how uncertain params are stored on disk
  and turned into a `next()`-able matrix).
- "How do multiple methods/functional units run together efficiently?" →
  `multi_lca.py` `MultiLCA`, `method_config.py` `MethodConfig`,
  `fast_scores.py` `FastScoresOnlyMultiLCA` for the score-only fast path;
  worked example: Worked examples below, example 4
- "Where do errors like 'activity not in technosphere' come from?" →
  `errors.py` (e.g. `OutsideTechnosphere`, `NonsquareTechnosphere`,
  `MalformedFunctionalUnit`)
- "How does row/col index <-> database id mapping work?" →
  `dictionary_manager.py` `DictionaryManager`, exposed on an LCA object as
  `lca.dicts.activity` / `.product` / `.biosphere`
- "How do I get results as a DataFrame?" → `lca.py` `LCA.to_dataframe()`
