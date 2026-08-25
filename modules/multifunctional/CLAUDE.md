# multifunctional

Installed at `.venv/lib/python3.11/site-packages/multifunctional/`, version `1.1.1`.
Upstream repo: `brightway-lca/multifunctional`.

## Purpose

`multifunctional` extends `bw2data` with a database backend and node classes that
handle **multifunctional processes** — activities with more than one functional
(reference) input and/or output edge. Plain square-matrix LCA can't handle such
processes directly, so this package resolves them via one of three strategies per
process/database:

1. `skip_allocation` — the database was hand-built to already be square.
2. **Substitution** — a functional edge is credited against another process's output.
3. **Allocation** — the multifunctional process is split into several read-only,
   single-output "allocated" processes (one per functional product), using a
   pluggable allocation strategy (e.g. by economic `price`, `mass`, `equal` split, or
   any numeric process/product `property`). This is the core feature of the package.

It plugs into `bw2data` as a database backend (`backend="multifunctional"`) — see
`__init__.py`, which registers itself into `bw2data`'s
`DATABASE_BACKEND_MAPPING` and `NODE_PROCESS_CLASS_MAPPING` at import time.
`bw2data/__init__.py` itself does `import multifunctional` (best-effort), so simply
having this package installed activates the plugin for any database created with
`backend="multifunctional"`.

## Key files

| File | Role |
|---|---|
| `__init__.py` | Package entry point. Builds `__all__`, registers `MultifunctionalDatabase` into `bw2data.subclass_mapping.DATABASE_BACKEND_MAPPING["multifunctional"]` and `multifunctional_node_dispatcher` into `NODE_PROCESS_CLASS_MAPPING["multifunctional"]`. Also adds `"readonly_process"` to `bw2data.labels.process_node_types` / `lci_node_types`. |
| `database.py` | `MultifunctionalDatabase(SQLiteBackend)` — the database backend class. Overrides `write()` (labels multifunctional nodes, fills in missing exchange `input`s) and `process()` (runs `.allocate()` on every multifunctional node before building the `bw_processing` datapackage). |
| `node_classes.py` | `BaseMultifunctionalNode(Activity)`, `MaybeMultifunctionalProcess(BaseMultifunctionalNode)` (default node class; has `.allocate()`), `ReadOnlyProcessWithReferenceProduct(BaseMultifunctionalNode)` (generated, immutable, single-output process produced by allocation). |
| `node_dispatch.py` | `multifunctional_node_dispatcher(node_obj)` — picks `ReadOnlyProcessWithReferenceProduct` vs `MaybeMultifunctionalProcess` based on the stored node `type`. This is the callable registered as `NODE_PROCESS_CLASS_MAPPING["multifunctional"]`. |
| `edge_classes.py` | `ReadOnlyExchange(Exchange)` / `ReadOnlyExchanges(Exchanges)` — immutable exchange proxies (`save`/`delete`/`__setitem__` all raise `NotImplementedError`) used when iterating a read-only allocated process's edges. |
| `allocation.py` | The actual allocation math. `generic_allocation(act, func, ...)` splits one multifunctional process dict into N single-output process dicts using a per-edge factor from `func`. `get_allocation_factor_from_property(edge_data, node, property_label, ...)` reads a numeric `property` off an edge/product. `property_allocation(property_label, ...)` builds a strategy function bound to a given property. `allocation_strategies` dict = built-in strategies: `"price"`, `"mass"`, `"equal"`, `"manual_allocation"`. |
| `custom_allocation.py` | Tooling to add/validate custom property-based allocation strategies. `add_custom_property_allocation_to_project(property_label, ...)` registers a new strategy and persists it to project metadata (`projects.dataset.data["multifunctional.custom_allocations"]`), restored on project switch via `update_allocation_strategies_on_project_change` (connected to the `bw2data.project_changed` signal). `list_available_properties`, `check_property_for_allocation`, `check_property_for_process_allocation` validate that a property exists/is numeric on all functional edges before you use it for allocation; return `PropertyMessage` objects (see `MessageType` enum) describing problems. |
| `utils.py` | Data-prep/bookkeeping helpers called from `MultifunctionalDatabase.write()`/allocation/save flows: `allocation_before_writing`, `label_multifunctional_nodes` (tags nodes `type="multifunctional"` when they have >1 functional exchange), `add_exchange_input_if_missing`, `update_datasets_from_allocation_results` (writes allocation output back as real `ReadOnlyProcessWithReferenceProduct` nodes/edges), `product_as_process_name` (SimaPro-style naming), `set_correct_process_type` (decides `multifunctional` / `process` / `processwithreferenceproduct` / chimaera type on save), `purge_expired_linked_readonly_processes` (deletes stale read-only processes from a prior allocation run, keyed by `mf_allocation_run_uuid`). |
| `supplemental.py` | `add_product_node_properties_to_exchange` — merges a linked product node's `properties` onto the functional edge dict before allocation, so allocation factors can reference product-level properties. |
| `errors.py` | `NoAllocationNeeded` (sentinel return value), `MultipleFunctionalExchangesWithSameInput` (exception). |

