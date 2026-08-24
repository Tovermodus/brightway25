# bw2io — data import/export for Brightway

Source: `.venv/lib/python3.11/site-packages/bw2io/` (installed, PyPI
`bw2io>=0.9.6`, currently `0.9.17`). Upstream: `brightway-lca/bw2io` (not
directly readable in this session — use the installed copy as ground truth).

## What it does

Converts LCI/LCIA data from external formats (ecospold1/2 XML, SimaPro CSV,
Excel/CSV, EXIOBASE, openLCA JSON-LD, USEEIO) into `bw2data` databases and
methods, and exports `bw2data` databases back out (CSV, Excel, Matlab, GEXF,
ecospold1, BW2Package archives). The core pattern everywhere is
**extract → apply strategies → write**: a format-specific *extractor* reads
raw files into plain Python dicts/lists, a pipeline of small *strategy*
functions progressively cleans/normalizes/links that data (each strategy is
just `data -> data`), and a format-specific *importer* subclass orchestrates
extraction + its strategy list + writing into `bw2data`.

## Key files / subdirs

| Path | Role |
|---|---|
| `__init__.py` | Public API surface (see Entry points below); also defines `bw2setup()`, `create_default_biosphere3()`, `create_default_lcia_methods()`, `useeio20()`, `exiobase_monetary()` as convenience one-shot functions, and registers `migrations`/`unlinked_data` into `bw2data.config.metadata`. |
| `ecoinvent.py` | `import_ecoinvent_release(version, system_model, username, password, ...)` — the main ecoinvent entry point. Uses `ecoinvent_interface` to download the release, then drives `SingleOutputEcospold2Importer` + `Ecospold2BiosphereImporter` + LCIA import under the hood. |
| `remote.py` | `install_project(...)`, `get_projects()` — download/install a pre-built Brightway project (a `BW2Package`-style bundle) from a remote server, used e.g. for the default biosphere/forwast/etc. example projects. |
| `migrations.py` | `Migration(DataStore)` — named, versioned "find these old names/units/locations, replace with new ones" datasets stored per-project; `create_core_migrations()` registers built-in ones (biosphere 2→3 renames, SimaPro↔ecoinvent name migrations, unit migrations) sourced from `data/`. Applied via the `migrate_datasets`/`migrate_exchanges` strategies. |
| `package.py` | `BW2Package` — (de)serialize any `bw2data` `DataStore` (database, method, weighting...) to/from a bzip2 JSON-in-a-file archive; `.export_obj()`/`.import_file()`. Used for backups and for `remote.install_project`. |
| `backup.py` | `backup_data_directory`, `backup_project_directory`, `restore_project_directory` — filesystem-level project/data-dir zip backups (separate from `BW2Package`). |
| `modified_database.py`, `unlinked_data.py`, `validation.py`, `errors.py`, `units.py`, `utils.py`, `compatibility.py` | Supporting infrastructure: tracking unresolved exchange links (`UnlinkedData`), voluptuous validation schemas, custom exceptions (`StrategyError`, `WrongDatabase`, `NonuniqueCode`, `MultiprocessingError`, ...), unit-name normalization tables, `activity_hash`/`es2_activity_hash` (the "fuzzy identity" hash used to match/link datasets), old-format compatibility shims. |
| **`extractors/`** | One module per input format, each doing pure I/O → plain-Python-data (no `bw2data` calls, no cleanup logic). `ecospold1.py` (`Ecospold1DataExtractor`), `ecospold2.py` (`Ecospold2DataExtractor`, multiprocessing-capable XML parsing of the ecoinvent ecospold2 format), `simapro_csv.py` (`SimaProCSVExtractor`, parses SimaPro's semicolon-delimited CSV export), `excel.py`/`csv.py` (generic tabular extractors used by `ExcelImporter`), `exiobase.py`, `json_ld.py` (openLCA JSON-LD), plus small LCIA-specific variants (`ecospold1_lcia.py`, `simapro_lcia_csv.py`, `simapro_lcia_95project_csv.py`). |
| **`strategies/`** | The transformation library — dozens of small `def strategy(data, ...) -> data` functions, grouped by file: `generic.py` (format-agnostic: `normalize_units`, `link_iterable_by_fields`, `set_code_by_activity_hash`, `drop_unlinked`, ...), `migrations.py` (`migrate_datasets`/`migrate_exchanges` — apply a named `Migration`), `biosphere.py`/`locations.py`/`products.py` (name/location/product normalization), `ecospold2.py`/`ecospold1_allocation.py` (ecoinvent-specific fixes), `simapro.py` (+ `sentier/simapro_units.py`) (SimaPro name/unit/geo parsing), `json_ld.py`/`json_ld_allocation.py`/`json_ld_lcia.py` (openLCA), `exiobase.py`, `useeio.py`, `lcia.py`, `csv.py`, `parameterization.py`, `special.py`. All exported flat from `strategies/__init__.py` (~130 names in `__all__`). |
| **`importers/`** | Format-specific orchestrator classes, each a subclass of `ImportBase` (via `LCIImporter`/`LCIAImporter`). `base.py` (`ImportBase` — the strategy-application engine, all importers inherit this), `base_lci.py` (`LCIImporter` — adds `write_database`, `match_database`, `statistics`), `base_lcia.py` (`LCIAImporter` — adds `write_methods`). Format classes: `ecospold2.py` (`SingleOutputEcospold2Importer` — the ecoinvent LCI importer), `ecospold2_biosphere.py` (`Ecospold2BiosphereImporter` — builds the default biosphere3 database), `ecospold1.py` (`SingleOutputEcospold1Importer`, `MultiOutputEcospold1Importer`, `NoIntegerCodesEcospold1Importer`), `simapro_csv.py` (`SimaProCSVImporter`), `simapro_block_csv.py` (`SimaProBlockCSVImporter` — newer importer delegating parsing entirely to the external `bw_simapro_csv` package, needs `multifunctional` installed), `excel.py` (`CSVImporter`, `ExcelImporter`), `excel_lcia.py`, `ecoinvent_lcia.py`, `ecospold1_lcia.py`, `json_ld.py`/`json_ld_lcia.py`, `exiobase3_hybrid.py`, `exiobase3_monetary.py`. |
| **`export/`** | Writers from `bw2data` databases/matrices back to files: `csv.py` (`write_lci_csv`), `excel.py` (`lci_matrices_to_excel`, `write_lci_excel`), `matlab.py` (`lci_matrices_to_matlab`), `gexf.py` (`DatabaseToGEXF`, `DatabaseSelectionToGEXF`, `keyword_to_gephi_graph` — graph exports for Gephi). |
| **`data/`** | Bundled reference/lookup data shipped with the package: unit-normalization tables, biosphere 2→3 and SimaPro↔ecoinvent name-migration JSON (used by `migrations.py`), example CSV/XLSX files (`get_csv_example_filepath`, `get_xlsx_example_filepath`, `add_example_database`), pre-built LCIA method archives (`data/lcia/lcia_39_ecoinvent.zip`, used as a fast-path shortcut by `create_default_lcia_methods`), `exiopol.py` (EXIOBASE metadata helpers). |

## Entry points (`__init__.py` `__all__`)

Importer classes: `CSVImporter`, `CSVLCIAImporter`, `Ecospold1LCIAImporter`,
`ExcelImporter`, `ExcelLCIAImporter`, `Exiobase3MonetaryImporter`,
`MultiOutputEcospold1Importer`, `SimaProCSVImporter`, `SimaProLCIACSVImporter`,
`SingleOutputEcospold1Importer`, `SingleOutputEcospold2Importer` (plus
`Exiobase3HybridImporter`, `SimaProBlockCSVImporter` — imported but only
conditionally added to `__all__`/present if optional deps are installed).

High-level functions: `import_ecoinvent_release` (ecoinvent download+import,
falls back to a warning stub if `ecoinvent_interface` isn't installed),
`bw2setup()`, `create_default_biosphere3()`, `create_default_lcia_methods()`,
`useeio20()`, `exiobase_monetary()`, `install_project()` (remote project
download), `add_example_database()`, `backup_data_directory()` /
`backup_project_directory()` / `restore_project_directory()`.

Package/data classes & singletons: `BW2Package`, `Migration` / `migrations`,
`UnlinkedData` / `unlinked_data`, `ChemIDPlus`.

Export helpers: `DatabaseToGEXF`, `DatabaseSelectionToGEXF`,
`lci_matrices_to_excel`, `lci_matrices_to_matlab`.

Utility functions: `activity_hash`, `es2_activity_hash`, `normalize_units`,
`load_json_data_file`, `get_csv_example_filepath`, `get_xlsx_example_filepath`.

`__version__ = "0.9.17"`.

## Where to look for common questions

- **Worked examples** — [docs/site/examples/index.html#bw2io](../../docs/site/examples/index.html#bw2io)
  has 3 full, verified, runnable scripts using bw2io's own bundled test
  fixtures (no ecoinvent/SimaPro credentials or network needed): importing an
  Excel/CSV LCI sheet with `ExcelImporter` (`#ex4`), round-tripping a
  database through a `BW2Package` archive (`#ex5`), and applying a
  `Migration` — including the `"multiplier"` unit-rescale trick — during
  import (`#ex6`). This is the same **extract → apply strategies → write**
  shape as the docs.brightway.dev "Importing Data" cheat sheet.

- **"How do I import a plain Excel/CSV LCI sheet, without ecoinvent or
  SimaPro?"** → `importers/excel.py` `ExcelImporter(filepath,
  sheet_name=None)` reads a workbook laid out per its class docstring (a
  `Database`/`Activity`/`Exchanges` section format; a worksheet whose cell A1
  is literally `"skip"` is ignored). It builds a fixed 14-strategy list in
  `__init__` (`csv_restore_tuples`, `csv_numerize`, `normalize_units`,
  `set_code_by_activity_hash`, biosphere linking via
  `link_iterable_by_fields(other=Database(config.biosphere),
  edge_kinds=["biosphere"])`, `link_technosphere_by_activity_hash`, ...) and
  calls `extractors/excel.py` `ExcelExtractor.extract()` **immediately in
  `__init__`** (not lazily), via `openpyxl`. `CSVImporter` (same file) is the
  flattened single-worksheet CSV equivalent, via `extractors/csv.py`
  `CSVExtractor`. `data/__init__.py` `get_xlsx_example_filepath()` /
  `get_csv_example_filepath()` point at bundled fixtures
  (`data/examples/example.xlsx`, `example.csv`, and a parameterized variant
  `sample_parameterized_database.xlsx`) used by bw2io's own tests and by
  example 4 above. Gotcha verified while writing that example: biosphere
  linking matches on **all** fields present unless `fields=` is narrowed, and
  neither `ExcelImporter` nor `link_technosphere_by_activity_hash`
  auto-creates a self-referencing production exchange for an activity whose
  sheet section has no `Exchanges` block — always check `.statistics()`
  before `.write_database()`.

- **"How does a SimaPro CSV import work end to end?"** →
  `importers/simapro_csv.py` `SimaProCSVImporter.__init__` calls
  `extractors/simapro_csv.py` `SimaProCSVExtractor.extract()` to parse the raw
  CSV, then builds `self.strategies` (a list of ~14+ strategy functions from
  `strategies/simapro.py`, `strategies/generic.py`, `strategies/biosphere.py`
  — geography splitting `split_simapro_name_geo`, unit fixes
  `change_electricity_unit_mj_to_kwh`, biosphere name/category
  normalization, technosphere linking
  `link_technosphere_based_on_name_unit_location`). Call
  `.apply_strategies()` then `.write_database()` (inherited from
  `importers/base_lci.py` `LCIImporter`). Note the newer
  `importers/simapro_block_csv.py` `SimaProBlockCSVImporter` instead
  delegates all CSV parsing to the external `bw_simapro_csv` package
  (`SimaProCSV.to_brightway()`) and only runs Brightway-side linking
  strategies afterward — prefer this path for new code.

- **"How does an ecoinvent import work?"** → `ecoinvent.py`
  `import_ecoinvent_release(version, system_model, username, password, ...)`
  is the one-call entry point: it uses `ecoinvent_interface` to authenticate
  and download the release files, then internally drives
  `importers/ecospold2_biosphere.py` `Ecospold2BiosphereImporter` (writes the
  biosphere database) and `importers/ecospold2.py`
  `SingleOutputEcospold2Importer` (writes the LCI database, using
  `extractors/ecospold2.py` `Ecospold2DataExtractor` which can multiprocess
  ecospold2 XML file parsing), plus LCIA method import. Do **not** call
  `bw2setup()` first when using this path — it sets up its own biosphere
  linked to the correct ecoinvent version.

- **"How do I go from a single process/chimaera node to separate process +
  product nodes?"** → `strategies/products.py`
  `separate_processes_from_products(data, field_exclusions, code_suffix)`:
  given datasets typed `"process"` or `"processwithreferenceproduct"`
  (chimaera — see `modules/bw2data/CLAUDE.md` "Node types" for what that
  means), it copies each process into a new `"product"` node (using the
  `"reference product"` field for the product's name if present), points the
  process's self-referencing production edge at the new product node, and
  flips the process's own `type` to plain `"process"`. The inverse direction
  — `bw2data.utils.set_correct_process_type()`, run automatically by
  `Database.write()` — collapses a process with a self-referencing
  production edge (or no explicit production edge at all) back into a
  chimaera node. The same file also has
  `create_products_as_new_nodes(data)`, which creates new unlinked product
  nodes from named-but-unlinked functional edges (used earlier in an import
  pipeline, before internal links are all resolved).

- **"What is a 'strategy' and how is it applied?"** → A strategy is just a
  plain function `data -> data` (occasionally with extra bound args via
  `functools.partial`, e.g. `functools.partial(migrate_datasets,
  migration="default-units")`), living in `strategies/*.py` and re-exported
  from `strategies/__init__.py`. `importers/base.py` `ImportBase.apply_strategy`
  calls one and appends its name to `self.applied_strategies`, catching
  `StrategyError` and printing (not raising) it so a bad strategy doesn't
  abort a whole run; `ImportBase.apply_strategies` runs `self.strategies` (or
  a passed-in list) in order, timing the whole pipeline. Each format
  importer's `__init__` builds its own ordered `self.strategies` list
  tailored to that format's quirks — that list *is* the documentation of
  what each format needs.

- **"How do I check/fix unlinked exchanges after applying strategies?"** →
  `ImportBase.unlinked` (property, iterates unique unlinked exchanges),
  `importers/base_lci.py` `LCIImporter.statistics()` (prints
  dataset/exchange/unlinked counts) and `.match_database(db_name=None,
  fields=None, ...)` (link against another already-written `bw2data`
  database, or self-match). `unlinked_data.py` `UnlinkedData`/`unlinked_data`
  persists a project-level log of exchanges that couldn't be linked.

- **"How does data actually get written into bw2data?"** →
  `importers/base_lci.py` `LCIImporter.write_database(data=None,
  delete_existing=True, backend=None, activate_parameters=False, db_name=None,
  ...)` validates (`WrongDatabase`, `NonuniqueCode` in `errors.py`) then
  calls `bw2data.Database(db_name).write(data)`. `LCIAImporter.write_methods()`
  (`importers/base_lcia.py`) is the LCIA-method equivalent.

- **"What are migrations, and how are they different from strategies?"** →
  `migrations.py` `Migration(DataStore)` stores a named, versioned lookup
  table (old value → new value) per-project, e.g.
  `Migration("biosphere-2-3-names")`; `create_core_migrations()` registers
  the built-ins sourced from `data/`. They're *applied* by the generic
  strategies `strategies/migrations.py` `migrate_datasets` /
  `migrate_exchanges`, which most format importers include in their
  strategy list via `functools.partial(migrate_datasets,
  migration="...")`. Stored migration data has a `"fields"` list (which
  keys to match on) and a `"data"` list of `(old_values, new_values)` pairs;
  a special `"multiplier"` key in `new_values` is handled by
  `migrate_exchanges` via `utils.py` `rescale_exchange(exc, factor)`
  (scales amount + uncertainty/formula fields) instead of overwriting a
  field outright — that's how a migration converts units, not just renames
  (verified in example 6 above). Think of a migration as reusable
  renaming/rescaling data, and a strategy as the code that applies (or
  generates) it. `bw_migrations` and `randonneur`/`randonneur_data` are
  separate, newer packages sourcing additional pre-built migration-shaped
  data (mostly exiobase↔ecoinvent hybridization).

- **"How do `randonneur`/`randonneur_data` plug into an import, as opposed to
  bw2io's own `Migration`/strategies?"** → `importers/base_lci.py`
  `LCIImporter.randonneur(label=None, data_registry_path=None,
  datapackage=None, fields=None, mapping=None, node_filter=None,
  edge_filter=None, verbs=rn.utils.SAFE_VERBS, migrate_edges=True,
  migrate_nodes=False, ...)` (line ~675) is a **third**, separate mechanism
  alongside `Migration`+strategies and `bw_migrations`: it calls
  `randonneur.migrate_edges_with_stored_data`/`migrate_nodes_with_stored_data`
  (or plain `migrate_edges`/`migrate_nodes` if you pass an in-memory
  `datapackage=` instead of `label=`) directly against `self.data`, applying
  a `randonneur` transformation registry entry (by default resolved through
  `randonneur_data.Registry`) in place — no `Migration` object or
  project-level registration involved. It's the mechanism intended for
  consuming maintained `randonneur_data` datasets (exiobase↔ecoinvent
  hybridization etc.) rather than bw2io's own bundled biosphere-2-3/SimaPro
  migrations. See `modules/randonneur/CLAUDE.md` and
  `modules/randonneur_data/CLAUDE.md` for the engine and data-registry side.
  Related: `create_randonneur_excel_template_for_unlinked()` (same file,
  line ~871) writes an Excel template in `randonneur`'s format pre-filled
  from `self.unlinked`, meant to be hand-completed and loaded back as a
  `randonneur.Datapackage` to resolve those specific unlinked exchanges.

- **"How is EXIOBASE / MRIO data handled?"** →
  `extractors/exiobase.py` (`Exiobase3MonetaryDataExtractor`),
  `importers/exiobase3_monetary.py` (`Exiobase3MonetaryImporter`) and
  `importers/exiobase3_hybrid.py` (`Exiobase3HybridImporter`),
  `strategies/exiobase.py`. The top-level `exiobase_monetary()` function in
  `__init__.py` downloads a specific EXIOBASE release zip and drives
  `Exiobase3MonetaryImporter` end to end. `bw2data`'s `backends/iotable/`
  backend is used for the resulting large matrix-native database.

- **"How do I export a database out of Brightway?"** → `export/csv.py`
  `write_lci_csv`, `export/excel.py` `write_lci_excel` /
  `lci_matrices_to_excel`, `export/matlab.py` `lci_matrices_to_matlab`,
  `export/gexf.py` `DatabaseToGEXF` (network-graph export for Gephi). For a
  full round-trippable archive of any `bw2data` `DataStore` object
  (database, method, ...), use `package.py`
  `BW2Package.export_obj(obj, filename=None, folder="export", ...)` /
  `BW2Package.import_file(filepath, whitelist=True)` instead — a
  bzip2-compressed JSON file, filename defaulting to a hash of `obj.filename`;
  `import_file` always returns a **list** of restored objects (even for one)
  and re-registers/writes/processes each into whichever project is current
  (verified in example 5 above, which imports into a second project).

- **"Where do the default biosphere3 flows and LCIA methods come from?"** →
  `__init__.py` `create_default_biosphere3()` runs
  `importers/ecospold2_biosphere.py` `Ecospold2BiosphereImporter`;
  `create_default_lcia_methods()` by default takes a fast path loading a
  pre-baked `data/lcia/lcia_39_ecoinvent.zip` JSON archive directly (bypasses
  extraction/strategies), or falls back to
  `importers/ecoinvent_lcia.py` `EcoinventLCIAImporter` when
  `shortcut=False`. `bw2setup()` in `__init__.py` runs both plus
  `create_core_migrations()` as the classic all-in-one setup call.
