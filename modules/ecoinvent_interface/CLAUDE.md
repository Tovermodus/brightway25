# ecoinvent_interface

## Purpose

Authenticated HTTP client for the ecoinvent LCI database's web APIs (login
via `sso.ecoinvent.org`, data via `api.ecoquery.ecoinvent.org`). It downloads
and locally caches ecoinvent release archives (ecospold2, LCI/LCIA, matrix
exports), per-version extra/report files, and individual processes/datasets,
and it maps ecoinvent process metadata (name/product/location) to dataset
filenames and UUIDs. It does not parse or import the data itself — `bw2io`
(`import_ecoinvent_release`) consumes files downloaded by this package and
loads them into `bw2data`.

Source: `.venv/lib/python3.11/site-packages/ecoinvent_interface/` (version
`3.1`, see `__init__.py`).

No worked example is provided for this package on
[docs/site/examples/index.html](../../docs/site/examples/index.html): every
public entry point requires an authenticated, paid ecoinvent account and live
network access, which this repo's docs deliberately avoid exercising (see
root `CLAUDE.md`). `bw2io`'s `ecoinvent.py`
`import_ecoinvent_release(version, system_model, username, password, ...)`
is the only consumer in this repo and is documented, unexecuted, in
`modules/bw2io/CLAUDE.md`; `docs/site/examples/index.html#bw2io` instead
demonstrates the same extract→strategies→write shape against bw2io's own
credential-free bundled fixtures.

## Key files

| File | Role |
|---|---|
| `__init__.py` | Public API (`__all__`) and `__version__ = "3.1"` |
| `core.py` | `InterfaceBase` — shared login/refresh/download plumbing used by both `EcoinventRelease` and `EcoinventProcess`; also `URLS`, `SYSTEM_MODELS` mapping, `format_dict()`, decorators `logged_in`/`fresh_login` |
| `release.py` | `EcoinventRelease(InterfaceBase)` — list/download full releases, reports, and per-version extra files; `ReleaseType` enum of downloadable archive kinds; `get_excel_lcia_file_for_version()` |
| `settings.py` | `Settings(BaseSettings)` (pydantic-settings) — username/password/client_id/output_path, loaded from `EI_*` env vars or the on-disk secrets dir; `permanent_setting()` writes a secret to disk |
| `storage.py` | `CachedStorage` — manages the on-disk cache directory (via `platformdirs`) and its `Catalogue` (a JSON-backed `MutableMapping` of downloaded-file metadata); `md5()` checksum helper |
| `mapping.py` | `ProcessMapping` — builds/caches the process-metadata-to-filename/UUID mapping table used by `EcoinventProcess.select_process()`; `get_rp_text()` extracts reference-product text from exchanges |
| `process_interface.py` | `EcoinventProcess(InterfaceBase)` — select and download files (upr/lci/lcia/pdf) for a single dataset/process; `ProcessFileType` enum; `MissingProcess` exception; `get_cached_mapping()`, `split_url()` |
| `spold_versions.py` | Standalone helpers to rewrite the `ecoSpold`/master-data XML "version" fields after download (`fix_version_upr`, `fix_version_meta`, `check_inputs`, `major_minor_from_string`) — called from `EcoinventRelease.get_release()` |
| `string_distance.py` | `damerau_levenshtein()` — used by `EcoinventRelease.get_release()` to fuzzy-match a predicted filename to the real one when ecoinvent's naming pattern doesn't hold |

## Entry points (`__init__.py` `__all__`)

```python
__all__ = [
    "__version__",
    "CachedStorage",
    "EcoinventRelease",
    "EcoinventProcess",
    "permanent_setting",
    "ProcessFileType",
    "ProcessMapping",
    "ReleaseType",
    "Settings",
    "get_excel_lcia_file_for_version",
]
```

