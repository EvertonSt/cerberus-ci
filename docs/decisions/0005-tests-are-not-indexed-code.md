# 0005 — Tests are typechecked in their own project

**Status:** accepted · **Date:** 2026-10-03

## Context

`noUncheckedIndexedAccess` is on. Turning it on across the repository produced
78 errors, and every single one was in a test:

```ts
expect(result.regressions[0].metricName).toBe("page_load_ms");
```

## Decision

Two TypeScript projects:

- `tsconfig.json` — the **product**. `noUncheckedIndexedAccess: true`.
- `tsconfig.tests.json` — the **tests**. Same file, one flag off.

`pnpm typecheck` runs both. The ESLint test tier points at `tsconfig.tests.json`
explicitly.

## Why

The flag earns its keep in product code, where `results[results.length - 1]`
really can be `undefined` at runtime — and where this repository found and fixed
30 such sites, including every `result[0]` read in the storage layer.

In a test it fires almost exclusively on an assertion whose entire purpose is
to prove the element exists. The line after it says `expect(...)`, which fails
loudly if the element is missing. Turning those into `rows[0]!.name` would add
seventy-odd `!` characters that assert nothing the next line does not already
assert, and would train a reader to see `!` as noise.

**This is not "turning the rule off".** The rule is off in exactly one place,
the reason is written in the file that turns it off, and the product code keeps
the strictness. A suppression with a stated reason is a decision; a silent
loosening is not.

**Revisit if:** the test suite grows assertions over pre-persistence data, at
which point the product's narrowing matters there too.
