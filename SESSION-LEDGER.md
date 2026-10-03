# SESSION LEDGER

Append-only. One entry per session, newest at the bottom. Never edited — a
corrected entry is a new entry that says what changed and why.

Each entry carries four things:

- **DID** — what changed
- **PROOF** — the command and its output, not a description of it
- **DID NOT PROVE** — the gap the checks leave, named rather than implied
- **NEXT** — what is left

The third heading is the one that compounds. A ledger without it becomes a list
of things that were verified, and a reader cannot tell the difference between
"verified" and "verified within the limits of what we checked".

---

## 2026-10-03 — The rebuild

### DID

Rebuilt Cerberus CI as one repository holding the analysis engine, the CLI and
the site, from two source repositories that shared a name and nothing else.

- **Structure.** `src/lib` (engine), `src/cli` (CLI), `src/app` + `src/components`
  (site). The engine never imports React; the site never imports the CLI.
- **Import graph.** 161 relative specifiers rewritten — each resolved to the file
  it actually names, `.js` extensions stripped for the bundler.
- **Typecheck: 149 errors → 0.** Triage, not suppression:
  - every `result[0]` read in the storage layer bound to a `const` and guarded
  - `annotations` made optional on `RunOptions` (it is a CLI flag with a default)
  - `checkPerfRegressions` takes `Pick<PerfMetricRow, ...>` instead of the full
    row, so it can be called with metrics that are not persisted yet
  - **the entire CLI option surface typed**: commander's `.action()` parameter was
    contextually `any`, so all twelve command handlers were unchecked. Option
    shapes are now generated from the flags each command declares.
- **Lint: 209 findings → 0.** Three `JSON.parse` boundaries (Playwright report,
  trace file, model response) now parse as `unknown` and narrow through type
  guards, which removed 167 findings at the source instead of switching rules off.
- **Real defects found and fixed**, not suppressed:
  - no page except the landing page had an `<h1>`; `SectionHeader` hard-coded
    `h2`. Found by the end-to-end journey, not by reading.
  - the mobile menu closed in an effect, causing a cascading render
  - `.gitignore` did not ignore `.next` — `git add -A` staged 388 files including
    the whole build output and a manifest of every route
- **Gates.** `verify:secrets`, `verify:links`, `verify:attribution` — each
  written to be provable in both directions, and each watched failing.
- **CI.** Five jobs (quality, unit, e2e, readiness, security), every action
  pinned to a commit SHA, Dependabot with majors isolated rather than muted.
- **Docs.** Recruiter-facing README with real screenshots, six decision records,
  and this ledger.
- **Two defects found after the suite was already green**, both by running the
  gate again rather than by reading the code:
  - **No `.gitattributes`, so `format:check` failed on every Windows clone.**
    The blobs were LF, `core.autocrlf=true` rewrote the working tree to CRLF,
    and Prettier defaults to `endOfLine: "lf"`. 96 files. It passed on CI and
    failed locally — the combination that teaches people the gate is noise.
  - **The end-to-end journey passed while the page rendered unstyled.** It
    drives the dev server over `127.0.0.1` while Next binds `localhost`, so
    Next refused to serve its own chunks. None of the assertions depend on a
    stylesheet arriving; the only symptom was a line in the server log.

### PROOF

```
pnpm typecheck     exit 0    0 errors across both TypeScript projects
pnpm lint          exit 0    0 errors, 0 warnings
pnpm format:check  exit 0    All matched files use Prettier code style
pnpm test:unit     exit 0    237 passed (26 files)
pnpm test:unit:coverage
                   exit 0    87.16% stmts · 76.59% branch · 92.61% funcs · 88.38% lines
                               (floor 80/75/80/80, over src/lib + src/cli)
pnpm build         exit 0    6 routes prerendered as static
pnpm test:e2e      exit 0    5 passed
pnpm verify:secrets    exit 0   94 tracked files scanned
pnpm verify:links      exit 0   3 markdown files, every internal link resolves
pnpm verify:attribution exit 0  1 distinct author, no trailer on any ref
```

