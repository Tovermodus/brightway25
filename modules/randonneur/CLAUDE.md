# randonneur

## Purpose

`randonneur` (installed version 0.7.2) is a generic, data-driven engine for
**migrating/patching a graph of nodes and edges** — applying a JSON-diff-like
set of transformations ("migrations") to arbitrary dict-shaped data. It knows
nothing about LCA semantics; it just knows about "nodes" (dicts) that
optionally contain a list of "edges" (dicts nested under an `edges` key, or
whatever `MigrationConfig.edges_label` says), and a `migrations` dict keyed by
verb (`create`, `replace`, `update`, `delete`, `disaggregate`) whose values are
lists of `{"source": {...}, "target": {...}}` (plus `disaggregate`'s
`{"source": ..., "targets": [...]}`) transformation objects.

In Brightway, this is the mechanism used to reconcile mismatched identifiers
across data sources (e.g. renamed/relocated activities or biosphere flows
between ecoinvent versions, or between SimaPro/ecoinvent naming and
Brightway's own). The actual migration *data* (which old name maps to which
new name) lives in the separate `randonneur_data` package and is applied
*through* `randonneur`'s functions; `randonneur` itself ships no LCA-specific
data, only the `MappingConstants` reference expression-language constants and
the transformation engine.

It also provides:
- `Datapackage` — a builder/validator/serializer for migration data files
  (the JSON files `randonneur_data` and others distribute).
- Excel template helpers (`create_excel_template`/`read_excel_template`) so
  non-programmers can author transformation data in a spreadsheet.

## Key files

| File | Role |
|---|---|
| `randonneur/__init__.py` | Public API (`__all__`), version `0.7.2`. |
| `randonneur/config.py` | `MigrationConfig` (pydantic `BaseModel`) — all the knobs controlling how migrations are matched/applied: `mapping`, `node_filter`, `edge_filter`, `fields`, `verbose`, `edges_label`, `verbs`, `case_sensitive`, `add_extra_attributes`, `add_conversion_factor_to_nodes`. Has an extensive docstring with runnable examples for every field. |
| `randonneur/datapackage.py` | `Datapackage` class — builds a migration-data JSON file: metadata (name, description, contributors, licenses, mapping, graph_context), `add_data(verb, data)` (validates via `validation.validate_data_for_verb`), `to_json()`/`from_json()`. |
| `randonneur/generic_transformation.py` | `generic_transformation()` — the shared engine both `migrate_edges` and `migrate_nodes` delegate to: applies `config.mapping` relabeling, filters verbs, builds a `FlexibleLookupDict` per verb, then loops over the graph (per-node for edges, per-verb for nodes) calling the right dispatch function. |
| `randonneur/edges.py` | `migrate_edges()` / `migrate_edges_with_stored_data()` — top-level edge-migration entry points. Dispatch table `verb_dispatch` maps verb name → function in `edge_functions.py`. |
| `randonneur/nodes.py` | `migrate_nodes()` / `migrate_nodes_with_stored_data()` — top-level node-migration entry points, mirrors `edges.py`. Dispatch table maps to `node_functions.py`. |
| `randonneur/edge_functions.py` | Per-verb edge implementations: `migrate_edges_create`, `migrate_edges_delete`, `migrate_edges_disaggregate`, `migrate_edges_replace`, `migrate_edges_update` (delegates to `_replace`). Also `WarningSemaphore` (avoids repeating the "no edges_label found" warning for every node). |
| `randonneur/node_functions.py` | Per-verb node implementations: `migrate_nodes_create`, `migrate_nodes_delete`, `migrate_nodes_update`. `migrate_nodes_replace` and `migrate_nodes_disaggregate` are **not implemented** (`raise NotImplementedError`) — node-level replace/disaggregate isn't supported, only edge-level. |
| `randonneur/templates.py` | `create_excel_template()` / `read_excel_template()` — generate/parse an `.xlsx` workbook (via `xlsxwriter`/`openpyxl`) so migration data can be authored outside JSON; references `ROLES`, `MAPPINGS`, `LICENSES` constant lists. |
| `randonneur/validation.py` | Pydantic models `Contributor`, `MappingFields`, `DatapackageMetadata` used by `Datapackage`; `validate_data_for_verb(verb, data, mapping)` checks that every transformation's `source`/`target` keys are present in the datapackage's declared `mapping` (raises `errors.UnmappedData` otherwise). |
| `randonneur/constants.py` | `MappingConstants` — canned `mapping` dicts (JSONPath/XPath expressions + labels) for common source formats: `SIMAPRO_CSV`, `ECOSPOLD2`, `ECOSPOLD1_BIO`, `ECOSPOLD2_BIO`, `ECOSPOLD2_BIO_FLOWMAPPER`, `ILCD_BIO`. Used when authoring `Datapackage` metadata describing where a migration's data came from. |
| `randonneur/licenses.py` | `LICENSES` dict — SPDX-style license metadata blocks (CC-BY-4.0, CC0-1.0, MIT, ODbL-1.0, etc.) keyed by short name; `Datapackage` defaults to `LICENSES["CC-BY-4.0"]`. |
| `randonneur/utils.py` | `apply_mapping()` (relabels `source`/`target` keys per `MigrationConfig.mapping`), `rescale_edge()` (multiplies an edge's `amount`/numeric fields by a conversion factor), `right_case()`, `FlexibleLookupDict` (the core lookup structure — a dict-like keyed by frozen `(field, value)` tuples built from each transformation's `source`, supporting `fields` filtering and case-(in)sensitivity), `SAFE_VERBS`, `EXCLUDED_ATTRS`. |
| `randonneur/errors.py` | Exception classes: `UnmappedData`, `WrongGraphContext`, `MultipleTransformations`, `ConflictingConversionFactors`. |

