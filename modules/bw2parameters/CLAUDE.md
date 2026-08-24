# bw2parameters

## Purpose

`bw2parameters` is the formula-evaluation engine for the Brightway 2.5 LCA
framework. It provides a safe(r) Python expression interpreter (built on
`asteval`), a `ParameterSet` that topologically orders and evaluates
interdependent named parameters ("parameter A's formula references parameter
B"), optional `pint` unit-awareness, and AST-level "mangling" utilities used
to namespace/prefix formulas when parameters are combined across scopes
(e.g. project → database → activity). It has no knowledge of Brightway's
data model itself — it operates purely on plain dicts and formula strings.
It is a small, dependency-light package; `bw2data.parameters` is its main
consumer, using it to evaluate parameterized exchanges/activities.

Installed at `.venv/lib/python3.11/site-packages/bw2parameters/`, version
`1.1.0` (see `bw2parameters-1.1.0.dist-info`).

## Key files

| File | Role |
|---|---|
| `__init__.py` | Public API surface — see Entry points below. Computes `__version__` via `utils.get_version_tuple()`. |
| `interpreter.py` | `Interpreter` (wraps `asteval.Interpreter`) and `PintInterpreter` (adds `pint` unit support) — the core formula evaluator. |
| `parameter_set.py` | `ParameterSet` and `PintParameterSet` — evaluate a dict of interdependent parameters in dependency order. |
| `pint.py` | `PintWrapperSingleton` (exposed as the module-level singleton `PintWrapper`) — thin wrapper around a `pint.UnitRegistry` for unit parsing/conversion. |
| `mangling.py` | AST-based formula rewriting: `mangle_formula`, `prefix_parameter_dict`, `substitute_in_formulas`, `FormulaSubstitutor`, plus internal `NameFinder` visitors `PrefixNameAdder`/`OnlySelected`. |
| `errors.py` | Exception hierarchy: `ValidationError` base, `ParameterError`, `CapitalizationError`, `DuplicateName`, `MissingName`, `SelfReference`, `BroadcastingError`. |
| `utils.py` | `isidentifier(ident)` (valid-Python-name check) and `get_version_tuple()` (reads installed package version via `importlib.metadata`). |

## Entry points (from `__init__.py` `__all__`)

```
__version__
FormulaSubstitutor      # mangling.py
Interpreter              # interpreter.py
mangle_formula           # mangling.py
MissingName               # errors.py
ParameterSet             # parameter_set.py
PintInterpreter          # interpreter.py
PintParameterSet         # parameter_set.py
PintWrapper               # pint.py
prefix_parameter_dict    # mangling.py
substitute_in_formulas   # mangling.py
```

## Where to look

- **"How does a formula string get turned into a value?"**
  `interpreter.py` — `Interpreter.eval()` (subclasses `asteval.Interpreter.eval`,
  adds `known_symbols` injection/cleanup and wraps `NameError`/`SyntaxError`
  into `MissingName`). `Interpreter.get_symbols()` / `get_unknown_symbols()`
  parse a formula string and return the variable names it references,
  using `asteval.NameFinder`.

- **"How are dependent parameters (formula A references parameter B)
  evaluated in the right order?"**
  `parameter_set.py` — `ParameterSet.get_references()` builds a
  name→dependency-set map via `interpreter.get_unknown_symbols`;
  `ParameterSet.get_order()` does the topological sort (raises
  `ParameterError` on unresolved/circular refs, or `CapitalizationError` if
  the mismatch looks like a case-sensitivity typo); `ParameterSet.evaluate()`
  walks `self.order` and calls the interpreter on each formula.

- **"How do units (e.g. `kg`, `MJ`) get parsed and attached to
  quantities?"**
  `pint.py` — `PintWrapperSingleton` (singleton instance `PintWrapper`),
  methods `to_unit`/`to_units` (string → `pint.Unit`), `to_quantity`
  (amount + unit → `pint.Quantity`), `get_dimensionality`. Consumed by
  `interpreter.PintInterpreter` and `parameter_set.PintParameterSet`.

- **"What's the difference between `Interpreter`/`ParameterSet` and their
  `Pint*` counterparts?"**
  The plain versions treat everything as unit-less numbers/arrays. The
  `Pint*` versions (`PintInterpreter` in `interpreter.py`,
  `PintParameterSet` in `parameter_set.py`) additionally recognize bare unit
  tokens in formulas (e.g. `3 * kg`) via `PintWrapper`, track a parameter's
  `unit` field alongside `amount`, and convert between unit registries when
  mixing quantities (`PintInterpreter.add_symbols`).

- **"How does Monte Carlo / stochastic parameter evaluation work?"**
  `parameter_set.py` — `ParameterSet.evaluate_monte_carlo(iterations=1000)`.
  Uses `stats_arrays.uncertainty_choices` to sample each parameter's
  uncertainty distribution, requires every formula to return a
  1-D array of shape `(iterations,)` or raises `BroadcastingError`.

- **"How does one namespace/prefix a set of parameter formulas (e.g. so an
  activity's local parameters don't collide with project-level ones)?"**
  `mangling.py` — `prefix_parameter_dict(dct, prefix)` renames dict keys and
  rewrites references inside each `formula` string to match, via
  `mangle_formula` (prefixes every free variable name not in a given
  `context`/builtins) and `substitute_in_formulas`/`FormulaSubstitutor`
  (renames according to an explicit `{old: new}` substitution map). This is
  how `bw2data.parameters` combines project/database/activity-scoped
  parameter sets into one evaluation.

- **"What exceptions can this package raise, and what do they mean?"**
  `errors.py` — all inherit `ValidationError`. `MissingName`: formula
  references an undefined variable. `SelfReference`: a formula references
  its own parameter name. `DuplicateName`: parameter name collides with a
  built-in symbol. `CapitalizationError`: likely case-mismatch in a
  reference. `BroadcastingError`: Monte Carlo formula result has the wrong
  array shape. `ParameterError`: generic ordering/definition failure.
