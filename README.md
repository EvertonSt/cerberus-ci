# Cerberus CI

**Turns CI test results into a ranked, explained decision about what to fix
first** — not another dashboard that charts what broke.

Built as a TypeScript analysis engine (ingest → classify → gate → report) with a
GitHub Action, a CLI, and the documentation site in this repository.

![The Cerberus CI landing page](docs/screenshots/home.png)

---

## The problem

When a suite has a few hundred tests, a red pipeline stops being information.
Nobody reads four hundred failures; they read the first ten and guess. The cost
is not that the failures are hidden — it is that **the same failure looks new
every time**, so it gets re-investigated, re-triaged and re-fixed from scratch
by someone who has no memory of the last three times.

Cerberus separates two questions that CI dashboards usually blur together:

| Question                                | Answered by                                                               |
| --------------------------------------- | ------------------------------------------------------------------------- |
| _What broke?_                           | Parsing the result file. Deterministic, fast, free.                       |
| _Is this new?_                          | Comparing against the baseline branch and the run history. Deterministic. |
| _Why did it break, and does it matter?_ | Classification, recorded with its reasoning.                              |

The third question is the only one that needs a model, and it is the only one
where a wrong answer is dangerous — so **its output is recorded, not trusted**:
every verdict is stored with the reasoning that produced it, and the gate
decides on the recorded value. You can read why a test was ranked where it was,
and override it. Nothing is silently suggested.

### The non-obvious decision

**The gate is deterministic. The classifier is not.**

Most tools in this space hand a model's output straight to `exit 1`. If the
model is unavailable, rate-limited or wrong, the pipeline is undeterministic,
and a CI gate that changes its mind is worse than no gate at all.

Here, a run degrades instead:

- provider available → the verdict is recorded with its reasoning
- provider unavailable, or the response malformed → the failure is recorded as
  `regression` with an explicit reason, and the run continues
- the flaky/regression thresholds and the performance budget are **pure
  arithmetic** on the recorded verdicts

`src/lib/ai/claude-provider.ts` validates model output from `unknown` through a
type guard rather than trusting a parse; a malformed response takes the same
safe default as an unreachable one. That is the whole safety story, and it is
about forty lines.

---

## Try it in a minute

```bash
git clone https://github.com/EvertonSt/cerberus-ci.git
cd cerberus-ci
pnpm install
cp .env.example .env          # names only; add a key if you want real classification
pnpm build && pnpm gate       # every check this project makes about itself
```

To run the site: `pnpm dev` → <http://localhost:4310>

To run the engine against a real result file:

```bash
pnpm cerberus init                                   # writes cerberus.config.yml
pnpm cerberus ingest -i results.json -f playwright-json \
                    --run-id 42 --commit "$GIT_SHA" --branch main
pnpm cerberus classify --run-id 42
pnpm cerberus gate    --run-id 42                    # exit 0 = pass, 1 = fail
```

Or add it to a workflow:

```yaml
- uses: EvertonSt/cerberus-ci@v2
  with:
    test-results-path: test-results.json
    ai-provider: mock # or anthropic / openai-compatible
```

---

## What is actually tested

| Layer              | What it covers                                                                          | Command                   |
| ------------------ | --------------------------------------------------------------------------------------- | ------------------------- |
| Unit + integration | The engine end to end: both parsers, classification, the gate, storage, reporting       | `pnpm test:unit`          |
| Coverage floor     | 80% statements / 75% branches / 80% functions, over the engine                          | `pnpm test:unit:coverage` |
| End to end         | The real site in a real browser: navigation, headings, 404, security headers            | `pnpm test:e2e`           |
| Gates              | Secrets, documentation links, authorship — across the working tree **and** full history | `pnpm verify`             |
| Build              | Production compile                                                                      | `pnpm build`              |

`pnpm gate` runs all of it and reports **each step's own exit code**. Nothing is
chained through a pipe, because `tsc | head` exits with `head`'s status and
reports a failing typecheck as a passing gate.

Current measured coverage of the engine: **87% statements, 77% branches, 93%
functions, 88% lines** across 237 tests.

### What these checks do not prove

Stated plainly, because a test suite that claims too much is worse than a
smaller one that claims exactly what it does:

- **The site has no component-level unit tests.** Its behaviour is covered by
  the Playwright journey, which asserts structure and navigation rather than
  pixels. That gap is not theoretical: the journey passed 5/5 while the dev
  server was refusing to serve the page's own stylesheet. Nothing in it
  depends on a stylesheet arriving.