## Entry points (`__init__.py` `__all__`)

```python
__all__ = (
    "__version__",
    "create_excel_template",
    "Datapackage",
    "errors",
    "MappingConstants",
    "migrate_edges",
    "migrate_edges_with_stored_data",
    "migrate_nodes",
    "migrate_nodes_with_stored_data",
    "MigrationConfig",
    "read_excel_template",
    "utils",
)
```

- `migrate_edges`, `migrate_edges_with_stored_data` — `randonneur/edges.py`
- `migrate_nodes`, `migrate_nodes_with_stored_data` — `randonneur/nodes.py`
- `MigrationConfig` — `randonneur/config.py`
- `Datapackage` — `randonneur/datapackage.py`
- `MappingConstants` — `randonneur/constants.py`
- `create_excel_template`, `read_excel_template` — `randonneur/templates.py`
- `errors`, `utils` — modules re-exported directly (`randonneur/errors.py`, `randonneur/utils.py`)

## Where to look

**"How do I actually apply a set of migrations to my data?"**
`migrate_nodes(graph, migrations, config=None)` and
`migrate_edges(graph, migrations, config=None)` in `randonneur/nodes.py` /
`randonneur/edges.py`. Both mutate `graph` in place and return it. Use
`migrate_nodes` when the transformation targets whole node/process-level
records; use `migrate_edges` when it targets exchanges/flows nested inside
each node's `edges` list.

**"How do I load a pre-built migration dataset (e.g. from `randonneur_data`)
instead of writing the `migrations` dict myself?"**
`migrate_edges_with_stored_data(graph, label, data_registry_path=None,
config=None)` / `migrate_nodes_with_stored_data(...)` in `edges.py`/`nodes.py`
— thin wrappers that pull `migrations = Registry(data_registry_path).get_file(label)`
from `randonneur_data.Registry`, verify `"edges"`/`"nodes"` is in the data's
declared `graph_context` (raising `errors.WrongGraphContext` if not), then
call `migrate_edges`/`migrate_nodes`.

**"Why didn't my transformation match / apply?"**
Matching logic lives in `FlexibleLookupDict` (`randonneur/utils.py`) — it
indexes transformations by `(field, value)` pairs from each `source` object
and is looked up with `migration_fld[node_or_edge]`; a `KeyError` (silently
caught, transformation skipped) means no transformation's `source` fully
matched. Check `MigrationConfig.fields` (restricts which keys are compared),
`MigrationConfig.case_sensitive` (default `False`), and
`MigrationConfig.mapping` (relabels your data's keys via `utils.apply_mapping`
before matching — see the extensive docstring in `randonneur/config.py`).

**"What are the five transformation verbs and what does each one do?"**
`create` (append new nodes/edges — implemented in `node_functions.py`/
`edge_functions.py`; for edges, only appends into nodes passing
`config.node_filter`, else warns via `WarningSemaphore`), `replace`/`update`
(same implementation for edges — `migrate_edges_update` just calls
`migrate_edges_replace`; overwrites matched fields, rescales `amount` if a
`conversion_factor`/`allocation` is present via `utils.rescale_edge`),
`delete` (removes matched nodes/edges), `disaggregate` (splits one edge into
several via a transformation's `targets` list, each carrying its own
`allocation` factor — edge-only; `migrate_nodes_disaggregate` raises
`NotImplementedError`). Node-level `replace`/`disaggregate` are unimplemented
by design — see `randonneur/node_functions.py`.

**"How do I build/validate a new migration-data JSON file (a
"randonneur datapackage")?"**
`Datapackage` in `randonneur/datapackage.py`: construct with
`name`/`description`/`contributors`/`mapping_source`/`mapping_target`/etc
(validated against `validation.DatapackageMetadata`/`MappingFields`), call
`.add_data(verb, data)` per verb (validated against `validation.
validate_data_for_verb`, which cross-checks each transformation's
`source`/`target` keys against the declared mapping and raises
`errors.UnmappedData` on mismatch), then `.to_json(filepath)` or
`.to_json()` for an in-memory string. `MappingConstants`
(`randonneur/constants.py`) supplies ready-made `mapping_source` values for
common formats (SimaPro CSV, ecospold2, ILCD, etc). Round-trip with
`Datapackage.from_json(filepath)`.

**"Can non-developers author migration data without writing JSON?"**
Yes — `create_excel_template(data, filepath, replace_existing=False)` and
`read_excel_template(filepath, ...)` in `randonneur/templates.py` generate/
parse an Excel workbook covering the same `create`/`replace`/`update`/
`delete`/`disaggregate` structure, using the `ROLES`/`MAPPINGS`/`LICENSES`
constants defined at the top of that file.
