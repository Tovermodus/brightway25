# bw_graph_tools — supply-chain graph traversal

Source: `.venv/lib/python3.11/site-packages/bw_graph_tools/` (PyPI
`bw_graph_tools`, installed `0.10`, `__version__` in `__init__.py`).
Upstream repo: `brightway-lca/bw_graph_tools`.

## What it does

Given an already-solved `bw2calc.LCA` object (technosphere matrix +
characterized biosphere), traverses the technosphere graph — the network of
activities consuming each other's products — to find which parts of the
supply chain contribute the most to the total LCA score. Also has standalone
utilities for finding the "most important" (shortest weighted) path between
two nodes in a technosphere matrix, independent of any traversal run.

## Key files

| File | Role |
|---|---|
| `__init__.py` | Public API — re-exports the traversal classes, `graph_traversal_utils`, and `matrix_tools` symbols. See `__all__` below. |
| `errors.py` | `UnclearProductionExchange` — raised when production-exchange heuristics can't identify a reference exchange for some activity. |
| `matrix_tools.py` | Matrix-level helpers independent of any live LCA object: `to_normalized_adjacency_matrix()` (technosphere → weighted adjacency matrix for path-finding) and the `guess_production_exchanges()` heuristic chain (`gpe_zeroth_heuristic` … `gpe_fifth_heuristic`) for identifying which matrix cells are reference-production exchanges when they aren't simply on the diagonal. |
| `shortest_path.py` | Vendored (BSD-licensed, from scikit-network) `get_distances()` / `get_shortest_path()` — Bellman-Ford/Johnson/Dijkstra shortest-path search over a `scipy.sparse` adjacency matrix. Pure graph algorithm code, no Brightway dependency. |
| `graph_traversal_utils.py` | High-level path helpers built on the above: `get_path_from_matrix(matrix, source, target, algorithm="BF")` (raw matrix indices) and `path_as_brightway_objects(source_node, target_node, lca=None)` (returns `(product_node, activity_node, amount)` triples using real `bw2data` nodes). |
| `testing.py` | `equal_dict` / `edge_equal_dict` / `flow_equal_dict` / `node_equal_dict` — test-only helpers for comparing `Node`/`Edge`/`Flow` dataclass instances against plain dicts (used in the package's own test suite). |
| `graph_traversal/__init__.py` | Sub-package entry point — re-exports all traversal classes and settings; see `graph_traversal/__init__.py` `__all__`. |
| `graph_traversal/base.py` | `BaseGraphTraversal` (Generic base class) — shared `__init__` (builds the synthetic root `Node` for the functional unit, sets up `_caching_solver`), and the `nodes` / `edges` / `flows` properties every traversal subclass exposes. Also `GraphTraversalException`. |
| `graph_traversal/graph_objects.py` | The core dataclasses returned by every traversal: `Node`, `GroupedNodes`, `Edge`, `Flow`. |
| `graph_traversal/settings.py` | `GraphTraversalSettings` (pydantic `BaseModel`: `cutoff`, `biosphere_cutoff`, `max_calc`, `max_depth`, `skip_coproducts`, `separate_biosphere_flows`, `min_coverage_fraction`, `caching_solver`) and `TaggedGraphTraversalSettings` (adds `tags: List[str]`). |
| `graph_traversal/utils.py` | `CachingSolver` (caches per-activity unit LCA scores so repeated visits to the same activity don't re-solve the linear system; has a PARDISO fast path and an iterative fallback), `Counter` (simple mutable counter for unique node ids), `get_demand_vector_for_activity()`. |
| `graph_traversal/new_node_each_visit.py` | **Main traversal implementation**: `NewNodeEachVisitGraphTraversal(BaseGraphTraversal[GraphTraversalSettings])`. Priority-first ("importance-first", not BFS/DFS) traversal that creates a fresh `Node` every time it revisits an activity (so cycles don't get merged). Implements `traverse()`, `_traverse()` (heap-based main loop), `traverse_edges()`, `get_production_exchanges()`, `add_biosphere_flows()`, `get_characterized_biosphere()`, `get_demand_vector_for_activity()`. Also has a deprecated classmethod `calculate()` kept for backwards compatibility. |
| `graph_traversal/same_node_each_visit.py` | `SameNodeEachVisitGraphTraversal(NewNodeEachVisitGraphTraversal)` — variant that reuses one `Node` per unique activity (merges revisits instead of unrolling the graph); overrides `traverse()`, `traverse_edges()`, adds `traverse_from_node()`. |
| `graph_traversal/assumed_diagonal.py` | `AssumedDiagonalGraphTraversal(NewNodeEachVisitGraphTraversal)` — legacy-compatible variant that assumes reference production exchanges sit on the matrix diagonal (skips the general `guess_production_exchanges()` heuristics); overrides `get_production_exchanges()`. |
| `graph_traversal/tagged_nodes.py` | `NewNodeEachVisitTaggedGraphTraversal` / `SameNodeEachVisitTaggedGraphTraversal` — traversal variants that group sibling leaf nodes sharing a tag value (e.g. group by `location`) into synthetic `GroupedNodes`, driven by `TaggedGraphTraversalSettings.tags`. Key methods: `group_nodes_by_tags()`, `group_leaf_nodes_by_parent()`, `create_group_tagged_nodes()`. |

## Entry points (`__init__.py` `__all__`)

```
__version__
AssumedDiagonalGraphTraversal
Edge
Flow
get_path_from_matrix
GraphTraversalSettings
guess_production_exchanges
NewNodeEachVisitGraphTraversal
Node
path_as_brightway_objects
to_normalized_adjacency_matrix
```

Note: `graph_traversal/__init__.py` (the sub-package) additionally exports
`SameNodeEachVisitGraphTraversal`, `NewNodeEachVisitTaggedGraphTraversal`,
`SameNodeEachVisitTaggedGraphTraversal`, and `TaggedGraphTraversalSettings`
— these are **not** re-exported at the top-level `bw_graph_tools` package,
so import them via `bw_graph_tools.graph_traversal.<name>` or
`from bw_graph_tools.graph_traversal import SameNodeEachVisitGraphTraversal`.

## Where it sits in the pipeline

Consumes an already-computed `bw2calc.LCA` object (needs
`technosphere_matrix`, `technosphere_mm` (a `matrix_utils.MappedMatrix`),
and `demand`) plus its solved `characterization_matrix`/`biosphere_matrix`.
Does not read `bw2data` directly for the traversal math itself — only
`graph_traversal_utils.path_as_brightway_objects()` and the doctest/test
helpers touch `bw2data` nodes (guarded by a `try/except ImportError`, so the
package still works if `bw2data` isn't installed). Typically used
interactively or in `bw2analyzer`/UI code to render "what contributes most
to this LCA score" sunburst/tree visualizations.

## Worked examples

Two runnable, verified scripts live on the site-wide examples page:
`docs/site/examples/index.html#ex11` (build a 3-process supply chain, run
`NewNodeEachVisitGraphTraversal`, read `cumulative_score`/`direct_emissions_score`
off `nodes`) and `#ex5` (`path_as_brightway_objects` to find the
dominant/most-important path between two activities, not a full traversal).

## Where to look for common questions

- "How do I run a graph traversal?" → instantiate `bw2calc.LCA`, call
  `.lci()` + `.lcia()`, then construct
  `NewNodeEachVisitGraphTraversal(lca, GraphTraversalSettings(...))` and
  call `.traverse()`; read `nodes`/`edges`/`flows` properties
  (`graph_traversal/base.py`, `graph_traversal/new_node_each_visit.py`).
- "What fields does a traversal result node/edge have?" →
  `graph_traversal/graph_objects.py` — `Node` (cumulative vs. direct
  emissions score fields, `depth`, `terminal`), `Edge` (`consumer_*` /
  `producer_*` indices and unique ids), `Flow` (per-biosphere-flow score).
- "How do cutoffs / depth limits / max calculation count work?" →
  `graph_traversal/settings.py` `GraphTraversalSettings` fields (`cutoff`,
  `biosphere_cutoff`, `max_calc`, `max_depth`, `min_coverage_fraction`) —
  enforced inside `new_node_each_visit.py` `_traverse()` / `traverse()`.
- "How does it find which matrix cell is the reference production
  exchange?" → `matrix_tools.py` `guess_production_exchanges()`, a chain of
  heuristics `gpe_zeroth_heuristic` (explicit `reference` flag, authoritative)
  through `gpe_fifth_heuristic`; raises `errors.UnclearProductionExchange`
  when none apply. `AssumedDiagonalGraphTraversal` skips this and assumes
  the diagonal instead.
- "How do I find the single most important path between two activities
  (not a full traversal)?" → `graph_traversal_utils.py`
  `get_path_from_matrix()` / `path_as_brightway_objects()`, built on
  `matrix_tools.to_normalized_adjacency_matrix()` (log-transformed, sign-
  flipped normalized adjacency matrix so a shortest-path algorithm finds the
  path of *greatest* multiplicative flow) and `shortest_path.get_shortest_path()`.
- "How does traversal avoid re-solving the linear system for repeated
  activities?" → `graph_traversal/utils.py` `CachingSolver` (PARDISO fast
  path in `_unit_scores_pardiso`, iterative fallback in
  `_unit_scores_iterative`), passed in via
  `GraphTraversalSettings.caching_solver` or built automatically.
- "How does node grouping/tagging work (e.g. collapse leaves by location)?"
  → `graph_traversal/tagged_nodes.py`, `TaggedGraphTraversalSettings.tags`,
  `GroupedNodes` dataclass in `graph_traversal/graph_objects.py`.

## Related modules

`bw2calc` (supplies the solved `LCA` object this package traverses),
`bw2data` (supplies the `Node`/`Edge` proxy objects used by
`path_as_brightway_objects`), `matrix_utils` (the `MappedMatrix` type used
by `guess_production_exchanges` and `technosphere_mm`), `bw2analyzer`
(typical consumer of traversal results for reporting/visualization).