## Entry points (from `__init__.py` `__all__`)

- `MultifunctionalDatabase` — the database backend class (`bd.Database(name, backend="multifunctional")` returns/uses this).
- `MaybeMultifunctionalProcess`, `ReadOnlyProcessWithReferenceProduct` — node classes.
- `allocation_strategies` — dict of built-in allocation strategy callables (`"price"`, `"mass"`, `"equal"`, `"manual_allocation"`).
- `generic_allocation`, `property_allocation` — allocation building blocks (in `allocation.py`).
- `add_custom_property_allocation_to_project`, `check_property_for_allocation`, `check_property_for_process_allocation`, `list_available_properties` — custom/validated property-based allocation (in `custom_allocation.py`).
- `allocation_before_writing` — helper to allocate a dict-of-datasets before writing (in `utils.py`).
- `__version__` — `"1.1.1"`.

Note: `multifunctional_node_dispatcher` (in `node_dispatch.py`) is used internally and
registered into `bw2data`'s mapping, but is **not** exported in `__all__`.

## Worked examples

Three runnable, verified scripts live on the site-wide examples page:
`docs/site/examples/index.html#ex16` (build a multifunctional process with two
functional edges carrying a `price` property and write it against
`Database(backend="multifunctional")` — writing auto-runs `.allocate()`),
`#ex17` (re-run `.allocate()` with `"price"` / `"mass"` / `"equal"` and
compare the resulting `mf_allocation_factor`s on the parent's functional
exchanges), and `#ex18` (run `bw2calc.LCA` against one of the resulting
`ReadOnlyProcessWithReferenceProduct` nodes — the whole point of allocation:
a normal square-matrix LCA on a single co-product, which isn't possible on
the multifunctional process directly).

For a slower-paced, explanatory walkthrough of the same territory (one worked
refinery example, built up section by section with commentary — not a
copy of the examples above), see the tutorial:
[docs/site/tutorials/multifunctional-allocation.html](../../docs/site/tutorials/multifunctional-allocation.html).
It covers: why plain square-matrix LCA can't handle a multi-output process,
building a two-product process with `price`/`mass` properties on each
functional edge, inspecting the `mf_allocation_factor`s that `write()` fills
in automatically, re-running `.allocate()` with different strategies to show
the same physical process yielding different per-co-product LCA scores, and
running `bw2calc.LCA` on one of the resulting allocated co-products —
including a from-first-principles sanity check that the allocated scores sum
back to the parent's total.

Note on writing multifunctional data: don't set an explicit `"input"` on a
functional exchange unless it already points at an existing product node —
`add_exchange_input_if_missing` (`utils.py`) marks a same-key `"input"` as
`mf_artificial_code` and `generic_allocation` (`allocation.py`) strips it back
off before generating a fresh product/process code; a manually supplied
`"input"` pointing at a node that doesn't exist yet raises `UnknownObject`
when the datapackage is built. Also, `MultifunctionalDatabase.process()` runs
allocation unconditionally on `write()`, so a `default_allocation` (on the
database or the node) must be set *before* the first `write()` call, or it
raises `ValueError`.