- `Settings` (settings.py) — credentials/config object, pass to `EcoinventRelease`/`EcoinventProcess` constructors.
- `permanent_setting(key, value)` (settings.py) — persist `username`/`password`/`output_path` to disk so future `Settings()` calls pick them up.
- `EcoinventRelease` (release.py) — main class: `list_versions()`, `list_system_models()`, `get_release()`, `get_report()`, `get_extra()`.
- `ReleaseType` (release.py) — enum selecting which archive kind `get_release()` downloads (`ecospold`, `matrix`, `lci`, `lcia`, `cumulative_lci`, `cumulative_lcia`).
- `get_excel_lcia_file_for_version()` (release.py) — convenience wrapper around an `EcoinventRelease` to fetch the LCIA Excel workbook for a version.
- `EcoinventProcess` (process_interface.py) — per-dataset client: `set_release()`, `select_process()`, `get_basic_info()`, `get_documentation()`, `get_file()`.
- `ProcessFileType` (process_interface.py) — enum of file kinds fetchable per process (`upr`, `lci`, `lcia`, `pdf`, `undefined`).
- `ProcessMapping` (mapping.py) — builds/loads the cached process metadata → filename/UUID table.
- `CachedStorage` (storage.py) — the on-disk download cache + catalogue, held as `self.storage` on every `InterfaceBase` subclass instance.

## Where to look

**"How does authentication work?"**
`core.py` `InterfaceBase.__init__` reads `settings.username`/`password`/`client_id`
(raises `ValueError` if any is missing); `InterfaceBase.login()` (~line 97) POSTs
to `URLS["sso"]` for `access_token`/`refresh_token`; `refresh_tokens()` (~line 115)
renews them. The `@logged_in` and `@fresh_login` decorators (top of `core.py`)
wrap methods that need a valid/fresh token and call `login()`/`refresh_tokens()`
automatically — you never need to call them yourself before using the API.

**"How do I set my ecoinvent credentials?"**
`Settings` (settings.py) is a `pydantic_settings.BaseSettings` reading env vars
prefixed `EI_` (`EI_USERNAME`, `EI_PASSWORD`, `EI_CLIENT_ID`, `EI_OUTPUT_PATH`)
or files in the pydantic-settings secrets dir. Call
`permanent_setting("username", "...")` / `permanent_setting("password", "...")`
(settings.py, writes to `storage.secrets_dir`) to persist credentials across
sessions instead of using env vars each time.

**"How do I download a full ecoinvent release?"**
`EcoinventRelease.get_release(version, system_model, release_type, extract=True,
force_redownload=False, fix_version=True)` in `release.py` (~line 91). It
predicts the ecoinvent filename from `ReleaseType.filename()`, falls back to
`string_distance.damerau_levenshtein()` fuzzy-matching if the predicted name
isn't in the catalogue, downloads/extracts via `InterfaceBase._download_and_cache`
(private, `release.py` ~line 167), and — for ecospold/lci/lcia archives —
patches version strings in the extracted XML via `spold_versions.fix_version_upr`
/ `fix_version_meta`.

**"Where is the download cache and what's in it?"**
`storage.py` — `CachedStorage.__init__` picks `cache_dir` (explicit, or
`Settings.output_path`, or the `platformdirs` app data dir) and opens
`Catalogue` (`catalogue.json` in that dir), a `MutableMapping` recording
uuid/size/modified/description per downloaded filename. `CachedStorage.clear()`
wipes the whole cache directory. `storage.md5()` is used to verify downloads.

**"How do I fetch a single dataset/process instead of a whole release?"**
`EcoinventProcess` in `process_interface.py`: call `set_release(version,
system_model)` then `select_process(attributes=..., filename=..., or
dataset_id=...)` (~line 92) to pick a dataset — `attributes` matching goes
through `mapping.get_cached_mapping()` / `ProcessMapping`. Then
`get_basic_info()`, `get_documentation()`, or `get_file(ProcessFileType.upr,
directory)` to download.

**"How does process/filename matching work?"**
`mapping.py` `ProcessMapping` — `create_remote_mapping()` fetches the
metadata table from the API, `create_local_mapping()`/`add_mapping()` cache it
to disk per `(version, system_model)`; `process_interface.get_cached_mapping()`
loads that cache and `EcoinventProcess.select_process()` filters it by
`reference_product`/`activity_name`/`geography`/filename/UUID.

**"What are `ReleaseType` and `ProcessFileType` exactly?"**
`ReleaseType` (release.py, ~line 19): `ecospold`, `matrix`, `lci`, `lcia`,
`cumulative_lci`, `cumulative_lcia` — each value is a filename template like
`"ecoinvent {version}_{system_model_abbr}_ecoSpold02.7z"`.
`ProcessFileType` (process_interface.py, ~line 62): `upr` (Unit Process),
`lci`, `lcia`, `pdf` (Dataset Report), `undefined`.
