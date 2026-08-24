# stats_arrays

## Purpose

`stats_arrays` is the low-level uncertainty-distribution and Monte Carlo
sampling library used throughout Brightway 2.5. It defines:

- A fixed numpy structured dtype ("params array" / "homogeneous params
  array") for encoding a distribution's parameters (`loc`, `scale`, `shape`,
  `minimum`, `maximum`, `negative`, `uncertainty_type`).
- One class per uncertainty distribution (`UncertaintyBase` subclasses),
  each with an integer `id` that identifies it and matching `pdf`/`cdf`/
  `ppf`/`random_variables`/`statistics` classmethods that operate on batches
  of rows at once.
- Random number generator classes (`RandomNumberGenerator`,
  `MCRandomNumberGenerator`, `LatinHypercubeRNG`) that consume a params
  array and yield samples, correctly dispatching each row to its
  distribution class by `uncertainty_type`.

It has no knowledge of LCA/matrices itself — `bw_processing` stores
`uncertainty_type`/`loc`/`scale`/... using the same field layout
(`UNCERTAINTY_DTYPE`), and `bw2calc`/`bw2data` build on `stats_arrays` for
Monte Carlo LCA.

## Key files

| File | Role |
|---|---|
| `__init__.py` | Package entry point; defines `__all__`, re-exports everything below. |
| `distributions/base.py` | `UncertaintyBase` — abstract base class for every distribution (validation, `from_tuples`/`from_dicts` constructors, `bounded_random_variables`, `random_variables`, `ppf`, `cdf`, `pdf`, `statistics`). `BoundedUncertaintyBase` — base for distributions defined on `[minimum, maximum]` (rescales to/from the unit interval for SciPy). |
| `distributions/bernoulli.py` | `BernoulliUncertainty` (id 6) — Bernoulli/binary uncertainty. |
| `distributions/beta.py` | `BetaUncertainty` (id 10) — Beta distribution. |
| `distributions/beta_pert.py` | `BetaPERTUncertainty` (id 13) — Beta-PERT distribution (subclass of `BetaUncertainty`; parameterized by min/mode/max). |
| `distributions/discrete_uniform.py` | `DiscreteUniform` (id 7) — discrete uniform uncertainty over integers. |
| `distributions/extreme.py` | `GeneralizedExtremeValueUncertainty` (id 11) — generalized extreme value (GEV) distribution. |
| `distributions/gamma.py` | `GammaUncertainty` (id 9) — Gamma distribution. |
| `distributions/geometric.py` | `UniformUncertainty` (id 4) and `TriangularUncertainty` (id 5) — both bounded distributions, both `BoundedUncertaintyBase` subclasses. |
| `distributions/lognormal.py` | `LognormalUncertainty` (id 2) — lognormal distribution. |
| `distributions/normal.py` | `NormalUncertainty` (id 3) — normal (Gaussian) distribution. |
| `distributions/student.py` | `StudentsTUncertainty` (id 12) — Student's t distribution. |
| `distributions/undefined.py` | `UndefinedUncertainty` (id 0) — "undefined or unknown uncertainty" (returns `loc` when sampled). `NoUncertainty` (id 1, subclass) — fixed/no uncertainty. |
| `distributions/weibull.py` | `WeibullUncertainty` (id 8) — Weibull distribution. |
| `random.py` | `RandomNumberGenerator` — single-distribution-type generator over a params array. `MCRandomNumberGenerator` — Monte Carlo generator that handles a params array with *mixed* uncertainty types per row, dispatching each row group to the right distribution class. `LatinHypercubeRNG` — Latin hypercube variant of `MCRandomNumberGenerator` (`build_hypercube`). |
| `uncertainty_choices.py` | `UncertaintyChoices` — registry/container mapping integer `id` → distribution class (`uncertainty_choices[UncertaintyType.normal]` → `NormalUncertainty`); `DISTRIBUTIONS` tuple of all built-in classes; module-level singleton `uncertainty_choices`. |
| `uncertainty_types.py` | `UncertaintyType(IntEnum)` — named constants for every distribution id (e.g. `UncertaintyType.normal == 3`), interchangeable with the raw ints stored in params arrays. |
| `dataset_statistics.py` | Free functions `weighted_mean`, `weighted_sample_variance`, `weighted_sample_stddev` for computing summary statistics over weighted datasets. |
| `errors.py` | All `stats_arrays` exceptions: `StatsArraysError` (base), `ImproperBoundsError`, `MaximumIterationsError`, `UnknownUncertaintyType`, `UndefinedDistributionError`, `InvalidParamsError`, `MultipleRowParamsArrayError`, `UnreasonableBoundsError`. |
| `utils.py` | `BASE_DTYPE`/`BASE_DTYPE_FIELDS` — the numpy structured dtype (`loc`, `scale`, `shape`, `minimum`, `maximum`, `negative`, and optionally `uncertainty_type`); `construct_params_array()`, `one_row_params_array` decorator, `rescale_to_unitary_interval()`, `rescale_vector_to_params()`. |