- **The engine's coverage number covers `src/lib` and `src/cli`.** It is not a
  statement about the React components, which have no unit tests at all.
- **The classifier has been exercised against mocked HTTP and the heuristic
  provider only.** No test in this repository has called a live model API.
- **Performance regression detection is tested against fixtures**, never
  against a trace from a real production run of this project.
- **The GitHub Action has never run on GitHub.** Its entry point has been
  driven locally against this repository's own CLI — which is how the `__dirname`
  crash, the config that would not validate, and the `flaky-count: 0` output
  were found — but `action.yml` installs `cerberus-ci@0.1.0` from npm, and that
  package predates this rebuild. The Action is not yet exercising this code.

---

## Honest status

|                       |                                                                                                                                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Works**             | Parsing (JUnit XML, Playwright JSON), deterministic classification, the flaky/regression gate, performance budgets, SQLite storage, PR comment reports, GitHub Actions annotations, the CLI, the site, the CI pipeline |
| **Stubbed / limited** | The Anthropic and OpenAI-compatible providers are implemented and mocked-tested, but have never been run against a live endpoint by this repository's own CI                                                           |
| **Known, unfixable**  | One dev-only advisory (`braces` <= 3.0.3, via `eslint-config-next`). Its patched version **does not exist** — 3.0.3 is still the latest publish and `micromatch` requires `^3.0.3`. Production audit is clean          |
| **Not built**         | No hosted dashboard. No billing. No multi-repo aggregation. No write-back to the source tree                                                                                                                           |
| **Not deployed**      | Deploy-ready, not deployed — `vercel.json` is configured and the production build is verified locally                                                                                                                  |

---

## Architecture

```
result file ──▶ ingest ──▶ classify ──▶ gate ──▶ report
                (parse)    (verdict +    (exit     (PR comment,
                            reasoning)    code)     annotations)
                             │
                             ▼
                          storage (SQLite, sql.js — no native build step)
```

- **The engine never imports React**, and the site never imports the CLI. They
  share `src/lib` and nothing else.
- Storage is **sql.js**, a WebAssembly SQLite, so the engine installs with no
  native compilation — which is what lets the same code run in Node, in a GitHub
  Action, and in a serverless function without three storage implementations.
- Parsing is the only place that trusts the outside world, and every parser
  validates its input before it becomes a typed value.

Detailed reasoning lives in [`docs/decisions/`](docs/decisions/), which is
where the choices this repository would otherwise have to take on faith are
written down.

---

## Deploying

Vercel-compatible, verified locally, **not deployed**.

- `vercel.json` declares the framework and build command; security headers are
  declared in `next.config.ts` instead, so `pnpm start` reproduces production
  exactly and the end-to-end suite can assert them.
- Node-only packages (`sql.js`, `js-yaml`, `xml2js`, the Anthropic SDK) are
  listed in `serverExternalPackages`, because bundling any of them produces a
  build that compiles and then fails at the first request.
- **No static export.** The application is a server app; `output: "export"`
  would be one line here and a rewrite of the delivery model later.

---

## Decisions worth reading

| Decision                                                                                                              | Why                                                                           |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [`0001`](docs/decisions/0001-one-repository-for-engine-and-site.md) One repository, not a monorepo                    | One install, one gate, one deploy target                                      |
| [`0002`](docs/decisions/0002-no-static-export.md) No static export                                                    | The app is a server app; this is cheaper to decide now than to discover later |
| [`0003`](docs/decisions/0003-parse-untrusted-input-at-the-boundary.md) Parse at the boundary, return `unknown` inward | A parser is the trust boundary; everything after it can be typed              |
| [`0004`](docs/decisions/0004-calibrate-the-audit-by-surface.md) Calibrate the audit by surface, not by threshold      | A threshold moved to make a run green measures nothing                        |
| [`0005`](docs/decisions/0005-tests-are-not-indexed-code.md) Tests are typechecked separately                          | The index-access flag earns its keep in product code, not in assertions       |
| [`0006`](docs/decisions/0006-no-attribution-without-exception.md) No AI tool is credited                              | Sole authorship, enforced mechanically in three places                        |

---

## Session log

[`SESSION-LEDGER.md`](SESSION-LEDGER.md) is append-only: what changed, the proof
it produced, **what the checks did not prove**, and what is next.

## Licence

MIT — see [LICENSE](LICENSE).
