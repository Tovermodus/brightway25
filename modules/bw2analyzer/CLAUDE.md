# bw2analyzer — LCA result analysis & post-processing

Source: `.venv/lib/python3.11/site-packages/bw2analyzer/` (PyPI `bw2analyzer`,
installed `0.11.8`). Upstream: `brightway-lca/bw2analyzer` (not directly
readable in this session).

## What it does

Post-processes already-solved `bw2calc.LCA` objects and `bw2data` activities:
contribution analysis (top processes/emissions), comparing activities to each
other, tagged/grouped supply-chain traversal, recursive supply-chain
printing, supply-chain graph manipulation (for `GraphTraversal` results),
database "health checks", simple economic concentration statistics, and
matrix visualization. It does not do any LCA calculation itself — it
consumes results that `bw2calc` and `bw2data` already produced.

## Key files

| File | Role |
|---|---|
| `__init__.py` | Public API (`__all__`) |
| `contribution.py` | `ContributionAnalysis` — sorting/top-N helpers (`sort_array`, `top_matrix`, `top_processes`, `top_emissions`, `annotated_top_processes`, `annotated_top_emissions`, `hinton_matrix`, `d3_treemap`) for finding the biggest contributors in an LCA's technosphere/biosphere matrices |
| `comparisons.py` | Compare activities: `compare_activities_by_lcia_score`, `compare_activities_by_grouped_leaves`, `find_differences_in_inputs`, plus helpers `aggregated_dict`, `compare_dictionaries`, `find_leaves`, `group_leaves`, `get_cpc`, `get_value_for_cpc` |
| `tagged.py` | Tag-based supply-chain traversal/aggregation: `traverse_tagged_databases`, `recurse_tagged_database`, `aggregate_tagged_graph`; multi-LCIA-method variants `multi_traverse_tagged_databases`, `multi_recurse_tagged_database`, `multi_aggregate_tagged_graph`; cumulative-impact helpers `get_cum_impact`, `get_multi_cum_impact` |
| `sc_graph.py` | `GTManipulator` — post-processes `bw2calc` `GraphTraversal`-style `nodes`/`edges` results: `unroll_graph` (let an activity appear multiple times), `simplify`/`simplify_naive` (collapse below a cutoff), `add_metadata`, `d3_force_directed`, `d3_treemap` (D3.js-ready JSON structures) |
| `page_rank.py` | `PageRank` — runs Google-style PageRank over a database's technosphere matrix (`ConvergenceError` raised if the power iteration doesn't converge) to rank activities by "importance" |
| `health_check.py` | `DatabaseHealthCheck` — sanity-checks a whole `bw2data` `Database`: `unique_exchanges`, `uncertainty_check`, `multioutput_processes`, `aggregated_processes`, `no_self_production`, `page_rank()` (delegates to `page_rank.py`), `make_graphs()`/`check()` (uses `matrix_grapher.py`) |
| `matrix_grapher.py` | `SparseMatrixGrapher` — matplotlib scatter-plots of a sparse matrix's non-zero structure (`graph`, `magnitude_graph`, `ordered_graph` — the latter reorders via `reverse_cuthill_mckee`) |
| `lci.py` | `get_labeled_inventory(lca)` — turns `lca.inventory` into a `pandas.DataFrame` with activity-metadata `MultiIndex` rows/columns |
| `econ.py` | Plain economic concentration/inequality statistics on arrays: `gini_coefficient`, `herfindahl_index`, `concentration_ratio`, `theil_index` (used e.g. to describe how concentrated LCA contributions are) |
| `utils.py` | `print_recursive_calculation`, `print_recursive_supply_chain` (human-readable recursive traversal/printing, top-level `__all__` entries), plus `contribution_for_all_datasets_one_method`, `recursive_calculation_to_object`, `infinite_alphabet` |
| `report.py` | `SerializedLCAReport` — Monte Carlo + treemap + force-directed report builder; **not exported** in `__init__.py` (`__all__` entry is commented out), import directly as `bw2analyzer.report.SerializedLCAReport` if needed |
| `version.py` | `version = (0, 11, 8)`, re-exported as `bw2analyzer.__version__` |