## Entry points (from `__init__.py` `__all__`)

Distribution classes: `UncertaintyBase`, `BoundedUncertaintyBase`,
`BernoulliUncertainty`, `BetaUncertainty`, `BetaPERTUncertainty`,
`DiscreteUniform`, `GammaUncertainty`, `GeneralizedExtremeValueUncertainty`,
`LognormalUncertainty`, `NormalUncertainty`, `NoUncertainty`,
`StudentsTUncertainty`, `TriangularUncertainty`, `UndefinedUncertainty`,
`UniformUncertainty`, `WeibullUncertainty`.

Enums / registries: `UncertaintyType` (IntEnum of ids), `uncertainty_choices`
(the `UncertaintyChoices` singleton instance).

Random number generation: `RandomNumberGenerator`, `MCRandomNumberGenerator`,
`LatinHypercubeRNG`.

Errors: `StatsArraysError`, `ImproperBoundsError`, `InvalidParamsError`,
`MaximumIterationsError`, `MultipleRowParamsArrayError`,
`UndefinedDistributionError`, `UnknownUncertaintyType`,
`UnreasonableBoundsError`.

## Where to look

**Q: How do I know which integer code means which distribution?**
`uncertainty_types.py` — `UncertaintyType(IntEnum)`, e.g. `normal = 3`,
`lognormal = 2`, `triangular = 5`, `beta_pert = 13`. The same integers are
each distribution class's `id` class attribute (e.g.
`NormalUncertainty.id == 3`), and `uncertainty_choices[id]` (in
`uncertainty_choices.py`) looks up the class from the integer.

**Q: What's the shape/dtype of a "params array"?**
`utils.py` — `BASE_DTYPE_FIELDS` / `BASE_DTYPE` define the numpy structured
dtype (`loc`, `scale`, `shape`, `minimum`, `maximum`, `negative`, and
`uncertainty_type` when `include_type=True`). `construct_params_array()`
builds an empty one; `UncertaintyBase.from_tuples()` /
`UncertaintyBase.from_dicts()` in `distributions/base.py` build one from
Python data.

**Q: How do I sample random numbers given a params array with several
different distribution types mixed in one array?**
`random.py` — `MCRandomNumberGenerator` (single distribution type per call,
use `RandomNumberGenerator` instead) sorts rows by `uncertainty_type`,
groups them via `get_positions()`, and calls each distribution's
`bounded_random_variables`/`random_variables` per group, then restores the
original row order.

**Q: How do I add or find a new distribution class?**
Every distribution lives in `distributions/<name>.py` and subclasses
`UncertaintyBase` (`distributions/base.py`) or `BoundedUncertaintyBase` for
distributions confined to `[minimum, maximum]`. Required class attributes:
`id` (unique int < 256) and `description` (str). New distributions must be
added to `DISTRIBUTIONS` in `uncertainty_choices.py` to be picked up by
`uncertainty_choices`/`MCRandomNumberGenerator`.

**Q: How do PDF/CDF/percentile-point-function calculations work?**
`distributions/base.py` — `UncertaintyBase.pdf()`, `.cdf()`, `.ppf()`,
`.statistics()` are classmethods that every concrete distribution
implements/overrides using SciPy; `default_number_points_in_pdf` (200) and
`standard_deviations_in_default_range` (2.2) control default resolution.

**Q: What exceptions can this package raise, and when?**
`errors.py` — e.g. `InvalidParamsError` (bad params array on construction),
`ImproperBoundsError`/`UnreasonableBoundsError` (bad or too-narrow
min/max), `MaximumIterationsError` (couldn't sample within bounds in
`maximum_iterations` tries), `UnknownUncertaintyType` (id not registered in
`uncertainty_choices`), `MultipleRowParamsArrayError` (function needs a
single-row params array but got several — see the `one_row_params_array`
decorator in `utils.py`).

**Q: How does this show up in a real Monte Carlo LCA run?**
`bw2calc.LCA(demand, method, use_distributions=True, seed_override=42)`
samples a fresh value per uncertain exchange on every `next(lca)` call —
each exchange's uncertainty is stored in `bw2data` as `"uncertainty
type"`/`"loc"`/`"scale"`/... fields using exactly these `UncertaintyType`
ids (normal == 3), which flow unchanged into `bw_processing`'s
`UNCERTAINTY_DTYPE` and are sampled by `MCRandomNumberGenerator` under the
hood. Full runnable script + captured output:
`docs/site/examples/index.html#ex7` (bw2calc section) — see also
`modules/bw2calc/CLAUDE.md`.

**Q: How does this relate to `bw_processing`'s stored arrays?**
`bw_processing.constants.UNCERTAINTY_DTYPE` uses the identical field names
(`uncertainty_type`, `loc`, `scale`, `shape`, `minimum`, `maximum`,
`negative`, just `float32` instead of `float64`) so datapackages can be fed
straight into `stats_arrays`' RNG classes without conversion.