Gates watched failing, not just passing:

```
attribution  exit 1  src/app/features/page.tsx:132 — AI-generated banner
attribution  exit 1  src/components/ArchitectureDiagram.tsx:95 — robot emoji
secrets      exit 1  .probe-secret.ts:1 — anthropic key literal (redacted)
links        exit 1  README.md -> ./does-not-exist.md — file does not exist
links        exit 1  README.md -> #no-such-heading — no such heading
```

Both sides of the line-ending fix, because a fix that was never seen failing is
a fix you cannot claim works:

```
fresh clone, autocrlf=true, WITH .gitattributes
  exit 0    0 files flagged
fresh clone, autocrlf=true, WITHOUT .gitattributes
  exit 1    96 files flagged, scripts/gate.sh checked out with CRLF
```

The end-to-end fix, measured on the server log rather than on the assertions:

```
before   "Blocked cross-origin request"   1 occurrence per run
after    "Blocked cross-origin request"   0 occurrences per run
5 passed before, 5 passed after — the suite could not tell the difference
```

The authorship hook, before it was trusted:

```
commit with a tool trailer   exit 1  "BLOCKED by owner law - no AI attribution"
commit with a clean message  exit 0
```

### DID NOT PROVE

Named, because the difference between "verified" and "verified within the limits
of what we checked" is the whole value of this section.

- **No test has called a live model API.** The Anthropic and OpenAI-compatible
  providers are implemented and exercised against mocked HTTP and the heuristic
  provider only. A real endpoint may reject our request shape, and nothing here
  would have found out.
- **The site has no component-level unit tests.** It is covered by one Playwright
  journey that asserts structure, navigation, a 404 and the security headers. A
  visual regression — a layout break at a viewport nobody tested — would not be
  caught by any check in this repository.
- **The 87% coverage figure is about the engine only.** It says nothing about
  `src/app` or `src/components`, which have no unit tests at all.
- **Performance regression detection has only ever seen fixtures.** No trace from
  a real production run of this project has been through it, so the thresholds
  are reasoned, not measured.
- **CI has never run.** The workflow is written and every command in it has been
  run locally, but no push has happened, so no run URL exists. The first push
  may surface an action version or a cache key that does not behave locally.
- **The build was verified on Windows only.** `pnpm build` and `pnpm test:e2e`
  pass here; the CI jobs run on `ubuntu-latest` and have never executed.
- **The end-to-end suite asserts structure, not rendering.** It proved one `<h1>`
  per page, 200 on every route, working navigation, a 404 and the security
  headers. It did not prove a stylesheet loaded — and demonstrably did not,
  while the app was rendering unstyled behind it. A visual regression at an
  untested viewport is still invisible to it.
- **The screenshots were taken from a dev server**, not from a production build.
  They should match, but nothing has compared them.
- **The clone URL in the README does not resolve yet.** `git clone
https://github.com/EvertonSt/cerberus-ci.git` is the intended permanent
  home, but no remote is configured and no repository exists under that name,
  so the link is a promise rather than a fact until the first push. Everything
  below it in this file was run against the working tree.
- **`pnpm audit` has not been run against this lockfile yet** — the security job
  will do it on the first CI run, and the thresholds in the ADR are the intent,
  not a measured result.

### NEXT

1. First push, and read the run. Nothing here is proven in CI until it is green
   there, on Ubuntu.
2. Run the pipeline against a real test-result file from a real project and put
   the number in the README — or remove the claim.
3. Decide whether the classifier earns its place against the deterministic rules
   alone. If it does not, the honest move is to delete it.
4. Component tests for the site, or an explicit decision that the e2e journey is
   the site's whole test story.
5. Assert something visual in the e2e run — a computed style, a loaded font, or
   a screenshot diff — so the next "green but broken" has somewhere to land.