## Entry points (`__init__.py` `__all__`)

```python
from bw2analyzer import (
    compare_activities_by_grouped_leaves,
    compare_activities_by_lcia_score,
    ContributionAnalysis,
    DatabaseHealthCheck,
    find_differences_in_inputs,
    GTManipulator,
    PageRank,
    print_recursive_calculation,
    print_recursive_supply_chain,
    traverse_tagged_databases,
)
```
Note: `report.SerializedLCAReport` is defined but deliberately commented out
of `__all__`/the top-level import in `__init__.py` — it is not part of the
stable public surface.

## Worked examples

Three runnable, verified scripts live on the site-wide examples page:
`docs/site/examples/index.html#ex13` (`ContributionAnalysis.annotated_top_processes`/
`annotated_top_emissions` on a solved LCA), `#ex7`
(`compare_activities_by_lcia_score` across two candidate processes), and `#ex8`
(`print_recursive_calculation` for a quick console supply-chain trace).

## Where to look

**"I have a solved `bw2calc.LCA`, how do I find its biggest contributors?"**
→ `contribution.py` `ContributionAnalysis` — call `.annotated_top_processes(lca)`
or `.annotated_top_emissions(lca)` for human-readable (score, amount, activity)
tuples; `.top_matrix()`/`.sort_array()` are the lower-level numeric building
blocks. Both funnel through `sort_array` (line ~6, default `limit=25`), which
sorts by `abs(value)` descending — a large negative (avoided-burden credit)
ranks as "top" too. Crucially, each row is that activity/flow's own **direct**
contribution (its own row/column sum of `lca.characterized_inventory`, already
scaled by the solved supply amount) — not a rolled-up subtree total, so a
functional-unit activity with no biosphere exchanges of its own scores `0.0`
even though everything downstream of it is what's being ranked. For a
recursive, percentage-of-parent breakdown instead, use `utils.py`
`print_recursive_calculation` (needs a method) or `tagged.py`
`traverse_tagged_databases` to aggregate by a custom tag. `names=True`
(default) costs one `bw2data.get_activity()` call per row — pass
`names=False` when ranking many rows and metadata isn't needed yet. Full
runnable worked example (multi-process system, GWP-weighted CO₂ vs. CH₄):
[docs/site/tutorials/contribution-analysis.html](../../docs/site/tutorials/contribution-analysis.html).

**"How do I compare two activities / see why their LCA scores differ?"**
→ `comparisons.py`: `compare_activities_by_lcia_score` (band-based ranking of
several activities by score) and `compare_activities_by_grouped_leaves` /
`find_differences_in_inputs` (diff the underlying leaf-level inputs, using
`find_leaves`/`group_leaves`).

**"How do I group/aggregate impacts by a custom tag (not just by activity)?"**
→ `tagged.py` `traverse_tagged_databases` (single method) and
`multi_traverse_tagged_databases` (several LCIA methods at once); tags come
from an activity/exchange `"tag"` key (configurable `label` arg), falling
back to `default_tag`.

**"How do I turn a `GraphTraversal` result into something visualizable
(D3 treemap / force-directed graph), or simplify it?"**
→ `sc_graph.py` `GTManipulator` — `unroll_graph`, `simplify`/`simplify_naive`,
`d3_treemap`, `d3_force_directed`.

**"How do I sanity-check a whole database for data-quality issues?"**
→ `health_check.py` `DatabaseHealthCheck(database).check()` — bundles
duplicate/unlinked exchange checks, uncertainty-distribution sanity checks,
multi-output/self-production checks, and PageRank-based importance ranking.

**"How do I get the inventory as a labeled DataFrame, or print a
human-readable recursive supply-chain trace?"**
→ `lci.py` `get_labeled_inventory(lca)` for the DataFrame;
`utils.py` `print_recursive_calculation` (LCIA-weighted, needs a method) and
`print_recursive_supply_chain` (unweighted amounts only) for console output.

**"Where do the concentration/inequality stats (Gini, Herfindahl, Theil)
live?"** → `econ.py` — plain functions over numpy arrays, no LCA objects
involved; commonly applied to `ContributionAnalysis` output arrays.
