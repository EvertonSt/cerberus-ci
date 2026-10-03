# 0001 — One repository holds the engine, the CLI and the site

**Status:** accepted · **Date:** 2026-10-03

## Context

The project arrived as two repositories: a TypeScript CLI that analysed CI test
results, and a Next.js site that marketed it. They shared a name and a colour
scheme. They shared no code, no tests, no CI, and no release.

## Decision

One repository. `src/lib` and `src/cli` are the engine; `src/app` and
`src/components` are the site. They meet at exactly one boundary, and that
boundary is data, not imports.

```
src/lib      engine   — never imports React
src/cli      CLI      — imports the engine
src/app      site     — never imports the CLI
src/components site   — never imports the engine directly
```

## Consequences

**Good.** One `pnpm install`, one gate, one CI pipeline, one place a reviewer
looks. A change to the gate logic and the page that explains it lands in the
same commit, which is the only way the two stay honest.

**Cost, stated plainly.** The site cannot be prerendered without the engine's
dependencies being resolvable, and `pnpm install` for the site pulls the engine's
dependencies too. That is ~3 MB of extra `node_modules` on a deploy that does
not execute the engine. Accepted: it buys a single reviewable surface, and the
alternative — two repositories with a version boundary between them — is the
arrangement we just spent this decision removing.

**Rejected:** a pnpm workspace with `apps/web` and `packages/engine`. Real
argument for it: it enforces the boundary structurally and can publish the engine
to npm independently. Real argument against: two deploy pipelines, two sets of
version pins, and a reviewer who has to understand the workspace layout before
they can read a single file. At this size the indirection costs more than the
independence is worth.