## Where to look

**Q: How does a database created with `backend="multifunctional"` actually get multifunctional behavior?**
A: `__init__.py` runs `DATABASE_BACKEND_MAPPING["multifunctional"] = MultifunctionalDatabase` and
`NODE_PROCESS_CLASS_MAPPING["multifunctional"] = multifunctional_node_dispatcher` at import time.
`bw2data.Database()` (via `DatabaseChooser`) and its node-class dispatch consult these
mappings, so `bd.Database("x", backend="multifunctional")` transparently becomes a
`MultifunctionalDatabase`, and each node gets wrapped by whichever class
`node_dispatch.multifunctional_node_dispatcher()` returns.

**Q: Where does allocation actually run, and when?**
A: `MultifunctionalDatabase.process()` in `database.py` calls `node.allocate(...)` on every
node where `node.multifunctional` is true, before calling `super().process()` (which builds
the `bw_processing` datapackage consumed by `bw2calc`). The per-node logic is
`MaybeMultifunctionalProcess.allocate()` in `node_classes.py`, which resolves the strategy
label (`skip_allocation` / node `default_allocation` / database `default_allocation`) and
calls into `allocation_strategies[label]`, ultimately `generic_allocation()` in `allocation.py`.

**Q: How do I add a custom allocation strategy (e.g. allocate by `"volume"` property)?**
A: `custom_allocation.add_custom_property_allocation_to_project("volume")` in
`custom_allocation.py` — registers a new entry in `allocation_strategies` and persists it
to the current project so it survives project switches (restored by
`update_allocation_strategies_on_project_change`, wired to the `bw2data.project_changed`
signal). Validate the property first with `check_property_for_allocation()` /
`list_available_properties()`.

**Q: What is a "read-only" process and why can't I edit it?**
A: `ReadOnlyProcessWithReferenceProduct` in `node_classes.py` — the single-output process
generated by allocation for each functional product of a multifunctional process. Its
`__setitem__`, `copy()`, `new_edge()` all raise `NotImplementedError`, and its exchanges
are wrapped in `ReadOnlyExchange`/`ReadOnlyExchanges` (`edge_classes.py`), which likewise
block `save()`/`delete()`/`__setitem__`. You must edit the parent multifunctional process
instead (`.parent` property points back to it via `mf_parent_key`); re-running allocation
regenerates/replaces the read-only processes.

**Q: How does multifunctional distinguish a "multifunctional" node from a normal process?**
A: `BaseMultifunctionalNode.multifunctional` (`node_classes.py`) — true when more than one
exchange has `functional=True` (see `.functional_edges()`). `utils.set_correct_process_type()`
is called on every `save()` (from `MaybeMultifunctionalProcess.save()`) and sets the node's
`type` field to `"multifunctional"`, `"process"`, `"processwithreferenceproduct"`, or a
chimaera type accordingly.

**Q: How are stale read-only processes from a previous allocation run cleaned up?**
A: `utils.purge_expired_linked_readonly_processes()`, called from
`MaybeMultifunctionalProcess.save()`. Each allocation run stamps a fresh
`mf_allocation_run_uuid` on the parent (see `generic_allocation()` in `allocation.py`);
any `readonly_process` node whose `mf_parent_key` matches but whose UUID is stale gets
deleted.

**Q: What built-in allocation strategies exist, and what data do they need?**
A: `allocation.py`'s `allocation_strategies` dict: `"price"` and `"mass"` (property
allocation normalized by production amount), `"equal"` (factor `1.0` per functional edge),
`"manual_allocation"` (uses a `manual_allocation` property directly, not normalized). All
are built from `property_allocation()` / `get_allocation_factor_from_property()`, which
read a numeric value from an edge's or its linked product's `properties` dict.
