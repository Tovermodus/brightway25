# bw_simapro_csv — SimaPro CSV export parser

Source: `.venv/lib/python3.11/site-packages/bw_simapro_csv/` (PyPI
`bw_simapro_csv`, installed `0.4.3`). Upstream: `brightway-lca/bw_simapro_csv`
(not directly readable in this session).

## What it does

Parses SimaPro's proprietary CSV export format (processes, LCIA methods, or
product stages) into plain Python dicts/lists — dates, numbers, formulas,
uncertainty distributions, units, and elementary/technosphere flows are all
cleaned and normalized. It does **not** touch `bw2data` itself; it is a
standalone, low-level reader. `bw2io.importers.simapro_csv.SimaProCSVImporter`
is the main consumer — it wraps this package's output to build
bw2data-compatible datasets, though `SimaProCSV.to_brightway()` here also
produces a bw2io-flavoured JSON dict directly for process exports.

## Key files

| File | Role |
|---|---|
| `__init__.py` | Public API — imports `ftfy` (registers the `sloppy-windows-1252` codec used to read mis-encoded files) and re-exports `SimaProCSV`, `SimaProCSVType` |
| `main.py` | `SimaProCSV` — the top-level orchestrator class: reads the header, walks the file line-by-line splitting it into logical "blocks", dispatches each block to the right parser class, then resolves cross-block parameters and unit conversions |
| `header.py` | `SimaProCSVType` (`processes`/`methods`/`stages` enum), `SimaProCSVHeader` (pydantic model of the file's `{...}` preamble: delimiter, decimal/date separators, project name, libraries, booleans like `skip_empty_fields`), `parse_header()` — reads and translates the header lines (handles French/Dutch/Italian/German label translations) |
| `csv_reader.py` | `BeKindRewind` — a one-step-rewindable iterator wrapping `csv.reader`, needed because SimaPro sometimes omits the `End` block terminator so the reader has to "look ahead" and back up; `clean(s)` strips control chars, fixes `\x7f`-as-linebreak, and runs `ftfy` encoding repair |
| `constants.py` | `CONTEXT_MAPPING` (LCIA/metadata biosphere category names → unit-process block names, e.g. `"Airborne emissions"` → `"Emissions to air"`); `MAGIC` — the `" ⧺ "` separator used to join multiple comment/reference strings |
| `cas.py` | `calculate_check_digit(cas)`, `validate_cas_string(cas)` — CAS registry number checksum validation/normalization for substance flows |
| `units.py` | `normalize_units(blocks)` — post-processing pass run once per file: converts every exchange amount/formula/uncertainty distribution from its declared unit to the project's reference unit, using the `Units` blocks as a conversion table; warns on missing or inconsistent unit conversions |
| `uncertainty.py` | `distribution(...)` — converts SimaPro's `kind`/`field1..3` uncertainty columns into a `stats_arrays`-style dict (`Undefined`, `Lognormal`, `Normal`, `Triangle`, `Uniform`), with sanity checks that fall back to `undefined_distribution()` on invalid parameters; `recalculate_uncertainty_distribution(dist, scale)` rescales a distribution after a unit conversion; `clean_simapro_uncertainty_fields()` strips the raw SimaPro fields once converted |
| `parameters.py` | Formula/parameter plumbing shared across scopes: `prepare_formulas()` (fixes SimaPro formula quirks — leading zeros, `IF(...)`/`Iff(...)` syntax via `fix_iff_formula`/`fix_leading_zero_formula`), `add_prefix_to_uppercase_input_parameters()`, `build_substitutes()`, `FormulaSubstitutor`/`OnlySelectedUppercase` (AST-based name-substitution visitors, built on `bw2parameters`'s `NameFinder`), `substitute_in_formulas()` |
| `utils.py` | Low-level parsing helpers: `asnumber()`/`asdate()`/`asboolean()` (locale-aware value coercion), `nobraces()`/`noquotes()` (strip SimaPro's `{}`/quoting conventions), `add_amount_or_formula()` (decide if a raw value is a literal number or a formula string), `alternating_key_value()` and `get_key_multiline_values()` (split a block's raw lines into key→value or subsection→lines groups), `skip_empty()`, `jump_to_nonempty()`, `get_true_length()`, `json_serializer()`, `parameter_set_evaluate_each_formula()` |
| `errors.py` | `WasteModelMismatch`, `IndeterminateBlockEnd`, `FormulaReservedWord` — all raised by `main.py`/`blocks/process.py` when the file structure doesn't match assumptions |
| `brightway.py` | `lci_to_brightway(simapro_csv, separate_products, shorten_names)` — converts a parsed `SimaProCSV` (process export) into a bw2io-style JSON-serializable dict of datasets/exchanges; helpers `name_for_process()`, `as_product_dct()`, `reference_to_product()`, `allocation_as_manual_property()`, `substitute_unspecified()`. Called by `SimaProCSV.to_brightway()` |
| `blocks/__init__.py` | Re-exports every block class (see table below) |
| `blocks/base.py` | `SimaProCSVBlock` — base class for all block parsers (holds `self.parsed`, defines `__eq__`/`__len__`); `EmptyBlock` — sentinel subclass for a block with no content |
| `blocks/process.py` | `Process` — the big one: parses a whole `Process` control block (metadata pairs like `Category type`/`Date`/`Infrastructure`/`Literature references`, then sub-blocks like `Products`, `Materials/fuels`, `Emissions to air`, `Waste scenario`, `Calculated parameters`, etc. via `BLOCK_MAPPING`). Methods: `resolve_local_parameters()` (evaluates formulas/uncertainty per-process, using project/database params), `supplement_biosphere_edges()` (attaches CAS numbers/comments from the file's end-of-file biosphere flow lists), `check_waste_production_model_consistency()` |
| `blocks/products.py` | `Products` — parses a process's `Products` sub-block: name, unit, amount/formula, allocation %, waste type, category, comment |
| `blocks/technosphere_edges.py` | `TechnosphereEdges` — parses `Materials/fuels`, `Electricity/heat`, `Avoided products`, `Waste to treatment` sub-blocks: name, unit, amount/formula, uncertainty kind + 3 fields, comment |
| `blocks/wastes.py` | `WasteTreatment` (parses `Waste treatment` sub-block), `WasteScenario(WasteTreatment)` (`Waste scenario`), `SeparatedWaste` (`Separated waste`), `RemainingWaste(SeparatedWaste)` (`Remaining waste`) |
| `blocks/generic_biosphere.py` | `GenericBiosphere` — parses the end-of-file flow-list sections (`Airborne emissions`, `Raw materials`, `Final waste flows`, etc.) that define substances (name, unit, CAS number, comment); `GenericUncertainBiosphere(GenericBiosphere)` — the per-process variant used inside a `Process` block (`Emissions to air`, `Resources`, etc.), which additionally carries an amount/formula and uncertainty distribution |
| `blocks/method.py` | `Method` — parses a top-level `Method` control block: LCIA method metadata plus its `reformat()` helper for value coercion |
| `blocks/impact_category.py` | `ImpactCategory` — parses `Impact category` blocks (category name, unit, and substance → characterization-factor rows) |
| `blocks/damage_category.py` | `DamageCategory` — parses `Damage category` blocks (endpoint category + constituent impact categories/weights) |
| `blocks/normalization_weighting_set.py` | `NormalizationWeightingSet` — parses `Normalization-Weighting set` blocks |
| `blocks/quantities.py` | `Quantities` — parses the `Quantities` control block (physical quantity/dimension definitions, e.g. "Mass") |
| `blocks/units.py` | `Units` — parses the `Units` control block: unit name, reference (base) unit name, conversion factor — the table `units.py`'s `normalize_units()` uses |
| `blocks/parameters.py` | `InputParameters` base + `DatabaseInputParameters`, `ProjectInputParameters`, `DatasetInputParameters` — parse `Input parameters` blocks at database/project/process scope |
| `blocks/calculated_parameters.py` | `CalculatedParameters` base + `DatabaseCalculatedParameters`, `ProjectCalculatedParameters`, `DatasetCalculatedParameters` — parse `Calculated parameters` blocks (name/formula pairs) at the three scopes |
| `blocks/system_description.py` | `SystemDescription` — parses the end-of-file `System description` section (methodology/boundary text metadata) |
| `blocks/literature_reference.py` | `LiteratureReference` — parses `Literature reference` control blocks |

## Entry points (`__init__.py` `__all__`)

`SimaProCSV`, `SimaProCSVType`, `__version__`.

- `SimaProCSV(path_or_stream, encoding="sloppy-windows-1252", database_name=None, ...)`
  — the class to instantiate. Iterable (`for block in simapro_csv: ...`),
  exposes `.header` (dict) and `.blocks` (list of parsed block objects), plus
  `.to_brightway(filepath=None, separate_products=True, shorten_names=True)`
  for process exports.
- `SimaProCSVType` — `str` enum: `processes`, `methods`, `stages` (`stages` =
  SimaPro's "product stages" export kind).

## Typical flow (see `main.py` `SimaProCSV.__init__`)

1. `header.parse_header()` reads the `{...}`-delimited preamble → delimiter,
   decimal/date separators, project name.
2. `csv_reader.BeKindRewind` wraps a `csv.reader` configured with that
   delimiter; `SimaProCSV.get_next_block()` repeatedly slices the file into
   raw line groups, using `CONTROL_BLOCK_MAPPING` (top-level block keywords
   like `Process`, `Method`, `Units`, `Project Input parameters`) or
   `INDETERMINATE_SECTION_HEADERS` (end-of-file flow lists, which need the
   `End` terminator convention to be unambiguous — else `IndeterminateBlockEnd`
   is raised) to pick the right block class.
3. Each block class (`blocks/*.py`) parses its own raw lines into
   `self.parsed` (usually a `list[dict]`).
4. For process/stage exports, `SimaProCSV.resolve_parameters()` walks
   database- and project-scope input/calculated parameters (via
   `parameters.py`), builds a name-substitution + `bw2parameters.ParameterSet`
   evaluation chain, then calls `Process.resolve_local_parameters()` on every
   `Process` block to evaluate that process's own formulas/uncertainty
   against the resolved global parameters.
5. `units.normalize_units()` converts every exchange to its reference unit.

## Where to look for common questions

- "How is the file split into blocks, and what happens when `End` markers
  are missing?" → `main.py` `SimaProCSV.get_next_block()`,
  `CONTROL_BLOCK_MAPPING`/`INDETERMINATE_SECTION_HEADERS`; `csv_reader.py`
  `BeKindRewind.rewind()`
- "How is a SimaPro 'block' (Process, Method, Units, …) actually parsed into
  Python?" → `blocks/base.py` `SimaProCSVBlock` (base contract: `self.parsed`);
  the biggest example is `blocks/process.py` `Process.__init__`, which uses
  `utils.get_key_multiline_values()` to split metadata pairs from named
  sub-blocks (`BLOCK_MAPPING`)
- "How are units and unit conversions handled?" → `blocks/units.py` `Units`
  (parses the conversion table) + `units.py` `normalize_units()` (applies it
  to every exchange's amount/formula/uncertainty)
- "How are uncertainty distributions mapped from SimaPro's format to
  `stats_arrays`?" → `uncertainty.py` `distribution()` (kind + field1/2/3 →
  Lognormal/Normal/Triangle/Uniform/Undefined dict), with invalid-parameter
  fallback to `undefined_distribution()`; called from
  `blocks/process.py` `Process.resolve_local_parameters()` once an `amount`
  is known
- "How are formulas (and SimaPro-specific syntax like `Iff(...)`) parsed and
  evaluated?" → `parameters.py` `prepare_formulas()`/`fix_iff_formula()`/
  `fix_leading_zero_formula()` for cleanup, `FormulaSubstitutor` for
  cross-scope name rewriting, then evaluated with `bw2parameters.Interpreter`/
  `ParameterSet` inside `main.py` `resolve_parameters()` and
  `blocks/process.py` `Process.resolve_local_parameters()`
- "How does this become a bw2data-ready dataset?" → `SimaProCSV.to_brightway()`
  (`main.py`) → `brightway.py` `lci_to_brightway()`; in practice
  `bw2io.importers.simapro_csv.SimaProCSVImporter` is the typical caller, not
  this method directly
- "Where are CAS numbers validated/cleaned?" → `cas.py`
  `validate_cas_string()` / `calculate_check_digit()`, used when parsing
  `GenericBiosphere` flow entries

No worked example is provided for this package on
[docs/site/examples/index.html](../../docs/site/examples/index.html) — bw2io
ships no bundled SimaPro CSV fixture to run against without a real SimaPro
export.
[Example 8 (ExcelImporter)](../../docs/site/examples/index.html#ex8)
demonstrates the same extract → strategies → statistics shape against a
format bw2io does bundle a fixture for.
